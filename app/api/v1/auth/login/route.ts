import { login } from '@/server/api/auth';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute((request) => login(request), {
  rateLimit: { requests: 10, windowMs: 60_000 },
});
