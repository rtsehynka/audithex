'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

interface LoginState {
  error: string | null;
}

export default function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError: string | null;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    async (_prev, formData) => {
      const result = await loginAction({
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        redirectTo,
      });
      if (result && result.ok === false) {
        return { error: result.message };
      }
      // On success the action redirects — this code path is only hit
      // when the server returns nothing (shouldn't happen, but keep
      // the state in a known shape).
      return { error: null };
    },
    { error: initialError },
  );

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          data-testid="login-email"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          data-testid="login-password"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        />
      </label>
      {state.error ? (
        <p
          data-testid="login-error"
          role="alert"
          className="rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#ef4444]"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        data-testid="login-submit"
        className="mt-2 rounded-md bg-[#10b981] px-4 py-2 text-sm font-semibold text-[#0b0e14] hover:bg-[#f97316] disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
