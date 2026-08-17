import { distanceBetween, type ActivityType, type LocalActivity, type RoutePoint } from './activity';

export const TRACKING_THRESHOLDS = {
  maxGpsAccuracyM: 50,
  stationaryHeartbeatS: 15,
  minStepIntervalMs: 300,
  maxStepIntervalMs: 1_200,
  patternResetMs: 1_600,
  stepPeakMin: 0.55,
  stepPeakMax: 5.5,
  stepValleyMax: 0.35,
  maxRotationRate: 650,
} as const;

export type MotionSample = {
  x: number;
  y: number;
  z: number;
  includesGravity: boolean;
  timestamp: number;
  rotationRate?: number | null;
};

export type StepDetectorState = {
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  smoothedMagnitude: number;
  armed: boolean;
  lastCandidateAt: number;
  candidateIntervals: number[];
  pendingCandidateCount: number;
  walkingPattern: boolean;
  cadenceSpm: number;
  initialised: boolean;
};

export type StepDetection = {
  step: boolean;
  steps: number;
  cadenceSpm: number;
  state: StepDetectorState;
};

export type GpsSampleResult = {
  activity: LocalActivity;
  accepted: boolean;
  moving: boolean;
  reason: 'ACCEPTED' | 'BASELINE' | 'STATIONARY' | 'INACCURATE' | 'INVALID' | 'STALE' | 'IMPLAUSIBLE';
};

export const initialStepDetectorState = (): StepDetectorState => ({
  gravityX: 0,
  gravityY: 0,
  gravityZ: 0,
  smoothedMagnitude: 0,
  armed: true,
  lastCandidateAt: Number.NEGATIVE_INFINITY,
  candidateIntervals: [],
  pendingCandidateCount: 0,
  walkingPattern: false,
  cadenceSpm: 0,
  initialised: false,
});

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Detects a repeated step pattern instead of accepting a single acceleration
 * spike. Three cadence-consistent peak/valley cycles establish walking; strong
 * acceleration or rotation resets confidence so shaking is not accumulated.
 */
export function detectStep(state: StepDetectorState, sample: MotionSample): StepDetection {
  const gravityAlpha = 0.9;
  const gravityX = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityX + (1 - gravityAlpha) * sample.x : sample.x) : 0;
  const gravityY = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityY + (1 - gravityAlpha) * sample.y : sample.y) : 0;
  const gravityZ = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityZ + (1 - gravityAlpha) * sample.z : sample.z) : 0;
  const x = sample.x - gravityX;
  const y = sample.y - gravityY;
  const z = sample.z - gravityZ;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  const smoothedMagnitude = state.initialised ? state.smoothedMagnitude * 0.62 + magnitude * 0.38 : magnitude;
  const longGap = sample.timestamp - state.lastCandidateAt > TRACKING_THRESHOLDS.patternResetMs;
  const strongShake = smoothedMagnitude > TRACKING_THRESHOLDS.stepPeakMax
    || ((sample.rotationRate ?? 0) > TRACKING_THRESHOLDS.maxRotationRate && smoothedMagnitude > 2.2);

  let armed = state.armed;
  let lastCandidateAt = state.lastCandidateAt;
  let candidateIntervals = longGap ? [] : state.candidateIntervals;
  let pendingCandidateCount = longGap ? 0 : state.pendingCandidateCount;
  let walkingPattern = longGap ? false : state.walkingPattern;
  let cadenceSpm = longGap ? 0 : state.cadenceSpm;
  let acceptedSteps = 0;

  if (strongShake) {
    armed = false;
    candidateIntervals = [];
    pendingCandidateCount = 0;
    walkingPattern = false;
    cadenceSpm = 0;
  } else {
    if (smoothedMagnitude <= TRACKING_THRESHOLDS.stepValleyMax) armed = true;
    const candidate = armed && smoothedMagnitude >= TRACKING_THRESHOLDS.stepPeakMin;
    if (candidate) {
      armed = false;
      const interval = sample.timestamp - lastCandidateAt;
      const plausibleInterval = !Number.isFinite(lastCandidateAt)
        || (interval >= TRACKING_THRESHOLDS.minStepIntervalMs && interval <= TRACKING_THRESHOLDS.maxStepIntervalMs);
      const expectedInterval = candidateIntervals.length ? median(candidateIntervals) : interval;
      const cadenceConsistent = !candidateIntervals.length || Math.abs(interval - expectedInterval) <= Math.max(180, expectedInterval * 0.38);

      if (!plausibleInterval || !cadenceConsistent) {
        candidateIntervals = [];
        pendingCandidateCount = 1;
        walkingPattern = false;
        cadenceSpm = 0;
      } else if (Number.isFinite(lastCandidateAt)) {
        candidateIntervals = [...candidateIntervals.slice(-3), interval];
        cadenceSpm = 60_000 / median(candidateIntervals);
        if (walkingPattern) acceptedSteps = 1;
        else {
          pendingCandidateCount += 1;
          if (pendingCandidateCount >= 3) {
            walkingPattern = true;
            acceptedSteps = pendingCandidateCount;
            pendingCandidateCount = 0;
          }
        }
      } else {
        pendingCandidateCount = 1;
      }
      lastCandidateAt = sample.timestamp;
    }
  }

  const nextState: StepDetectorState = {
    gravityX,
    gravityY,
    gravityZ,
    smoothedMagnitude,
    armed,
    lastCandidateAt,
    candidateIntervals,
    pendingCandidateCount,
    walkingPattern,
    cadenceSpm,
    initialised: true,
  };
  return { step: acceptedSteps > 0, steps: acceptedSteps, cadenceSpm, state: nextState };
}

