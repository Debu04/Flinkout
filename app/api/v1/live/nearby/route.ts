import { getNearbyLive } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (request, { auth }) => getNearbyLive(request, auth!),
  { auth: true },
);
