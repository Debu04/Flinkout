import { describe, expect, it } from 'vitest';
import {
  GPS_ACCURACY_LIMITS_M,
  PHONE_WALK_REFERENCE,
  averagePaceSeconds,
  defaultStrideM,
  detectStep,
  estimatedCalories,
  initialStepDetectorState,
  markGpsUnavailable,
  recordGpsSample,
  recordMotionSteps,
  refreshActivityMetrics,
  resumeActivityTracking,
} from './activity-motion';
import { formatSignedElevation, type ActivityType, type LocalActivity, type RoutePoint } from './activity';

const METERS_PER_LONGITUDE_DEGREE = 111_194.9;

const activity = (overrides: Partial<LocalActivity> = {}): LocalActivity => ({
  clientId: '00000000-0000-4000-8000-000000000000',
  type: 'WALK',
  visibility: 'PRIVATE',
  status: 'RECORDING',
  published: false,
  syncStatus: 'LOCAL',
  syncError: null,
  syncedActivityId: null,
  lastSyncAttemptAt: null,
  startedAt: '2026-08-08T10:00:00.000Z',
  endedAt: null,
  elapsedBeforePauseS: 0,
  activeSince: '2026-08-08T10:00:00.000Z',
  movingTimeS: 0,
  lastMovementAt: null,
  distanceM: 0,
  gpsDistanceM: 0,
  motionFallbackDistanceM: 0,
  nativeSteps: 0,
  browserMotionSteps: 0,
  gpsEstimatedSteps: 0,
  motionFallbackSteps: 0,
  steps: 0,
  stepSource: 'UNAVAILABLE',
  route: [],
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
  ...overrides,
});

const pointAt = (meters: number, recordedAt: string, overrides: Partial<RoutePoint> = {}): RoutePoint => ({
  latitude: 0,
  longitude: meters / METERS_PER_LONGITUDE_DEGREE,
  accuracy: 5,
  altitude: null,
  altitudeAccuracy: null,
  speed: null,
  recordedAt,
  ...overrides,
});

function countPattern(candidateTimes: number[], rotationRate = 0, amplitude = 2.6, type: ActivityType = 'WALK') {
  let state = initialStepDetectorState();
  let steps = 0;
  const samples = [{ timestamp: 0, x: 0 }, ...candidateTimes.flatMap(timestamp => [
    { timestamp, x: amplitude },
    { timestamp: timestamp + 100, x: 0 },
    { timestamp: timestamp + 200, x: 0 },
    { timestamp: timestamp + 300, x: 0 },
  ])].sort((a, b) => a.timestamp - b.timestamp);
  for (const sample of samples) {
    const result = detectStep(state, { x: sample.x, y: 0, z: 0, includesGravity: false, timestamp: sample.timestamp, rotationRate }, type);
    state = result.state;
    steps += result.steps;
  }
  return { steps, state };
}

describe('browser motion detection', () => {
  it('requires a repeated cadence-consistent walking pattern', () => {
    const result = countPattern([100, 700, 1_300, 1_900, 2_500]);
    expect(result.steps).toBe(5);
    expect(result.state.cadenceSpm).toBeCloseTo(100, 0);
  });

  it('supports lower-amplitude motion and different phone orientation', () => {
    const hand = countPattern([100, 730, 1_310, 1_990, 2_600], 320, 1.5);
    const pocket = countPattern([100, 730, 1_310, 1_990, 2_600], 280, -1.5);
    expect(hand.steps).toBe(5);
    expect(pocket.steps).toBe(5);
  });

  it('rejects isolated bumps, rapid shaking, and rotation without cadence', () => {
    expect(countPattern([100]).steps).toBe(0);
    expect(countPattern([100, 250, 400, 550, 700]).steps).toBe(0);
    expect(countPattern([100, 700, 1_300, 1_900], 900, 8).steps).toBe(0);
  });

  it('uses the running cadence range for runs', () => {
    expect(countPattern([100, 500, 900, 1_300, 1_700], 0, 2.6, 'RUN').steps).toBe(5);
    expect(countPattern([100, 800, 1_500, 2_200], 0, 2.6, 'RUN').steps).toBe(0);
  });
});

