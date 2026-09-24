# Particle fidelity — master implementation plan

Status: PLAN. No runtime code has changed. Source brief:
[`../../particle-fidelity-handoff.md`](../../particle-fidelity-handoff.md) (the "handoff").
Prepared 2026-09-23. Written in ASD-STE100 style.

This plan divides the handoff into work packages (WPs). Each WP has a child
plan in this folder. Many Claude agents do the work in parallel. Review gates
with antagonist agents and specialist agents control each phase.

## 0. Pre-conditions found in this review (do these first)

These facts are not in the handoff, or the handoff states them weakly.

| ID | Fact | Effect on the plan |
| --- | --- | --- |
| PC1 | The engine working tree (`../screean`) has uncommitted changes in `src/screen/{constant,controller,index,machine,machine.test,types}.ts`. They replace the staggered wave reform with the varied-speed reform (`reformSpeed`). The handoff reviewed this dirty state. | Commit (or explicitly shelve) this change on its own branch BEFORE any WP starts. All WPs branch from that commit. If not, parallel agents fork from different base states. |
| PC2 | This repo consumes the engine through `file:../screean`, and pnpm hard-copies it. `sync:engine` builds only the ONE engine checkout at `../screean`. | Parallel agents CANNOT each edit `../screean` in place. Engine work in parallel must use separate engine git worktrees and must test in the engine only. One integrator agent merges engine branches, then runs `sync:engine` here. |
| PC3 | `src/screen/controller.ts` is 389 lines and is the hot spot for WP-B, WP-C, WP-D, and WP-E. | Sequence the controller seams. WP-A1 ("seams") extracts the scheduler/executor boundary first. Later WPs add to the seams, not to the monolith. |
| PC4 | The engine header comment says transitions CHAIN. The runtime is concurrent (handoff §2). | WP-A1 fixes the comment and adds the mixed-phase test C04 before other work depends on the concurrency behavior. |

## 1. Goal and non-goals

Goal: an opt-in "dense flow" mode in the shared engine controller. It gives
coherent curl-noise motion, controlled presentation, and (later) GPU-resident
simulation and reform at high counts. The component site shows it at
`/experiments/particle-fidelity`. Legacy behavior stays the default and does
not change.

Non-goals for this plan: color-preserving sampling, 3D/2.5D depth, domain warp,
package publish, changes to the `flowfield` reference repo, mobile performance
claims without device evidence.

## 2. Work packages and dependency graph

```text
PC1 commit engine WIP
   |
   v
WP-A  Baseline + seams + experiment shell      (M0, M1)      ── child plan 10
   |        \
   v         v
WP-B  Coherent CPU field + presentation       (M1b, M2)     ── child plan 20
   |         \
   |          v
   |     WP-C  GPU transition executor        (M3)          ── child plan 30
   |          |
   v          v
WP-D  Density policy, budget, narrow types, React   (M4)    ── child plan 40
   \          /
    v        v
WP-E  Browser runner, acceptance, packaging, docs   (M5, M6) ── child plan 50
```

Parallel lanes after WP-A1 (seams) merges:

- Lane 1: WP-B (CPU field, presentation options).
- Lane 2: WP-C spike work that does not touch the controller: slice-aware
  kernels, shared device injection, direct-buffer render path, stable field seed.
- Lane 3: WP-E1 real-browser GPU test runner (needed by WP-C acceptance).
- Lane 4: WP-D1 pure count/budget policy module (pure functions; no controller edits).
- Lane 5: WP-A2 reference capture of `flowfield` (human-assisted; read-only).

Lanes join at integration gates (§4). WP-C controller integration waits for
WP-B's executor interface. WP-D controller integration waits for WP-C's
backend handle type.

## 3. Work package summary (detail lives in the child plans)

Each row lists the three items that the project rules require for each step.

| WP | Difficulty | Main LLM errors to prevent | Technical data |
| --- | --- | --- | --- |
| A. Baseline, seams, experiment shell | Medium | Edits the stale `node_modules` copy; resets dirty files; builds a site-owned dissolve loop; changes legacy defaults while it extracts seams | Handoff §3, §7 M0–M1, §11 commands; `controller.ts`, `machine.ts`, `site/experiments/registry.ts`, `site/lab/mount.ts` |
| B. Coherent CPU field + presentation | Medium-high | Uses field as force AND drag (double damping); reuses `tx/ty` as flow targets; reseeds noise by frame; grid too coarse for the top octave; `particleSize` unit confusion | Handoff F2, F5, F6, §6.4, §6.6; `core/forces.ts`, `World.ts`, `renderers/webgl/*` |
| C. GPU transition executor | High | Two devices for world and renderer; stale-shadow overwrite; per-frame readback; free + reform on the same particle; all-pairs neighbor kernel left on; struct layout drift | Handoff F3, F4, §6.5; `core/gpu/*`, `renderers/webgpu/*`, `render-world.ts` |
| D. Density policy, budget, types, React | Medium-high | Factory default counts masquerade as explicit counts; budget race between two captures; casts `WorldGPU` to `World`; async provider leaks after unmount | Handoff F1, §6.2, §6.3; `headless/constant.ts`, `headless/*.ts`, `react/useHeadless.ts`, `screean/react/index.tsx` |
| E. Browser runner, acceptance, packaging | High (tooling) | Reports skipped GPU tests as pass; timer-mode rAF as perf evidence; preview serves a lib build; guessed CLI flags | Handoff §8–§12; `screean/tests/{gpu,parity,perf,visual}`, `vite.lib.config.ts` |

