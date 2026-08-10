import { getFeed } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (request, { auth }) => getFeed(request, auth!),
  { auth: true },
);
