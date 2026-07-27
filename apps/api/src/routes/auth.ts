import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, hashToken, SESSION_COOKIE } from '../middleware/auth.js';

export const authRouter = Router();
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'Username must be 3–30 lowercase letters, numbers, or underscores');
const registerSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128), username, displayName: z.string().trim().min(1).max(60) });
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

const publicUser = (user: { id: string; email: string; username: string; profile: { displayName: string; bio: string | null; photoUrl: string | null; profileVisibility: string; discoverable: boolean } | null }) => ({ ...user, profile: user.profile });

async function issueSession(res: Response, userId: string, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), userAgent } });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30, path: '/' });
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findFirst({ where: { OR: [{ email: data.email.toLowerCase() }, { username: data.username }] } });
    if (exists) throw new ApiError(409, 'Email or username is already in use');
    const user = await prisma.user.create({ data: { email: data.email.toLowerCase(), username: data.username, passwordHash: await bcrypt.hash(data.password, 12), profile: { create: { displayName: data.displayName } }, }, include: { profile: true } });
    await issueSession(res, user.id, req.get('user-agent'));
    res.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, include: { profile: true } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) throw new ApiError(401, 'Invalid email or password');
    await issueSession(res, user.id, req.get('user-agent'));
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).send();
  } catch (error) { next(error); }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id }, include: { profile: true } });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
