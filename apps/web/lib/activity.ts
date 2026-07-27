export const ACTIVITY_TYPES = ['WALK', 'RUN', 'RIDE', 'HIKE'] as const;
export const VISIBILITIES = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];
export type ActivityVisibility = typeof VISIBILITIES[number];
export type RecordingStatus = 'RECORDING' | 'PAUSED' | 'FINISHED';
export type SyncStatus = 'LOCAL' | 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
export type RoutePoint = { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; recordedAt: string };
export type LocalActivity = { clientId: string; type: ActivityType; visibility: ActivityVisibility; status: RecordingStatus; syncStatus: SyncStatus; syncError: string | null; syncedActivityId: string | null; lastSyncAttemptAt: string | null; startedAt: string; endedAt: string | null; elapsedBeforePauseS: number; activeSince: string | null; distanceM: number; route: RoutePoint[]; createdAt: string; updatedAt: string };

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
export function formatPace(distanceM: number, seconds: number) { if (!distanceM || !seconds) return '—'; const s = Math.round(seconds / (distanceM / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`; }
export function labelFor(type: ActivityType) { return ({ WALK: 'Walk', RUN: 'Run', RIDE: 'Ride', HIKE: 'Hike' })[type]; }
