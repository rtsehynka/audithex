import type { ReactElement, ReactNode } from 'react';

/**
 * Two shared cell wrappers used by every Mongo-backed listing in the
 * app (scan history, projects). Centralising the Tailwind classes
 * keeps the dashboard's table styling consistent and keeps jscpd
 * happy across pages that list rows of records.
 */

export function Th({ children }: { children: ReactNode }): ReactElement {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  title,
  'data-testid': testid,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  'data-testid'?: string;
}): ReactElement {
  return (
    <td className={`px-3 py-2 align-top ${className ?? ''}`} title={title} data-testid={testid}>
      {children}
    </td>
  );
}
