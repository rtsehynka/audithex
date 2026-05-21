import type { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { type ScanRunEvent, runProjectScan } from '../../../../lib/run-scan';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-Sent Events stream for the live scan runner. The browser opens
 * an EventSource against /api/scans/run?projectId=<id>; this handler
 * runs the same pipeline as `audithex scan --project <name>` and emits
 * one SSE frame per ScanRunEvent. The session cookie is required — no
 * anonymous scans, no anonymous resource burn.
 */
export async function GET(req: NextRequest): Promise<Response> {
  await requireSession();

  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) {
    return new Response(JSON.stringify({ error: 'projectId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ScanRunEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const evt of runProjectScan(projectId)) {
          send(evt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
