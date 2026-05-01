// applyDefaultChoreography — installs registry-defined triggers on a
// component, with optional per-instance overrides.
//
// Resolution: per-event override > registry > nothing.
// Returns a single disposer that cleans up every installed trigger via the
// runner's LIFO unwind, restoring the component's handlers to pre-install
// state.
import { defaultChoreography } from './defaults';
import { onEvent, onState } from './trigger';
// Predicate factory for state-trigger keys. v1 supports a small set; the
// rest no-op to false (so the runner polls but never fires) until P14
// adds the corresponding state axes.
const predicateForStateKey = (c, stateKey) => {
    switch (stateKey) {
        case 'whilePressed':
            return () => Boolean(c._component.pressed);
        case 'whileChecked':
            return () => Boolean(c._component.checked);
        // whileDragging / whileFocused — blocked on P14 (no internals axis yet).
        default:
            return () => false;
    }
};
// Walks the component's role registry merged with `override`, installs an
// onEvent or onState trigger per entry, and returns a single disposer that
// fires every installed trigger's dispose() in registration order. The
// runner enforces LIFO disposal so chained handler wrappers unwind cleanly.
export const applyDefaultChoreography = (runner, c, override) => {
    const fromRegistry = defaultChoreography[c._component.role] ?? {};
    // Per-event override: opt's entry wins; absence falls back to registry.
    const merged = { ...fromRegistry, ...(override ?? {}) };
    const handles = [];
    for (const [key, value] of Object.entries(merged)) {
        if (key.startsWith('while')) {
            const paired = value;
            const predicate = predicateForStateKey(c, key);
            handles.push(onState(runner, c, predicate, paired));
        }
        else {
            handles.push(onEvent(runner, c, key, value));
        }
    }
    return {
        dispose: () => {
            // Local LIFO. Runner-level dispose also unwinds LIFO globally.
            for (let i = handles.length - 1; i >= 0; i--)
                handles[i].dispose();
        },
    };
};
