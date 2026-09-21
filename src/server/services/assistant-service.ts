import { prisma } from '@/lib/db';
import { buildReportingGraph } from '@/domain/org/graph';
import { loadOrganisationGraph, loadOrgGroups } from '@/repositories/org-repository';
import { completeChat, isAiConfigured, type ChatMessage } from '@/server/llm/client';
import { ValidationAppError } from '@/lib/errors';
import { isDemoMode } from '@/demo/mode';
import { demoOrganisation } from '@/demo/northstar';
import type { Actor } from '@/domain/permissions/policy';
import { compactRoster, loadAssistantIndex } from '@/server/services/assistant-index';
import { executeAssistantTool, toolsForActor, type AssistantAction } from '@/server/services/assistant-tools';

export interface AssistantSettings {
  privacyReviewComplete: boolean;
  modelConnected: boolean;
}

export function readAssistantSettings(_settings?: unknown): AssistantSettings {
  return {
    privacyReviewComplete: true,
    modelConnected: isAiConfigured(),
  };
}

export async function lookupEmployeeBrief(organisationId: string, query: string) {
  const [graphInput, groups, organisation] = await Promise.all([
    loadOrganisationGraph(organisationId),
    loadOrgGroups(organisationId),
    isDemoMode() ? Promise.resolve(demoOrganisation()) : prisma.organisation.findFirst({ where: { id: organisationId } }),
  ]);
  const graph = buildReportingGraph(graphInput);
  const settings = readAssistantSettings(organisation?.settings);
  const needle = query.trim().toLowerCase();
  const groupName = new Map(groups.map((group) => [group.id, group.name]));

  const matches: Array<{
    personId: string;
    positionId: string;
    displayName: string;
    title: string;
    departmentId: string | null;
    groups: string[];
    facts: string;
  }> = [];

  for (const node of graph.nodes.values()) {
    for (const occupant of node.occupants) {
      const haystack = [occupant.person.displayName, occupant.person.email, node.position.title]
        .join(' ')
        .toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      const manager = node.primaryManagerId ? graph.nodes.get(node.primaryManagerId) : null;
      const groupNames = (occupant.person.groupIds ?? [])
        .map((id) => groupName.get(id))
        .filter((name): name is string => Boolean(name));
      const facts = [
        `${occupant.person.displayName} holds ${node.position.title}.`,
        manager
          ? `Reports to ${manager.occupants[0]?.person.displayName ?? 'a vacant seat'} (${manager.position.title}).`
          : 'This is a root seat on the live chart.',
        groupNames.length ? `Company groups: ${groupNames.join(', ')}.` : null,
        `${node.directReportIds.length} direct reports.`,
      ]
        .filter(Boolean)
        .join(' ');

      matches.push({
        personId: occupant.person.id,
        positionId: node.position.id,
        displayName: occupant.person.displayName,
        title: node.position.title,
        departmentId: node.position.departmentId,
        groups: groupNames,
        facts,
      });
    }
  }

  matches.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    settings,
    privacyLocked: false,
    modelConnected: settings.modelConnected,
    message: settings.modelConnected
      ? 'The AI agent is connected. Lookup uses stored seats; Ask sends names, titles, managers, groups, and skills — never emails or HR fields.'
      : 'No AI key is configured. Lookup still uses stored organisation facts.',
    matches: matches.slice(0, 20),
  };
}

export async function askOrganisation(organisationId: string, question: string, actor: Actor) {
  const organisation = isDemoMode()
    ? demoOrganisation()
    : await prisma.organisation.findFirst({ where: { id: organisationId } });
  const settings = readAssistantSettings(organisation?.settings);
  if (!settings.modelConnected) {
    throw new ValidationAppError('Add an AI key to enable Ask.');
  }
  const trimmed = question.trim();
  if (trimmed.length < 3) {
    throw new ValidationAppError('Ask a question about the organisation, or tell the assistant what to change.');
  }

  const tools = toolsForActor(actor);
  let index = await loadAssistantIndex(organisationId);
  const roster = compactRoster(index.seats);
  const canEdit = tools.some((tool) => tool.function.name === 'move_person');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        'You are Omni org chart, an operator for this organisation chart.',
        'Use tools to look up live data and to apply edits. Do not invent people, salaries, or unstated reporting lines.',
        'Never mention emails, phone numbers, or compensation.',
        canEdit
          ? 'You may add, rename, retitle, move, or remove people when the user asks. After a change, say what you did.'
          : 'This user can only read. If they ask for an edit, explain they need an editor role.',
        'If several people match a name, call find_people and ask which one.',
        'If a tool errors, explain the error instead of guessing.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Live roster (${index.seats.length} seats):\n${roster || '(empty organisation)'}\n\nRequest:\n${trimmed}`,
    },
  ];

  const actions: AssistantAction[] = [];
  let model = 'AI agent';
  for (let round = 0; round < 6; round += 1) {
    const turn = await completeChat({ messages, tools, temperature: 0.1 });
    model = turn.model;
    if (turn.toolCalls.length === 0) {
      return {
        answer: turn.answer,
        model,
        actions,
        changed: actions.some((action) => action.ok && action.mutating),
      };
    }
    messages.push(turn.message);
    for (const call of turn.toolCalls) {
      const result = await executeAssistantTool({
        organisationId,
        actor,
        name: call.name,
        arguments: call.arguments,
        index,
      });
      index = result.index;
      actions.push(result.action);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result.payload),
      });
    }
  }

  const closing = await completeChat({
    messages: [
      ...messages,
      { role: 'user', content: 'Summarise what you found or changed. Do not call more tools.' },
    ],
    temperature: 0.1,
  });
  return {
    answer: closing.answer,
    model: closing.model,
    actions,
    changed: actions.some((action) => action.ok && action.mutating),
  };
}
