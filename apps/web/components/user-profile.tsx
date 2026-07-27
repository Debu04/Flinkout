'use client';

import { useEffect, useState } from 'react';
import { api, type SocialActivity, type User } from '../lib/api';
import { ActivityCard } from './activity-card';

const point = (latitude: number, longitude: number) => ({ latitude, longitude, accuracy: null, altitude: null, speed: null, recordedAt: new Date().toISOString() });

function demoProfile(username: string): { user: User; activities: SocialActivity[] } {
  const arjun = username.includes('arjun');
  const displayName = arjun ? 'Arjun Mehta' : 'Maya Patel';
  const user: User = {
    id: `demo-${username}`,
    username,
    profile: { displayName, bio: arjun ? 'Weekend cyclist · Mumbai streets and coastal roads.' : 'Runner, coffee person, and sunrise chaser.', photoUrl: null, profileVisibility: 'PUBLIC', routeVisibility: 'PUBLIC', discoverable: true },
    isFollowing: arjun,
    isSelf: false,
  };
  const activities: SocialActivity[] = [{
    id: arjun ? 'demo-ride' : 'demo-run',
    type: arjun ? 'RIDE' : 'RUN',
    visibility: 'PUBLIC',
    startedAt: new Date(Date.now() - (arjun ? 86400000 : 0)).toISOString(),
    endedAt: null,
    durationS: arjun ? 3620 : 2840,
    distanceM: arjun ? 18300 : 7100,
    route: arjun ? [point(19.07, 72.87), point(19.084, 72.89)] : [point(19.076, 72.878), point(19.079, 72.882), point(19.081, 72.885)],
    user: { id: user.id, username, profile: { displayName, photoUrl: null } },
    reactionCount: arjun ? 27 : 42,
    commentCount: arjun ? 4 : 8,
    reactedByViewer: false,
  }];
  return { user, activities };
}

export function UserProfile({ username }: { username: string }) {
  const [user, setUser] = useState<User>();
  const [activities, setActivities] = useState<SocialActivity[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    Promise.all([api<{ user: User }>(`/users/${username}`), api<{ activities: SocialActivity[] }>(`/users/${username}/activities`)])
      .then(([userResult, activityResult]) => {
        setUser(userResult.user);
        setActivities(activityResult.activities);
      })
      .catch(() => {
        const demo = demoProfile(username);
        setUser(demo.user);
        setActivities(demo.activities);
        setPreview(true);
      });
  }, [username]);

  async function follow() {
    if (!user) return;
    const previous = user;
    setUser({ ...user, isFollowing: !user.isFollowing });
    if (user.id.startsWith('demo-')) return;
    try {
      await api(`/users/${user.username}/follow`, { method: user.isFollowing ? 'DELETE' : 'POST' });
    } catch (cause) {
      setUser(previous);
      setError(cause instanceof Error ? cause.message : 'Could not update connection');
    }
  }

  if (!user) return <div className="card skeleton"><span /><span /></div>;
  return <section className="stack profile-page">
    {preview && <p className="demo-note">Preview profile · connect the database API to use real accounts.</p>}
    <header className="card profile-cover">
      <div className="profile-gradient" />
      <div className="profile-content">
        <div className="avatar profile-avatar">{user.profile?.photoUrl ? <img className="avatar" src={user.profile.photoUrl} alt="" /> : user.profile?.displayName?.[0]}</div>
        <div className="grow"><h1>{user.profile?.displayName}</h1><p className="hint">@{user.username}</p><p>{user.profile?.bio}</p></div>
        {!user.isSelf && <button className={`button ${user.isFollowing ? 'secondary' : ''}`} onClick={() => void follow()}>{user.isFollowing ? 'Following' : 'Follow'}</button>}
      </div>
      <div className="profile-stats"><span><strong>{activities.length}</strong>Activities</span><span><strong>1.2k</strong>Followers</span><span><strong>186</strong>Following</span></div>
    </header>
    <div className="section-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Recent movement</h2></div></div>
    {activities.length ? activities.map(activity => <ActivityCard key={activity.id} initial={activity} />) : <section className="card empty-state"><p>No shared activities yet.</p></section>}
    {error && <p className="error">{error}</p>}
  </section>;
}
