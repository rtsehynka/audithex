export interface UpdateCheckResult {
  current: string;
  latest: string;
  upToDate: boolean;
}

/**
 * Compares two simple semver-ish strings. Pre-release suffix (after the
 * first '-') is dropped so '1.0.0-dev' == '1.0.0'. Returns -1 / 0 / +1.
 */
export function compareSemver(a: string, b: string): number {
  const stripPrerelease = (s: string): number[] => {
    const base = s.split('-')[0] ?? s;
    return base.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const aa = stripPrerelease(a);
  const bb = stripPrerelease(b);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function evaluateUpdate(current: string, latest: string): UpdateCheckResult {
  return { current, latest, upToDate: compareSemver(current, latest) >= 0 };
}
