'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type LiveActivity, type NearbyActivity, type NearbyPerson } from '../lib/api';
import { demoActivities } from '../lib/demo-data';
import { useAppSession, useInteractions } from './interaction-provider';
import { UiIcon } from './ui-icon';

const NearbyMap = dynamic(() => import('./nearby-map').then(module => module.NearbyMap), { ssr: false, loading: () => <div className="map mobile-map-canvas map-loading">Loading nearby map...</div> });
const HeatMap = dynamic(() => import('./heat-map').then(module => module.HeatMap), { ssr: false, loading: () => <div className="map mobile-map-canvas map-loading">Loading activity density...</div> });

const previewPeople: NearbyPerson[] = [
  { id: 'sienna', username: 'sienna_trails', displayName: 'Sienna Williams', photoUrl: null, latitude: 34.052, longitude: -118.244, distanceKm: .4 },
  { id: 'elena', username: 'elena_trails', displayName: 'Elena Rodriguez', photoUrl: null, latitude: 34.044, longitude: -118.233, distanceKm: 1.2 },
];
const previewActivities: NearbyActivity[] = [
  { id: 'demo-run', type: 'RUN', startedAt: demoActivities['demo-run'].activity.startedAt, distanceM: 8420, latitude: 34.058, longitude: -118.24, distanceKm: .7, route: demoActivities['demo-run'].activity.route, user: { id: 'demo-sienna', username: 'sienna_trails', displayName: 'Silver Creek Run', photoUrl: null } },
  { id: 'demo-ride', type: 'RIDE', startedAt: demoActivities['demo-ride'].activity.startedAt, distanceM: 5100, latitude: 34.047, longitude: -118.254, distanceKm: 1.8, route: demoActivities['demo-ride'].activity.route, user: { id: 'demo-james', username: 'james_moves', displayName: 'Greenway Ride', photoUrl: null } },
];

