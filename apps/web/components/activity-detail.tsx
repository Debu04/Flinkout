'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Comment, type SocialActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map" /> });
const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });

function sampleActivity(id: string): SocialActivity {
  const ride = id.includes('ride');
  return {
    id, type: ride ? 'RIDE' : 'RUN', visibility: 'PUBLIC',
    startedAt: new Date(Date.now() - (ride ? 86400000 : 0)).toISOString(), endedAt: new Date().toISOString(),
    durationS: ride ? 3620 : 2840, distanceM: ride ? 18300 : 7100,
    route: ride ? [point(19.07, 72.87), point(19.077, 72.881), point(19.084, 72.89)] : [point(19.076, 72.878), point(19.079, 72.882), point(19.081, 72.885)],
    user: { id: ride ? 'demo-arjun' : 'demo-maya', username: ride ? 'arjun_moves' : 'maya_runs', profile: { displayName: ride ? 'Arjun Mehta' : 'Maya Patel', photoUrl: null } },
    reactionCount: ride ? 27 : 42, commentCount: 2, reactedByViewer: false,
  };
}

export function ActivityDetail({ id }: { id: string }) {
  const [activity, setActivity] = useState<SocialActivity>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    Promise.all([api<{ activity: SocialActivity }>(`/activities/${id}`), api<{ comments: Comment[] }>(`/activities/${id}/comments`)])
      .then(([a, c]) => { setActivity(a.activity); setComments(c.comments); })
      .catch(cause => {
        if (id.startsWith('demo-')) {
          setActivity(sampleActivity(id)); setPreview(true);
          setComments([
            { id: 'sample-comment-1', body: 'That route looks brilliant! 🔥', createdAt: new Date().toISOString(), userId: 'demo-neha', isOwner: false, user: { id: 'demo-neha', username: 'neha_moves', profile: { displayName: 'Neha Singh', photoUrl: null } } },
            { id: 'sample-comment-2', body: 'Strong finish — nicely done.', createdAt: new Date().toISOString(), userId: 'demo-kabir', isOwner: false, user: { id: 'demo-kabir', username: 'kabir_rides', profile: { displayName: 'Kabir Shah', photoUrl: null } } },
          ]);
        } else setError(cause instanceof Error ? cause.message : 'Could not load activity');
      });
  }, [id]);

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    if (id.startsWith('demo-')) {
      setComments(current => [{ id: `demo-${Date.now()}`, body: body.trim(), createdAt: new Date().toISOString(), userId: 'viewer', isOwner: true, user: { id: 'viewer', username: 'you', profile: { displayName: 'You', photoUrl: null } } }, ...current]);
      setBody(''); return;
    }
    setSending(true);
    try {
      const result = await api<{ comment: Comment }>(`/activities/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setComments(current => [result.comment, ...current]); setBody('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add comment'); }
    finally { setSending(false); }
  }

  async function removeComment(commentId: string) {
    if (commentId.startsWith('demo-')) { setComments(current => current.filter(comment => comment.id !== commentId)); return; }
    try { await api(`/activities/${id}/comments/${commentId}`, { method: 'DELETE' }); setComments(current => current.filter(comment => comment.id !== commentId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete comment'); }
  }

  if (error && !activity) return <section className="card error-state"><h1>Activity unavailable</h1><p className="error">{error}</p><Link className="button" href="/">Back to feed</Link></section>;
  if (!activity) return <FeedSkeleton />;
  const paceType = activity.type !== 'RIDE';
  return <section className="stack detail-page">
    {preview && <p className="demo-note">Interactive preview · reactions and comments stay in this browser session.</p>}
    <article className="card detail-card stack">
      <header className="activity-head"><Link href={`/u/${activity.user.username}`} className="row"><span className="avatar small">{(activity.user.profile?.displayName ?? activity.user.username)[0]}</span><span><strong>{activity.user.profile?.displayName ?? activity.user.username}</strong><small>@{activity.user.username}</small></span></Link><span className="activity-type">{labelFor(activity.type)}</span></header>
      <div className="detail-title"><h1>{paceType ? 'Morning run' : 'Morning city ride'}</h1><p className="hint">{new Date(activity.startedAt).toLocaleString()}</p></div>
      <RouteMap points={activity.route ?? []} />
      <div className="activity-metrics"><span><strong>{formatDistance(activity.distanceM)}</strong>Distance</span><span><strong>{formatDuration(activity.durationS)}</strong>Duration</span><span><strong>{paceType ? formatPace(activity.distanceM, activity.durationS) : `${averageSpeedKmh(activity.distanceM, activity.durationS).toFixed(1)} km/h`}</strong>{paceType ? 'Avg. pace' : 'Avg. speed'}</span></div>
    </article>
    <section id="comments" className="card stack comments-panel">
      <h2>Community cheers</h2>
      <form className="comment-form" onSubmit={addComment}><label className="sr-only" htmlFor="comment">Add a comment</label><input id="comment" value={body} maxLength={500} onChange={event => setBody(event.target.value)} placeholder="Add a supportive comment…" /><button className="button compact" disabled={sending}>{sending ? 'Posting…' : 'Post'}</button></form>
      {error && <p className="error">{error}</p>}
      {comments.length ? comments.map(comment => <article className="comment row" key={comment.id}><span className="avatar small">{(comment.user.profile?.displayName ?? comment.user.username)[0]}</span><div className="grow"><strong>{comment.user.profile?.displayName ?? comment.user.username}</strong><p>{comment.body}</p></div>{comment.isOwner && <button onClick={() => void removeComment(comment.id)}>Delete</button>}</article>) : <p className="hint">No comments yet. Be the first to cheer them on.</p>}
    </section>
  </section>;
}

function FeedSkeleton() { return <div className="card skeleton"><span /><span /><span /></div>; }
