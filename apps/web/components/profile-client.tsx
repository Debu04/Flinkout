'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type Profile, type SocialActivity, type User } from '../lib/api';
import { demoActivities } from '../lib/demo-data';
import { ActivityCard } from './activity-card';
import { useInteractions, usePreviewState } from './interaction-provider';
const baseProfile: Profile = { displayName: 'Marcus Rivera', bio: 'Everyday explorer, weekend trail guide, and believer that movement is better together.', photoUrl: null, profileVisibility: 'PUBLIC', routeVisibility: 'FOLLOWERS', discoverable: true };
function previewUser(): User {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('flinkout-preview-profile');
    if (saved) return { id: 'demo-marcus', username: 'marcus_moves', profile: JSON.parse(saved) as Profile, isSelf: true };
  }
  return { id: 'demo-marcus', username: 'marcus_moves', profile: baseProfile, isSelf: true };
}
const previewActivities: SocialActivity[] = [demoActivities['demo-own-walk'].activity];

function Avatar({ user }: { user: User }) {
  const photo = user.profile?.photoUrl;
  return photo ? <img className="avatar" src={photo} alt={`${user.profile?.displayName ?? user.username}'s profile photo`} /> : <div className="avatar" aria-hidden>{(user.profile?.displayName ?? user.username)[0]?.toUpperCase()}</div>;
}

export function MyProfile() {
  const [user, setUser] = useState<User>(() => previewUser());
  const [activities, setActivities] = useState<SocialActivity[]>(previewActivities);
  const [preview, setPreview] = useState(true);
  const { notify } = useInteractions();
  const { resetPreview } = usePreviewState();
  useEffect(() => {
    api<{user: User}>('/auth/me').then(async response => {
      setUser(response.user);
      return api<{activities: SocialActivity[]}>(`/users/${response.user.username}/activities`);
    }).then(response => { setActivities(response.activities); setPreview(false); }).catch(() => undefined);
  }, []);
  if (!user) return <p className="hint">Loading profile…</p>;
  return <section className="stack my-profile-page">
    {preview && <p className="demo-note">Local preview profile · changes are saved in this browser.</p>}
    <div className="profile-head card"><Avatar user={user}/><div className="grow"><h1>{user.profile?.displayName}</h1><p className="hint">@{user.username}</p></div><Link className="button secondary" href="/profile/edit">Edit profile</Link></div>
    <section className="card"><h2>About</h2><p>{user.profile?.bio || 'Add a bio to tell your movement community about you.'}</p></section>
    <h2>Recent activities</h2>
    {activities.length ? activities.map(activity => <ActivityCard key={activity.id} initial={activity}/>) : <section className="card empty-state"><p>Activities you sync and share will appear here.</p></section>}
    <button className="button danger" onClick={async () => {
      if (preview) {
        resetPreview();
        localStorage.removeItem('flinkout-preview-profile');
        setUser(previewUser());
        setActivities(previewActivities);
        notify('Preview activity, social, and profile data were reset.');
        return;
      }
      await api('/auth/logout', { method: 'POST' }); location.href = '/login';
    }}>{preview ? 'Reset preview session' : 'Log out'}</button>
  </section>;
}

export function EditProfile() {
  const [user, setUser] = useState<User>(() => previewUser());
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(true);
  useEffect(() => {
    api<{user: User}>('/auth/me').then(response => { setUser(response.user); setPreview(false); }).catch(() => undefined);
  }, []);
  async function save(form: FormData) {
    setMessage('');
    const data = Object.fromEntries(form);
    const profile: Profile = {
      displayName: String(data.displayName),
      bio: data.bio ? String(data.bio) : null,
      photoUrl: data.photoUrl ? String(data.photoUrl) : null,
      profileVisibility: data.profileVisibility as Profile['profileVisibility'],
      routeVisibility: data.routeVisibility as Profile['routeVisibility'],
      discoverable: data.discoverable === 'on',
    };
    if (preview) {
      localStorage.setItem('flinkout-preview-profile', JSON.stringify(profile));
      setUser(current => current ? { ...current, profile } : current);
      setMessage('Profile saved locally.');
      return;
    }
    try {
      await api('/users/me/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      setMessage('Profile saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save profile'); }
  }
  if (!user) return <p className="hint">Loading…</p>;
  const p = user.profile ?? baseProfile;
  const success = message === 'Profile saved.' || message === 'Profile saved locally.';
  return <section className="card stack edit-profile-page">
    <div><h1>Edit profile</h1><p className="hint">Nearby discovery stores only your approximate area, never a live exact location.</p></div>
    {preview && <p className="demo-note">Preview mode · these settings persist in this browser.</p>}
    <form className="stack" action={save}>
      <label className="field">Display name<input name="displayName" required defaultValue={p.displayName}/></label>
      <label className="field">Bio<textarea name="bio" maxLength={280} defaultValue={p.bio ?? ''}/></label>
      <label className="field">Profile photo URL<input name="photoUrl" type="url" defaultValue={p.photoUrl ?? ''} placeholder="https://…"/></label>
      <label className="field">Profile visibility<select name="profileVisibility" defaultValue={p.profileVisibility}><option value="PUBLIC">Public</option><option value="FOLLOWERS">Followers only</option><option value="PRIVATE">Private</option></select></label>
      <label className="field">Route visibility<select name="routeVisibility" defaultValue={p.routeVisibility}><option value="PRIVATE">Only me</option><option value="FOLLOWERS">Followers only</option><option value="PUBLIC">Public</option></select></label>
      <label className="row"><input name="discoverable" type="checkbox" defaultChecked={p.discoverable}/> Let people near me discover my approximate area</label>
      {message && <p role="status" className={success ? 'hint' : 'error'}>{message}</p>}
      <button className="button">Save changes</button>
    </form>
  </section>;
}
