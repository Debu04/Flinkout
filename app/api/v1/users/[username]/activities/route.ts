import { getUserActivities } from '@/server/api/users';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute<{ username: string }>(
  (request, { params, auth }) => getUserActivities(request, params.username, auth!),
  { auth: true },
);
