import type { ActivityType, LocalActivity } from './activity';

export type MotionSample = {
  x: number;
  y: number;
  z: number;
  includesGravity: boolean;
  timestamp: number;
};

export type StepDetectorState = {
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  smoothedMagnitude: number;
  aboveThreshold: boolean;
  lastStepAt: number;
  initialised: boolean;
};

export const initialStepDetectorState = (): StepDetectorState => ({
  gravityX: 0,
  gravityY: 0,
  gravityZ: 0,
  smoothedMagnitude: 0,
  aboveThreshold: false,
  lastStepAt: Number.NEGATIVE_INFINITY,
  initialised: false,
});

export function detectStep(state: StepDetectorState, sample: MotionSample) {
  const gravityAlpha = 0.88;
  const gravityX = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityX + (1 - gravityAlpha) * sample.x : sample.x) : 0;
  const gravityY = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityY + (1 - gravityAlpha) * sample.y : sample.y) : 0;
  const gravityZ = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityZ + (1 - gravityAlpha) * sample.z : sample.z) : 0;
  const x = sample.x - gravityX;
  const y = sample.y - gravityY;
  const z = sample.z - gravityZ;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  const smoothedMagnitude = state.initialised ? state.smoothedMagnitude * 0.55 + magnitude * 0.45 : magnitude;
  const reset = smoothedMagnitude < 0.55;
  const aboveThreshold = reset ? false : state.aboveThreshold;
  const step = !aboveThreshold && smoothedMagnitude >= 1.15 && sample.timestamp - state.lastStepAt >= 280;

  return {
    step,
    state: {
      gravityX,
      gravityY,
      gravityZ,
      smoothedMagnitude,
      aboveThreshold: aboveThreshold || step,
      lastStepAt: step ? sample.timestamp : state.lastStepAt,
      initialised: true,
    } satisfies StepDetectorState,
  };
}

export function defaultStrideM(type: ActivityType) {
  return ({ WALK: 0.72, RUN: 1.05, HIKE: 0.65, RIDE: 0 })[type];
}

export function calibratedStrideM(type: ActivityType, gpsDistanceM: number, steps: number, currentStrideM: number) {
  if (type === 'RIDE' || gpsDistanceM < 30 || steps < 20) return currentStrideM;
  const bounds = ({ WALK: [0.45, 1.1], RUN: [0.7, 1.6], HIKE: [0.4, 0.95], RIDE: [0, 0] })[type];
  const observed = gpsDistanceM / steps;
  const bounded = Math.min(bounds[1], Math.max(bounds[0], observed));
  return currentStrideM * 0.7 + bounded * 0.3;
}

export function recordMotionStep(activity: LocalActivity, recordedAt: string): LocalActivity {
  if (activity.type === 'RIDE') return activity;
  const strideM = activity.strideM ?? defaultStrideM(activity.type);
  const sensorDistanceM = (activity.sensorDistanceM ?? 0) + strideM;
  const sensorDistanceOffsetM = activity.sensorDistanceOffsetM ?? activity.distanceM;
  const gpsDistanceM = activity.gpsDistanceM ?? 0;
  return {
    ...activity,
    steps: (activity.steps ?? 0) + 1,
    strideM,
    sensorDistanceM,
    sensorDistanceOffsetM,
    gpsDistanceM,
    distanceM: Math.max(gpsDistanceM, sensorDistanceOffsetM + sensorDistanceM),
    distanceSource: activity.route.length ? 'FUSED' : 'MOTION',
    lastSensorAt: recordedAt,
    updatedAt: recordedAt,
  };
}

export function recordGpsSegment(activity: LocalActivity, segmentM: number, recordedAt: string): LocalActivity {
  const gpsDistanceM = (activity.gpsDistanceM ?? activity.distanceM) + segmentM;
  const steps = activity.steps ?? 0;
  const strideM = calibratedStrideM(activity.type, gpsDistanceM, steps, activity.strideM ?? defaultStrideM(activity.type));
  const sensorDistanceM = activity.sensorDistanceM ?? 0;
  const sensorDistanceOffsetM = Math.max(activity.sensorDistanceOffsetM ?? 0, gpsDistanceM - sensorDistanceM);
  return {
    ...activity,
    gpsDistanceM,
    strideM,
    sensorDistanceM,
    sensorDistanceOffsetM,
    distanceM: Math.max(gpsDistanceM, sensorDistanceOffsetM + sensorDistanceM),
    distanceSource: steps ? 'FUSED' : 'GPS',
    updatedAt: recordedAt,
  };
}

export function distanceSourceLabel(activity: LocalActivity) {
  return ({ GPS: 'GPS', MOTION: 'Motion estimate', FUSED: 'GPS + motion', NONE: 'Timer only' })[activity.distanceSource ?? (activity.route.length ? 'GPS' : 'NONE')];
}
