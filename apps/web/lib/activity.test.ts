import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES, averageSpeedKmh, distanceBetween, elapsedSeconds, formatPace, labelFor, shouldKeepPoint, type LocalActivity, type RoutePoint } from './activity';

const point = (latitude: number, longitude: number, recordedAt = '2026-07-19T10:00:00.000Z'): RoutePoint => ({ latitude, longitude, accuracy: 5, altitude: null, speed: null, recordedAt });
const recording: LocalActivity = { clientId: '00000000-0000-4000-8000-000000000000', type: 'RUN', visibility: 'PRIVATE', status: 'RECORDING', syncStatus: 'LOCAL', syncError: null, syncedActivityId: null, lastSyncAttemptAt: null, startedAt: '2026-07-19T10:00:00.000Z', endedAt: null, elapsedBeforePauseS: 30, activeSince: '2026-07-19T10:01:00.000Z', distanceM: 1000, route: [], createdAt: '2026-07-19T10:00:00.000Z', updatedAt: '2026-07-19T10:01:00.000Z' };
describe('activity metrics', () => {
  it('supports walking, running, cycling, and hiking', () => { expect(ACTIVITY_TYPES).toEqual(['WALK', 'RUN', 'RIDE', 'HIKE']); expect(ACTIVITY_TYPES.map(labelFor)).toEqual(['Walk', 'Run', 'Ride', 'Hike']); });
  it('calculates a roughly 1 km route segment', () => expect(distanceBetween(point(0, 0), point(0, 0.008993))).toBeCloseTo(1000, -1));
  it('calculates elapsed time through the current active segment', () => expect(elapsedSeconds(recording, Date.parse('2026-07-19T10:02:30.000Z'))).toBe(120));
  it('formats pace and speed', () => { expect(formatPace(1000, 300)).toBe('5:00 /km'); expect(averageSpeedKmh(1000, 300)).toBeCloseTo(12); });
  it('filters a quick implausible GPS jump and keeps stationary heartbeat points', () => { const first = point(0, 0); expect(shouldKeepPoint(first, point(1, 1, '2026-07-19T10:00:01.000Z'))).toBe(false); expect(shouldKeepPoint(first, point(0, 0, '2026-07-19T10:00:11.000Z'))).toBe(true); });
});
