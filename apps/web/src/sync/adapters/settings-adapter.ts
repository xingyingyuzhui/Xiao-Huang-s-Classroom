import type { ResourceTypeConfig } from '../resource-registry.js';
import { computePayloadHashSync } from './hash.js';

export const teacherSettingsAdapter: ResourceTypeConfig = {
  resourceType: 'teacher.settings',
  schemaVersion: 1,
  maxPayloadBytes: 32_768,
  supportsDuplicateLocal: false,
  summarize: () => '教师设置',
  computeHash: computePayloadHashSync,
};

export const classSettingsAdapter: ResourceTypeConfig = {
  resourceType: 'class.settings',
  schemaVersion: 1,
  maxPayloadBytes: 32_768,
  supportsDuplicateLocal: false,
  summarize: (payload) => {
    const name = (payload as { className?: string })?.className ?? '';
    return name ? `班级设置: ${name}` : '班级设置';
  },
  computeHash: computePayloadHashSync,
};
