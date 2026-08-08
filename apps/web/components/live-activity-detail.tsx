'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type LiveActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, labelFor } from '../lib/activity';
import { useAppSession, useInteractions } from './interaction-provider';
import { UiIcon } from './ui-icon';

const LiveLocationMap = dynamic(() => import('./live-location-map').then(module => module.LiveLocationMap), { ssr: false, loading: () => <div className="map live-location-map map-loading">Loading live map...</div> });

export function LiveActivityDetail({ id }: { id: string }) {
  const [session, setSession] = useState<LiveActivity>();
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState('');
  const [body, setBody] = useState('');
  const { viewer, mode } = useAppSession();
  const { notify, share } = useInteractions();

  const refresh = useCallback(async (quiet = false) => {
    if (mode !== 'CONNECTED') {
      if (mode === 'PREVIEW') setError('Sign in to watch live activities and join the conversation.');
      return;
    }
    try {
      const response = await api<{ live: LiveActivity }>(`/live/${id}`);
      setSession(response.live);
      setError('');
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : 'The live activity could not be loaded.');
    }
  }, [id, mode]);

  useEffect(() => {
    void refresh();
    if (mode !== 'CONNECTED') return;
    const timer = setInterval(() => void refresh(true), 10_000);
    return () => clearInterval(timer);
  }, [mode, refresh]);

  async function toggleJoin() {
    if (!session || session.user.id === viewer.id || updating) return;
    setUpdating('join');
    try {
      const joined = Boolean(session.joinedByViewer);
      const result = await api<{ joined: boolean; joinCount: number }>(`/live/${id}/join`, { method: joined ? 'DELETE' : 'POST' });
      setSession({ ...session, joinedByViewer: result.joined, joinCount: result.joinCount });
      notify(result.joined ? 'Joined the live activity.' : 'Left the live activity.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this live activity.'); }
    finally { setUpdating(''); }
  }

  async function toggleHighFive() {
    if (!session || session.user.id === viewer.id || updating) return;
    setUpdating('high-five');
    try {
      const highFived = Boolean(session.highFivedByViewer);
      const result = await api<{ highFived: boolean; highFiveCount: number }>(`/live/${id}/high-five`, { method: highFived ? 'DELETE' : 'POST' });
      setSession({ ...session, highFivedByViewer: result.highFived, highFiveCount: result.highFiveCount });
      notify(result.highFived ? 'Live high-five sent!' : 'Live high-five removed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send your high-five.'); }
    finally { setUpdating(''); }
  }

  async function comment(event: React.FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (!message || !session?.active || updating) return;
    setUpdating('comment');
    try {
      await api(`/live/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: message }) });
      setBody('');
      await refresh();
      notify('Update posted at the approximate live location.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not post the live update.'); }
    finally { setUpdating(''); }
  }

  if (!session) return <section className="card live-detail-loading"><h1>{error ? 'Live activity unavailable' : 'Opening live activity...'}</h1>{error && <><p className="error" role="alert">{error}</p><Link className="button" href="/map">Back to map</Link></>}</section>;
  const active = session.active !== false;
  const isOwner = session.user.id === viewer.id;
  const speed = session.speedKmh ?? averageSpeedKmh(session.distanceM, session.durationS);
  const comments = session.comments ?? [];

  return <section className="live-detail-page">
    <header className="live-detail-header">
      <Link href="/map"><UiIcon name="back" size={18} /> Nearby map</Link>
      <span className={`live-detail-state ${active ? 'active' : ''}`}><i />{active ? session.paused ? 'LIVE - PAUSED' : 'LIVE NOW' : 'LIVE ENDED'}</span>
      <button aria-label="Share live activity" onClick={() => void share({ title: `${session.user.displayName}'s live ${labelFor(session.type).toLowerCase()}`, text: `Follow this ${labelFor(session.type).toLowerCase()} on Flinkout.` })}><UiIcon name="share" size={19} /></button>
    </header>
    <div className="live-detail-map-shell">
      <LiveLocationMap latitude={session.latitude} longitude={session.longitude} comments={comments} active={active} />
      <div className="live-detail-owner"><span className="avatar online">{session.user.displayName[0]}</span><div><small>{active ? 'MOVING NEARBY' : 'SESSION COMPLETE'}</small><h1>{session.user.displayName}'s {labelFor(session.type).toLowerCase()}</h1><Link href={`/u/${session.user.username}`}>@{session.user.username}</Link></div></div>
    </div>
    <div className="live-detail-grid">
      <main>
        <section className="live-detail-metrics"><span><small>Distance</small><strong>{formatDistance(session.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(session.durationS)}</strong></span><span><small>Current speed</small><strong>{speed ? `${speed.toFixed(1)} km/h` : '-'}</strong></span><span><small>Connected</small><strong>{session.joinCount}</strong></span></section>
        <p className="live-location-safety"><UiIcon name="shield" size={18} /> The map uses an approximate location and refreshes about every 15 seconds. Exact route data is never exposed by the live broadcast.</p>
        {!isOwner && <div className="live-social-actions"><button className={session.joinedByViewer ? 'active' : ''} aria-pressed={session.joinedByViewer} disabled={!active || Boolean(updating)} onClick={() => void toggleJoin()}><UiIcon name="group" />{session.joinedByViewer ? 'Joined' : 'Join activity'}</button><button className={session.highFivedByViewer ? 'active highfive' : ''} aria-pressed={session.highFivedByViewer} disabled={!active || Boolean(updating)} onClick={() => void toggleHighFive()}><UiIcon name="highfive" />{session.highFivedByViewer ? 'High-five sent' : 'Send high-five'} <b>{session.highFiveCount ?? 0}</b></button></div>}
        {isOwner && <p className="live-owner-note"><UiIcon name="radio" size={18} /> This is your broadcast. Recording controls remain in Start Activity.</p>}
        <section className="live-event-timeline"><header><h2>Live timeline</h2><span>{session.timeline?.length ?? 0} moments</span></header>{session.timeline?.map(event => <article key={event.id}><i className={event.type.toLowerCase().replace('_', '-')}><UiIcon name={event.type === 'COMMENT' ? 'chat' : event.type === 'HIGH_FIVE' ? 'highfive' : event.type === 'JOINED' ? 'group' : event.type === 'LIVE_ENDED' ? 'stop' : 'radio'} size={16} /></i><div><strong>{event.type === 'COMMENT' ? `${event.user?.displayName ?? 'Someone'} shared an update` : event.type === 'HIGH_FIVE' ? `${event.user?.displayName ?? 'Someone'} sent a high-five` : event.type === 'JOINED' ? `${event.user?.displayName ?? 'Someone'} joined` : event.type === 'LIVE_ENDED' ? 'Live session ended' : 'Live sharing started'}</strong>{event.body && <p>{event.body}</p>}<small>{new Date(event.createdAt).toLocaleString()}</small></div></article>)}</section>
      </main>
      <aside className="live-conversation">
        <header><div><h2>Nearby conversation</h2><p>Updates are pinned to the approximate location where they were shared.</p></div><span>{session.commentCount ?? comments.length}</span></header>
        <div>{comments.length ? comments.slice().reverse().map(commentItem => <article key={commentItem.id}><span className="avatar small">{commentItem.user.displayName[0]}</span><div><strong>{commentItem.user.displayName}</strong><p>{commentItem.body}</p><small>{new Date(commentItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div></article>) : <p className="live-conversation-empty">No updates yet. Share useful trail, traffic, safety, or meetup information.</p>}</div>
        <form onSubmit={comment}><label className="sr-only" htmlFor="live-detail-comment">Add a live update</label><input id="live-detail-comment" value={body} onChange={event => setBody(event.target.value)} maxLength={500} disabled={!active} placeholder={active ? 'Share what is happening nearby...' : 'This live conversation has ended'} /><button disabled={!active || !body.trim() || Boolean(updating)}>{updating === 'comment' ? 'Posting...' : 'Post update'}</button></form>
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </div>
  </section>;
}
