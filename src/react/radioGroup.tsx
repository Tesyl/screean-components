// <ScreeanRadioGroup/> — React wrapper over the createRadioGroup factory.
//
// `options` is tier-3 and JSON-compared (depKeyOf) so an inline array
// literal doesn't recreate the group every render — content changes do.
// `value` is tier-2 through group.select(): compare-first against
// selected(); note select() echoes the group onChange on programmatic
// writes (siblings un-check without dissolving; nothing dissolves on sync).

import { useEffect, useImperativeHandle, type Ref, type ReactNode } from 'react';
import { createRadioGroup } from '../components/headless';
import type { RadioGroup, RadioGroupOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanRadioGroupHandle = RadioGroup;

export type ScreeanRadioGroupProps = Prettify<
  Omit<RadioGroupOpts, 'screen' | 'onChange'> & {
    /** Selected radio's `value`. Tier-2: synced via group.select(). */
    value?: string;
    onChange?: (value: string) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanRadioGroupHandle | null>;
  }
>;

export const ScreeanRadioGroup = ({
  value,
  onChange,
  screen,
  ref,
  ...opts
}: ScreeanRadioGroupProps): ReactNode => {
  const onChangeRef = useLatest(onChange);
  const valueRef = useLatest(value);
  const { hostRef, handle } = useHeadless(
    (s) => {
      // Seed the controlled selection through the options' checked flags —
      // select() would echo onChange during mount.
      const seeded =
        valueRef.current === undefined
          ? opts.options
          : opts.options.map((o) => ({ ...o, checked: o.value === valueRef.current }));
      return createRadioGroup({
        ...opts,
        options: seeded,
        screen: s,
        onChange: (v) => onChangeRef.current?.(v),
      });
    },
    [depKeyOf(opts.options), opts.dissolveOnSelect],
    screen,
  );

  // Tier-2 controlled sync — select() never dissolves (programmatic write).
  useEffect(() => {
    if (!handle || value === undefined) return;
    if (handle.selected() !== value) handle.select(value);
  }, [handle, value]);

  useImperativeHandle(ref, () => handle as ScreeanRadioGroupHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
