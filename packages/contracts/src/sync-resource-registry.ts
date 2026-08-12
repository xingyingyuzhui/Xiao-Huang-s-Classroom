import { z } from 'zod';
import {
  classRosterPayloadSchema,
  classSettingsPayloadSchema,
  teacherSettingsPayloadSchema,
} from './sync-resources.js';

export type SyncResourceRegistration = {
  resourceType: string;
  schemaVersion: number;
  payloadSchema: z.ZodType<unknown>;
  maxPayloadBytes: number;
  supportsDuplicateLocal: boolean;
};

/** Cloud-authoritative Wave 1 resource registry. Unknown types are rejected. */
export const WAVE1_SYNC_RESOURCE_REGISTRY: ReadonlyArray<SyncResourceRegistration> = [
  {
    resourceType: 'teacher.settings',
    schemaVersion: 1,
    payloadSchema: teacherSettingsPayloadSchema,
    maxPayloadBytes: 32_768,
    supportsDuplicateLocal: false,
  },
  {
    resourceType: 'class.settings',
    schemaVersion: 1,
    payloadSchema: classSettingsPayloadSchema,
    maxPayloadBytes: 32_768,
    supportsDuplicateLocal: false,
  },
  {
    resourceType: 'class.roster',
    schemaVersion: 1,
    payloadSchema: classRosterPayloadSchema,
    maxPayloadBytes: 524_288,
    supportsDuplicateLocal: true,
  },
];

const byType = new Map(
  WAVE1_SYNC_RESOURCE_REGISTRY.map((entry) => [entry.resourceType, entry] as const),
);

export function getSyncResourceRegistration(
  resourceType: string,
): SyncResourceRegistration | undefined {
  return byType.get(resourceType);
}

export function listSyncResourceTypes(): string[] {
  return WAVE1_SYNC_RESOURCE_REGISTRY.map((entry) => entry.resourceType);
}

/** Soft storage guards (configurable via env on the server). */
export const SYNC_STORAGE_LIMITS = {
  maxOperationsPerPush: 200,
  maxResourcesPerWorkspace: 5_000,
  maxBytesPerAccount: 50 * 1024 * 1024,
  maxPushRequestsPerMinute: 60,
} as const;

export function measurePayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload ?? null)).length;
}
