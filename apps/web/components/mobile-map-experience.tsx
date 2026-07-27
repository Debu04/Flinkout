'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { NearbyActivity, NearbyPerson } from '../lib/api';
import { useInteractions } from './interaction-provider';

const NearbyMap = dynamic(() => import('./nearby-map').then(module => module.NearbyMap), { ssr: false, loading: () => <div className="map mobile-map-canvas" /> });
const people: NearbyPerson[] = [
  { id: 'marcus', username: 'marcus_moves', displayName: 'Marcus', photoUrl: null, latitude: 34.052, longitude: -118.244, distanceKm: .4 },
  { id: 'elena', username: 'elena_trails', displayName: 'Elena', photoUrl: null, latitude: 34.044, longitude: -118.233, distanceKm: 1.2 },
];
const activities: NearbyActivity[] = [{ id: 'community-walk', type: 'WALK', startedAt: new Date().toISOString(), distanceM: 3000, latitude: 34.058, longitude: -118.24, distanceKm: .7, route: null, user: { id: 'crew', username: 'community', displayName: 'Community Walk', photoUrl: null } }];

export function MobileMapExperience() {
  const [center, setCenter] = useState<[number, number]>([34.052, -118.244]);
  const [radius, setRadius] = useState(5);
  const [tileMode, setTileMode] = useState<'street' | 'topo'>('street');
  const { notify } = useInteractions();
  function locate() {
    if (!navigator.geolocation) { notify('Location is unavailable in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      setCenter([position.coords.latitude, position.coords.longitude]);
      notify('Map centered on your approximate location.');
    }, () => notify('Location permission was denied. The preview area is still available.'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }
  function cycleRadius() {
    const next = radius === 5 ? 10 : radius === 10 ? 25 : 5;
    setRadius(next);
    notify(`Discovery radius changed to ${next} km.`);
  }
  return <section className="mobile-discovery-map">
    <NearbyMap center={center} people={people} activities={activities} radiusKm={radius} tileMode={tileMode} />
    <div className="map-floating-controls"><button aria-label={`Use ${tileMode === 'street' ? 'topographic' : 'street'} map`} aria-pressed={tileMode === 'topo'} onClick={() => { setTileMode(current => current === 'street' ? 'topo' : 'street'); notify(`Switched to ${tileMode === 'street' ? 'topographic' : 'street'} map.`); }}>◇</button><button aria-label="Center map on my location" onClick={locate}>◎</button></div>
    <Link href="/activities/demo-run" className="map-event community"><span>♟</span> Community Walk <i /></Link>
    <Link href="/activities/demo-ride" className="map-event cleanup"><span>♧</span> Trail Cleanup</Link>
    <Link href="/u/marcus_moves" className="map-person marcus"><span>M</span><b>LIVE</b><small>Marcus</small></Link>
    <Link href="/u/elena_trails" className="map-person elena"><span>E</span><b>LIVE</b><small>Elena</small></Link>
    <span className="current-location" />
    <button className="radius-chip" onClick={cycleRadius}>⌖ Radius: {radius}km　✎</button>
    <section className="map-nearby-count"><small>NEARBY ACTIVITY</small><strong>12 Explorers</strong><span>3 events starting within 1mi</span></section>
  </section>;
}
