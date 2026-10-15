import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    // Directory with the four CSV exports. Not part of the repository (personal data).
    // The default fits `npm run dev` started in apps/api; production sets it explicitly.
    DATA_DIR: z.string().default('../../data'),
    // Date the exports were taken; records dated later are treated as plans, not completions.
    EXPORT_DATE: isoDate.default('2026-10-01'),
    // Built SPA served by the API in production. Absent in development (Vite serves it).
    WEB_DIST_DIR: z.string().optional(),
    BASIC_AUTH_USER: z.string().min(1).optional(),
    BASIC_AUTH_PASSWORD: z.string().min(12).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .refine((env) => Boolean(env.BASIC_AUTH_USER) === Boolean(env.BASIC_AUTH_PASSWORD), {
    message: 'BASIC_AUTH_USER and BASIC_AUTH_PASSWORD must be set together',
  })
  .refine((env) => env.NODE_ENV !== 'production' || Boolean(env.BASIC_AUTH_USER), {
    message: 'Basic auth is mandatory in production - the data contain personal information',
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
