import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AuthContext } from '../auth/session';
import { prisma } from '../db/prisma';
import { ApiError } from '../http/errors';
import { noContent, readJson } from '../http/route';
import {
  activityFeedScope,
  canViewActivity,
  canViewRelatedLiveTimeline,
  canViewRoute,
} from '../policies/privacy';
import { activitySyncKey, ownedCommentScope } from '../policies/ownership';
import { syncActivitySchema } from '../validation/activities';
import { aggregateHeatRoute } from './heatmap';

const pageSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});
const activityInclude = (viewerId: string) => ({
  user: {
    select: {
      id: true,
      username: true,
      profile: { select: { displayName: true, photoUrl: true, routeVisibility: true } },
    },
  },
  reactions: { where: { userId: viewerId }, select: { userId: true } },
  _count: { select: { reactions: true, comments: true } },
}) satisfies Prisma.ActivityInclude;
type ActivityWithSocial = Prisma.ActivityGetPayload<{ include: ReturnType<typeof activityInclude> }>;
const timelineUserSelect = {
  id: true,
  username: true,
  profile: { select: { displayName: true, photoUrl: true } },
} satisfies Prisma.UserSelect;
type TimelineUser = {
  id: string;
  username: string;
  profile: { displayName: string; photoUrl: string | null } | null;
};

const timelineUser = (user: TimelineUser) => ({
  id: user.id,
  username: user.username,
  displayName: user.profile?.displayName ?? user.username,
  photoUrl: user.profile?.photoUrl ?? null,
});

function encodeCursor(activity: { id: string; startedAt: Date }) {
  return Buffer.from(JSON.stringify({ id: activity.id, startedAt: activity.startedAt.toISOString() }))
    .toString('base64url');
}

function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const value = z.object({ id: z.string(), startedAt: z.string().datetime() })
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
    return { id: value.id, startedAt: new Date(value.startedAt) };
  } catch {
    throw new ApiError(400, 'Invalid feed cursor');
  }
}

function previewRoute(route: Prisma.JsonValue | null) {
  if (!Array.isArray(route) || route.length <= 100) return route;
  const step = Math.ceil(route.length / 100);
  return route.filter((_, index) => index === 0 || index === route.length - 1 || index % step === 0);
}

async function timelineFor(activity: ActivityWithSocial, viewerId: string, following: boolean) {
  const [live, comments, reactions] = await Promise.all([
    prisma.liveActivity.findFirst({
      where: { userId: activity.userId, clientId: activity.clientId },
      include: {
        user: { select: timelineUserSelect },
        joins: { orderBy: { createdAt: 'asc' }, take: 50, include: { user: { select: timelineUserSelect } } },
        comments: { orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: timelineUserSelect } } },
        highFives: { orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: timelineUserSelect } } },
      },
    }),
    prisma.activityComment.findMany({
      where: { activityId: activity.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { user: { select: timelineUserSelect } },
    }),
    prisma.activityReaction.findMany({
      where: { activityId: activity.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { user: { select: timelineUserSelect } },
    }),
  ]);
  const visibleLive = live && canViewRelatedLiveTimeline({
    ownerId: live.userId,
    viewerId,
    visibility: live.visibility,
    isFollowing: following,
  }) ? live : null;
  return [
    { id: `${activity.id}-start`, type: 'START' as const, source: 'ACTIVITY' as const, createdAt: activity.startedAt, user: timelineUser(activity.user) },
    ...(visibleLive ? [
      { id: `${visibleLive.id}-live-start`, type: 'LIVE_STARTED' as const, source: 'LIVE' as const, createdAt: visibleLive.startedAt, user: timelineUser(visibleLive.user) },
      ...visibleLive.joins.map((join) => ({ id: `${visibleLive.id}-join-${join.userId}`, type: 'JOINED' as const, source: 'LIVE' as const, createdAt: join.createdAt, user: timelineUser(join.user) })),
      ...visibleLive.comments.map((comment) => ({ id: `live-comment-${comment.id}`, type: 'COMMENT' as const, source: 'LIVE' as const, createdAt: comment.createdAt, body: comment.body, latitude: comment.latitude, longitude: comment.longitude, user: timelineUser(comment.user) })),
      ...visibleLive.highFives.map((highFive) => ({ id: `${visibleLive.id}-high-five-${highFive.userId}`, type: 'HIGH_FIVE' as const, source: 'LIVE' as const, createdAt: highFive.createdAt, user: timelineUser(highFive.user) })),
      ...(visibleLive.endedAt ? [{ id: `${visibleLive.id}-live-end`, type: 'LIVE_ENDED' as const, source: 'LIVE' as const, createdAt: visibleLive.endedAt, user: timelineUser(visibleLive.user) }] : []),
    ] : []),
    ...comments.map((comment) => ({ id: `activity-comment-${comment.id}`, type: 'COMMENT' as const, source: 'ACTIVITY' as const, createdAt: comment.createdAt, body: comment.body, user: timelineUser(comment.user) })),
    ...reactions.map((reaction) => ({ id: `activity-high-five-${reaction.userId}`, type: 'HIGH_FIVE' as const, source: 'ACTIVITY' as const, createdAt: reaction.createdAt, user: timelineUser(reaction.user) })),
    ...(activity.endedAt ? [{ id: `${activity.id}-finish`, type: 'FINISH' as const, source: 'ACTIVITY' as const, createdAt: activity.endedAt, user: timelineUser(activity.user) }] : []),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function isFollowing(viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return false;
  return Boolean(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
  }));
}

