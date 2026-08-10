import { logout } from '@/server/api/auth';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute((request) => logout(request));
