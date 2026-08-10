import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AuthContext } from '../auth/session';
import { prisma } from '../db/prisma';
import { distanceKm } from '../domain/geo';
import { readJson } from '../http/route';
import { profileOwnerKey } from '../policies/ownership';

const locationSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});
const querySchema = locationSchema.extend({
  radiusKm: z.coerce.number().min(1).max(50).default(10),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
const roundApproximate = (value: number) => Math.round(value * 100) / 100;

function bounds(latitude: number, longitude: number, radiusKm: number) {
  const lat = radiusKm / 111;
  const lng = radiusKm / (111 * Math.max(Math.cos(latitude * Math.PI / 180), 0.1));
  return {
    minLat: latitude - lat,
    maxLat: latitude + lat,
    minLng: longitude - lng,
    maxLng: longitude + lng,
  };
}

function sampleRoute(route: unknown) {
  if (!Array.isArray(route)) return null;
  const step = Math.max(1, Math.ceil(route.length / 80));
  return route.filter((_, index) => index === 0 || index === route.length - 1 || index % step === 0);
}

export async function updateDiscoveryLocation(request: NextRequest, auth: AuthContext) {
  const location = locationSchema.parse(await readJson(request));
  const profile = await prisma.profile.findUniqueOrThrow({
    where: profileOwnerKey(auth.user.id),
    select: { discoverable: true },
  });
  if (!profile.discoverable) {
    return NextResponse.json({ saved: false, message: 'Nearby discoverability is disabled' });
  }
  await prisma.profile.update({
    where: profileOwnerKey(auth.user.id),
    data: {
      discoveryLat: roundApproximate(location.latitude),
      discoveryLng: roundApproximate(location.longitude),
      discoveryUpdatedAt: new Date(),
    },
  });
  return NextResponse.json({ saved: true, precision: 'approximately 1 km' });
}

export async function getNearby(request: NextRequest, auth: AuthContext) {
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const box = bounds(query.latitude, query.longitude, query.radiusKm);
  const people = await prisma.user.findMany({
    where: {
      id: { not: auth.user.id },
      profile: {
        is: {
          discoverable: true,
          profileVisibility: 'PUBLIC',
          discoveryLat: { gte: box.minLat, lte: box.maxLat },
          discoveryLng: { gte: box.minLng, lte: box.maxLng },
        },
      },
    },
    select: {
      id: true,
      username: true,
      profile: { select: { displayName: true, photoUrl: true, discoveryLat: true, discoveryLng: true } },
    },
    take: query.limit,
  });
  const activities = await prisma.activity.findMany({
    where: {
      visibility: 'PUBLIC',
      startLat: { gte: box.minLat, lte: box.maxLat },
      startLng: { gte: box.minLng, lte: box.maxLng },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          profile: { select: { displayName: true, photoUrl: true, routeVisibility: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: query.limit * 2,
  });
  const nearbyPeople = people.map((person) => ({
    id: person.id,
    username: person.username,
    displayName: person.profile!.displayName,
    photoUrl: person.profile!.photoUrl,
    latitude: person.profile!.discoveryLat!,
    longitude: person.profile!.discoveryLng!,
    distanceKm: distanceKm(
      query.latitude,
      query.longitude,
      person.profile!.discoveryLat!,
      person.profile!.discoveryLng!,
    ),
  })).filter((person) => person.distanceKm <= query.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, query.limit);
  const nearbyActivities = activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    startedAt: activity.startedAt,
    distanceM: activity.distanceM,
    latitude: activity.startLat!,
    longitude: activity.startLng!,
    distanceKm: distanceKm(
      query.latitude,
      query.longitude,
      activity.startLat!,
      activity.startLng!,
    ),
    route: activity.user.profile?.routeVisibility === 'PUBLIC'
      ? sampleRoute(activity.route)
      : null,
    user: {
      id: activity.user.id,
      username: activity.user.username,
      displayName: activity.user.profile?.displayName ?? activity.user.username,
      photoUrl: activity.user.profile?.photoUrl ?? null,
    },
  })).filter((activity) => activity.distanceKm <= query.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, query.limit);
  return NextResponse.json({
    precision: 'approximate',
    people: nearbyPeople,
    activities: nearbyActivities,
  });
}
