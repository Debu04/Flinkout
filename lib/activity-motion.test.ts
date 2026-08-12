import { describe, expect, it } from 'vitest';
import {
  calibratedStrideM,
  detectStep,
  initialStepDetectorState,
  markGpsUnavailable,
  recordGpsSample,
  recordGpsSegment,
  recordMotionSteps,
} from './activity-motion';
import type { LocalActivity, RoutePoint } from './activity';

const activity = (overrides: Partial<LocalActivity> = {}): LocalActivity => ({
  clientId: '00000000-0000-4000-8000-000000000000', type: 'WALK', visibility: 'PRIVATE', status: 'RECORDING', published: false,
  syncStatus: 'LOCAL', syncError: null, syncedActivityId: null, lastSyncAttemptAt: null, startedAt: '2026-08-08T10:00:00.000Z',
  endedAt: null, elapsedBeforePauseS: 0, activeSince: '2026-08-08T10:00:00.000Z', movingTimeS: 0, distanceM: 0, route: [],
  createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-08T10:00:00.000Z', ...overrides,
});

const point = (longitude: number, recordedAt: string, overrides: Partial<RoutePoint> = {}): RoutePoint => ({
  latitude: 0,
  longitude,
  accuracy: 5,
  altitude: null,
  altitudeAccuracy: null,
  speed: null,
  recordedAt,
  ...overrides,
});

function countPattern(candidateTimes: number[], rotationRate = 0) {
  let state = initialStepDetectorState();
  let steps = 0;
  const samples = [{ timestamp: 0, x: 0 }, ...candidateTimes.flatMap(timestamp => [
    { timestamp, x: 2.6 },
    { timestamp: timestamp + 100, x: 0 },
    { timestamp: timestamp + 200, x: 0 },
    { timestamp: timestamp + 300, x: 0 },
  ])].sort((a, b) => a.timestamp - b.timestamp);
  for (const sample of samples) {
    const result = detectStep(state, { x: sample.x, y: 0, z: 0, includesGravity: false, timestamp: sample.timestamp, rotationRate });
    state = result.state;
    steps += result.steps;
  }
  return { steps, state };
}

describe('motion step detection', () => {
  it('requires a repeated cadence-consistent walking pattern', () => {
    const result = countPattern([100, 700, 1_300, 1_900, 2_500]);
    expect(result.steps).toBe(5);
    expect(result.state.cadenceSpm).toBeCloseTo(100, 0);
  });

  it('does not count an isolated spike or rapid phone shaking', () => {
    expect(countPattern([100]).steps).toBe(0);
    expect(countPattern([100, 250, 400, 550, 700]).steps).toBe(0);
    expect(countPattern([100, 700, 1_300, 1_900], 500).steps).toBe(0);
  });

  it('does not count a stationary gravity signal', () => {
    let state = initialStepDetectorState();
    let steps = 0;
    for (let timestamp = 0; timestamp < 2_000; timestamp += 50) {
      const result = detectStep(state, { x: 0, y: 0, z: 9.81, includesGravity: true, timestamp });
      state = result.state;
      steps += result.steps;
    }
    expect(steps).toBe(0);
  });
});

describe('GPS and motion fusion', () => {
  it('uses motion for steps but not distance while GPS is reliable', () => {
    const withGps = recordGpsSegment(activity(), 100, '2026-08-08T10:01:00.000Z');
    const withSteps = recordMotionSteps(withGps, 3, 100, '2026-08-08T10:01:02.000Z');
    expect(withSteps.steps).toBe(3);
    expect(withSteps.distanceM).toBeCloseTo(100, 4);
    expect(withSteps.distanceSource).toBe('FUSED');
  });

  it('continues estimated distance and pace when GPS is unavailable', () => {
    const lost = markGpsUnavailable(recordGpsSegment(activity(), 100, '2026-08-08T10:01:00.000Z'), '2026-08-08T10:01:01.000Z');
    const withSteps = recordMotionSteps(lost, 3, 100, '2026-08-08T10:01:03.000Z');
    expect(withSteps.distanceM).toBeCloseTo(102.16, 2);
    expect(withSteps.currentPaceSPerKm).toBeCloseTo(833.33, 1);
    expect(withSteps.paceSource).toBe('MOTION_ESTIMATED');
    expect(withSteps.caloriesKcal).toBeGreaterThan(0);
  });

  it('establishes a new GPS baseline after motion fallback without a distance jump', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, point(0.0009, '2026-08-08T10:01:20.000Z')).activity;
    const motionOnly = recordMotionSteps(markGpsUnavailable(moved, '2026-08-08T10:01:21.000Z'), 100, 100, '2026-08-08T10:02:21.000Z');
    const recovered = recordGpsSample(motionOnly, point(0.00155, '2026-08-08T10:02:22.000Z')).activity;
    expect(recovered.distanceM).toBeCloseTo(motionOnly.distanceM, 5);
    expect(recovered.gpsDistanceM).toBeCloseTo(motionOnly.distanceM, 5);
    expect(recovered.gpsAvailable).toBe(true);
  });

  it('rejects poor accuracy, stationary jitter, and impossible jumps', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z')).activity;
    const inaccurate = recordGpsSample(first, point(0.001, '2026-08-08T10:00:10.000Z', { accuracy: 90 }));
    expect(inaccurate.reason).toBe('INACCURATE');
    expect(inaccurate.activity.distanceM).toBe(0);
    const jitter = recordGpsSample(first, point(0.00001, '2026-08-08T10:00:10.000Z'));
    expect(jitter.reason).toBe('STATIONARY');
    expect(jitter.activity.distanceM).toBe(0);
    const jump = recordGpsSample(first, point(0.01, '2026-08-08T10:00:01.000Z'));
    expect(jump.reason).toBe('IMPLAUSIBLE');
    expect(jump.activity.route).toHaveLength(1);
  });

  it('stops active metrics while paused', () => {
    const paused = activity({ status: 'PAUSED', trackingMode: 'PAUSED', steps: 20, distanceM: 50, movingTimeS: 30, caloriesKcal: 2 });
    expect(recordMotionSteps(paused, 3, 100, '2026-08-08T10:01:00.000Z')).toEqual(paused);
  });

  it('filters elevation and ignores unreliable altitude', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z', { altitude: 100, altitudeAccuracy: 8 })).activity;
    const climbed = recordGpsSample(first, point(0.0001, '2026-08-08T10:00:10.000Z', { altitude: 116, altitudeAccuracy: 8 })).activity;
    expect(climbed.currentElevationM).toBeCloseTo(104.48, 2);
    expect(climbed.elevationGainM).toBeCloseTo(4.48, 2);
    const unreliable = recordGpsSample(climbed, point(0.0002, '2026-08-08T10:00:20.000Z', { altitude: 300, altitudeAccuracy: 80 })).activity;
    expect(unreliable.currentElevationM).toBeCloseTo(104.48, 2);
  });

  it('calibrates only inside plausible stride bounds', () => {
    expect(calibratedStrideM('WALK', 100, 20, 0.72)).toBeCloseTo(0.796, 6);
    expect(calibratedStrideM('RIDE', 100, 20, 0)).toBe(0);
  });
});