async function activityView(activity: ActivityWithSocial, viewerId: string, preview = false) {
  const following = await isFollowing(viewerId, activity.userId);
  const routeVisibility = activity.user.profile?.routeVisibility ?? 'PRIVATE';
  const showRoute = canViewRoute({
    ownerId: activity.userId,
    viewerId,
    visibility: routeVisibility,
    isFollowing: following,
  });
  return {
    id: activity.id,
    clientId: activity.clientId,
    type: activity.type,
    visibility: activity.visibility,
    startedAt: activity.startedAt,
    endedAt: activity.endedAt,
    durationS: activity.durationS,
    movingTimeS: activity.movingTimeS,
    distanceM: activity.distanceM,
    steps: activity.steps,
    averagePaceSPerKm: activity.averagePaceSPerKm,
    caloriesKcal: activity.caloriesKcal,
    currentElevationM: activity.currentElevationM,
    elevationGainM: activity.elevationGainM,
    elevationLossM: activity.elevationLossM,
    distanceSource: activity.distanceSource,
    route: showRoute ? (preview ? previewRoute(activity.route) : activity.route) : null,
    user: activity.user,
    reactionCount: activity._count.reactions,
    commentCount: activity._count.comments,
    reactedByViewer: activity.reactions.length > 0,
    ...(preview ? {} : { timeline: await timelineFor(activity, viewerId, following) }),
  };
}

async function visibleActivity(id: string, viewerId: string) {
  const activity = await prisma.activity.findUnique({ where: { id }, include: activityInclude(viewerId) });
  if (!activity) throw new ApiError(404, 'Activity not found');
  const following = await isFollowing(viewerId, activity.userId);
  if (!canViewActivity({
    ownerId: activity.userId,
    viewerId,
    visibility: activity.visibility,
    isFollowing: following,
  })) throw new ApiError(403, 'You cannot view this activity');
  return activity;
}

export async function syncActivity(request: NextRequest, auth: AuthContext) {
  const activity = syncActivitySchema.parse(await readJson(request));
  const key = activitySyncKey(auth.user.id, activity.clientId);
  const existing = await prisma.activity.findUnique({ where: key });
  if (existing) {
    return NextResponse.json({
      activityId: existing.id,
      clientId: existing.clientId,
      status: 'synced',
      duplicate: true,
    });
  }
  const start = activity.route[0];
  const created = await prisma.activity.upsert({
    where: key,
    update: {},
    create: {
      userId: auth.user.id,
      clientId: activity.clientId,
      type: activity.type,
      visibility: activity.visibility,
      startedAt: new Date(activity.startedAt),
      endedAt: new Date(activity.endedAt),
      durationS: activity.durationS,
      movingTimeS: activity.movingTimeS,
      distanceM: Math.round(activity.distanceM),
      steps: activity.steps,
      averagePaceSPerKm: activity.averagePaceSPerKm,
      caloriesKcal: activity.caloriesKcal,
      currentElevationM: activity.currentElevationM,
      elevationGainM: activity.elevationGainM,
      elevationLossM: activity.elevationLossM,
      distanceSource: activity.distanceSource,
      startLat: start ? Math.round(start.latitude * 100) / 100 : null,
      startLng: start ? Math.round(start.longitude * 100) / 100 : null,
      route: activity.route,
    },
  });
  const profile = await prisma.profile.findUnique({
    where: { userId: auth.user.id },
    select: { routeVisibility: true },
  });
  if (activity.visibility === 'PUBLIC' && profile?.routeVisibility === 'PUBLIC') {
    await aggregateHeatRoute(activity.route);
  }
  return NextResponse.json({
    activityId: created.id,
    clientId: created.clientId,
    status: 'synced',
    duplicate: false,
  }, { status: 201 });
}

