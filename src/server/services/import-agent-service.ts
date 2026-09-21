import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import type { ImportField } from '@/domain/import/columns';
import { fileStructureFindings, type ImportFinding } from '@/domain/import/structure';
import { importPersonLabel } from '@/domain/import/validate';
import { completeChat, parseJsonObject } from '@/server/llm/client';
import { readAssistantSettings } from '@/server/services/assistant-service';
import { isDemoMode } from '@/demo/mode';
import { getDemoImportJob } from '@/demo/import-store';
import { demoOrganisation, demoPeople } from '@/demo/northstar';

export interface ImportTreeNode {
  name: string;
  title: string;
  reportsTo: string | null;
  department?: string;
  note?: string;
}

export interface ImportAgentReview {
  modelConnected: boolean;
  privacyLocked: boolean;
  model?: string;
  summary: string;
  findings: ImportFinding[];
  tree: ImportTreeNode[];
  canApply: boolean;
  applyBlockers: string[];
}

function asValues(raw: unknown): Record<ImportField, string> {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  return {
    email: record.email ?? '',
    displayName: record.displayName ?? '',
    firstName: record.firstName ?? '',
    lastName: record.lastName ?? '',
    title: record.title ?? '',
    department: record.department ?? '',
    location: record.location ?? '',
    managerEmail: record.managerEmail ?? '',
    managerName: record.managerName ?? '',
    employeeId: record.employeeId ?? '',
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function collectDeterministicReview(
  organisationId: string,
  jobId: string,
  options?: {
    rows?: Array<{ rowNumber: number; raw: unknown; status: string; errors: unknown }>;
    replaceExisting?: boolean;
  },
): Promise<{ findings: ImportFinding[]; tree: ImportTreeNode[]; readyCount: number }> {
  let sourceRows = options?.rows;
  if (!sourceRows) {
    if (isDemoMode()) {
      const demoJob = getDemoImportJob(jobId, organisationId);
      if (!demoJob) throw new NotFoundError('Import job not found.');
      sourceRows = demoJob.rows;
    } else {
      const job = await prisma.importJob.findFirst({
        where: { id: jobId, organisationId },
        include: { rows: { orderBy: { rowNumber: 'asc' } } },
      });
      if (!job) throw new NotFoundError('Import job not found.');
      sourceRows = job.rows;
    }
  }

  const rows = sourceRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: asValues(row.raw),
    status: row.status,
    errors: asStringArray(row.errors),
  }));
  const findings = fileStructureFindings(rows);

  const existing = options?.replaceExisting
    ? []
    : isDemoMode()
      ? demoPeople.map((person) => ({
          displayName: person.displayName,
          email: person.email,
        }))
      : await prisma.person.findMany({
          where: { organisationId, deletedAt: null },
          select: { displayName: true, email: true },
        });
  const byEmail = new Map(
    existing.filter((person) => person.email).map((person) => [person.email!.toLowerCase(), person.displayName]),
  );
  const byName = new Map(existing.map((person) => [person.displayName.toLowerCase(), person.displayName]));

  for (const row of rows) {
    if (row.status === 'DUPLICATE' || row.status === 'INVALID') continue;
    const email = row.values.email.toLowerCase();
    const label = importPersonLabel(row.values);
    if (email && byEmail.has(email)) {
      findings.push({
        severity: 'warning',
        kind: 'duplicate',
        rowNumber: row.rowNumber,
        message: `Email already belongs to ${byEmail.get(email)} in the live organisation. Apply will update that person instead of creating a duplicate.`,
      });
    } else if (label && byName.has(label.toLowerCase())) {
      findings.push({
        severity: 'warning',
        kind: 'duplicate',
        rowNumber: row.rowNumber,
        message: `“${label}” already exists in the live organisation. Confirm this is an update, not a second seat.`,
      });
    }
    const manager = row.values.managerName.trim();
    if (
      manager &&
      !rows.some((item) => importPersonLabel(item.values).toLowerCase() === manager.toLowerCase()) &&
      !byName.has(manager.toLowerCase())
    ) {
      findings.push({
        severity: 'warning',
        kind: 'manager',
        rowNumber: row.rowNumber,
        message: `Manager “${manager}” is not in this file and not in the live organisation. The seat will import without a reporting line until that manager exists.`,
      });
    }
  }

  const tree: ImportTreeNode[] = rows
    .filter((row) => row.status === 'NEW')
    .map((row) => ({
      name: importPersonLabel(row.values) || `Row ${row.rowNumber}`,
      title: row.values.title,
      reportsTo: row.values.managerName.trim() || null,
      department: row.values.department || undefined,
    }));

  return {
    findings,
    tree,
    readyCount: rows.filter((row) => row.status === 'NEW').length,
  };
}

