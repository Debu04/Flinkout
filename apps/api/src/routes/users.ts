import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export const usersRouter = Router();
const profileSchema = z.object({ displayName: z.string().trim().min(1).max(60), bio: z.string().trim().max(280).nullable().optional(), photoUrl: z.string().url().max(2048).nullable().optional(), profileVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(), routeVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(), discoverable: z.boolean().optional() });

function profileView(user: { id: string; username: string; profile: unknown }, isFollowing = false, isSelf = false) { return { id: user.id, username: user.username, profile: user.profile, isFollowing, isSelf }; }
function sampledRoute(route: Prisma.JsonValue | null) { const points = Array.isArray(route) ? route : undefined; if (!points || points.length <= 100) return route; const step = Math.ceil(points.length / 100); return points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0); }

usersRouter.get('/search', authenticate, async (req, res, next) => {
  try {
    const q = z.string().trim().min(1).max(30).parse(req.query.q);
    const users = await prisma.user.findMany({ where: { id: { not: req.currentUser!.id }, OR: [{ username: { contains: q } }, { profile: { displayName: { contains: q } } }] }, include: { profile: true }, take: 20 });
    res.json({ users: users.map((user) => profileView(user)) });
  } catch (error) { next(error); }
});

usersRouter.get('/:username/activities', authenticate, async (req, res, next) => {
  try {
    const username = z.string().regex(/^[a-z0-9_]{3,30}$/).parse(req.params.username).toLowerCase();
    const user = await prisma.user.findUnique({ where: { username }, include: { profile: true } });
    if (!user) throw new ApiError(404, 'User not found');
    const isSelf = user.id === req.currentUser!.id;
    const follows = isSelf ? false : Boolean(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.currentUser!.id, followingId: user.id } } }));
    if (!isSelf && (user.profile?.profileVisibility === 'PRIVATE' || (user.profile?.profileVisibility === 'FOLLOWERS' && !follows))) throw new ApiError(403, 'This profile is private');
    const limit = z.coerce.number().int().min(1).max(30).default(12).parse(req.query.limit);
    const where: Prisma.ActivityWhereInput = isSelf ? { userId: user.id } : follows ? { userId: user.id, visibility: { in: ['PUBLIC', 'FOLLOWERS'] } } : { userId: user.id, visibility: 'PUBLIC' };
    const activities = await prisma.activity.findMany({ where, include: { reactions: { where: { userId: req.currentUser!.id }, select: { userId: true } }, _count: { select: { reactions: true, comments: true } } }, orderBy: { startedAt: 'desc' }, take: limit });
    const showRoute = isSelf || user.profile?.routeVisibility === 'PUBLIC' || (follows && user.profile?.routeVisibility === 'FOLLOWERS');
    res.json({ activities: activities.map(activity => ({ id: activity.id, type: activity.type, visibility: activity.visibility, startedAt: activity.startedAt, endedAt: activity.endedAt, durationS: activity.durationS, distanceM: activity.distanceM, route: showRoute ? sampledRoute(activity.route) : null, user: { id: user.id, username: user.username, profile: { displayName: user.profile?.displayName ?? user.username, photoUrl: user.profile?.photoUrl ?? null } }, reactionCount: activity._count.reactions, commentCount: activity._count.comments, reactedByViewer: activity.reactions.length > 0 })) });
  } catch (error) { next(error); }
});

usersRouter.get('/:username', authenticate, async (req, res, next) => {
  try {
    const username = z.string().regex(/^[a-z0-9_]{3,30}$/).parse(req.params.username).toLowerCase();
    const user = await prisma.user.findUnique({ where: { username }, include: { profile: true } });
    if (!user) throw new ApiError(404, 'User not found');
    const isSelf = user.id === req.currentUser!.id;
    const relation = isSelf ? null : await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.currentUser!.id, followingId: user.id } } });
    if (!isSelf && (user.profile?.profileVisibility === 'PRIVATE' || (user.profile?.profileVisibility === 'FOLLOWERS' && !relation))) throw new ApiError(403, 'This profile is private');
    res.json({ user: profileView(user, Boolean(relation), isSelf) });
  } catch (error) { next(error); }
});

usersRouter.patch('/me/profile', authenticate, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    const profile = await prisma.profile.update({ where: { userId: req.currentUser!.id }, data: data.discoverable === false ? { ...data, discoveryLat: null, discoveryLng: null, discoveryUpdatedAt: null } : data });
    res.json({ profile });
  } catch (error) { next(error); }
});

usersRouter.post('/:username/follow', authenticate, async (req, res, next) => {
  try {
    const username = z.string().regex(/^[a-z0-9_]{3,30}$/).parse(req.params.username).toLowerCase();
    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) throw new ApiError(404, 'User not found');
    if (target.id === req.currentUser!.id) throw new ApiError(400, 'You cannot follow yourself');
    await prisma.follow.upsert({ where: { followerId_followingId: { followerId: req.currentUser!.id, followingId: target.id } }, update: {}, create: { followerId: req.currentUser!.id, followingId: target.id } });
    res.status(201).json({ following: true });
  } catch (error) { next(error); }
});

usersRouter.delete('/:username/follow', authenticate, async (req, res, next) => {
  try {
    const username = z.string().regex(/^[a-z0-9_]{3,30}$/).parse(req.params.username).toLowerCase();
    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) throw new ApiError(404, 'User not found');
    await prisma.follow.deleteMany({ where: { followerId: req.currentUser!.id, followingId: target.id } });
    res.status(204).send();
  } catch (error) { next(error); }
});
