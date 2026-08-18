import type { ActivityTimelineEvent } from './api';

export const ACTIVITY_TYPES = ['WALK', 'RUN', 'RIDE', 'HIKE'] as const;
export const VISIBILITIES = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];
export type ActivityVisibility = typeof VISIBILITIES[number];
export type RecordingStatus = 'RECORDING' | 'PAUSED' | 'FINISHED';
export type SyncStatus = 'LOCAL' | 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
export type DistanceSource = 'GPS' | 'MOTION' | 'FUSED' | 'NONE';
export type TrackingMode = 'GPS_MOTION' | 'MOTION_ONLY' | 'PAUSED';
export type PaceSource = 'GPS' | 'MOTION_ESTIMATED';
export type StepSource = 'NATIVE' | 'GPS_MOTION_ESTIMATED' | 'BROWSER_ESTIMATED' | 'UNAVAILABLE';
export type PaceSegment = { distanceM: number; durationS: number; recordedAt: string };
export type TrackingDiagnostics = {
  acceptedGpsPoints: number;
  rejectedInaccuratePoints: number;
  rejectedStationaryPoints: number;
  rejectedImpossiblePoints: number;
  rejectedStalePoints: number;
  rejectedInvalidPoints: number;
  rollingPaceDistanceM: number;
  rollingPaceDurationS: number;
  lastAltitudeAccuracyM: number | null;
};
export type RoutePoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy?: number | null;
  speed: number | null;
  startsNewSegment?: boolean;
  recordedAt: string;
};
export type LocalActivity = {
  clientId: string;
  ownerId?: string;
  type: ActivityType;
  visibility: ActivityVisibility;
  status: RecordingStatus;
  published: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncedActivityId: string | null;
  lastSyncAttemptAt: string | null;
  startedAt: string;
  endedAt: string | null;
  elapsedBeforePauseS: number;
  activeSince: string | null;
  movingTimeS?: number;
  lastMovementAt?: string | null;
  distanceM: number;
  gpsDistanceM?: number;
  motionFallbackDistanceM?: number;
  sensorDistanceM?: number;
  sensorDistanceOffsetM?: number;
  steps?: number;
  nativeSteps?: number;
  browserMotionSteps?: number;
  gpsEstimatedSteps?: number;
  motionFallbackSteps?: number;
  stepSource?: StepSource;
  cadenceSpm?: number;
  strideM?: number;
  distanceSource?: DistanceSource;
  currentPaceSPerKm?: number | null;
  currentSpeedKmh?: number | null;
  averagePaceSPerKm?: number | null;
  averageMovingPaceSPerKm?: number | null;
  paceSource?: PaceSource | null;
  caloriesKcal?: number;
  currentElevationM?: number | null;
  elevationReferenceM?: number | null;
  elevationGainM?: number;
  elevationLossM?: number;
  altitudeSamplesM?: number[];
  trackingMode?: TrackingMode;
  gpsAvailable?: boolean;
  gpsAccuracyM?: number | null;
  lastReliableGpsAt?: string | null;
  lastSensorAt?: string | null;
  locationBaseline?: RoutePoint | null;
  recentPaceSegments?: PaceSegment[];
  trackingDiagnostics?: TrackingDiagnostics;
  route: RoutePoint[];
  liveRequested?: boolean;
  liveSessionId?: string | null;
  liveEndStatus?: 'ENDED' | 'UNCONFIRMED' | null;
  timeline?: ActivityTimelineEvent[];
  createdAt: string;
  updatedAt: string;
};

const earthRadiusM = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;
export function distanceBetween(a: Pick<RoutePoint, 'latitude' | 'longitude'>, b: Pick<RoutePoint, 'latitude' | 'longitude'>) {
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function shouldKeepPoint(previous: RoutePoint | undefined, next: RoutePoint) {
  if (!previous) return true;
  const distance = distanceBetween(previous, next);
  const seconds = (Date.parse(next.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
  // Reject obviously inaccurate jumps, but retain a point every 10 seconds while stationary.
  return (distance >= 3 && (seconds <= 0 || distance / seconds < 18)) || seconds >= 10;
}
export function elapsedSeconds(activity: LocalActivity, now = Date.now()) {
  const active = activity.status === 'RECORDING' && activity.activeSince ? (now - Date.parse(activity.activeSince)) / 1000 : 0;
  return Math.max(0, Math.floor(activity.elapsedBeforePauseS + active));
}
export function formatDuration(seconds: number) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
export function formatDistance(meters: number) { return `${(meters / 1000).toFixed(meters < 1000 ? 2 : 1)} km`; }
export function averageSpeedKmh(distanceM: number, seconds: number) { return seconds ? distanceM / seconds * 3.6 : 0; }
export function formatPaceSeconds(secondsPerKm: number | null | undefined) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '--';
  const seconds = Math.round(secondsPerKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /km`;
}
export function formatPace(distanceM: number, seconds: number) {
  return formatPaceSeconds(distanceM > 0 && seconds > 0 ? seconds / (distanceM / 1000) : null);
}
export function labelFor(type: ActivityType) { return ({ WALK: 'Walk', RUN: 'Run', RIDE: 'Ride', HIKE: 'Hike' })[type]; }