export async function reviewImportWithAgent(
  organisationId: string,
  jobId: string,
  options?: {
    rows?: Array<{ rowNumber: number; raw: unknown; status: string; errors: unknown }>;
    replaceExisting?: boolean;
  },
): Promise<ImportAgentReview> {
  const organisation = isDemoMode()
    ? demoOrganisation()
    : await prisma.organisation.findFirst({ where: { id: organisationId } });
  const settings = readAssistantSettings(organisation?.settings);
  const local = await collectDeterministicReview(organisationId, jobId, options);
  const applyBlockers = local.findings
    .filter((finding) => finding.severity === 'error')
    .map((finding) => (finding.rowNumber ? `Row ${finding.rowNumber}: ${finding.message}` : finding.message));
  const canApply = local.readyCount > 0;

  const base: ImportAgentReview = {
    modelConnected: settings.modelConnected,
    privacyLocked: false,
    summary:
      local.readyCount === 0
        ? 'No valid rows are ready to apply. Fix errors and duplicates in the file first.'
        : `${local.readyCount} rows are ready to become seats. Review warnings before applying to the live organisation.`,
    findings: local.findings,
    tree: local.tree.slice(0, 40),
    canApply,
    applyBlockers,
  };

  if (!settings.modelConnected) {
    return {
      ...base,
      summary: `${base.summary} Add an AI key to let the agent explain structure and extra duplicates.`,
    };
  }

  const demoJob = isDemoMode() ? getDemoImportJob(jobId, organisationId) : null;
  const prismaJob =
    demoJob || options?.rows
      ? null
      : await prisma.importJob.findFirst({
          where: { id: jobId, organisationId },
          include: { rows: { orderBy: { rowNumber: 'asc' }, take: 180 } },
        });
  const sourceRows = options?.rows ?? demoJob?.rows ?? prismaJob?.rows;
  if (!sourceRows) throw new NotFoundError('Import job not found.');

  const existingLines = options?.replaceExisting
    ? []
    : isDemoMode()
      ? demoPeople.slice(0, 40).map((person) => `${person.displayName}`)
      : (
          await prisma.person.findMany({
            where: { organisationId, deletedAt: null },
            select: { displayName: true },
            take: 80,
            orderBy: { displayName: 'asc' },
          })
        ).map((person) => person.displayName);

  const importLines = sourceRows.slice(0, 180).map((row) => {
    const values = asValues(row.raw);
    const label = importPersonLabel(values) || `Row ${row.rowNumber}`;
    return `Row ${row.rowNumber} [${row.status}]: ${label}, title ${values.title || 'missing'}, department ${values.department || 'none'}, reports to ${values.managerName || 'none'}.`;
  });

  try {
    const result = await completeChat({
      system:
        'You are Omni org chart import agent. Review a CSV-derived org chart. Never invent people. Never mention emails, salaries, or HR fields. Reply with JSON only: {"summary": string, "findings": [{"severity":"error"|"warning"|"info","kind":"duplicate"|"error"|"manager"|"structure"|"data","rowNumber": number|null,"message": string}], "tree": [{"name": string, "title": string, "reportsTo": string|null, "department": string, "note": string}]}. Flag duplicate names, missing managers, broken trees, and likely matches to existing staff. Keep findings under 20 and tree under 25.',
      user: `Existing organisation people:\n${existingLines.join('\n') || '(empty organisation)'}\n\nImported rows:\n${importLines.join('\n')}\n\nDeterministic findings already raised:\n${local.findings.map((finding) => finding.message).join('\n') || 'none'}`,
      temperature: 0.1,
      json: true,
    });
    const parsed = parseJsonObject(result.answer);
    if (!parsed) {
      return { ...base, model: result.model, summary: `${base.summary} ${result.answer.slice(0, 400)}` };
    }
    const extraFindings = Array.isArray(parsed.findings)
      ? parsed.findings.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          const message = typeof row.message === 'string' ? row.message.trim() : '';
          if (!message) return [];
          const finding: ImportFinding = {
            severity: row.severity === 'error' || row.severity === 'info' ? row.severity : 'warning',
            kind:
              row.kind === 'duplicate' ||
              row.kind === 'error' ||
              row.kind === 'manager' ||
              row.kind === 'structure' ||
              row.kind === 'data'
                ? row.kind
                : 'data',
            message,
          };
          if (typeof row.rowNumber === 'number') finding.rowNumber = row.rowNumber;
          return [finding];
        })
      : [];
    const tree = Array.isArray(parsed.tree)
      ? parsed.tree.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          if (!name) return [];
          const node: ImportTreeNode = {
            name,
            title: typeof row.title === 'string' ? row.title : '',
            reportsTo: typeof row.reportsTo === 'string' && row.reportsTo.trim() ? row.reportsTo.trim() : null,
          };
          if (typeof row.department === 'string') node.department = row.department;
          if (typeof row.note === 'string') node.note = row.note;
          return [node];
        })
      : local.tree;

    const merged = dedupeFindings([...local.findings, ...extraFindings]);
    const blockers = merged
      .filter((finding) => finding.severity === 'error')
      .map((finding) => (finding.rowNumber ? `Row ${finding.rowNumber}: ${finding.message}` : finding.message));

    return {
      modelConnected: true,
      privacyLocked: false,
      model: result.model,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : base.summary,
      findings: merged,
      tree: tree.slice(0, 40),
      canApply,
      applyBlockers: blockers,
    };
  } catch (error) {
    return {
      ...base,
      summary: `${base.summary} The AI agent could not add a review (${error instanceof Error ? error.message : 'request failed'}), so only file checks are shown.`,
    };
  }
}

function dedupeFindings(findings: ImportFinding[]): ImportFinding[] {
  const seen = new Set<string>();
  const next: ImportFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.rowNumber ?? 0}:${finding.message.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(finding);
  }
  return next.slice(0, 40);
}
