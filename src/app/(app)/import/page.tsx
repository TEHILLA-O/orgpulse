'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { decodeSpreadsheetBytes, isSpreadsheetWorkbookName, parseCsv } from '@/lib/csv';
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  suggestColumnMap,
  type ImportField,
} from '@/domain/import/columns';
import { cn } from '@/lib/utils';

interface Finding {
  severity: 'error' | 'warning' | 'info';
  kind: string;
  rowNumber?: number;
  message: string;
}

interface TreeNode {
  name: string;
  title: string;
  reportsTo: string | null;
  department?: string;
  note?: string;
}

interface ImportSummary {
  job: {
    id: string;
    fileName: string;
    status: string;
    createdCount: number;
    updatedCount: number;
    errorCount: number;
  };
  preview: Array<{
    rowNumber: number;
    raw: Record<string, string>;
    status: string;
    errors: string[] | null;
  }>;
  counts: { total: number; new: number; invalid: number; duplicate: number; applied: number };
  staged?: Array<{
    rowNumber: number;
    raw: Record<string, string>;
    status: string;
    errors: string[] | null;
  }>;
  review?: {
    findings: Finding[];
    tree: TreeNode[];
    warningCount: number;
    errorCount: number;
  };
}

interface AgentReview {
  modelConnected: boolean;
  privacyLocked: boolean;
  model?: string;
  summary: string;
  findings: Finding[];
  tree: TreeNode[];
  canApply: boolean;
  applyBlockers: string[];
}

const SAMPLE_CSV = `Person,Title,Department,Location,Manager,Email
Sam Imported,Analyst,Finance,London,Amelia Shah,sam.imported@northstar.example
`;

const ISSUE_CSV = `Person,Title,Department,Location,Manager,Email
Pat Newhire,Analyst,Finance,London,Amelia Shah,pat.newhire@northstar.example
Pat Newhire,Lead,Finance,London,Unknown Boss,pat.newhire@northstar.example
Ada Cycle,Manager,Ops,London,Ben Cycle,ada.cycle@example.com
Ben Cycle,Director,Ops,London,Ada Cycle,ben.cycle@example.com
No Title,,Ops,London,Amelia Shah,notitle@example.com
`;

const MAPPING_FIELDS: ImportField[] = [
  'displayName',
  'title',
  'email',
  'managerName',
  'department',
  'location',
  'firstName',
  'lastName',
  'employeeId',
];