export function defaultStrideM(type: ActivityType) {
  // A conservative initial walking stride keeps distance-derived steps close
  // to common phone pedometers until a personal stride can be calibrated.
  return ({ WALK: 0.6, RUN: 1, HIKE: 0.62, RIDE: 0 })[type];
}

export function calibratedStrideM(type: ActivityType, gpsDistanceM: number, steps: number, currentStrideM: number) {
  if (type === 'RIDE' || gpsDistanceM < 30 || steps < 20) return currentStrideM;
  const bounds = ({ WALK: [0.45, 0.95], RUN: [0.7, 1.6], HIKE: [0.4, 0.95], RIDE: [0, 0] })[type];
  const observed = gpsDistanceM / steps;
  const bounded = Math.min(bounds[1], Math.max(bounds[0], observed));
  return currentStrideM * 0.8 + bounded * 0.2;
}

const paceBounds = (type: ActivityType): [number, number] => ({
  WALK: [300, 3_600],
  RUN: [150, 1_800],
  HIKE: [360, 3_600],
  RIDE: [0, Number.POSITIVE_INFINITY],
})[type] as [number, number];

function plausiblePace(type: ActivityType, secondsPerKm: number) {
  const [minimum, maximum] = paceBounds(type);
  return type !== 'RIDE' && secondsPerKm >= minimum && secondsPerKm <= maximum;
}

function activityMet(type: ActivityType, speedKmh: number) {
  if (type === 'WALK') return speedKmh >= 6.4 ? 5 : speedKmh >= 4.8 ? 4.3 : speedKmh >= 3.2 ? 3.5 : 2.8;
  if (type === 'RUN') return speedKmh >= 12 ? 12.8 : speedKmh >= 10 ? 11 : speedKmh >= 8 ? 9.8 : 8.3;
  if (type === 'HIKE') return speedKmh >= 5 ? 7 : 6;
  return speedKmh >= 22 ? 10 : speedKmh >= 16 ? 8 : speedKmh >= 10 ? 6.8 : 4;
}

/** MET/step estimate using a neutral 70 kg fallback until Flinkout stores user weight. */
export function estimatedCalories(type: ActivityType, movingTimeS: number, distanceM: number, weightKg = 70, steps = 0) {
  if (movingTimeS <= 0) return 0;
  const speedKmh = distanceM > 0 ? distanceM / movingTimeS * 3.6 : ({ WALK: 4, RUN: 8, HIKE: 4, RIDE: 14 })[type];
  const kcalPerMinute = activityMet(type, speedKmh) * 3.5 * weightKg / 200;
  const metEstimate = kcalPerMinute * movingTimeS / 60;
  const perStepEstimate = type === 'RIDE' ? 0 : steps * ({ WALK: 0.04, RUN: 0.06, HIKE: 0.055, RIDE: 0 })[type];
  return Math.round(Math.max(metEstimate, perStepEstimate) * 10) / 10;
}

