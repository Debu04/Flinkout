import { describe, expect, it } from 'vitest';
import {
  calibratedStrideM,
  detectStep,
  estimatedCalories,
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

function countPattern(candidateTimes: number[], rotationRate = 0, amplitude = 2.6) {
  let state = initialStepDetectorState();
  let steps = 0;
  const samples = [{ timestamp: 0, x: 0 }, ...candidateTimes.flatMap(timestamp => [
    { timestamp, x: amplitude },
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

  it('accepts a lower-amplitude walking pattern while the phone rotates naturally', () => {
    const result = countPattern([100, 730, 1_310, 1_990, 2_600], 350, 1.5);
    expect(result.steps).toBe(5);
    expect(result.state.cadenceSpm).toBeGreaterThan(85);
  });

  it('does not count an isolated spike or rapid phone shaking', () => {
    expect(countPattern([100]).steps).toBe(0);
    expect(countPattern([100, 250, 400, 550, 700]).steps).toBe(0);
    expect(countPattern([100, 700, 1_300, 1_900], 900, 8).steps).toBe(0);
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
    const withSteps = recordMotionSteps(withGps, 3, 100, '2026-08-08T10:01:02.000Z', 'NATIVE');
    expect(withSteps.steps).toBe(3);
    expect(withSteps.stepSource).toBe('NATIVE');
    expect(withSteps.distanceM).toBeCloseTo(100, 4);
    expect(withSteps.distanceSource).toBe('FUSED');
  });

  it('continues estimated distance and pace when GPS is unavailable', () => {
    const lost = markGpsUnavailable(recordGpsSegment(activity(), 100, '2026-08-08T10:01:00.000Z'), '2026-08-08T10:01:01.000Z');
    const withSteps = recordMotionSteps(lost, 3, 100, '2026-08-08T10:01:03.000Z');
    expect(withSteps.distanceM).toBeCloseTo(101.8, 2);
    expect(withSteps.currentPaceSPerKm).toBeCloseTo(1_000, 1);
    expect(withSteps.paceSource).toBe('MOTION_ESTIMATED');
    expect(withSteps.caloriesKcal).toBeGreaterThan(0);
  });

  it('does not invent a step count from GPS distance', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, point(0.0009, '2026-08-08T10:03:00.000Z')).activity;
    const movedAgain = recordGpsSample(moved, point(0.0018, '2026-08-08T10:06:00.000Z')).activity;
    expect(movedAgain.distanceM).toBeGreaterThan(199);
    expect(movedAgain.steps ?? 0).toBe(0);
    expect(movedAgain.strideM).toBeCloseTo(0.6, 2);
    expect(movedAgain.averagePaceSPerKm).toBeCloseTo(1_798.6, 0);
    expect(movedAgain.distanceSource).toBe('GPS');
  });

  it('keeps the cumulative average pace through a stationary GPS heartbeat', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, point(0.0009, '2026-08-08T10:01:20.000Z')).activity;
    const stationary = recordGpsSample(moved, point(0.000901, '2026-08-08T10:01:40.000Z')).activity;
    expect(stationary.averagePaceSPerKm).toBeCloseTo(moved.averagePaceSPerKm!, 6);
    expect(stationary.currentPaceSPerKm).toBe(moved.currentPaceSPerKm);
  });

  it('establishes a new GPS baseline after motion fallback without a distance jump', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, point(0.0009, '2026-08-08T10:01:20.000Z')).activity;
    const motionOnly = recordMotionSteps(markGpsUnavailable(moved, '2026-08-08T10:01:21.000Z'), 100, 100, '2026-08-08T10:02:21.000Z');
    const recovered = recordGpsSample(motionOnly, point(0.00155, '2026-08-08T10:02:22.000Z')).activity;
    expect(recovered.distanceM).toBeCloseTo(motionOnly.distanceM, 5);
    expect(recovered.gpsDistanceM).toBeCloseTo(motionOnly.distanceM, 5);
    expect(recovered.gpsAvailable).toBe(true);
    expect(recovered.route.at(-1)?.startsNewSegment).toBe(true);
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

  it('keeps the GPS route and distance moving when Android reports speed as zero', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z', { speed: 0 })).activity;
    const secondResult = recordGpsSample(first, point(0.00009, '2026-08-08T10:00:10.000Z', { speed: 0 }));
    const thirdResult = recordGpsSample(secondResult.activity, point(0.00018, '2026-08-08T10:00:20.000Z', { speed: 0 }));
    expect(secondResult.reason).toBe('ACCEPTED');
    expect(thirdResult.reason).toBe('ACCEPTED');
    expect(thirdResult.activity.route).toHaveLength(3);
    expect(thirdResult.activity.distanceM).toBeGreaterThan(19);
  });

  it('stops active metrics while paused', () => {
    const paused = activity({ status: 'PAUSED', trackingMode: 'PAUSED', steps: 20, distanceM: 50, movingTimeS: 30, caloriesKcal: 2 });
    expect(recordMotionSteps(paused, 3, 100, '2026-08-08T10:01:00.000Z')).toEqual(paused);
  });

  it('ignores stationary altitude noise and counts only a sustained plausible climb', () => {
    const first = recordGpsSample(activity(), point(0, '2026-08-08T10:00:00.000Z', { altitude: 100, altitudeAccuracy: 8 })).activity;
    const noisy = recordGpsSample(first, point(0.00001, '2026-08-08T10:00:10.000Z', { altitude: 130, altitudeAccuracy: 8 })).activity;
    expect(noisy.currentElevationM).toBe(100);
    expect(noisy.elevationGainM ?? 0).toBe(0);
    const climb1 = recordGpsSample(noisy, point(0.00018, '2026-08-08T10:00:20.000Z', { altitude: 105, altitudeAccuracy: 8 })).activity;
    const climb2 = recordGpsSample(climb1, point(0.00036, '2026-08-08T10:00:30.000Z', { altitude: 110, altitudeAccuracy: 8 })).activity;
    const climbed = recordGpsSample(climb2, point(0.00054, '2026-08-08T10:00:40.000Z', { altitude: 115, altitudeAccuracy: 8 })).activity;
    expect(climbed.elevationGainM).toBeGreaterThan(4);
    expect(climbed.elevationLossM ?? 0).toBe(0);
    const unreliable = recordGpsSample(climbed, point(0.0007, '2026-08-08T10:00:50.000Z', { altitude: 300, altitudeAccuracy: 80 })).activity;
    expect(unreliable.currentElevationM).toBeCloseTo(climbed.currentElevationM!, 6);
  });

  it('keeps the phone-reference calorie estimate near 216 kcal for 5,401 walking steps', () => {
    expect(estimatedCalories('WALK', 3_660, 3_000, 70, 5_401)).toBeCloseTo(216, 0);
  });

  it('calibrates only inside plausible stride bounds', () => {
    expect(calibratedStrideM('WALK', 100, 20, 0.6)).toBeCloseTo(0.67, 6);
    expect(calibratedStrideM('RIDE', 100, 20, 0)).toBe(0);
  });
});
