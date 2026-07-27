import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/http.js';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'flinkout_session';

export const hashToken = (token: string) => createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new ApiError(401, 'Authentication required');
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      throw new ApiError(401, 'Session expired or invalid');
    }
    req.currentUser = session.user;
    next();
  } catch (error) { next(error); }
}
