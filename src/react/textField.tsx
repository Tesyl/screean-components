// <ScreeanTextField/> — React wrapper over the headlessTextField factory.
//
// "Loosely controlled while editing": the tier-2 `value` sync is SKIPPED
// while the field has focus — writing el.value under the user's caret
// clobbers the caret/IME composition. External value drives apply once the
// field blurs (or when unfocused). onInput reports per keystroke; onCommit
// at settle (blur / Enter).

import { useEffect, useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessTextField } from '../components/headless';
import type { HeadlessTextFieldOpts, TextFieldComponent } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanTextFieldHandle = TextFieldComponent;

export type ScreeanTextFieldProps = Prettify<
  Omit<HeadlessTextFieldOpts, 'screen' | 'onInput' | 'onCommit'> & {
    onInput?: (value: string) => void;
    onCommit?: (value: string) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanTextFieldHandle | null>;
  }
>;

export const ScreeanTextField = ({
  onInput,
  onCommit,
  value,
  screen,
  ref,
  ...opts
}: ScreeanTextFieldProps): ReactNode => {
  const onInputRef = useLatest(onInput);
  const onCommitRef = useLatest(onCommit);
  const valueRef = useLatest(value);
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessTextField({
        ...opts,
        value: valueRef.current,
        screen: s,
        onInput: (v) => onInputRef.current?.(v),
        onCommit: (v) => onCommitRef.current?.(v),
      }),
    [
      opts.ariaLabel,
      opts.placeholder,
      opts.disabled,
      opts.dissolveOnCommit,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );

  // Tier-2 controlled sync — skipped while focused (see header note).
  useEffect(() => {
    if (!handle || value === undefined) return;
    if (document.activeElement === handle.el) return;
    if (handle.value() !== value) handle.setValue(value);
  }, [handle, value]);

  useImperativeHandle(ref, () => handle as ScreeanTextFieldHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
