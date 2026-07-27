'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type SocialActivity, type User } from '../lib/api';
import { formatDistance, formatDuration, formatPace } from '../lib/activity';
import { useInteractions } from './interaction-provider';
import { UiIcon } from './ui-icon';

const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });

function demoProfile(username: string): { user: User; activities: SocialActivity[] } {
  const isElena = username.includes('elena');
  const isSienna = username.includes('sienna');
  const displayName = isElena ? 'Elena Rodriguez' : isSienna ? 'Sienna Williams' : 'Marcus Rivera';
  const handle = isElena ? 'elena_trails' : isSienna ? 'sienna_trails' : 'marcus_moves';
  const user: User = { id: `demo-${handle}`, username: handle, profile: { displayName, bio: 'Los Angeles, CA · Everyday explorer and community trail guide.', photoUrl: null, profileVisibility: 'PUBLIC', routeVisibility: 'PUBLIC', discoverable: true }, isFollowing: false, isSelf: false };
  const shared = (id: string, distanceM: number, durationS: number, days: number): SocialActivity => ({ id, type: 'WALK', visibility: 'PUBLIC', startedAt: new Date(Date.now() - days * 86400000).toISOString(), endedAt: null, durationS, distanceM, route: [point(34.052, -118.244), point(34.058, -118.238)], user: { id: user.id, username: handle, profile: { displayName, photoUrl: null } }, reactionCount: days === 1 ? 12 : 28, commentCount: days === 1 ? 4 : 8, reactedByViewer: false });
  return { user, activities: [shared('demo-run', 6200, 4800, 1), shared('demo-walk', 4500, 3300, 3)] };
}

function ProfileMovementCard({ activity, index }: { activity: SocialActivity; index: number }) {
  const [liked, setLiked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { notify, share } = useInteractions();
  return <article className="profile-movement-card">
    <Link href={`/activities/${activity.id}`} className={`profile-route-art ${index ? 'coast' : 'city'}`}><span>{index ? 'COASTAL WALK' : 'TRAIL WALK'}</span><svg viewBox="0 0 200 70" aria-hidden><path d={index ? 'M10 48 C45 12,65 58,105 25 S165 50,192 14' : 'M8 55 L48 32 L88 43 L121 13 L192 29'} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg></Link>
    <div className="profile-movement-body"><header><div><h3>{index ? 'Sunset Promenade' : 'Morning Griffith Loop'}</h3><p>{index ? '3 days ago · 05:15 PM' : 'Yesterday · 08:42 AM'}</p></div><button aria-label="More options" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><UiIcon name="more" /></button>{menuOpen && <div className="profile-card-menu"><Link href={`/activities/${activity.id}`}>Open activity</Link><button onClick={() => { setMenuOpen(false); notify('Activity saved for later.'); }}>Save activity</button></div>}</header>
      <div className="profile-movement-metrics"><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Time</small><strong>{formatDuration(activity.durationS)}</strong></span><span><small>Pace</small><strong>{formatPace(activity.distanceM, activity.durationS)}</strong></span></div>
      <footer><button className={liked ? 'reacted' : ''} onClick={() => setLiked(value => !value)} aria-pressed={liked}><UiIcon name="heart" size={19} /> {activity.reactionCount + (liked ? 1 : 0)}</button><Link href={`/activities/${activity.id}#comments`}><UiIcon name="chat" size={19} /> {activity.commentCount}</Link><button aria-label="Share" onClick={() => void share({ title: index ? 'Sunset Promenade' : 'Morning Griffith Loop', url: `${window.location.origin}/activities/${activity.id}` })}><UiIcon name="share" size={19} /></button></footer>
    </div>
  </article>;
}

export function UserProfile({ username }: { username: string }) {
  const initial = demoProfile(username);
  const [user, setUser] = useState<User>(initial.user);
  const [activities, setActivities] = useState<SocialActivity[]>(initial.activities);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(true);
  const { notify } = useInteractions();

  useEffect(() => {
    Promise.all([api<{ user: User }>(`/users/${username}`), api<{ activities: SocialActivity[] }>(`/users/${username}/activities`)])
      .then(([u, a]) => { setUser(u.user); setActivities(a.activities); setPreview(false); })
      .catch(() => undefined);
  }, [username]);

  async function follow() {
    if (!user) return;
    const previous = user; setUser({ ...user, isFollowing: !user.isFollowing });
    notify(user.isFollowing ? `You unfollowed @${user.username}.` : `You’re now following @${user.username}.`);
    if (user.id.startsWith('demo-')) return;
    try { await api(`/users/${user.username}/follow`, { method: user.isFollowing ? 'DELETE' : 'POST' }); }
    catch (cause) { setUser(previous); setError(cause instanceof Error ? cause.message : 'Could not update connection'); }
  }

  if (!user) return <div className="card skeleton"><span /><span /></div>;
  return <section className="public-profile-page">
    <header className="standalone-mobile-header"><Link href="/" aria-label="Back">←</Link><strong>Public Profile</strong><Link href="/messages" aria-label="Notifications"><UiIcon name="bell" /></Link></header>
    {preview && <p className="demo-note profile-demo-note">Preview profile · connect the database API to use real accounts.</p>}
    <section className="public-profile-hero">
      <div className="public-avatar">{user.profile?.photoUrl ? <img src={user.profile.photoUrl} alt="" /> : user.profile?.displayName?.[0]}<span>◉</span></div>
      <h1>{user.profile?.displayName}</h1><p>@{user.username} <i /> <b>⌖</b> Los Angeles, CA</p>
      {!user.isSelf && <button className="follow-button" onClick={() => void follow()}>{user.isFollowing ? 'Following' : 'Follow'}</button>}
    </section>
    <section className="public-profile-stats"><span><small>Activities</small><strong>128</strong></span><span><small>Total<br />Distance</small><strong>842 <em>km</em></strong></span><span><small>Streak ♨</small><strong>12 <em>Days</em></strong></span></section>
    <section className="recent-movement"><header><h2>Recent Movement</h2><Link href="/">View all</Link></header>{activities.map((activity, index) => <ProfileMovementCard key={activity.id} activity={activity} index={index} />)}</section>
    {error && <p className="error">{error}</p>}
  </section>;
}
