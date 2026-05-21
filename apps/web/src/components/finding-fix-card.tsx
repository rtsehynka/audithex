'use client';

import { type ReactElement, useState } from 'react';
import { type FixActionResult, requestAiFix } from '../app/scans/[id]/fix-actions';

interface Props {
  scanId: string;
  findingKey: string;
  llmAvailable: boolean;
  llmProvider: 'anthropic' | 'openai' | 'gemini' | 'dry-run' | 'unconfigured';
  initialFix?: {
    provider: string;
    model: string;
    costUsd: number;
    response: string;
  } | null;
}

export default function FindingFixCard({
  scanId,
  findingKey,
  llmAvailable,
  llmProvider,
  initialFix,
}: Props): ReactElement {
  const initial: FixActionResult | null = initialFix
    ? {
        ok: true,
        cached: true,
        provider: initialFix.provider as FixActionResult['provider'],
        model: initialFix.model,
        costUsd: initialFix.costUsd,
        response: initialFix.response,
      }
    : null;
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FixActionResult | null>(initial);
  const [open, setOpen] = useState(Boolean(initial));

  async function onClick(): Promise<void> {
    if (result) {
      setOpen((v) => !v);
      return;
    }
    setPending(true);
    try {
      const res = await requestAiFix({ scanId, findingKey });
      setResult(res);
      setOpen(true);
    } finally {
      setPending(false);
    }
  }

  const disabled = !llmAvailable && !result;
  const buttonLabel = result
    ? open
      ? 'Hide AI fix'
      : 'Show AI fix'
    : pending
      ? 'Asking…'
      : llmAvailable
        ? 'Explain how to fix'
        : 'AI key not configured';

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        data-testid="ai-fix-button"
        data-finding-key={findingKey}
        className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-1 text-[11px] text-[#10b981] hover:border-[#10b981] disabled:cursor-not-allowed disabled:text-[#6b7280] disabled:hover:border-[#1f242d]"
      >
        {buttonLabel}
      </button>
      {!llmAvailable && !result ? (
        <span className="ml-2 text-[10px] text-[#6b7280]" data-testid="ai-fix-disabled-hint">
          Set <code className="text-[#10b981]">ANTHROPIC_API_KEY</code> or{' '}
          <code className="text-[#10b981]">AUDITHEX_LLM_DRY_RUN=true</code> in <code>.env</code>.
        </span>
      ) : null}
      {open && result ? <FixResultCard result={result} provider={llmProvider} /> : null}
    </div>
  );
}

function FixResultCard({
  result,
  provider,
}: {
  result: FixActionResult;
  provider: Props['llmProvider'];
}): ReactElement {
  if (!result.ok) {
    return (
      <div
        data-testid="ai-fix-error"
        className="mt-2 rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] p-3 text-[11px] text-[#ef4444]"
      >
        {result.error ?? 'Failed to request a fix.'}
      </div>
    );
  }
  return (
    <article
      data-testid="ai-fix-result"
      data-provider={result.provider}
      data-cached={result.cached ? 'true' : 'false'}
      className="mt-2 rounded-md border border-[#1f242d] bg-[#0b0e14] p-3 text-[11px]"
    >
      <header className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-[#6b7280]">
        <span>
          provider:{' '}
          <span className="font-mono text-[#10b981]" data-testid="ai-fix-provider">
            {result.provider}
          </span>
        </span>
        <span>
          model:{' '}
          <span className="font-mono text-[#d4d4d4]" data-testid="ai-fix-model">
            {result.model}
          </span>
        </span>
        <span>
          cost:{' '}
          <span className="font-mono text-[#d4d4d4]" data-testid="ai-fix-cost">
            ${result.costUsd.toFixed(4)}
          </span>
        </span>
        <span data-testid="ai-fix-cache-state">
          {result.cached ? 'served from cache' : 'fresh response'}
        </span>
        {provider === 'dry-run' ? (
          <span className="rounded border border-[#f97316] px-1.5 py-0.5 text-[10px] uppercase text-[#f97316]">
            dry-run
          </span>
        ) : null}
      </header>
      <pre
        data-testid="ai-fix-text"
        className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#d4d4d4]"
      >
        {result.response}
      </pre>
    </article>
  );
}
