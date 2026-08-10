'use client';

import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LiveComment } from '../lib/api';

function FollowLocation({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

export function LiveLocationMap({ latitude, longitude, comments, active }: { latitude: number; longitude: number; comments: LiveComment[]; active: boolean }) {
  const center: [number, number] = [latitude, longitude];
  return <div className="map live-location-map">
    <MapContainer center={center} zoom={14} scrollWheelZoom>
      <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FollowLocation center={center} />
      <Circle center={center} radius={850} pathOptions={{ color: '#c95b34', fillColor: '#f4a261', fillOpacity: .08, weight: 1 }} />
      <CircleMarker center={center} radius={10} pathOptions={{ color: active ? '#9b3410' : '#52635d', fillColor: active ? '#ff6534' : '#80908a', fillOpacity: 1, weight: 4 }}>
        <Popup><strong>{active ? 'Current approximate location' : 'Last shared location'}</strong><br />Exact location is intentionally hidden.</Popup>
      </CircleMarker>
      {comments.map(comment => <CircleMarker key={comment.id} center={[comment.latitude, comment.longitude]} radius={6} pathOptions={{ color: '#173f34', fillColor: '#b7db75', fillOpacity: 1 }}><Popup><strong>{comment.user.displayName}</strong><br />{comment.body}</Popup></CircleMarker>)}
    </MapContainer>
  </div>;
}
