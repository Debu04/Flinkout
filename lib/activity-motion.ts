import { distanceBetween, elapsedSeconds, type ActivityType, type LocalActivity, type PaceSegment, type RoutePoint, type StepSource, type TrackingDiagnostics } from './activity';

export const GPS_ACCURACY_LIMITS_M: Record<ActivityType, number> = {
  // Android browsers commonly settle between 25 m and 50 m before improving.
  // Route jitter is handled separately, so rejecting those fixes entirely makes
  // outdoor recordings appear dead even though the phone is providing GPS.
  WALK: 50,
  RUN: 50,
  HIKE: 60,
  RIDE: 75,
};

export const TRACKING_THRESHOLDS = {
  locationStaleMs: 10_000,
  rollingPaceWindowS: 30,
  rollingPaceMinimumDurationS: 10,
  rollingPaceMinimumDistanceM: 20,
  stationaryPaceTimeoutS: 10,
  liveMetricUpdateS: 10,
  elevationUpdateS: 5,
  patternResetMs: 1_800,
  stepPeakMin: 0.45,
  stepPeakMax: 5.5,
  stepDynamicMax: 2.2,
  maxRotationRate: 650,
  altitudeAccuracyM: 20,
} as const;

/** Calibration from the user's phone tracker: 5,401 steps, 3 km and 216 kcal. */
export const PHONE_WALK_REFERENCE = {
  distanceM: 3_000,
  steps: 5_401,
  caloriesKcal: 216,
  durationS: 3_660,
} as const;

const EMPTY_DIAGNOSTICS: TrackingDiagnostics = {
  acceptedGpsPoints: 0,
  rejectedInaccuratePoints: 0,
  rejectedStationaryPoints: 0,
  rejectedImpossiblePoints: 0,
  rejectedStalePoints: 0,
  rejectedInvalidPoints: 0,
  rollingPaceDistanceM: 0,
  rollingPaceDurationS: 0,
  lastAltitudeAccuracyM: null,
};

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
  noiseMagnitude: number;
  dynamicThreshold: number;
  samplesSinceThresholdUpdate: number;
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
  noiseMagnitude: 0,
  dynamicThreshold: TRACKING_THRESHOLDS.stepPeakMin,
  samplesSinceThresholdUpdate: 0,
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cadenceIntervalBounds(type: ActivityType): [number, number] {
  return type === 'RUN' ? [250, 500] : [333, 1_333];
}

/**
 * Uses orientation-independent linear acceleration and requires a repeated,
 * cadence-consistent peak/valley pattern. The noise-derived threshold changes
 * only every ten samples and is blended gradually so ordinary phone position
 * changes do not continually retune the detector.
 */
