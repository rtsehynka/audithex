import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { logoutAction } from '../app/logout/actions';

interface Props {
  sessionEmail: string;
  active: 'scans' | 'projects' | 'rules' | 'coverage' | 'settings' | 'none';
  children: ReactNode;
}

const NAV: { id: Props['active']; href: string; label: string; testid: string }[] = [
  { id: 'scans', href: '/', label: 'Scans', testid: 'nav-scans' },
  { id: 'projects', href: '/projects', label: 'Projects', testid: 'projects-link' },
  { id: 'rules', href: '/rules', label: 'Rules', testid: 'rules-link' },
  { id: 'coverage', href: '/coverage', label: 'Coverage', testid: 'coverage-link' },
  { id: 'settings', href: '/settings', label: 'Settings', testid: 'settings-link' },
];

export default function AppShell({ sessionEmail, active, children }: Props): ReactElement {
  return (
    <div className="flex min-h-screen bg-[#0b0e14] text-[#d4d4d4]">
      <aside
        data-testid="app-sidebar"
        className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-[#1f242d] bg-[#0e1119] md:flex"
      >
        <div className="border-b border-[#1f242d] px-5 py-4">
          <Link
            href="/"
            data-testid="brand-link"
            className="flex items-baseline gap-2 hover:opacity-80"
          >
            <span className="text-base font-semibold text-[#10b981]">Audithex</span>
            <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">admin</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3 text-sm">
          {NAV.map((item) => (
            <SidebarLink
              key={item.id}
              href={item.href}
              label={item.label}
              testid={item.testid}
              active={active === item.id}
            />
          ))}
        </nav>
        <div className="border-t border-[#1f242d] px-3 py-3 text-[11px]">
          <p className="truncate text-[#6b7280]" title={sessionEmail}>
            <span data-testid="session-email">{sessionEmail}</span>
          </p>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              data-testid="logout-button"
              className="w-full rounded-md border border-[#1f242d] bg-[#11141b] px-3 py-1.5 text-left text-[#d4d4d4] hover:border-[#f97316] hover:text-[#f97316]"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-testid="app-topbar"
          className="flex items-center justify-between border-b border-[#1f242d] bg-[#0e1119] px-4 py-3 md:hidden"
        >
          <Link href="/" className="text-sm font-semibold text-[#10b981]">
            Audithex
          </Link>
          <div className="flex items-center gap-2">
            <span
              data-testid="session-email-mobile"
              className="max-w-[150px] truncate text-[11px] text-[#6b7280]"
            >
              {sessionEmail}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                data-testid="logout-button-mobile"
                className="rounded-md border border-[#1f242d] bg-[#11141b] px-2 py-1 text-[11px] text-[#d4d4d4] hover:border-[#f97316] hover:text-[#f97316]"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <nav
          data-testid="app-topbar-nav"
          className="flex gap-1 overflow-x-auto border-b border-[#1f242d] bg-[#0e1119] px-3 py-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              data-testid={`${item.testid}-mobile`}
              className={`shrink-0 rounded-md px-3 py-1 text-xs ${
                active === item.id
                  ? 'bg-[#10b981] text-[#0b0e14]'
                  : 'text-[#d4d4d4] hover:bg-[#11141b]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  testid,
  active,
}: {
  href: string;
  label: string;
  testid: string;
  active: boolean;
}): ReactElement {
  const base = 'flex items-center gap-2 rounded-md px-3 py-2 text-sm';
  const tone = active
    ? 'bg-[rgba(16,185,129,0.10)] text-[#10b981]'
    : 'text-[#d4d4d4] hover:bg-[#11141b] hover:text-[#10b981]';
  return (
    <Link href={href} data-testid={testid} className={`${base} ${tone}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[#10b981]' : 'bg-[#1f242d]'}`}
        aria-hidden
      />
      <span>{label}</span>
    </Link>
  );
}
