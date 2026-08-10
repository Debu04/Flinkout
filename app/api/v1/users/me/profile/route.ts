import { updateProfile } from '@/server/api/users';
import { apiRoute } from '@/server/http/route';

export const PATCH = apiRoute(
  (request, { auth }) => updateProfile(request, auth!),
  { auth: true },
);