export function MobileMapExperience() {
  const [center, setCenter] = useState<[number, number]>([34.052, -118.244]);
  const [radius, setRadius] = useState(5);
  const [tileMode, setTileMode] = useState<'street' | 'topo'>('street');
  const [layer, setLayer] = useState<'NEARBY' | 'HEAT'>('NEARBY');
  const [located, setLocated] = useState(false);
  const [liveSessions, setLiveSessions] = useState<LiveActivity[]>([]);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useInteractions();
  const { mode, viewer } = useAppSession();
  const people = mode === 'CONNECTED'
    ? liveSessions.map(session => ({ id: session.user.id, username: session.user.username, displayName: session.user.displayName, photoUrl: session.user.photoUrl, latitude: session.latitude, longitude: session.longitude, distanceKm: session.distanceKm }))
    : previewPeople;
  const activities = mode === 'CONNECTED' ? [] : previewActivities;

  function locate() {
    if (mode !== 'CONNECTED') {
      notify('Sign in to discover active people near your approximate location.');
      return;
    }
    if (!navigator.geolocation) { notify('Location is unavailable in this browser.'); return; }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(position => {
      const nextCenter: [number, number] = [position.coords.latitude, position.coords.longitude];
      setCenter(nextCenter);
      setLocated(true);
      void loadNearby(nextCenter, radius);
    }, () => {
      setLoading(false);
      setError('Location permission was denied. Enable approximate location to find live activities.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  async function loadNearby(nextCenter: [number, number], nextRadius: number) {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ live: LiveActivity[] }>(`/live/nearby?latitude=${nextCenter[0]}&longitude=${nextCenter[1]}&radiusKm=${nextRadius}`);
      setLiveSessions(response.live);
      notify(response.live.length ? `Found ${response.live.length} live ${response.live.length === 1 ? 'activity' : 'activities'} nearby.` : 'No active live activities were found in this area.');
    } catch (cause) {
      setLiveSessions([]);
      setError(cause instanceof Error ? cause.message : 'Nearby live activities could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mode === 'CONNECTED' && located) void loadNearby(center, radius);
    // Radius changes refresh the last user-approved location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  async function toggleJoin(session: LiveActivity) {
    const joined = joinedIds.includes(session.id);
    try {
      await api(`/live/${session.id}/join`, { method: joined ? 'DELETE' : 'POST' });
      setJoinedIds(current => joined ? current.filter(id => id !== session.id) : [...current, session.id]);
      setLiveSessions(current => current.map(item => item.id === session.id ? { ...item, joinCount: Math.max(0, item.joinCount + (joined ? -1 : 1)) } : item));
      notify(joined ? `You left ${session.user.displayName}'s live activity.` : `You joined ${session.user.displayName}'s live activity.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The live activity could not be updated.');
    }
  }

  return <section className="mobile-discovery-map unified-map-page">
    <header className="map-experience-toolbar">
      <div><span className="eyebrow">{mode === 'CONNECTED' ? 'PRIVACY-SAFE DISCOVERY' : 'INTERACTIVE PREVIEW'}</span><h1>Explore movement nearby</h1><p>{mode === 'CONNECTED' ? 'Location is used only when you choose Locate.' : 'Sample people and routes demonstrate how nearby discovery works.'}</p></div>
      <div className="map-layer-tabs" role="tablist" aria-label="Map layers"><button role="tab" aria-selected={layer === 'NEARBY'} onClick={() => setLayer('NEARBY')}>Nearby</button><button role="tab" aria-selected={layer === 'HEAT'} onClick={() => setLayer('HEAT')}>Heatmap</button></div>
    </header>
    <div className="map-experience-canvas">
      {layer === 'NEARBY' ? <NearbyMap center={center} people={people} activities={activities} radiusKm={radius} tileMode={tileMode} /> : <HeatMap embedded />}
      {layer === 'NEARBY' && <div className="map-floating-controls"><button aria-label={`Use ${tileMode === 'street' ? 'topographic' : 'street'} map`} aria-pressed={tileMode === 'topo'} onClick={() => { const next = tileMode === 'street' ? 'topo' : 'street'; setTileMode(next); notify(`Switched to ${next === 'topo' ? 'topographic' : 'street'} map.`); }}>{tileMode === 'street' ? 'Topo' : 'Street'}</button><button aria-label="Find live activities near my location" onClick={locate} disabled={loading}>{loading ? 'Finding…' : 'Locate'}</button></div>}
    </div>
    <aside className="map-results-sheet">
      <header><div><small>{layer === 'NEARBY' ? mode === 'CONNECTED' ? 'LIVE NEARBY' : 'PREVIEW AREA' : 'AGGREGATED ACTIVITY'}</small><strong>{layer === 'NEARBY' ? loading ? 'Finding activities…' : mode === 'CONNECTED' && !located ? 'Choose Locate to begin' : `${liveSessions.length || people.length + activities.length} results` : 'Privacy threshold: 5+'}</strong></div>{layer === 'NEARBY' && <label>Radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label>}</header>
      {error && <p className="map-error" role="alert">{error}</p>}
      {layer === 'NEARBY' ? <div className="map-result-list">
        {mode === 'CONNECTED' && liveSessions.map(session => <article className="map-result-card live-result-card" key={session.id}><span className="avatar small online">{session.user.displayName[0]}</span><span><strong>{session.user.displayName}</strong><small>{session.type.toLowerCase()} · approx. {session.distanceKm.toFixed(1)} km · {session.joinCount} joined</small></span>{session.user.id === viewer.id ? <b>Your live</b> : <button className={joinedIds.includes(session.id) ? 'joined' : ''} onClick={() => void toggleJoin(session)}>{joinedIds.includes(session.id) ? 'Leave' : 'Join'}</button>}</article>)}
        {mode !== 'CONNECTED' && people.map(person => <Link href={`/u/${person.username}`} className="map-result-card" key={person.id}><span className="avatar small online">{person.displayName[0]}</span><span><strong>{person.displayName}</strong><small>Sample person · approx. {person.distanceKm.toFixed(1)} km</small></span><b>View</b></Link>)}
        {activities.map(activity => <Link href={`/activities/${activity.id}`} className="map-result-card" key={activity.id}><span className="map-result-type">{activity.type}</span><span><strong>{activity.user.displayName}</strong><small>{(activity.distanceM / 1000).toFixed(1)} km route - approx. {activity.distanceKm.toFixed(1)} km away</small></span><b>Open</b></Link>)}
        {mode === 'CONNECTED' && located && !loading && !liveSessions.length && <div className="map-empty-state"><UiIcon name="radio" size={24} /><strong>No one is live nearby</strong><span>Increase the radius or check again later.</span></div>}
      </div> : <p className="map-privacy-note">Only aggregated public routes are shown. Exact start/end points and individual identities are excluded from heatmap data.</p>}
    </aside>
  </section>;
}
