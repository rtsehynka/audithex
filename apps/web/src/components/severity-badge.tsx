import type { ReactElement } from 'react';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none';

const STYLES: Record<Severity, string> = {
  critical: 'border-[#ef4444] bg-[rgba(239,68,68,0.08)] text-[#ef4444]',
  high: 'border-[#f59e0b] bg-[rgba(245,158,11,0.08)] text-[#f59e0b]',
  medium: 'border-[#eab308] bg-[rgba(234,179,8,0.08)] text-[#eab308]',
  low: 'border-[#84cc16] bg-[rgba(132,204,22,0.08)] text-[#84cc16]',
  none: 'border-[#1f242d] bg-[rgba(107,114,128,0.08)] text-[#6b7280]',
};

const LABELS: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  none: 'NONE',
};

export default function SeverityBadge({
  severity,
}: {
  severity: Severity;
}): ReactElement {
  const style = STYLES[severity];
  return (
    <span
      data-severity={severity}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {LABELS[severity]}
    </span>
  );
}
