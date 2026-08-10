import { deleteComment } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const DELETE = apiRoute<{ id: string; commentId: string }>(
  (_request, { params, auth }) => deleteComment(params.id, params.commentId, auth!),
  { auth: true },
);
