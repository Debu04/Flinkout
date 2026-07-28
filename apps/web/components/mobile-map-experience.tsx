'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { NearbyActivity, NearbyPerson } from '../lib/api';
import { demoActivities } from '../lib/demo-data';
import { useInteractions } from './interaction-provider';

const NearbyMap = dynamic(() => import('./nearby-map').then(module => module.NearbyMap), { ssr: false, loading: () => <div className="map mobile-map-canvas map-loading">Loading nearby map...</div> });
const HeatMap = dynamic(() => import('./heat-map').then(module => module.HeatMap), { ssr: false, loading: () => <div className="map mobile-map-canvas map-loading">Loading activity density...</div> });

const people: NearbyPerson[] = [
  { id: 'sienna', username: 'sienna_trails', displayName: 'Sienna Williams', photoUrl: null, latitude: 34.052, longitude: -118.244, distanceKm: .4 },
  { id: 'elena', username: 'elena_trails', displayName: 'Elena Rodriguez', photoUrl: null, latitude: 34.044, longitude: -118.233, distanceKm: 1.2 },
];
const activities: NearbyActivity[] = [
  { id: 'demo-run', type: 'RUN', startedAt: demoActivities['demo-run'].activity.startedAt, distanceM: 8420, latitude: 34.058, longitude: -118.24, distanceKm: .7, route: demoActivities['demo-run'].activity.route, user: { id: 'demo-sienna', username: 'sienna_trails', displayName: 'Silver Creek Run', photoUrl: null } },
  { id: 'demo-ride', type: 'RIDE', startedAt: demoActivities['demo-ride'].activity.startedAt, distanceM: 5100, latitude: 34.047, longitude: -118.254, distanceKm: 1.8, route: demoActivities['demo-ride'].activity.route, user: { id: 'demo-james', username: 'james_moves', displayName: 'Greenway Ride', photoUrl: null } },
];

export function MobileMapExperience() {
  const [center, setCenter] = useState<[number, number]>([34.052, -118.244]);
  const [radius, setRadius] = useState(5);
  const [tileMode, setTileMode] = useState<'street' | 'topo'>('street');
  const [layer, setLayer] = useState<'NEARBY' | 'HEAT'>('NEARBY');
  const { notify } = useInteractions();

  function locate() {
    if (!navigator.geolocation) { notify('Location is unavailable in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      setCenter([position.coords.latitude, position.coords.longitude]);
      notify('Map centered on your approximate location.');
    }, () => notify('Location permission was denied. The preview area remains available.'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  return <section className="mobile-discovery-map unified-map-page">
    <header className="map-experience-toolbar">
      <div><span className="eyebrow">PRIVACY-SAFE DISCOVERY</span><h1>Explore movement nearby</h1></div>
      <div className="map-layer-tabs" role="tablist" aria-label="Map layers"><button role="tab" aria-selected={layer === 'NEARBY'} onClick={() => setLayer('NEARBY')}>Nearby</button><button role="tab" aria-selected={layer === 'HEAT'} onClick={() => setLayer('HEAT')}>Heatmap</button></div>
    </header>
    <div className="map-experience-canvas">
      {layer === 'NEARBY' ? <NearbyMap center={center} people={people} activities={activities} radiusKm={radius} tileMode={tileMode} /> : <HeatMap embedded />}
      {layer === 'NEARBY' && <div className="map-floating-controls"><button aria-label={`Use ${tileMode === 'street' ? 'topographic' : 'street'} map`} aria-pressed={tileMode === 'topo'} onClick={() => { const next = tileMode === 'street' ? 'topo' : 'street'; setTileMode(next); notify(`Switched to ${next === 'topo' ? 'topographic' : 'street'} map.`); }}>{tileMode === 'street' ? 'Topo' : 'Street'}</button><button aria-label="Center map on my location" onClick={locate}>Locate</button></div>}
    </div>
    <aside className="map-results-sheet">
      <header><div><small>{layer === 'NEARBY' ? 'NEARBY NOW' : 'AGGREGATED ACTIVITY'}</small><strong>{layer === 'NEARBY' ? `${people.length + activities.length} results` : 'Privacy threshold: 5+'}</strong></div>{layer === 'NEARBY' && <label>Radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option></select></label>}</header>
      {layer === 'NEARBY' ? <div className="map-result-list">
        {people.map(person => <Link href={`/u/${person.username}`} className="map-result-card" key={person.id}><span className="avatar small online">{person.displayName[0]}</span><span><strong>{person.displayName}</strong><small>Live nearby - approx. {person.distanceKm.toFixed(1)} km</small></span><b>View</b></Link>)}
        {activities.map(activity => <Link href={`/activities/${activity.id}`} className="map-result-card" key={activity.id}><span className="map-result-type">{activity.type}</span><span><strong>{activity.user.displayName}</strong><small>{(activity.distanceM / 1000).toFixed(1)} km route - approx. {activity.distanceKm.toFixed(1)} km away</small></span><b>Open</b></Link>)}
      </div> : <p className="map-privacy-note">Only aggregated public routes are shown. Exact start/end points and individual identities are excluded from heatmap data.</p>}
    </aside>
  </section>;
}
