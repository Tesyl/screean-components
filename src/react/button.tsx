// <ScreeanButton/> — React wrapper over the headlessButton factory.
//
// NOTE: `style` is the factory contract (Partial<CSSStyleDeclaration>), NOT
// React.CSSProperties — numeric values would stringify unitless through
// applyStyles. Same for every wrapper in this module.

import { useImperativeHandle, type Ref, type ReactNode } from 'react';
import { headlessButton } from '../components/headless';
import type { ElementComponent, HeadlessButtonOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanButtonHandle = ElementComponent<HTMLButtonElement, 'button'>;

export type ScreeanButtonProps = Prettify<
  Omit<HeadlessButtonOpts, 'screen' | 'onClick'> & {
    /** Tier 1 — latest-ref routed; a new inline arrow never recreates. */
    onClick?: (e: MouseEvent) => void;
    /** Explicit controller override — beats <ScreenProvider> context. */
    screen?: ScreenController;
    /** Imperative handle: dissolve() / swapTo() / isTransitioning() / el. */
    ref?: Ref<ScreeanButtonHandle | null>;
  }
>;

export const ScreeanButton = ({
  onClick,
  screen,
  ref,
  ...opts
}: ScreeanButtonProps): ReactNode => {
  const onClickRef = useLatest(onClick);
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessButton({
        ...opts,
        screen: s,
        onClick: (e) => onClickRef.current?.(e),
      }),
    [
      opts.label,
      opts.disabled,
      opts.dissolveOnActivate,
      opts.ariaLabel,
      opts.unstyled,
      opts.className,
      depKeyOf(opts.style),
      opts.particleCount,
    ],
    screen,
  );
  useImperativeHandle(ref, () => handle as ScreeanButtonHandle, [handle]);
  return <span ref={hostRef} style={HOST_STYLE} />;
};
