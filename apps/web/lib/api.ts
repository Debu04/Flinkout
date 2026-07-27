export type Profile = { displayName: string; bio: string | null; photoUrl: string | null; profileVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; routeVisibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; discoverable: boolean };
export type User = { id: string; email?: string; username: string; profile: Profile | null; isFollowing?: boolean; isSelf?: boolean };
export type SocialUser = { id: string; username: string; profile: { displayName: string; photoUrl: string | null } | null };
export type ActivityPoint = { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; recordedAt: string };
export type SocialActivity = { id: string; type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE'; visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; startedAt: string; endedAt: string | null; durationS: number; distanceM: number; route: ActivityPoint[] | null; user: SocialUser; reactionCount: number; commentCount: number; reactedByViewer: boolean };
export type Comment = { id: string; body: string; createdAt: string; userId: string; isOwner: boolean; user: SocialUser };
export type NearbyPerson = { id: string; username: string; displayName: string; photoUrl: string | null; latitude: number; longitude: number; distanceKm: number };
export type NearbyActivity = { id: string; type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE'; startedAt: string; distanceM: number; latitude: number; longitude: number; distanceKm: number; route: ActivityPoint[] | null; user: { id: string; username: string; displayName: string; photoUrl: string | null } };
export type LiveActivity = { id: string; type: 'WALK' | 'RUN' | 'RIDE' | 'HIKE'; visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'; latitude: number; longitude: number; durationS: number; distanceM: number; startedAt: string; joinCount: number; distanceKm: number; user: { id: string; username: string; displayName: string; photoUrl: string | null } };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error ?? 'Request failed'); }
  return res.status === 204 ? (undefined as T) : res.json();
}
