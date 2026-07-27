import type { LocalActivity } from './activity';
import { getActivitiesReadyForSync, getActivity, putActivity } from './activity-db';
import { api } from './api';

type SyncResponse = { activityId: string; clientId: string; status: 'synced'; duplicate: boolean };
const inFlight = new Set<string>();
const now = () => new Date().toISOString();
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Synchronization failed';

function patch(activity: LocalActivity, changes: Partial<LocalActivity>): LocalActivity { return { ...activity, ...changes, updatedAt: now() }; }
export async function syncActivity(clientId: string): Promise<LocalActivity | undefined> {
  const activity = await getActivity(clientId);
  if (!activity || activity.status !== 'FINISHED' || activity.syncStatus === 'SYNCED' || inFlight.has(clientId)) return activity;
  if (!navigator.onLine) { const pending = patch(activity, { syncStatus: 'PENDING', syncError: null }); await putActivity(pending); return pending; }
  inFlight.add(clientId);
  const syncing = patch(activity, { syncStatus: 'SYNCING', syncError: null, lastSyncAttemptAt: now() }); await putActivity(syncing);
  try {
    const response = await api<SyncResponse>('/activities/sync', { method: 'POST', body: JSON.stringify({ clientId: syncing.clientId, type: syncing.type, visibility: syncing.visibility, startedAt: syncing.startedAt, endedAt: syncing.endedAt, durationS: syncing.elapsedBeforePauseS, distanceM: syncing.distanceM, route: syncing.route }) });
    const synced = patch(syncing, { syncStatus: 'SYNCED', syncError: null, syncedActivityId: response.activityId }); await putActivity(synced); return synced;
  } catch (error) {
    const failed = patch(syncing, { syncStatus: 'FAILED', syncError: failureMessage(error) }); await putActivity(failed); return failed;
  } finally { inFlight.delete(clientId); }
}
export async function syncPendingActivities() { if (!navigator.onLine) return []; const pending = await getActivitiesReadyForSync(); return Promise.all(pending.map(activity => syncActivity(activity.clientId))); }
