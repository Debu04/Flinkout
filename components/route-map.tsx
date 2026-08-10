'use client';
import { useEffect, useMemo } from 'react';
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import type { RoutePoint } from '../lib/activity';

function FitRoute({ points }: { points: RoutePoint[] }) { const map = useMap(); const positions = useMemo(() => points.map(p => [p.latitude, p.longitude] as [number, number]), [points]); useEffect(() => { if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24] }); else if (positions[0]) map.setView(positions[0], 16); }, [map, positions]); return null; }
export function RouteMap({ points }: { points: RoutePoint[] }) { const center: [number, number] = points.length ? [points[0].latitude, points[0].longitude] : [20.5937, 78.9629]; const positions = points.map(p => [p.latitude, p.longitude] as [number, number]); return <div className="map" aria-label="Activity route map"><MapContainer center={center} zoom={points.length ? 15 : 4} scrollWheelZoom={false}><TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{positions.length > 0 && <Polyline positions={positions} pathOptions={{ color: '#6d28d9', weight: 5 }} />}{<FitRoute points={points} />}</MapContainer></div>; }