## 4. Gates

Every gate needs `tsc --noEmit` clean and `vitest run` green in each touched
repo (engine: `pnpm --dir ../screean test` and `run build`; then `sync:engine`).

| Gate | After | Pass condition |
| --- | --- | --- |
| G0 | PC1 + WP-A0 | Engine WIP committed; baseline test/build results archived under `docs/benchmarks/runs/<date>/`; reference capture manifest exists or is marked "pending user" |
| G1 | WP-A1 | Scheduler/executor seam exists; `applyTransitionFrame` still exported and green; C04 mixed-phase test exists; legacy visual behavior identical (same seed → same particle positions in a CPU replay test) |
| G2 | WP-A2 + WP-B | Experiment route runs legacy vs dense-flow on real headless factories; F01–F07 pass; user makes a visual choice from concrete variants at 6k/16k/32k |
| G3 | WP-C + WP-E1 | Forced-GPU experiment runs; G01–G10 execute on a real adapter (executed count > 0, reported); zero `syncToShadow` in the frame loop |
| G4 | WP-D | P01–P06 pass; all nine wrappers compile and keep legacy counts; async React lifecycle tests pass |
| G5 | WP-E | Evidence bundle (handoff §12) for the selected preset; both builds; isolated tarball consumer resolves the new exports |

## 5. Agent execution model (for the implementation phase)

### 5.1 Roles

| Role | Count | Agent type | Duty |
| --- | --- | --- | --- |
| Orchestrator | 1 | main session | Owns this plan, dispatches WPs, runs gates, talks to the user. Does not write feature code. |
| Implementer | 1 per active lane (max 4 at once) | `general-purpose` / `Senior Developer`, `isolation: "worktree"` for this repo; manual `git worktree add` for the engine | Executes one child-plan step list. Writes tests first where the child plan says so. |
| Integrator | 1 | `general-purpose` | Only agent that merges engine branches into `../screean` and runs `sync:engine`. Resolves conflicts in `controller.ts`. |
| Antagonist | 2 per gate | `Reality Checker`, `Code Reviewer` | Tries to break the WP: invariants (§6 of ARCHITECTURE-components), legacy regressions, fake evidence. Default verdict: NEEDS WORK. |
| Specialist | 1–3 per gate | `Technical Artist` (GPU/visual), `Performance Benchmarker`, `Software Architect` (types/API), `Test Results Analyzer` | Domain review against the handoff's exact contracts. |
| Evidence collector | 1 at G2, G3, G5 | `Evidence Collector` | Captures screenshots/video via the preview tools; verifies claims against pixels. |

### 5.2 Rules for all agents

1. Read `CLAUDE.md` (both repos), the handoff, and the WP's child plan before any edit.
2. Never edit `node_modules/@tesyl/screean`. Never reset or overwrite dirty files you did not create.
3. Engine edits happen in an engine worktree (`git -C ../screean worktree add ../screean-wt-<wp> -b wp/<wp>`). Engine tests run there. Only the integrator touches `../screean` itself.
4. Code style: functional, pure named functions, `type` not `interface`, CAP_SNAKE_CASE constants in `constant.ts`, coupled types (discriminated unions, `satisfies`, mapped types over config keys).
5. A step is done only with command output pasted into the WP log: typecheck, tests (executed and skipped counts), and build where required.
6. No agent claims a GPU result from a Node run. No agent claims performance from timer-mode rAF.
7. Keep a WP log at `docs/plans/particle-fidelity/logs/<wp>.md`: base commit, commands, results, open issues.

### 5.3 Review protocol per gate (multiphase)

1. Round 1, in parallel: 2 antagonists + the WP's specialists review the diff and the log. Each finding has file:line, failure scenario, severity.
2. Implementer fixes or rebuts each finding in the log.
3. Round 2: one fresh antagonist (no memory of round 1) re-reviews. It checks that fixes are real and that nothing regressed.
4. Orchestrator runs the gate commands itself. It does not trust agent reports of green tests.
5. Visual gates (G2, G5) end with a user decision on concrete captured variants.

## 6. Plan-phase process (this document set)

1. Orchestrator writes this master plan.
2. Five planner agents write child plans 10–50 in parallel, grounded in the code.
3. Round 1 review of the child plans: 2 antagonists (correctness/invariants; sequencing/cross-plan conflicts) + 3 specialists (GPU/WebGPU; test/validation/perf; TypeScript API/React lifecycle).
4. Planners revise their child plans against the findings.
5. Round 2: one fresh antagonist does a final pass over all plans together.
6. Orchestrator writes `90-review-log.md` and hands the plan set to the user.

## 7. Child plan template (every child plan must follow it)

```markdown
# <NN> <WP name>
Status, base commits, owner lane, depends on, unblocks.
## Scope / out of scope
## Contracts consumed / produced   (exact type names, file paths, exports)
## Steps
### Step N: <title>
- Difficulty:
- Possible LLM errors:
- Technical data: (files with line refs, exact constants, formulas, commands)
- Tests first: (test IDs from handoff §9 plus new IDs)
- Done when:
## Parallelization inside this WP (which steps can run as separate agents)
## Risks and rollback
## Gate checklist
```
