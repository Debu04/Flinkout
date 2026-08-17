'use client';
import { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import type { RoutePoint } from '../lib/activity';

function FitRoute({ points, currentPoint }: { points: RoutePoint[]; currentPoint?: RoutePoint }) {
  const map = useMap();
  const positions = useMemo(() => points.map(point => [point.latitude, point.longitude] as [number, number]), [points]);
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24] });
    else if (currentPoint) map.setView([currentPoint.latitude, currentPoint.longitude], 17);
    else if (positions[0]) map.setView(positions[0], 16);
  }, [currentPoint, map, positions]);
  return null;
}

export function RouteMap({ points, currentPoint }: { points: RoutePoint[]; currentPoint?: RoutePoint }) {
  const focus = currentPoint ?? points.at(-1) ?? points[0];
  const center: [number, number] = focus ? [focus.latitude, focus.longitude] : [20.5937, 78.9629];
  const routeSegments = points.reduce<RoutePoint[][]>((segments, point) => {
    if (!segments.length || point.startsNewSegment) segments.push([]);
    segments.at(-1)!.push(point);
    return segments;
  }, []);
  const currentCenter: [number, number] | undefined = currentPoint ? [currentPoint.latitude, currentPoint.longitude] : undefined;
  const currentAccuracy = currentPoint?.accuracy;
  return <div className="map" aria-label="Activity route map">
    <MapContainer center={center} zoom={focus ? 16 : 4} scrollWheelZoom={false}>
      <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {routeSegments.map((segment, index) => segment.length > 1 && <Polyline key={`${segment[0].recordedAt}-${index}`} positions={segment.map(point => [point.latitude, point.longitude] as [number, number])} pathOptions={{ color: '#6d28d9', weight: 5 }} />)}
      {currentCenter && <>
        {currentAccuracy !== null && currentAccuracy !== undefined && <Circle center={currentCenter} radius={Math.max(5, currentAccuracy)} pathOptions={{ color: '#395f94', fillColor: '#78a8d8', fillOpacity: .12, weight: 1 }} />}
        <CircleMarker center={currentCenter} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#395f94', fillOpacity: 1, weight: 3 }} />
      </>}
      <FitRoute points={points} currentPoint={currentPoint} />
    </MapContainer>
  </div>;
}
