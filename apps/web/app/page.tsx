'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useInteractions } from '../components/interaction-provider';
import { SocialFeed } from '../components/social-feed';

const livePeople = [
  { name: 'Maya P.', initial: 'M', tone: 'mountain' },
  { name: 'Tom G.', initial: 'T', tone: 'forest' },
  { name: 'Elena S.', initial: 'E', tone: 'sunrise' },
  { name: 'Mark D.', initial: 'M', tone: 'trail' },
  { name: 'Lara K.', initial: 'L', tone: 'blue' },
];

function LiveNearby() {
  return <section className="live-nearby">
    <div className="trail-section-heading"><h1><span className="live-pulse" />Live Nearby</h1><Link href="/map">View all</Link></div>
    <div className="live-people" aria-label="People sharing live activities nearby">
      {livePeople.map(person => <Link href="/map" className="live-person" key={person.name}>
        <span className={`live-avatar ${person.tone}`}><span>{person.initial}</span><b>LIVE</b></span>
        <small>{person.name}</small>
      </Link>)}
    </div>
  </section>;
}

function StartingSoon() {
  return <section className="trail-panel">
    <header><h2>Starting Soon</h2><span className="panel-icon">▣</span></header>
    <Link href="/activities/demo-walk" className="event-card"><span className="event-time"><strong>18</strong><small>MIN</small></span><div><strong>Sunday Sunrise Walk</strong><small>⌖ East Side Park</small><p><span className="mini-faces">M T E</span> +12 joining</p></div></Link>
    <Link href="/activities/demo-run" className="event-card"><span className="event-time orange"><strong>45</strong><small>MIN</small></span><div><strong>Hill Training Session</strong><small>⌖ Peak Trail Entrance</small><p><span className="mini-faces">J K</span> +4 joining</p></div></Link>
    <Link className="panel-button" href="/explore">View all events</Link>
  </section>;
}

function BuddyDiscovery() {
  const [following, setFollowing] = useState<string[]>([]);
  const { notify } = useInteractions();
  return <section className="trail-panel">
    <header><h2>Buddy Discovery</h2><span className="panel-icon">↻</span></header>
    {[['Leo Zhang', 'Frequent Trail Runner', 'L'], ['Chloe Reed', 'Enjoys Nature Walks', 'C']].map(person => <div className="buddy" key={person[0]}><span className="avatar small">{person[2]}</span><span className="grow"><strong>{person[0]}</strong><small>{person[1]}</small></span><button className={following.includes(person[0]) ? 'following' : ''} aria-label={`${following.includes(person[0]) ? 'Unfollow' : 'Follow'} ${person[0]}`} onClick={() => {
      const active = following.includes(person[0]);
      setFollowing(current => active ? current.filter(value => value !== person[0]) : [...current, person[0]]);
      notify(active ? `You unfollowed ${person[0]}.` : `You’re now following ${person[0]}.`);
    }}>{following.includes(person[0]) ? '✓' : '+'}</button></div>)}
  </section>;
}

function LocalHeatmap() {
  return <section className="trail-panel heatmap-preview">
    <header><h2>Local Activity<br />Heatmap</h2><span className="panel-icon">⌖</span></header>
    <Link href="/map" className="mini-map" aria-label="Open local activity heatmap"><span className="map-road one" /><span className="map-road two" /><span className="map-water" /><span className="map-radius" /><i className="map-pin pin-one">M</i><i className="map-pin pin-two">T</i></Link>
    <footer><span><small>DISCOVERY RADIUS</small><strong>5km</strong></span><span><i /> Live Movement</span></footer>
  </section>;
}

export default function Home() {
  const { notify } = useInteractions();
  return <section className="trail-home">
    <div className="trail-feed-column">
      <LiveNearby />
      <SocialFeed />
    </div>
    <aside className="trail-aside">
      <StartingSoon />
      <BuddyDiscovery />
      <LocalHeatmap />
      <section className="premium-banner"><span>PREMIUM TRAIL GUIDE</span><strong>Unlock 500+ Hidden Trails</strong><button onClick={() => notify('Premium plans are coming soon. You’ve been added to the preview list.')}>Go premium</button></section>
    </aside>
  </section>;
}
