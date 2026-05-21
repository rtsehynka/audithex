'use client';

import { type ReactElement, useActionState, useState } from 'react';
import type { AiSettingsActionResult } from '../app/settings/ai/actions';

interface Initial {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
  costCapUsd: number;
  hasKey: boolean;
}

interface Props {
  initial: Initial;
  action: (prev: AiSettingsActionResult | null, fd: FormData) => Promise<AiSettingsActionResult>;
}

const PROVIDER_DEFAULTS: Record<Initial['provider'], { label: string; modelHint: string }> = {
  anthropic: { label: 'Anthropic (Claude)', modelHint: 'claude-sonnet-4-6' },
  openai: { label: 'OpenAI', modelHint: 'gpt-4o-mini' },
  gemini: { label: 'Google Gemini', modelHint: 'gemini-2.0-flash' },
};

export default function AiSettingsForm({ initial, action }: Props): ReactElement {
  const [state, formAction, pending] = useActionState<AiSettingsActionResult | null, FormData>(
    async (_prev, fd) => action(_prev, fd),
    null,
  );
  const fieldError = (key: string): string | undefined => state?.fieldErrors?.[key];
  const [provider, setProvider] = useState<Initial['provider']>(initial.provider);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">Provider</span>
        <select
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as Initial['provider'])}
          data-testid="ai-provider"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        >
          {(Object.keys(PROVIDER_DEFAULTS) as Initial['provider'][]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_DEFAULTS[p].label}
            </option>
          ))}
        </select>
        {fieldError('provider') ? (
          <span className="text-xs text-[#ef4444]">{fieldError('provider')}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">
          API key{' '}
          {initial.hasKey ? (
            <span className="text-[10px] text-[#10b981]">
              (currently saved — type to overwrite)
            </span>
          ) : (
            <span className="text-[10px] text-[#6b7280]">(stored locally in MongoDB)</span>
          )}
        </span>
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={initial.hasKey ? '••••••• (saved)' : 'sk-... / AIza... / sk-ant-...'}
          data-testid="ai-key"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 font-mono text-xs focus:border-[#10b981] focus:outline-none"
        />
        {fieldError('apiKey') ? (
          <span className="text-xs text-[#ef4444]">{fieldError('apiKey')}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">
          Model id{' '}
          <span className="text-[10px] text-[#6b7280]">
            (suggested for {PROVIDER_DEFAULTS[provider].label}:{' '}
            <code className="text-[#10b981]">{PROVIDER_DEFAULTS[provider].modelHint}</code>)
          </span>
        </span>
        <input
          name="model"
          type="text"
          defaultValue={initial.model}
          placeholder={PROVIDER_DEFAULTS[provider].modelHint}
          data-testid="ai-model"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        />
        {fieldError('model') ? (
          <span className="text-xs text-[#ef4444]">{fieldError('model')}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">Per-fix cost cap (USD)</span>
        <input
          name="costCapUsd"
          type="text"
          defaultValue={initial.costCapUsd.toString()}
          data-testid="ai-cost-cap"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        />
        {fieldError('costCapUsd') ? (
          <span className="text-xs text-[#ef4444]">{fieldError('costCapUsd')}</span>
        ) : null}
      </label>

      {state?.error ? (
        <p
          data-testid="ai-settings-error"
          className="rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#ef4444]"
        >
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p
          data-testid="ai-settings-saved"
          className="rounded-md border border-[#10b981] bg-[rgba(16,185,129,0.06)] px-3 py-2 text-xs text-[#10b981]"
        >
          Saved. Future "Explain how to fix" calls will use this provider.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        data-testid="ai-settings-submit"
        className="mt-2 self-start rounded-md bg-[#10b981] px-4 py-2 text-sm font-semibold text-[#0b0e14] hover:bg-[#f97316] disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save AI settings'}
      </button>
    </form>
  );
}
