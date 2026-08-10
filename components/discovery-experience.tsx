'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type NearbyActivity, type NearbyPerson, type User } from '../lib/api';
import { demoActivities, demoProfiles } from '../lib/demo-data';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

const NearbyMap = dynamic(() => import('./nearby-map').then(module => module.NearbyMap), { ssr: false, loading: () => <div className="map map-loading">Loading map...</div> });
type Result = { people: NearbyPerson[]; activities: NearbyActivity[]; precision: string };
type Filter = 'ALL' | 'DISTANCE' | 'MORNING';

const preview: Result = {
  precision: 'demo',
  people: [
    { id: 'demo-sienna', username: 'sienna_trails', displayName: 'Sienna Williams', photoUrl: null, latitude: 34.052, longitude: -118.244, distanceKm: .4 },
    { id: 'demo-elena', username: 'elena_trails', displayName: 'Elena Rodriguez', photoUrl: null, latitude: 34.058, longitude: -118.251, distanceKm: 1.2 },
  ],
  activities: [{ id: 'demo-run', type: 'RUN', startedAt: demoActivities['demo-run'].activity.startedAt, distanceM: 8420, latitude: 34.055, longitude: -118.248, distanceKm: 1.8, route: demoActivities['demo-run'].activity.route, user: { id: 'demo-sienna', username: 'sienna_trails', displayName: 'Sienna Williams', photoUrl: null } }],
};

const buddies = [
  { username: 'sienna_trails', detail: '8.4 km before sunrise', initial: 'S', live: true, distanceKm: .4, morning: true },
  { username: 'elena_trails', detail: 'Community walk leader', initial: 'E', live: true, distanceKm: 1.2, morning: true },
  { username: 'trail_seeker', detail: '8 walks shared', initial: 'T', distanceKm: 3.6, morning: false },
  { username: 'hiking_henry', detail: 'Loves dog-friendly trails', initial: 'H', distanceKm: 7.8, morning: false },
];

