import { z } from 'zod';

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

export const liveCommentSchema = z.object({
  body: z.string().trim().min(1).max(500),
});
