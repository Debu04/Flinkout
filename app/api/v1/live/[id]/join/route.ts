import { setLiveJoin } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setLiveJoin(params.id, true, auth!),
  { auth: true },
);
export const DELETE = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setLiveJoin(params.id, false, auth!),
  { auth: true },
);
