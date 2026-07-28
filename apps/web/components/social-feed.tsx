'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { demoFeed } from '../lib/demo-data';
import { ActivityCard, FeedSkeleton } from './activity-card';
import { useInteractions, usePreviewState } from './interaction-provider';

type Feed = { activities: SocialActivity[]; nextCursor: string | null };
type FeedMode = 'ALL' | 'FOLLOWING' | 'YOU';

const sessions = [
  { id: 'misty', activityId: 'demo-walk', name: 'Sunday Sunrise Walk', distance: 'East Side Park - 2.4 km away', starts: 'Starts in 18m', faces: 'M T E +12', tone: 'mist' },
  { id: 'river', activityId: 'demo-run', name: 'Hill Training Session', distance: 'Peak Trail Entrance - 0.8 km away', starts: 'Starts in 45m', faces: 'J K +4', tone: 'river' },
];

export function StartingSoonMobile() {
  const { state, toggleSession } = usePreviewState();
  const { notify } = useInteractions();

  function join(id: string, name: string) {
    const active = state.joinedSessionIds.includes(id);
    toggleSession(id);
    notify(active ? `You left ${name}.` : `You joined ${name}. We will remind you before it starts.`);
  }

  return <section className="mobile-feed-section">
    <header><h2>Starting Soon Nearby</h2><Link href="/explore">View all</Link></header>
    <div className="session-carousel">
      {sessions.map(session => {
        const joined = state.joinedSessionIds.includes(session.id);
        return <article className="session-teaser" key={session.id}>
          <Link href={`/activities/${session.activityId}`} className={`session-photo ${session.tone}`}><span>{session.starts}</span></Link>
          <div><h3>{session.name}</h3><small>{session.distance}</small><footer><span className="teaser-faces">{session.faces}</span><button className={joined ? 'joined' : ''} onClick={() => join(session.id, session.name)}>{joined ? 'Joined' : 'Join now'}</button></footer></div>
        </article>;
      })}
    </div>
  </section>;
}

function BuddySpotlightMobile() {
  return <section className="mobile-buddy-spotlight"><header><h2>Buddy Spotlight <i /></h2><small>NEARBY NOW</small></header><div><Link href="/u/sienna_trails"><span className="avatar small">S</span><strong>Sienna</strong><small>LIVE - 0.4 km</small></Link><Link href="/u/elena_trails"><span className="avatar small">E</span><strong>Elena</strong><small>LIVE - 1.2 km</small></Link></div></section>;
}

export function SocialFeed() {
  const [items, setItems] = useState<SocialActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<FeedMode>('ALL');
  const { state } = usePreviewState();
  const { notify } = useInteractions();

  const load = useCallback(async (next?: string) => {
    if (next) setMore(true);
    else setLoading(true);
    try {
      const page = await api<Feed>(`/activities/feed${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setItems(current => next ? [...current, ...page.activities] : page.activities);
      setCursor(page.nextCursor);
      setPreview(false);
    } catch {
      if (!next) {
        setItems(demoFeed);
        setCursor(null);
        setPreview(true);
      }
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    if (mode === 'YOU') return items.filter(item => item.user.username === 'marcus_moves');
    if (mode === 'FOLLOWING') return items.filter(item => state.followingUsernames.includes(item.user.username));
    return items;
  }, [items, mode, state.followingUsernames]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    notify(preview ? 'Preview feed refreshed.' : 'You are all caught up.');
  }

  if (loading) return <section className="stack" aria-label="Loading activity feed"><FeedSkeleton /><FeedSkeleton /></section>;

  return <section className="feed stack">
    <div className="feed-toolbar">
      <div className="feed-tabs" role="tablist" aria-label="Feed filters">
        <button role="tab" aria-selected={mode === 'ALL'} onClick={() => setMode('ALL')}>Nearby</button>
        <button role="tab" aria-selected={mode === 'FOLLOWING'} onClick={() => setMode('FOLLOWING')}>Following</button>
        <button role="tab" aria-selected={mode === 'YOU'} onClick={() => setMode('YOU')}>You</button>
      </div>
      <button className="feed-refresh" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh activity feed">{refreshing ? 'Refreshing...' : 'Refresh'}</button>
    </div>
    {preview && <p className="demo-note">Interactive preview - reactions, saves, follows, joins, comments, and messages persist in this browser.</p>}
    {visibleItems.length ? visibleItems.map((item, index) => <div className="feed-entry" key={item.id}>
      <ActivityCard initial={item} />
      {index === 0 && mode === 'ALL' && <StartingSoonMobile />}
      {index === visibleItems.length - 1 && mode === 'ALL' && <BuddySpotlightMobile />}
    </div>) : <section className="card empty-state">
      <h2>{mode === 'FOLLOWING' ? 'Follow a few movers' : 'Nothing here yet'}</h2>
      <p>{mode === 'FOLLOWING' ? 'People you follow will appear here. Explore nearby profiles to build your feed.' : 'Record an activity to start your movement history.'}</p>
      <Link className="button" href={mode === 'FOLLOWING' ? '/explore' : '/record'}>{mode === 'FOLLOWING' ? 'Explore people' : 'Start an activity'}</Link>
    </section>}
    {cursor && <button className="button secondary" disabled={more} onClick={() => void load(cursor)}>{more ? 'Loading...' : 'Load more'}</button>}
  </section>;
}
