import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { ApiError } from '../http/errors';
import { readJson, noContent } from '../http/route';
import type { AuthContext } from '../auth/session';
import { canViewProfile, canViewRoute } from '../policies/privacy';
import { profileOwnerKey } from '../policies/ownership';
import { publicProfileSelect, type PublicProfileDto } from '../dto/user';

const usernameSchema = z.string().regex(/^[a-z0-9_]{3,30}$/);
const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280).nullable().optional(),
  photoUrl: z.string().url().max(2048).nullable().optional(),
  profileVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  routeVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  discoverable: z.boolean().optional(),
});

function profileView(
  user: { id: string; username: string; profile: PublicProfileDto | null },
  isFollowing = false,
  isSelf = false,
) {
  return { id: user.id, username: user.username, profile: user.profile, isFollowing, isSelf };
}

function sampledRoute(route: Prisma.JsonValue | null) {
  const points = Array.isArray(route) ? route : undefined;
  if (!points || points.length <= 100) return route;
  const step = Math.ceil(points.length / 100);
  return points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0);
}

async function relation(viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return false;
  return Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
  }));
}

export async function searchUsers(request: NextRequest, auth: AuthContext) {
  const q = z.string().trim().min(1).max(30).parse(request.nextUrl.searchParams.get('q'));
  const users = await prisma.user.findMany({
    where: {
      id: { not: auth.user.id },
      profile: { is: { discoverable: true, profileVisibility: 'PUBLIC' } },
      OR: [{ username: { contains: q } }, { profile: { displayName: { contains: q } } }],
    },
    select: { id: true, username: true, profile: { select: publicProfileSelect } },
    take: 20,
  });
  return NextResponse.json({ users: users.map((user) => profileView(user)) });
}

export async function getUser(usernameValue: string, auth: AuthContext) {
  const username = usernameSchema.parse(usernameValue).toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, profile: { select: publicProfileSelect } },
  });
  if (!user) throw new ApiError(404, 'User not found');
  const isSelf = user.id === auth.user.id;
  const isFollowing = await relation(auth.user.id, user.id);
  const visibility = user.profile?.profileVisibility ?? 'PUBLIC';
  if (!canViewProfile({ ownerId: user.id, viewerId: auth.user.id, visibility, isFollowing })) {
    throw new ApiError(403, 'This profile is private');
  }
  return NextResponse.json({ user: profileView(user, isFollowing, isSelf) });
}

export async function getUserActivities(request: NextRequest, usernameValue: string, auth: AuthContext) {
  const username = usernameSchema.parse(usernameValue).toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, profile: { select: publicProfileSelect } },
  });
  if (!user) throw new ApiError(404, 'User not found');
  const isSelf = user.id === auth.user.id;
  const isFollowing = await relation(auth.user.id, user.id);
  const profileVisibility = user.profile?.profileVisibility ?? 'PUBLIC';
  if (!canViewProfile({ ownerId: user.id, viewerId: auth.user.id, visibility: profileVisibility, isFollowing })) {
    throw new ApiError(403, 'This profile is private');
  }

  const limit = z.coerce.number().int().min(1).max(30).default(12)
    .parse(request.nextUrl.searchParams.get('limit') ?? undefined);
  const where: Prisma.ActivityWhereInput = isSelf
    ? { userId: user.id }
    : isFollowing
      ? { userId: user.id, visibility: { in: ['PUBLIC', 'FOLLOWERS'] } }
      : { userId: user.id, visibility: 'PUBLIC' };
  const activities = await prisma.activity.findMany({
    where,
    include: {
      reactions: { where: { userId: auth.user.id }, select: { userId: true } },
      _count: { select: { reactions: true, comments: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
  const routeVisibility = user.profile?.routeVisibility ?? 'PRIVATE';
  const showRoute = canViewRoute({
    ownerId: user.id,
    viewerId: auth.user.id,
    visibility: routeVisibility,
    isFollowing,
  });
  return NextResponse.json({
    activities: activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      visibility: activity.visibility,
      startedAt: activity.startedAt,
      endedAt: activity.endedAt,
      durationS: activity.durationS,
      distanceM: activity.distanceM,
      steps: activity.steps,
      distanceSource: activity.distanceSource,
      route: showRoute ? sampledRoute(activity.route) : null,
      user: {
        id: user.id,
        username: user.username,
        profile: {
          displayName: user.profile?.displayName ?? user.username,
          photoUrl: user.profile?.photoUrl ?? null,
        },
      },
      reactionCount: activity._count.reactions,
      commentCount: activity._count.comments,
      reactedByViewer: activity.reactions.length > 0,
    })),
  });
}

export async function updateProfile(request: NextRequest, auth: AuthContext) {
  const data = profileSchema.parse(await readJson(request));
  const profile = await prisma.profile.update({
    where: profileOwnerKey(auth.user.id),
    data: data.discoverable === false
      ? { ...data, discoveryLat: null, discoveryLng: null, discoveryUpdatedAt: null }
      : data,
    select: publicProfileSelect,
  });
  return NextResponse.json({ profile });
}

export async function followUser(usernameValue: string, auth: AuthContext) {
  const username = usernameSchema.parse(usernameValue).toLowerCase();
  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === auth.user.id) throw new ApiError(400, 'You cannot follow yourself');
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: auth.user.id, followingId: target.id } },
    update: {},
    create: { followerId: auth.user.id, followingId: target.id },
  });
  return NextResponse.json({ following: true }, { status: 201 });
}

export async function unfollowUser(usernameValue: string, auth: AuthContext) {
  const username = usernameSchema.parse(usernameValue).toLowerCase();
  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) throw new ApiError(404, 'User not found');
  await prisma.follow.deleteMany({
    where: { followerId: auth.user.id, followingId: target.id },
  });
  return noContent();
}
