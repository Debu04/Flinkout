import { describe, expect, it } from 'vitest';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/flinkout_test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-never-used-in-production';
process.env.WEB_ORIGIN = 'http://localhost:3000';
const { syncActivitySchema } = await import('./activities.js');
const { distanceKm } = await import('./discovery.js');
const { liveCommentSchema, liveUpdateSchema, startLiveSchema } = await import('./live.js');

const activity = { clientId: '00000000-0000-4000-8000-000000000000', type: 'RUN', visibility: 'PRIVATE', startedAt: '2026-07-20T10:00:00.000Z', endedAt: '2026-07-20T10:05:00.000Z', durationS: 300, distanceM: 1000, steps: 1150, distanceSource: 'FUSED', route: [{ latitude: 20.5937, longitude: 78.9629, accuracy: 8, altitude: null, speed: null, recordedAt: '2026-07-20T10:00:00.000Z' }] };
describe('activity sync validation', () => {
  it('accepts a complete local activity payload', () => expect(syncActivitySchema.safeParse(activity).success).toBe(true));
  it('accepts legacy records and defaults their sensor metrics', () => { const result = syncActivitySchema.safeParse(({ ...activity, steps: undefined, distanceSource: undefined })); expect(result.success).toBe(true); if (result.success) expect(result.data).toMatchObject({ steps: 0, distanceSource: 'NONE' }); });
  it('rejects malformed coordinates and reversed times', () => { expect(syncActivitySchema.safeParse({ ...activity, route: [{ ...activity.route[0], latitude: 91 }] }).success).toBe(false); expect(syncActivitySchema.safeParse({ ...activity, endedAt: '2026-07-20T09:00:00.000Z' }).success).toBe(false); });
  it('limits route payload size before database synchronization', () => expect(syncActivitySchema.safeParse({ ...activity, route: Array.from({ length: 25_001 }, () => activity.route[0]) }).success).toBe(false));
});
describe('nearby discovery geography', () => {
  it('calculates an approximately one-kilometre latitude difference', () => expect(distanceKm(0, 0, 0.008993, 0)).toBeCloseTo(1, 1));
});
describe('live activity validation', () => {
  const live = { clientId: activity.clientId, type: 'RUN', visibility: 'FOLLOWERS', latitude: 20.5937, longitude: 78.9629, durationS: 120, distanceM: 650, speedKmh: 11.4, paused: false };
  it('links a valid live session to one local recording', () => expect(startLiveSchema.safeParse(live).success).toBe(true));
  it('prevents private or implausibly fast live broadcasts', () => {
    expect(startLiveSchema.safeParse({ ...live, visibility: 'PRIVATE' }).success).toBe(false);
    expect(liveUpdateSchema.safeParse({ ...live, speedKmh: 240 }).success).toBe(false);
  });
  it('keeps live location comments useful and bounded', () => {
    expect(liveCommentSchema.safeParse({ body: 'Loose gravel near the east turn.' }).success).toBe(true);
    expect(liveCommentSchema.safeParse({ body: ' '.repeat(2) }).success).toBe(false);
    expect(liveCommentSchema.safeParse({ body: 'x'.repeat(501) }).success).toBe(false);
  });
});
