import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { distanceKm } from './discovery.js';

export const liveRouter = Router();

export const liveUpdateSchema = z.object({
  type: z.enum(['WALK', 'RUN', 'RIDE', 'HIKE']).optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS']).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  durationS: z.number().int().min(0).max(86_400),
  distanceM: z.number().min(0).max(2_000_000),
  speedKmh: z.number().min(0).max(200).optional(),
  paused: z.boolean().optional(),
});
export const startLiveSchema = liveUpdateSchema.extend({
  clientId: z.string().uuid(),
  type: z.enum(['WALK', 'RUN', 'RIDE', 'HIKE']),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS']).default('FOLLOWERS'),
});
export const liveCommentSchema = z.object({ body: z.string().trim().min(1).max(500) });
const nearbySchema = z.object({ latitude: z.coerce.number().gte(-90).lte(90), longitude: z.coerce.number().gte(-180).lte(180), radiusKm: z.coerce.number().min(1).max(50).default(10) });
const approximate = (value: number) => Math.round(value * 100) / 100;
const publicUser = { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } satisfies Prisma.UserSelect;
const range = (lat: number, lng: number, km: number) => {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(Math.cos(lat * Math.PI / 180), .1));
  return { dLat, dLng };
};
const displayUser = (user: { id: string; username: string; profile: { displayName: string; photoUrl: string | null } | null }) => ({
  id: user.id,
  username: user.username,
  displayName: user.profile?.displayName ?? user.username,
  photoUrl: user.profile?.photoUrl ?? null,
});

async function visible(session: { userId: string; visibility: string }, viewerId: string) {
  return session.userId === viewerId
    || session.visibility === 'PUBLIC'
    || (session.visibility === 'FOLLOWERS' && Boolean(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: session.userId } } })));
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
  if (!await visible(session, viewerId)) throw new ApiError(403, 'You cannot view this live activity');
  const comments = session.comments.map(comment => ({
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
    ...session.joins.map(join => ({ id: `${session.id}-join-${join.userId}`, type: 'JOINED' as const, source: 'LIVE' as const, createdAt: join.createdAt, user: displayUser(join.user) })),
    ...comments.map(comment => ({ id: `live-comment-${comment.id}`, type: 'COMMENT' as const, source: 'LIVE' as const, createdAt: comment.createdAt, body: comment.body, latitude: comment.latitude, longitude: comment.longitude, user: comment.user })),
    ...session.highFives.map(highFive => ({ id: `${session.id}-high-five-${highFive.userId}`, type: 'HIGH_FIVE' as const, source: 'LIVE' as const, createdAt: highFive.createdAt, user: displayUser(highFive.user) })),
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
    joinedByViewer: session.joins.some(join => join.userId === viewerId && join.active),
    highFivedByViewer: session.highFives.some(highFive => highFive.userId === viewerId),
    distanceKm: 0,
    user: displayUser(session.user),
    comments,
    latestComment: comments.at(-1) ?? null,
    timeline,
  };
}

liveRouter.post('/start', authenticate, async (req, res, next) => {
  try {
    const data = startLiveSchema.parse(req.body);
    const existing = await prisma.liveActivity.findFirst({ where: { userId: req.currentUser!.id, clientId: data.clientId } });
    if (existing) return res.status(200).json({ live: await detailView(existing.id, req.currentUser!.id), duplicate: true });
    await prisma.liveActivity.updateMany({ where: { userId: req.currentUser!.id, active: true }, data: { active: false, endedAt: new Date() } });
    const live = await prisma.liveActivity.create({ data: { userId: req.currentUser!.id, clientId: data.clientId, type: data.type, visibility: data.visibility, latitude: approximate(data.latitude), longitude: approximate(data.longitude), durationS: data.durationS, distanceM: Math.round(data.distanceM), speedKmh: data.speedKmh ?? 0, paused: data.paused ?? false } });
    res.status(201).json({ live: await detailView(live.id, req.currentUser!.id), duplicate: false });
  } catch (error) { next(error); }
});

liveRouter.get('/current', authenticate, async (req, res, next) => {
  try {
    const live = await prisma.liveActivity.findFirst({ where: { userId: req.currentUser!.id, active: true }, orderBy: { startedAt: 'desc' } });
    res.json({ live: live ? await detailView(live.id, req.currentUser!.id) : null });
  } catch (error) { next(error); }
});

liveRouter.put('/current', authenticate, async (req, res, next) => {
  try {
    const data = liveUpdateSchema.parse(req.body);
    const live = await prisma.liveActivity.findFirst({ where: { userId: req.currentUser!.id, active: true }, orderBy: { startedAt: 'desc' } });
    if (!live) throw new ApiError(404, 'No active live activity');
    const updated = await prisma.liveActivity.update({ where: { id: live.id }, data: { ...(data.type ? { type: data.type } : {}), ...(data.visibility ? { visibility: data.visibility } : {}), ...(data.speedKmh !== undefined ? { speedKmh: data.speedKmh } : {}), ...(data.paused !== undefined ? { paused: data.paused } : {}), latitude: approximate(data.latitude), longitude: approximate(data.longitude), durationS: data.durationS, distanceM: Math.round(data.distanceM) } });
    res.json({ live: await detailView(updated.id, req.currentUser!.id) });
  } catch (error) { next(error); }
});

liveRouter.delete('/current', authenticate, async (req, res, next) => {
  try {
    const live = await prisma.liveActivity.findFirst({ where: { userId: req.currentUser!.id, active: true }, orderBy: { startedAt: 'desc' } });
    if (!live) throw new ApiError(404, 'No active live activity');
    await prisma.liveActivity.update({ where: { id: live.id }, data: { active: false, endedAt: new Date() } });
    res.json({ live: await detailView(live.id, req.currentUser!.id) });
  } catch (error) { next(error); }
});

liveRouter.get('/nearby', authenticate, async (req, res, next) => {
  try {
    const q = nearbySchema.parse(req.query);
    const bounds = range(q.latitude, q.longitude, q.radiusKm);
    const freshSince = new Date(Date.now() - 120_000);
    const sessions = await prisma.liveActivity.findMany({
      where: {
        active: true,
        lastUpdatedAt: { gte: freshSince },
        latitude: { gte: q.latitude - bounds.dLat, lte: q.latitude + bounds.dLat },
        longitude: { gte: q.longitude - bounds.dLng, lte: q.longitude + bounds.dLng },
        OR: [{ userId: req.currentUser!.id }, { visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS', user: { followers: { some: { followerId: req.currentUser!.id } } } }],
      },
      include: summaryInclude(req.currentUser!.id),
      take: 30,
      orderBy: { lastUpdatedAt: 'desc' },
    });
    const live = sessions
      .map(session => summaryView(session, req.currentUser!.id, [q.latitude, q.longitude]))
      .filter(session => session.distanceKm <= q.radiusKm);
    res.json({ live });
  } catch (error) { next(error); }
});

liveRouter.get('/:id', authenticate, async (req, res, next) => {
  try { res.json({ live: await detailView(z.string().cuid().parse(req.params.id), req.currentUser!.id) }); }
  catch (error) { next(error); }
});

liveRouter.post('/:id/join', authenticate, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const session = await prisma.liveActivity.findUnique({ where: { id } });
    if (!session || !session.active) throw new ApiError(404, 'Live activity not found');
    if (session.userId === req.currentUser!.id) throw new ApiError(400, 'You cannot join your own live activity');
    if (!await visible(session, req.currentUser!.id)) throw new ApiError(403, 'You cannot join this live activity');
    await prisma.liveActivityJoin.upsert({ where: { liveActivityId_userId: { liveActivityId: id, userId: req.currentUser!.id } }, update: { active: true, leftAt: null }, create: { liveActivityId: id, userId: req.currentUser!.id } });
    const joinCount = await prisma.liveActivityJoin.count({ where: { liveActivityId: id, active: true } });
    res.status(201).json({ joined: true, joinCount });
  } catch (error) { next(error); }
});

liveRouter.delete('/:id/join', authenticate, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await prisma.liveActivityJoin.updateMany({ where: { liveActivityId: id, userId: req.currentUser!.id, active: true }, data: { active: false, leftAt: new Date() } });
    const joinCount = await prisma.liveActivityJoin.count({ where: { liveActivityId: id, active: true } });
    res.json({ joined: false, joinCount });
  } catch (error) { next(error); }
});

