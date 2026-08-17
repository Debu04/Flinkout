export type Profile = { displayName: string; bio: string | null; photoUrl: string | null; profileVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; routeVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; discoverable: boolean };
export type User = { id: string; email?: string; username: string; profile: Profile | null; isFollowing?: boolean; isSelf?: boolean };
export type SocialUser = { id: string; username: string; profile: { displayName: string; photoUrl: string | null } | null };
export type ActivityPoint = { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; altitudeAccuracy?: number | null; speed: number | null; startsNewSegment?: boolean; recordedAt: string };
export type TimelineUser = { id: string; username: string; displayName: string; photoUrl: string | null };
export type ActivityTimelineEvent = {
  id: string;
  type: 'START' | 'LIVE_STARTED' | 'COMMENT' | 'HIGH_FIVE' | 'JOINED' | 'LIVE_ENDED' | 'FINISH';
  source: 'ACTIVITY' | 'LIVE';
  createdAt: string;
  body?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  user?: TimelineUser | null;
};
export type SocialActivity = {
  id: string;
  clientId?: string;
  syncedActivityId?: string | null;
  syncStatus?: 'LOCAL' | 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  syncError?: string | null;
  type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE';
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  startedAt: string;
  endedAt: string | null;
  durationS: number;
  movingTimeS?: number;
  distanceM: number;
  steps?: number;
  averagePaceSPerKm?: number | null;
  caloriesKcal?: number;
  currentElevationM?: number | null;
  elevationGainM?: number;
  elevationLossM?: number;
  distanceSource?: 'GPS' | 'MOTION' | 'FUSED' | 'NONE';
  route: ActivityPoint[] | null;
  user: SocialUser;
  reactionCount: number;
  commentCount: number;
  reactedByViewer: boolean;
  timeline?: ActivityTimelineEvent[];
};
export type Comment = { id: string; body: string; createdAt: string; userId: string; isOwner: boolean; user: SocialUser };
export type NearbyPerson = { id: string; username: string; displayName: string; photoUrl: string | null; latitude: number; longitude: number; distanceKm: number };
export type NearbyActivity = { id: string; type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE'; startedAt: string; distanceM: number; latitude: number; longitude: number; distanceKm: number; route: ActivityPoint[] | null; user: { id: string; username: string; displayName: string; photoUrl: string | null } };
export type LiveComment = { id: string; body: string; latitude: number; longitude: number; createdAt: string; userId: string; isOwner: boolean; user: TimelineUser };
export type LiveActivity = {
  id: string;
  clientId?: string | null;
  type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE';
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  latitude: number;
  longitude: number;
  durationS: number;
  distanceM: number;
  speedKmh?: number;
  paused?: boolean;
  startedAt: string;
  lastUpdatedAt?: string;
  endedAt?: string | null;
  active?: boolean;
  joinCount: number;
  highFiveCount?: number;
  commentCount?: number;
  joinedByViewer?: boolean;
  highFivedByViewer?: boolean;
  distanceKm: number;
  user: TimelineUser;
  comments?: LiveComment[];
  latestComment?: LiveComment | null;
  timeline?: ActivityTimelineEvent[];
};
const API = '/api/v1';
const DEFAULT_TIMEOUT_MS = 12_000;

type ApiOptions = RequestInit & { timeoutMs?: number };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...requestOptions } = options;
  const controller = new AbortController();
  const requestHeaders = new Headers(headers);
  let timedOut = false;

  if (requestOptions.body != null && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${API}${path}`, {
      ...requestOptions,
      cache: 'no-store',
      credentials: 'include',
      headers: requestHeaders,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'Request failed');
    }
    return res.status === 204 ? (undefined as T) : res.json();
  } catch (cause) {
    if (timedOut) throw new Error('The server took too long to respond. Check your connection and try again.');
    throw cause;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
