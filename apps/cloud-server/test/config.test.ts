import { describe, it, expect } from 'vitest';
import { loadCloudConfig, redactSecrets } from '../src/config.js';

describe('cloud config', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/cloud_test',
    CLOUD_TOKEN_SIGNING_KEY: '01234567890123456789012345678901',
    CLOUD_AI_KEK: 'abcdefghijklmnopqrstuvwxyz123456',
    CLOUD_PUBLIC_ORIGIN: 'https://example.com',
  };

  it('loads valid env with fixed host/port', () => {
    const config = loadCloudConfig(baseEnv);
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3000);
    expect(config.registrationMode).toBe('closed');
    expect(config.bodyLimitBytes).toBe(1_048_576);
  });

  it('fails fast when secrets are too short', () => {
    expect(() =>
      loadCloudConfig({
        ...baseEnv,
        CLOUD_TOKEN_SIGNING_KEY: 'short',
      }),
    ).toThrow(/invalid configuration/i);
  });

  it('redacts secrets from error text', () => {
    const config = loadCloudConfig(baseEnv);
    const raw = `db=${config.databaseUrl} token=${config.tokenSigningKey} Bearer abc.def.ghi`;
    const redacted = redactSecrets(raw, config);
    expect(redacted).not.toContain(config.databaseUrl);
    expect(redacted).not.toContain(config.tokenSigningKey);
    expect(redacted).toMatch(/Bearer \[REDACTED\]/i);
  });
});
