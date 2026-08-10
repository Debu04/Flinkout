import { createComment, getComments } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute<{ id: string }>(
  (request, { params, auth }) => getComments(request, params.id, auth!),
  { auth: true },
);
export const POST = apiRoute<{ id: string }>(
  (request, { params, auth }) => createComment(request, params.id, auth!),
  { auth: true },
);