export function DiscoveryExperience({ mapOnly = false, initialQuery = '' }: { mapOnly?: boolean; initialQuery?: string }) {
  const { notify } = useInteractions();
  const { mode } = useAppSession();
  const { state, toggleFollow, setRecentSearches } = usePreviewState();
  const [result, setResult] = useState(preview);
  const [center, setCenter] = useState<[number, number]>([34.052, -118.244]);
  const [radius, setRadius] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');

  const visibleBuddies = useMemo(() => buddies.filter(buddy => {
    if (filter === 'DISTANCE') return buddy.distanceKm < 5;
    if (filter === 'MORNING') return buddy.morning;
    return true;
  }), [filter]);

  useEffect(() => {
    setSearch(initialQuery);
    if (initialQuery.trim()) void runSearch(initialQuery.trim());
    // runSearch intentionally depends on preview data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, mode]);

  useEffect(() => {
    if (mode === 'CONNECTED') setResult({ precision: 'live', people: [], activities: [] });
    if (mode === 'PREVIEW') setResult(preview);
  }, [mode]);

  function discover() {
    if (mode !== 'CONNECTED') { setError('Sign in to use approximate nearby discovery. Sample results remain visible in preview mode.'); return; }
    if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(async position => {
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      try {
        await api('/discovery/location', { method: 'PUT', body: JSON.stringify(location) });
        const nearby = await api<Result>(`/discovery/nearby?latitude=${location.latitude}&longitude=${location.longitude}&radiusKm=${radius}`);
        setCenter([location.latitude, location.longitude]); setResult(nearby);
      } catch { setResult({ precision: 'live', people: [], activities: [] }); setError('Nearby discovery could not connect. No sample locations have been substituted.'); }
      finally { setLoading(false); }
    }, () => { setLoading(false); setError('Location permission was denied. Search and preview discovery remain available.'); }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 });
  }

  async function runSearch(term: string) {
    const normalized = term.toLowerCase().replace('@', '').replace('#', '');
    if (mode !== 'CONNECTED') {
      const demoUsers = Object.values(demoProfiles)
        .filter(item => `${item.user.username} ${item.user.profile?.displayName} ${item.user.profile?.bio}`.toLowerCase().includes(normalized))
        .map(item => item.user);
      setUsers(demoUsers);
      setError(demoUsers.length ? `Showing ${demoUsers.length} matching preview ${demoUsers.length === 1 ? 'profile' : 'profiles'}.` : `No preview profiles matched "${term}". Try "trail", "Sienna", or "walk".`);
      return;
    }
    setError('');
    setUsers([]);
    try {
      const found = await api<{ users: User[] }>(`/users/search?q=${encodeURIComponent(term)}`);
      setUsers(found.users);
      if (!found.users.length) setError(`No people matched "${term}".`);
    } catch { setError('Search could not connect. Try again when the account service is available.'); }
  }

  async function findPeople(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    setRecentSearches([term, ...state.recentSearches.filter(value => value.toLowerCase() !== term.toLowerCase())].slice(0, 5));
    await runSearch(term);
  }

  function follow(username: string) {
    const active = state.followingUsernames.includes(username);
    toggleFollow(username);
    notify(active ? `You unfollowed @${username}.` : `You are now following @${username}.`);
  }

  if (mapOnly) return <section className="stack desktop-nearby-block">
    <section className="card discovery-controls"><div><h2>Nearby map</h2><p className="hint">Locations are approximate and privacy-safe.</p></div><label className="field">Radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label><button className="button" disabled={loading} onClick={discover}>{loading ? 'Finding nearby...' : 'Use my location'}</button></section>
    {error && <p className="demo-note">{error}</p>}<NearbyMap center={center} radiusKm={radius} people={result.people} activities={result.activities} />
  </section>;

  return <section className="discovery-page">
    {mode !== 'CONNECTED' && <div className="discovery-filters" role="tablist" aria-label="Discovery filters">
      <button role="tab" aria-selected={filter === 'ALL'} className={filter === 'ALL' ? 'selected' : ''} onClick={() => setFilter('ALL')}>All Vibes <small>{buddies.length}</small></button>
      <button role="tab" aria-selected={filter === 'DISTANCE'} className={filter === 'DISTANCE' ? 'selected' : ''} onClick={() => setFilter('DISTANCE')}>Within 5 km <small>{buddies.filter(item => item.distanceKm < 5).length}</small></button>
      <button role="tab" aria-selected={filter === 'MORNING'} className={filter === 'MORNING' ? 'selected' : ''} onClick={() => setFilter('MORNING')}>Morning <small>{buddies.filter(item => item.morning).length}</small></button>
    </div>}
    <form className="discovery-search" onSubmit={findPeople}><label className="sr-only" htmlFor="people-search">Search people, routes, or buddies</label><input id="people-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people, routes, or buddies..." /><button className="discovery-search-button" aria-label="Search"><UiIcon name="search" /></button></form>
    {error && <p className="demo-note" role="status">{error}</p>}
    <section className="recent-searches"><header><h1>Recent Searches</h1>{state.recentSearches.length > 0 && <button onClick={() => setRecentSearches([])}>Clear all</button>}</header><div>{state.recentSearches.length ? state.recentSearches.map(value => <span className="recent-chip" key={value}><button onClick={() => { setSearch(value); void runSearch(value); }}>{value}</button><button aria-label={`Remove ${value} from recent searches`} onClick={() => setRecentSearches(state.recentSearches.filter(item => item !== value))}>x</button></span>) : <p className="hint">Your recent searches will appear here.</p>}</div></section>
    {users.length > 0 && <section className="suggested-buddies"><h2>Search Results</h2>{users.map(user => <Link href={`/u/${user.username}`} className="suggested-buddy" key={user.id}><span className="avatar small">{user.profile?.displayName?.[0] ?? user.username[0]}</span><span><strong>@{user.username}</strong><small>{user.profile?.displayName}</small></span></Link>)}</section>}
    {mode !== 'CONNECTED' && <section className="suggested-buddies"><h2>{filter === 'MORNING' ? 'Morning Movers' : filter === 'DISTANCE' ? 'Within 5 km' : 'Suggested Buddies'} <small>{visibleBuddies.length} people · preview</small></h2>{visibleBuddies.map(buddy => {
      const following = state.followingUsernames.includes(buddy.username);
      return <article className="suggested-buddy" key={buddy.username}><Link href={`/u/${buddy.username}`} className={`avatar small ${buddy.live ? 'online' : ''}`}>{buddy.initial}</Link><span><strong>@{buddy.username}</strong><small>{buddy.detail} - {buddy.distanceKm.toFixed(1)} km</small></span><button className={following ? 'following' : ''} aria-label={`${following ? 'Unfollow' : 'Follow'} @${buddy.username}`} aria-pressed={following} onClick={() => follow(buddy.username)}>{following ? 'Following' : 'Follow'}</button></article>;
    })}</section>}
    {mode !== 'CONNECTED' ? <section className="trending-nearby"><h2>Trending Nearby <small>Preview</small></h2><div className="trending-grid"><Link href="/activities/demo-run"><span className="trend-route easy">RUN</span><strong>Silver Creek Loop</strong><small>8.4 km</small></Link><Link href="/activities/demo-ride"><span className="trend-route scenic">RIDE</span><strong>Downtown Greenway</strong><small>5.1 km</small></Link></div><Link href="/activities/demo-hike" className="featured-trail"><span className="trail-symbol">HIKE</span><span><strong>Summit Ridge</strong><p>A challenging climb with rewarding views of the valley.</p><small>1h 48m - +412m</small></span><b>TOP RATED</b></Link></section> : !users.length && !error && <section className="card connected-discovery-empty"><UiIcon name="search" /><h2>Find your movement community</h2><p>Search by display name or username. Nearby people appear only after both privacy settings and approximate discovery allow it.</p></section>}
  </section>;
}
