'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_TYPES, averageSpeedKmh, elapsedSeconds, formatDistance, formatDuration, formatPaceSeconds, labelFor, type ActivityType, type LocalActivity, type RoutePoint } from '../lib/activity';
import { detectStep, distanceSourceLabel, initialStepDetectorState, markGpsUnavailable, recordGpsSample, recordMotionSteps } from '../lib/activity-motion';
import { deleteActivity, getIncompleteActivity, putActivity } from '../lib/activity-db';
import { syncActivity, syncPendingActivities } from '../lib/activity-sync';
import { api, type ActivityTimelineEvent, type LiveActivity, type SocialActivity } from '../lib/api';
import { useAppSession, useInteractions, usePreviewState } from './interaction-provider';
import { UiIcon } from './ui-icon';

const RouteMap = dynamic(() => import('./route-map').then(module => module.RouteMap), { ssr: false, loading: () => <div className="map map-loading" aria-label="Loading route map">Loading map...</div> });
type Screen = 'PICKER' | 'LIVE' | 'SUMMARY';
type SharingChoice = 'RECORD_ONLY' | 'LIVE';
type MotionStatus = 'IDLE' | 'READY' | 'CHECKING' | 'ACTIVE' | 'NEEDS_PERMISSION' | 'DENIED' | 'UNAVAILABLE' | 'NOT_USED';
type DeviceAccessState = 'CHECKING' | 'PROMPT' | 'REQUESTING' | 'GRANTED' | 'DENIED' | 'UNAVAILABLE' | 'INSECURE';
type MotionPermissionConstructor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
type LinearSensor = EventTarget & { x: number | null; y: number | null; z: number | null; start: () => void; stop: () => void };
type LinearSensorConstructor = new (options: { frequency: number }) => LinearSensor;
type PolicyAwareDocument = Document & {
  permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
  featurePolicy?: { allowsFeature: (feature: string) => boolean };
};
const now = () => new Date().toISOString();

function policyAllows(feature: 'geolocation' | 'accelerometer' | 'gyroscope') {
  const policyDocument = document as PolicyAwareDocument;
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  try { return policy?.allowsFeature(feature) !== false; } catch { return true; }
}

function instantaneousSpeed(activity: LocalActivity) {
  if (activity.currentPaceSPerKm) return 3_600 / activity.currentPaceSPerKm;
  const latest = activity.route.at(-1)?.speed;
  return latest !== null && latest !== undefined && latest >= 0 ? latest * 3.6 : averageSpeedKmh(activity.distanceM, activity.movingTimeS ?? 0);
}

function routePointFromPosition(position: GeolocationPosition): RoutePoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    speed: position.coords.speed,
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

