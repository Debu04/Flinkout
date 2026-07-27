'use client';

import { useEffect, useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { ActivityCard, FeedSkeleton } from './activity-card';

type Feed = { activities: SocialActivity[]; nextCursor: string | null };
const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });
const sample: SocialActivity[] = [
  { id: 'demo-run', type: 'RUN', visibility: 'PUBLIC', startedAt: new Date().toISOString(), endedAt: null, durationS: 2840, distanceM: 7100, route: [point(19.076, 72.878), point(19.079, 72.882), point(19.081, 72.885)], user: { id: 'demo-maya', username: 'maya_runs', profile: { displayName: 'Maya Patel', photoUrl: null } }, reactionCount: 42, commentCount: 8, reactedByViewer: false },
  { id: 'demo-ride', type: 'RIDE', visibility: 'PUBLIC', startedAt: new Date(Date.now() - 86400000).toISOString(), endedAt: null, durationS: 3620, distanceM: 18300, route: [point(19.07, 72.87), point(19.084, 72.89)], user: { id: 'demo-arjun', username: 'arjun_moves', profile: { displayName: 'Arjun Mehta', photoUrl: null } }, reactionCount: 27, commentCount: 4, reactedByViewer: false },
];

export function SocialFeed() {
  const [items, setItems] = useState<SocialActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [preview, setPreview] = useState(false);
  async function load(next?: string) {
    next ? setMore(true) : setLoading(true);
    try {
      const page = await api<Feed>(`/activities/feed${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setItems(current => next ? [...current, ...page.activities] : page.activities);
      setCursor(page.nextCursor);
      setPreview(false);
    } catch {
      if (!next) { setItems(sample); setPreview(true); }
    } finally { setLoading(false); setMore(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading) return <section className="stack"><FeedSkeleton /><FeedSkeleton /></section>;
  return <section className="feed stack">
    {preview && <p className="demo-note">Preview mode · sample activities are shown while the database API is offline.</p>}
    {items.length ? items.map(item => <ActivityCard key={item.id} initial={item} />) : <section className="card empty-state"><h2>Your feed is quiet</h2><p>Record an activity or follow other movers to begin.</p></section>}
    {cursor && <button className="button secondary" disabled={more} onClick={() => void load(cursor)}>{more ? 'Loading…' : 'Load more'}</button>}
  </section>;
}
