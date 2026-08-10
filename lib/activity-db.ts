import type { LocalActivity } from './activity';

const DB_NAME = 'flinkout';
const STORE = 'activities';
const OPEN_TIMEOUT_MS = 4_000;

function normalise(activity: LocalActivity): LocalActivity {
  const gpsDistanceM = activity.gpsDistanceM ?? activity.distanceM;
  return {
    ...activity,
    published: activity.published ?? activity.syncStatus === 'SYNCED',
    syncStatus: activity.syncStatus ?? 'LOCAL',
    syncError: activity.syncError ?? null,
    syncedActivityId: activity.syncedActivityId ?? null,
    lastSyncAttemptAt: activity.lastSyncAttemptAt ?? null,
    gpsDistanceM,
    sensorDistanceM: activity.sensorDistanceM ?? 0,
    sensorDistanceOffsetM: activity.sensorDistanceOffsetM ?? activity.distanceM,
    steps: activity.steps ?? 0,
    distanceSource: activity.distanceSource ?? (activity.route.length ? 'GPS' : 'NONE'),
    lastSensorAt: activity.lastSensorAt ?? null,
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
