'use client';

import { useState } from 'react';
import { api, type LiveActivity } from '../lib/api';
import { formatDistance, formatDuration, labelFor } from '../lib/activity';
import { useInteractions } from './interaction-provider';

const demo: LiveActivity[] = [
  { id: 'demo-live-1', type: 'RUN', visibility: 'PUBLIC', latitude: 19.076, longitude: 72.878, durationS: 1542, distanceM: 4630, startedAt: new Date().toISOString(), joinCount: 3, distanceKm: 1.2, user: { id: 'demo-1', username: 'maya_runs', displayName: 'Maya Patel', photoUrl: null } },
  { id: 'demo-live-2', type: 'RIDE', visibility: 'FOLLOWERS', latitude: 19.08, longitude: 72.87, durationS: 3120, distanceM: 14100, startedAt: new Date().toISOString(), joinCount: 1, distanceKm: 3.8, user: { id: 'demo-2', username: 'arjun_moves', displayName: 'Arjun Mehta', photoUrl: null } },
];

export function LiveActivityPanel() {
  const [items, setItems] = useState<LiveActivity[]>(demo);
  const [notice, setNotice] = useState('Preview sessions are privacy-safe and use approximate locations.');
  const [joining, setJoining] = useState('');
  const [joined, setJoined] = useState<string[]>([]);
  const { notify } = useInteractions();

  async function join(item: LiveActivity) {
    const active = joined.includes(item.id);
    if (item.id.startsWith('demo-')) {
      setJoined(current => active ? current.filter(value => value !== item.id) : [...current, item.id]);
      setItems(current => current.map(value => value.id === item.id ? { ...value, joinCount: Math.max(0, value.joinCount + (active ? -1 : 1)) } : value));
      setNotice(active ? `You left ${item.user.displayName}’s live session.` : `You joined ${item.user.displayName}’s live session.`);
      notify(active ? 'Live session left.' : 'Joined live session. Open Messages to coordinate.');
      return;
    }
    setJoining(item.id);
    try {
      await api(`/live/${item.id}/join`, { method: active ? 'DELETE' : 'POST' });
      setJoined(current => active ? current.filter(value => value !== item.id) : [...current, item.id]);
      setItems(current => current.map(value => value.id === item.id ? { ...value, joinCount: Math.max(0, value.joinCount + (active ? -1 : 1)) } : value));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update live session'); }
    finally { setJoining(''); }
  }

  return <section className="live-panel card stack">
    <div className="row"><div className="live-dot"/><div className="grow"><h2>Live near you</h2><p className="hint">{notice}</p></div><span className="live-label">LIVE</span></div>
    {items.map(item => <article className="live-card" key={item.id}><div className="avatar small">{item.user.displayName[0]}</div><div className="grow"><strong>{item.user.displayName}</strong><small>{labelFor(item.type)} · {formatDistance(item.distanceM)} · {formatDuration(item.durationS)}</small><small>Approx. {item.distanceKm.toFixed(1)} km away · {item.joinCount} connected</small></div><button className="button secondary" onClick={() => void join(item)} disabled={joining === item.id}>{joining === item.id ? 'Updating…' : joined.includes(item.id) ? 'Joined' : 'Join'}</button></article>)}
  </section>;
}
