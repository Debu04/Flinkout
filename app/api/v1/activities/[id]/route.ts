import { getActivity } from '@/server/api/activities';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute<{ id: string }>(
  (_request, { params, auth }) => getActivity(params.id, auth!),
  { auth: true },
);