liveRouter.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const session = await prisma.liveActivity.findUnique({ where: { id } });
    if (!session || !session.active) throw new ApiError(404, 'This live activity has ended');
    if (!await visible(session, req.currentUser!.id)) throw new ApiError(403, 'You cannot comment on this live activity');
    const { body } = liveCommentSchema.parse(req.body);
    const comment = await prisma.liveActivityComment.create({
      data: { liveActivityId: id, userId: req.currentUser!.id, body, latitude: session.latitude, longitude: session.longitude },
      include: { user: { select: publicUser } },
    });
    res.status(201).json({ comment: { id: comment.id, body: comment.body, latitude: comment.latitude, longitude: comment.longitude, createdAt: comment.createdAt, userId: comment.userId, isOwner: true, user: displayUser(comment.user) } });
  } catch (error) { next(error); }
});

liveRouter.post('/:id/high-five', authenticate, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const session = await prisma.liveActivity.findUnique({ where: { id } });
    if (!session || !session.active) throw new ApiError(404, 'This live activity has ended');
    if (session.userId === req.currentUser!.id) throw new ApiError(400, 'You cannot high-five your own live activity');
    if (!await visible(session, req.currentUser!.id)) throw new ApiError(403, 'You cannot high-five this live activity');
    await prisma.liveActivityHighFive.upsert({ where: { liveActivityId_userId: { liveActivityId: id, userId: req.currentUser!.id } }, update: {}, create: { liveActivityId: id, userId: req.currentUser!.id } });
    const highFiveCount = await prisma.liveActivityHighFive.count({ where: { liveActivityId: id } });
    res.status(201).json({ highFived: true, highFiveCount });
  } catch (error) { next(error); }
});

liveRouter.delete('/:id/high-five', authenticate, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await prisma.liveActivityHighFive.deleteMany({ where: { liveActivityId: id, userId: req.currentUser!.id } });
    const highFiveCount = await prisma.liveActivityHighFive.count({ where: { liveActivityId: id } });
    res.json({ highFived: false, highFiveCount });
  } catch (error) { next(error); }
});