describe('authoritative GPS and fused metric pipeline', () => {
  it('matches the supplied phone walking reference for steps and calories', () => {
    const strideM = defaultStrideM('WALK');
    expect(strideM * PHONE_WALK_REFERENCE.steps).toBeCloseTo(PHONE_WALK_REFERENCE.distanceM, 5);
    expect(estimatedCalories('WALK', PHONE_WALK_REFERENCE.durationS, PHONE_WALK_REFERENCE.distanceM)).toBe(PHONE_WALK_REFERENCE.caloriesKcal);
  });

  it('calculates 620 m over 1,429 s as approximately 38:25 /km', () => {
    const pace = averagePaceSeconds('WALK', 620, 1_429);
    expect(pace).toBeCloseTo(2_304.84, 1);
    expect(Math.round(pace!)).toBe(2_305);
  });

  it('uses a rolling collection of recent segments for current pace', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const tenMeters = recordGpsSample(first, pointAt(10, '2026-08-08T10:00:10.000Z')).activity;
    expect(tenMeters.currentPaceSPerKm).toBeNull();
    const twentyMeters = recordGpsSample(tenMeters, pointAt(20, '2026-08-08T10:00:20.000Z')).activity;
    expect(twentyMeters.currentPaceSPerKm).toBeCloseTo(1_000, -1);
    const fastLastSegment = recordGpsSample(twentyMeters, pointAt(50, '2026-08-08T10:00:30.000Z')).activity;
    expect(fastLastSegment.currentPaceSPerKm).toBeGreaterThan(700);
    expect(fastLastSegment.trackingDiagnostics?.rollingPaceDistanceM).toBeCloseTo(50, 0);
    expect(fastLastSegment.trackingDiagnostics?.rollingPaceDurationS).toBe(30);
  });

  it('makes current pace unavailable after ten stationary seconds', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(25, '2026-08-08T10:00:15.000Z')).activity;
    expect(moved.currentPaceSPerKm).not.toBeNull();
    const stationary = recordGpsSample(moved, pointAt(25.5, '2026-08-08T10:00:26.000Z')).activity;
    expect(stationary.currentPaceSPerKm).toBeNull();
    expect(stationary.route).toHaveLength(moved.route.length);
  });

  it('rejects stationary drift without changing route, distance, moving time, or calories', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const drift = recordGpsSample(first, pointAt(1.5, '2026-08-08T10:00:15.000Z'));
    expect(drift.reason).toBe('STATIONARY');
    expect(drift.accepted).toBe(false);
    expect(drift.activity.route).toHaveLength(1);
    expect(drift.activity.distanceM).toBe(0);
    expect(drift.activity.movingTimeS).toBe(0);
    expect(drift.activity.caloriesKcal ?? 0).toBe(0);
  });

  it('does not let weak GPS alter distance, pace, route, moving time, or elevation', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const weak = recordGpsSample(first, pointAt(30, '2026-08-08T10:00:15.000Z', { accuracy: GPS_ACCURACY_LIMITS_M.WALK + 1, altitude: 500, altitudeAccuracy: 5 }));
    expect(weak.reason).toBe('INACCURATE');
    expect(weak.activity.route).toEqual(first.route);
    expect(weak.activity.distanceM).toBe(first.distanceM);
    expect(weak.activity.movingTimeS).toBe(first.movingTimeS);
    expect(weak.activity.currentPaceSPerKm).toBe(first.currentPaceSPerKm);
    expect(weak.activity.currentElevationM).toBe(first.currentElevationM);
  });

  it('rejects impossible jumps', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const jump = recordGpsSample(first, pointAt(1_000, '2026-08-08T10:00:01.000Z'));
    expect(jump.reason).toBe('IMPLAUSIBLE');
    expect(jump.activity.route).toHaveLength(1);
    expect(jump.activity.distanceM).toBe(0);
  });

  it('keeps valid Android browser GPS movement when reported speed is zero', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { speed: 0 })).activity;
    const second = recordGpsSample(first, pointAt(10, '2026-08-08T10:00:10.000Z', { speed: 0 }));
    const third = recordGpsSample(second.activity, pointAt(20, '2026-08-08T10:00:20.000Z', { speed: 0 }));
    expect(second.reason).toBe('ACCEPTED');
    expect(third.reason).toBe('ACCEPTED');
    expect(third.activity.route).toHaveLength(3);
    expect(third.activity.distanceM).toBeCloseTo(20, 0);
  });

  it('does not reject plausible coordinate movement because browser-reported speed is wrong', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { speed: 0 })).activity;
    const moved = recordGpsSample(first, pointAt(10, '2026-08-08T10:00:10.000Z', { speed: 40 }));
    expect(moved.reason).toBe('ACCEPTED');
    expect(moved.activity.distanceM).toBeCloseTo(10, 0);
  });

  it('accumulates ordinary one-metre walking callbacks instead of rebasing them away', () => {
    let tracked = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { speed: 0 })).activity;
    for (let second = 1; second <= 30; second += 1) {
      tracked = recordGpsSample(
        tracked,
        pointAt(second, `2026-08-08T10:00:${String(second).padStart(2, '0')}.000Z`, { speed: 0 }),
      ).activity;
    }
    expect(tracked.route.length).toBeGreaterThan(5);
    expect(tracked.distanceM).toBeGreaterThan(25);
    expect(tracked.steps).toBeGreaterThan(35);
    expect(tracked.movingTimeS).toBeGreaterThan(20);
    expect(tracked.caloriesKcal).toBeGreaterThan(0);
  });

  it('accepts usable Android GPS fixes above the old overly strict limit', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { accuracy: 35 })).activity;
    const moved = recordGpsSample(first, pointAt(15, '2026-08-08T10:00:15.000Z', { accuracy: 35 }));
    expect(moved.reason).toBe('ACCEPTED');
    expect(moved.activity.distanceM).toBeCloseTo(15, 0);
  });

  it('does not invent fallback distance while the initial GPS fix is still pending', () => {
    const acquiring = activity({ gpsAvailable: undefined, trackingMode: 'GPS_MOTION' });
    const motionWhileAcquiring = recordMotionSteps(acquiring, 10, 100, '2026-08-08T10:00:06.000Z');
    expect(motionWhileAcquiring.browserMotionSteps).toBe(10);
    expect(motionWhileAcquiring.motionFallbackDistanceM).toBe(0);
    expect(motionWhileAcquiring.distanceM).toBe(0);
    expect(motionWhileAcquiring.steps).toBe(0);
    expect(motionWhileAcquiring.stepSource).toBe('UNAVAILABLE');

    const confirmedOutage = markGpsUnavailable(motionWhileAcquiring, '2026-08-08T10:00:07.000Z');
    const fallback = recordMotionSteps(confirmedOutage, 5, 100, '2026-08-08T10:00:10.000Z');
    expect(fallback.motionFallbackDistanceM).toBeCloseTo(5 * defaultStrideM('WALK'), 5);
    expect(fallback.steps).toBe(5);
    expect(fallback.stepSource).toBe('BROWSER_ESTIMATED');
  });

  it('continues fallback distance during GPS loss and starts a clean recovery segment', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(65, '2026-08-08T10:01:00.000Z')).activity;
    const lost = markGpsUnavailable(moved, '2026-08-08T10:01:01.000Z');
    const fallback = recordMotionSteps(lost, 20, 100, '2026-08-08T10:01:13.000Z');
    const fallbackDistanceM = 20 * defaultStrideM('WALK');
    expect(fallback.motionFallbackDistanceM).toBeCloseTo(fallbackDistanceM, 5);
    expect(fallback.distanceM).toBeCloseTo(65 + fallbackDistanceM, 0);
    const recovered = recordGpsSample(fallback, pointAt(300, '2026-08-08T10:01:14.000Z')).activity;
    expect(recovered.distanceM).toBeCloseTo(fallback.distanceM, 5);
    expect(recovered.route.at(-1)?.startsNewSegment).toBe(true);
    const afterRecovery = recordGpsSample(recovered, pointAt(310, '2026-08-08T10:01:24.000Z')).activity;
    expect(afterRecovery.distanceM).toBeCloseTo(75 + fallbackDistanceM, 0);
    expect(afterRecovery.gpsDistanceM).toBeCloseTo(75, 0);
  });

  it('does not double-count GPS-estimated and browser-motion steps', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const gps = recordGpsSample(first, pointAt(65, '2026-08-08T10:01:00.000Z')).activity;
    const gpsSteps = Math.floor(65 / defaultStrideM('WALK'));
    expect(gps.gpsEstimatedSteps).toBe(gpsSteps);
    expect(gps.steps).toBe(gpsSteps);
    const motionWhileGps = recordMotionSteps(gps, 20, 100, '2026-08-08T10:01:12.000Z');
    expect(motionWhileGps.browserMotionSteps).toBe(20);
    expect(motionWhileGps.steps).toBe(gpsSteps);
    expect(motionWhileGps.distanceM).toBeCloseTo(65, 0);
    const fallback = recordMotionSteps(markGpsUnavailable(motionWhileGps, '2026-08-08T10:01:13.000Z'), 10, 100, '2026-08-08T10:01:19.000Z');
    expect(fallback.steps).toBe(gpsSteps + 10);
    expect(fallback.motionFallbackSteps).toBe(10);
  });

  it('keeps native steps authoritative when GPS distance changes', () => {
    const nativeActivity = activity({ stepSource: 'NATIVE' });
    const first = recordGpsSample(nativeActivity, pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const gps = recordGpsSample(first, pointAt(65, '2026-08-08T10:01:00.000Z')).activity;
    expect(gps.gpsEstimatedSteps).toBe(Math.floor(65 / defaultStrideM('WALK')));
    expect(gps.steps).toBe(0);
    const native = recordMotionSteps(gps, 42, 100, '2026-08-08T10:01:25.000Z', 'NATIVE');
    expect(native.nativeSteps).toBe(42);
    expect(native.steps).toBe(42);
    expect(native.stepSource).toBe('NATIVE');
    const moreGps = recordGpsSample(native, pointAt(130, '2026-08-08T10:02:00.000Z')).activity;
    expect(moreGps.gpsEstimatedSteps).toBe(Math.floor(130 / defaultStrideM('WALK')));
    expect(moreGps.steps).toBe(42);
  });

  it('does not increase active calories during stationary time', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(50, '2026-08-08T10:01:00.000Z')).activity;
    expect(moved.caloriesKcal).toBeGreaterThan(0);
    const stationary = recordGpsSample(moved, pointAt(50.5, '2026-08-08T10:01:20.000Z')).activity;
    expect(stationary.caloriesKcal).toBe(moved.caloriesKcal);
    expect(estimatedCalories('WALK', 0, 50)).toBe(0);
  });

  it('does not recalculate live average pace or calories when only time or sensor steps change', () => {
    const first = recordGpsSample(activity({ stepSource: 'NATIVE' }), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(30, '2026-08-08T10:00:20.000Z')).activity;
    expect(moved.averagePaceSPerKm).not.toBeNull();
    const sensorOnly = recordMotionSteps(moved, 3, 100, '2026-08-08T10:00:25.000Z', 'NATIVE');
    expect(sensorOnly.distanceM).toBe(moved.distanceM);
    expect(sensorOnly.movingTimeS).toBe(moved.movingTimeS);
    expect(sensorOnly.averagePaceSPerKm).toBe(moved.averagePaceSPerKm);
    expect(sensorOnly.caloriesKcal).toBe(moved.caloriesKcal);
  });

  it('updates the live average at intervals and forces an exact final average', () => {
    const base = activity({ distanceM: 100, gpsDistanceM: 100, movingTimeS: 60, updatedAt: '2026-08-08T10:01:00.000Z' });
    const first = refreshActivityMetrics(base, 60);
    expect(first.averagePaceSPerKm).toBe(600);
    const tooSoon = refreshActivityMetrics({ ...first, distanceM: 110, gpsDistanceM: 110, updatedAt: '2026-08-08T10:01:05.000Z' }, 65);
    expect(tooSoon.averagePaceSPerKm).toBe(600);
    const final = refreshActivityMetrics({ ...tooSoon, status: 'FINISHED', updatedAt: '2026-08-08T10:01:10.000Z' }, 70, { forceAverage: true });
    expect(final.averagePaceSPerKm).toBeCloseTo(636.36, 1);
  });

  it('excludes a stationary gap from moving time when GPS movement resumes', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(10, '2026-08-08T10:00:10.000Z')).activity;
    const idle1 = recordGpsSample(moved, pointAt(10.5, '2026-08-08T10:00:20.000Z')).activity;
    const idle2 = recordGpsSample(idle1, pointAt(10.4, '2026-08-08T10:00:30.000Z')).activity;
    expect(idle2.movingTimeS).toBe(moved.movingTimeS);
    const continued = recordGpsSample(idle2, pointAt(20, '2026-08-08T10:00:31.000Z')).activity;
    expect(continued.distanceM).toBeCloseTo(20, 0);
    expect(continued.movingTimeS).toBeCloseTo((moved.movingTimeS ?? 0) + 1, 1);
  });

  it('uses validated motion to retain a precise small-area GPS path', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const motion = recordMotionSteps({ ...first, gpsAvailable: true, trackingMode: 'GPS_MOTION' }, 3, 100, '2026-08-08T10:00:01.000Z');
    const smallMove = recordGpsSample(motion, pointAt(2, '2026-08-08T10:00:02.000Z'));
    expect(smallMove.reason).toBe('ACCEPTED');
    expect(smallMove.activity.route).toHaveLength(2);
    expect(smallMove.activity.distanceM).toBeCloseTo(2, 0);
  });

  it('ignores altitude when vertical accuracy is poor', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { altitude: 100, altitudeAccuracy: 5 })).activity;
    const poorAltitude = recordGpsSample(first, pointAt(20, '2026-08-08T10:00:15.000Z', { altitude: 150, altitudeAccuracy: 21 })).activity;
    expect(poorAltitude.currentElevationM).toBe(first.currentElevationM);
    expect(poorAltitude.elevationGainM ?? 0).toBe(0);
  });

  it('counts only a sustained, accurately measured elevation gain', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const altitude1 = recordGpsSample(first, pointAt(20, '2026-08-08T10:00:15.000Z', { altitude: 100, altitudeAccuracy: 5 })).activity;
    const altitude2 = recordGpsSample(altitude1, pointAt(40, '2026-08-08T10:00:30.000Z', { altitude: 106, altitudeAccuracy: 5 })).activity;
    const altitude3 = recordGpsSample(altitude2, pointAt(60, '2026-08-08T10:00:45.000Z', { altitude: 112, altitudeAccuracy: 5 })).activity;
    const climbed = recordGpsSample(altitude3, pointAt(80, '2026-08-08T10:01:00.000Z', { altitude: 118, altitudeAccuracy: 5 })).activity;
    expect(climbed.elevationGainM).toBeGreaterThan(3);
    expect(climbed.elevationLossM ?? 0).toBe(0);
  });

  it('uses altitude conservatively when a precise Android fix omits vertical accuracy', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const altitude1 = recordGpsSample(first, pointAt(20, '2026-08-08T10:00:15.000Z', { altitude: 100, altitudeAccuracy: null, accuracy: 5 })).activity;
    const altitude2 = recordGpsSample(altitude1, pointAt(40, '2026-08-08T10:00:30.000Z', { altitude: 110, altitudeAccuracy: null, accuracy: 5 })).activity;
    const altitude3 = recordGpsSample(altitude2, pointAt(60, '2026-08-08T10:00:45.000Z', { altitude: 120, altitudeAccuracy: null, accuracy: 5 })).activity;
    const climbed = recordGpsSample(altitude3, pointAt(80, '2026-08-08T10:01:00.000Z', { altitude: 130, altitudeAccuracy: null, accuracy: 5 })).activity;
    expect(climbed.trackingDiagnostics?.lastAltitudeAccuracyM).toBe(20);
    expect(climbed.elevationGainM).toBeGreaterThan(3);
  });

  it('shows filtered signed local elevation and updates it no faster than every five seconds', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z', { altitude: -4, altitudeAccuracy: 5 })).activity;
    expect(first.currentElevationM).toBe(-4);
    expect(formatSignedElevation(first.currentElevationM)).toBe('-4 m');
    expect(formatSignedElevation(124)).toBe('+124 m');
    const tooSoon = recordGpsSample(first, pointAt(0.5, '2026-08-08T10:00:02.000Z', { altitude: 8, altitudeAccuracy: 5 })).activity;
    expect(tooSoon.currentElevationM).toBe(-4);
    const later = recordGpsSample(tooSoon, pointAt(0.7, '2026-08-08T10:00:06.000Z', { altitude: -2, altitudeAccuracy: 5 })).activity;
    expect(later.currentElevationM).not.toBeNull();
    expect(later.elevationGainM ?? 0).toBe(0);
  });

  it('re-baselines GPS after resume without counting the pause gap or getting stuck', () => {
    const first = recordGpsSample(activity(), pointAt(0, '2026-08-08T10:00:00.000Z')).activity;
    const moved = recordGpsSample(first, pointAt(20, '2026-08-08T10:00:20.000Z')).activity;
    const paused = { ...moved, status: 'PAUSED' as const, trackingMode: 'PAUSED' as const, activeSince: null };
    const resumed = resumeActivityTracking(paused, '2026-08-08T10:01:00.000Z');
    expect(resumed.gpsAvailable).toBeUndefined();
    expect(resumed.locationBaseline).toBeNull();
    const rebaseline = recordGpsSample(resumed, pointAt(100, '2026-08-08T10:01:01.000Z')).activity;
    expect(rebaseline.distanceM).toBeCloseTo(moved.distanceM, 5);
    expect(rebaseline.route.at(-1)?.startsNewSegment).toBe(true);
    const continued = recordGpsSample(rebaseline, pointAt(110, '2026-08-08T10:01:11.000Z')).activity;
    expect(continued.distanceM).toBeCloseTo(moved.distanceM + 10, 0);
    expect(continued.gpsAvailable).toBe(true);
  });

  it('does not change any active metrics while paused', () => {
    const paused = activity({ status: 'PAUSED', trackingMode: 'PAUSED', steps: 20, distanceM: 50, gpsDistanceM: 50, movingTimeS: 30, caloriesKcal: 2 });
    expect(recordMotionSteps(paused, 3, 100, '2026-08-08T10:01:00.000Z')).toEqual(paused);
    expect(recordGpsSample(paused, pointAt(60, '2026-08-08T10:01:00.000Z')).activity).toEqual(paused);
  });
});
