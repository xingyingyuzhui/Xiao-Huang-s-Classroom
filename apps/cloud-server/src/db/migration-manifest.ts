/**
 * Migration manifest — Supervisor/Task 3 独占；B/C/F 只在预留号段新增文件。
 *
 * 0010–0019 auth/accounts/devices（Agent B）
 * 0020–0029 classes/workspaces/sync（Agent C）
 * 0030–0039 ai/audit（Agent F）
 */
export type MigrationEntry = {
  version: number;
  filename: string;
  /** Reserved segment owner for review; platform = Task 3. */
  owner: 'platform' | 'auth' | 'sync' | 'ai';
};

export const MIGRATION_MANIFEST: MigrationEntry[] = [
  { version: 1, filename: '0001_platform.sql', owner: 'platform' },
  { version: 10, filename: '0010_identity_sessions.sql', owner: 'auth' },
  { version: 20, filename: '0020_classes_workspaces.sql', owner: 'sync' },
  { version: 21, filename: '0021_sync_resources.sql', owner: 'sync' },
];

export const MAX_MIGRATION_VERSION = MIGRATION_MANIFEST.reduce(
  (max, entry) => Math.max(max, entry.version),
  0,
);
