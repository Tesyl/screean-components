// <ScreeanImage/> — React wrapper over the headlessImage factory.

import { useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessImage } from '../components/headless';
import type { ElementComponent, HeadlessImageOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless } from './useHeadless';

export type ScreeanImageHandle = ElementComponent<HTMLImageElement, 'img'>;

export type ScreeanImageProps = Prettify<
  Omit<HeadlessImageOpts, 'screen'> & {
    screen?: ScreenController;
    ref?: Ref<ScreeanImageHandle | null>;
  }
>;

export const ScreeanImage = ({ screen, ref, ...opts }: ScreeanImageProps): ReactNode => {
  const { hostRef, handle } = useHeadless(
    (s) => headlessImage({ ...opts, screen: s }),
    [
      opts.src,
      opts.alt,
      opts.width,
      opts.height,
      opts.disabled,
      opts.ariaLabel,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );
  useImperativeHandle(ref, () => handle as ScreeanImageHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
