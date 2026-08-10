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
  const [nearbyPeople, setNearbyPeople] = useState<NearbyPerson[]>([]);
  const [nearbyActivities, setNearbyActivities] = useState<NearbyActivity[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveActivity[]>([]);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useInteractions();
  const { mode, viewer } = useAppSession();
  const people = mode === 'CONNECTED' ? nearbyPeople : previewPeople;
  const activities = mode === 'CONNECTED' ? nearbyActivities : previewActivities;
  const resultCount = people.length + activities.length + liveSessions.length;

  async function loadNearby(nextCenter: [number, number], nextRadius: number, announce = true, saveLocation = false) {
    setLoading(true);
    setError('');
    const coordinates = `latitude=${nextCenter[0]}&longitude=${nextCenter[1]}&radiusKm=${nextRadius}`;
    const [discoveryResult, liveResult, locationResult] = await Promise.allSettled([
      api<{ people: NearbyPerson[]; activities: NearbyActivity[] }>(`/discovery/nearby?${coordinates}`),
      api<{ live: LiveActivity[] }>(`/live/nearby?${coordinates}`),
      saveLocation
        ? api<{ saved: boolean }>('/discovery/location', {
          method: 'PUT',
          body: JSON.stringify({ latitude: nextCenter[0], longitude: nextCenter[1] }),
        })
        : Promise.resolve({ saved: false }),
    ]);

    const nextPeople = discoveryResult.status === 'fulfilled' ? discoveryResult.value.people : [];
    const nextActivities = discoveryResult.status === 'fulfilled' ? discoveryResult.value.activities : [];
    const nextLive = liveResult.status === 'fulfilled' ? liveResult.value.live : [];
    setNearbyPeople(nextPeople);
    setNearbyActivities(nextActivities);
    setLiveSessions(nextLive);
    setJoinedIds(nextLive.filter(session => session.joinedByViewer).map(session => session.id));

    const failedSearches = [discoveryResult, liveResult].filter(result => result.status === 'rejected');
    if (failedSearches.length === 2) {
      const cause = discoveryResult.status === 'rejected'
        ? discoveryResult.reason
        : liveResult.status === 'rejected'
          ? liveResult.reason
          : null;
      setError(cause instanceof Error ? cause.message : 'Nearby activities could not be loaded.');
    } else if (failedSearches.length === 1) {
      setError('Some nearby results could not be refreshed. The available results are still shown.');
    } else if (saveLocation && locationResult.status === 'rejected') {
      setError('Nearby results loaded, but your approximate discovery location could not be updated.');
    }

    const total = nextPeople.length + nextActivities.length + nextLive.length;
    if (announce) notify(total ? `Found ${total} nearby ${total === 1 ? 'result' : 'results'}.` : 'No nearby activities or people were found in this area.');
    setLoading(false);
  }

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
      void loadNearby(nextCenter, radius, true, true);
    }, () => {
      setLoading(false);
      setError('Location permission was denied. Enable approximate location to find live activities.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  useEffect(() => {
    if (mode === 'CONNECTED' && located) void loadNearby(center, radius);
    // Radius changes refresh the last user-approved location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  useEffect(() => {
    if (mode !== 'CONNECTED' || !located) return;
    const timer = setInterval(() => void loadNearby(center, radius, false), 15_000);
    return () => clearInterval(timer);
    // Poll the last user-approved location; geolocation itself is not requested again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, located, mode, radius]);

  async function toggleJoin(session: LiveActivity) {
    const joined = joinedIds.includes(session.id);
    try {
      const result = await api<{ joined: boolean; joinCount: number }>(`/live/${session.id}/join`, { method: joined ? 'DELETE' : 'POST' });
      setJoinedIds(current => result.joined ? [...new Set([...current, session.id])] : current.filter(id => id !== session.id));
      setLiveSessions(current => current.map(item => item.id === session.id ? { ...item, joinedByViewer: result.joined, joinCount: result.joinCount } : item));
      notify(result.joined ? `You joined ${session.user.displayName}'s live activity.` : `You left ${session.user.displayName}'s live activity.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The live activity could not be updated.');
    }
  }

  return <section className="mobile-discovery-map unified-map-page">
    <header className="map-experience-toolbar">
      <div><span className="eyebrow">{mode === 'CONNECTED' ? 'PRIVACY-SAFE DISCOVERY' : 'INTERACTIVE PREVIEW'}</span><h1>Explore movement nearby</h1><p>{mode === 'CONNECTED' ? 'Location is used only when you choose Locate. Live markers refresh automatically.' : 'Sample people and routes demonstrate how nearby discovery works.'}</p></div>
      <div className="map-layer-tabs" role="tablist" aria-label="Map layers"><button role="tab" aria-selected={layer === 'NEARBY'} onClick={() => setLayer('NEARBY')}>Nearby</button><button role="tab" aria-selected={layer === 'HEAT'} onClick={() => setLayer('HEAT')}>Heatmap</button></div>
    </header>
    <div className="map-experience-canvas">
      {layer === 'NEARBY' ? <NearbyMap center={center} people={people} activities={activities} liveActivities={mode === 'CONNECTED' ? liveSessions : []} radiusKm={radius} tileMode={tileMode} /> : <HeatMap embedded />}
      {layer === 'NEARBY' && <div className="map-floating-controls"><button aria-label={`Use ${tileMode === 'street' ? 'topographic' : 'street'} map`} aria-pressed={tileMode === 'topo'} onClick={() => { const next = tileMode === 'street' ? 'topo' : 'street'; setTileMode(next); notify(`Switched to ${next === 'topo' ? 'topographic' : 'street'} map.`); }}>{tileMode === 'street' ? 'Topo' : 'Street'}</button><button aria-label="Find live activities near my location" onClick={locate} disabled={loading}>{loading ? 'Finding...' : 'Locate'}</button></div>}
    </div>
    <aside className="map-results-sheet">
      <header><div><small>{layer === 'NEARBY' ? mode === 'CONNECTED' ? 'NEARBY RESULTS' : 'PREVIEW AREA' : 'AGGREGATED ACTIVITY'}</small><strong>{layer === 'NEARBY' ? loading ? 'Refreshing activities...' : mode === 'CONNECTED' && !located ? 'Choose Locate to begin' : `${resultCount} results` : 'Privacy threshold: 5+'}</strong></div>{layer === 'NEARBY' && <label>Radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label>}</header>
      {error && <p className="map-error" role="alert">{error}</p>}
      {layer === 'NEARBY' ? <div className="map-result-list">
        {mode === 'CONNECTED' && liveSessions.map(session => <article className="map-result-card live-result-card" key={session.id}><span className="avatar small online">{session.user.displayName[0]}</span><Link href={`/live/${session.id}`}><strong>{session.user.displayName}</strong><small>{session.type.toLowerCase()} - approx. {session.distanceKm.toFixed(1)} km - {session.paused ? 'paused' : `${(session.speedKmh ?? 0).toFixed(1)} km/h`}</small>{session.latestComment && <em>“{session.latestComment.body}”</em>}</Link>{session.user.id === viewer.id ? <Link className="watch-live-link" href={`/live/${session.id}`}>Your live</Link> : <button className={joinedIds.includes(session.id) ? 'joined' : ''} aria-pressed={joinedIds.includes(session.id)} onClick={() => void toggleJoin(session)}>{joinedIds.includes(session.id) ? 'Leave' : 'Join'}</button>}</article>)}
        {people.map(person => <Link href={`/u/${person.username}`} className="map-result-card" key={person.id}><span className="avatar small online">{person.displayName[0]}</span><span><strong>{person.displayName}</strong><small>{mode === 'CONNECTED' ? 'Approx.' : 'Sample person - approx.'} {person.distanceKm.toFixed(1)} km</small></span><b>View</b></Link>)}
        {activities.map(activity => <Link href={`/activities/${activity.id}`} className="map-result-card" key={activity.id}><span className="map-result-type">{activity.type}</span><span><strong>{activity.user.displayName}</strong><small>{(activity.distanceM / 1000).toFixed(1)} km route - approx. {activity.distanceKm.toFixed(1)} km away</small></span><b>Open</b></Link>)}
        {mode === 'CONNECTED' && located && !loading && !resultCount && <div className="map-empty-state"><UiIcon name="radio" size={24} /><strong>No nearby results</strong><span>Increase the radius or check again later.</span></div>}
      </div> : <p className="map-privacy-note">Only aggregated public routes are shown. Exact start/end points and individual identities are excluded from heatmap data.</p>}
    </aside>
  </section>;
}
