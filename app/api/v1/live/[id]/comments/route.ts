import { createLiveComment } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute<{ id: string }>(
  (request, { params, auth }) => createLiveComment(request, params.id, auth!),
  { auth: true },
);
