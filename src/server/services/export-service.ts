import ExcelJS from 'exceljs';
import { getChartPayload } from '@/server/services/chart-service';
import { sanitiseSpreadsheetText, toCsv } from '@/lib/csv';
import type { ChartNodeModel } from '@/domain/chart/project';

const HEADERS = [
  'Person',
  'Title',
  'Department',
  'Location',
  'Manager',
  'Manager title',
  'Email',
  'Direct reports',
  'Downstream',
  'Status',
  'Position type',
] as const;

export interface DirectoryRow {
  person: string;
  title: string;
  department: string;
  location: string;
  manager: string;
  managerTitle: string;
  email: string;
  directReports: number;
  downstream: number;
  status: string;
  positionType: string;
}

export function directoryRowsFromNodes(nodes: ChartNodeModel[]): DirectoryRow[] {
  const rows: DirectoryRow[] = [];
  for (const node of nodes) {
    if (node.occupants.length === 0) {
      rows.push(rowFromNode(node, 'Vacant', ''));
      continue;
    }
    for (const occupant of node.occupants) {
      rows.push(rowFromNode(node, occupant.displayName, occupant.email ?? ''));
    }
  }
  rows.sort((a, b) => a.person.localeCompare(b.person) || a.title.localeCompare(b.title));
  return rows;
}

function rowFromNode(node: ChartNodeModel, person: string, email: string): DirectoryRow {
  return {
    person,
    title: node.title,
    department: node.departmentName ?? '',
    location: node.locationName ?? '',
    manager: node.managerName ?? '',
    managerTitle: node.managerTitle ?? '',
    email,
    directReports: node.directReportCount,
    downstream: node.downstreamCount,
    status: node.isVacant ? 'Vacant' : 'Occupied',
    positionType: node.positionType,
  };
}

function rowValues(row: DirectoryRow): Array<string | number> {
  return [
    row.person,
    row.title,
    row.department,
    row.location,
    row.manager,
    row.managerTitle,
    row.email,
    row.directReports,
    row.downstream,
    row.status,
    row.positionType,
  ];
}

export function directoryToCsv(rows: DirectoryRow[]): string {
  return toCsv([...HEADERS], rows.map(rowValues));
}

export async function directoryToXlsx(rows: DirectoryRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Omni org chart';
  const sheet = workbook.addWorksheet('Directory', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = HEADERS.map((header) => ({ header, width: 22 }));
  for (const row of rows) {
    const values = rowValues(row).map((value) =>
      typeof value === 'number' ? value : sanitiseSpreadsheetText(value),
    );
    sheet.addRow(values);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildDirectoryExport(organisationId: string) {
  const payload = await getChartPayload({ organisationId });
  return directoryRowsFromNodes(payload.nodes);
}
