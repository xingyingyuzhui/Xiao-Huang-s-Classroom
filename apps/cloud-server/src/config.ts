import { z } from 'zod';
import { registrationModeSchema } from '@xiaohuang/contracts';

const secretMin = 32;

export const cloudConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  host: z.literal('0.0.0.0').default('0.0.0.0'),
  port: z.literal(3000).default(3000),
  databaseUrl: z.string().url().or(z.string().min(1)),
  tokenSigningKey: z.string().min(secretMin),
  aiKek: z.string().min(secretMin),
  publicOrigin: z.string().url(),
  registrationMode: registrationModeSchema.default('closed'),
  bodyLimitBytes: z.number().int().min(1024).max(32 * 1024 * 1024).default(1_048_576),
  trustProxy: z.boolean().default(false),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type CloudConfig = z.infer<typeof cloudConfigSchema>;

export type CloudConfigInput = z.input<typeof cloudConfigSchema>;

/** Load and validate environment; fail-fast on boot. */
export function loadCloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  const parsed = cloudConfigSchema.safeParse({
    nodeEnv: env.NODE_ENV ?? 'development',
    host: '0.0.0.0',
    port: 3000,
    databaseUrl: env.DATABASE_URL,
    tokenSigningKey: env.CLOUD_TOKEN_SIGNING_KEY,
    aiKek: env.CLOUD_AI_KEK,
    publicOrigin: env.CLOUD_PUBLIC_ORIGIN,
    registrationMode: env.CLOUD_REGISTRATION_MODE ?? 'closed',
    bodyLimitBytes: env.CLOUD_BODY_LIMIT_BYTES ? Number(env.CLOUD_BODY_LIMIT_BYTES) : undefined,
    trustProxy: env.CLOUD_TRUST_PROXY === '1' || env.CLOUD_TRUST_PROXY === 'true',
    logLevel: env.CLOUD_LOG_LEVEL ?? 'info',
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[cloud-server] invalid configuration: ${detail}`);
  }
  return parsed.data;
}

/** Redact secrets for logs and error responses. */
export function redactSecrets(text: string, config: CloudConfig): string {
  let out = text;
  for (const secret of [config.tokenSigningKey, config.aiKek, config.databaseUrl]) {
    if (secret && out.includes(secret)) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  return out.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
