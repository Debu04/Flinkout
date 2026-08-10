import { syncActivity } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute(
  (request, { auth }) => syncActivity(request, auth!),
  { auth: true },
);
