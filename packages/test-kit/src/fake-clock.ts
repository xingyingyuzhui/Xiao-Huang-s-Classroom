/** Fake Clock：可控推进的时间源。 */
export interface FakeClock {
  now(): number;
  advance(ms: number): void;
  set(ms: number): void;
}

export function createFakeClock(initial = 0): FakeClock {
  let current = initial;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
}
