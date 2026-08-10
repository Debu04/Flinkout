import { updateDiscoveryLocation } from '@/server/api/discovery';
import { apiRoute } from '@/server/http/route';

export const PUT = apiRoute(
  (request, { auth }) => updateDiscoveryLocation(request, auth!),
  { auth: true },
);
