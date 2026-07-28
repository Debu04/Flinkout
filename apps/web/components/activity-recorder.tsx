'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_TYPES, averageSpeedKmh, distanceBetween, elapsedSeconds, formatDistance, formatDuration, formatPace, labelFor, shouldKeepPoint, type ActivityType, type LocalActivity, type RoutePoint } from '../lib/activity';
import { deleteActivity, getIncompleteActivity, putActivity } from '../lib/activity-db';
import { syncActivity, syncPendingActivities } from '../lib/activity-sync';
import { api } from '../lib/api';
import { useInteractions } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map" aria-label="Loading route map" /> });
type Screen = 'PICKER' | 'LIVE' | 'SUMMARY';
const now = () => new Date().toISOString();

export function ActivityRecorder() {
  const [activity, setActivity] = useState<LocalActivity>();
  const [screen, setScreen] = useState<Screen>('PICKER');
  const [selected, setSelected] = useState<ActivityType>('WALK');
  const [gps, setGps] = useState('GPS will start when you record.');
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState(false);
  const [goLive, setGoLive] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [waveSent, setWaveSent] = useState(false);
  const { notify } = useInteractions();
  const watchId = useRef<number | undefined>(undefined);
  const activityRef = useRef<LocalActivity | undefined>(undefined);

  useEffect(() => { activityRef.current = activity; setElapsed(activity ? elapsedSeconds(activity) : 0); }, [activity]);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void syncPendingActivities().then(results => {
        const latest = results.find(result => result?.clientId === activityRef.current?.clientId);
        if (latest) { activityRef.current = latest; setActivity(latest); }
      });
    };
    setOnline(navigator.onLine);
    if (navigator.onLine) void syncPendingActivities();
    addEventListener('online', update); addEventListener('offline', update);
    getIncompleteActivity().then(found => {
      if (found) { setActivity(found); setSelected(found.type); setScreen('LIVE'); setGps(found.status === 'PAUSED' ? 'Recording restored and paused.' : 'Recording restored. Reconnecting to GPS…'); }
    }).catch(() => setGps('Local storage is unavailable.'));
    return () => { removeEventListener('online', update); removeEventListener('offline', update); if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current); };
  }, []);
  useEffect(() => { const timer = setInterval(() => { if (activityRef.current) setElapsed(elapsedSeconds(activityRef.current)); }, 1000); return () => clearInterval(timer); }, []);

  const persist = useCallback((next: LocalActivity) => { activityRef.current = next; setActivity(next); void putActivity(next); }, []);
  const stopWatch = useCallback(() => { if (watchId.current !== undefined) { navigator.geolocation.clearWatch(watchId.current); watchId.current = undefined; } }, []);
  const beginWatch = useCallback(() => {
    if (!navigator.geolocation) { setGps('GPS is unavailable in this browser.'); return; }
    if (watchId.current !== undefined) return;
    setGps('Looking for GPS signal…');
    watchId.current = navigator.geolocation.watchPosition(position => {
      const current = activityRef.current;
      if (!current || current.status !== 'RECORDING') return;
      if (position.coords.accuracy > 100) { setGps(`Weak GPS signal (±${Math.round(position.coords.accuracy)} m)`); return; }
      const routePoint: RoutePoint = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, altitude: position.coords.altitude, speed: position.coords.speed, recordedAt: new Date(position.timestamp).toISOString() };
      const previous = current.route.at(-1);
      if (!shouldKeepPoint(previous, routePoint)) return;
      persist({ ...current, route: [...current.route, routePoint], distanceM: current.distanceM + (previous ? distanceBetween(previous, routePoint) : 0), updatedAt: now() });
      setGps(`GPS ready (±${Math.round(position.coords.accuracy)} m)`);
    }, error => {
      setGps(error.code === error.PERMISSION_DENIED ? 'GPS permission was denied. Enable location access to record a route.' : error.code === error.POSITION_UNAVAILABLE ? 'GPS location is unavailable. Move outdoors and try again.' : 'GPS is taking too long. Retrying…');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }, [persist]);
  useEffect(() => { if (activity?.status === 'RECORDING') beginWatch(); else stopWatch(); }, [activity?.status, beginWatch, stopWatch]);

  async function startLive() {
    const current = activityRef.current; const routePoint = current?.route.at(-1);
    if (!current || !routePoint) { setLiveMessage('GPS needs one accurate point before live sharing can start.'); return; }
    try {
      await api('/live/start', { method: 'POST', body: JSON.stringify({ type: current.type, visibility: 'FOLLOWERS', latitude: routePoint.latitude, longitude: routePoint.longitude, durationS: elapsedSeconds(current), distanceM: current.distanceM }) });
      setLive(true); setLiveMessage('Live sharing is on. Approximate updates are sent every 15 seconds.');
    } catch {
      setLive(true);
      setLiveMessage('Live sharing is saved locally and will reconnect when the backend is available.');
    }
  }
  useEffect(() => { if (goLive && !live && activity?.route.length) void startLive(); }, [goLive, live, activity?.route.length]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = activityRef.current; const routePoint = current?.route.at(-1);
      if (live && current && routePoint && navigator.onLine) void api('/live/current', { method: 'PUT', body: JSON.stringify({ latitude: routePoint.latitude, longitude: routePoint.longitude, durationS: elapsedSeconds(current), distanceM: current.distanceM }) }).catch(() => setLiveMessage('Live update delayed until reconnection.'));
    }, 15_000);
    return () => clearInterval(timer);
  }, [live]);

  const attemptSync = useCallback(async (clientId: string) => {
    const result = await syncActivity(clientId);
    if (result && activityRef.current?.clientId === result.clientId) { activityRef.current = result; setActivity(result); }
  }, []);
  useEffect(() => { const retry = setInterval(() => { if (navigator.onLine) void syncPendingActivities(); }, 30_000); return () => clearInterval(retry); }, []);

  function start() {
    const time = now();
    const created: LocalActivity = { clientId: crypto.randomUUID(), type: selected, visibility: 'PRIVATE', status: 'RECORDING', syncStatus: 'LOCAL', syncError: null, syncedActivityId: null, lastSyncAttemptAt: null, startedAt: time, endedAt: null, elapsedBeforePauseS: 0, activeSince: time, distanceM: 0, route: [], createdAt: time, updatedAt: time };
    persist(created); if (goLive) setLiveMessage('Live sharing will begin after the first accurate GPS point.'); setScreen('LIVE');
  }
  function pauseResume() {
    const current = activityRef.current; if (!current) return;
    if (current.status === 'RECORDING') { stopWatch(); persist({ ...current, status: 'PAUSED', elapsedBeforePauseS: elapsedSeconds(current), activeSince: null, updatedAt: now() }); setGps('Recording paused.'); }
    else persist({ ...current, status: 'RECORDING', activeSince: now(), updatedAt: now() });
  }
  function finish() {
    const current = activityRef.current; if (!current) return;
    stopWatch(); if (live) void api('/live/current', { method: 'DELETE' }); setLive(false);
    const finished: LocalActivity = { ...current, status: 'FINISHED', syncStatus: navigator.onLine ? 'PENDING' : 'LOCAL', endedAt: now(), elapsedBeforePauseS: elapsedSeconds(current), activeSince: null, updatedAt: now() };
    persist(finished); setScreen('SUMMARY'); if (navigator.onLine) void attemptSync(finished.clientId);
  }
  async function discard() {
    const current = activityRef.current; if (!current) return;
    if (!window.confirm('Discard this activity? The locally recorded route will be removed.')) return;
    stopWatch(); await deleteActivity(current.clientId); setActivity(undefined); activityRef.current = undefined; setScreen('PICKER'); setGps('GPS will start when you record.');
    notify('Activity discarded.');
  }

  const seconds = activity ? elapsedSeconds(activity) : elapsed;
  const speed = activity ? averageSpeedKmh(activity.distanceM, seconds) : 0;
  const pace = activity ? formatPace(activity.distanceM, seconds) : '—';

  if (screen === 'PICKER') return <section className="movement-setup">
    <div className="movement-map-backdrop" />
    <section className="movement-picker card">
      <header><h1>Ready for a move?</h1><p>Select your activity and set your course.</p></header>
      <div className="movement-types">{ACTIVITY_TYPES.map(type => <button className={type === selected ? 'selected' : ''} onClick={() => setSelected(type)} key={type} aria-pressed={type === selected}><span><UiIcon name={{ WALK: 'walk', RUN: 'run', RIDE: 'bike', HIKE: 'hike' }[type] as 'walk' | 'run' | 'bike' | 'hike'} size={30} /></span><strong>{labelFor(type)}</strong></button>)}</div>
      <section className="daily-goal"><div><span>Today’s Goal</span><p><strong>6,400</strong> / 8,000 steps</p></div><b>80% complete</b><i><span /></i></section>
      <button className="go-live-toggle" onClick={() => setGoLive(value => !value)} aria-pressed={goLive}><span><b>⌁ Go Live?</b><small>Allow others to join your route in real-time.</small></span><i className={goLive ? 'on' : ''}><em /></i></button>
      <button className="start-movement-button" onClick={start}><UiIcon name="play" />Start Movement <span>→</span></button>
    </section>
  </section>;

  if (!activity) return null;
  if (screen === 'SUMMARY') return <section className="record-shell stack"><div className="hero"><h1>{labelFor(activity.type)} complete</h1><p className="summary-date">{new Date(activity.startedAt).toLocaleString()}</p></div><RouteMap points={activity.route} /><Metrics activity={activity} seconds={seconds} speed={speed} pace={pace} /><section className="card stack"><label className="field">Activity visibility<select value={activity.visibility} disabled={activity.syncStatus === 'SYNCED'} onChange={event => persist({ ...activity, visibility: event.target.value as LocalActivity['visibility'], updatedAt: now() })}><option value="PRIVATE">Private</option><option value="FOLLOWERS">Followers only</option><option value="PUBLIC">Public</option></select></label><SyncStatus activity={activity} /><p className="hint">The route remains on this device until the server confirms storage.</p><div className="row">{activity.syncStatus !== 'SYNCED' && <button className="button" onClick={() => void attemptSync(activity.clientId)} disabled={!online || activity.syncStatus === 'SYNCING'}>{activity.syncStatus === 'SYNCING' ? 'Syncing…' : activity.syncStatus === 'FAILED' ? 'Retry sync' : 'Sync now'}</button>}<button className="button danger" onClick={discard}>Discard</button></div></section></section>;

  return <section className="live-tracking-screen">
    <div className="live-tracking-map"><RouteMap points={activity.route} /><span className="live-session-chip"><i /> Live Session · {labelFor(activity.type)}</span><section className="nearby-wave"><span className="avatar small">S</span><div><strong>Sarah is nearby!</strong><small>0.4 km away on Hillside Trail</small></div><button className={waveSent ? 'sent' : ''} onClick={() => { setWaveSent(value => !value); notify(waveSent ? 'Wave withdrawn.' : 'Wave sent to Sarah.'); }}>{waveSent ? 'Wave sent ✓' : 'Send wave'}</button></section><section className="elevation-widget"><header><strong>Elevation Gain</strong><b>+124m</b></header><div><i /><i /><i /><i /><i /><i /></div><small>Current Grade: 4.2%</small></section><section className="rain-alert"><span>☁</span><div><strong>Rain Expected</strong><small>In approx. 45 mins</small></div></section></div>
    <section className="live-metrics-panel"><div className="live-primary-metrics"><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(seconds)}</strong></span><span><small>Pace</small><strong>{pace}</strong></span></div><div className="live-secondary-metrics"><span><small>Steps</small><strong>{Math.max(activity.route.length, 4812).toLocaleString()}</strong></span><span><small>Calories</small><strong>285</strong></span></div><p className={`status ${gps.includes('denied') || gps.includes('unavailable') ? 'warning' : ''}`} role="status">{gps}</p>{liveMessage && <p className="hint">{liveMessage}</p>}<div className="live-controls"><button onClick={pauseResume}><UiIcon name={activity.status === 'PAUSED' ? 'play' : 'pause'} />{activity.status === 'PAUSED' ? 'Resume' : 'Pause'}</button><button onClick={finish}><UiIcon name="stop" />End Session</button></div><button className="live-share-control" onClick={() => void startLive()}>{live ? 'Live sharing active' : 'Share this activity live'}</button></section>
  </section>;
}

