import { describe, expect, it } from 'vitest';
import { distanceKm } from '../domain/geo';
import { syncActivitySchema } from './activities';
import { liveCommentSchema, liveUpdateSchema, startLiveSchema } from './live';

const activity = {
  clientId: '00000000-0000-4000-8000-000000000000',
  type: 'RUN',
  visibility: 'PRIVATE',
  startedAt: '2026-07-20T10:00:00.000Z',
  endedAt: '2026-07-20T10:05:00.000Z',
  durationS: 300,
  distanceM: 1000,
  steps: 1150,
  distanceSource: 'FUSED',
  route: [{
    latitude: 20.5937,
    longitude: 78.9629,
    accuracy: 8,
    altitude: null,
    speed: null,
    recordedAt: '2026-07-20T10:00:00.000Z',
  }],
};

describe('activity sync API contract', () => {
  it('accepts complete and legacy local activity payloads', () => {
    expect(syncActivitySchema.safeParse(activity).success).toBe(true);
    const legacy = syncActivitySchema.safeParse({ ...activity, steps: undefined, distanceSource: undefined });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data).toMatchObject({ steps: 0, distanceSource: 'NONE' });
  });

  it('rejects malformed coordinates, reversed times, and oversized routes', () => {
    expect(syncActivitySchema.safeParse({ ...activity, route: [{ ...activity.route[0], latitude: 91 }] }).success).toBe(false);
    expect(syncActivitySchema.safeParse({ ...activity, endedAt: '2026-07-20T09:00:00.000Z' }).success).toBe(false);
    expect(syncActivitySchema.safeParse({ ...activity, route: Array.from({ length: 25_001 }, () => activity.route[0]) }).success).toBe(false);
  });
});

describe('nearby and live API contracts', () => {
  it('calculates an approximately one-kilometre latitude difference', () => {
    expect(distanceKm(0, 0, 0.008993, 0)).toBeCloseTo(1, 1);
  });

  it('accepts valid live sessions and bounds privacy, speed, and comments', () => {
    const live = {
      clientId: activity.clientId,
      type: 'RUN',
      visibility: 'FOLLOWERS',
      latitude: 20.5937,
      longitude: 78.9629,
      durationS: 120,
      distanceM: 650,
      speedKmh: 11.4,
      paused: false,
    };
    expect(startLiveSchema.safeParse(live).success).toBe(true);
    expect(startLiveSchema.safeParse({ ...live, visibility: 'PRIVATE' }).success).toBe(false);
    expect(liveUpdateSchema.safeParse({ ...live, speedKmh: 240 }).success).toBe(false);
    expect(liveCommentSchema.safeParse({ body: 'Loose gravel near the east turn.' }).success).toBe(true);
    expect(liveCommentSchema.safeParse({ body: 'x'.repeat(501) }).success).toBe(false);
  });
});
