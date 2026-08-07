/**
 * Result<T, E>：可恢复业务失败的显式返回。
 * 违反不变量/编程错误抛异常走错误边界；业务失败返回 Result。
 * 方法版：map 只作用于 ok；unwrap 在 err 上抛错。
 */
interface ResultMethods<T, E> {
  map<U>(fn: (value: T) => U): Result<U, E>;
  unwrap(): T;
}

export type Result<T, E = string> =
  | ({ ok: true; value: T } & ResultMethods<T, E>)
  | ({ ok: false; error: E } & ResultMethods<never, E>);

export function ok<T>(value: T): { ok: true; value: T } & ResultMethods<T, never> {
  return {
    ok: true,
    value,
    map<U>(fn: (v: T) => U) {
      return ok(fn(value));
    },
    unwrap() {
      return value;
    },
  };
}

export function err<E>(error: E): { ok: false; error: E } & ResultMethods<never, E> {
  return {
    ok: false,
    error,
    map<U>(_fn: (v: never) => U) {
      void _fn;
      return err(error);
    },
    unwrap(): never {
      throw new Error(String(error));
    },
  };
}

export function isOk<T, E>(r: Result<T, E>): r is Extract<Result<T, E>, { ok: true }> {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is Extract<Result<T, E>, { ok: false }> {
  return r.ok === false;
}
