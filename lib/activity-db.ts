import type { LocalActivity } from './activity';

const DB_NAME = 'flinkout';
const STORE = 'activities';
const OPEN_TIMEOUT_MS = 4_000;

function normalise(activity: LocalActivity): LocalActivity {
  const gpsDistanceM = activity.gpsDistanceM ?? activity.distanceM;
  const motionFallbackDistanceM = activity.motionFallbackDistanceM ?? 0;
  const strideM = activity.strideM ?? ({ WALK: 0.65, RUN: 1, HIKE: 0.62, RIDE: 0 })[activity.type];
  const stepSource = activity.stepSource ?? 'UNAVAILABLE';
  return {
    ...activity,
    published: activity.published ?? activity.syncStatus === 'SYNCED',
    syncStatus: activity.syncStatus ?? 'LOCAL',
    syncError: activity.syncError ?? null,
    syncedActivityId: activity.syncedActivityId ?? null,
    lastSyncAttemptAt: activity.lastSyncAttemptAt ?? null,
    gpsDistanceM,
    motionFallbackDistanceM,
    sensorDistanceM: motionFallbackDistanceM,
    sensorDistanceOffsetM: activity.sensorDistanceOffsetM ?? activity.distanceM,
    steps: activity.steps ?? 0,
    nativeSteps: activity.nativeSteps ?? (stepSource === 'NATIVE' ? activity.steps ?? 0 : 0),
    browserMotionSteps: activity.browserMotionSteps ?? (stepSource === 'BROWSER_ESTIMATED' ? activity.steps ?? 0 : 0),
    gpsEstimatedSteps: activity.gpsEstimatedSteps ?? (strideM > 0 ? Math.floor(gpsDistanceM / strideM) : 0),
    motionFallbackSteps: activity.motionFallbackSteps ?? 0,
    stepSource,
    cadenceSpm: activity.cadenceSpm ?? 0,
    strideM,
    movingTimeS: activity.movingTimeS ?? activity.elapsedBeforePauseS,
    lastMovementAt: activity.lastMovementAt ?? null,
    distanceSource: activity.distanceSource ?? (activity.route.length ? 'GPS' : 'NONE'),
    currentPaceSPerKm: activity.currentPaceSPerKm ?? null,
    currentSpeedKmh: activity.currentSpeedKmh ?? null,
    averagePaceSPerKm: activity.averagePaceSPerKm ?? null,
    averageMovingPaceSPerKm: activity.averageMovingPaceSPerKm ?? null,
    paceSource: activity.paceSource ?? null,
    caloriesKcal: activity.caloriesKcal ?? 0,
    currentElevationM: activity.currentElevationM ?? null,
    elevationReferenceM: activity.elevationReferenceM ?? activity.currentElevationM ?? null,
    elevationGainM: activity.elevationGainM ?? 0,
    elevationLossM: activity.elevationLossM ?? 0,
    altitudeSamplesM: activity.altitudeSamplesM ?? [],
    trackingMode: activity.status === 'PAUSED' ? 'PAUSED' : activity.trackingMode ?? (activity.route.length ? 'GPS_MOTION' : 'MOTION_ONLY'),
    gpsAvailable: activity.gpsAvailable ?? Boolean(activity.route.length),
    gpsAccuracyM: activity.gpsAccuracyM ?? activity.route.at(-1)?.accuracy ?? null,
    lastReliableGpsAt: activity.lastReliableGpsAt ?? activity.route.at(-1)?.recordedAt ?? null,
    lastSensorAt: activity.lastSensorAt ?? null,
    locationBaseline: activity.locationBaseline ?? activity.route.at(-1) ?? null,
    recentPaceSegments: activity.recentPaceSegments ?? [],
    trackingDiagnostics: activity.trackingDiagnostics ?? {
      acceptedGpsPoints: activity.route.length,
      rejectedInaccuratePoints: 0,
      rejectedStationaryPoints: 0,
      rejectedImpossiblePoints: 0,
      rejectedStalePoints: 0,
      rejectedInvalidPoints: 0,
      rollingPaceDistanceM: 0,
      rollingPaceDurationS: 0,
      lastAltitudeAccuracyM: activity.route.at(-1)?.altitudeAccuracy ?? null,
    },
    liveRequested: activity.liveRequested ?? false,
    liveSessionId: activity.liveSessionId ?? null,
    liveEndStatus: activity.liveEndStatus ?? null,
    timeline: activity.timeline ?? [],
  };
}

function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }

    let settled = false;
    const finishWithError = (error: Error | DOMException | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error ?? new Error('Offline activity storage could not be opened.'));
    };
    const timeout = setTimeout(() => finishWithError(new Error('Offline activity storage took too long to open.')), OPEN_TIMEOUT_MS);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      finishWithError(error instanceof Error ? error : new Error('Offline activity storage could not be opened.'));
      return;
    }

    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains(STORE)) return;
      const store = request.result.createObjectStore(STORE, { keyPath: 'clientId' });
      store.createIndex('status', 'status');
      store.createIndex('updatedAt', 'updatedAt');
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => finishWithError(request.error);
    request.onblocked = () => finishWithError(new Error('Offline activity storage is blocked by another Flinkout tab.'));
  });
}

export async function putActivity(activity: LocalActivity) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(activity);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      database.close();
      reject(tx.error ?? new Error('The activity could not be saved.'));
    };
  });
}

export async function getIncompleteActivity() {
  const database = await db();
  return new Promise<LocalActivity | undefined>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as LocalActivity[])
        .map(normalise)
        .filter(activity => activity.status !== 'FINISHED' || !activity.published)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function getActivity(id: string) {
  const database = await db();
  return new Promise<LocalActivity | undefined>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => {
      database.close();
      resolve(request.result ? normalise(request.result) : undefined);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function getActivitiesReadyForSync() {
  const database = await db();
  return new Promise<LocalActivity[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as LocalActivity[])
        .map(normalise)
        .filter(activity => activity.status === 'FINISHED' && activity.published && activity.syncStatus !== 'SYNCED' && activity.syncStatus !== 'SYNCING')
        .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)));
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function deleteActivity(id: string) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      database.close();
      reject(tx.error ?? new Error('The activity could not be removed.'));
    };
  });
}
