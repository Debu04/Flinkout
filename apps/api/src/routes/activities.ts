import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { aggregateHeatRoute } from './heatmap.js';

export const activitiesRouter = Router();
const point = z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180), accuracy: z.number().nonnegative().nullable(), altitude: z.number().finite().nullable(), speed: z.number().finite().nullable(), recordedAt: z.string().datetime() });
export const syncActivitySchema = z.object({ clientId: z.string().uuid(), type: z.enum(['WALK', 'RUN', 'RIDE', 'HIKE']), visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']), startedAt: z.string().datetime(), endedAt: z.string().datetime(), durationS: z.number().int().nonnegative().max(86_400), distanceM: z.number().nonnegative().max(2_000_000), steps: z.number().int().nonnegative().max(200_000).default(0), distanceSource: z.enum(['GPS', 'MOTION', 'FUSED', 'NONE']).default('NONE'), route: z.array(point).max(25_000) }).superRefine((value, context) => { if (Date.parse(value.endedAt) < Date.parse(value.startedAt)) context.addIssue({ code: 'custom', message: 'Activity cannot end before it starts', path: ['endedAt'] }); });
const pageSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(30).default(15) });
const activityInclude = (viewerId: string) => ({ user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, routeVisibility: true } } } }, reactions: { where: { userId: viewerId }, select: { userId: true } }, _count: { select: { reactions: true, comments: true } } }) satisfies Prisma.ActivityInclude;
type ActivityWithSocial = Prisma.ActivityGetPayload<{ include: ReturnType<typeof activityInclude> }>;
const timelineUserSelect = { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } satisfies Prisma.UserSelect;
const timelineUser = (user: { id: string; username: string; profile: { displayName: string; photoUrl: string | null } | null }) => ({ id: user.id, username: user.username, displayName: user.profile?.displayName ?? user.username, photoUrl: user.profile?.photoUrl ?? null });