function withDerivedMetrics(activity: LocalActivity): LocalActivity {
  const movingTimeS = activity.movingTimeS ?? 0;
  const rawAveragePace = activity.type !== 'RIDE' && activity.distanceM >= 10 && movingTimeS >= 10
    ? movingTimeS / (activity.distanceM / 1000)
    : null;
  return {
    ...activity,
    // Retain the last valid cumulative average rather than making the live pace
    // disappear when a single GPS sample is stationary or briefly noisy.
    averagePaceSPerKm: rawAveragePace && plausiblePace(activity.type, rawAveragePace)
      ? rawAveragePace
      : activity.averagePaceSPerKm ?? null,
    caloriesKcal: estimatedCalories(activity.type, movingTimeS, activity.distanceM, 70, activity.steps ?? 0),
  };
}

function advanceMovingTime(activity: LocalActivity, recordedAt: string, suggestedSeconds: number) {
  const addedSeconds = Number.isFinite(suggestedSeconds) && suggestedSeconds >= 0.2 ? suggestedSeconds : 0;
  return {
    ...activity,
    movingTimeS: (activity.movingTimeS ?? 0) + addedSeconds,
    lastMovementAt: recordedAt,
  };
}

export function recordMotionSteps(activity: LocalActivity, count: number, cadenceSpm: number, recordedAt: string): LocalActivity {
  if (activity.type === 'RIDE' || activity.status !== 'RECORDING' || count <= 0) return activity;
  const strideM = activity.strideM ?? defaultStrideM(activity.type);
  const gpsReliable = activity.gpsAvailable === true && activity.trackingMode !== 'MOTION_ONLY';
  const motionSegmentM = gpsReliable ? 0 : count * strideM;
  const sensorDistanceM = (activity.sensorDistanceM ?? 0) + motionSegmentM;
  const distanceM = activity.distanceM + motionSegmentM;
  const suggestedSeconds = cadenceSpm > 0 ? count * 60 / cadenceSpm : count * 0.6;
  const withTime = gpsReliable ? activity : advanceMovingTime(activity, recordedAt, suggestedSeconds);
  const motionSpeedMps = cadenceSpm > 0 ? cadenceSpm * strideM / 60 : 0;
  const motionPace = motionSpeedMps > 0 ? 1000 / motionSpeedMps : null;
  return withDerivedMetrics({
    ...withTime,
    steps: (activity.steps ?? 0) + count,
    cadenceSpm: Math.round(cadenceSpm),
    strideM,
    sensorDistanceM,
    sensorDistanceOffsetM: activity.sensorDistanceOffsetM ?? activity.distanceM,
    distanceM,
    distanceSource: gpsReliable ? 'FUSED' : activity.route.length ? 'FUSED' : 'MOTION',
    currentPaceSPerKm: !gpsReliable && motionPace && plausiblePace(activity.type, motionPace) ? motionPace : activity.currentPaceSPerKm,
    paceSource: !gpsReliable && motionPace ? 'MOTION_ESTIMATED' : activity.paceSource,
    trackingMode: gpsReliable ? 'GPS_MOTION' : 'MOTION_ONLY',
    lastSensorAt: recordedAt,
    updatedAt: recordedAt,
  });
}

export function recordMotionStep(activity: LocalActivity, recordedAt: string): LocalActivity {
  return recordMotionSteps(activity, 1, activity.cadenceSpm ?? 100, recordedAt);
}

function validCoordinate(point: RoutePoint) {
  return Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180
    && Number.isFinite(Date.parse(point.recordedAt));
}

const maxSpeedMps = (type: ActivityType) => ({ WALK: 3.5, RUN: 8, HIKE: 4, RIDE: 22 })[type];

