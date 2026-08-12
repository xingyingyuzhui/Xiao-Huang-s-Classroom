import type { SyncEntityEnvelope } from '@xiaohuang/contracts';
import type { TenantClient } from '../db/tenant.js';

export type SyncResourceRow = {
  resource_id: string;
  workspace_id: string;
  account_id: string;
  resource_type: string;
  schema_version: number;
  revision: string;
  payload: unknown;
  content_hash: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SyncOperationRow = {
  account_id: string;
  operation_id: string;
  workspace_id: string;
  status: string;
  content_hash: string | null;
  created_at: Date;
};

export type PullChangeRow = {
  sequence: string;
  resource_type: string;
  resource_id: string;
  revision: string;
  schema_version: number;
  payload: unknown;
  content_hash: string;
  deleted_at: Date | null;
};

export class SyncRepository {
  constructor(private readonly db: TenantClient) {}

  async findResource(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<SyncResourceRow | null> {
    const result = await this.db.query<SyncResourceRow>(
      `SELECT resource_id, workspace_id, account_id, resource_type, schema_version, revision,
              payload, content_hash, deleted_at, created_at, updated_at
       FROM sync_resources
       WHERE workspace_id = $1 AND resource_type = $2 AND resource_id = $3`,
      [workspaceId, resourceType, resourceId],
    );
    return result.rows[0] ?? null;
  }

  async tryInsertResource(
    accountId: string,
    workspaceId: string,
    envelope: SyncEntityEnvelope,
  ): Promise<number | null> {
    const deletedAt = envelope.deletedAt ? new Date(envelope.deletedAt) : null;
    const result = await this.db.query<{ revision: string }>(
      `INSERT INTO sync_resources (
         resource_id, workspace_id, account_id, resource_type, schema_version,
         revision, payload, content_hash, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)
       ON CONFLICT (workspace_id, resource_type, resource_id) DO NOTHING
       RETURNING revision`,
      [
        envelope.resourceId,
        workspaceId,
        accountId,
        envelope.resourceType,
        envelope.schemaVersion,
        JSON.stringify(envelope.payload),
        envelope.contentHash,
        deletedAt,
      ],
    );
    return result.rows[0] ? Number(result.rows[0].revision) : null;
  }

  async updateResourceCas(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    baseRevision: number,
    envelope: SyncEntityEnvelope,
  ): Promise<number | null> {
    const deletedAt = envelope.deletedAt ? new Date(envelope.deletedAt) : null;
    const result = await this.db.query<{ revision: string }>(
      `UPDATE sync_resources
       SET schema_version = $5,
           revision = revision + 1,
           payload = $6,
           content_hash = $7,
           deleted_at = $8,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND resource_type = $2
         AND resource_id = $3
         AND revision = $4
       RETURNING revision`,
      [
        workspaceId,
        resourceType,
        resourceId,
        baseRevision,
        envelope.schemaVersion,
        JSON.stringify(envelope.payload),
        envelope.contentHash,
        deletedAt,
      ],
    );
    return result.rows[0] ? Number(result.rows[0].revision) : null;
  }

  async claimOperation(
    accountId: string,
    operationId: string,
    workspaceId: string,
    contentHash: string,
  ): Promise<'claimed' | 'duplicate' | 'mismatch'> {
    const inserted = await this.db.query<{ content_hash: string | null }>(
      `INSERT INTO sync_operations (account_id, operation_id, workspace_id, status, content_hash)
       VALUES ($1, $2, $3, 'applied', $4)
       ON CONFLICT (account_id, operation_id) DO NOTHING
       RETURNING content_hash`,
      [accountId, operationId, workspaceId, contentHash],
    );
    if (inserted.rows[0]) {
      return 'claimed';
    }
    const existing = await this.findOperation(accountId, operationId);
    if (!existing) {
      return 'claimed';
    }
    if (existing.content_hash && existing.content_hash !== contentHash) {
      return 'mismatch';
    }
    return 'duplicate';
  }

  /** @deprecated use tryInsertResource / updateResourceCas */
  async upsertResource(
    accountId: string,
    workspaceId: string,
    envelope: SyncEntityEnvelope,
  ): Promise<number> {
    const deletedAt = envelope.deletedAt ? new Date(envelope.deletedAt) : null;
    const result = await this.db.query<{ revision: string }>(
      `INSERT INTO sync_resources (
         resource_id, workspace_id, account_id, resource_type, schema_version,
         revision, payload, content_hash, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)
       ON CONFLICT (workspace_id, resource_type, resource_id)
       DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         revision = sync_resources.revision + 1,
         payload = EXCLUDED.payload,
         content_hash = EXCLUDED.content_hash,
         deleted_at = EXCLUDED.deleted_at,
         updated_at = NOW()
       RETURNING revision`,
      [
        envelope.resourceId,
        workspaceId,
        accountId,
        envelope.resourceType,
        envelope.schemaVersion,
        JSON.stringify(envelope.payload),
        envelope.contentHash,
        deletedAt,
      ],
    );
    return Number(result.rows[0]!.revision);
  }

  async findOperation(accountId: string, operationId: string): Promise<SyncOperationRow | null> {
    const result = await this.db.query<SyncOperationRow>(
      `SELECT account_id, operation_id, workspace_id, status, content_hash, created_at
       FROM sync_operations
       WHERE account_id = $1 AND operation_id = $2`,
      [accountId, operationId],
    );
    return result.rows[0] ?? null;
  }

  async recordOperation(
    accountId: string,
    operationId: string,
    workspaceId: string,
    status: string,
    contentHash: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO sync_operations (account_id, operation_id, workspace_id, status, content_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, operationId, workspaceId, status, contentHash],
    );
  }

  async appendChangeLog(
    accountId: string,
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    revision: number,
    operationId: string,
  ): Promise<number> {
    const result = await this.db.query<{ sequence: string }>(
      `INSERT INTO sync_change_log (
         workspace_id, account_id, resource_type, resource_id, revision, operation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING sequence`,
      [workspaceId, accountId, resourceType, resourceId, revision, operationId],
    );
    return Number(result.rows[0]!.sequence);
  }

  async pullChanges(
    workspaceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<PullChangeRow[]> {
    const result = await this.db.query<PullChangeRow>(
      `SELECT cl.sequence, cl.resource_type, cl.resource_id, cl.revision,
              sr.schema_version, sr.payload, sr.content_hash, sr.deleted_at
       FROM sync_change_log cl
       INNER JOIN sync_resources sr
         ON sr.workspace_id = cl.workspace_id
        AND sr.resource_type = cl.resource_type
        AND sr.resource_id = cl.resource_id
       WHERE cl.workspace_id = $1 AND cl.sequence > $2
       ORDER BY cl.sequence ASC
       LIMIT $3`,
      [workspaceId, afterSequence, limit],
    );
    return result.rows;
  }
}
