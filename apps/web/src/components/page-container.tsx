import type { ReactElement, ReactNode } from 'react';

/**
 * Single full-width content wrapper used by every dashboard page
 * rendered inside <AppShell>. Replaces 13 hand-rolled inline
 * `mx-auto flex w-full max-w-{4xl|5xl|6xl|2xl} flex-col gap-6 px-6 py-8`
 * blocks that pinned content to a 1152px column even on 4K screens.
 *
 * The container intentionally exposes no width/spacing props: dashboard
 * pages share one layout, and per-page tweaks belong inside the page's
 * own sections, not on the wrapper. For very-long-line readability
 * concerns, wrap individual paragraphs in `max-w-prose` at the section
 * level.
 *
 * `<AppShell>` already provides the `<main>` element; this component
 * stays a `<div>` so a page can choose whether to add an outer `<main>`
 * tag of its own.
 */
interface Props {
  children: ReactNode;
  testid?: string;
}

export default function PageContainer({ children, testid }: Props): ReactElement {
  return (
    <div data-testid={testid} className="flex w-full flex-col gap-6 px-6 py-8">
      {children}
    </div>
  );
}
