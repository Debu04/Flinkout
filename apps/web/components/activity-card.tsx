'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';

function RoutePreview({ points }: { points: SocialActivity['route'] }) {
  if (!points?.length) return <div className="route-preview empty">Route unavailable</div>;
  const lat = points.map(point => point.latitude);
  const lon = points.map(point => point.longitude);
  const minLat = Math.min(...lat), maxLat = Math.max(...lat);
  const minLon = Math.min(...lon), maxLon = Math.max(...lon);
  const coords = points.map(point =>
    `${12 + ((point.longitude - minLon) / (maxLon - minLon || 1)) * 176},${88 - ((point.latitude - minLat) / (maxLat - minLat || 1)) * 76}`,
  ).join(' ');
  return <div className="route-preview"><svg viewBox="0 0 200 100" aria-label="Activity route preview" role="img"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="route-start" /><span className="route-finish" /></div>;
}

function Avatar({ activity }: { activity: SocialActivity }) {
  const profile = activity.user.profile;
  return profile?.photoUrl
    ? <img className="avatar small" src={profile.photoUrl} alt="" />
    : <span className="avatar small" aria-hidden>{(profile?.displayName ?? activity.user.username)[0].toUpperCase()}</span>;
}

export function ActivityCard({ initial }: { initial: SocialActivity }) {
  const [activity, setActivity] = useState(initial);
  const [error, setError] = useState('');
  const paceType = activity.type !== 'RIDE';
  const metric = paceType
    ? formatPace(activity.distanceM, activity.durationS)
    : `${averageSpeedKmh(activity.distanceM, activity.durationS).toFixed(1)} km/h`;

  async function toggleReaction() {
    const previous = activity;
    const next = { ...activity, reactedByViewer: !activity.reactedByViewer, reactionCount: activity.reactionCount + (activity.reactedByViewer ? -1 : 1) };
    setActivity(next);
    setError('');
    if (activity.id.startsWith('demo-')) return;
    try {
      const result = await api<{ reacted: boolean; reactionCount: number }>(`/activities/${activity.id}/reactions`, { method: activity.reactedByViewer ? 'DELETE' : 'POST' });
      setActivity(current => ({ ...current, reactedByViewer: result.reacted, reactionCount: result.reactionCount }));
    } catch (cause) {
      setActivity(previous);
      setError(cause instanceof Error ? cause.message : 'Could not update reaction');
    }
  }

  return <article className="activity-card card">
    <header className="activity-head">
      <Link href={`/u/${activity.user.username}`} className="row profile-link">
        <Avatar activity={activity} />
        <span>
          <strong>{activity.user.profile?.displayName ?? activity.user.username}</strong>
          <small>@{activity.user.username} · {new Date(activity.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
        </span>
      </Link>
      <button className="more-button" aria-label="More activity options">•••</button>
    </header>
    <div className="activity-copy">
      <h2>{activity.type === 'RIDE' ? 'Morning city ride' : activity.type === 'HIKE' ? 'Trail day' : activity.type === 'WALK' ? 'Daily walk' : 'Morning run'}</h2>
      <span className="activity-type">{labelFor(activity.type)}</span>
    </div>
    <Link href={`/activities/${activity.id}`} aria-label="Open activity details"><RoutePreview points={activity.route} /></Link>
    <div className="activity-metrics">
      <span><strong>{formatDistance(activity.distanceM)}</strong>Distance</span>
      <span><strong>{formatDuration(activity.durationS)}</strong>Duration</span>
      <span><strong>{metric}</strong>{paceType ? 'Avg. pace' : 'Avg. speed'}</span>
    </div>
    <footer className="activity-actions">
      <button className={activity.reactedByViewer ? 'reacted' : ''} onClick={toggleReaction} aria-pressed={activity.reactedByViewer}><span aria-hidden>{activity.reactedByViewer ? '♥' : '♡'}</span> {activity.reactionCount}</button>
      <Link href={`/activities/${activity.id}#comments`}><span aria-hidden>○</span> {activity.commentCount} comments</Link>
      <button aria-label="Share activity"><span aria-hidden>↗</span> Share</button>
    </footer>
    {error && <p className="error card-error" role="alert">{error}</p>}
  </article>;
}

export function FeedSkeleton() {
  return <div className="card skeleton"><span /><span /><span /><span /></div>;
}
