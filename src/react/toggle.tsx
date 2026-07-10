// <ScreeanToggle/> — React wrapper over the headlessToggle factory.
// Same tier model as ScreeanCheckbox (see checkbox.tsx for the sync notes).

import { useEffect, useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessToggle } from '../components/headless';
import type { HeadlessToggleOpts, ToggleComponent } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanToggleHandle = ToggleComponent;

export type ScreeanToggleProps = Prettify<
  Omit<HeadlessToggleOpts, 'screen' | 'onChange'> & {
    onChange?: (checked: boolean) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanToggleHandle | null>;
  }
>;

export const ScreeanToggle = ({
  onChange,
  checked,
  screen,
  ref,
  ...opts
}: ScreeanToggleProps): ReactNode => {
  const onChangeRef = useLatest(onChange);
  const checkedRef = useLatest(checked);
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessToggle({
        ...opts,
        checked: checkedRef.current,
        screen: s,
        onChange: (c) => onChangeRef.current?.(c),
      }),
    [
      opts.ariaLabel,
      opts.disabled,
      opts.dissolveOnChange,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );

  useEffect(() => {
    if (!handle || checked === undefined) return;
    if (handle.checked() !== checked) handle.setChecked(checked);
  }, [handle, checked]);

  useImperativeHandle(ref, () => handle as ScreeanToggleHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