function encodeCursor(activity: { id: string; startedAt: Date }) { return Buffer.from(JSON.stringify({ id: activity.id, startedAt: activity.startedAt.toISOString() })).toString('base64url'); }
function decodeCursor(cursor?: string) { if (!cursor) return undefined; try { const value = z.object({ id: z.string(), startedAt: z.string().datetime() }).parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())); return { id: value.id, startedAt: new Date(value.startedAt) }; } catch { throw new ApiError(400, 'Invalid feed cursor'); } }
function previewRoute(route: Prisma.JsonValue | null) { if (!Array.isArray(route) || route.length <= 100) return route; const step = Math.ceil(route.length / 100); return route.filter((_, index) => index === 0 || index === route.length - 1 || index % step === 0); }
async function timelineFor(activity: ActivityWithSocial) {
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
    prisma.activityComment.findMany({ where: { activityId: activity.id }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: timelineUserSelect } } }),
    prisma.activityReaction.findMany({ where: { activityId: activity.id }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: timelineUserSelect } } }),
  ]);
  return [
    { id: `${activity.id}-start`, type: 'START' as const, source: 'ACTIVITY' as const, createdAt: activity.startedAt, user: timelineUser(activity.user) },
    ...(live ? [
      { id: `${live.id}-live-start`, type: 'LIVE_STARTED' as const, source: 'LIVE' as const, createdAt: live.startedAt, user: timelineUser(live.user) },
      ...live.joins.map(join => ({ id: `${live.id}-join-${join.userId}`, type: 'JOINED' as const, source: 'LIVE' as const, createdAt: join.createdAt, user: timelineUser(join.user) })),
      ...live.comments.map(comment => ({ id: `live-comment-${comment.id}`, type: 'COMMENT' as const, source: 'LIVE' as const, createdAt: comment.createdAt, body: comment.body, latitude: comment.latitude, longitude: comment.longitude, user: timelineUser(comment.user) })),
      ...live.highFives.map(highFive => ({ id: `${live.id}-high-five-${highFive.userId}`, type: 'HIGH_FIVE' as const, source: 'LIVE' as const, createdAt: highFive.createdAt, user: timelineUser(highFive.user) })),
      ...(live.endedAt ? [{ id: `${live.id}-live-end`, type: 'LIVE_ENDED' as const, source: 'LIVE' as const, createdAt: live.endedAt, user: timelineUser(live.user) }] : []),
    ] : []),
    ...comments.map(comment => ({ id: `activity-comment-${comment.id}`, type: 'COMMENT' as const, source: 'ACTIVITY' as const, createdAt: comment.createdAt, body: comment.body, user: timelineUser(comment.user) })),
    ...reactions.map(reaction => ({ id: `activity-high-five-${reaction.userId}`, type: 'HIGH_FIVE' as const, source: 'ACTIVITY' as const, createdAt: reaction.createdAt, user: timelineUser(reaction.user) })),
    ...(activity.endedAt ? [{ id: `${activity.id}-finish`, type: 'FINISH' as const, source: 'ACTIVITY' as const, createdAt: activity.endedAt, user: timelineUser(activity.user) }] : []),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
async function view(activity: ActivityWithSocial, viewerId: string, preview = false) {
  const routeVisibility = activity.user.profile?.routeVisibility;
  const canSeeRoute = activity.userId === viewerId || routeVisibility === 'PUBLIC' || (routeVisibility === 'FOLLOWERS' && Boolean(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: activity.userId } } })));
  return { id: activity.id, clientId: activity.clientId, type: activity.type, visibility: activity.visibility, startedAt: activity.startedAt, endedAt: activity.endedAt, durationS: activity.durationS, distanceM: activity.distanceM, steps: activity.steps, distanceSource: activity.distanceSource, route: canSeeRoute ? (preview ? previewRoute(activity.route) : activity.route) : null, user: activity.user, reactionCount: activity._count.reactions, commentCount: activity._count.comments, reactedByViewer: activity.reactions.length > 0, ...(preview ? {} : { timeline: await timelineFor(activity) }) };
}
async function canView(activity: { userId: string; visibility: string }, viewerId: string) { if (activity.userId === viewerId || activity.visibility === 'PUBLIC') return true; if (activity.visibility !== 'FOLLOWERS') return false; return Boolean(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: activity.userId } } })); }
async function visibleActivity(id: string, viewerId: string) { const activity = await prisma.activity.findUnique({ where: { id }, include: activityInclude(viewerId) }); if (!activity) throw new ApiError(404, 'Activity not found'); if (!await canView(activity, viewerId)) throw new ApiError(403, 'You cannot view this activity'); return activity; }

activitiesRouter.post('/sync', authenticate, async (req, res, next) => { try { const activity = syncActivitySchema.parse(req.body); const existing = await prisma.activity.findUnique({ where: { userId_clientId: { userId: req.currentUser!.id, clientId: activity.clientId } } }); if (existing) return res.status(200).json({ activityId: existing.id, clientId: existing.clientId, status: 'synced', duplicate: true }); const start = activity.route[0]; const created = await prisma.activity.upsert({ where: { userId_clientId: { userId: req.currentUser!.id, clientId: activity.clientId } }, update: {}, create: { userId: req.currentUser!.id, clientId: activity.clientId, type: activity.type, visibility: activity.visibility, startedAt: new Date(activity.startedAt), endedAt: new Date(activity.endedAt), durationS: activity.durationS, distanceM: Math.round(activity.distanceM), steps: activity.steps, distanceSource: activity.distanceSource, startLat: start ? Math.round(start.latitude * 100) / 100 : null, startLng: start ? Math.round(start.longitude * 100) / 100 : null, route: activity.route } }); const profile = await prisma.profile.findUnique({ where: { userId: req.currentUser!.id }, select: { routeVisibility: true } }); if (activity.visibility === 'PUBLIC' && profile?.routeVisibility === 'PUBLIC') await aggregateHeatRoute(activity.route); return res.status(201).json({ activityId: created.id, clientId: created.clientId, status: 'synced', duplicate: false }); } catch (error) { next(error); } });