function updateElevation(activity: LocalActivity, point: RoutePoint, secondsSincePrevious: number, horizontalDistanceM: number) {
  if (point.altitude === null || !Number.isFinite(point.altitude)) return activity;
  const altitudeAccuracy = point.altitudeAccuracy;
  const reliable = altitudeAccuracy !== undefined && altitudeAccuracy !== null
    ? altitudeAccuracy <= 15
    : (point.accuracy ?? Number.POSITIVE_INFINITY) <= 12;
  if (!reliable) return activity;
  const previous = activity.currentElevationM;
  if (previous === null || previous === undefined) return { ...activity, currentElevationM: point.altitude, elevationReferenceM: point.altitude };
  // Altitude readings are much noisier than horizontal GPS. Only moving
  // samples can change gain/loss, and reject changes that imply an impossible
  // vertical jump for the horizontal distance travelled.
  if (horizontalDistanceM < 8 || secondsSincePrevious <= 0) return activity;
  if (Math.abs(point.altitude - previous) > Math.max(12, horizontalDistanceM * 0.8)) return activity;
  const smoothed = previous * 0.75 + point.altitude * 0.25;
  const elevationReferenceM = activity.elevationReferenceM ?? previous;
  const delta = smoothed - elevationReferenceM;
  const reportedAccuracy = altitudeAccuracy ?? point.accuracy ?? 12;
  const noiseFloorM = Math.max(4, Math.min(8, reportedAccuracy * 0.5));
  if (Math.abs(delta) / secondsSincePrevious > 1.5 || Math.abs(delta) / horizontalDistanceM > 0.45) return activity;
  const crossedNoiseFloor = Math.abs(delta) >= noiseFloorM;
  return {
    ...activity,
    currentElevationM: smoothed,
    elevationReferenceM: crossedNoiseFloor ? smoothed : elevationReferenceM,
    elevationGainM: (activity.elevationGainM ?? 0) + (delta >= 3 ? delta : 0),
    elevationLossM: (activity.elevationLossM ?? 0) + (delta <= -3 ? Math.abs(delta) : 0),
  };
}

export function markGpsUnavailable(activity: LocalActivity, recordedAt: string): LocalActivity {
  if (activity.status !== 'RECORDING') return activity;
  return {
    ...activity,
    gpsAvailable: false,
    gpsAccuracyM: null,
    trackingMode: 'MOTION_ONLY',
    currentPaceSPerKm: activity.paceSource === 'GPS' ? null : activity.currentPaceSPerKm,
    paceSource: activity.paceSource === 'GPS' ? null : activity.paceSource,
    updatedAt: recordedAt,
  };
}

