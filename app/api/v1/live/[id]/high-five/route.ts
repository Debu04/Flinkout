import { setHighFive } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setHighFive(params.id, true, auth!),
  { auth: true },
);
export const DELETE = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setHighFive(params.id, false, auth!),
  { auth: true },
);
