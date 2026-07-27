import { NextResponse, type NextRequest } from 'next/server';

// The API validates the session on every protected request. This only prevents
// unauthenticated visitors from reaching account screens before that check.
export function middleware(request: NextRequest) {
  // UI preview mode is available only in local development. Production keeps
  // the account pages protected and the API still verifies every session.
  if (process.env.NODE_ENV === 'development') return NextResponse.next();
  if (!request.cookies.has('flinkout_session')) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/profile/:path*'] };
