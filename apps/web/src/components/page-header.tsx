import type { ReactElement, ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Optional right-aligned actions (links, buttons, status pills). */
  actions?: ReactNode;
  /** Optional small back-link rendered above the title. */
  back?: { href: string; label: string; testid?: string };
  titleTestid?: string;
}

/**
 * Shared page heading used by every admin route. Centralises the
 * title + subtitle + actions layout so spacing and typography stay
 * consistent across /, /projects, /rules, /settings, etc.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  back,
  titleTestid,
}: Props): ReactElement {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1f242d] pb-4">
      <div className="min-w-0">
        {back ? (
          <a
            href={back.href}
            data-testid={back.testid ?? 'back-link'}
            className="text-xs text-[#6b7280] hover:text-[#10b981]"
          >
            ← {back.label}
          </a>
        ) : null}
        <h1
          className={`${back ? 'mt-1' : ''} truncate text-xl font-semibold text-[#10b981] md:text-2xl`}
          data-testid={titleTestid}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-xs text-[#6b7280]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