function completeTimeline(activity: LocalActivity, liveTimeline: ActivityTimelineEvent[] | undefined, endedAt: string): ActivityTimelineEvent[] {
  const events: ActivityTimelineEvent[] = [
    { id: `${activity.clientId}-start`, type: 'START', source: 'ACTIVITY', createdAt: activity.startedAt },
    ...(liveTimeline ?? activity.timeline ?? []).filter(event => event.type !== 'START' && event.type !== 'FINISH'),
    { id: `${activity.clientId}-finish`, type: 'FINISH', source: 'ACTIVITY', createdAt: endedAt },
  ];
  return [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function ActivityRecorder() {
  const router = useRouter();
  const [activity, setActivity] = useState<LocalActivity>();
  const [screen, setScreen] = useState<Screen>('PICKER');
  const [selected, setSelected] = useState<ActivityType>('WALK');
  const [sharingChoice, setSharingChoice] = useState<SharingChoice>('RECORD_ONLY');
  const [liveVisibility, setLiveVisibility] = useState<'FOLLOWERS' | 'PUBLIC'>('FOLLOWERS');
  const [gps, setGps] = useState('GPS will start when you record.');
  const [secureContext, setSecureContext] = useState<'CHECKING' | 'SECURE' | 'INSECURE'>('CHECKING');
  const [locationAccess, setLocationAccess] = useState<DeviceAccessState>('CHECKING');
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('IDLE');
  const [motionMessage, setMotionMessage] = useState('Motion sensors will be checked when you start.');
  const [mapPosition, setMapPosition] = useState<RoutePoint>();
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState(false);
  const [liveActivity, setLiveActivity] = useState<LiveActivity>();
  const [livePending, setLivePending] = useState(false);
  const [liveAttempted, setLiveAttempted] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [liveCommentBody, setLiveCommentBody] = useState('');
  const [liveCommentPending, setLiveCommentPending] = useState(false);
  const [posting, setPosting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [storageState, setStorageState] = useState<'CHECKING' | 'READY' | 'ERROR'>('CHECKING');
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState('');
  const [shortActivityWarning, setShortActivityWarning] = useState(false);
  const [clientHydrated, setClientHydrated] = useState(false);
  const { notify } = useInteractions();
  const { postActivity } = usePreviewState();
  const { viewer, mode } = useAppSession();
  const watchId = useRef<number | undefined>(undefined);
  const activityRef = useRef<LocalActivity | undefined>(undefined);
  const motionDetectorRef = useRef(initialStepDetectorState());
  const motionCleanupRef = useRef<(() => void) | undefined>(undefined);
  const motionPermissionGrantedRef = useRef(false);
  const motionPermissionRequestRef = useRef<Promise<boolean> | undefined>(undefined);
  const motionRunningRef = useRef(false);
  const locationSeedRef = useRef<GeolocationPosition | undefined>(undefined);

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
        setSharingChoice(found.liveRequested || found.liveSessionId ? 'LIVE' : 'RECORD_ONLY');
        setLiveVisibility(found.visibility === 'PUBLIC' ? 'PUBLIC' : 'FOLLOWERS');
        setScreen(found.status === 'FINISHED' ? 'SUMMARY' : 'LIVE');
        setGps(found.status === 'PAUSED' ? 'Recording restored and paused.' : 'Recording restored. Reconnecting to GPS...');
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
    setClientHydrated(true);
  }, []);

  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    void checkStorage();
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
      if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current);
      motionCleanupRef.current?.();
    };
  }, [checkStorage]);

  useEffect(() => {
    if (!window.isSecureContext) {
      setSecureContext('INSECURE');
      setLocationAccess('INSECURE');
      setMotionStatus('UNAVAILABLE');
      setMotionMessage('Mobile browsers require HTTPS before they can ask for motion access.');
      setStartError('Device permissions are blocked on an insecure address. Open Flinkout over HTTPS; a phone cannot use the desktop localhost exception.');
      return;
    }
    setSecureContext('SECURE');
    if (!navigator.geolocation) {
      setLocationAccess('UNAVAILABLE');
      return;
    }
    if (!policyAllows('geolocation')) {
      setLocationAccess('DENIED');
      setGps('Location is blocked by this page. Reload Flinkout before starting a new activity.');
      return;
    }
    if (!navigator.permissions?.query) {
      setLocationAccess('PROMPT');
      return;
    }
    let cancelled = false;
    let permission: PermissionStatus | undefined;
    const updatePermission = () => {
      if (!cancelled && permission) setLocationAccess(permission.state === 'granted' ? 'GRANTED' : permission.state === 'denied' ? 'DENIED' : 'PROMPT');
    };
    void navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (cancelled) return;
      permission = result;
      updatePermission();
      permission.addEventListener('change', updatePermission);
    }).catch(() => { if (!cancelled) setLocationAccess('PROMPT'); });
    return () => {
      cancelled = true;
      permission?.removeEventListener('change', updatePermission);
    };
  }, []);

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = activityRef.current;
      setElapsed(current ? elapsedSeconds(current) : 0);
      if (current?.status === 'RECORDING' && current.activeSince) {
        const activeForMs = Math.max(0, Date.now() - Date.parse(current.activeSince));
        timer = setTimeout(tick, Math.max(80, 1_000 - activeForMs % 1_000));
      }
    };
    tick();
    return () => { if (timer) clearTimeout(timer); };
  }, [activity?.clientId, activity?.status, activity?.activeSince, activity?.elapsedBeforePauseS]);

  const persist = useCallback((next: LocalActivity) => {
    activityRef.current = next;
    setActivity(next);
    void putActivity(next).then(() => setStorageState('READY')).catch(() => {
      setStorageState('ERROR');
      setGps('This activity could not be saved on this device. Keep this page open and try again.');
    });
  }, []);

  const requestLocationAccess = useCallback(() => new Promise<boolean>(resolve => {
    if (!window.isSecureContext) {
      setSecureContext('INSECURE');
      setLocationAccess('INSECURE');
      setStartError('Location permission cannot open on this phone because Flinkout is using HTTP. Reopen it from an HTTPS address.');
      resolve(false);
      return;
    }
    if (!navigator.geolocation) {
      setLocationAccess('UNAVAILABLE');
      setGps('Location is not available in this browser.');
      resolve(false);
      return;
    }
    if (!policyAllows('geolocation')) {
      setLocationAccess('DENIED');
      setGps('Location is blocked by this page. Reload Flinkout before starting a new activity.');
      resolve(false);
      return;
    }
    setLocationAccess('REQUESTING');
    setGps('Waiting for location permission...');
    navigator.geolocation.getCurrentPosition(position => {
      locationSeedRef.current = position;
      setMapPosition(routePointFromPosition(position));
      setLocationAccess('GRANTED');
      setGps(`Location access granted (+/-${Math.round(position.coords.accuracy)} m).`);
      resolve(true);
    }, error => {
      locationSeedRef.current = undefined;
      if (error.code === error.PERMISSION_DENIED) {
        setLocationAccess('DENIED');
        setGps('Location access was denied. Enable it in this site\'s browser settings, then try again.');
      } else {
        setLocationAccess('UNAVAILABLE');
        setGps(error.code === error.TIMEOUT ? 'Location permission was allowed, but the phone could not get a GPS fix yet.' : 'The phone could not provide a location. Move outdoors and retry.');
      }
      resolve(false);
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  }), []);

  const requestMotionAccess = useCallback(async () => {
    if (!window.isSecureContext) {
      setMotionStatus('UNAVAILABLE');
      setMotionMessage('Motion permission cannot open over HTTP. Reopen Flinkout from an HTTPS address.');
      return false;
    }
    const MotionConstructor = window.DeviceMotionEvent as MotionPermissionConstructor | undefined;
    const SensorConstructor = (window as Window & { LinearAccelerationSensor?: LinearSensorConstructor }).LinearAccelerationSensor;
    if (!policyAllows('accelerometer') || !policyAllows('gyroscope')) {
      setMotionStatus('DENIED');
      setMotionMessage('Motion sensors are blocked by this page. Reload Flinkout before trying again.');
      return false;
    }
    if (!MotionConstructor && !SensorConstructor) {
      setMotionStatus('UNAVAILABLE');
      setMotionMessage('This browser does not expose motion sensors to websites.');
      return false;
    }
    if (typeof MotionConstructor?.requestPermission === 'function' && !motionPermissionGrantedRef.current) {
      setMotionStatus('CHECKING');
      setMotionMessage('Waiting for motion sensor permission...');
      try {
        motionPermissionGrantedRef.current = await MotionConstructor.requestPermission() === 'granted';
      } catch {
        motionPermissionGrantedRef.current = false;
      }
      if (!motionPermissionGrantedRef.current) {
        setMotionStatus('DENIED');
        setMotionMessage('Motion access was denied. Enable Motion & Orientation Access in this site\'s browser settings.');
        return false;
      }
    } else {
      motionPermissionGrantedRef.current = true;
    }
    setMotionStatus('READY');
    setMotionMessage('Motion access is ready. Step tracking will begin with the activity.');
    return true;
  }, []);

  const stopMotionSensors = useCallback(() => {
    motionCleanupRef.current?.();
    motionCleanupRef.current = undefined;
    motionRunningRef.current = false;
  }, []);

  const beginMotionSensors = useCallback(async (type: ActivityType, requestPermission: boolean) => {
    stopMotionSensors();
    motionDetectorRef.current = initialStepDetectorState();
    if (type === 'RIDE') {
      setMotionStatus('NOT_USED');
      setMotionMessage('Ride distance uses GPS; accelerometer-only distance would drift and is not reported as accurate.');
      return;
    }
    if (!window.isSecureContext) {
      setMotionStatus('UNAVAILABLE');
      setMotionMessage('Motion sensors require a secure connection. GPS and timing will continue.');
      return;
    }
    if (!policyAllows('accelerometer') || !policyAllows('gyroscope')) {
      setMotionStatus('DENIED');
      setMotionMessage('Motion sensors are blocked by this page. Reload Flinkout before trying again.');
      return;
    }
    motionRunningRef.current = true;

    let sampleSeen = false;
    const acceptSample = (x: number | null, y: number | null, z: number | null, includesGravity: boolean, timestamp: number, rotationRate?: number | null) => {
      if (x === null || y === null || z === null) return;
      sampleSeen = true;
      setMotionStatus('ACTIVE');
      setMotionMessage('Motion sensors are tracking steps and can estimate distance if GPS drops out.');
      const result = detectStep(motionDetectorRef.current, { x, y, z, includesGravity, timestamp, rotationRate });
      motionDetectorRef.current = result.state;
      const current = activityRef.current;
      if (result.steps && current?.status === 'RECORDING') persist(recordMotionSteps(current, result.steps, result.cadenceSpm, now()));
    };

    const startDeviceMotion = async () => {
      const MotionConstructor = window.DeviceMotionEvent as MotionPermissionConstructor | undefined;
      if (!MotionConstructor) {
        motionRunningRef.current = false;
        setMotionStatus('UNAVAILABLE');
        setMotionMessage('This browser does not expose motion sensors. GPS and timing will continue.');
        return;
      }
      if (typeof MotionConstructor.requestPermission === 'function' && !motionPermissionGrantedRef.current) {
        if (!requestPermission) {
          motionRunningRef.current = false;
          setMotionStatus('NEEDS_PERMISSION');
          setMotionMessage('Tap enable to restore step and motion-distance tracking.');
          return;
        }
        try {
          motionPermissionGrantedRef.current = await MotionConstructor.requestPermission() === 'granted';
        } catch {
          motionPermissionGrantedRef.current = false;
        }
        if (!motionPermissionGrantedRef.current) {
          motionRunningRef.current = false;
          setMotionStatus('DENIED');
          setMotionMessage('Motion access was denied. GPS and timing will continue.');
          return;
        }
      }
      const listener = (event: DeviceMotionEvent) => {
        const acceleration = event.acceleration;
        const includingGravity = event.accelerationIncludingGravity;
        const rotation = event.rotationRate;
        const rotationMagnitude = rotation && rotation.alpha !== null && rotation.beta !== null && rotation.gamma !== null
          ? Math.sqrt(rotation.alpha ** 2 + rotation.beta ** 2 + rotation.gamma ** 2)
          : null;
        if (acceleration && acceleration.x !== null && acceleration.y !== null && acceleration.z !== null) acceptSample(acceleration.x, acceleration.y, acceleration.z, false, event.timeStamp, rotationMagnitude);
        else if (includingGravity) acceptSample(includingGravity.x, includingGravity.y, includingGravity.z, true, event.timeStamp, rotationMagnitude);
      };
      window.addEventListener('devicemotion', listener);
      motionRunningRef.current = true;
      setMotionStatus('CHECKING');
      setMotionMessage('Checking the phone motion sensors...');
      const availabilityTimer = setTimeout(() => {
        if (!sampleSeen) {
          setMotionStatus('CHECKING');
          setMotionMessage('Waiting for motion readings. Keep the phone with you and start moving; GPS and timing continue.');
        }
      }, 5_000);
      motionCleanupRef.current = () => { clearTimeout(availabilityTimer); window.removeEventListener('devicemotion', listener); };
    };

    const SensorConstructor = (window as Window & { LinearAccelerationSensor?: LinearSensorConstructor }).LinearAccelerationSensor;
    if (!SensorConstructor) {
      await startDeviceMotion();
      return;
    }
    try {
      const sensor = new SensorConstructor({ frequency: 30 });
      let fallbackStarted = false;
      const reading = () => acceptSample(sensor.x, sensor.y, sensor.z, false, performance.now());
      const fallback = () => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        sensor.stop();
        if (!sampleSeen) void startDeviceMotion();
      };
      sensor.addEventListener('reading', reading);
      sensor.addEventListener('error', fallback, { once: true });
      sensor.start();
      motionRunningRef.current = true;
      setMotionStatus('CHECKING');
      setMotionMessage('Checking the phone motion sensors...');
      const fallbackTimer = setTimeout(() => { if (!sampleSeen) fallback(); }, 2_500);
      motionCleanupRef.current = () => {
        clearTimeout(fallbackTimer);
        sensor.removeEventListener('reading', reading);
        sensor.removeEventListener('error', fallback);
        sensor.stop();
      };
    } catch {
      await startDeviceMotion();
    }
  }, [persist, stopMotionSensors]);

  const stopWatch = useCallback(() => {
    if (watchId.current !== undefined) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = undefined;
    }
  }, []);

  const beginWatch = useCallback(() => {
    if (!window.isSecureContext) {
      setSecureContext('INSECURE');
      setLocationAccess('INSECURE');
      setGps('Location is blocked because this phone opened Flinkout over HTTP. Use HTTPS to enable GPS.');
      return;
    }
    if (!navigator.geolocation) { setGps('GPS is unavailable in this browser.'); return; }
    if (!policyAllows('geolocation')) {
      setLocationAccess('DENIED');
      setGps('Location is blocked by this page. Reload Flinkout before starting a new activity.');
      return;
    }
    if (watchId.current !== undefined) return;
    setGps('Looking for GPS signal...');
    watchId.current = navigator.geolocation.watchPosition(position => {
      const routePoint = routePointFromPosition(position);
      const current = activityRef.current;
      if (!current || current.status !== 'RECORDING') return;
      const result = recordGpsSample(current, routePoint, now());
      if (result.reason === 'INACCURATE') {
        persist(result.activity);
        setGps(`GPS signal weak (+/-${Math.round(position.coords.accuracy)} m) - motion tracking continues.`);
        return;
      }
      if (result.activity !== current) persist(result.activity);
      if (result.activity.gpsAvailable) {
        setMapPosition(routePoint);
        setLocationAccess('GRANTED');
        setGps(`GPS ready (+/-${Math.round(position.coords.accuracy)} m)`);
      }
    }, error => {
      if (error.code === error.PERMISSION_DENIED) setLocationAccess('DENIED');
      const current = activityRef.current;
      if (current?.status === 'RECORDING') persist(markGpsUnavailable(current, now()));
      setGps(error.code === error.PERMISSION_DENIED
        ? 'GPS permission was denied. Enable location access to record a route.'
        : error.code === error.POSITION_UNAVAILABLE
          ? 'GPS signal lost - motion tracking continues.'
          : 'GPS is taking too long - motion tracking continues while retrying.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }, [persist]);

  useEffect(() => {
    if (activity?.status === 'RECORDING') {
      beginWatch();
      if (!motionRunningRef.current && !motionPermissionRequestRef.current) void beginMotionSensors(activity.type, false);
    } else {
      stopWatch();
      stopMotionSensors();
    }
  }, [activity?.clientId, activity?.status, activity?.type, beginMotionSensors, beginWatch, stopMotionSensors, stopWatch]);

  async function startLive() {
    const current = activityRef.current;
    const routePoint = current?.route.at(-1);
    if (mode !== 'CONNECTED') {
      setLiveMessage('Sign in to share live progress with nearby people.');
      return;
    }
    if (!navigator.onLine) {
      setLiveMessage('Live sharing needs a connection. Your recording remains safe on this device.');
      return;
    }
    if (!current || !routePoint) {
      setLiveMessage('Waiting for one accurate GPS point before your live session begins.');
      return;
    }
    if (livePending || current.liveSessionId) return;
    setLivePending(true);
    setLiveAttempted(true);
    setLiveMessage('Connecting live sharing...');
    try {
      const response = await api<{ live: LiveActivity }>('/live/start', {
        method: 'POST',
        body: JSON.stringify({
          clientId: current.clientId,
          type: current.type,
          visibility: liveVisibility,
          latitude: routePoint.latitude,
          longitude: routePoint.longitude,
          durationS: elapsedSeconds(current),
          distanceM: current.distanceM,
          speedKmh: instantaneousSpeed(current),
          paused: current.status === 'PAUSED',
        }),
      });
      setLive(true);
      setLiveActivity(response.live);
      persist({ ...current, liveRequested: true, liveSessionId: response.live.id, visibility: liveVisibility, liveEndStatus: null, timeline: response.live.timeline ?? [], updatedAt: now() });
      setLiveMessage(`You are live with ${liveVisibility === 'PUBLIC' ? 'everyone nearby' : 'your followers'}. Location shown to others is approximate.`);
    } catch {
      setLive(false);
      setLiveMessage('Live sharing could not connect. Your activity is still recording safely on this device.');
    } finally {
      setLivePending(false);
    }
  }

  useEffect(() => {
    if (screen === 'LIVE' && activity?.liveRequested && !activity.liveSessionId && activity.status === 'RECORDING' && activity.route.length && !live && !livePending && !liveAttempted && online && mode === 'CONNECTED') void startLive();
    // startLive intentionally reacts to the persisted recording state rather than function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.clientId, activity?.liveRequested, activity?.liveSessionId, activity?.route.length, activity?.status, live, liveAttempted, livePending, mode, online, screen]);

  useEffect(() => {
    const id = activity?.liveSessionId;
    if (!id || screen !== 'LIVE' || mode !== 'CONNECTED' || !online) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await api<{ live: LiveActivity }>(`/live/${id}`);
        if (cancelled) return;
        setLiveActivity(response.live);
        setLive(Boolean(response.live.active));
      } catch {
        if (!cancelled) setLiveMessage('Live audience updates are delayed. Your local recording is still safe.');
      }
    };
    void refresh();
    const timer = setInterval(refresh, 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activity?.liveSessionId, mode, online, screen]);

  async function stopLiveSharing() {
    const current = activityRef.current;
    if (!current?.liveSessionId || livePending) return;
    setLivePending(true);
    setLiveMessage('Stopping live sharing...');
    try {
      const response = await api<{ live: LiveActivity }>('/live/current', { method: 'DELETE' });
      setLive(false);
      setLiveActivity(response.live);
      persist({ ...current, liveRequested: false, liveEndStatus: 'ENDED', timeline: response.live.timeline ?? current.timeline, updatedAt: now() });
      setLiveMessage('Live sharing ended. GPS recording continues only on this device.');
    } catch {
      setLiveMessage('We could not confirm that live sharing stopped. Keep this page open and retry.');
    } finally {
      setLivePending(false);
    }
  }

  function requestLiveNow() {
    const current = activityRef.current;
    if (!current) return;
    setSharingChoice('LIVE');
    setLiveAttempted(false);
    persist({ ...current, liveRequested: true, visibility: liveVisibility, updatedAt: now() });
    setLiveMessage(current.route.length ? 'Starting live sharing...' : 'Waiting for GPS before going live.');
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const current = activityRef.current;
      const routePoint = current?.route.at(-1);
      if (live && current && routePoint && navigator.onLine) {
        void api<{ live: LiveActivity }>('/live/current', {
          method: 'PUT',
          body: JSON.stringify({
            latitude: routePoint.latitude,
            longitude: routePoint.longitude,
            durationS: elapsedSeconds(current),
            distanceM: current.distanceM,
            speedKmh: instantaneousSpeed(current),
            paused: current.status === 'PAUSED',
          }),
        }).then(response => setLiveActivity(response.live)).catch(() => setLiveMessage('Live update delayed. GPS recording is still safe on this device.'));
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
    // Invoke permission APIs directly from the Start gesture. The browser owns
    // these native prompts; recording must not wait for a GPS fix to arrive.
    const locationPermission = requestLocationAccess();
    const motionPermission = selected === 'RIDE' ? undefined : requestMotionAccess();
    motionPermissionRequestRef.current = motionPermission;
    if (!window.isSecureContext) {
      motionPermissionRequestRef.current = undefined;
      setStartPending(false);
      return;
    }
    const time = now();
    const wantsLive = sharingChoice === 'LIVE' && mode === 'CONNECTED';
    const created: LocalActivity = {
      clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ownerId: viewer.id,
      type: selected,
      visibility: wantsLive ? liveVisibility : 'FOLLOWERS',
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
      movingTimeS: 0,
      lastMovementAt: null,
      distanceM: 0,
      gpsDistanceM: 0,
      sensorDistanceM: 0,
      sensorDistanceOffsetM: 0,
      steps: 0,
      cadenceSpm: 0,
      distanceSource: 'NONE',
      currentPaceSPerKm: null,
      averagePaceSPerKm: null,
      paceSource: null,
      caloriesKcal: 0,
      currentElevationM: null,
      elevationReferenceM: null,
      elevationGainM: 0,
      elevationLossM: 0,
      trackingMode: 'MOTION_ONLY',
      gpsAvailable: false,
      gpsAccuracyM: null,
      lastReliableGpsAt: null,
      lastSensorAt: null,
      route: [],
      liveRequested: wantsLive,
      liveSessionId: null,
      liveEndStatus: null,
      timeline: [],
      createdAt: time,
      updatedAt: time,
    };
    try {
      await putActivity(created);
      activityRef.current = created;
      setActivity(created);
      setStorageState('READY');
      setLiveAttempted(false);
      setLiveMessage(wantsLive ? 'Recording started. Your live session will begin after GPS locks.' : 'Recording only on this device. You can decide whether to share after finishing.');
      setScreen('LIVE');

      void locationPermission.then(allowed => {
        const current = activityRef.current;
        const seed = locationSeedRef.current;
        if (!allowed || !seed || current?.clientId !== created.clientId || current.status !== 'RECORDING') return;
        const routePoint = routePointFromPosition(seed);
        const result = recordGpsSample(current, routePoint, now());
        persist(result.activity);
        if (result.activity.gpsAvailable) setMapPosition(routePoint);
      });

      if (motionPermission) {
        void motionPermission.then(allowed => {
          const current = activityRef.current;
          if (allowed && current?.clientId === created.clientId && current.status === 'RECORDING' && !motionRunningRef.current) {
            void beginMotionSensors(created.type, false);
          }
        }).finally(() => {
          if (motionPermissionRequestRef.current === motionPermission) motionPermissionRequestRef.current = undefined;
        });
      }
    } catch {
      stopMotionSensors();
      motionPermissionRequestRef.current = undefined;
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
      stopMotionSensors();
      persist({ ...current, status: 'PAUSED', trackingMode: 'PAUSED', elapsedBeforePauseS: elapsedSeconds(current), activeSince: null, lastMovementAt: null, currentPaceSPerKm: null, updatedAt: now() });
      setGps('Recording paused.');
      setMotionMessage('Motion tracking paused.');
    } else {
      void beginMotionSensors(current.type, true);
      persist({ ...current, status: 'RECORDING', trackingMode: current.gpsAvailable ? 'GPS_MOTION' : 'MOTION_ONLY', activeSince: now(), lastMovementAt: null, updatedAt: now() });
      setGps('Reconnecting to GPS...');
    }
  }

  async function finish() {
    const current = activityRef.current;
    if (!current || finishing) return;
    if (elapsedSeconds(current) < 30) {
      setShortActivityWarning(true);
      return;
    }
    setFinishing(true);
    stopWatch();
    stopMotionSensors();
    const endedAt = now();
    let finalLive = liveActivity;
    let liveEndStatus = current.liveSessionId ? current.liveEndStatus ?? 'UNCONFIRMED' as const : null;
    if (current.liveSessionId && (live || liveActivity?.active !== false)) {
      try {
        const response = await api<{ live: LiveActivity }>('/live/current', { method: 'DELETE' });
        finalLive = response.live;
        setLiveActivity(response.live);
        liveEndStatus = 'ENDED';
      } catch {
        liveEndStatus = 'UNCONFIRMED';
      }
    }
    setLive(false);
    const finished: LocalActivity = {
      ...current,
      status: 'FINISHED',
      published: false,
      syncStatus: 'LOCAL',
      endedAt,
      elapsedBeforePauseS: elapsedSeconds(current),
      activeSince: null,
      liveRequested: false,
      liveEndStatus,
      timeline: completeTimeline(current, finalLive?.timeline, endedAt),
      updatedAt: endedAt,
    };
    persist(finished);
    setShortActivityWarning(false);
    setScreen('SUMMARY');
    setFinishing(false);
  }

  async function postLiveComment(event: React.FormEvent) {
    event.preventDefault();
    const current = activityRef.current;
    const body = liveCommentBody.trim();
    if (!current?.liveSessionId || !body || liveCommentPending || !live) return;
    setLiveCommentPending(true);
    try {
      await api(`/live/${current.liveSessionId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setLiveCommentBody('');
      const response = await api<{ live: LiveActivity }>(`/live/${current.liveSessionId}`);
      setLiveActivity(response.live);
      persist({ ...current, timeline: response.live.timeline ?? current.timeline, updatedAt: now() });
      notify('Live update added to the map and timeline.');
    } catch (cause) {
      setLiveMessage(cause instanceof Error ? cause.message : 'The live update could not be posted.');
    } finally {
      setLiveCommentPending(false);
    }
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
      movingTimeS: Math.round(current.movingTimeS ?? 0),
      distanceM: current.distanceM,
      steps: current.steps ?? 0,
      averagePaceSPerKm: current.averagePaceSPerKm ?? null,
      caloriesKcal: current.caloriesKcal ?? 0,
      currentElevationM: current.currentElevationM ?? null,
      elevationGainM: current.elevationGainM ?? 0,
      elevationLossM: current.elevationLossM ?? 0,
      distanceSource: current.distanceSource ?? 'NONE',
      route: current.route,
      timeline: current.timeline,
      user: {
        id: viewer.id,
        username: viewer.username,
        profile: { displayName: viewer.profile?.displayName ?? viewer.username, photoUrl: viewer.profile?.photoUrl ?? null },
      },
      reactionCount: liveActivity?.highFiveCount ?? 0,
      commentCount: liveActivity?.commentCount ?? 0,
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
      id: finalActivity.syncedActivityId ?? feedActivity.id,
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
    stopMotionSensors();
    if (current.liveSessionId && (live || liveActivity?.active !== false)) {
      try {
        await api('/live/current', { method: 'DELETE' });
        setLive(false);
      } catch {
        setLiveMessage('Discard paused because Flinkout could not confirm that your live location stopped. Retry when connected.');
        notify('Live sharing must stop before this recording can be discarded.');
        return;
      }
    }
    await deleteActivity(current.clientId);
    setActivity(undefined);
    setLiveActivity(undefined);
    activityRef.current = undefined;
    setScreen('PICKER');
    setGps('GPS will start when you record.');
    setMapPosition(undefined);
    notify(current.syncStatus === 'SYNCED' ? 'Local copy removed. The online activity was not deleted.' : 'Unsynced activity discarded.');
  }

  const seconds = activity ? elapsed : 0;
  const speed = activity ? averageSpeedKmh(activity.distanceM, activity.movingTimeS ?? 0) : 0;
  // The live value is the cumulative average. It remains readable between GPS
  // updates instead of blinking as an instantaneous sample becomes stale.
  const pace = formatPaceSeconds(activity?.averagePaceSPerKm ?? activity?.currentPaceSPerKm);
  const averagePace = formatPaceSeconds(activity?.averagePaceSPerKm);
  const elevationGainM = Math.min(activity?.elevationGainM ?? 0, (activity?.distanceM ?? 0) * 0.45);
  const elevation = activity?.currentElevationM === null || activity?.currentElevationM === undefined
    ? '--'
    : `${activity.distanceM < 50 ? 0 : Math.max(0, Math.round(elevationGainM))} m`;
  const liveComments = liveActivity?.comments ?? [];
  const gpsProblem = /denied|unavailable|too long|blocked|weak/i.test(gps);
  const accessNoteState = secureContext === 'INSECURE' ? 'insecure' : storageState === 'ERROR' ? 'error' : locationAccess === 'DENIED' ? 'denied' : restoring || startPending ? 'checking' : 'ready';
  const accessNoteTitle = secureContext === 'INSECURE'
    ? 'HTTPS is required on this phone'
    : storageState === 'ERROR'
      ? 'Offline save is unavailable'
      : locationAccess === 'DENIED'
        ? 'Location is blocked'
        : restoring
          ? 'Preparing offline save...'
          : startPending
            ? 'Starting your activity...'
            : locationAccess === 'GRANTED'
              ? 'Ready to start'
              : locationAccess === 'UNAVAILABLE'
                ? 'Location is unavailable'
                : 'Your phone will ask for location';
  const accessNoteBody = secureContext === 'INSECURE'
    ? 'Open the HTTPS version of Flinkout to use phone permissions.'
    : storageState === 'ERROR'
      ? startError || 'Retry before starting so your activity is not lost.'
      : locationAccess === 'DENIED'
        ? 'Allow it in this site’s browser settings for route and distance. A timed activity can still start.'
        : locationAccess === 'UNAVAILABLE'
          ? 'You can still record time; route and GPS distance will be unavailable.'
          : locationAccess === 'GRANTED'
            ? selected === 'RIDE' ? 'Location will record your route and distance.' : 'Location is allowed. Motion tracking is optional.'
            : selected === 'RIDE' ? 'Location is used for your route and distance.' : 'Location records your route. Motion access may also be requested for steps.';

  if (screen === 'PICKER') return <section className="movement-setup" data-recorder-hydrated={clientHydrated}>
    <div className="movement-map-backdrop" />
    <section className="movement-picker card compact-start-picker">
      <header><p className="eyebrow">NEW ACTIVITY</p><h1>Start an activity</h1><p>Choose an activity, then tap Start.</p></header>
      <div className="movement-types">{ACTIVITY_TYPES.map(type => <button className={type === selected ? 'selected' : ''} onClick={() => setSelected(type)} key={type} aria-pressed={type === selected}><span><UiIcon name={{ WALK: 'walk', RUN: 'run', RIDE: 'bike', HIKE: 'hike' }[type] as 'walk' | 'run' | 'bike' | 'hike'} size={30} /></span><strong>{labelFor(type)}</strong></button>)}</div>
      <section className="activity-sharing-choice" aria-labelledby="sharing-choice-title">
        <div><p className="eyebrow">SHARING</p><h2 id="sharing-choice-title">Choose who can see it</h2></div>
        <div>
          <button className={sharingChoice === 'RECORD_ONLY' ? 'selected' : ''} aria-pressed={sharingChoice === 'RECORD_ONLY'} onClick={() => setSharingChoice('RECORD_ONLY')}><UiIcon name="lock" /><span><strong>Record only</strong><small>Private until you finish.</small></span></button>
          <button className={sharingChoice === 'LIVE' ? 'selected live' : 'live'} aria-pressed={sharingChoice === 'LIVE'} disabled={mode !== 'CONNECTED'} onClick={() => setSharingChoice('LIVE')}><UiIcon name="radio" /><span><strong>Go live</strong><small>{mode === 'CHECKING' ? 'Checking your account...' : mode === 'CONNECTED' ? 'Share progress nearby.' : 'Sign in to use live sharing.'}</small></span></button>
        </div>
        {sharingChoice === 'LIVE' && <label className="live-audience-field">Live audience<select value={liveVisibility} onChange={event => setLiveVisibility(event.target.value as 'FOLLOWERS' | 'PUBLIC')}><option value="FOLLOWERS">Followers nearby</option><option value="PUBLIC">Everyone nearby</option></select><small>Your map marker is approximate, and you can stop sharing while recording.</small></label>}
      </section>
      <section className={`start-access-note ${accessNoteState}`} aria-live="polite" role={accessNoteState === 'error' || accessNoteState === 'insecure' ? 'alert' : 'status'}><UiIcon name={accessNoteState === 'ready' ? 'location' : 'shield'} size={20} /><span><strong>{accessNoteTitle}</strong><small>{accessNoteBody}</small></span></section>
      <button className="start-movement-button" onClick={() => void (storageState === 'ERROR' ? checkStorage() : start())} disabled={restoring || startPending || secureContext === 'INSECURE' || (sharingChoice === 'LIVE' && mode !== 'CONNECTED')}><UiIcon name={storageState === 'ERROR' || secureContext === 'INSECURE' ? 'shield' : sharingChoice === 'LIVE' ? 'radio' : 'play'} />{startPending ? 'Starting...' : restoring ? 'Preparing...' : secureContext === 'INSECURE' ? 'HTTPS required' : storageState === 'ERROR' ? 'Retry offline save' : `Start ${labelFor(selected).toLowerCase()}${sharingChoice === 'LIVE' ? ' live' : ''}`} <span>{storageState === 'ERROR' ? 'Retry' : 'Go'}</span></button>
    </section>
  </section>;

  if (!activity) return null;
  if (screen === 'SUMMARY') return <section className="record-shell stack" data-recorder-hydrated={clientHydrated}>
    <div className="hero activity-review-heading"><span className="review-complete-icon"><UiIcon name="highfive" /></span><div><p>Activity complete</p><h1>Review your {labelFor(activity.type).toLowerCase()}</h1><small className="summary-date">{new Date(activity.startedAt).toLocaleString()}</small></div></div>
    {activity.route.length ? <RouteMap points={activity.route} /> : <div className="route-empty-state"><UiIcon name="map" size={30} /><strong>No GPS route recorded</strong><span>{activity.steps ? `${activity.steps.toLocaleString()} steps and ${formatDistance(activity.distanceM)} of motion-estimated distance were still saved.` : 'Your time is still saved. Enable location and motion access before your next activity for richer metrics.'}</span></div>}
    <Metrics activity={activity} seconds={seconds} speed={speed} pace={averagePace} />
    {activity.liveSessionId && <section className={`card live-recap-card ${activity.liveEndStatus === 'UNCONFIRMED' ? 'warning' : ''}`}><UiIcon name={activity.liveEndStatus === 'UNCONFIRMED' ? 'shield' : 'radio'} /><div><strong>{activity.liveEndStatus === 'UNCONFIRMED' ? 'Live stop is not confirmed' : 'Live session ended'}</strong><span>{activity.liveEndStatus === 'UNCONFIRMED' ? 'Your recording is safe, but reconnect before discarding so Flinkout can confirm the broadcast ended.' : `${liveActivity?.joinCount ?? 0} joined - ${liveActivity?.highFiveCount ?? 0} high-fives - ${liveActivity?.commentCount ?? 0} live updates saved to the timeline.`}</span></div></section>}
    <section className="card stack activity-publish-card">
      <div><p className="eyebrow">FINAL STEP</p><h2>Choose who can see it</h2><p>{activity.route.length ? 'Review your route, metrics, and live timeline before publishing.' : activity.steps ? 'No GPS route was captured. Your step count and estimated distance can still be included.' : 'No GPS route or motion steps were captured. Your activity type and time are still saved.'}</p></div>
      <label className="field">Who can see this activity?<select value={activity.visibility} onChange={event => persist({ ...activity, visibility: event.target.value as LocalActivity['visibility'], updatedAt: now() })}><option value="FOLLOWERS">Followers</option><option value="PUBLIC">Everyone</option><option value="PRIVATE">Only me</option></select></label>
      <p className="local-save-status"><UiIcon name="bookmark" size={18} /> Saved safely on this device - not published yet</p>
      <div className="summary-actions"><button className="button post-activity-button" onClick={() => void publish()} disabled={posting}><UiIcon name={activity.visibility === 'PRIVATE' ? 'lock' : 'share'} />{posting ? 'Publishing...' : activity.visibility === 'PRIVATE' ? 'Save privately' : 'Post activity'}</button><button className="button discard-activity-button" onClick={() => void discard()} disabled={posting}>Discard</button></div>
    </section>
  </section>;

  return <section className="live-tracking-screen" data-recorder-hydrated={clientHydrated}>
    <div className="live-tracking-map">
      {mapPosition || activity.route.length ? <RouteMap points={activity.route} currentPoint={mapPosition ?? activity.route.at(-1)} /> : <div className="recording-route-placeholder"><UiIcon name="location" size={30} /><span>{activity.steps ? `No GPS route - ${activity.steps.toLocaleString()} steps detected` : 'Finding your location...'}</span></div>}
      <span className={`live-session-chip ${live ? 'sharing' : ''}`}><i /> {live ? 'Live now' : activity.status === 'PAUSED' ? 'Recording paused' : activity.liveRequested ? 'Waiting to go live' : 'Recording only'} - {labelFor(activity.type)}</span>
    </div>
    <section className="live-metrics-panel">
      <div className="live-primary-metrics"><span><small>Distance</small><strong>{formatDistance(activity.distanceM)}</strong></span><span><small>Duration</small><strong>{formatDuration(seconds)}</strong></span><span><small>{activity.type === 'RIDE' ? 'Speed' : 'Pace'}</small><strong>{activity.type === 'RIDE' ? (speed ? `${speed.toFixed(1)} km/h` : '-') : pace}</strong></span></div>
      <div className="live-secondary-metrics"><span><small>Steps</small><strong>{activity.type === 'RIDE' ? '-' : (activity.steps ?? 0).toLocaleString()}</strong></span><span><small>Elevation</small><strong>{elevation}</strong></span><span><small>Calories</small><strong>{Math.round(activity.caloriesKcal ?? 0)} kcal</strong></span></div>
      <p className={`status ${gpsProblem ? 'warning' : ''}`} role="status">{gps}{gpsProblem ? motionStatus === 'ACTIVE' && activity.type !== 'RIDE' ? ' Motion sensors are continuing steps and estimated distance.' : ' Timing continues, but distance may be unavailable.' : ''}</p>
      {(locationAccess === 'DENIED' || locationAccess === 'UNAVAILABLE') && <button className="enable-location-button" onClick={() => void requestLocationAccess().then(allowed => { if (allowed) { stopWatch(); beginWatch(); } })}>Try location again</button>}
      <p className={`status motion-status ${motionStatus === 'DENIED' || motionStatus === 'UNAVAILABLE' ? 'warning' : ''}`} role="status">{motionMessage}</p>
      {(motionStatus === 'NEEDS_PERMISSION' || motionStatus === 'DENIED') && activity.type !== 'RIDE' && <button className="enable-motion-button" onClick={() => void beginMotionSensors(activity.type, true)}>Enable motion sensors</button>}
      {liveMessage && <p className={`hint live-sharing-message ${livePending ? 'pending' : ''}`} role="status">{liveMessage}</p>}
      {liveAttempted && !live && activity.liveRequested && !activity.liveSessionId && <button className="retry-live-button" onClick={() => { setLiveAttempted(false); setLiveMessage('Retrying live sharing...'); }} disabled={!online || livePending}>Retry live sharing</button>}
      {liveActivity && <section className="recording-community-panel">
        <header><div><span className="live-pulse" /><strong>{live ? 'Live community' : 'Live recap'}</strong></div><small>{liveActivity.highFiveCount ?? 0} high-fives - {liveActivity.commentCount ?? 0} updates</small></header>
        {liveComments.length ? <div className="recording-live-comments">{liveComments.slice(-3).reverse().map(comment => <article key={comment.id}><span className="avatar small">{comment.user.displayName[0]}</span><p><strong>{comment.user.displayName}</strong>{comment.body}<small>{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - pinned to the approximate live location</small></p></article>)}</div> : <p className="recording-community-empty">Comments and nearby updates will appear here and in the activity timeline.</p>}
        {live && <form onSubmit={postLiveComment}><label className="sr-only" htmlFor="live-comment">Share a nearby update</label><input id="live-comment" value={liveCommentBody} onChange={event => setLiveCommentBody(event.target.value)} maxLength={500} placeholder="Share a trail, traffic, or nearby update..." /><button disabled={liveCommentPending || !liveCommentBody.trim()} aria-label="Post live update"><UiIcon name="send" size={18} /></button></form>}
      </section>}
      {shortActivityWarning && <div className="short-activity-warning" role="alert"><strong>Keep moving a little longer</strong><span>An activity needs at least 30 seconds before it can be reviewed and posted.</span><div><button onClick={() => setShortActivityWarning(false)}>Keep recording</button><button onClick={() => void discard()}>Discard activity</button></div></div>}
      <div className="live-controls"><button onClick={pauseResume} disabled={finishing}><UiIcon name={activity.status === 'PAUSED' ? 'play' : 'pause'} />{activity.status === 'PAUSED' ? 'Resume' : 'Pause'}</button><button onClick={() => void finish()} disabled={finishing}><UiIcon name="stop" />{finishing ? 'Ending...' : 'Finish & review'}</button></div>
      {activity.liveSessionId && !live ? <p className="live-share-unavailable"><UiIcon name="shield" size={17} /> Live sharing has ended for this activity. Recording remains local.</p> : activity.route.length ? <button className={`live-share-control ${live ? 'active' : ''}`} disabled={livePending || (!live && (mode !== 'CONNECTED' || !online))} onClick={() => void (live ? stopLiveSharing() : requestLiveNow())}>{livePending ? (live ? 'Stopping...' : 'Connecting...') : live ? 'Stop live sharing' : mode === 'CONNECTED' ? 'Share this activity live' : 'Sign in to share live'}</button> : <p className="live-share-unavailable"><UiIcon name="radio" size={17} /> {activity.liveRequested ? 'Live sharing will begin after GPS locks.' : 'Live sharing becomes available after GPS locks.'}</p>}
    </section>
  </section>;
}

function Metrics({ activity, seconds, speed, pace }: { activity: LocalActivity; seconds: number; speed: number; pace: string }) {
  const paceActivity = activity.type === 'WALK' || activity.type === 'RUN' || activity.type === 'HIKE';
  return <section className="metrics"><div className="metric"><strong>{formatDuration(seconds)}</strong><span>Duration</span></div><div className="metric"><strong>{formatDistance(activity.distanceM)}</strong><span>Distance - {distanceSourceLabel(activity)}</span></div><div className="metric"><strong>{paceActivity ? pace : speed ? `${speed.toFixed(1)} km/h` : '-'}</strong><span>{paceActivity ? 'Average pace' : 'Average speed'}</span></div><div className="metric"><strong>{paceActivity ? (activity.steps ?? 0).toLocaleString() : activity.route.length}</strong><span>{paceActivity ? 'Steps' : 'GPS samples'}</span></div></section>;
}
