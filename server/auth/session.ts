import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../db/prisma';
import { getServerEnv } from '../config/env';
import { ApiError } from '../http/errors';

const LOCAL_SESSION_COOKIE = 'flinkout_session';
const SECURE_SESSION_COOKIE = '__Host-flinkout_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthContext = {
  user: { id: string; email: string; username: string };
  sessionId: string;
  transport: 'cookie' | 'bearer';
};

export function sessionCookieName() {
  return process.env.NODE_ENV === 'production'
    ? SECURE_SESSION_COOKIE
    : LOCAL_SESSION_COOKIE;
}

export function hashToken(token: string) {
  return createHmac('sha256', getServerEnv().SESSION_SECRET)
    .update(token)
    .digest('hex');
}

function readCookieCredential(request: NextRequest) {
  return request.cookies.get(SECURE_SESSION_COOKIE)?.value
    ?? request.cookies.get(LOCAL_SESSION_COOKIE)?.value;
}

/**
 * All API handlers consume this transport-neutral context. A mobile bearer
 * authenticator can be added here later without changing service signatures.
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthContext> {
  const token = readCookieCredential(request);
  if (!token) throw new ApiError(401, 'Authentication required');

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    throw new ApiError(401, 'Session expired or invalid');
  }
  return { user: session.user, sessionId: session.id, transport: 'cookie' };
}

export async function createWebSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent },
  });
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(LOCAL_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  response.cookies.set(SECURE_SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });
}

export async function revokeRequestSession(request: NextRequest) {
  const token = readCookieCredential(request);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
