import { apiHandler, fileResponse } from '@/server/http/handler';
import { buildDirectoryExport, directoryToCsv, directoryToXlsx } from '@/server/services/export-service';

export const GET = apiHandler('charts:read', async (ctx) => {
  const format = new URL(ctx.request.url).searchParams.get('format') ?? 'csv';
  const rows = await buildDirectoryExport(ctx.organisationId);

  if (format === 'xlsx') {
    const buffer = await directoryToXlsx(rows);
    return fileResponse(
      new Uint8Array(buffer),
      'omni-directory.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }

  return fileResponse(directoryToCsv(rows), 'omni-directory.csv', 'text/csv; charset=utf-8');
});
