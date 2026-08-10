'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type SocialActivity, type User } from '../lib/api';
import { formatDistance, formatDuration, formatPace, labelFor } from '../lib/activity';
import { demoActivities, getDemoActivity, getDemoProfile } from '../lib/demo-data';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

function ProfileMovementCard({ activity }: { activity: SocialActivity }) {
  const metadata = activity.id.startsWith('demo-') ? getDemoActivity(activity.id) : {
    title: `${labelFor(activity.type)} activity`,
    location: activity.route?.length ? 'Your recorded route' : 'Route not shared',
  };
  const { state, toggleReaction, toggleSaved } = usePreviewState();
  const { notify, share } = useInteractions();
  const liked = state.reactedActivityIds.includes(activity.id);
  const saved = state.savedActivityIds.includes(activity.id);
  const count = activity.reactionCount + Number(liked) - Number(activity.reactedByViewer);
  const route = activity.route ?? [];
  const routePath = route.length ? (() => {
    const latitudes = route.map(point => point.latitude);
    const longitudes = route.map(point => point.longitude);
    const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes);
    return route.map(point => `${8 + ((point.longitude - minLon) / (maxLon - minLon || 1)) * 184},${58 - ((point.latitude - minLat) / (maxLat - minLat || 1)) * 48}`).join(' ');
  })() : '';

  return <article className="profile-movement-card">
    <Link href={`/activities/${activity.id}`} className={`profile-route-art ${activity.type.toLowerCase()} ${route.length ? '' : 'empty'}`}><span>{activity.type}</span>{route.length ? <svg viewBox="0 0 200 70" aria-label={`${metadata.title} route preview`} role="img"><polyline points={routePath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg> : <div><UiIcon name="map" /><small>No route recorded</small></div>}</Link>
    <div className="profile-movement-body"><header><div><h3>{metadata.title}</h3><p>{new Date(activity.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} - {metadata.location}</p></div><button aria-label={saved ? 'Remove saved activity' : 'Save activity'} aria-pressed={saved} onClick={() => { toggleSaved(activity.id); notify(saved ? 'Removed from saved activities.' : 'Activity saved for later.'); }}><UiIcon name="bookmark" /></button></header>
      <div className="profile-movement-metrics"><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Time</small><strong>{formatDuration(activity.durationS)}</strong></span><span><small>Pace</small><strong>{formatPace(activity.distanceM, activity.durationS)}</strong></span></div>
      <footer><button className={liked ? 'reacted reaction-pop' : ''} onClick={() => toggleReaction(activity.id)} aria-label={liked ? 'Remove high-five' : 'Send high-five'} aria-pressed={liked}><UiIcon name="highfive" size={19} /> {count}</button><Link href={`/activities/${activity.id}#comments`}><UiIcon name="chat" size={19} /> {activity.commentCount}</Link><button aria-label="Share" onClick={() => void share({ title: metadata.title, url: `${window.location.origin}/activities/${activity.id}` })}><UiIcon name="share" size={19} /></button></footer>
    </div>
  </article>;
}

export function UserProfile({ username }: { username: string }) {
  const demo = getDemoProfile(username);
  const [user, setUser] = useState<User>(demo.user);
  const [activities, setActivities] = useState<SocialActivity[]>(demo.activityIds.map(id => demoActivities[id].activity));
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(true);
  const { notify } = useInteractions();
  const { mode, viewer } = useAppSession();
  const { state, toggleFollow } = usePreviewState();
  const following = state.followingUsernames.includes(user.username);

  useEffect(() => {
    if (mode === 'CHECKING') return;
    if (mode === 'PREVIEW') {
      setUser(getDemoProfile(username).user);
      setActivities(getDemoProfile(username).activityIds.map(id => demoActivities[id].activity));
      setPreview(true);
      setError('');
      return;
    }
    setPreview(false);
    setError('');
    Promise.all([api<{ user: User }>(`/users/${username}`), api<{ activities: SocialActivity[] }>(`/users/${username}/activities`)])
      .then(([u, a]) => { setUser(u.user); setActivities(a.activities); setPreview(false); })
      .catch(cause => {
        setActivities([]);
        setUser({ id: 'unavailable', username, profile: { displayName: username, bio: null, photoUrl: null, profileVisibility: 'PUBLIC', routeVisibility: 'PRIVATE', discoverable: false } });
        setError(cause instanceof Error ? cause.message : 'This profile could not be loaded.');
      });
  }, [mode, username]);

  async function follow() {
    if (user.id.startsWith('demo-')) {
      toggleFollow(user.username);
      notify(following ? `You unfollowed @${user.username}.` : `You are now following @${user.username}.`);
      return;
    }
    const previous = user;
    setUser({ ...user, isFollowing: !user.isFollowing });
    try { await api(`/users/${user.username}/follow`, { method: user.isFollowing ? 'DELETE' : 'POST' }); }
    catch (cause) { setUser(previous); setError(cause instanceof Error ? cause.message : 'Could not update connection'); }
  }

  const location = preview ? demo.location : 'Shared location';
  const effectiveFollowing = user.id.startsWith('demo-') ? following : Boolean(user.isFollowing);
  const visibleActivities = user.username === viewer.username
    ? [...state.postedActivities.filter(activity => activity.durationS >= 30), ...activities.filter(activity => !state.postedActivities.some(posted => posted.id === activity.id))]
    : activities;
  const visibleTotalDistance = visibleActivities.reduce((sum, activity) => sum + activity.distanceM, 0) / 1000;

  return <section className="public-profile-page">
    <header className="standalone-mobile-header"><Link href="/" aria-label="Back to feed">Back</Link><strong>Profile</strong><Link href="/messages" aria-label="Open messages"><UiIcon name="chat" /></Link></header>
    {preview && <p className="demo-note profile-demo-note">Interactive preview profile - connection and activity actions persist in this browser.</p>}
    <section className="public-profile-hero">
      <div className="public-avatar">{user.profile?.photoUrl ? <img src={user.profile.photoUrl} alt={`${user.profile.displayName} profile`} /> : user.profile?.displayName?.[0]}<span aria-hidden>online</span></div>
      <h1>{user.profile?.displayName}</h1><p>@{user.username} <i /> {location}</p>
      {user.isSelf ? <Link className="follow-button" href="/profile/edit">Edit profile</Link> : <button className="follow-button" aria-pressed={effectiveFollowing} onClick={() => void follow()}>{effectiveFollowing ? 'Following' : 'Follow'}</button>}
      {user.profile?.bio && <p className="public-profile-bio">{user.profile.bio}</p>}
    </section>
    <section className="public-profile-stats"><span><small>Activities</small><strong>{visibleActivities.length}</strong></span><span><small>Total distance</small><strong>{visibleTotalDistance.toFixed(1)} <em>km</em></strong></span><span><small>Streak</small><strong>{preview ? demo.streakDays : 0} <em>Days</em></strong></span></section>
    <section className="recent-movement"><header><h2>Recent Movement</h2><Link href="/explore">Explore more</Link></header>{visibleActivities.length ? visibleActivities.map(activity => <ProfileMovementCard key={activity.id} activity={activity} />) : <div className="card empty-state"><h3>No public activities yet</h3><p>Shared movement will appear here.</p></div>}</section>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
