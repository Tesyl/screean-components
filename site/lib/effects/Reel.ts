// Reel — a step-cycler primitive. Owns timing, looping, scrubbing, and rate
// scaling; emits callbacks for the consumer to update UI (label, code panel,
// progress bar, step list highlight).
//
// Why a class over the per-section setTimeout dances: the CHOREOGRAPHY reel,
// the upcoming Text Morph reel, the planned Field Algebra + Layout Migration
// + Force Symphony reels all share the same plumbing. Wrapping it once
// shrinks each new reel to "define steps + wire onStep UI updates." Each
// new reel becomes ~50 lines instead of ~250.
//
// Lifecycle:
//
//   const reel = new Reel({
//     steps: [{ label: 'A', ms: 800, enter: (ctx) => { ... } }, ...],
//     ctx: { stage, w, h },
//     onStep: (idx, step) => updateUI(idx, step),
//     onProgress: (frac) => progressBar.style.transform = `scaleX(${frac})`,
//   });
//   reel.play();         // start auto-advance loop
//   reel.pause();        // halt — onProgress stops, timer cleared
//   reel.scrub(2);       // jump to step 2 (fires enter + onStep)
//   reel.setRate(2.0);   // step durations are now ms / 2
//   reel.dispose();      // pause + mark disposed; subsequent calls no-op
//
// Generic over `Ctx` so each reel can pass its own context object (Stage,
// canvas dims, etc.) into `enter` without leaking through closures.

export type ReelStep<Ctx = void> = {
  // Display name. Reels render this as the dramatic step label.
  label: string;
  // One-line description. Shown alongside the label.
  hint: string;
  // Step duration before auto-advance, in milliseconds (pre-rate).
  ms: number;
  // Optional API-call snippet. Reels with a code panel show this.
  code?: string;
  // Side effect: trigger the visual transition. Receives the reel's ctx
  // object so the function can stay declarative (no closure magic).
  enter: (ctx: Ctx) => void;
};

export type ReelOpts<Ctx = void> = {
  steps: ReadonlyArray<ReelStep<Ctx>>;
  // Context passed to every step's `enter`. Use `undefined` for steps that
  // capture their own state via closure.
  ctx: Ctx;
  // Loop after the last step? Default true. Set false for one-shot reels
  // that should stop on completion.
  loop?: boolean;
  // Index to start from. Default 0.
  startAt?: number;
  // Initial rate multiplier. Step durations are `ms / rate`. Default 1.0.
  rate?: number;
  // Fired exactly once per step transition (after enter() runs). UI hooks
  // here update the active label, code panel, step-list highlight, etc.
  onStep?: (idx: number, step: ReelStep<Ctx>) => void;
  // Fired on every animation frame while a step is in progress with the
  // step's elapsed fraction (0..1). UI hooks here drive the progress bar.
  // Omit if you don't need a progress UI — RAF won't run unless this is
  // provided.
  onProgress?: (frac: number, idx: number) => void;
  // Fired when a non-looping reel reaches the end of its last step.
  onComplete?: () => void;
};

export class Reel<Ctx = void> {
  private readonly steps: ReadonlyArray<ReelStep<Ctx>>;
  private readonly ctx: Ctx;
  private readonly loop: boolean;
  private readonly onStep?: (idx: number, step: ReelStep<Ctx>) => void;
  private readonly onProgress?: (frac: number, idx: number) => void;
  private readonly onComplete?: () => void;

  private rate: number;
  private currentIdx: number;
  private paused = true;
  private startedAt = 0;
  private duration = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private disposed = false;

  constructor(opts: ReelOpts<Ctx>) {
    this.steps = opts.steps;
    this.ctx = opts.ctx;
    this.loop = opts.loop ?? true;
    this.rate = opts.rate ?? 1.0;
    this.currentIdx = opts.startAt ?? 0;
    this.onStep = opts.onStep;
    this.onProgress = opts.onProgress;
    this.onComplete = opts.onComplete;
  }

  // ---- Public API --------------------------------------------------------

  play(): void {
    if (this.disposed) return;
    this.paused = false;
    this.runStep(this.currentIdx);
  }

  pause(): void {
    this.paused = true;
    this.clearPending();
  }

  isPaused(): boolean {
    return this.paused;
  }

  // Jump to a specific step index. Fires `enter` + `onStep`. If the reel
  // was playing, continues playing from the new index; if paused, stays
  // paused but renders the new step.
  scrub(idx: number): void {
    if (this.disposed) return;
    if (idx < 0 || idx >= this.steps.length) return;
    this.clearPending();
    this.runStep(idx);
  }

  // Update rate multiplier. If currently playing, recomputes the remaining
  // time on the current step so the rate change feels immediate (rather
  // than only kicking in at the next step boundary).
  setRate(rate: number): void {
    if (this.disposed || rate <= 0) return;
    this.rate = rate;
    if (this.paused || this.timer === null) return;
    const elapsed = Date.now() - this.startedAt;
    const elapsedFrac = Math.min(1, elapsed / this.duration);
    const newDuration = this.steps[this.currentIdx].ms / this.rate;
    this.duration = newDuration;
    this.startedAt = Date.now() - elapsedFrac * newDuration;
    clearTimeout(this.timer);
    const remaining = Math.max(0, (1 - elapsedFrac) * newDuration);
    this.timer = setTimeout(() => this.advance(), remaining);
  }

  // Read-only views.
  index(): number { return this.currentIdx; }
  step(): ReelStep<Ctx> { return this.steps[this.currentIdx]; }
  length(): number { return this.steps.length; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = true;
    this.clearPending();
  }

  // ---- Internals ---------------------------------------------------------

  // Run the step at `idx`: side-effect (enter), notify (onStep), schedule
  // progress RAF + advance timer. Called by play/scrub/advance.
  private runStep(idx: number): void {
    if (this.disposed) return;
    this.currentIdx = idx;
    const step = this.steps[idx];
    step.enter(this.ctx);
    this.onStep?.(idx, step);

    this.duration = step.ms / this.rate;
    this.startedAt = Date.now();

    if (this.onProgress) {
      const tickProg = (): void => {
        if (this.paused || this.disposed) return;
        const elapsed = Date.now() - this.startedAt;
        const frac = Math.max(0, Math.min(1, elapsed / this.duration));
        this.onProgress!(frac, this.currentIdx);
        this.raf = requestAnimationFrame(tickProg);
      };
      this.raf = requestAnimationFrame(tickProg);
    }

    if (!this.paused) {
      this.timer = setTimeout(() => this.advance(), this.duration);
    }
  }

  // Move to the next step or wrap/stop based on `loop`.
  private advance(): void {
    if (this.disposed || this.paused) return;
    const next = this.currentIdx + 1;
    if (next >= this.steps.length) {
      if (this.loop) {
        this.runStep(0);
      } else {
        this.paused = true;
        this.onComplete?.();
      }
    } else {
      this.runStep(next);
    }
  }

  private clearPending(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.raf !== 0) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }
}
