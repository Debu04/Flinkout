import { getUser } from '@/server/api/users';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute<{ username: string }>(
  (_request, { params, auth }) => getUser(params.username, auth!),
  { auth: true },
);
