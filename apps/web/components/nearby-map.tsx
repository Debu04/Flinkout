'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LiveActivity, NearbyActivity, NearbyPerson } from '../lib/api';

function Fit({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 13); }, [map, center]);
  return null;
}

export function NearbyMap({ center, people, activities, liveActivities = [], radiusKm, tileMode = 'street' }: { center: [number, number]; people: NearbyPerson[]; activities: NearbyActivity[]; liveActivities?: LiveActivity[]; radiusKm: number; tileMode?: 'street' | 'topo' }) {
  const routeLines = useMemo(() => activities.filter(activity => activity.route?.length).map(activity => ({ id: activity.id, points: activity.route!.map(point => [point.latitude, point.longitude] as [number, number]) })), [activities]);
  const tiles = tileMode === 'topo'
    ? { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors - OpenTopoMap' }
    : { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' };
  return <div className="nearby-map map"><MapContainer center={center} zoom={13} scrollWheelZoom><TileLayer key={tileMode} attribution={tiles.attribution} url={tiles.url}/><Fit center={center}/><Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#395f94', fillOpacity: .04 }}/><CircleMarker center={center} radius={8} pathOptions={{ color: '#395f94', fillColor: '#395f94', fillOpacity: 1 }}><Popup>Your approximate search area</Popup></CircleMarker>{people.map(person => <CircleMarker key={person.id} center={[person.latitude, person.longitude]} radius={7} pathOptions={{ color: '#16342d', fillColor: '#16342d', fillOpacity: 1 }}><Popup><strong>{person.displayName}</strong><br/>About {person.distanceKm.toFixed(1)} km away</Popup></CircleMarker>)}{activities.map(activity => <CircleMarker key={activity.id} center={[activity.latitude, activity.longitude]} radius={7} pathOptions={{ color: '#9b3410', fillColor: '#c04a19', fillOpacity: 1 }}><Popup><strong>{activity.user.displayName}</strong><br/>{activity.type.toLowerCase()} - {activity.distanceKm.toFixed(1)} km away</Popup></CircleMarker>)}{liveActivities.map(session => <CircleMarker key={session.id} center={[session.latitude, session.longitude]} radius={10} pathOptions={{ color: '#9b3410', fillColor: '#ff6534', fillOpacity: 1, weight: 4 }}><Popup><strong>{session.user.displayName} is live</strong><br/>{session.type.toLowerCase()} - {session.paused ? 'paused' : `${(session.speedKmh ?? 0).toFixed(1)} km/h`}<br/>{session.latestComment?.body && <><em>{session.latestComment.body}</em><br/></>}<Link href={`/live/${session.id}`}>Watch live</Link></Popup></CircleMarker>)}{routeLines.map(route => <Polyline key={route.id} positions={route.points} pathOptions={{ color: '#2d6f59', weight: 4 }}/>)}</MapContainer></div>;
}
