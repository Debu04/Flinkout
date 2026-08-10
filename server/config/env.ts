import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parse secrets lazily so `next build` never needs to expose them to clients. */
export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
