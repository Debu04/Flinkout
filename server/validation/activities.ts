import { z } from 'zod';

const point = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative().nullable(),
  altitude: z.number().finite().nullable(),
  speed: z.number().finite().nullable(),
  recordedAt: z.string().datetime(),
});

export const syncActivitySchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['WALK', 'RUN', 'RIDE', 'HIKE']),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationS: z.number().int().nonnegative().max(86_400),
  distanceM: z.number().nonnegative().max(2_000_000),
  steps: z.number().int().nonnegative().max(200_000).default(0),
  distanceSource: z.enum(['GPS', 'MOTION', 'FUSED', 'NONE']).default('NONE'),
  route: z.array(point).max(25_000),
}).superRefine((value, context) => {
  if (Date.parse(value.endedAt) < Date.parse(value.startedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Activity cannot end before it starts',
      path: ['endedAt'],
    });
  }
});
