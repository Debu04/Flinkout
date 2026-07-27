import { describe, expect, it } from 'vitest';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/flinkout_test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-never-used-in-production';
process.env.WEB_ORIGIN = 'http://localhost:3000';
const { syncActivitySchema } = await import('./activities.js');
const { distanceKm } = await import('./discovery.js');

const activity = { clientId: '00000000-0000-4000-8000-000000000000', type: 'RUN', visibility: 'PRIVATE', startedAt: '2026-07-20T10:00:00.000Z', endedAt: '2026-07-20T10:05:00.000Z', durationS: 300, distanceM: 1000, route: [{ latitude: 20.5937, longitude: 78.9629, accuracy: 8, altitude: null, speed: null, recordedAt: '2026-07-20T10:00:00.000Z' }] };
describe('activity sync validation', () => {
  it('accepts a complete local activity payload', () => expect(syncActivitySchema.safeParse(activity).success).toBe(true));
  it('rejects malformed coordinates and reversed times', () => { expect(syncActivitySchema.safeParse({ ...activity, route: [{ ...activity.route[0], latitude: 91 }] }).success).toBe(false); expect(syncActivitySchema.safeParse({ ...activity, endedAt: '2026-07-20T09:00:00.000Z' }).success).toBe(false); });
  it('limits route payload size before database synchronization', () => expect(syncActivitySchema.safeParse({ ...activity, route: Array.from({ length: 25_001 }, () => activity.route[0]) }).success).toBe(false));
});
describe('nearby discovery geography', () => {
  it('calculates an approximately one-kilometre latitude difference', () => expect(distanceKm(0, 0, 0.008993, 0)).toBeCloseTo(1, 1));
});
