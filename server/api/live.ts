import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AuthContext } from '../auth/session';
import { prisma } from '../db/prisma';
import { distanceKm } from '../domain/geo';
import { ApiError } from '../http/errors';
import { readJson } from '../http/route';
import { canViewActivity } from '../policies/privacy';
import { liveCommentSchema, liveUpdateSchema, startLiveSchema } from '../validation/live';

const nearbySchema = z.object({
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  radiusKm: z.coerce.number().min(1).max(50).default(10),
});
const approximate = (value: number) => Math.round(value * 100) / 100;
const publicUser = {
  id: true,
  username: true,
  profile: { select: { displayName: true, photoUrl: true } },
} satisfies Prisma.UserSelect;
const range = (lat: number, lng: number, km: number) => ({
  dLat: km / 111,
  dLng: km / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.1)),
});

type DisplayUserInput = {
  id: string;
  username: string;
  profile: { displayName: string; photoUrl: string | null } | null;
};
const displayUser = (user: DisplayUserInput) => ({
  id: user.id,
  username: user.username,
  displayName: user.profile?.displayName ?? user.username,
  photoUrl: user.profile?.photoUrl ?? null,
});

async function isFollowing(viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return false;
  return Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
  }));
}

async function visible(session: { userId: string; visibility: string }, viewerId: string) {
  return canViewActivity({
    ownerId: session.userId,
    viewerId,
    visibility: session.visibility,
    isFollowing: await isFollowing(viewerId, session.userId),
  });
}

const summaryInclude = (viewerId: string) => ({
  user: { select: publicUser },
  joins: { where: { userId: viewerId, active: true }, select: { userId: true } },
  highFives: { where: { userId: viewerId }, select: { userId: true } },
  comments: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    include: { user: { select: publicUser } },
  },
  _count: { select: { joins: { where: { active: true } }, comments: true, highFives: true } },
}) satisfies Prisma.LiveActivityInclude;
type LiveSummary = Prisma.LiveActivityGetPayload<{ include: ReturnType<typeof summaryInclude> }>;

function commentView(comment: LiveSummary['comments'][number], viewerId: string) {
  return {
    id: comment.id,
    body: comment.body,
    latitude: comment.latitude,
    longitude: comment.longitude,
    createdAt: comment.createdAt,
    userId: comment.userId,
    isOwner: comment.userId === viewerId,
    user: displayUser(comment.user),
  };
}

function summaryView(session: LiveSummary, viewerId: string, from?: [number, number]) {
  return {
    id: session.id,
    clientId: session.clientId,
    type: session.type,
    visibility: session.visibility,
    latitude: session.latitude,
    longitude: session.longitude,
    durationS: session.durationS,
    distanceM: session.distanceM,
    speedKmh: session.speedKmh,
    paused: session.paused,
    active: session.active,
    startedAt: session.startedAt,
    lastUpdatedAt: session.lastUpdatedAt,
    endedAt: session.endedAt,
    joinCount: session._count.joins,
    highFiveCount: session._count.highFives,
    commentCount: session._count.comments,
    joinedByViewer: session.joins.length > 0,
    highFivedByViewer: session.highFives.length > 0,
    distanceKm: from ? distanceKm(from[0], from[1], session.latitude, session.longitude) : 0,
    user: displayUser(session.user),
    latestComment: session.comments[0] ? commentView(session.comments[0], viewerId) : null,
  };
}

