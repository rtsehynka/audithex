import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from './lib/session';

const PUBLIC_PATHS = new Set(['/login']);

/**
 * Edge-side guard. Verifies the session cookie WITHOUT hitting Mongo
 * (signature check only via Web Crypto). Authenticated requests flow
 * through; everyone else is bounced to /login except for the public
 * paths above and Next's own static / API plumbing.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
