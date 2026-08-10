import { getLive } from '@/server/api/live';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute<{ id: string }>(
  (_request, { params, auth }) => getLive(params.id, auth!),
  { auth: true },
);
