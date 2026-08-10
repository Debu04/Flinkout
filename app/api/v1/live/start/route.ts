import { startLive } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute(
  (request, { auth }) => startLive(request, auth!),
  { auth: true },
);
