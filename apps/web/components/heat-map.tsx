'use client';

import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import { api } from '../lib/api';

type Cell = { latitude: number; longitude: number; activityCount: number };
const demo: Cell[] = [
  { latitude: 34.052, longitude: -118.244, activityCount: 18 },
  { latitude: 34.047, longitude: -118.252, activityCount: 12 },
  { latitude: 34.058, longitude: -118.238, activityCount: 9 },
  { latitude: 34.044, longitude: -118.233, activityCount: 7 },
  { latitude: 34.061, longitude: -118.247, activityCount: 6 },
];

export function HeatMap({ embedded = false }: { embedded?: boolean }) {
  const [cells, setCells] = useState<Cell[]>(demo);
  const [message, setMessage] = useState('Preview density uses aggregated public routes only.');
  useEffect(() => {
    api<{ cells: Cell[] }>('/heatmap?minLat=33.9&maxLat=34.2&minLng=-118.5&maxLng=-118.1&zoom=12').then(result => {
      if (result.cells.length) {
        setCells(result.cells);
        setMessage('Privacy-filtered activity density. Each area represents at least five activities.');
      }
    }).catch(() => undefined);
  }, []);
  return <section className={`heat-shell ${embedded ? 'embedded' : 'card stack'}`}>
    {!embedded && <div className="row"><div className="grow"><span className="eyebrow">PRIVACY-FIRST DISCOVERY</span><h2>Activity heat map</h2><p className="hint">{message}</p></div><span className="heat-badge">5+ activities</span></div>}
    <div className="heat-map map" aria-label={message}><MapContainer center={[34.052, -118.244]} zoom={12} scrollWheelZoom><TileLayer attribution="OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{cells.map(cell => <CircleMarker key={`${cell.latitude}-${cell.longitude}`} center={[cell.latitude, cell.longitude]} radius={8 + cell.activityCount} pathOptions={{ color: '#fb7185', fillColor: '#f97316', fillOpacity: .18 + Math.min(cell.activityCount / 30, .55), weight: 1 }} />)}</MapContainer></div>
  </section>;
}
