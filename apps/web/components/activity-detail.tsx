'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Comment, type SocialActivity } from '../lib/api';
import { formatDistance, formatDuration, formatPace } from '../lib/activity';
import { useInteractions } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map detail-map" /> });
const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });

function sampleActivity(id: string): SocialActivity {
  return { id, type: 'WALK', visibility: 'PUBLIC', startedAt: new Date(Date.now() - 3600000).toISOString(), endedAt: new Date().toISOString(), durationS: 3120, distanceM: 4200, route: [point(49.282, -123.12), point(49.276, -123.111), point(49.27, -123.105)], user: { id: 'demo-elena', username: 'elena_trails', profile: { displayName: 'Elena Rodriguez', photoUrl: null } }, reactionCount: 24, commentCount: 3, reactedByViewer: false };
}

export function ActivityDetail({ id }: { id: string }) {
  const [activity, setActivity] = useState<SocialActivity>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [highFives, setHighFives] = useState(24);
  const [highFived, setHighFived] = useState(false);
  const [helpful, setHelpful] = useState<string[]>([]);
  const { notify, share } = useInteractions();

  useEffect(() => {
    if (id.startsWith('demo-')) {
      setActivity(sampleActivity(id));
      setComments([
        { id: 'sample-comment-1', body: 'The path near the fountain is a bit slippery today due to the recent rain. Watch your step!', createdAt: new Date().toISOString(), userId: 'demo-sarah', isOwner: false, user: { id: 'demo-sarah', username: 'sarah', profile: { displayName: 'Sarah G.', photoUrl: null } } },
        { id: 'sample-comment-2', body: 'Great spot for a photo right by the harbor master’s office. The flowers are in full bloom!', createdAt: new Date().toISOString(), userId: 'demo-david', isOwner: false, user: { id: 'demo-david', username: 'david', profile: { displayName: 'David K.', photoUrl: null } } },
      ]);
      return;
    }
    Promise.all([api<{ activity: SocialActivity }>(`/activities/${id}`), api<{ comments: Comment[] }>(`/activities/${id}/comments`)])
      .then(([a, c]) => { setActivity(a.activity); setComments(c.comments); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load activity'));
  }, [id]);

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    if (id.startsWith('demo-')) { setComments(current => [{ id: `demo-${Date.now()}`, body: body.trim(), createdAt: new Date().toISOString(), userId: 'viewer', isOwner: true, user: { id: 'viewer', username: 'you', profile: { displayName: 'You', photoUrl: null } } }, ...current]); setBody(''); notify('Community note added.'); return; }
    setSending(true);
    try { const result = await api<{ comment: Comment }>(`/activities/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); setComments(current => [result.comment, ...current]); setBody(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add note'); }
    finally { setSending(false); }
  }

  if (error && !activity) return <section className="card error-state"><h1>Activity unavailable</h1><p className="error">{error}</p><Link className="button" href="/">Back to feed</Link></section>;
  if (!activity) return <div className="card skeleton"><span /><span /><span /></div>;

  return <section className="session-detail-page">
    <header className="standalone-mobile-header"><Link href="/" aria-label="Back">←</Link><strong>Activity</strong><button aria-label="Share activity" onClick={() => void share({ title: 'Morning Harbor Loop on Flinkout', text: 'Take a look at this shared activity.' })}><UiIcon name="share" /></button></header>
    <div className="session-map-hero"><RouteMap points={activity.route ?? []} /><div className="map-summary-pills"><span><UiIcon name="activity" /><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><UiIcon name="activity" /><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span></div></div>
    <div className="session-detail-grid">
      <main>
        <section className="session-title-card"><div className="avatar small">E</div><div><h1>Morning Harbor Loop</h1><p>by {activity.user.profile?.displayName ?? activity.user.username}</p></div><span>#SunnyWalk</span></section>
        <button className={`high-five-button ${highFived ? 'active' : ''}`} aria-pressed={highFived} onClick={() => { setHighFived(value => !value); setHighFives(value => value + (highFived ? -1 : 1)); notify(highFived ? 'High-five removed.' : 'High-five sent!'); }}>{highFived ? 'High-Five Sent' : 'Send High-Five'} <b>{highFives}</b></button>
        <section className="session-timeline"><h2>Session Activity</h2><div><i className="mint">▷</i><span><strong>Session Started</strong><small>08:15 AM · Stanley Park Entrance</small></span></div><div><i className="peach">♥</i><span><strong>Marcus Chen sent a high-five!</strong><small>08:42 AM</small></span></div><div><i className="blue">♙</i><span><strong>Sarah &amp; Toby joined the walk</strong><small>08:55 AM · Seawall Crossing</small></span></div><div><i className="green">✓</i><span><strong>Session Completed</strong><small>09:07 AM · Harbor Marina</small></span></div></section>
      </main>
      <aside id="comments" className="community-notes">
        <header><h2>Community Notes</h2><span>{comments.length} Notes</span></header>
        {comments.map((comment, index) => <article key={comment.id}><small>{comment.isOwner ? 'YOUR NOTE' : index ? '☆ HIDDEN GEM' : '⌖ TRAIL CONDITION'}</small><p>“{comment.body}”</p><footer>{comment.isOwner ? 'Just now by You' : `${index ? '5h' : '2h'} ago by ${comment.user.profile?.displayName ?? comment.user.username}`}<span>{comment.isOwner && <button className="delete-note" onClick={() => { setComments(current => current.filter(value => value.id !== comment.id)); notify('Note deleted.'); }}>Delete</button>}<button className={helpful.includes(comment.id) ? 'helpful' : ''} aria-pressed={helpful.includes(comment.id)} onClick={() => setHelpful(current => current.includes(comment.id) ? current.filter(value => value !== comment.id) : [...current, comment.id])}>♧ {helpful.includes(comment.id) ? 'Helpful!' : 'Helpful'}</button></span></footer></article>)}
        <form onSubmit={addComment}><label className="sr-only" htmlFor="comment">Add a note</label><input id="comment" value={body} onChange={event => setBody(event.target.value)} maxLength={500} placeholder="Add a note…" /><button disabled={sending}>{sending ? '…' : '＋ Add a note'}</button></form>
      </aside>
    </div>
    <section className="desktop-session-summary"><h2>Morning Ridge Run</h2><p>October 14, 2023 · 08:30 AM</p><div><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span><span><small>Pace</small><strong>{formatPace(activity.distanceM, activity.durationS)}</strong></span><span><small>Elevation</small><strong>312 m</strong></span></div></section>
  </section>;
}
