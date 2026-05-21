import type { ZodIssue } from 'zod';

/**
 * Flattens a zod issues array into a `{ field: message }` shape that
 * client forms use to surface per-field validation errors. Picks the
 * first issue per field; further issues for the same path are dropped.
 */
export function collectFieldErrors(issues: readonly ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}
