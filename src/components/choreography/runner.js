// ChoreoRunner — owns live PipelineHandles and the trigger registry. The
// consumer creates one runner per runtime (lab, SPA, demo page) and calls
// runner.tick(now) from their existing rAF. Effects don't own clocks; the
// runner translates wall-clock → pipeline-time → stage-local time and
// builds the EffectCtx fresh per tick.
//
// Lifecycle: every PipelineHandle.run() result is tracked here; tick()
// advances all live handles and prunes done ones. dispose() cancels every
// live handle (running their onEnds) and clears the trigger registry.
const buildHandle = (pipeline, indices, startNow, buildCtx) => {
    // Pipeline stages share one state object per handle. This lets the recipe
    // pattern work (captureStarts writes a key, easeToTargets reads the same
    // key from a later stage). Concurrent handles for the same pipeline get
    // independent shared-state objects, so cycles don't cross-contaminate.
    const handleState = {};
    const runtimes = pipeline.stages.map((s) => ({
        effect: s.effect,
        startMs: s.startMs,
        started: false,
        ended: false,
        lastTickAt: 0,
        indices,
    }));
    let cancelled = false;
    const advance = (now) => {
        if (cancelled)
            return;
        const elapsed = now - startNow;
        for (const r of runtimes) {
            if (r.ended)
                continue;
            // Pre-start window: ignore.
            if (elapsed < r.startMs)
                continue;
            const stageT = elapsed - r.startMs;
            const dtStage = r.started ? elapsed - r.lastTickAt : 0;
            r.lastTickAt = elapsed;
            if (!r.started)
                r.started = true;
            // Instant effects (duration 0): tick once at activation, then mark ended
            // so the runner stops calling them. onEnd still fires for symmetry.
            if (r.effect.duration === 0) {
                const ctx = buildCtx(0, 0, handleState);
                r.effect.tick(r.indices, ctx);
                r.ended = true;
                if (r.effect.onEnd)
                    r.effect.onEnd(r.indices, ctx);
                continue;
            }
            // Temporal effects: tick with clamped t (so the last frame writes the
            // exact end-state at duration); fire onEnd when crossing the boundary.
            if (stageT >= r.effect.duration) {
                const ctxFinal = buildCtx(r.effect.duration, dtStage, handleState);
                r.effect.tick(r.indices, ctxFinal);
                r.ended = true;
                if (r.effect.onEnd)
                    r.effect.onEnd(r.indices, ctxFinal);
            }
            else {
                const ctx = buildCtx(stageT, dtStage, handleState);
                r.effect.tick(r.indices, ctx);
            }
        }
    };
    const isDone = () => {
        if (cancelled)
            return true;
        return runtimes.every((r) => r.ended);
    };
    const cancel = () => {
        if (cancelled)
            return;
        cancelled = true;
        for (const r of runtimes) {
            if (r.started && !r.ended) {
                r.ended = true;
                if (r.effect.onEnd) {
                    // Use a synthetic ctx — at-cancellation t is wherever the stage was
                    // last ticked; dt is 0 because no frame elapsed since last advance.
                    const ctx = buildCtx(0, 0, handleState);
                    r.effect.onEnd(r.indices, ctx);
                }
            }
        }
    };
    return { tick: advance, done: isDone, cancel };
};
export const createChoreoRunner = (deps) => {
    const liveHandles = [];
    const triggers = [];
    // Wall-clock state — set by tick(now). Triggers read this when they fire
    // pipelines between frames so the handle starts on the same clock as the
    // runner's last tick.
    let currentNow = 0;
    const run = (pipeline, group, component) => {
        const groupCtx = {
            scene: deps.scene,
            particles: deps.particles,
        };
        const indices = group.resolve(groupCtx);
        const buildCtx = (stageT, stageDt, state) => ({
            particles: deps.particles,
            world: deps.world,
            scene: deps.scene,
            component,
            mirrorHost: deps.mirrorHost,
            t: stageT,
            dt: stageDt,
            state,
        });
        const handle = buildHandle(pipeline, indices, currentNow, buildCtx);
        liveHandles.push(handle);
        return handle;
    };
    const tick = (now) => {
        currentNow = now;
        // Poll state triggers first so any flips fire pipelines THIS frame, and
        // the just-added handles get advanced by the loop below.
        for (const t of triggers) {
            if (t.pollState)
                t.pollState(now);
        }
        for (let i = liveHandles.length - 1; i >= 0; i--) {
            const h = liveHandles[i];
            h.tick(now);
            if (h.done())
                liveHandles.splice(i, 1);
        }
    };
    const attachTrigger = (h) => {
        triggers.push(h);
    };
    const dispose = () => {
        for (const h of liveHandles)
            h.cancel();
        liveHandles.length = 0;
        // LIFO so chained onEvent wrappers unwind in reverse-install order.
        for (let i = triggers.length - 1; i >= 0; i--)
            triggers[i].dispose();
        triggers.length = 0;
    };
    return {
        run,
        tick,
        attachTrigger,
        now: () => currentNow,
        getParticles: () => deps.particles,
        dispose,
    };
};
