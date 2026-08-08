import { describe, expect, it } from 'vitest';
import { calibratedStrideM, detectStep, initialStepDetectorState, recordGpsSegment, recordMotionStep } from './activity-motion';
import type { LocalActivity } from './activity';

const activity = (overrides: Partial<LocalActivity> = {}): LocalActivity => ({
  clientId: '00000000-0000-4000-8000-000000000000', type: 'WALK', visibility: 'PRIVATE', status: 'RECORDING', published: false,
  syncStatus: 'LOCAL', syncError: null, syncedActivityId: null, lastSyncAttemptAt: null, startedAt: '2026-08-08T10:00:00.000Z',
  endedAt: null, elapsedBeforePauseS: 0, activeSince: '2026-08-08T10:00:00.000Z', distanceM: 0, route: [], createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-08T10:00:00.000Z', ...overrides,
});

describe('motion step detection', () => {
  it('uses a peak, hysteresis, and debounce instead of counting every sensor reading', () => {
    let state = initialStepDetectorState();
    const readings = [
      { z: 9.81, timestamp: 0 }, { z: 12.8, timestamp: 100 }, { z: 13.2, timestamp: 160 },
      { z: 9.81, timestamp: 240 }, { z: 12.9, timestamp: 300 }, { z: 9.81, timestamp: 420 }, { z: 13.1, timestamp: 500 },
    ];
    let steps = 0;
    for (const reading of readings) {
      const result = detectStep(state, { x: 0, y: 0, includesGravity: true, ...reading });
      state = result.state;
      if (result.step) steps += 1;
    }
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(2);
  });

  it('does not count a stationary gravity signal', () => {
    let state = initialStepDetectorState();
    let steps = 0;
    for (let timestamp = 0; timestamp < 2_000; timestamp += 50) {
      const result = detectStep(state, { x: 0, y: 0, z: 9.81, includesGravity: true, timestamp });
      state = result.state;
      if (result.step) steps += 1;
    }
    expect(steps).toBe(0);
  });
});

describe('distance fusion', () => {
  it('continues from the latest GPS baseline when motion supplies a fallback step', () => {
    const withGps = recordGpsSegment(activity(), 100, '2026-08-08T10:01:00.000Z');
    const withStep = recordMotionStep(withGps, '2026-08-08T10:01:01.000Z');
    expect(withStep.distanceM).toBeCloseTo(100.72, 2);
    expect(withStep.distanceSource).toBe('MOTION');
  });

  it('does not double count a GPS segment after sensor distance was recorded', () => {
    const withSteps = Array.from({ length: 10 }).reduce<LocalActivity>((current, _, index) => recordMotionStep(current, `2026-08-08T10:00:${String(index).padStart(2, '0')}.000Z`), activity());
    const fused = recordGpsSegment({ ...withSteps, route: [{ latitude: 1, longitude: 1, accuracy: 5, altitude: null, speed: null, recordedAt: '2026-08-08T10:00:00.000Z' }] }, 8, '2026-08-08T10:00:12.000Z');
    expect(fused.distanceM).toBeCloseTo(8, 4);
    expect(fused.distanceSource).toBe('FUSED');
  });

  it('calibrates only inside plausible stride bounds', () => {
    expect(calibratedStrideM('WALK', 100, 20, 0.72)).toBeCloseTo(0.834, 6);
    expect(calibratedStrideM('RIDE', 100, 20, 0)).toBe(0);
  });
});