function emptyColumnMap(): Record<ImportField, string | null> {
  return Object.fromEntries(IMPORT_FIELDS.map((field) => [field, null])) as Record<
    ImportField,
    string | null
  >;
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [columnMap, setColumnMap] = useState<Record<ImportField, string | null>>(emptyColumnMap);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [agent, setAgent] = useState<AgentReview | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replacePromptOpen, setReplacePromptOpen] = useState(false);
  const [staged, setStaged] = useState<NonNullable<ImportSummary['staged']>>([]);

  const review = useMutation({
    mutationFn: async (input: { jobId: string; rows?: NonNullable<ImportSummary['staged']> }) => {
      const response = await fetch(`/api/v1/imports/${input.jobId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replaceExisting, rows: input.rows ?? staged }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Review failed');
      return payload as AgentReview;
    },
    onSuccess: (payload) => {
      setAgent(payload);
      const errors = payload.findings.filter((item) => item.severity === 'error').length;
      const warnings = payload.findings.filter((item) => item.severity === 'warning').length;
      if (errors || warnings) {
        toast.warning(
          `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} on this file.`,
        );
      } else if (!payload.modelConnected) {
        toast.success('File checks passed. Add an AI key to enable the import agent.');
      } else {
        toast.success('The AI agent found no extra issues.');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a CSV file from your computer first.');
      const body = new FormData();
      body.append('file', file);
      body.append('columnMap', JSON.stringify(columnMap));
      const response = await fetch('/api/v1/imports', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Import failed');
      return payload as ImportSummary;
    },
    onSuccess: (payload) => {
      setResult(payload);
      setStaged(payload.staged ?? payload.preview);
      setAgent(null);
      toast.success('Preview ready');
      review.mutate({ jobId: payload.job.id, rows: payload.staged ?? payload.preview });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('Upload a file first.');
      const response = await fetch(`/api/v1/imports/${result.job.id}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replaceExisting, rows: staged }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Apply failed');
      return payload as ImportSummary;
    },
    onSuccess: (payload) => {
      setResult(payload);
      toast.success(
        replaceExisting
          ? `Replaced the organisation with ${payload.job.createdCount} people from the CSV.`
          : `Imported ${payload.job.createdCount} new people, updated ${payload.job.updatedCount}.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const downloadCsv = (contents: string, filename: string) => {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  async function loadLocalFile(next: File | undefined) {
    if (!next) return;
    if (isSpreadsheetWorkbookName(next.name)) {
      toast.error('Save the Excel workbook as CSV, then upload that file.');
      return;
    }
    try {
      const text = decodeSpreadsheetBytes(new Uint8Array(await next.arrayBuffer()));
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        toast.error('No header row found in that CSV.');
        return;
      }
      if (parsed.rows.length === 0) {
        toast.error('The CSV has headers but no data rows.');
        return;
      }
      setFile(next);
      setHeaders(parsed.headers);
      setRowCount(parsed.rows.length);
      setColumnMap(suggestColumnMap(parsed.headers));
      setResult(null);
      setAgent(null);
      setStaged([]);
      setReplaceExisting(false);
      setReplacePromptOpen(true);
    } catch {
      toast.error('Could not read that file. Save it as CSV and try again.');
    }
  }

  const findings = agent?.findings ?? result?.review?.findings ?? [];
  const tree = agent?.tree ?? result?.review?.tree ?? [];
  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const hasName = Boolean(columnMap.displayName || columnMap.firstName || columnMap.email);
  const canPreview = Boolean(file && hasName && columnMap.title);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">CSV import</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Upload your own CSV from your computer. Map the columns if the headers are different, then preview
          before applying to the live organisation. After you choose a file, you can replace the current mock
          org with this CSV, or keep the existing people and merge.
        </p>
      </div>

      <Dialog open={replacePromptOpen} onOpenChange={setReplacePromptOpen}>
        <DialogContent>
          <DialogTitle>Switch off mock data?</DialogTitle>
          <DialogDescription>
            This organisation currently has seeded / mock people. Replace that chart with the uploaded CSV, or
            keep the existing people and add or update rows from the file.
          </DialogDescription>
          {file ? (
            <p className="mt-3 text-sm text-white">
              {file.name}
              <span className="text-[var(--muted-foreground)]">
                {' '}
                · {rowCount} row{rowCount === 1 ? '' : 's'}
              </span>
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setReplaceExisting(false);
                setReplacePromptOpen(false);
                toast.message('Existing people will be kept. The CSV will merge on apply.');
              }}
            >
              Keep mock data
            </Button>
            <Button
              onClick={() => {
                setReplaceExisting(true);
                setReplacePromptOpen(false);
                toast.message('Mock data will be removed when you apply this CSV.');
              }}
            >
              Use this CSV instead
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="space-y-4">
        <input
          ref={fileInputRef}
          id="csv-file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
          className="sr-only"
          onChange={(event) => {
            void loadLocalFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void loadLocalFile(event.dataTransfer.files[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-10 text-center transition-colors',
            dragging
              ? 'border-brand bg-brand/10'
              : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/8',
          )}
        >
          <FileUp className="h-8 w-8 text-brand-hi" />
          {file ? (
            <>
              <p className="mt-3 text-sm font-medium text-white">{file.name}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {rowCount} row{rowCount === 1 ? '' : 's'} · {headers.length} column
                {headers.length === 1 ? '' : 's'} · click or drop another CSV to replace
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium text-white">Drop your CSV here, or click to choose a file</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Use a .csv export from Excel, Google Sheets, Rippling, or any HR system
              </p>
            </>
          )}
        </div>

        {headers.length ? (
          <div className="space-y-3">
            <p className="text-xs tracking-wide text-[var(--muted-foreground)] uppercase">
              Match your columns
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MAPPING_FIELDS.map((field) => (
                <label key={field} className="space-y-1 text-xs">
                  <span className="text-[var(--muted-foreground)]">
                    {IMPORT_FIELD_LABELS[field]}
                    {field === 'displayName' || field === 'title' ? ' *' : ''}
                  </span>
                  <Select
                    value={columnMap[field] ?? ''}
                    onValueChange={(value) =>
                      setColumnMap((current) => ({ ...current, [field]: value || null }))
                    }
                    className="w-full min-w-0"
                  >
                    <SelectItem value="">Not in this file</SelectItem>
                    {headers.map((header) => (
                      <SelectItem key={`${field}-${header}`} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {replaceExisting ? (
                <p className="text-xs text-brand-hi">
                  Apply will switch off mock data and rebuild the org chart from this file only.
                </p>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Apply will keep existing people and merge matching rows (by email or name).
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => setReplacePromptOpen(true)}>
                Change
              </Button>
            </div>
            {!canPreview ? (
              <p className="text-xs text-critical-soft">
                Map at least a name (or email) and a job title before previewing.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileInputRef.current?.click()} variant="secondary">
            Choose CSV
          </Button>
          <Button onClick={() => upload.mutate()} disabled={!canPreview || upload.isPending}>
            {upload.isPending ? 'Reading…' : 'Preview and review'}
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(SAMPLE_CSV, 'omni-import-sample.csv')}>
            Sample CSV
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(ISSUE_CSV, 'omni-import-warnings.csv')}>
            Sample with warnings
          </Button>
        </div>
      </Card>

      {result ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{result.job.fileName}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {result.counts.total} rows · {result.counts.new} ready · {result.counts.invalid} invalid ·{' '}
                {result.counts.duplicate} duplicate
                {result.job.status === 'COMPLETED'
                  ? ` · created ${result.job.createdCount}, updated ${result.job.updatedCount}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.job.status !== 'COMPLETED' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => review.mutate({ jobId: result.job.id, rows: staged })}
                    disabled={review.isPending}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {review.isPending ? 'Reviewing…' : 'Ask the AI agent again'}
                  </Button>
                  <Button
                    onClick={() => apply.mutate()}
                    disabled={apply.isPending || result.counts.new === 0}
                  >
                    {apply.isPending
                      ? 'Applying…'
                      : replaceExisting
                        ? `Replace mock data with ${result.counts.new} rows`
                        : `Apply ${result.counts.new} rows`}
                  </Button>
                </>
              ) : (
                <Link href="/charts" className="text-sm font-medium text-brand underline">
                  Open org chart
                </Link>
              )}
            </div>
          </div>

          {errors.length || warnings.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-critical/35 bg-critical/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-critical-soft">
                  <AlertTriangle className="h-4 w-4" />
                  {errors.length} error{errors.length === 1 ? '' : 's'}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-critical-soft">
                  {errors.length
                    ? errors.slice(0, 8).map((item, index) => (
                        <li key={`${item.message}-${index}`}>
                          {item.rowNumber ? `Row ${item.rowNumber}: ` : ''}
                          {item.message}
                        </li>
                      ))
                    : <li>No blocking errors.</li>}
                </ul>
              </div>
              <div className="rounded-2xl border border-signal/35 bg-signal/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-signal-soft">
                  <AlertTriangle className="h-4 w-4" />
                  {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]">
                  {warnings.length
                    ? warnings.slice(0, 8).map((item, index) => (
                        <li key={`${item.message}-${index}`}>
                          {item.rowNumber ? `Row ${item.rowNumber}: ` : ''}
                          {item.message}
                        </li>
                      ))
                    : <li>No warnings.</li>}
                </ul>
              </div>
            </div>
          ) : result.counts.new > 0 ? (
            <p className="flex items-center gap-2 text-sm text-brand-hi">
              <CheckCircle2 className="h-4 w-4" />
              File checks passed. You can apply these rows to the live organisation.
            </p>
          ) : null}

          {result.counts.new === 0 && result.job.status !== 'COMPLETED' ? (
            <p className="text-sm text-critical-soft">
              No valid rows to apply yet. Fix missing names or titles in the file and preview again.
            </p>
          ) : null}

          {agent || review.isPending ? (
            <div className="rounded-2xl border border-brand/25 bg-brand/8 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-hi">
                <Sparkles className="h-4 w-4" />
                {agent?.modelConnected ? 'AI import agent' : 'Import checks'}
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                {review.isPending && !agent
                  ? 'Reading the file against the live organisation…'
                  : agent?.summary}
              </p>
              {tree.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                    Suggested organisation
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {tree.slice(0, 12).map((node) => (
                      <li key={`${node.name}-${node.title}`}>
                        <span className="font-medium">{node.name}</span>
                        <span className="text-[var(--muted-foreground)]">
                          {' '}
                          · {node.title}
                          {node.reportsTo ? ` · reports to ${node.reportsTo}` : ' · top of chart'}
                          {node.note ? ` · ${node.note}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs tracking-wide text-[var(--muted-foreground)] uppercase">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-3">{row.rowNumber}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        tone={
                          row.status === 'DUPLICATE' || row.status === 'INVALID' ? 'gold' : 'sea'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{row.raw.displayName || row.raw.email || '—'}</td>
                    <td className="py-2 pr-3">{row.raw.title || '—'}</td>
                    <td className="py-2 text-[var(--muted-foreground)]">
                      {Array.isArray(row.errors) ? row.errors.join(' ') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
