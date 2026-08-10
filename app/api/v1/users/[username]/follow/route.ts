import { followUser, unfollowUser } from '@/server/api/users';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute<{ username: string }>(
  (_request, { params, auth }) => followUser(params.username, auth!),
  { auth: true },
);
export const DELETE = apiRoute<{ username: string }>(
  (_request, { params, auth }) => unfollowUser(params.username, auth!),
  { auth: true },
);
