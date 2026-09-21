import { config } from '@/lib/config';

export function isAiConfigured() {
  return Boolean(config().DEEPSEEK_API_KEY);
}

export type ChatTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

export async function completeOrgChat(input: {
  question: string;
  facts: string;
}): Promise<{ answer: string; model: string }> {
  return completeChat({
    system:
      'You are Omni org chart, an organisational chart assistant. Answer only from the supplied organisation facts. Do not invent people, salaries, or unstated reporting lines. If the facts are insufficient, say so.',
    user: `Organisation facts:\n${input.facts}\n\nQuestion:\n${input.question}`,
    temperature: 0.2,
  });
}

export async function completeChat(input: {
  system?: string;
  user?: string;
  messages?: ChatMessage[];
  tools?: ChatTool[];
  temperature?: number;
  json?: boolean;
}): Promise<{ answer: string; model: string; toolCalls: ChatToolCall[]; message: ChatMessage }> {
  const cfg = config();
  const key = cfg.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error('No AI key is configured.');
  }

  const messages: ChatMessage[] = input.messages
    ? input.messages
    : [
        ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
        ...(input.user ? [{ role: 'user' as const, content: input.user }] : []),
      ];

  const response = await fetch(`${cfg.DEEPSEEK_API_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: input.temperature ?? 0.2,
      ...(input.json ? { response_format: { type: 'json_object' } } : {}),
      ...(input.tools?.length ? { tools: input.tools, tool_choice: 'auto' } : {}),
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed (${response.status}).`);
  }

  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        role?: string;
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    model?: string;
  };
  const raw = body.choices?.[0]?.message;
  const toolCalls: ChatToolCall[] = (raw?.tool_calls ?? []).flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    return [
      {
        id: call.id || `tool-${index}`,
        name,
        arguments: call.function?.arguments ?? '{}',
      },
    ];
  });
  const answer = raw?.content?.trim() ?? '';
  if (!answer && toolCalls.length === 0) {
    throw new Error('The AI agent returned an empty answer.');
  }

  const message: ChatMessage = {
    role: 'assistant',
    content: raw?.content ?? '',
    tool_calls: toolCalls.length
      ? toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments },
        }))
      : undefined,
  };

  return {
    answer,
    model: 'AI agent',
    toolCalls,
    message,
  };
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
