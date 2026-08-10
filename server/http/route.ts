import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { AuthContext } from '../auth/session';
import { authenticateRequest } from '../auth/session';
import { getServerEnv } from '../config/env';
import { ApiError, errorResponse } from './errors';

type NextRouteContext<Params> = { params: Promise<Params> };
type ApiHandlerContext<Params> = { params: Params; auth: AuthContext | null };
type ApiHandler<Params> = (
  request: NextRequest,
  context: ApiHandlerContext<Params>,
) => Promise<Response> | Response;

type RouteOptions = {
  auth?: boolean;
  rateLimit?: { requests: number; windowMs: number };
};

const hits = new Map<string, { count: number; resetAt: number }>();

function requestKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${forwarded ?? 'local'}:${request.nextUrl.pathname}`;
}

function enforceRateLimit(
  request: NextRequest,
  options: RouteOptions['rateLimit'] = { requests: 120, windowMs: 60_000 },
) {
  const key = requestKey(request);
  const now = Date.now();
  const existing = hits.get(key);
  if (!existing || existing.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > options.requests) {
    throw new ApiError(429, 'Too many requests. Please try again shortly.');
  }
}

function enforceTrustedOrigin(request: NextRequest, auth: AuthContext | null) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (auth && auth.transport !== 'cookie') return;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') throw new ApiError(403, 'Untrusted request origin');

  const origin = request.headers.get('origin');
  if (!origin) return;
  const configuredOrigin = process.env.APP_ORIGIN
    ? getServerEnv().APP_ORIGIN
    : request.nextUrl.origin;
  if (origin !== configuredOrigin) throw new ApiError(403, 'Untrusted request origin');
}

export function apiRoute<Params extends Record<string, string> = Record<string, never>>(
  handler: ApiHandler<Params>,
  options: RouteOptions = {},
) {
  return async (request: NextRequest, routeContext: NextRouteContext<Params>) => {
    try {
      enforceRateLimit(request, options.rateLimit);
      const auth = options.auth ? await authenticateRequest(request) : null;
      enforceTrustedOrigin(request, auth);
      const params = await routeContext.params;
      const response = await handler(request, { params, auth });
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch (error) {
      const response = errorResponse(error);
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }
  };
}

export async function readJson(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 5 * 1024 * 1024) throw new ApiError(413, 'Request body is too large');
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, 'Request body must use application/json');
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
}

export const noContent = () => new NextResponse(null, { status: 204 });
