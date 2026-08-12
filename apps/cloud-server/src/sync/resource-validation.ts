import {
  getSyncResourceRegistration,
  measurePayloadBytes,
  SYNC_STORAGE_LIMITS,
  type SyncEntityEnvelope,
} from '@xiaohuang/contracts';

export type ResourceValidationFailure = {
  code:
    | 'SYNC_UNKNOWN_RESOURCE'
    | 'SYNC_SCHEMA_UNSUPPORTED'
    | 'SYNC_PAYLOAD_TOO_LARGE'
    | 'VALIDATION_SCHEMA'
    | 'SYNC_HASH_MISMATCH';
  message: string;
};

export function validateSyncEnvelope(
  envelope: SyncEntityEnvelope,
): ResourceValidationFailure | null {
  const registration = getSyncResourceRegistration(envelope.resourceType);
  if (!registration) {
    return {
      code: 'SYNC_UNKNOWN_RESOURCE',
      message: `未注册的资源类型: ${envelope.resourceType}`,
    };
  }
  if (envelope.schemaVersion !== registration.schemaVersion) {
    return {
      code: 'SYNC_SCHEMA_UNSUPPORTED',
      message: `不支持的 schemaVersion: ${envelope.schemaVersion}`,
    };
  }

  const bytes = measurePayloadBytes(envelope.payload);
  if (bytes > registration.maxPayloadBytes) {
    return {
      code: 'SYNC_PAYLOAD_TOO_LARGE',
      message: `资源超过大小限制 (${bytes} > ${registration.maxPayloadBytes})`,
    };
  }

  // Tombstones may carry an empty object; still require schema-compatible payload.
  const parsed = registration.payloadSchema.safeParse(envelope.payload ?? {});
  if (!parsed.success) {
    return {
      code: 'VALIDATION_SCHEMA',
      message: '资源载荷不符合 Schema',
    };
  }

  return null;
}

export function syncStorageLimitsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxOperationsPerPush: Number(env.SYNC_MAX_OPS_PER_PUSH) || SYNC_STORAGE_LIMITS.maxOperationsPerPush,
    maxResourcesPerWorkspace:
      Number(env.SYNC_MAX_RESOURCES_PER_WORKSPACE) || SYNC_STORAGE_LIMITS.maxResourcesPerWorkspace,
    maxBytesPerAccount: Number(env.SYNC_MAX_BYTES_PER_ACCOUNT) || SYNC_STORAGE_LIMITS.maxBytesPerAccount,
    maxPushRequestsPerMinute:
      Number(env.SYNC_MAX_PUSH_PER_MINUTE) || SYNC_STORAGE_LIMITS.maxPushRequestsPerMinute,
  };
}
