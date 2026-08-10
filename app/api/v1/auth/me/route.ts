import { me } from '@/server/api/auth';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute((_request, { auth }) => me(auth!), { auth: true });
