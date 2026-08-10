import { setReaction } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setReaction(params.id, true, auth!),
  { auth: true },
);
export const DELETE = apiRoute<{ id: string }>(
  (_request, { params, auth }) => setReaction(params.id, false, auth!),
  { auth: true },
);
