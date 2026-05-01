// Pipeline — an ordered, timed composition of effects. Built declaratively
// via pipe() + at(); ticked imperatively via the runner.
//
// Pipelines are values. pipe(a, b) returns a new Pipeline; the original
// stages are immutable references. Nested pipelines flatten in at build
// time so the runner deals with a flat stage list keyed by start time.
//
// Default sequencing: each stage starts when the previous ends.
//   pipe(a, b, c)             → a at 0, b at a.dur, c at a.dur + b.dur
//   pipe(a, at(100, b))       → a at 0, b at 100 (cursor does NOT advance for at())
//   pipe(pipeA, pipeB)        → pipeA placed at 0, pipeB re-offset by pipeA.duration
//   pipe(at(0, p1), at(0, p2)) → both at 0 (parallel)
//
// Pipeline.duration = max stage end time, NOT sum (overlap-safe).
// Sentinel marker on pipelines produced by at(). Lets pipe() distinguish
// "user explicitly placed this" (verbatim, no cursor advance) from "user
// composed this sequentially" (re-offset by cursor). Symbol-keyed so it
// never collides with user data and is invisible to JSON / Object.entries.
const AT_PLACED = Symbol('choreography.atPlaced');
const isPipeline = (x) => 'stages' in x && 'duration' in x;
const isAtPlaced = (p) => Boolean(p[AT_PLACED]);
const markAtPlaced = (p) => {
    p[AT_PLACED] = true;
    return p;
};
// Wrap a stage with an absolute offset from the pipeline start. The wrapped
// stage's natural duration is preserved; only its activation time changes.
// pipe() recognizes the sentinel and places the result verbatim instead of
// sequencing after the cursor.
export const at = (offsetMs, stage) => {
    if (isPipeline(stage)) {
        const stages = stage.stages.map((s) => ({
            effect: s.effect,
            startMs: s.startMs + offsetMs,
        }));
        return markAtPlaced({ stages, duration: stage.duration + offsetMs });
    }
    return markAtPlaced({
        stages: [{ effect: stage, startMs: offsetMs }],
        duration: offsetMs + stage.duration,
    });
};
// Compose stages into a pipeline. Sequential placement by default; at()-wrapped
// stages keep their absolute offsets without advancing the cursor; bare nested
// pipelines re-offset by the cursor and advance it.
//
// Returns a fresh Pipeline. Pipelines are immutable values; stages are sorted
// by startMs so the runner's activation loop is monotonic.
export const pipe = (...stages) => {
    const out = [];
    let cursor = 0;
    let maxEnd = 0;
    for (const stage of stages) {
        if (isPipeline(stage)) {
            if (isAtPlaced(stage)) {
                // Place verbatim. Cursor does not advance — subsequent sequential
                // stages still start where the prior sequential stage left off.
                for (const s of stage.stages) {
                    out.push({ effect: s.effect, startMs: s.startMs });
                }
                if (stage.duration > maxEnd)
                    maxEnd = stage.duration;
            }
            else {
                // Bare nested pipeline: re-offset by cursor, advance cursor.
                for (const s of stage.stages) {
                    out.push({ effect: s.effect, startMs: s.startMs + cursor });
                }
                const end = cursor + stage.duration;
                if (end > maxEnd)
                    maxEnd = end;
                cursor = end;
            }
        }
        else {
            // Bare effect: sequential placement.
            out.push({ effect: stage, startMs: cursor });
            const end = cursor + stage.duration;
            if (end > maxEnd)
                maxEnd = end;
            cursor = end;
        }
    }
    out.sort((a, b) => a.startMs - b.startMs);
    return { stages: out, duration: maxEnd };
};
