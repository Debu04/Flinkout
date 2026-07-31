'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { demoFeed } from '../lib/demo-data';
import { ActivityCard, FeedSkeleton } from './activity-card';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

type Feed = { activities: SocialActivity[]; nextCursor: string | null };

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
          <div><h3>{session.name}</h3><small>{session.distance}</small><footer><span className="teaser-faces">{session.faces}</span><button className={joined ? 'joined' : ''} aria-pressed={joined} onClick={() => join(session.id, session.name)}>{joined ? 'Joined' : 'Join now'}</button></footer></div>
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
  const [feedError, setFeedError] = useState('');
  const { state } = usePreviewState();
  const { mode, viewer } = useAppSession();

  const load = useCallback(async (next?: string) => {
    if (mode === 'CHECKING') return;
    if (next) setMore(true);
    else setLoading(true);
    setFeedError('');
    try {
      const page = await api<Feed>(`/activities/feed${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setItems(current => next ? [...current, ...page.activities] : page.activities);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (!next) {
        setItems(mode === 'PREVIEW' ? demoFeed : []);
        setCursor(null);
        if (mode === 'CONNECTED') setFeedError(cause instanceof Error ? cause.message : 'Your activity feed could not be loaded.');
      }
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'CHECKING') void load();
  }, [load, mode]);

  const visibleItems = useMemo(() => {
    return [
      ...state.postedActivities.filter(item => item.durationS >= 30 && (mode !== 'CONNECTED' || item.user.id === viewer.id) && !items.some(remote =>
        remote.id === item.id
        || (item.clientId && remote.clientId === item.clientId)
        || (item.syncedActivityId && remote.id === item.syncedActivityId)
      )),
      ...items,
    ];
  }, [items, mode, state.postedActivities, viewer.id]);

  if (loading) return <section className="stack" aria-label="Loading activity feed"><FeedSkeleton /><FeedSkeleton /></section>;
  if (feedError) return <section className="card feed-error-state" role="alert"><UiIcon name="radio" size={26} /><div><h2>Feed unavailable</h2><p>{feedError}. Your locally recorded activities remain safe.</p></div><button onClick={() => void load()}>Try again</button></section>;

  return <section className="feed stack">
    {visibleItems.length ? visibleItems.map((item, index) => <div className="feed-entry" key={item.id}>
      <ActivityCard initial={item} />
      {mode === 'PREVIEW' && index === 0 && <StartingSoonMobile />}
      {mode === 'PREVIEW' && index === visibleItems.length - 1 && <BuddySpotlightMobile />}
    </div>) : <section className="card empty-state">
      <h2>Nothing here yet</h2>
      <p>Record an activity to start your movement history.</p>
      <Link className="button" href="/record">Start an activity</Link>
    </section>}
    {cursor && <button className="button secondary" disabled={more} onClick={() => void load(cursor)}>{more ? 'Loading...' : 'Load more'}</button>}
  </section>;
}
