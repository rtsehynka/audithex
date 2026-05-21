'use client';

import { type ReactElement, useActionState } from 'react';
import type { AccountActionResult } from '../app/settings/account/actions';

interface Field {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  required?: boolean;
  testid: string;
}

interface Props {
  title: string;
  description: string;
  fields: Field[];
  submitLabel: string;
  successLabel: string;
  testid: string;
  action: (prev: AccountActionResult | null, fd: FormData) => Promise<AccountActionResult>;
}

/**
 * Two-field account form (current password + one new value). Used by
 * both the change-email and change-password cards on /settings/account.
 * The submitLabel + successLabel let us distinguish them in the spec
 * and screenshot without giving the cards different code paths.
 */
export default function AccountForm({
  title,
  description,
  fields,
  submitLabel,
  successLabel,
  testid,
  action,
}: Props): ReactElement {
  const [state, formAction, pending] = useActionState<AccountActionResult | null, FormData>(
    async (_prev, fd) => action(_prev, fd),
    null,
  );
  const fieldError = (key: string): string | undefined => state?.fieldErrors?.[key];

  return (
    <section data-testid={testid} className="rounded-md border border-[#1f242d] bg-[#11141b] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">{title}</h2>
      <p className="mt-1 text-[10px] text-[#6b7280]">{description}</p>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        {fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm">
            <span className="text-[#6b7280]">{f.label}</span>
            <input
              name={f.name}
              type={f.type}
              required={f.required}
              autoComplete={f.type === 'password' ? 'new-password' : 'off'}
              data-testid={f.testid}
              className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
            />
            {fieldError(f.name) ? (
              <span data-testid={`${f.testid}-error`} className="text-xs text-[#ef4444]">
                {fieldError(f.name)}
              </span>
            ) : null}
          </label>
        ))}
        {state?.error ? (
          <p
            data-testid={`${testid}-error`}
            className="rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#ef4444]"
          >
            {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p
            data-testid={`${testid}-saved`}
            className="rounded-md border border-[#10b981] bg-[rgba(16,185,129,0.06)] px-3 py-2 text-xs text-[#10b981]"
          >
            {successLabel}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          data-testid={`${testid}-submit`}
          className="self-start rounded-md bg-[#10b981] px-4 py-2 text-xs font-semibold text-[#0b0e14] hover:bg-[#f97316] disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </form>
    </section>
  );
}
