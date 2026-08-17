import { z } from 'zod';

const point = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative().nullable(),
  altitude: z.number().finite().nullable(),
  altitudeAccuracy: z.number().nonnegative().nullable().optional(),
  speed: z.number().finite().nullable(),
  startsNewSegment: z.boolean().optional(),
  recordedAt: z.string().datetime(),
});

export const syncActivitySchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['WALK', 'RUN', 'RIDE', 'HIKE']),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationS: z.number().int().nonnegative().max(86_400),
  movingTimeS: z.number().int().nonnegative().max(86_400).default(0),
  distanceM: z.number().nonnegative().max(2_000_000),
  steps: z.number().int().nonnegative().max(200_000).default(0),
  averagePaceSPerKm: z.number().positive().max(7_200).nullable().default(null),
  caloriesKcal: z.number().nonnegative().max(20_000).default(0),
  currentElevationM: z.number().gte(-500).lte(10_000).nullable().default(null),
  elevationGainM: z.number().nonnegative().max(100_000).default(0),
  elevationLossM: z.number().nonnegative().max(100_000).default(0),
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