async function detailView(id: string, viewerId: string) {
  const session = await prisma.liveActivity.findUnique({
    where: { id },
    include: {
      user: { select: publicUser },
      joins: { orderBy: { createdAt: 'asc' }, take: 50, include: { user: { select: publicUser } } },
      comments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100, include: { user: { select: publicUser } } },
      highFives: { orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: publicUser } } },
      _count: { select: { joins: { where: { active: true } }, comments: true, highFives: true } },
    },
  });
  if (!session) throw new ApiError(404, 'Live activity not found');
  if (!(await visible(session, viewerId))) {
    throw new ApiError(403, 'You cannot view this live activity');
  }
  const comments = session.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    latitude: comment.latitude,
    longitude: comment.longitude,
    createdAt: comment.createdAt,
    userId: comment.userId,
    isOwner: comment.userId === viewerId,
    user: displayUser(comment.user),
  }));
  const timeline = [
    { id: `${session.id}-live-start`, type: 'LIVE_STARTED' as const, source: 'LIVE' as const, createdAt: session.startedAt, user: displayUser(session.user) },
    ...session.joins.map((join) => ({ id: `${session.id}-join-${join.userId}`, type: 'JOINED' as const, source: 'LIVE' as const, createdAt: join.createdAt, user: displayUser(join.user) })),
    ...comments.map((comment) => ({ id: `live-comment-${comment.id}`, type: 'COMMENT' as const, source: 'LIVE' as const, createdAt: comment.createdAt, body: comment.body, latitude: comment.latitude, longitude: comment.longitude, user: comment.user })),
    ...session.highFives.map((highFive) => ({ id: `${session.id}-high-five-${highFive.userId}`, type: 'HIGH_FIVE' as const, source: 'LIVE' as const, createdAt: highFive.createdAt, user: displayUser(highFive.user) })),
    ...(session.endedAt ? [{ id: `${session.id}-live-end`, type: 'LIVE_ENDED' as const, source: 'LIVE' as const, createdAt: session.endedAt, user: displayUser(session.user) }] : []),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    id: session.id,
    clientId: session.clientId,
    type: session.type,
    visibility: session.visibility,
    latitude: session.latitude,
    longitude: session.longitude,
    durationS: session.durationS,
    distanceM: session.distanceM,
    speedKmh: session.speedKmh,
    paused: session.paused,
    active: session.active,
    startedAt: session.startedAt,
    lastUpdatedAt: session.lastUpdatedAt,
    endedAt: session.endedAt,
    joinCount: session._count.joins,
    highFiveCount: session._count.highFives,
    commentCount: session._count.comments,
    joinedByViewer: session.joins.some((join) => join.userId === viewerId && join.active),
    highFivedByViewer: session.highFives.some((highFive) => highFive.userId === viewerId),
    distanceKm: 0,
    user: displayUser(session.user),
    comments,
    latestComment: comments.at(-1) ?? null,
    timeline,
  };
}

async function activeOwnedLive(userId: string) {
  const live = await prisma.liveActivity.findFirst({
    where: { userId, active: true },
    orderBy: { startedAt: 'desc' },
  });
  if (!live) throw new ApiError(404, 'No active live activity');
  return live;
}

export async function startLive(request: NextRequest, auth: AuthContext) {
  const data = startLiveSchema.parse(await readJson(request));
  const existing = await prisma.liveActivity.findFirst({
    where: { userId: auth.user.id, clientId: data.clientId },
  });
  if (existing) {
    return NextResponse.json({
      live: await detailView(existing.id, auth.user.id),
      duplicate: true,
    });
  }
  await prisma.liveActivity.updateMany({
    where: { userId: auth.user.id, active: true },
    data: { active: false, endedAt: new Date() },
  });
  const live = await prisma.liveActivity.create({
    data: {
      userId: auth.user.id,
      clientId: data.clientId,
      type: data.type,
      visibility: data.visibility,
      latitude: approximate(data.latitude),
      longitude: approximate(data.longitude),
      durationS: data.durationS,
      distanceM: Math.round(data.distanceM),
      speedKmh: data.speedKmh ?? 0,
      paused: data.paused ?? false,
    },
  });
  return NextResponse.json({
    live: await detailView(live.id, auth.user.id),
    duplicate: false,
  }, { status: 201 });
}

export async function getCurrentLive(auth: AuthContext) {
  const live = await prisma.liveActivity.findFirst({
    where: { userId: auth.user.id, active: true },
    orderBy: { startedAt: 'desc' },
  });
  return NextResponse.json({ live: live ? await detailView(live.id, auth.user.id) : null });
}

export async function updateCurrentLive(request: NextRequest, auth: AuthContext) {
  const data = liveUpdateSchema.parse(await readJson(request));
  const live = await activeOwnedLive(auth.user.id);
  const updated = await prisma.liveActivity.update({
    where: { id: live.id },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.visibility ? { visibility: data.visibility } : {}),
      ...(data.speedKmh !== undefined ? { speedKmh: data.speedKmh } : {}),
      ...(data.paused !== undefined ? { paused: data.paused } : {}),
      latitude: approximate(data.latitude),
      longitude: approximate(data.longitude),
      durationS: data.durationS,
      distanceM: Math.round(data.distanceM),
    },
  });
  return NextResponse.json({ live: await detailView(updated.id, auth.user.id) });
}

export async function stopCurrentLive(auth: AuthContext) {
  const live = await activeOwnedLive(auth.user.id);
  await prisma.liveActivity.update({
    where: { id: live.id },
    data: { active: false, endedAt: new Date() },
  });
  return NextResponse.json({ live: await detailView(live.id, auth.user.id) });
}

