import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { heatCell } from '../domain/geo';

const heatDb = prisma as typeof prisma & { activityHeatCell: any };
const query = z.object({
  minLat: z.coerce.number().gte(-90).lte(90),
  maxLat: z.coerce.number().gte(-90).lte(90),
  minLng: z.coerce.number().gte(-180).lte(180),
  maxLng: z.coerce.number().gte(-180).lte(180),
  zoom: z.coerce.number().int().min(1).max(20).default(12),
}).refine((value) => value.minLat < value.maxLat && value.minLng < value.maxLng);

export async function aggregateHeatRoute(route: Array<{ latitude: number; longitude: number }>) {
  const cells = new Map(route.map((point) => {
    const cell = heatCell(point.latitude, point.longitude);
    return [cell.gridKey, cell];
  }));
  await Promise.all([...cells.values()].map((cell) => heatDb.activityHeatCell.upsert({
    where: { gridKey: cell.gridKey },
    update: { activityCount: { increment: 1 } },
    create: { ...cell, activityCount: 1 },
  })));
}

export async function getHeatmap(request: NextRequest) {
  const area = query.parse(Object.fromEntries(request.nextUrl.searchParams));
  const cells = await heatDb.activityHeatCell.findMany({
    where: {
      latitude: { gte: area.minLat, lte: area.maxLat },
      longitude: { gte: area.minLng, lte: area.maxLng },
      activityCount: { gte: 5 },
    },
    select: { latitude: true, longitude: true, activityCount: true },
    orderBy: { activityCount: 'desc' },
    take: area.zoom < 9 ? 80 : 250,
  });
  return NextResponse.json({ cells, minimumActivities: 5, source: 'pre-aggregated' });
}
