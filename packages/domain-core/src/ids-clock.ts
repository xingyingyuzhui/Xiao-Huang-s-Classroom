/** 注入接口：Clock / IdAllocator / RandomSource（spec §7.2）。 */

export interface Clock {
  now(): number;
}

export const SystemClock: Clock = {
  now: () => Date.now(),
};

export interface RandomSource {
  next(): number;
}

export const MathRandom: RandomSource = {
  next: () => Math.random(),
};

/** 从已占用 id 集合推进的 allocator（文档级扫描，防冲突）。 */
export interface IdAllocator {
  next(prefix: string): string;
  reseed(occupied: readonly string[]): void;
}

export function createIdAllocator(occupied: readonly string[] = []): IdAllocator {
  const counters = new Map<string, number>();
  const scan = (ids: readonly string[]) => {
    counters.clear();
    for (const id of ids) {
      const m = /^([A-Za-z]+)(\d+)$/.exec(String(id));
      if (!m) continue;
      const prefix = m[1] as string;
      const seq = Number(m[2] as string);
      if (Number.isFinite(seq) && seq > (counters.get(prefix) || 0)) {
        counters.set(prefix, seq);
      }
    }
  };
  scan(occupied);
  return {
    next(prefix) {
      const seq = (counters.get(prefix) || 0) + 1;
      counters.set(prefix, seq);
      return `${prefix}${seq}`;
    },
    reseed(ids) {
      scan(ids);
    },
  };
}