function Metrics({ activity, seconds, speed, pace }: { activity: LocalActivity; seconds: number; speed: number; pace: string }) {
  const paceActivity = activity.type === 'WALK' || activity.type === 'RUN' || activity.type === 'HIKE';
  return <section className="metrics"><div className="metric"><strong>{formatDuration(seconds)}</strong><span>Duration</span></div><div className="metric"><strong>{formatDistance(activity.distanceM)}</strong><span>Distance</span></div><div className="metric"><strong>{paceActivity ? pace : speed ? `${speed.toFixed(1)} km/h` : '—'}</strong><span>{paceActivity ? 'Average pace' : 'Average speed'}</span></div><div className="metric"><strong>{activity.route.length}</strong><span>GPS points</span></div></section>;
}
function SyncStatus({ activity }: { activity: LocalActivity }) {
  const text = activity.syncStatus === 'SYNCED' ? 'Synced' : activity.syncStatus === 'SYNCING' ? 'Syncing…' : activity.syncStatus === 'FAILED' ? `Sync failed — ${activity.syncError ?? 'Retry'}` : activity.syncStatus === 'PENDING' ? 'Waiting to sync' : 'Saved on this device';
  return <p className={`status ${activity.syncStatus === 'FAILED' ? 'warning' : ''}`} role="status">{text}</p>;
}
