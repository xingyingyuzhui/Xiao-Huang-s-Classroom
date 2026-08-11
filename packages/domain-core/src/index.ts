/** 公共入口：显式具名导出（禁止裸 export *，避免歧义导出）。 */
export { ok, err, isOk, isErr } from './result.js';
export type { Result } from './result.js';
export { ErrorCode, AppError, errorCodeOf } from './errors.js';
export { makeId } from './ids.js';
export type { BrandedId, FunctionId, PointId, ConstructionId, SubjectId, AccountId, ClassId, WorkspaceId, DeviceId, SessionId, ResourceId, OperationId, SyncCursor } from './ids.js';
export { SystemClock, MathRandom, createIdAllocator } from './ids-clock.js';
export type { Clock, RandomSource, IdAllocator } from './ids-clock.js';
export { serializableClone, normalizeFinite } from './serialization.js';
export { createDisposer, disposeAll } from './cancellation.js';
export type { Disposable } from './cancellation.js';
