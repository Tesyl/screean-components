// <ScreeanLabel/> — React wrapper over the headlessLabel factory.

import { useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessLabel } from '../components/headless';
import type { ElementComponent, HeadlessLabelOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless } from './useHeadless';

export type ScreeanLabelHandle = ElementComponent<HTMLElement, 'heading' | 'text'>;

export type ScreeanLabelProps = Prettify<
  Omit<HeadlessLabelOpts, 'screen'> & {
    screen?: ScreenController;
    ref?: Ref<ScreeanLabelHandle | null>;
  }
>;

export const ScreeanLabel = ({ screen, ref, ...opts }: ScreeanLabelProps): ReactNode => {
  const { hostRef, handle } = useHeadless(
    (s) => headlessLabel({ ...opts, screen: s }),
    [
      opts.text,
      opts.heading,
      opts.disabled,
      opts.ariaLabel,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );
  useImperativeHandle(ref, () => handle as ScreeanLabelHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
