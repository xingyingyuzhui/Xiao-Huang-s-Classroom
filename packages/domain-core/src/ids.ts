/** branded ID：运行时是字符串，类型上可区分 id 种类。 */
export type BrandedId<T extends string> = string & { __brand?: T };

export type FunctionId = BrandedId<'function'>;
export type PointId = BrandedId<'point'>;
export type ConstructionId = BrandedId<'construction'>;
export type SubjectId = BrandedId<'subject'>;

export type AccountId = BrandedId<'account'>;
export type ClassId = BrandedId<'class'>;
export type WorkspaceId = BrandedId<'workspace'>;
export type DeviceId = BrandedId<'device'>;
export type SessionId = BrandedId<'session'>;
export type ResourceId = BrandedId<'resource'>;
export type OperationId = BrandedId<'operation'>;
export type SyncCursor = BrandedId<'syncCursor'>;

export function makeId<T extends string>(prefix: string, seq: number): BrandedId<T> {
  return `${prefix}${seq}` as BrandedId<T>;
}
