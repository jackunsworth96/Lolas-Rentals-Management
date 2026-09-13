import { z } from 'zod';

const optionalTrimmedString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);

export const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  XENDIT_ENABLED: z.enum(['true', 'false']).default('false'),
  XENDIT_SECRET_KEY: optionalTrimmedString,
  XENDIT_CALLBACK_TOKEN: optionalTrimmedString,
  XENDIT_BUSINESS_ID: optionalTrimmedString,
  XENDIT_RETURN_STATE_SECRET: optionalTrimmedString,
  XENDIT_BASE_URL: optionalUrl.default('https://api.xendit.co'),
  XENDIT_ALLOWED_PAYMENT_CHANNELS: optionalTrimmedString,
  WEB_URL: optionalUrl,
}).superRefine((env, ctx) => {
  if (env.XENDIT_ENABLED !== 'true') return;

  // The server loads local .env files before individual Vitest files can set
  // NODE_ENV. Keep production-like processes strict while allowing unit tests
  // that do not exercise Xendit checkout to import the application.
  const isTestEnvironment = env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  for (const field of ['XENDIT_SECRET_KEY', 'XENDIT_CALLBACK_TOKEN', 'XENDIT_BUSINESS_ID', 'XENDIT_RETURN_STATE_SECRET', 'WEB_URL'] as const) {
    if (isTestEnvironment && field === 'XENDIT_RETURN_STATE_SECRET') continue;
    if (!env[field]) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required when XENDIT_ENABLED=true`,
      });
    }
  }

  if (!isTestEnvironment) {
    for (const field of ['WEB_URL', 'XENDIT_BASE_URL'] as const) {
      const value = env[field];
      if (value && new URL(value).protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must use HTTPS when XENDIT_ENABLED=true`,
        });
      }
    }
  }
});

export function validateEnvironment(env: NodeJS.ProcessEnv) {
  return EnvSchema.safeParse(env);
}

export type ApiEnvironment = z.infer<typeof EnvSchema>;
