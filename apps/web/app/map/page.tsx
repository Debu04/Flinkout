'use client';

import dynamic from 'next/dynamic';
import { DiscoveryExperience } from '../../components/discovery-experience';
import { LiveActivityPanel } from '../../components/live-activity-panel';
import { MobileMapExperience } from '../../components/mobile-map-experience';

const HeatMap = dynamic(() => import('../../components/heat-map').then(module => module.HeatMap), { ssr: false });

export default function MapPage() {
  return <>
    <MobileMapExperience />
    <section className="stack desktop-map-page">
      <div className="map-hero"><span className="eyebrow">DISCOVER · MOVE · CONNECT</span><h1>Find your next route</h1><p>Live movement, nearby activity, and community momentum—without sacrificing privacy.</p></div>
      <LiveActivityPanel /><HeatMap /><DiscoveryExperience mapOnly />
    </section>
  </>;
}
