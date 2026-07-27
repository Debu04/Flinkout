import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../lib/http.js';

/** Cookie-authenticated mutations must originate from the configured web app. */
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.WEB_ORIGIN) return next(new ApiError(403, 'Untrusted request origin'));
  next();
}
