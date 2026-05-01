// Effect — the unit of motion. A pure data structure: a tick function plus a
// duration plus an optional cleanup. Effects don't own lifecycle; the runner
// does. This keeps the entire choreography surface composable as plain values.
//
// Two flavors share one shape:
//   instant  — duration === 0, tick fires once, no t/dt math needed
//   temporal — duration  >  0, tick fires every frame, t = local stage time
//
// onEnd runs exactly once per stage, whether the stage completed naturally
// or was cancelled mid-flight. Effects that hold transient world state
// (setForceConstant, setTrail) MUST restore it in onEnd.
// Tiny helper for consumers building one-off instant effects inline.
// Returns a fresh Effect; pure factory. Defaults to particle scope; pass an
// explicit scope when the inline body touches anything else.
export const makeInstantEffect = (tick, scope = 'particle') => ({ tick, duration: 0, scope });