export async function getFeed(request: NextRequest, auth: AuthContext) {
  const { cursor, limit } = pageSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const after = decodeCursor(cursor);
  const cursorFilter: Prisma.ActivityWhereInput | undefined = after ? {
    OR: [
      { startedAt: { lt: after.startedAt } },
      { startedAt: after.startedAt, id: { lt: after.id } },
    ],
  } : undefined;
  const visibility = activityFeedScope(auth.user.id);
  const activities = await prisma.activity.findMany({
    where: cursorFilter ? { AND: [visibility, cursorFilter] } : visibility,
    include: activityInclude(auth.user.id),
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = activities.length > limit;
  const items = activities.slice(0, limit);
  return NextResponse.json({
    activities: await Promise.all(items.map((activity) => activityView(activity, auth.user.id, true))),
    nextCursor: hasMore ? encodeCursor(items.at(-1)!) : null,
  });
}

export async function getActivity(idValue: string, auth: AuthContext) {
  const id = z.string().cuid().parse(idValue);
  return NextResponse.json({
    activity: await activityView(await visibleActivity(id, auth.user.id), auth.user.id),
  });
}

export async function setReaction(idValue: string, active: boolean, auth: AuthContext) {
  const activity = await visibleActivity(z.string().cuid().parse(idValue), auth.user.id);
  if (active) {
    await prisma.activityReaction.upsert({
      where: { activityId_userId: { activityId: activity.id, userId: auth.user.id } },
      update: {},
      create: { activityId: activity.id, userId: auth.user.id },
    });
  } else {
    await prisma.activityReaction.deleteMany({
      where: { activityId: activity.id, userId: auth.user.id },
    });
  }
  const reactionCount = await prisma.activityReaction.count({ where: { activityId: activity.id } });
  return NextResponse.json({ reacted: active, reactionCount }, { status: active ? 201 : 200 });
}

export async function getComments(request: NextRequest, idValue: string, auth: AuthContext) {
  const activity = await visibleActivity(z.string().cuid().parse(idValue), auth.user.id);
  const { cursor, limit } = pageSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const comments = await prisma.activityComment.findMany({
    where: { activityId: activity.id },
    include: { user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: z.string().cuid().parse(cursor) }, skip: 1 } : {}),
  });
  const hasMore = comments.length > limit;
  const items = comments.slice(0, limit);
  return NextResponse.json({
    comments: items.map((comment) => ({ ...comment, isOwner: comment.userId === auth.user.id })),
    nextCursor: hasMore ? items.at(-1)!.id : null,
  });
}

export async function createComment(request: NextRequest, idValue: string, auth: AuthContext) {
  const activity = await visibleActivity(z.string().cuid().parse(idValue), auth.user.id);
  const body = z.object({ body: z.string().trim().min(1).max(500) })
    .parse(await readJson(request)).body;
  const comment = await prisma.activityComment.create({
    data: { activityId: activity.id, userId: auth.user.id, body },
    include: { user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } } },
  });
  return NextResponse.json({ comment: { ...comment, isOwner: true } }, { status: 201 });
}

export async function deleteComment(activityIdValue: string, commentIdValue: string, auth: AuthContext) {
  const activityId = z.string().cuid().parse(activityIdValue);
  await visibleActivity(activityId, auth.user.id);
  const commentId = z.string().cuid().parse(commentIdValue);
  const result = await prisma.activityComment.deleteMany({
    where: ownedCommentScope(auth.user.id, activityId, commentId),
  });
  if (!result.count) throw new ApiError(404, 'Comment not found');
  return noContent();
}
