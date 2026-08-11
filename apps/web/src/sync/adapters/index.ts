import type { ResourceRegistry } from '../resource-registry.js';
import { teacherSettingsAdapter, classSettingsAdapter } from './settings-adapter.js';
import { studentRosterAdapter } from './roster-adapter.js';

export function registerWave1Adapters(registry: ResourceRegistry): void {
  registry.register(teacherSettingsAdapter);
  registry.register(classSettingsAdapter);
  registry.register(studentRosterAdapter);
}
