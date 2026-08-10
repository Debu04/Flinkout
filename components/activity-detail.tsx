'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type ActivityTimelineEvent, type Comment, type SocialActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';
import { getDemoActivity } from '../lib/demo-data';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map detail-map map-loading">Loading route...</div> });
const sourceLabel = (activity: Pick<SocialActivity, 'distanceSource' | 'route' | 'steps'>) => ({ GPS: 'GPS', MOTION: 'motion estimate', FUSED: 'GPS + motion', NONE: 'timer only' })[activity.distanceSource ?? (activity.route?.length ? 'GPS' : activity.steps ? 'MOTION' : 'NONE')];

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
  const { viewer } = useAppSession();
  const { state, hydrated, toggleReaction, addComment, deleteComment } = usePreviewState();
  const isDemo = id.startsWith('demo-');
  const postedActivity = state.postedActivities.find(item => item.id === id);
  const isPreview = isDemo || Boolean(postedActivity);
  const reacted = isPreview ? state.reactedActivityIds.includes(id) : activity?.reactedByViewer ?? false;
  const previewComments = state.comments[id] ?? [];

  useEffect(() => {
    if (isDemo) {
      setActivity(demo.activity);
      setComments(baseComments);
      return;
    }
    if (postedActivity) {
      setActivity(postedActivity);
      setComments([]);
      setError('');
      return;
    }
    if (!hydrated) return;
    Promise.all([api<{ activity: SocialActivity }>(`/activities/${id}`), api<{ comments: Comment[] }>(`/activities/${id}/comments`)])
      .then(([a, c]) => { setActivity(a.activity); setComments(c.comments); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load activity'));
  }, [demo.activity, hydrated, id, isDemo, postedActivity]);

  const allComments = useMemo(() => [
    ...previewComments.map(comment => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, userId: viewer.id, isOwner: true, user: { id: viewer.id, username: viewer.username, profile: { displayName: viewer.profile?.displayName ?? viewer.username, photoUrl: viewer.profile?.photoUrl ?? null } } } satisfies Comment)),
    ...comments,
  ], [comments, previewComments, viewer]);

  async function addActivityComment(event: React.FormEvent) {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody) return;
    if (isPreview) {
      addComment(id, nextBody);
      setActivity(current => current ? { ...current, timeline: [...(current.timeline ?? []), { id: `preview-comment-${crypto.randomUUID()}`, type: 'COMMENT', source: 'ACTIVITY', createdAt: new Date().toISOString(), body: nextBody, user: { id: viewer.id, username: viewer.username, displayName: viewer.profile?.displayName ?? viewer.username, photoUrl: viewer.profile?.photoUrl ?? null } }] } : current);
      setBody('');
      notify('Comment added.');
      return;
    }
    setSending(true);
    try {
      const result = await api<{ comment: Comment }>(`/activities/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: nextBody }) });
      setComments(current => [result.comment, ...current]);
      setActivity(current => current ? { ...current, timeline: [...(current.timeline ?? []), { id: `activity-comment-${result.comment.id}`, type: 'COMMENT', source: 'ACTIVITY', createdAt: result.comment.createdAt, body: result.comment.body, user: { id: result.comment.user.id, username: result.comment.user.username, displayName: result.comment.user.profile?.displayName ?? result.comment.user.username, photoUrl: result.comment.user.profile?.photoUrl ?? null } }] } : current);
      setBody('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add comment');
    } finally {
      setSending(false);
    }
  }

  async function removeActivityComment(comment: Comment) {
    if (isPreview && previewComments.some(item => item.id === comment.id)) {
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
    if (isPreview) {
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
    location: activity.route?.length ? 'Recorded route' : 'Route not recorded',
    description: activity.visibility === 'PRIVATE'
      ? 'A private activity visible only to its owner.'
      : activity.route?.length ? 'A completed Flinkout activity with a recorded route.' : activity.steps ? 'A completed Flinkout activity with motion-estimated steps and distance.' : 'A completed Flinkout activity without a GPS route.',
    tags: [labelFor(activity.type)],
    elevationM: 0,
  };
  const displayReactionCount = activity.reactionCount + (isPreview ? Number(reacted) - Number(activity.reactedByViewer) : 0);
  const speedMetric = activity.type === 'RIDE' ? `${averageSpeedKmh(activity.distanceM, activity.durationS).toFixed(1)} km/h` : formatPace(activity.distanceM, activity.durationS);
  const timeline: ActivityTimelineEvent[] = activity.timeline?.length ? activity.timeline : [
    { id: `${activity.id}-start`, type: 'START', source: 'ACTIVITY', createdAt: activity.startedAt },
    ...(activity.endedAt ? [{ id: `${activity.id}-finish`, type: 'FINISH' as const, source: 'ACTIVITY' as const, createdAt: activity.endedAt }] : []),
  ];
  const timelineLabel = (event: ActivityTimelineEvent) => event.type === 'START' ? 'Activity started'
    : event.type === 'LIVE_STARTED' ? 'Live sharing started'
      : event.type === 'JOINED' ? `${event.user?.displayName ?? 'Someone'} joined live`
        : event.type === 'COMMENT' ? `${event.user?.displayName ?? 'Someone'} shared ${event.source === 'LIVE' ? 'a live update' : 'a comment'}`
          : event.type === 'HIGH_FIVE' ? `${event.user?.displayName ?? 'Someone'} sent a high-five`
            : event.type === 'LIVE_ENDED' ? 'Live sharing ended'
              : 'Activity completed';

  return <section className="session-detail-page">
    <header className="standalone-mobile-header"><button onClick={() => router.back()} aria-label="Back">Back</button><strong>Activity</strong><button aria-label="Share activity" onClick={() => void share({ title: `${metadata.title} on Flinkout`, text: metadata.description })}><UiIcon name="share" /></button></header>
    <div className="session-map-hero">{activity.route?.length ? <RouteMap points={activity.route} /> : <div className="route-empty-state detail-route-empty"><UiIcon name="map" size={32} /><strong>No GPS route was recorded</strong><span>{activity.steps ? `${activity.steps.toLocaleString()} steps were captured using phone motion sensors.` : 'This activity includes time and movement metrics only.'}</span></div>}<div className="map-summary-pills"><span><UiIcon name="activity" /><small>Distance - {sourceLabel(activity)}</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><UiIcon name="activity" /><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span></div></div>
    <div className="session-detail-grid">
      <main>
        <section className="session-title-card"><div className="avatar small">{activity.user.profile?.displayName?.[0] ?? activity.user.username[0]}</div><div><h1>{metadata.title}</h1><p>by <Link href={`/u/${activity.user.username}`}>{activity.user.profile?.displayName ?? activity.user.username}</Link> - {metadata.location}</p></div><span>#{metadata.tags[0]}</span></section>
        <p className="activity-detail-description">{metadata.description}</p>
        <button className={`high-five-button ${reacted ? 'active' : ''}`} aria-pressed={reacted} onClick={() => void highFive()}><UiIcon name="highfive" /> {reacted ? 'High-Five Sent' : 'Send High-Five'} <b>{displayReactionCount}</b></button>
        <section className="session-timeline"><header><h2>Activity timeline</h2><span>{timeline.length} moments</span></header>{timeline.map(event => <div key={event.id}><i className={event.type === 'START' ? 'mint' : event.type === 'FINISH' || event.type === 'LIVE_ENDED' ? 'green' : event.type === 'COMMENT' ? 'blue' : 'peach'}><UiIcon name={event.type === 'START' ? 'play' : event.type === 'FINISH' || event.type === 'LIVE_ENDED' ? 'stop' : event.type === 'COMMENT' ? 'chat' : event.type === 'HIGH_FIVE' ? 'highfive' : event.type === 'JOINED' ? 'group' : 'radio'} size={16}/></i><span><strong>{timelineLabel(event)}</strong>{event.body && <p>{event.body}</p>}<small>{new Date(event.createdAt).toLocaleString()}{event.type === 'FINISH' ? ` - ${formatDistance(activity.distanceM)} in ${formatDuration(activity.durationS)}` : event.latitude !== undefined ? ' - approximate map location saved' : ''}</small></span></div>)}</section>
      </main>
      <aside id="comments" className="community-notes">
        <header><h2>Comments</h2><span>{allComments.length} comments</span></header>
        {allComments.map((comment, index) => <article key={comment.id}><small>{comment.isOwner ? 'YOUR COMMENT' : index ? 'COMMUNITY TIP' : 'ROUTE CONDITION'}</small><p>{comment.body}</p><footer>{comment.isOwner ? 'Just now by you' : `Shared by ${comment.user.profile?.displayName ?? comment.user.username}`}<span>{comment.isOwner && <button className="delete-note" onClick={() => void removeActivityComment(comment)}>Delete</button>}<button className={helpful.includes(comment.id) ? 'helpful' : ''} aria-pressed={helpful.includes(comment.id)} onClick={() => setHelpful(current => current.includes(comment.id) ? current.filter(value => value !== comment.id) : [...current, comment.id])}>{helpful.includes(comment.id) ? 'Helpful!' : 'Helpful'}</button></span></footer></article>)}
        <form onSubmit={addActivityComment}><label className="sr-only" htmlFor="comment">Add a comment</label><input id="comment" value={body} onChange={event => setBody(event.target.value)} maxLength={500} placeholder="Add a comment..." /><button disabled={sending || !body.trim()}>{sending ? 'Posting...' : 'Add comment'}</button></form>
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </div>
    <section className="desktop-session-summary"><h2>{metadata.title}</h2><p>{new Date(activity.startedAt).toLocaleString()} - {metadata.location}</p><div><span><small>Distance - {sourceLabel(activity)}</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(activity.durationS)}</strong></span><span><small>{activity.type === 'RIDE' ? 'Speed' : 'Pace'}</small><strong>{speedMetric}</strong></span><span><small>{activity.type === 'RIDE' ? 'GPS samples' : 'Steps'}</small><strong>{activity.type === 'RIDE' ? activity.route?.length ?? 0 : (activity.steps ?? 0).toLocaleString()}</strong></span></div></section>
  </section>;
}
