/** branded ID：运行时是字符串，类型上可区分 id 种类。 */
export type BrandedId<T extends string> = string & { __brand?: T };

export type FunctionId = BrandedId<'function'>;
export type PointId = BrandedId<'point'>;
export type ConstructionId = BrandedId<'construction'>;
export type SubjectId = BrandedId<'subject'>;

export function makeId<T extends string>(prefix: string, seq: number): BrandedId<T> {
  return `${prefix}${seq}` as BrandedId<T>;
}
