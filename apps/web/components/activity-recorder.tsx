'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_TYPES, averageSpeedKmh, distanceBetween, elapsedSeconds, formatDistance, formatDuration, formatPace, labelFor, shouldKeepPoint, type ActivityType, type LocalActivity, type RoutePoint } from '../lib/activity';
import { deleteActivity, getIncompleteActivity, putActivity } from '../lib/activity-db';
import { syncActivity, syncPendingActivities } from '../lib/activity-sync';
import { api, type SocialActivity } from '../lib/api';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map map-loading" aria-label="Loading route map">Loading map...</div> });
type Screen = 'PICKER' | 'LIVE' | 'SUMMARY';
const now = () => new Date().toISOString();

export function ActivityRecorder() {
  const router = useRouter();
  const [activity, setActivity] = useState<LocalActivity>();
  const [screen, setScreen] = useState<Screen>('PICKER');
  const [selected, setSelected] = useState<ActivityType>('WALK');
  const [gps, setGps] = useState('GPS will start when you record.');
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState(false);
  const [livePending, setLivePending] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [storageState, setStorageState] = useState<'CHECKING' | 'READY' | 'ERROR'>('CHECKING');
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState('');
  const [shortActivityWarning, setShortActivityWarning] = useState(false);
  const { notify } = useInteractions();
  const { postActivity } = usePreviewState();
  const { viewer, mode } = useAppSession();
  const watchId = useRef<number | undefined>(undefined);
  const activityRef = useRef<LocalActivity | undefined>(undefined);

  const checkStorage = useCallback(async () => {
    setRestoring(true);
    setStorageState('CHECKING');
    setStartError('');
    try {
      const found = await getIncompleteActivity();
      setStorageState('READY');
      if (found) {
        setActivity(found);
        setSelected(found.type);
        setScreen(found.status === 'FINISHED' ? 'SUMMARY' : 'LIVE');
        setGps(found.status === 'PAUSED' ? 'Recording restored and paused.' : 'Recording restored. Reconnecting to GPS…');
      }
    } catch {
      setStorageState('ERROR');
      setStartError('Flinkout could not open its offline activity storage. Retry the device check before starting.');
      setGps('Local storage is unavailable. Recording cannot start safely.');
    } finally {
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    activityRef.current = activity;
    setElapsed(activity ? elapsedSeconds(activity) : 0);
  }, [activity]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    void checkStorage();
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
      if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current);
    };
  }, [checkStorage]);

  useEffect(() => {
    if (mode !== 'CONNECTED' || !navigator.onLine) return;
    const syncOwned = () => {
      if (!navigator.onLine) return;
      void syncPendingActivities(viewer.id).then(results => {
        const latest = results.find(result => result?.clientId === activityRef.current?.clientId);
        if (latest) { activityRef.current = latest; setActivity(latest); }
      });
    };
    syncOwned();
    addEventListener('online', syncOwned);
    return () => removeEventListener('online', syncOwned);
  }, [mode, viewer.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (activityRef.current) setElapsed(elapsedSeconds(activityRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const persist = useCallback((next: LocalActivity) => {
    activityRef.current = next;
    setActivity(next);
    void putActivity(next).then(() => setStorageState('READY')).catch(() => {
      setStorageState('ERROR');
      setGps('This activity could not be saved on this device. Keep this page open and try again.');
    });
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current !== undefined) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = undefined;
    }
  }, []);

  const beginWatch = useCallback(() => {
    if (!navigator.geolocation) { setGps('GPS is unavailable in this browser.'); return; }
    if (watchId.current !== undefined) return;
    setGps('Looking for GPS signal...');
    watchId.current = navigator.geolocation.watchPosition(position => {
      const current = activityRef.current;
      if (!current || current.status !== 'RECORDING') return;
      if (position.coords.accuracy > 100) {
        setGps(`Weak GPS signal (+/-${Math.round(position.coords.accuracy)} m)`);
        return;
      }
      const routePoint: RoutePoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        speed: position.coords.speed,
        recordedAt: new Date(position.timestamp).toISOString(),
      };
      const previous = current.route.at(-1);
      if (!shouldKeepPoint(previous, routePoint)) return;
      persist({
        ...current,
        route: [...current.route, routePoint],
        distanceM: current.distanceM + (previous ? distanceBetween(previous, routePoint) : 0),
        updatedAt: now(),
      });
      setGps(`GPS ready (+/-${Math.round(position.coords.accuracy)} m)`);
    }, error => {
      setGps(error.code === error.PERMISSION_DENIED
        ? 'GPS permission was denied. Enable location access to record a route.'
        : error.code === error.POSITION_UNAVAILABLE
          ? 'GPS location is unavailable. Move outdoors and try again.'
          : 'GPS is taking too long. Retrying...');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }, [persist]);

  useEffect(() => {
    if (activity?.status === 'RECORDING') beginWatch();
    else stopWatch();
  }, [activity?.status, beginWatch, stopWatch]);

  async function startLive() {
    const current = activityRef.current;
    const routePoint = current?.route.at(-1);
    if (mode !== 'CONNECTED') {
      setLiveMessage('Sign in to share live progress with nearby followers.');
      return;
    }
    if (!navigator.onLine) {
      setLiveMessage('Live sharing needs a connection. Your recording remains safe on this device.');
      return;
    }
    if (!current || !routePoint) {
      setLiveMessage('GPS needs one accurate point before live sharing can start.');
      return;
    }
    if (livePending) return;
    setLivePending(true);
    setLiveMessage('Connecting live sharing...');
    try {
      await api('/live/start', { method: 'POST', body: JSON.stringify({ type: current.type, visibility: 'FOLLOWERS', latitude: routePoint.latitude, longitude: routePoint.longitude, durationS: elapsedSeconds(current), distanceM: current.distanceM }) });
      setLive(true);
      setLiveMessage('Live sharing is on. Only approximate updates are sent every 15 seconds.');
    } catch {
      setLive(false);
      setLiveMessage('Live sharing could not connect. Your activity is still recording safely on this device.');
    } finally {
      setLivePending(false);
    }
  }

  async function stopLiveSharing() {
    if (!live || livePending) return;
    setLivePending(true);
    setLiveMessage('Stopping live sharing...');
    try {
      await api('/live/current', { method: 'DELETE' });
      setLive(false);
      setLiveMessage('Live sharing is off. GPS recording continues only on this device.');
    } catch {
      setLiveMessage('We could not confirm that live sharing stopped. Keep this page open and retry.');
    } finally {
      setLivePending(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const current = activityRef.current;
      const routePoint = current?.route.at(-1);
      if (live && current && routePoint && navigator.onLine) {
        void api('/live/current', { method: 'PUT', body: JSON.stringify({ latitude: routePoint.latitude, longitude: routePoint.longitude, durationS: elapsedSeconds(current), distanceM: current.distanceM }) }).catch(() => setLiveMessage('Live update delayed. GPS recording is still safe on this device.'));
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const retry = setInterval(() => {
      if (mode === 'CONNECTED' && navigator.onLine) void syncPendingActivities(viewer.id);
    }, 30_000);
    return () => clearInterval(retry);
  }, [mode, viewer.id]);

  async function start() {
    if (restoring || startPending || storageState !== 'READY') return;
    setStartPending(true);
    setStartError('');
    const time = now();
    const created: LocalActivity = {
      clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ownerId: viewer.id,
      type: selected,
      visibility: 'FOLLOWERS',
      status: 'RECORDING',
      published: false,
      syncStatus: 'LOCAL',
      syncError: null,
      syncedActivityId: null,
      lastSyncAttemptAt: null,
      startedAt: time,
      endedAt: null,
      elapsedBeforePauseS: 0,
      activeSince: time,
      distanceM: 0,
      route: [],
      createdAt: time,
      updatedAt: time,
    };
    try {
      await putActivity(created);
      activityRef.current = created;
      setActivity(created);
      setStorageState('READY');
      setScreen('LIVE');
    } catch {
      activityRef.current = undefined;
      setActivity(undefined);
      setStorageState('ERROR');
      setStartError('The activity was not started because it could not be saved safely. Retry the device check and try again.');
    } finally {
      setStartPending(false);
    }
  }

  function pauseResume() {
    const current = activityRef.current;
    if (!current) return;
    if (current.status === 'RECORDING') {
      stopWatch();
      persist({ ...current, status: 'PAUSED', elapsedBeforePauseS: elapsedSeconds(current), activeSince: null, updatedAt: now() });
      setGps('Recording paused.');
    } else {
      persist({ ...current, status: 'RECORDING', activeSince: now(), updatedAt: now() });
      setGps('Reconnecting to GPS...');
    }
  }

  function finish() {
    const current = activityRef.current;
    if (!current) return;
    if (elapsedSeconds(current) < 30) {
      setShortActivityWarning(true);
      return;
    }
    stopWatch();
    if (live) void api('/live/current', { method: 'DELETE' });
    setLive(false);
    const finished: LocalActivity = {
      ...current,
      status: 'FINISHED',
      published: false,
      syncStatus: 'LOCAL',
      endedAt: now(),
      elapsedBeforePauseS: elapsedSeconds(current),
      activeSince: null,
      updatedAt: now(),
    };
    persist(finished);
    setShortActivityWarning(false);
    setScreen('SUMMARY');
  }

  async function publish() {
    const current = activityRef.current;
    if (!current || current.status !== 'FINISHED' || posting) return;
    setPosting(true);
    const published: LocalActivity = {
      ...current,
      published: true,
      syncStatus: mode === 'CONNECTED' && navigator.onLine ? 'PENDING' : 'LOCAL',
      syncError: null,
      updatedAt: now(),
    };
    const feedActivity: SocialActivity = {
      id: `preview-${current.clientId}`,
      clientId: current.clientId,
      syncedActivityId: null,
      syncStatus: published.syncStatus,
      syncError: null,
      type: current.type,
      visibility: current.visibility,
      startedAt: current.startedAt,
      endedAt: current.endedAt,
      durationS: current.elapsedBeforePauseS,
      distanceM: current.distanceM,
      route: current.route,
      user: {
        id: viewer.id,
        username: viewer.username,
        profile: { displayName: viewer.profile?.displayName ?? viewer.username, photoUrl: viewer.profile?.photoUrl ?? null },
      },
      reactionCount: 0,
      commentCount: 0,
      reactedByViewer: false,
    };
    activityRef.current = published;
    setActivity(published);
    await putActivity(published);
    let finalActivity = published;
    if (navigator.onLine && mode === 'CONNECTED') {
      const result = await syncActivity(published.clientId, viewer.id);
      if (result) finalActivity = result;
    }
    postActivity({
      ...feedActivity,
      syncedActivityId: finalActivity.syncedActivityId,
      syncStatus: finalActivity.syncStatus,
      syncError: finalActivity.syncError,
    });
    setActivity(finalActivity);
    activityRef.current = finalActivity;
    notify(finalActivity.syncStatus === 'SYNCED'
      ? 'Activity published and synced.'
      : finalActivity.syncStatus === 'FAILED'
        ? 'Activity saved locally. Publishing failed; you can retry from the feed.'
        : mode === 'PREVIEW'
          ? 'Activity added to your private preview feed on this device.'
          : 'Activity saved locally and queued for publishing.');
    router.push('/');
  }

  async function discard() {
    const current = activityRef.current;
    if (!current) return;
    if (!window.confirm(current.syncStatus === 'SYNCED' ? 'Remove the local copy? The synchronized online activity will remain available.' : 'Discard this unsynced activity and its locally recorded route?')) return;
    stopWatch();
    await deleteActivity(current.clientId);
    setActivity(undefined);
    activityRef.current = undefined;
    setScreen('PICKER');
    setGps('GPS will start when you record.');
    notify(current.syncStatus === 'SYNCED' ? 'Local copy removed. The online activity was not deleted.' : 'Unsynced activity discarded.');
  }

  const seconds = activity ? elapsedSeconds(activity) : elapsed;
  const speed = activity ? averageSpeedKmh(activity.distanceM, seconds) : 0;
  const pace = activity ? formatPace(activity.distanceM, seconds) : '-';

  if (screen === 'PICKER') return <section className="movement-setup">
    <div className="movement-map-backdrop" />
    <section className="movement-picker card">
      <header><p className="eyebrow">NEW ACTIVITY</p><h1>What are you doing?</h1><p>Choose a movement. Recording stays on this device even if your connection drops.</p></header>
      <div className="movement-types">{ACTIVITY_TYPES.map(type => <button className={type === selected ? 'selected' : ''} onClick={() => setSelected(type)} key={type} aria-pressed={type === selected}><span><UiIcon name={{ WALK: 'walk', RUN: 'run', RIDE: 'bike', HIKE: 'hike' }[type] as 'walk' | 'run' | 'bike' | 'hike'} size={30} /></span><strong>{labelFor(type)}</strong></button>)}</div>
      <section className={`daily-goal recording-readiness ${storageState.toLowerCase()}`} aria-live="polite"><div><span>Recording mode</span><p><strong>GPS + offline backup</strong></p></div><b>{startPending ? 'Saving activity…' : restoring ? 'Checking device…' : storageState === 'READY' ? 'Ready to record' : 'Storage unavailable'}</b><i><span /></i></section>
      {startError && <p className="recording-start-error" role="alert"><UiIcon name="shield" size={18} />{startError}</p>}
      <p className="recording-privacy-note"><UiIcon name="shield" size={18} /> Live sharing becomes available after you start and GPS finds your location.</p>
      <button className="start-movement-button" onClick={() => void (storageState === 'ERROR' ? checkStorage() : start())} disabled={restoring || startPending}><UiIcon name={storageState === 'ERROR' ? 'shield' : 'play'} />{startPending ? 'Starting safely…' : restoring ? 'Checking device…' : storageState === 'ERROR' ? 'Retry device check' : `Start ${labelFor(selected).toLowerCase()}`} <span>{storageState === 'ERROR' ? 'Retry' : 'Go'}</span></button>
    </section>
  </section>;

  if (!activity) return null;
  if (screen === 'SUMMARY') return <section className="record-shell stack">
    <div className="hero activity-review-heading"><span className="review-complete-icon"><UiIcon name="highfive" /></span><div><p>Activity complete</p><h1>Review your {labelFor(activity.type).toLowerCase()}</h1><small className="summary-date">{new Date(activity.startedAt).toLocaleString()}</small></div></div>
    {activity.route.length ? <RouteMap points={activity.route} /> : <div className="route-empty-state"><UiIcon name="map" size={30} /><strong>No route recorded</strong><span>Your time is still saved. Enable location before your next activity to include a route.</span></div>}
    <Metrics activity={activity} seconds={seconds} speed={speed} pace={pace} />
    <section className="card stack activity-publish-card">
      <div><p className="eyebrow">FINAL STEP</p><h2>Choose who can see it</h2><p>{activity.route.length ? 'Review your route and metrics before publishing.' : 'No GPS route was captured. Only the activity type and time will be included.'}</p></div>
      <label className="field">Who can see this activity?<select value={activity.visibility} onChange={event => persist({ ...activity, visibility: event.target.value as LocalActivity['visibility'], updatedAt: now() })}><option value="FOLLOWERS">Followers</option><option value="PUBLIC">Everyone</option><option value="PRIVATE">Only me</option></select></label>
      <p className="local-save-status"><UiIcon name="bookmark" size={18} /> Saved safely on this device · not published yet</p>
      <div className="summary-actions"><button className="button post-activity-button" onClick={() => void publish()} disabled={posting}><UiIcon name={activity.visibility === 'PRIVATE' ? 'lock' : 'share'} />{posting ? 'Publishing…' : activity.visibility === 'PRIVATE' ? 'Save privately' : 'Post activity'}</button><button className="button discard-activity-button" onClick={discard} disabled={posting}>Discard</button></div>
    </section>
  </section>;

  return <section className="live-tracking-screen">
    <div className="live-tracking-map">
      {activity.route.length ? <RouteMap points={activity.route} /> : <div className="recording-route-placeholder"><UiIcon name="location" size={30} /><span>Finding your location…</span></div>}
      <span className={`live-session-chip ${live ? 'sharing' : ''}`}><i /> {live ? 'Live sharing' : activity.status === 'PAUSED' ? 'Recording paused' : 'Recording locally'} - {labelFor(activity.type)}</span>
      <section className="recording-map-status"><span>{online ? 'Online' : 'Offline safe'}</span><span>{activity.route.length ? `${activity.route.length} GPS samples` : 'Waiting for GPS'}</span></section>
    </div>
    <section className="live-metrics-panel">
      <div className="live-primary-metrics"><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(seconds)}</strong></span><span><small>{activity.type === 'RIDE' ? 'Speed' : 'Pace'}</small><strong>{activity.type === 'RIDE' ? (speed ? `${speed.toFixed(1)} km/h` : '-') : pace}</strong></span></div>
      <div className="live-secondary-metrics"><span><small>GPS samples</small><strong>{activity.route.length}</strong></span><span><small>Connection</small><strong>{online ? 'Online' : 'Offline safe'}</strong></span></div>
      <p className={`status ${gps.includes('denied') || gps.includes('unavailable') ? 'warning' : ''}`} role="status">{gps}{gps.includes('denied') || gps.includes('unavailable') ? ' Timing continues, so you can finish and post without a route.' : ''}</p>
      {liveMessage && <p className={`hint live-sharing-message ${livePending ? 'pending' : ''}`} role="status">{liveMessage}</p>}
      {shortActivityWarning && <div className="short-activity-warning" role="alert"><strong>Keep moving a little longer</strong><span>An activity needs at least 30 seconds before it can be reviewed and posted.</span><div><button onClick={() => setShortActivityWarning(false)}>Keep recording</button><button onClick={() => void discard()}>Discard activity</button></div></div>}
      <div className="live-controls"><button onClick={pauseResume}><UiIcon name={activity.status === 'PAUSED' ? 'play' : 'pause'} />{activity.status === 'PAUSED' ? 'Resume' : 'Pause'}</button><button onClick={finish}><UiIcon name="stop" />Finish &amp; review</button></div>
      {activity.route.length ? <button className={`live-share-control ${live ? 'active' : ''}`} disabled={livePending || (!live && (mode !== 'CONNECTED' || !online))} onClick={() => void (live ? stopLiveSharing() : startLive())}>{livePending ? (live ? 'Stopping…' : 'Connecting…') : live ? 'Stop live sharing' : mode === 'CONNECTED' ? 'Share this activity live' : 'Sign in to share live'}</button> : <p className="live-share-unavailable"><UiIcon name="radio" size={17} /> Live sharing will appear after GPS locks.</p>}
    </section>
  </section>;
}

function Metrics({ activity, seconds, speed, pace }: { activity: LocalActivity; seconds: number; speed: number; pace: string }) {
  const paceActivity = activity.type === 'WALK' || activity.type === 'RUN' || activity.type === 'HIKE';
  return <section className="metrics"><div className="metric"><strong>{formatDuration(seconds)}</strong><span>Duration</span></div><div className="metric"><strong>{formatDistance(activity.distanceM)}</strong><span>Distance</span></div><div className="metric"><strong>{paceActivity ? pace : speed ? `${speed.toFixed(1)} km/h` : '-'}</strong><span>{paceActivity ? 'Average pace' : 'Average speed'}</span></div><div className="metric"><strong>{activity.route.length}</strong><span>GPS samples</span></div></section>;
}
