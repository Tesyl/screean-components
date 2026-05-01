// wait — pure timing primitive. Replaces inline `at(ms, ...)` for sequential
// pauses inside pipelines:
//   pipe(a, wait(200), b)        // a, then 200ms pause, then b
//   pipe(a, at(200, b))          // a starts at 0, b starts at 200 (overlap)
// Reads more naturally as "do a, wait, do b" than the offset-based version.

import type { Effect } from '../effect';

// Scope is a forced choice — `wait` has no semantic scope. Picking 'particle'
// keeps the runtime/lab type-clean; if EffectScope ever grows a 'noop' or
// 'timing' value, this is the candidate to migrate.
export const wait = (ms: number): Effect => ({
  scope: 'particle',
  duration: ms,
  tick: () => {},
});
