'use client';

import { useRouter } from 'next/navigation';
import type { ChangeEvent, ReactElement } from 'react';

interface Option {
  id: string;
  label: string;
}

export default function ComparePicker({
  currentId,
  options,
}: {
  currentId: string;
  options: Option[];
}): ReactElement | null {
  const router = useRouter();
  if (options.length === 0) return null;
  const onChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const otherId = event.target.value;
    if (!otherId) return;
    router.push(`/scans/${currentId}/compare/${otherId}`);
  };
  return (
    <label className="flex items-center gap-2 text-xs text-[#6b7280]">
      <span>Diff vs…</span>
      <select
        data-testid="compare-picker"
        defaultValue=""
        onChange={onChange}
        className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-2 py-1 text-xs text-[#d4d4d4] focus:border-[#10b981] focus:outline-none"
      >
        <option value="" disabled>
          Pick a scan…
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} data-testid="compare-option">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
