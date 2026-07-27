'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type NearbyActivity, type NearbyPerson, type User } from '../lib/api';
import { useInteractions } from './interaction-provider';

const NearbyMap = dynamic(() => import('./nearby-map').then(module => module.NearbyMap), { ssr: false, loading: () => <div className="map" /> });
type Result = { people: NearbyPerson[]; activities: NearbyActivity[]; precision: string };
const preview: Result = {
  precision: 'demo',
  people: [
    { id: 'preview-marcus', username: 'marcus_moves', displayName: 'Marcus Rivera', photoUrl: null, latitude: 34.052, longitude: -118.244, distanceKm: .4 },
    { id: 'preview-elena', username: 'elena_trails', displayName: 'Elena Rodriguez', photoUrl: null, latitude: 34.058, longitude: -118.251, distanceKm: 1.2 },
  ],
  activities: [{ id: 'preview-activity', type: 'RUN', startedAt: new Date().toISOString(), distanceM: 4200, latitude: 34.055, longitude: -118.248, distanceKm: 1.8, route: null, user: { id: 'preview-marcus', username: 'marcus_moves', displayName: 'Marcus Rivera', photoUrl: null } }],
};

const buddies = [
  { username: 'marcus_moves', detail: '12.4 km this week', initial: 'M', live: true },
  { username: 'trail_seeker', detail: '8 walks shared', initial: 'T' },
  { username: 'hiking_henry', detail: 'Loves #DogFriendly', initial: 'H' },
];

export function DiscoveryExperience({ mapOnly = false }: { mapOnly?: boolean }) {
  const { notify } = useInteractions();
  const [result, setResult] = useState(preview);
  const [center, setCenter] = useState<[number, number]>([34.052, -118.244]);
  const [radius, setRadius] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DISTANCE' | 'MORNING'>('ALL');
  const [recent, setRecent] = useState(['#LakeviewPath', '@marcus_moves']);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setSearch(initial);
  }, []);

  function discover() {
    if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(async position => {
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      try {
        await api('/discovery/location', { method: 'PUT', body: JSON.stringify(location) });
        const nearby = await api<Result>(`/discovery/nearby?latitude=${location.latitude}&longitude=${location.longitude}&radiusKm=${radius}`);
        setCenter([location.latitude, location.longitude]); setResult(nearby);
      } catch { setError('Showing privacy-safe sample discovery results.'); }
      finally { setLoading(false); }
    }, () => { setLoading(false); setError('Location permission was denied. Search and sample discovery remain available.'); }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 });
  }

  async function findPeople(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    const term = search.trim();
    setRecent(current => [term, ...current.filter(value => value.toLowerCase() !== term.toLowerCase())].slice(0, 5));
    const demoUsers: User[] = buddies.filter(buddy => `${buddy.username} ${buddy.detail}`.toLowerCase().includes(term.toLowerCase().replace('@', ''))).map(buddy => ({ id: `demo-${buddy.username}`, username: buddy.username, profile: { displayName: buddy.username.split('_').map(value => value[0].toUpperCase() + value.slice(1)).join(' '), bio: buddy.detail, photoUrl: null, profileVisibility: 'PUBLIC', routeVisibility: 'PUBLIC', discoverable: true } }));
    setUsers(demoUsers);
    setError(demoUsers.length ? 'Showing matching preview profiles.' : 'No preview profiles matched. Try “trail” or “Marcus”.');
    try {
      const found = await api<{ users: User[] }>(`/users/search?q=${encodeURIComponent(term)}`);
      if (found.users.length) { setUsers(found.users); setError(''); }
    } catch { /* Keep useful preview results while the API is offline. */ }
  }

  function toggleFollow(username: string) {
    const active = following.includes(username);
    setFollowing(current => active ? current.filter(value => value !== username) : [...current, username]);
    notify(active ? `You unfollowed @${username}.` : `You’re now following @${username}.`);
  }

  if (mapOnly) return <section className="stack desktop-nearby-block">
    <section className="card discovery-controls"><div><h2>Nearby map</h2><p className="hint">Locations are approximate and privacy-safe.</p></div><label className="field">Radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label><button className="button" disabled={loading} onClick={discover}>{loading ? 'Finding nearby…' : 'Use my location'}</button></section>
    {error && <p className="demo-note">{error}</p>}<NearbyMap center={center} radiusKm={radius} people={result.people} activities={result.activities} />
  </section>;

  return <section className="discovery-page">
    <div className="discovery-filters"><button className={filter === 'ALL' ? 'selected' : ''} onClick={() => setFilter('ALL')}>All Vibes</button><button className={filter === 'DISTANCE' ? 'selected' : ''} onClick={() => setFilter('DISTANCE')}>Distance &lt; 5km</button><button className={filter === 'MORNING' ? 'selected' : ''} onClick={() => setFilter('MORNING')}>Time: Morning</button></div>
    <form className="discovery-search" onSubmit={findPeople}><label className="sr-only" htmlFor="people-search">Search people, routes, or buddies</label><span>⌕</span><input id="people-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people, routes, or buddies…" /><button className="discovery-search-button" aria-label="Search">→</button></form>
    {error && <p className="demo-note">{error}</p>}
    <section className="recent-searches"><header><h1>Recent Searches</h1>{recent.length > 0 && <button onClick={() => setRecent([])}>Clear all</button>}</header><div>{recent.length ? recent.map(value => <span className="recent-chip" key={value}><button onClick={() => setSearch(value)}>{value}</button><button aria-label={`Remove ${value} from recent searches`} onClick={() => setRecent(current => current.filter(item => item !== value))}>×</button></span>) : <p className="hint">Your recent searches will appear here.</p>}</div></section>
    {users.length > 0 && <section className="suggested-buddies"><h2>Search Results</h2>{users.map(user => <Link href={`/u/${user.username}`} className="suggested-buddy" key={user.id}><span className="avatar small">{user.profile?.displayName?.[0] ?? user.username[0]}</span><span><strong>@{user.username}</strong><small>{user.profile?.displayName}</small></span></Link>)}</section>}
    <section className="suggested-buddies"><h2>{filter === 'MORNING' ? 'Morning Movers' : filter === 'DISTANCE' ? 'Within 5 km' : 'Suggested Buddies'}</h2>{buddies.map(buddy => <article className="suggested-buddy" key={buddy.username}><Link href={`/u/${buddy.username}`} className={`avatar small ${buddy.live ? 'online' : ''}`}>{buddy.initial}</Link><span><strong>@{buddy.username}</strong><small>{buddy.detail}</small></span><button className={following.includes(buddy.username) ? 'following' : ''} aria-label={`${following.includes(buddy.username) ? 'Unfollow' : 'Follow'} @${buddy.username}`} onClick={() => toggleFollow(buddy.username)}>{following.includes(buddy.username) ? 'Following' : 'Follow'}</button></article>)}</section>
    <section className="trending-nearby"><h2>Trending Nearby</h2><div className="trending-grid"><Link href="/activities/demo-run"><span className="trend-route easy">⌁</span><strong>Canyon Rim Loop</strong><small>4.2 km</small></Link><Link href="/activities/demo-ride"><span className="trend-route scenic">⌁</span><strong>Lakeview Path</strong><small>2.8 km</small></Link></div><Link href="/activities/demo-run" className="featured-trail"><span className="trail-symbol">▲</span><span><strong>Summit Ridge</strong><p>A challenging climb with rewarding 360° views of the valley.</p><small>◷ 1h 45m · +340m</small></span><b>TOP RATED</b></Link></section>
  </section>;
}
