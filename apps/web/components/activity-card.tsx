'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, type SocialActivity } from '../lib/api';
import { averageSpeedKmh, formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';
import { syncActivity } from '../lib/activity-sync';
import { getDemoActivity } from '../lib/demo-data';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

function RoutePreview({ points, activityType }: { points: SocialActivity['route']; activityType: SocialActivity['type'] }) {
  if (!points?.length) return <div className="route-preview empty">Route unavailable</div>;
  const lat = points.map(point => point.latitude);
  const lon = points.map(point => point.longitude);
  const minLat = Math.min(...lat), maxLat = Math.max(...lat);
  const minLon = Math.min(...lon), maxLon = Math.max(...lon);
  const coords = points.map(point => `${15 + ((point.longitude - minLon) / (maxLon - minLon || 1)) * 170},${86 - ((point.latitude - minLat) / (maxLat - minLat || 1)) * 72}`).join(' ');
  return <div className={`route-preview trail-route ${activityType.toLowerCase()}`}>
    <span className="terrain-shape terrain-one" /><span className="terrain-shape terrain-two" /><span className="terrain-water" />
    <svg viewBox="0 0 200 100" aria-label="Activity route preview" role="img"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span className="route-camera start">□</span><span className="route-camera finish">□</span>
  </div>;
}

function Avatar({ activity }: { activity: SocialActivity }) {
  const profile = activity.user.profile;
  return profile?.photoUrl ? <img className="avatar small" src={profile.photoUrl} alt="" /> : <span className={`avatar small activity-avatar ${activity.type.toLowerCase()}`} aria-hidden>{(profile?.displayName ?? activity.user.username)[0].toUpperCase()}</span>;
}

function contentFor(activity: SocialActivity) {
  if (activity.id.startsWith('demo-')) {
    const demo = getDemoActivity(activity.id);
    return { location: demo.location, description: demo.description, tags: demo.tags };
  }
  if (activity.id.startsWith('preview-')) {
    const name = labelFor(activity.type);
    return {
      location: activity.route?.length ? 'Recorded route' : 'Route not shared',
      description: activity.syncStatus && activity.syncStatus !== 'SYNCED'
        ? `Completed a ${name.toLowerCase()}. This activity is saved in a device-only preview and has not been published.`
        : activity.visibility === 'PRIVATE'
        ? `Completed a ${name.toLowerCase()} and saved it privately.`
        : `Completed a ${name.toLowerCase()} and shared it with ${activity.visibility === 'PUBLIC' ? 'the Flinkout community' : 'their followers'}.`,
      tags: [`${name}Activity`, 'KeepMoving'],
    };
  }
  if (activity.type === 'RIDE') return { location: 'Downtown Greenway', description: "Light ride before work. The waterfront is always therapeutic. Who's out this weekend?", tags: ['CityRide', 'MorningMiles'] };
  if (activity.type === 'HIKE') return { location: 'Peak Trail Entrance', description: 'A slow climb, wide views, and exactly the kind of quiet morning I needed.', tags: ['TrailDay', 'WeekendHike'] };
  if (activity.type === 'WALK') return { location: 'East Side Park', description: 'A relaxed neighborhood loop with good company and even better weather.', tags: ['DailyWalk', 'TogetherOutside'] };
  return { location: 'Silver Creek Loop', description: 'Crisp morning air and perfectly quiet trails today. Finally beat my best time on the ascent!', tags: ['MorningRun', 'TrailRun', 'SoloSession'] };
}

export function ActivityCard({ initial }: { initial: SocialActivity }) {
  const [activity, setActivity] = useState(initial);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { notify, share } = useInteractions();
  const { viewer, mode } = useAppSession();
  const { state, toggleReaction: togglePreviewReaction, toggleSaved, toggleHidden, postActivity } = usePreviewState();
  const menuRef = useRef<HTMLElement>(null);
  const isPreview = activity.id.startsWith('demo-') || activity.id.startsWith('preview-');
  const reacted = isPreview ? state.reactedActivityIds.includes(activity.id) : activity.reactedByViewer;
  const reactionCount = isPreview ? activity.reactionCount + Number(reacted) - Number(activity.reactedByViewer) : activity.reactionCount;
  const saved = state.savedActivityIds.includes(activity.id);
  const hidden = state.hiddenActivityIds.includes(activity.id);
  const paceType = activity.type !== 'RIDE';
  const metric = paceType ? formatPace(activity.distanceM, activity.durationS) : `${averageSpeedKmh(activity.distanceM, activity.durationS).toFixed(1)} km/h`;
  const content = contentFor(activity);

  async function toggleReaction() {
    if (isPreview) {
      togglePreviewReaction(activity.id);
      notify(reacted ? 'High-five removed.' : 'High-five sent!');
      return;
    }
    const previous = activity;
    const next = { ...activity, reactedByViewer: !activity.reactedByViewer, reactionCount: activity.reactionCount + (activity.reactedByViewer ? -1 : 1) };
    setActivity(next); setError('');
    try {
      const result = await api<{ reacted: boolean; reactionCount: number }>(`/activities/${activity.id}/reactions`, { method: activity.reactedByViewer ? 'DELETE' : 'POST' });
      setActivity(current => ({ ...current, reactedByViewer: result.reacted, reactionCount: result.reactionCount }));
    } catch (cause) {
      setActivity(previous);
      setError(cause instanceof Error ? cause.message : 'Could not update reaction');
    }
  }

  async function retryPublish() {
    if (!activity.clientId || activity.syncStatus === 'SYNCING') return;
    if (mode !== 'CONNECTED') {
      notify('Sign in with the account that recorded this activity before retrying.');
      return;
    }
    setActivity(current => ({ ...current, syncStatus: 'SYNCING', syncError: null }));
    const result = await syncActivity(activity.clientId, viewer.id);
    if (!result) {
      setActivity(current => ({ ...current, syncStatus: 'FAILED', syncError: 'Local activity was not found.' }));
      notify('The saved activity could not be found on this device.');
      return;
    }
    const next: SocialActivity = {
      ...activity,
      syncedActivityId: result.syncedActivityId,
      syncStatus: result.syncStatus,
      syncError: result.syncError,
    };
    setActivity(next);
    postActivity(next);
    notify(result.syncStatus === 'SYNCED' ? 'Activity published successfully.' : 'Publishing failed again. Your activity is still saved locally.');
  }

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  if (hidden) return <section className="activity-hidden card"><p>Activity hidden from your feed.</p><button onClick={() => toggleHidden(activity.id)}>Undo</button></section>;

  return <article className="activity-card card">
    <header className="activity-head" ref={menuRef}>
      <Link href={`/u/${activity.user.username}`} className="row profile-link">
        <Avatar activity={activity} />
        <span><strong>{activity.user.profile?.displayName ?? activity.user.username} <small>• {new Date(activity.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</small></strong><em><UiIcon name="map" size={14} />{content.location}</em></span>
      </Link>
      <button className="more-button" aria-label={`More options for ${activity.user.profile?.displayName ?? activity.user.username}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><UiIcon name="more" /></button>
      {menuOpen && <div className="activity-option-menu">
        <Link href={`/activities/${activity.id}`}>View activity</Link>
        <button onClick={() => { if (!saved) toggleSaved(activity.id); setMenuOpen(false); notify(saved ? 'Already saved.' : 'Activity saved for later.'); }}>{saved ? 'Saved activity' : 'Save activity'}</button>
        <button onClick={() => { toggleHidden(activity.id); setMenuOpen(false); notify('Activity hidden. You can undo it in the feed.'); }}>Hide from feed</button>
      </div>}
    </header>
    <div className="route-shell">
      <Link href={`/activities/${activity.id}`} aria-label="Open activity details"><RoutePreview points={activity.route} activityType={activity.type} /></Link>
      <div className="activity-metrics">
        <span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span>
        <span><small>Time</small><strong>{formatDuration(activity.durationS)}</strong></span>
        <span><small>{paceType ? 'Pace' : 'Speed'}</small><strong>{metric}</strong></span>
      </div>
      <Link className="route-play" href={`/activities/${activity.id}`} aria-label="Replay activity"><UiIcon name="play" size={26} /></Link>
    </div>
    <div className="activity-story"><p>{content.description}</p><div>{content.tags.map(tag => <span key={tag}>#{tag}</span>)}</div></div>
    {activity.syncStatus && activity.syncStatus !== 'SYNCED' && <div className={`activity-sync-state ${activity.syncStatus.toLowerCase()}`} role="status">
      <span><UiIcon name={activity.syncStatus === 'FAILED' ? 'radio' : 'bookmark'} size={17} /><strong>{mode === 'PREVIEW' ? 'Device-only preview · not published' : activity.syncStatus === 'FAILED' ? 'Saved locally · publishing failed' : activity.syncStatus === 'SYNCING' ? 'Publishing activity…' : 'Saved locally · waiting to publish'}</strong></span>
      {activity.syncStatus === 'FAILED' && <button onClick={() => void retryPublish()}>Retry</button>}
    </div>}
    <footer className="activity-actions">
      <div><button className={reacted ? 'reacted reaction-pop' : ''} onClick={toggleReaction} aria-label={reacted ? 'Remove high-five' : 'Send high-five'} aria-pressed={reacted}><UiIcon name="highfive" /> {reactionCount}</button><Link href={`/activities/${activity.id}#comments`}><UiIcon name="chat" /> {activity.commentCount}</Link><button aria-label="Share activity" onClick={() => void share({ title: `${content.location} on Flinkout`, text: content.description, url: `${window.location.origin}/activities/${activity.id}` })}><UiIcon name="share" /></button></div>
      <button className={saved ? 'saved' : ''} onClick={() => { toggleSaved(activity.id); notify(saved ? 'Removed from saved activities.' : 'Activity saved for later.'); }} aria-label={saved ? 'Remove bookmark' : 'Bookmark activity'} aria-pressed={saved}><UiIcon name="bookmark" /></button>
    </footer>
    {error && <p className="error card-error" role="alert">{error}</p>}
  </article>;
}

export function FeedSkeleton() {
  return <div className="card skeleton"><span /><span /><span /><span /></div>;
}
