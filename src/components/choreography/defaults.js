// Default choreography registry — the (role, eventName) → pipeline map
// that gives every component a "right-feeling" baseline motion. Consumers
// opt in via applyDefaultChoreography(c).
//
// Per-event overrides at the call site beat registry entries; missing
// registry keys are silently no-op (the resolver treats undefined and an
// empty pipe() as equivalent).
import { pipe, at } from './pipeline';
import { dissolve } from './effects/dissolve';
import { pop } from './effects/pop';
// Top-level: only roles with canonical motion get entries. Roles not listed
// (text, link, heading, none, img, textbox) opt out of the system's defaults.
export const defaultChoreography = {
    button: {
        onClick: pipe(pop({ intensity: 0.4 }), at(120, dissolve({
            particlePhaseMs: 1200,
            returnMs: 300,
            fadeMs: 220,
        }))),
    },
    switch: {
        onChange: pipe(pop({ part: 'knob', intensity: 0.6 })),
    },
    slider: {
        onChange: pipe(pop({ part: 'thumb', intensity: 0.2 })),
        // whileDragging: { enter, exit } would set/clear thumb trails, but slider
        // drag tracking is blocked on P14 — entry omitted from v1 so the runner
        // doesn't poll a predicate that always returns false. Re-add when the
        // dragging axis lands on ComponentInternals.
    },
    checkbox: {
        onChange: pipe(pop({ part: 'check', intensity: 0.5 })),
    },
    radio: {
        onChange: pipe(pop({ part: 'dot', intensity: 0.5 })),
    },
};
