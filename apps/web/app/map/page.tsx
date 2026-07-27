'use client';
import { DiscoveryExperience } from '../../components/discovery-experience';
import { LiveActivityPanel } from '../../components/live-activity-panel';
import dynamic from 'next/dynamic';
const HeatMap = dynamic(() => import('../../components/heat-map').then(module => module.HeatMap), { ssr: false });
export default function MapPage() { return <section className="stack"><div className="map-hero"><span className="eyebrow">DISCOVER · MOVE · CONNECT</span><h1>Find your next route</h1><p>Live movement, nearby activity and community momentum—without sacrificing privacy.</p></div><LiveActivityPanel/><HeatMap/><DiscoveryExperience mapOnly/></section>; }
