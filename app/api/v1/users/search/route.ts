import { searchUsers } from '@/server/api/users';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (request, { auth }) => searchUsers(request, auth!),
  { auth: true },
);
