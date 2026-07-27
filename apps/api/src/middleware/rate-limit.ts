import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http.js';
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(limit = 120, windowMs = 60_000) { return (req: Request, _res: Response, next: NextFunction) => { const key = `${req.ip}:${req.path}`; const now = Date.now(); const state = hits.get(key); if (!state || state.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return next(); } if (++state.count > limit) return next(new ApiError(429, 'Too many requests. Please try again shortly.')); next(); }; }
