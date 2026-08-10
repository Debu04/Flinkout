import 'server-only';
import bcrypt from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { ApiError } from '../http/errors';
import {
  clearSessionCookies,
  createWebSession,
  revokeRequestSession,
  setSessionCookie,
  type AuthContext,
} from '../auth/session';
import { readJson } from '../http/route';
import { accountUserDto, accountUserSelect, type AccountUserDto } from '../dto/user';

const username = z.string().trim().toLowerCase().regex(
  /^[a-z0-9_]{3,30}$/,
  'Username must be 3-30 lowercase letters, numbers, or underscores',
);
const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
  username,
  displayName: z.string().trim().min(1).max(60),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

async function responseWithSession(request: NextRequest, user: AccountUserDto, status = 200) {
  const session = await createWebSession(user.id, request.headers.get('user-agent'));
  const response = NextResponse.json({ user: accountUserDto(user) }, { status });
  setSessionCookie(response, session.token);
  return response;
}

export async function register(request: NextRequest) {
  const data = registerSchema.parse(await readJson(request));
  const email = data.email.toLowerCase();
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: data.username }] },
  });
  if (exists) throw new ApiError(409, 'Email or username is already in use');

  const user = await prisma.user.create({
    data: {
      email,
      username: data.username,
      passwordHash: await bcrypt.hash(data.password, 12),
      profile: { create: { displayName: data.displayName } },
    },
    select: accountUserSelect,
  });
  return responseWithSession(request, user, 201);
}

export async function login(request: NextRequest) {
  const data = loginSchema.parse(await readJson(request));
  const user = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
    select: { ...accountUserSelect, passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return responseWithSession(request, accountUserDto(user));
}

export async function logout(request: NextRequest) {
  await revokeRequestSession(request);
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}

export async function me(auth: AuthContext) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: accountUserSelect,
  });
  return NextResponse.json({ user: accountUserDto(user) });
}
