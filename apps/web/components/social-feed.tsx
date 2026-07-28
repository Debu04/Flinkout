'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { ActivityCard, FeedSkeleton } from './activity-card';
import { useInteractions } from './interaction-provider';

type Feed = { activities: SocialActivity[]; nextCursor: string | null };
const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });
const sample: SocialActivity[] = [
  { id: 'demo-run', type: 'RUN', visibility: 'PUBLIC', startedAt: new Date().toISOString(), endedAt: null, durationS: 2535, distanceM: 8420, route: [point(19.076, 72.878), point(19.083, 72.881), point(19.079, 72.889), point(19.071, 72.885), point(19.076, 72.878)], user: { id: 'demo-maya', username: 'sienna_trails', profile: { displayName: 'Sienna Williams', photoUrl: null } }, reactionCount: 24, commentCount: 8, reactedByViewer: false },
  { id: 'demo-ride', type: 'RIDE', visibility: 'PUBLIC', startedAt: new Date(Date.now() - 10800000).toISOString(), endedAt: null, durationS: 1720, distanceM: 5100, route: [point(19.07, 72.87), point(19.074, 72.88), point(19.084, 72.89), point(19.078, 72.895)], user: { id: 'demo-arjun', username: 'james_moves', profile: { displayName: 'James Chen', photoUrl: null } }, reactionCount: 12, commentCount: 3, reactedByViewer: false },
];

function StartingSoonMobile() {
  const [joined, setJoined] = useState<string[]>([]);
  const { notify } = useInteractions();
  function join(id: string, name: string) {
    setJoined(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    notify(joined.includes(id) ? `You left ${name}.` : `You joined ${name}. We’ll remind you before it starts.`);
  }
  return <section className="mobile-feed-section">
    <header><h2>Starting Soon Nearby</h2><Link href="/explore">View all</Link></header>
    <div className="session-carousel">
      <article className="session-teaser"><Link href="/activities/demo-run" className="session-photo mist"><span>Starts in 15m</span></Link><div><h3>Misty Valley Loop</h3><small>⌖ 2.4 km away</small><footer><span className="teaser-faces">M E +8</span><button className={joined.includes('misty') ? 'joined' : ''} onClick={() => join('misty', 'Misty Valley Loop')}>{joined.includes('misty') ? 'Joined' : 'Join now'}</button></footer></div></article>
      <article className="session-teaser"><Link href="/activities/demo-ride" className="session-photo river"><span>Starts in 30m</span></Link><div><h3>Riverfront Walk</h3><small>⌖ 0.8 km away</small><footer><span className="teaser-faces">J T +4</span><button className={joined.includes('river') ? 'joined' : ''} onClick={() => join('river', 'Riverfront Walk')}>{joined.includes('river') ? 'Joined' : 'Join now'}</button></footer></div></article>
    </div>
  </section>;
}

function BuddySpotlightMobile() {
  return <section className="mobile-buddy-spotlight"><header><h2>Buddy Spotlight <i /></h2><small>NEARBY NOW</small></header><div><Link href="/u/marcus_moves"><span className="avatar small">M</span><strong>Marcus</strong><small>LIVE · 0.4 km</small></Link><Link href="/u/elena_trails"><span className="avatar small">E</span><strong>Elena</strong><small>LIVE · 1.2 km</small></Link></div></section>;
}

export function SocialFeed() {
  const [items, setItems] = useState<SocialActivity[]>(sample);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [preview, setPreview] = useState(true);
  async function load(next?: string) {
    if (next) setMore(true);
    try {
      const page = await api<Feed>(`/activities/feed${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setItems(current => next ? [...current, ...page.activities] : page.activities);
      setCursor(page.nextCursor); setPreview(false);
    } catch {
      if (!next) { setItems(sample); setPreview(true); }
    } finally { setLoading(false); setMore(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading) return <section className="stack"><FeedSkeleton /><FeedSkeleton /></section>;
  return <section className="feed stack">
    {preview && <p className="demo-note">Preview mode · sample activities are shown while the database API is offline.</p>}
    {items.length ? items.map((item, index) => <div className="feed-entry" key={item.id}><ActivityCard initial={item} />{index === 0 && <StartingSoonMobile />}{index === items.length - 1 && <BuddySpotlightMobile />}</div>) : <section className="card empty-state"><h2>Your feed is quiet</h2><p>Record an activity or follow other movers to begin.</p></section>}
    {cursor && <button className="button secondary" disabled={more} onClick={() => void load(cursor)}>{more ? 'Loading…' : 'Load more'}</button>}
  </section>;
}
