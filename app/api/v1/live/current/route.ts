import { getCurrentLive, stopCurrentLive, updateCurrentLive } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (_request, { auth }) => getCurrentLive(auth!),
  { auth: true },
);
export const PUT = apiRoute(
  (request, { auth }) => updateCurrentLive(request, auth!),
  { auth: true },
);
export const DELETE = apiRoute(
  (_request, { auth }) => stopCurrentLive(auth!),
  { auth: true },
);
