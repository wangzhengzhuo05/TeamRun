import { z } from 'zod'

const serviceConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4310),
    DATABASE_URL: z.string().default('postgres://teamrun:teamrun@127.0.0.1:5432/teamrun'),
    TEAMRUN_PUBLIC_URL: z.url().default('http://127.0.0.1:4310'),
    TEAMRUN_OIDC_ISSUER: z.url().optional(),
    TEAMRUN_OIDC_AUDIENCE: z.string().min(1).optional(),
    TEAMRUN_OIDC_CLIENT_ID: z.string().min(1).optional(),
    TEAMRUN_SHARED_KEY: z.string().min(24).optional(),
    TEAMRUN_SHARED_KEY_EMAIL: z.email().default('team@teamrun.local'),
    TEAMRUN_SHARED_KEY_DISPLAY_NAME: z.string().min(1).max(160).default('TeamRun Team'),
    TEAMRUN_DEV_AUTH: z.enum(['0', '1']).default('0'),
    TEAMRUN_CORS_ORIGINS: z.string().default('http://127.0.0.1'),
    TEAMRUN_S3_ENDPOINT: z.url().default('http://127.0.0.1:9000'),
    TEAMRUN_S3_PUBLIC_ENDPOINT: z.url().optional(),
    TEAMRUN_S3_REGION: z.string().default('us-east-1'),
    TEAMRUN_S3_BUCKET: z.string().default('teamrun-publications'),
    TEAMRUN_S3_ACCESS_KEY_ID: z.string().default('teamrun'),
    TEAMRUN_S3_SECRET_ACCESS_KEY: z.string().default('teamrun-local-secret')
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === 'production' && config.TEAMRUN_DEV_AUTH === '1') {
      context.addIssue({ code: 'custom', message: 'TEAMRUN_DEV_AUTH cannot run in production' })
    }
    if (
      config.TEAMRUN_DEV_AUTH !== '1' &&
      !config.TEAMRUN_SHARED_KEY &&
      (!config.TEAMRUN_OIDC_ISSUER ||
        !config.TEAMRUN_OIDC_AUDIENCE ||
        !config.TEAMRUN_OIDC_CLIENT_ID)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A shared key or OIDC issuer, audience and client id are required when dev auth is disabled'
      })
    }
  })

export type TeamRunServiceConfig = z.infer<typeof serviceConfigSchema>

export function readTeamRunServiceConfig(
  env: NodeJS.ProcessEnv = process.env
): TeamRunServiceConfig {
  return serviceConfigSchema.parse(env)
}
