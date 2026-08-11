import type { ResourceTypeConfig } from '../resource-registry.js';
import { computePayloadHashSync } from './hash.js';

export const studentRosterAdapter: ResourceTypeConfig = {
  resourceType: 'class.roster',
  schemaVersion: 1,
  maxPayloadBytes: 524_288,
  supportsDuplicateLocal: true,
  summarize: (payload) => {
    const roster = payload as { students?: unknown[] };
    const count = roster?.students?.length ?? 0;
    return `学生名单 (${count}人)`;
  },
  computeHash: computePayloadHashSync,
};
