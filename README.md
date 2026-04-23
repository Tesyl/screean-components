# Component library — to move out of screean

This directory stages the component layer for extraction into its own repo.
screean (the engine) no longer ships these; they build on top of screean's
scene graph + event routing.

## To extract

```sh
# 1. Create the new repo (example path)
mkdir ../screean-components
cd ../screean-components
npm init -y

# 2. Copy staged sources
cp -r ../screean/to-move/src ./
cp ../screean/to-move/package.json.template ./package.json    # review before keeping
cp ../screean/to-move/tsconfig.json.template ./tsconfig.json
cp ../screean/to-move/vitest.config.ts ./vitest.config.ts

# 3. Install
npm install file:../screean vitest typescript @types/node

# 4. Run tests
npm test

# 5. Once green, delete `to-move/` from screean.
```

## What's in here

```
src/
├── components/
│   ├── types.ts                  — Component, ComponentEvent, ComponentHandlers
│   ├── component.ts              — component() factory + findComponentAncestor
│   ├── button.ts                 — button() factory
│   ├── label.ts                  — label() factory
│   ├── routePointerEvent.ts      — one-call click dispatch
│   ├── pointerTracker.ts         — stateful hover/press tracker
│   ├── index.ts                  — package barrel
│   ├── component.test.ts
│   ├── factories.test.ts
│   ├── routePointerEvent.test.ts
│   └── pointerTracker.test.ts
└── testing/
    └── offscreenCanvasStub.ts    — deterministic OffscreenCanvas stub for tests
```

## Imports

All source files import scene-graph + event primitives from the `screean`
package (flat surface). See `package.json.template` for the dep config.
Local dev can use `file:../screean` to link against the workspace copy.

## Import rewrite summary

The following rewrites have already been applied to every staged file:

| Before (inside screean)             | After (in new repo)                    |
|-------------------------------------|----------------------------------------|
| `from '../scene/types'`             | `from 'screean'`                       |
| `from '../scene/node'`              | `from 'screean'`                       |
| `from '../scene/scene'`             | `from 'screean'`                       |
| `from '../scene/shapes'`            | `from 'screean'`                       |
| `from '../scene/layout'`            | `from 'screean'`                       |
| `from '../core/types'`              | `from 'screean'`                       |
| `scene.indicesForComponent(n)`      | `scene.indicesForSubtree(n)`           |

`indicesForSubtree` is the new engine-neutral name — screean doesn't know
what a "component" is; it just knows how to enumerate particle indices under
an arbitrary subtree.