export function recordGpsSample(activity: LocalActivity, point: RoutePoint, recordedAt = point.recordedAt): GpsSampleResult {
  if (activity.status !== 'RECORDING' || !validCoordinate(point)) {
    return { activity, accepted: false, moving: false, reason: 'INVALID' };
  }
  const accuracy = point.accuracy ?? Number.POSITIVE_INFINITY;
  if (accuracy > TRACKING_THRESHOLDS.maxGpsAccuracyM) {
    return { activity: markGpsUnavailable(activity, recordedAt), accepted: false, moving: false, reason: 'INACCURATE' };
  }

  const previous = activity.route.at(-1);
  const recovering = activity.gpsAvailable === false;
  if (!previous || recovering) {
    const baseline = updateElevation({
      ...activity,
      route: [...activity.route, point],
      gpsAvailable: true,
      gpsAccuracyM: accuracy,
      lastReliableGpsAt: point.recordedAt,
      trackingMode: 'GPS_MOTION',
      gpsDistanceM: activity.distanceM,
      sensorDistanceM: 0,
      sensorDistanceOffsetM: activity.distanceM,
      distanceSource: activity.steps ? 'FUSED' : 'GPS',
      currentPaceSPerKm: null,
      paceSource: null,
      updatedAt: recordedAt,
    }, point, 0, 0);
    return { activity: withDerivedMetrics(baseline), accepted: true, moving: false, reason: 'BASELINE' };
  }

  const seconds = (Date.parse(point.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
  if (seconds <= 0) return { activity, accepted: false, moving: false, reason: 'STALE' };
  const segmentM = distanceBetween(previous, point);
  const sensorSpeed = point.speed !== null && point.speed >= 0 ? point.speed : segmentM / seconds;
  const jitterThresholdM = Math.max(3, Math.min(10, ((previous.accuracy ?? 20) + accuracy) * 0.3));
  if (sensorSpeed > maxSpeedMps(activity.type) * 1.2) {
    return { activity: { ...activity, gpsAccuracyM: accuracy }, accepted: false, moving: false, reason: 'IMPLAUSIBLE' };
  }

  if (segmentM < jitterThresholdM || sensorSpeed < 0.45) {
    const keepHeartbeat = seconds >= TRACKING_THRESHOLDS.stationaryHeartbeatS;
    const stationary: LocalActivity = {
      ...activity,
      ...(keepHeartbeat ? { route: [...activity.route, point] } : {}),
      gpsAvailable: true,
      gpsAccuracyM: accuracy,
      lastReliableGpsAt: point.recordedAt,
      trackingMode: 'GPS_MOTION',
      updatedAt: recordedAt,
    };
    return { activity: withDerivedMetrics(stationary), accepted: keepHeartbeat, moving: false, reason: 'STATIONARY' };
  }

  const withTime = advanceMovingTime(activity, recordedAt, seconds);
  const gpsDistanceM = (activity.gpsDistanceM ?? activity.distanceM) + segmentM;
  const rawPace = 1000 / (segmentM / seconds);
  const nextPace = plausiblePace(activity.type, rawPace)
    ? activity.paceSource === 'GPS' && activity.currentPaceSPerKm
      ? activity.currentPaceSPerKm * 0.65 + rawPace * 0.35
      : rawPace
    : null;
  // Calibrate against the distance already covered before this new segment;
  // using the new total with the old step count would inflate stride on every
  // GPS update and progressively undercount steps.
  const strideM = calibratedStrideM(
    activity.type,
    activity.gpsDistanceM ?? activity.distanceM,
    activity.steps ?? 0,
    activity.strideM ?? defaultStrideM(activity.type),
  );
  const gpsDerivedSteps = activity.type === 'RIDE' ? 0 : Math.floor(gpsDistanceM / strideM);
  const steps = Math.max(activity.steps ?? 0, gpsDerivedSteps);
  const moving = updateElevation({
    ...withTime,
    route: [...activity.route, point],
    distanceM: gpsDistanceM,
    gpsDistanceM,
    steps,
    strideM,
    distanceSource: steps ? 'FUSED' : 'GPS',
    currentPaceSPerKm: nextPace,
    paceSource: nextPace ? 'GPS' : null,
    gpsAvailable: true,
    gpsAccuracyM: accuracy,
    lastReliableGpsAt: point.recordedAt,
    trackingMode: 'GPS_MOTION',
    updatedAt: recordedAt,
  }, point, seconds, segmentM);
  return { activity: withDerivedMetrics(moving), accepted: true, moving: true, reason: 'ACCEPTED' };
}

export function recordGpsSegment(activity: LocalActivity, segmentM: number, recordedAt: string): LocalActivity {
  const gpsDistanceM = (activity.gpsDistanceM ?? activity.distanceM) + segmentM;
  return withDerivedMetrics({
    ...advanceMovingTime(activity, recordedAt, segmentM > 0 ? 1 : 0),
    gpsDistanceM,
    distanceM: gpsDistanceM,
    distanceSource: activity.steps ? 'FUSED' : 'GPS',
    gpsAvailable: true,
    trackingMode: 'GPS_MOTION',
    updatedAt: recordedAt,
  });
}

export function distanceSourceLabel(activity: LocalActivity) {
  return ({ GPS: 'GPS', MOTION: 'Motion estimate', FUSED: 'GPS + motion', NONE: 'Timer only' })[activity.distanceSource ?? (activity.route.length ? 'GPS' : 'NONE')];
}
