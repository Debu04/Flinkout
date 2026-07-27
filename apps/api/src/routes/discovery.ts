import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export const discoveryRouter = Router();
const locationSchema = z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) });
const querySchema = locationSchema.extend({ radiusKm: z.coerce.number().min(1).max(50).default(10), limit: z.coerce.number().int().min(1).max(30).default(20) });
const roundApproximate = (value: number) => Math.round(value * 100) / 100;
function bounds(latitude: number, longitude: number, radiusKm: number) { const lat = radiusKm / 111; const lng = radiusKm / (111 * Math.max(Math.cos(latitude * Math.PI / 180), 0.1)); return { minLat: latitude - lat, maxLat: latitude + lat, minLng: longitude - lng, maxLng: longitude + lng }; }
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) { const rad = (value: number) => value * Math.PI / 180; const x = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
function sampleRoute(route: unknown) { if (!Array.isArray(route)) return null; const step = Math.max(1, Math.ceil(route.length / 80)); return route.filter((_, index) => index === 0 || index === route.length - 1 || index % step === 0); }

discoveryRouter.put('/location', authenticate, async (req, res, next) => {
  try {
    const location = locationSchema.parse(req.body);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: req.currentUser!.id }, select: { discoverable: true } });
    if (!profile.discoverable) return res.status(200).json({ saved: false, message: 'Nearby discoverability is disabled' });
    await prisma.profile.update({ where: { userId: req.currentUser!.id }, data: { discoveryLat: roundApproximate(location.latitude), discoveryLng: roundApproximate(location.longitude), discoveryUpdatedAt: new Date() } });
    res.json({ saved: true, precision: 'approximately 1 km' });
  } catch (error) { next(error); }
});

discoveryRouter.get('/nearby', authenticate, async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query); const box = bounds(query.latitude, query.longitude, query.radiusKm);
    const people = await prisma.user.findMany({ where: { id: { not: req.currentUser!.id }, profile: { is: { discoverable: true, profileVisibility: 'PUBLIC', discoveryLat: { gte: box.minLat, lte: box.maxLat }, discoveryLng: { gte: box.minLng, lte: box.maxLng } } } }, select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, discoveryLat: true, discoveryLng: true } } }, take: query.limit });
    const activities = await prisma.activity.findMany({
      where: { visibility: 'PUBLIC', startLat: { gte: box.minLat, lte: box.maxLat }, startLng: { gte: box.minLng, lte: box.maxLng } },
      include: { user: { select: { id: true, username: true, profile: { select: { displayName: true, photoUrl: true, routeVisibility: true } } } } },
      orderBy: { startedAt: 'desc' }, take: query.limit * 2,
    });
    const nearbyPeople = people.map(person => ({ id: person.id, username: person.username, displayName: person.profile!.displayName, photoUrl: person.profile!.photoUrl, latitude: person.profile!.discoveryLat!, longitude: person.profile!.discoveryLng!, distanceKm: distanceKm(query.latitude, query.longitude, person.profile!.discoveryLat!, person.profile!.discoveryLng!) })).filter(person => person.distanceKm <= query.radiusKm).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, query.limit);
    const nearbyActivities = activities.map(activity => ({ id: activity.id, type: activity.type, startedAt: activity.startedAt, distanceM: activity.distanceM, latitude: activity.startLat!, longitude: activity.startLng!, distanceKm: distanceKm(query.latitude, query.longitude, activity.startLat!, activity.startLng!), route: activity.user.profile?.routeVisibility === 'PUBLIC' ? sampleRoute(activity.route) : null, user: { id: activity.user.id, username: activity.user.username, displayName: activity.user.profile?.displayName ?? activity.user.username, photoUrl: activity.user.profile?.photoUrl ?? null } })).filter(activity => activity.distanceKm <= query.radiusKm).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, query.limit);
    res.json({ precision: 'approximate', people: nearbyPeople, activities: nearbyActivities });
  } catch (error) { next(error); }
});
