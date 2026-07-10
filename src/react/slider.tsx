// <ScreeanSlider/> — React wrapper over the headlessSlider factory.
//
// `value` is tier-2, compare-first against the CLAMPED target: an
// out-of-range prop (value=150, max=100) clamps inside the factory, and
// comparing against the raw prop would re-sync + echo onChange on every
// value-prop render. min/max/step are tier-3 (the factory bakes them into
// its pointer/keyboard math at creation).

import { useEffect, useImperativeHandle, type Ref, type ReactNode } from 'react';
import { clampToStep, headlessSlider } from '../components/headless';
import type { HeadlessSliderOpts, SliderComponent } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { SLIDER_MAX, SLIDER_MIN, SLIDER_STEP } from '../components/headless/constant';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanSliderHandle = SliderComponent;

export type ScreeanSliderProps = Prettify<
  Omit<HeadlessSliderOpts, 'screen' | 'onChange'> & {
    onChange?: (value: number) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanSliderHandle | null>;
  }
>;

export const ScreeanSlider = ({
  onChange,
  value,
  screen,
  ref,
  ...opts
}: ScreeanSliderProps): ReactNode => {
  const onChangeRef = useLatest(onChange);
  const valueRef = useLatest(value);
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessSlider({
        ...opts,
        value: valueRef.current,
        screen: s,
        onChange: (v) => onChangeRef.current?.(v),
      }),
    [
      opts.min,
      opts.max,
      opts.step,
      opts.disabled,
      opts.ariaLabel,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );

  // Tier-2 controlled sync — clamp-compared (see header note). setValue
  // echoes onChange when the committed value actually changes.
  useEffect(() => {
    if (!handle || value === undefined) return;
    const target = clampToStep(
      value,
      opts.min ?? SLIDER_MIN,
      opts.max ?? SLIDER_MAX,
      opts.step ?? SLIDER_STEP,
    );
    if (handle.value() !== target) handle.setValue(target);
  }, [handle, value, opts.min, opts.max, opts.step]);

  useImperativeHandle(ref, () => handle as ScreeanSliderHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
