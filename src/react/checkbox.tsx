// <ScreeanCheckbox/> — React wrapper over the headlessCheckbox factory.
//
// `checked` is tier-2: synced through setChecked (compare-first). The
// factory echoes onChange on programmatic writes, so a genuine controlled
// update fires ONE onChange with the applied value — React's same-value
// setState bail keeps that from looping.

import { useEffect, useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessCheckbox } from '../components/headless';
import type { CheckboxComponent, HeadlessCheckboxOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanCheckboxHandle = CheckboxComponent;

export type ScreeanCheckboxProps = Prettify<
  Omit<HeadlessCheckboxOpts, 'screen' | 'onChange'> & {
    onChange?: (checked: boolean) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanCheckboxHandle | null>;
  }
>;

export const ScreeanCheckbox = ({
  onChange,
  checked,
  screen,
  ref,
  ...opts
}: ScreeanCheckboxProps): ReactNode => {
  const onChangeRef = useLatest(onChange);
  const checkedRef = useLatest(checked);
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessCheckbox({
        ...opts,
        // Seed with the CURRENT controlled value on (re)creation, not the
        // value captured when the deps last changed.
        checked: checkedRef.current,
        screen: s,
        onChange: (c) => onChangeRef.current?.(c),
      }),
    [
      opts.label,
      opts.disabled,
      opts.dissolveOnChange,
      opts.ariaLabel,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );

  // Tier-2 controlled sync. setChecked never dissolves (programmatic write).
  useEffect(() => {
    if (!handle || checked === undefined) return;
    if (handle.checked() !== checked) handle.setChecked(checked);
  }, [handle, checked]);

  useImperativeHandle(ref, () => handle as ScreeanCheckboxHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