activitiesRouter.get('/feed', authenticate, async (req, res, next) => { try { const { cursor, limit } = pageSchema.parse(req.query); const after = decodeCursor(cursor); const visibility: Prisma.ActivityWhereInput = { OR: [{ userId: req.currentUser!.id }, { visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS', user: { followers: { some: { followerId: req.currentUser!.id } } } }] }; const cursorFilter: Prisma.ActivityWhereInput | undefined = after ? { OR: [{ startedAt: { lt: after.startedAt } }, { startedAt: after.startedAt, id: { lt: after.id } }] } : undefined; const activities = await prisma.activity.findMany({ where: cursorFilter ? { AND: [visibility, cursorFilter] } : visibility, include: activityInclude(req.currentUser!.id), orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: limit + 1 }); const hasMore = activities.length > limit; const items = activities.slice(0, limit); res.json({ activities: await Promise.all(items.map(activity => view(activity, req.currentUser!.id, true))), nextCursor: hasMore ? encodeCursor(items.at(-1)!) : null }); } catch (error) { next(error); } });

activitiesRouter.get('/:id', authenticate, async (req, res, next) => { try { const id = z.string().cuid().parse(req.params.id); res.json({ activity: await view(await visibleActivity(id, req.currentUser!.id), req.currentUser!.id) }); } catch (error) { next(error); } });

activitiesRouter.post('/:id/reactions', authenticate, async (req, res, next) => { try { const activity = await visibleActivity(z.string().cuid().parse(req.params.id), req.currentUser!.id); await prisma.activityReaction.upsert({ where: { activityId_userId: { activityId: activity.id, userId: req.currentUser!.id } }, update: {}, create: { activityId: activity.id, userId: req.currentUser!.id } }); const count = await prisma.activityReaction.count({ where: { activityId: activity.id } }); res.status(201).json({ reacted: true, reactionCount: count }); } catch (error) { next(error); } });
activitiesRouter.delete('/:id/reactions', authenticate, async (req, res, next) => { try { const activity = await visibleActivity(z.string().cuid().parse(req.params.id), req.currentUser!.id); await prisma.activityReaction.deleteMany({ where: { activityId: activity.id, userId: req.currentUser!.id } }); const count = await prisma.activityReaction.count({ where: { activityId: activity.id } }); res.json({ reacted: false, reactionCount: count }); } catch (error) { next(error); } });

activitiesRouter.get('/:id/comments', authenticate, async (req, res, next) => { try { const activity = await visibleActivity(z.string().cuid().parse(req.params.id), req.currentUser!.id); const { cursor, limit } = pageSchema.parse(req.query); const comments = await prisma.activityComment.findMany({ where: { activityId: activity.id }, include: { user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: z.string().cuid().parse(cursor) }, skip: 1 } : {}) }); const hasMore = comments.length > limit; const items = comments.slice(0, limit); res.json({ comments: items.map(comment => ({ ...comment, isOwner: comment.userId === req.currentUser!.id })), nextCursor: hasMore ? items.at(-1)!.id : null }); } catch (error) { next(error); } });
activitiesRouter.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const activity = await visibleActivity(z.string().cuid().parse(req.params.id), req.currentUser!.id);
    const body = z.object({ body: z.string().trim().min(1).max(500) }).parse(req.body).body;
    const comment = await prisma.activityComment.create({
      data: { activityId: activity.id, userId: req.currentUser!.id, body },
      include: { user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true } } } } },
    });
    res.status(201).json({ comment: { ...comment, isOwner: true } });
  } catch (error) { next(error); }
});
activitiesRouter.delete('/:activityId/comments/:commentId', authenticate, async (req, res, next) => { try { const activityId = z.string().cuid().parse(req.params.activityId); await visibleActivity(activityId, req.currentUser!.id); const commentId = z.string().cuid().parse(req.params.commentId); const result = await prisma.activityComment.deleteMany({ where: { id: commentId, activityId, userId: req.currentUser!.id } }); if (!result.count) throw new ApiError(404, 'Comment not found'); res.status(204).send(); } catch (error) { next(error); } });
