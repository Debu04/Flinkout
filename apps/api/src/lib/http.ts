import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, 'Route not found'));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred' });
}
