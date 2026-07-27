import { NextResponse, type NextRequest } from 'next/server';

// The API validates the session on every protected request. This only prevents
// unauthenticated visitors from reaching account screens before that check.
export function middleware(request: NextRequest) {
  if (!request.cookies.has('flinkout_session')) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/profile/:path*'] };
