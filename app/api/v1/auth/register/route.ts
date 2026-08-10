import { register } from '@/server/api/auth';
import { apiRoute } from '@/server/http/route';

export const POST = apiRoute((request) => register(request), {
  rateLimit: { requests: 5, windowMs: 60_000 },
});