export async function getNearbyLive(request: NextRequest, auth: AuthContext) {
  const query = nearbySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const bounds = range(query.latitude, query.longitude, query.radiusKm);
  const sessions = await prisma.liveActivity.findMany({
    where: {
      active: true,
      lastUpdatedAt: { gte: new Date(Date.now() - 120_000) },
      latitude: { gte: query.latitude - bounds.dLat, lte: query.latitude + bounds.dLat },
      longitude: { gte: query.longitude - bounds.dLng, lte: query.longitude + bounds.dLng },
      OR: [
        { userId: auth.user.id },
        { visibility: 'PUBLIC' },
        { visibility: 'FOLLOWERS', user: { followers: { some: { followerId: auth.user.id } } } },
      ],
    },
    include: summaryInclude(auth.user.id),
    take: 30,
    orderBy: { lastUpdatedAt: 'desc' },
  });
  const live = sessions
    .map((session) => summaryView(session, auth.user.id, [query.latitude, query.longitude]))
    .filter((session) => session.distanceKm <= query.radiusKm);
  return NextResponse.json({ live });
}

export async function getLive(idValue: string, auth: AuthContext) {
  return NextResponse.json({
    live: await detailView(z.string().cuid().parse(idValue), auth.user.id),
  });
}

async function visibleSession(idValue: string, auth: AuthContext, requireActive = true) {
  const id = z.string().cuid().parse(idValue);
  const session = await prisma.liveActivity.findUnique({ where: { id } });
  if (!session || (requireActive && !session.active)) {
    throw new ApiError(404, 'Live activity not found');
  }
  if (!(await visible(session, auth.user.id))) {
    throw new ApiError(403, 'You cannot access this live activity');
  }
  return session;
}

export async function setLiveJoin(idValue: string, active: boolean, auth: AuthContext) {
  const session = await visibleSession(idValue, auth, active);
  if (session.userId === auth.user.id) throw new ApiError(400, 'You cannot join your own live activity');
  if (active) {
    await prisma.liveActivityJoin.upsert({
      where: { liveActivityId_userId: { liveActivityId: session.id, userId: auth.user.id } },
      update: { active: true, leftAt: null },
      create: { liveActivityId: session.id, userId: auth.user.id },
    });
  } else {
    await prisma.liveActivityJoin.updateMany({
      where: { liveActivityId: session.id, userId: auth.user.id, active: true },
      data: { active: false, leftAt: new Date() },
    });
  }
  const joinCount = await prisma.liveActivityJoin.count({
    where: { liveActivityId: session.id, active: true },
  });
  return NextResponse.json({ joined: active, joinCount }, { status: active ? 201 : 200 });
}

export async function createLiveComment(request: NextRequest, idValue: string, auth: AuthContext) {
  const session = await visibleSession(idValue, auth);
  const { body } = liveCommentSchema.parse(await readJson(request));
  const comment = await prisma.liveActivityComment.create({
    data: {
      liveActivityId: session.id,
      userId: auth.user.id,
      body,
      latitude: session.latitude,
      longitude: session.longitude,
    },
    include: { user: { select: publicUser } },
  });
  return NextResponse.json({
    comment: {
      id: comment.id,
      body: comment.body,
      latitude: comment.latitude,
      longitude: comment.longitude,
      createdAt: comment.createdAt,
      userId: comment.userId,
      isOwner: true,
      user: displayUser(comment.user),
    },
  }, { status: 201 });
}

export async function setHighFive(idValue: string, active: boolean, auth: AuthContext) {
  const session = await visibleSession(idValue, auth, active);
  if (session.userId === auth.user.id) {
    throw new ApiError(400, 'You cannot high-five your own live activity');
  }
  if (active) {
    await prisma.liveActivityHighFive.upsert({
      where: { liveActivityId_userId: { liveActivityId: session.id, userId: auth.user.id } },
      update: {},
      create: { liveActivityId: session.id, userId: auth.user.id },
    });
  } else {
    await prisma.liveActivityHighFive.deleteMany({
      where: { liveActivityId: session.id, userId: auth.user.id },
    });
  }
  const highFiveCount = await prisma.liveActivityHighFive.count({
    where: { liveActivityId: session.id },
  });
  return NextResponse.json({ highFived: active, highFiveCount }, { status: active ? 201 : 200 });
}
