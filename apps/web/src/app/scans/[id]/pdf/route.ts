import { listAiFixesForScan } from '@audithex/core-persistence';
import { NextResponse } from 'next/server';
import { readSession } from '../../../../lib/auth';
import { getConnection } from '../../../../lib/db';
import { renderScanPdf } from '../../../../lib/pdf';
import { getScan } from '../../../../lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login', _req.url), 302);
  }
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) {
    return new NextResponse('Scan not found', { status: 404 });
  }
  const conn = await getConnection();
  const fixes = await listAiFixesForScan(conn, scan.id);
  const buffer = await renderScanPdf(
    scan,
    fixes.map((f) => ({ findingKey: f.findingKey, costUsd: f.costUsd })),
  );
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="audithex-scan-${scan.id}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}
