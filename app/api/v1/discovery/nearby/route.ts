import { getNearby } from '@/server/api/discovery';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (request, { auth }) => getNearby(request, auth!),
  { auth: true },
);