export function detectStep(state: StepDetectorState, sample: MotionSample, type: ActivityType = 'WALK'): StepDetection {
  const gravityAlpha = 0.9;
  const gravityX = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityX + (1 - gravityAlpha) * sample.x : sample.x) : 0;
  const gravityY = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityY + (1 - gravityAlpha) * sample.y : sample.y) : 0;
  const gravityZ = sample.includesGravity ? (state.initialised ? gravityAlpha * state.gravityZ + (1 - gravityAlpha) * sample.z : sample.z) : 0;
  const x = sample.x - gravityX;
  const y = sample.y - gravityY;
  const z = sample.z - gravityZ;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  const smoothedMagnitude = state.initialised ? state.smoothedMagnitude * 0.62 + magnitude * 0.38 : magnitude;
  const boundedNoiseSample = Math.min(magnitude, 1.2);
  const noiseMagnitude = state.initialised ? state.noiseMagnitude * 0.96 + boundedNoiseSample * 0.04 : boundedNoiseSample;
  const thresholdSamples = state.samplesSinceThresholdUpdate + 1;
  const thresholdTarget = clamp(noiseMagnitude * 2.1 + 0.25, TRACKING_THRESHOLDS.stepPeakMin, TRACKING_THRESHOLDS.stepDynamicMax);
  const dynamicThreshold = thresholdSamples >= 10
    ? state.dynamicThreshold * 0.82 + thresholdTarget * 0.18
    : state.dynamicThreshold;
  const samplesSinceThresholdUpdate = thresholdSamples >= 10 ? 0 : thresholdSamples;
  const valleyThreshold = Math.min(0.65, Math.max(0.3, dynamicThreshold * 0.65));
  const longGap = sample.timestamp - state.lastCandidateAt > TRACKING_THRESHOLDS.patternResetMs;
  const strongShake = smoothedMagnitude > TRACKING_THRESHOLDS.stepPeakMax
    || ((sample.rotationRate ?? 0) > TRACKING_THRESHOLDS.maxRotationRate && smoothedMagnitude > dynamicThreshold * 1.8);

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
    if (smoothedMagnitude <= valleyThreshold) armed = true;
    const candidate = armed && smoothedMagnitude >= dynamicThreshold;
    if (candidate) {
      armed = false;
      const interval = sample.timestamp - lastCandidateAt;
      const [minimumInterval, maximumInterval] = cadenceIntervalBounds(type);
      const plausibleInterval = !Number.isFinite(lastCandidateAt) || (interval >= minimumInterval && interval <= maximumInterval);
      const expectedInterval = candidateIntervals.length ? median(candidateIntervals) : interval;
      const cadenceConsistent = !candidateIntervals.length || Math.abs(interval - expectedInterval) <= Math.max(170, expectedInterval * 0.34);

      if (!plausibleInterval || !cadenceConsistent) {
        candidateIntervals = [];
        pendingCandidateCount = 1;
        walkingPattern = false;
        cadenceSpm = 0;
      } else if (Number.isFinite(lastCandidateAt)) {
        candidateIntervals = [...candidateIntervals.slice(-4), interval];
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

  return {
    step: acceptedSteps > 0,
    steps: acceptedSteps,
    cadenceSpm,
    state: {
      gravityX,
      gravityY,
      gravityZ,
      smoothedMagnitude,
      noiseMagnitude,
      dynamicThreshold,
      samplesSinceThresholdUpdate,
      armed,
      lastCandidateAt,
      candidateIntervals,
      pendingCandidateCount,
      walkingPattern,
      cadenceSpm,
      initialised: true,
    },
  };
}

export function defaultStrideM(type: ActivityType) {
  return ({
    WALK: PHONE_WALK_REFERENCE.distanceM / PHONE_WALK_REFERENCE.steps,
    RUN: 1,
    HIKE: 0.58,
    RIDE: 0,
  })[type];
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

/**
 * Conservative movement calories. Walking uses the user's phone reference
 * (72 kcal/km); other activity types retain a MET estimate with a neutral
 * 70 kg fallback. Distance is required, so stationary time cannot add energy.
 */
export function estimatedCalories(type: ActivityType, movingTimeS: number, distanceM: number, weightKg = 70) {
  if (movingTimeS <= 0 || distanceM <= 0) return 0;
  if (type === 'WALK') {
    const referenceKcalPerKm = PHONE_WALK_REFERENCE.caloriesKcal / (PHONE_WALK_REFERENCE.distanceM / 1_000);
    return Math.round(referenceKcalPerKm * (distanceM / 1_000) * (weightKg / 70) * 10) / 10;
  }
  const speedKmh = distanceM / movingTimeS * 3.6;
  const activeMet = Math.max(0, activityMet(type, speedKmh) - 1);
  const kcalPerMinute = activeMet * 3.5 * weightKg / 200;
  return Math.round(kcalPerMinute * movingTimeS / 60 * 10) / 10;
}

export function averagePaceSeconds(type: ActivityType, distanceM: number, activeElapsedS: number) {
  return type !== 'RIDE' && distanceM > 0 && activeElapsedS > 0 ? activeElapsedS / (distanceM / 1000) : null;
}

export function averageMovingPaceSeconds(type: ActivityType, distanceM: number, movingTimeS: number) {
  return type !== 'RIDE' && distanceM > 0 && movingTimeS > 0 ? movingTimeS / (distanceM / 1000) : null;
}

export function refreshActivityMetrics(
  activity: LocalActivity,
  activeElapsedS?: number,
  options: { movementConfirmed?: boolean; forceAverage?: boolean } = {},
): LocalActivity {
  const movementConfirmed = options.movementConfirmed ?? true;
  if (!movementConfirmed && !options.forceAverage) return activity;
  const movingTimeS = activity.movingTimeS ?? 0;
  const elapsed = activeElapsedS ?? elapsedSeconds(activity, Date.parse(activity.updatedAt));
  const metricTime = Date.parse(activity.updatedAt);
  const previousMetricTime = activity.lastMetricUpdateAt ? Date.parse(activity.lastMetricUpdateAt) : Number.NEGATIVE_INFINITY;
  const averageReady = activity.distanceM >= TRACKING_THRESHOLDS.rollingPaceMinimumDistanceM
    && elapsed >= TRACKING_THRESHOLDS.rollingPaceMinimumDurationS;
  const updateAverage = options.forceAverage
    || (movementConfirmed && averageReady && metricTime - previousMetricTime >= TRACKING_THRESHOLDS.liveMetricUpdateS * 1_000);
  return {
    ...activity,
    averagePaceSPerKm: updateAverage ? averagePaceSeconds(activity.type, activity.distanceM, elapsed) : activity.averagePaceSPerKm ?? null,
    averageMovingPaceSPerKm: updateAverage ? averageMovingPaceSeconds(activity.type, activity.distanceM, movingTimeS) : activity.averageMovingPaceSPerKm ?? null,
    caloriesKcal: estimatedCalories(activity.type, movingTimeS, activity.distanceM),
    lastMetricUpdateAt: updateAverage ? activity.updatedAt : activity.lastMetricUpdateAt ?? null,
  };
}

function diagnostics(activity: LocalActivity): TrackingDiagnostics {
  return { ...EMPTY_DIAGNOSTICS, ...activity.trackingDiagnostics };
}

function reject(activity: LocalActivity, key: keyof Pick<TrackingDiagnostics, 'rejectedInaccuratePoints' | 'rejectedStationaryPoints' | 'rejectedImpossiblePoints' | 'rejectedStalePoints' | 'rejectedInvalidPoints'>) {
  const current = diagnostics(activity);
  return { ...activity, trackingDiagnostics: { ...current, [key]: current[key] + 1 } };
}

function advanceMovingTime(activity: LocalActivity, recordedAt: string, suggestedSeconds: number) {
  const addedSeconds = Number.isFinite(suggestedSeconds) && suggestedSeconds >= 0.2 ? suggestedSeconds : 0;
  return {
    ...activity,
    movingTimeS: (activity.movingTimeS ?? 0) + addedSeconds,
    lastMovementAt: recordedAt,
  };
}

function displayedDistance(activity: LocalActivity) {
  return (activity.gpsDistanceM ?? 0) + (activity.motionFallbackDistanceM ?? activity.sensorDistanceM ?? 0);
}

function reconcileDistanceAndSteps(activity: LocalActivity): LocalActivity {
  const strideM = activity.strideM ?? defaultStrideM(activity.type);
  const gpsDistanceM = activity.gpsDistanceM ?? 0;
  const motionFallbackDistanceM = activity.motionFallbackDistanceM ?? activity.sensorDistanceM ?? 0;
  const distanceM = gpsDistanceM + motionFallbackDistanceM;
  const gpsEstimatedSteps = activity.type === 'RIDE' || strideM <= 0 ? 0 : Math.floor(gpsDistanceM / strideM);
  const native = activity.stepSource === 'NATIVE';
  const motionFallbackSteps = activity.motionFallbackSteps ?? 0;
  const estimatedTotal = gpsEstimatedSteps + motionFallbackSteps;
  const steps = activity.type === 'RIDE'
    ? 0
    : native
      ? activity.nativeSteps ?? activity.steps ?? 0
      : Math.max(activity.steps ?? 0, estimatedTotal);
  const stepSource: StepSource = activity.type === 'RIDE'
    ? 'UNAVAILABLE'
    : native
      ? 'NATIVE'
      : gpsDistanceM > 0
        ? 'GPS_MOTION_ESTIMATED'
        : motionFallbackSteps > 0
          ? 'BROWSER_ESTIMATED'
          : 'UNAVAILABLE';
  const distanceSource = gpsDistanceM > 0 && motionFallbackDistanceM > 0
    ? 'FUSED'
    : motionFallbackDistanceM > 0
      ? 'MOTION'
      : gpsDistanceM > 0
        ? 'GPS'
        : 'NONE';
  return {
    ...activity,
    strideM,
    gpsDistanceM,
    motionFallbackDistanceM,
    sensorDistanceM: motionFallbackDistanceM,
    distanceM,
    gpsEstimatedSteps,
    steps,
    stepSource,
    distanceSource,
  };
}

export function recordMotionSteps(activity: LocalActivity, count: number, cadenceSpm: number, recordedAt: string, source: StepSource = 'BROWSER_ESTIMATED'): LocalActivity {
  if (activity.type === 'RIDE' || activity.status !== 'RECORDING' || count <= 0) return activity;
  const strideM = activity.strideM ?? defaultStrideM(activity.type);
  const native = source === 'NATIVE';
  const gpsReliable = activity.gpsAvailable === true && activity.trackingMode !== 'MOTION_ONLY';
  // Do not turn motion samples into distance while the first GPS fix is still
  // being acquired. Fallback estimation starts only after GPS is explicitly
  // reported unavailable; native hardware steps can still be displayed.
  const fallbackActive = activity.gpsAvailable === false && activity.trackingMode === 'MOTION_ONLY';
  const fallbackSteps = fallbackActive ? count : 0;
  const fallbackDistance = fallbackSteps * strideM;
  const suggestedSeconds = cadenceSpm > 0 ? count * 60 / cadenceSpm : count * 0.6;
  const withTime = fallbackActive ? advanceMovingTime(activity, recordedAt, suggestedSeconds) : activity;
  const motionSpeedMps = cadenceSpm > 0 ? cadenceSpm * strideM / 60 : 0;
  const motionPace = motionSpeedMps > 0 ? 1000 / motionSpeedMps : null;
  const updated = reconcileDistanceAndSteps({
    ...withTime,
    nativeSteps: (activity.nativeSteps ?? (native ? activity.steps ?? 0 : 0)) + (native ? count : 0),
    browserMotionSteps: (activity.browserMotionSteps ?? 0) + (native ? 0 : count),
    motionFallbackSteps: (activity.motionFallbackSteps ?? 0) + fallbackSteps,
    motionFallbackDistanceM: (activity.motionFallbackDistanceM ?? activity.sensorDistanceM ?? 0) + fallbackDistance,
    stepSource: native ? 'NATIVE' : activity.stepSource,
    cadenceSpm: Math.round(cadenceSpm),
    strideM,
    currentPaceSPerKm: fallbackActive && motionPace && plausiblePace(activity.type, motionPace) ? motionPace : activity.currentPaceSPerKm,
    paceSource: fallbackActive && motionPace ? 'MOTION_ESTIMATED' : activity.paceSource,
    trackingMode: gpsReliable ? 'GPS_MOTION' : fallbackActive ? 'MOTION_ONLY' : activity.trackingMode,
    lastSensorAt: recordedAt,
    updatedAt: recordedAt,
  });
  return refreshActivityMetrics(updated, undefined, { movementConfirmed: fallbackActive });
}

export function recordMotionStep(activity: LocalActivity, recordedAt: string) {
  return recordMotionSteps(activity, 1, activity.cadenceSpm ?? 100, recordedAt);
}

function validCoordinate(point: RoutePoint) {
  return Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180
    && Number.isFinite(Date.parse(point.recordedAt));
}

const maxSpeedMps = (type: ActivityType) => ({ WALK: 3.5, RUN: 8, HIKE: 4, RIDE: 22 })[type];

function updateElevation(activity: LocalActivity, point: RoutePoint, secondsSincePrevious: number, horizontalDistanceM: number) {
  const reportedAltitudeAccuracy = point.altitudeAccuracy;
  // Some Android browser providers return a real altitude but leave
  // altitudeAccuracy null. Use it only when the horizontal fix is excellent,
  // and treat it as the least-trusted accepted vertical accuracy so the normal
  // smoothing/noise floor remains conservative.
  const altitudeAccuracy = reportedAltitudeAccuracy !== undefined && reportedAltitudeAccuracy !== null && Number.isFinite(reportedAltitudeAccuracy)
    ? reportedAltitudeAccuracy
    : point.altitude !== null && Number.isFinite(point.altitude) && point.accuracy !== null && point.accuracy <= 10
      ? TRACKING_THRESHOLDS.altitudeAccuracyM
      : null;
  const currentDiagnostics = diagnostics(activity);
  const withAccuracy = {
    ...activity,
    trackingDiagnostics: {
      ...currentDiagnostics,
      lastAltitudeAccuracyM: altitudeAccuracy,
    },
  };
  if (point.altitude === null || !Number.isFinite(point.altitude) || altitudeAccuracy === null || altitudeAccuracy > TRACKING_THRESHOLDS.altitudeAccuracyM) return withAccuracy;
  const pointTime = Date.parse(point.recordedAt);
  const lastElevationTime = activity.lastElevationAt ? Date.parse(activity.lastElevationAt) : Number.NEGATIVE_INFINITY;
  if (pointTime - lastElevationTime < TRACKING_THRESHOLDS.elevationUpdateS * 1_000) return withAccuracy;
  const samples = [...(activity.altitudeSamplesM ?? []).slice(-4), point.altitude];
  const filteredAltitude = median(samples);
  const previous = activity.currentElevationM;
  if (previous === null || previous === undefined) {
    return { ...withAccuracy, altitudeSamplesM: samples, currentElevationM: filteredAltitude, elevationReferenceM: filteredAltitude, lastElevationAt: point.recordedAt };
  }
  if (Math.abs(filteredAltitude - previous) > Math.max(12, horizontalDistanceM * 0.8)) return withAccuracy;
  const smoothed = previous * 0.7 + filteredAltitude * 0.3;
  if (horizontalDistanceM <= 0 || secondsSincePrevious <= 0) {
    return { ...withAccuracy, altitudeSamplesM: samples, currentElevationM: smoothed, lastElevationAt: point.recordedAt };
  }
  const elevationReferenceM = activity.elevationReferenceM ?? previous;
  const delta = smoothed - elevationReferenceM;
  const noiseFloorM = Math.max(3, Math.min(8, altitudeAccuracy * 0.35));
  if (Math.abs(delta) / secondsSincePrevious > 1.2 || Math.abs(delta) / horizontalDistanceM > 0.4) return withAccuracy;
  const sustainedChange = Math.abs(delta) >= noiseFloorM && samples.length >= 3;
  return {
    ...withAccuracy,
    altitudeSamplesM: samples,
    currentElevationM: smoothed,
    lastElevationAt: point.recordedAt,
    elevationReferenceM: sustainedChange ? smoothed : elevationReferenceM,
    elevationGainM: (activity.elevationGainM ?? 0) + (sustainedChange && delta > 0 ? delta : 0),
    elevationLossM: (activity.elevationLossM ?? 0) + (sustainedChange && delta < 0 ? Math.abs(delta) : 0),
  };
}

export function markGpsUnavailable(activity: LocalActivity, recordedAt: string): LocalActivity {
  if (activity.status !== 'RECORDING') return activity;
  return {
    ...activity,
    gpsAvailable: false,
    gpsAccuracyM: null,
    trackingMode: 'MOTION_ONLY',
    currentPaceSPerKm: null,
    currentSpeedKmh: null,
    paceSource: null,
    recentPaceSegments: [],
    pendingGpsDurationS: 0,
    pendingGpsDisplacementM: 0,
    trackingDiagnostics: { ...diagnostics(activity), rollingPaceDistanceM: 0, rollingPaceDurationS: 0 },
    updatedAt: recordedAt,
  };
}

export function resumeActivityTracking(activity: LocalActivity, recordedAt: string): LocalActivity {
  if (activity.status !== 'PAUSED') return activity;
  return {
    ...activity,
    status: 'RECORDING',
    trackingMode: 'GPS_MOTION',
    activeSince: recordedAt,
    gpsAvailable: undefined,
    gpsAccuracyM: null,
    lastReliableGpsAt: null,
    locationBaseline: null,
    lastMovementAt: null,
    currentPaceSPerKm: null,
    currentSpeedKmh: null,
    paceSource: null,
    recentPaceSegments: [],
    pendingGpsDurationS: 0,
    pendingGpsDisplacementM: 0,
    trackingDiagnostics: { ...diagnostics(activity), rollingPaceDistanceM: 0, rollingPaceDurationS: 0 },
    updatedAt: recordedAt,
  };
}

function recentPaceSegments(activity: LocalActivity, segment: PaceSegment) {
  const cutoff = Date.parse(segment.recordedAt) - TRACKING_THRESHOLDS.rollingPaceWindowS * 1000;
  return [...(activity.recentPaceSegments ?? []), segment].filter(item => Date.parse(item.recordedAt) >= cutoff);
}

export function recordGpsSample(activity: LocalActivity, point: RoutePoint, recordedAt = point.recordedAt): GpsSampleResult {
  if (activity.status !== 'RECORDING') return { activity, accepted: false, moving: false, reason: 'INVALID' };
  if (!validCoordinate(point)) return { activity: reject(activity, 'rejectedInvalidPoints'), accepted: false, moving: false, reason: 'INVALID' };
  const pointTime = Date.parse(point.recordedAt);
  const receivedTime = Date.parse(recordedAt);
  if (Number.isFinite(receivedTime) && receivedTime - pointTime > TRACKING_THRESHOLDS.locationStaleMs) {
    return { activity: reject(activity, 'rejectedStalePoints'), accepted: false, moving: false, reason: 'STALE' };
  }
  const accuracy = point.accuracy ?? Number.POSITIVE_INFINITY;
  if (accuracy > GPS_ACCURACY_LIMITS_M[activity.type]) {
    const inaccurate = reject({ ...activity, gpsAccuracyM: Number.isFinite(accuracy) ? accuracy : null }, 'rejectedInaccuratePoints');
    return { activity: inaccurate, accepted: false, moving: false, reason: 'INACCURATE' };
  }

  // The route contains only accepted GPS points, so its last point is the
  // authoritative distance baseline. Never use a rejected stationary reading
  // here: normal walking often advances only 1-2 m per callback and repeatedly
  // rebasing to those readings prevents movement from ever reaching the jitter
  // threshold.
  const previous = activity.route.at(-1);
  const recovering = activity.gpsAvailable === false && activity.route.length > 0;
  const resuming = activity.route.length > 0 && activity.locationBaseline === null && activity.lastReliableGpsAt === null;
  if (!previous || recovering || resuming) {
    const baselinePoint = recovering || resuming ? { ...point, startsNewSegment: true } : point;
    const acceptedDiagnostics = diagnostics(activity);
    const baseline = reconcileDistanceAndSteps({
      ...activity,
      route: [...activity.route, baselinePoint],
      locationBaseline: point,
      gpsAvailable: true,
      gpsAccuracyM: accuracy,
      lastReliableGpsAt: point.recordedAt,
      trackingMode: 'GPS_MOTION',
      currentPaceSPerKm: null,
      currentSpeedKmh: null,
      paceSource: null,
      recentPaceSegments: [],
      pendingGpsDurationS: 0,
      pendingGpsDisplacementM: 0,
      trackingDiagnostics: {
        ...acceptedDiagnostics,
        acceptedGpsPoints: acceptedDiagnostics.acceptedGpsPoints + 1,
        rollingPaceDistanceM: 0,
        rollingPaceDurationS: 0,
      },
      updatedAt: recordedAt,
    });
    const elevatedBaseline = updateElevation(baseline, point, 0, 0);
    return { activity: refreshActivityMetrics(elevatedBaseline, undefined, { movementConfirmed: false }), accepted: true, moving: false, reason: 'BASELINE' };
  }

  const seconds = (pointTime - Date.parse(previous.recordedAt)) / 1000;
  if (seconds <= 0) return { activity: reject(activity, 'rejectedStalePoints'), accepted: false, moving: false, reason: 'STALE' };
  const observationBaseline = activity.locationBaseline ?? previous;
  const observationSeconds = Math.max(0, (pointTime - Date.parse(observationBaseline.recordedAt)) / 1_000);
  const observationDistanceM = distanceBetween(observationBaseline, point);
  const segmentM = distanceBetween(previous, point);
  const coordinateSpeed = segmentM / seconds;
  const recentMotion = activity.lastSensorAt
    && pointTime - Date.parse(activity.lastSensorAt) <= 5_000
    && (activity.cadenceSpm ?? 0) >= (activity.type === 'RUN' ? 120 : 45);
  const preciseMotionFix = Boolean(recentMotion && accuracy <= 15 && (previous.accuracy ?? 100) <= 15);
  const jitterThresholdM = preciseMotionFix
    ? Math.max(1.5, Math.min(3, ((previous.accuracy ?? 20) + accuracy) * 0.12))
    : Math.max(3, Math.min(9, ((previous.accuracy ?? 20) + accuracy) * 0.28));
  // Browser-reported speed is frequently zero or briefly wrong on Android.
  // Coordinate displacement is the authoritative movement signal, so a bad
  // reported speed must not veto an otherwise plausible route segment.
  if (coordinateSpeed > maxSpeedMps(activity.type) * 1.2) {
    const impossible = reject({ ...activity, gpsAccuracyM: accuracy }, 'rejectedImpossiblePoints');
    return { activity: impossible, accepted: false, moving: false, reason: 'IMPLAUSIBLE' };
  }

  if (segmentM < jitterThresholdM || coordinateSpeed < (preciseMotionFix ? 0.08 : 0.15)) {
    const idleSeconds = activity.lastMovementAt ? (pointTime - Date.parse(activity.lastMovementAt)) / 1000 : Number.POSITIVE_INFINITY;
    const stationaryDiagnostics = diagnostics(activity);
    const pendingProgress = segmentM > (activity.pendingGpsDisplacementM ?? 0) + 0.2;
    const observationSpeed = observationSeconds > 0 ? observationDistanceM / observationSeconds : 0;
    const plausiblePendingMovement = pendingProgress && observationSpeed >= 0.15 && observationSpeed <= maxSpeedMps(activity.type) * 1.2;
    const stationaryBase: LocalActivity = {
      ...activity,
      locationBaseline: point,
      gpsAvailable: true,
      gpsAccuracyM: accuracy,
      lastReliableGpsAt: point.recordedAt,
      trackingMode: 'GPS_MOTION',
      currentPaceSPerKm: idleSeconds >= TRACKING_THRESHOLDS.stationaryPaceTimeoutS ? null : activity.currentPaceSPerKm,
      currentSpeedKmh: idleSeconds >= TRACKING_THRESHOLDS.stationaryPaceTimeoutS ? null : activity.currentSpeedKmh,
      paceSource: idleSeconds >= TRACKING_THRESHOLDS.stationaryPaceTimeoutS ? null : activity.paceSource,
      recentPaceSegments: idleSeconds >= TRACKING_THRESHOLDS.stationaryPaceTimeoutS ? [] : activity.recentPaceSegments,
      pendingGpsDurationS: plausiblePendingMovement ? (activity.pendingGpsDurationS ?? 0) + observationSeconds : 0,
      pendingGpsDisplacementM: plausiblePendingMovement ? segmentM : 0,
      trackingDiagnostics: {
        ...stationaryDiagnostics,
        rejectedStationaryPoints: stationaryDiagnostics.rejectedStationaryPoints + 1,
        ...(idleSeconds >= TRACKING_THRESHOLDS.stationaryPaceTimeoutS ? { rollingPaceDistanceM: 0, rollingPaceDurationS: 0 } : {}),
      },
      updatedAt: recordedAt,
    };
    const stationary = updateElevation(stationaryBase, point, observationSeconds, 0);
    return { activity: stationary, accepted: false, moving: false, reason: 'STATIONARY' };
  }

  const pendingDurationS = Math.min(activity.pendingGpsDurationS ?? 0, seconds);
  const movementDurationS = Math.max(0.2, Math.min(seconds, pendingDurationS + (observationSeconds > 0 ? observationSeconds : seconds)));
  const segments = recentPaceSegments(activity, { distanceM: segmentM, durationS: movementDurationS, recordedAt: point.recordedAt });
  const rollingDistanceM = segments.reduce((total, segment) => total + segment.distanceM, 0);
  const rollingDurationS = segments.reduce((total, segment) => total + segment.durationS, 0);
  const rawCurrentPace = rollingDurationS >= TRACKING_THRESHOLDS.rollingPaceMinimumDurationS && rollingDistanceM >= TRACKING_THRESHOLDS.rollingPaceMinimumDistanceM
    ? rollingDurationS / (rollingDistanceM / 1000)
    : null;
  const currentPaceSPerKm = rawCurrentPace && plausiblePace(activity.type, rawCurrentPace)
    ? activity.paceSource === 'GPS' && activity.currentPaceSPerKm
      ? activity.currentPaceSPerKm * 0.7 + rawCurrentPace * 0.3
      : rawCurrentPace
    : null;
  const rawCurrentSpeedKmh = rollingDurationS >= TRACKING_THRESHOLDS.rollingPaceMinimumDurationS && rollingDistanceM >= TRACKING_THRESHOLDS.rollingPaceMinimumDistanceM
    ? rollingDistanceM / rollingDurationS * 3.6
    : null;
  const currentSpeedKmh = activity.type === 'RIDE' && rawCurrentSpeedKmh
    ? activity.currentSpeedKmh
      ? activity.currentSpeedKmh * 0.7 + rawCurrentSpeedKmh * 0.3
      : rawCurrentSpeedKmh
    : null;
  const gpsDistanceM = (activity.gpsDistanceM ?? 0) + segmentM;
  const acceptedDiagnostics = diagnostics(activity);
  const movingBase = reconcileDistanceAndSteps({
    ...advanceMovingTime(activity, recordedAt, movementDurationS),
    route: [...activity.route, point],
    locationBaseline: point,
    gpsDistanceM,
    currentPaceSPerKm,
    currentSpeedKmh,
    paceSource: currentPaceSPerKm ? 'GPS' : null,
    gpsAvailable: true,
    gpsAccuracyM: accuracy,
    lastReliableGpsAt: point.recordedAt,
    trackingMode: 'GPS_MOTION',
    recentPaceSegments: segments,
    pendingGpsDurationS: 0,
    pendingGpsDisplacementM: 0,
    trackingDiagnostics: {
      ...acceptedDiagnostics,
      acceptedGpsPoints: acceptedDiagnostics.acceptedGpsPoints + 1,
      rollingPaceDistanceM: rollingDistanceM,
      rollingPaceDurationS: rollingDurationS,
    },
    updatedAt: recordedAt,
  });
  const moving = updateElevation(movingBase, point, movementDurationS, segmentM);
  return { activity: refreshActivityMetrics(moving), accepted: true, moving: true, reason: 'ACCEPTED' };
}

export function recordGpsSegment(activity: LocalActivity, segmentM: number, recordedAt: string): LocalActivity {
  if (activity.status !== 'RECORDING' || segmentM <= 0) return activity;
  const updated = reconcileDistanceAndSteps({
    ...advanceMovingTime(activity, recordedAt, 1),
    gpsDistanceM: (activity.gpsDistanceM ?? 0) + segmentM,
    gpsAvailable: true,
    trackingMode: 'GPS_MOTION',
    updatedAt: recordedAt,
  });
  return refreshActivityMetrics(updated);
}

export function distanceSourceLabel(activity: LocalActivity) {
  return ({ GPS: 'GPS', MOTION: 'Motion estimate', FUSED: 'GPS + motion estimate', NONE: 'Timer only' })[activity.distanceSource ?? (displayedDistance(activity) > 0 ? 'GPS' : 'NONE')];
}
