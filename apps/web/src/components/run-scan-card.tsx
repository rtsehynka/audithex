'use client';

import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useRef, useState } from 'react';

interface Props {
  projectId: string;
  projectName: string;
}

interface LogLine {
  ts: number;
  text: string;
}

interface ScanRunEvent {
  type: 'start' | 'discovery' | 'file' | 'rules' | 'rule' | 'db' | 'persist' | 'done' | 'error';
  phase?: 'begin' | 'end' | 'loaded' | 'table' | 'error';
  project?: string;
  rootPath?: string;
  relPath?: string;
  totalFiles?: number;
  elapsedMs?: number;
  version?: string;
  source?: string;
  total?: number;
  ruleId?: string;
  findings?: number;
  index?: number;
  scanId?: string;
  totalFindings?: number;
  message?: string;
  driver?: string;
  tables?: number;
  scanAllTables?: boolean;
  table?: string;
  rowsScanned?: number;
  findingsAdded?: number;
  tablesScanned?: number;
}

/**
 * Live scan runner mounted on /projects/[id]. Opens an SSE stream
 * against /api/scans/run, paints a tail-style log panel, and pushes
 * the user to /scans/[id] when the run completes. Re-opening the
 * card after a completed run resets the log so we never confuse the
 * user with stale output from the previous run.
 */
export default function RunScanCard({ projectId, projectName }: Props): ReactElement {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [done, setDone] = useState<{ scanId: string; findings: number; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    return () => {
      sourceRef.current?.close();
    };
  }, []);

  const push = (text: string): void => {
    setLog((prev) => {
      const next = [...prev, { ts: Date.now(), text }];
      queueMicrotask(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      });
      return next;
    });
  };

  const start = (): void => {
    if (running) return;
    setLog([]);
    setDone(null);
    setError(null);
    setRunning(true);
    push(`Opening stream for ${projectName}…`);
    const src = new EventSource(`/api/scans/run?projectId=${encodeURIComponent(projectId)}`);
    sourceRef.current = src;
    src.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data) as ScanRunEvent;
        push(renderEvent(evt));
        if (evt.type === 'done' && evt.scanId) {
          setDone({
            scanId: evt.scanId,
            findings: evt.totalFindings ?? 0,
            ms: evt.elapsedMs ?? 0,
          });
          setRunning(false);
          src.close();
        }
        if (evt.type === 'error') {
          setError(evt.message ?? 'unknown error');
          setRunning(false);
          src.close();
        }
      } catch (parseErr) {
        push(`(unparseable event: ${String(parseErr)})`);
      }
    };
    src.onerror = () => {
      // EventSource dispatches onerror on close too — only surface a
      // user-visible error if the run did not produce a `done` event.
      if (!done && running) {
        push('Stream closed before completion.');
      }
      setRunning(false);
      src.close();
    };
  };

  return (
    <section
      data-testid="run-scan-card"
      className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Run scan</h2>
          <p className="mt-1 text-[10px] text-[#6b7280]">
            Same pipeline as <code>audithex scan --project {projectName}</code>. Streams per-rule
            progress live; the persisted scan opens automatically when finished.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={running}
          data-testid="run-scan-button"
          className="rounded-md bg-[#10b981] px-3 py-1.5 text-xs font-semibold text-[#0b0e14] hover:bg-[#f97316] disabled:opacity-50"
        >
          {running ? 'Scanning…' : 'Run scan'}
        </button>
      </header>

      {log.length > 0 ? (
        <pre
          ref={logRef}
          data-testid="run-scan-log"
          className="mt-3 max-h-72 overflow-y-auto rounded bg-[#0b0e14] p-3 font-mono text-[11px] leading-relaxed text-[#d4d4d4]"
        >
          {log.map((line) => (
            <div key={`${line.ts}-${line.text}`} data-testid="run-scan-log-line">
              <span className="text-[#6b7280]">{formatTs(line.ts)}</span> {line.text}
            </div>
          ))}
        </pre>
      ) : null}

      {error ? (
        <p
          data-testid="run-scan-error"
          className="mt-3 rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#ef4444]"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span data-testid="run-scan-done" className="text-[#10b981]">
            Scan complete · {done.findings} finding{done.findings === 1 ? '' : 's'} ·{' '}
            {formatMs(done.ms)}
          </span>
          <button
            type="button"
            onClick={() => router.push(`/scans/${done.scanId}`)}
            data-testid="run-scan-open"
            className="rounded-md border border-[#1f242d] bg-[#11141b] px-3 py-1.5 text-xs text-[#d4d4d4] hover:border-[#10b981] hover:text-[#10b981]"
          >
            Open scan →
          </button>
        </div>
      ) : null}
    </section>
  );
}

function renderEvent(evt: ScanRunEvent): string {
  switch (evt.type) {
    case 'start':
      return `Starting scan of ${evt.rootPath ?? ''}`;
    case 'discovery':
      return evt.phase === 'begin'
        ? 'Discovering files…'
        : `Discovered ${evt.totalFiles ?? 0} files in ${evt.elapsedMs ?? 0} ms`;
    case 'file':
      return `[${String(evt.index ?? '?').padStart(4, ' ')}/${evt.total ?? '?'}] checking ${evt.relPath ?? ''}`;
    case 'rules':
      return `Loaded rules pack ${evt.version ?? ''} (${evt.source ?? ''}) — ${evt.total ?? 0} rules`;
    case 'rule':
      return `[${String(evt.index ?? '?').padStart(2, ' ')}/${evt.total ?? '?'}] ${evt.ruleId ?? ''}: ${evt.findings ?? 0} finding${evt.findings === 1 ? '' : 's'}`;
    case 'db':
      if (evt.phase === 'begin') {
        return `DB scan (${evt.driver ?? ''}): ${evt.tables ?? 0} table(s) selected${evt.scanAllTables ? ', scan-all is ON' : ''}`;
      }
      if (evt.phase === 'table') {
        return `[${String(evt.index ?? '?').padStart(2, ' ')}/${evt.total ?? '?'}] db ${evt.table ?? ''}: ${evt.rowsScanned ?? 0} rows, ${evt.findingsAdded ?? 0} finding(s)`;
      }
      if (evt.phase === 'end') {
        return `DB scan done · ${evt.tablesScanned ?? 0} tables · ${evt.rowsScanned ?? 0} rows · ${evt.findingsAdded ?? 0} findings · ${evt.elapsedMs ?? 0} ms`;
      }
      if (evt.phase === 'error') {
        return `DB scan failed: ${evt.message ?? ''}`;
      }
      return JSON.stringify(evt);
    case 'persist':
      return 'Persisting scan to MongoDB…';
    case 'done':
      return `Done · ${evt.totalFindings ?? 0} findings · ${evt.elapsedMs ?? 0} ms · ${evt.scanId ?? ''}`;
    case 'error':
      return `Error: ${evt.message ?? 'unknown'}`;
    default:
      return JSON.stringify(evt);
  }
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
