/**
 * Server-side tenant scope. Cloud routes always run as `authenticated`:
 * guest data stays on-device until the teacher explicitly copies it.
 *
 * Roster / students are sync resources keyed by workspace, not SQL tables.
 * Isolation is (accountId, classId, subjectId) via workspace uniqueness.
 */
export type WorkspaceScope = {
  accountId: string;
  workspaceId: string;
  classId: string | null;
  subjectId: string;
  mode: 'authenticated';
  generation: number;
};

/** Scope before ensure/resolve has allocated a workspaceId. */
export type WorkspaceScopeRequest = {
  accountId: string;
  classId: string | null;
  subjectId: string;
  mode: 'authenticated';
  generation: number;
};

export type ClassTenantRef = {
  accountId: string;
  classId: string;
};

export function authenticatedWorkspaceRequest(
  accountId: string,
  input: { classId: string | null; subjectId: string; generation?: number },
): WorkspaceScopeRequest {
  return {
    accountId,
    classId: input.classId,
    subjectId: input.subjectId,
    mode: 'authenticated',
    generation: input.generation ?? 0,
  };
}

export function toWorkspaceScope(
  row: {
    workspace_id: string;
    account_id: string;
    class_id: string | null;
    subject_id: string;
  },
  generation = 0,
): WorkspaceScope {
  return {
    accountId: row.account_id,
    workspaceId: row.workspace_id,
    classId: row.class_id,
    subjectId: row.subject_id,
    mode: 'authenticated',
    generation,
  };
}
