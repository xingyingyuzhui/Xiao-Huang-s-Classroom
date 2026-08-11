/** 公共入口：显式具名导出（禁止裸 export *，避免歧义导出）。 */
export { apiErrorPayloadSchema, apiResponseSchema, parseApiResponse } from './api.js';
export type { ApiResponse } from './api.js';
export {
  accountIdSchema,
  classIdSchema,
  workspaceIdSchema,
  deviceIdSchema,
  sessionIdSchema,
  resourceIdSchema,
  operationIdSchema,
  syncCursorSchema,
} from './branded.js';
export type {
  AccountId,
  ClassId,
  WorkspaceId,
  DeviceId,
  SessionId,
  ResourceId,
  OperationId,
  SyncCursor,
} from './branded.js';
export {
  authRegisterRequestSchema,
  authLoginRequestSchema,
  authRefreshRequestSchema,
  authLogoutRequestSchema,
  authSessionSchema,
  authCurrentAccountSchema,
  deviceSessionSchema,
  deviceRevokeRequestSchema,
  registrationModeSchema,
} from './auth.js';
export type {
  AuthRegisterRequest,
  AuthLoginRequest,
  AuthSession,
  AuthCurrentAccount,
  DeviceSession,
} from './auth.js';
export {
  accountProfileSchema,
  accountProfilePatchSchema,
  accountPasswordChangeSchema,
  accountDeletionRequestSchema,
  rememberedAccountCardSchema,
} from './account.js';
export type { AccountProfile, RememberedAccountCard } from './account.js';
export {
  classRecordSchema,
  classCreateRequestSchema,
  classPatchRequestSchema,
  classCopyRequestSchema,
  classSubjectWorkspaceSchema,
  studentRosterEntrySchema,
} from './classroom.js';
export type { ClassRecord, StudentRosterEntry } from './classroom.js';
export {
  workspaceScopeSchema,
  workspaceContextSchema,
  workspaceSwitchRequestSchema,
} from './workspace.js';
export type { WorkspaceScope, WorkspaceContext, WorkspaceSwitchRequest } from './workspace.js';
export {
  syncEntityEnvelopeSchema,
  syncOperationSchema,
  syncPushRequestSchema,
  syncPushResultSchema,
  syncPushResponseSchema,
  syncPullRequestSchema,
  syncPullChangeSchema,
  syncPullResponseSchema,
  conflictResolutionSchema,
} from './sync.js';
export type { SyncEntityEnvelope, SyncOperation, SyncPushResponse, SyncPullResponse } from './sync.js';
export {
  aiProviderKindSchema,
  aiCredentialMetadataSchema,
  aiCredentialUpsertSchema,
  aiUsageQuotaSchema,
} from './ai-provider.js';
export type { AiCredentialMetadata, AiUsageQuota } from './ai-provider.js';
export { GRAPH_DOCUMENT_VERSION, graphFunctionRecordSchema, graphPointSchema, graphConstructionSchema, graphDocumentSchema } from './persistence.js';
export type { GraphDocument, GraphFunctionRecord, GraphPoint, GraphConstruction } from './persistence.js';
export { subjectSettingsSchema, subjectSettingEntrySchema } from './settings.js';
export type { SubjectSettings } from './settings.js';
export { subjectManifestSchema } from './subject.js';
export type { SubjectManifest } from './subject.js';
export { ipcChannelSchema, ipcRequestSchema } from './ipc.js';
export type { IpcChannel } from './ipc.js';
