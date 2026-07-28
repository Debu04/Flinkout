'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Comment, type SocialActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';
import { getDemoActivity } from '../lib/demo-data';
import { useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map detail-map map-loading">Loading route...</div> });

const baseComments: Comment[] = [
  { id: 'sample-comment-1', body: 'The path near the fountain is a bit slippery today. Watch your step.', createdAt: '2026-07-28T08:15:00.000Z', userId: 'demo-elena', isOwner: false, user: { id: 'demo-elena', username: 'elena_trails', profile: { displayName: 'Elena Rodriguez', photoUrl: null } } },
  { id: 'sample-comment-2', body: 'Great viewpoint near the final turn. It is worth slowing down for a photo.', createdAt: '2026-07-28T07:40:00.000Z', userId: 'demo-james', isOwner: false, user: { id: 'demo-james', username: 'james_moves', profile: { displayName: 'James Chen', photoUrl: null } } },
];

export function ActivityDetail({ id }: { id: string }) {
  const router = useRouter();
  const demo = useMemo(() => getDemoActivity(id), [id]);
  const [activity, setActivity] = useState<SocialActivity>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [helpful, setHelpful] = useState<string[]>([]);
  const { notify, share } = useInteractions();
  const { state, toggleReaction, addComment, deleteComment } = usePreviewState();
  const isDemo = id.startsWith('demo-');
  const reacted = isDemo ? state.reactedActivityIds.includes(id) : activity?.reactedByViewer ?? false;
  const previewComments = state.comments[id] ?? [];

  useEffect(() => {
    if (isDemo) {
      setActivity(demo.activity);
      setComments(baseComments);
      return;
    }
    Promise.all([api<{ activity: SocialActivity }>(`/activities/${id}`), api<{ comments: Comment[] }>(`/activities/${id}/comments`)])
      .then(([a, c]) => { setActivity(a.activity); setComments(c.comments); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load activity'));
  }, [demo.activity, id, isDemo]);

  const allComments = useMemo(() => [
    ...previewComments.map(comment => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, userId: 'demo-marcus', isOwner: true, user: { id: 'demo-marcus', username: 'marcus_moves', profile: { displayName: 'Marcus Rivera', photoUrl: null } } } satisfies Comment)),
    ...comments,
  ], [comments, previewComments]);

  async function addActivityComment(event: React.FormEvent) {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody) return;
    if (isDemo) {
      addComment(id, nextBody);
      setBody('');
      notify('Comment added and saved in this preview.');
      return;
    }
    setSending(true);
    try {
      const result = await api<{ comment: Comment }>(`/activities/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: nextBody }) });
      setComments(current => [result.comment, ...current]);
      setBody('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add comment');
    } finally {
      setSending(false);
    }
  }

  async function removeActivityComment(comment: Comment) {
    if (isDemo && previewComments.some(item => item.id === comment.id)) {
      deleteComment(id, comment.id);
      notify('Comment deleted.');
      return;
    }
    try {
      await api(`/activities/${id}/comments/${comment.id}`, { method: 'DELETE' });
      setComments(current => current.filter(item => item.id !== comment.id));
      notify('Comment deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete comment');
    }
  }

  async function highFive() {
    if (!activity) return;
    if (isDemo) {
      toggleReaction(id);
      notify(reacted ? 'High-five removed.' : 'High-five sent!');
      return;
    }
    const previous = activity;
    const nextReacted = !activity.reactedByViewer;
    setActivity({ ...activity, reactedByViewer: nextReacted, reactionCount: activity.reactionCount + (nextReacted ? 1 : -1) });
    try {
      const result = await api<{ reacted: boolean; reactionCount: number }>(`/activities/${id}/reactions`, { method: nextReacted ? 'POST' : 'DELETE' });
      setActivity(current => current ? { ...current, reactedByViewer: result.reacted, reactionCount: result.reactionCount } : current);
    } catch {
      setActivity(previous);
      setError('Could not update your high-five.');
    }
  }

  if (error && !activity) return <section className="card error-state"><h1>Activity unavailable</h1><p className="error">{error}</p><Link className="button" href="/">Back to feed</Link></section>;
  if (!activity) return <div className="card skeleton"><span /><span /><span /></div>;

  const metadata = isDemo ? demo : {
    title: `${labelFor(activity.type)} activity`,
    location: 'Shared route',
    description: 'A shared Flinkout activity.',
    tags: [labelFor(activity.type)],
    elevationM: 0,
  };
  const displayReactionCount = activity.reactionCount + (isDemo ? Number(reacted) - Number(activity.reactedByViewer) : 0);
  const speedMetric = activity.type === 'RIDE' ? `${averageSpeedKmh(activity.distanceM, activity.durationS).toFixed(1)} km/h` : formatPace(activity.distanceM, activity.durationS);

  return <section className="session-detail-page">
    <header className="standalone-mobile-header"><button onClick={() => router.back()} aria-label="Back">Back</button><strong>Activity</strong><button aria-label="Share activity" onClick={() => void share({ title: `${metadata.title} on Flinkout`, text: metadata.description })}><UiIcon name="share" /></button></header>
    <div className="session-map-hero"><RouteMap points={activity.route ?? []} /><div className="map-summary-pills"><span><UiIcon name="activity" /><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><UiIcon name="activity" /><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span></div></div>
    <div className="session-detail-grid">
      <main>
        <section className="session-title-card"><div className="avatar small">{activity.user.profile?.displayName?.[0] ?? activity.user.username[0]}</div><div><h1>{metadata.title}</h1><p>by <Link href={`/u/${activity.user.username}`}>{activity.user.profile?.displayName ?? activity.user.username}</Link> - {metadata.location}</p></div><span>#{metadata.tags[0]}</span></section>
        <p className="activity-detail-description">{metadata.description}</p>
        <button className={`high-five-button ${reacted ? 'active' : ''}`} aria-pressed={reacted} onClick={() => void highFive()}>{reacted ? 'High-Five Sent' : 'Send High-Five'} <b>{displayReactionCount}</b></button>
        <section className="session-timeline"><h2>Activity timeline</h2><div><i className="mint"><UiIcon name="play" size={16}/></i><span><strong>Activity started</strong><small>{new Date(activity.startedAt).toLocaleString()} - {metadata.location}</small></span></div><div><i className="blue"><UiIcon name="activity" size={16}/></i><span><strong>{formatDistance(activity.distanceM)} completed</strong><small>{labelFor(activity.type)} at {speedMetric}</small></span></div><div><i className="green"><UiIcon name="stop" size={16}/></i><span><strong>Activity completed</strong><small>{formatDuration(activity.durationS)} moving time</small></span></div></section>
      </main>
      <aside id="comments" className="community-notes">
        <header><h2>Comments</h2><span>{allComments.length} comments</span></header>
        {allComments.map((comment, index) => <article key={comment.id}><small>{comment.isOwner ? 'YOUR COMMENT' : index ? 'COMMUNITY TIP' : 'ROUTE CONDITION'}</small><p>{comment.body}</p><footer>{comment.isOwner ? 'Just now by you' : `Shared by ${comment.user.profile?.displayName ?? comment.user.username}`}<span>{comment.isOwner && <button className="delete-note" onClick={() => void removeActivityComment(comment)}>Delete</button>}<button className={helpful.includes(comment.id) ? 'helpful' : ''} aria-pressed={helpful.includes(comment.id)} onClick={() => setHelpful(current => current.includes(comment.id) ? current.filter(value => value !== comment.id) : [...current, comment.id])}>{helpful.includes(comment.id) ? 'Helpful!' : 'Helpful'}</button></span></footer></article>)}
        <form onSubmit={addActivityComment}><label className="sr-only" htmlFor="comment">Add a comment</label><input id="comment" value={body} onChange={event => setBody(event.target.value)} maxLength={500} placeholder="Add a comment..." /><button disabled={sending || !body.trim()}>{sending ? 'Posting...' : 'Add comment'}</button></form>
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </div>
    <section className="desktop-session-summary"><h2>{metadata.title}</h2><p>{new Date(activity.startedAt).toLocaleString()} - {metadata.location}</p><div><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span><span><small>{activity.type === 'RIDE' ? 'Speed' : 'Pace'}</small><strong>{speedMetric}</strong></span><span><small>Elevation</small><strong>{metadata.elevationM ? `${metadata.elevationM} m` : 'Not available'}</strong></span></div></section>
  </section>;
}
