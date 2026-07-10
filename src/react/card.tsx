// <ScreeanCard/> — React wrapper over the headlessCard factory.
//
// Children are React nodes portaled INTO the factory's real element — real
// DOM inside `el`, so the rasterizer captures them exactly as painted (the
// whole point of DOM-first composition). The portal renders one paint after
// the creation effect; that's inherent, don't fight it.

import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { headlessCard } from '../components/headless';
import type { ElementComponent, HeadlessCardOpts } from '../components/headless';
import type { Prettify, ScreenController } from '../components/transition';
import { HOST_STYLE } from './constant';
import { depKeyOf, useHeadless, useLatest } from './useHeadless';

export type ScreeanCardHandle = ElementComponent<HTMLDivElement, 'none'>;

export type ScreeanCardProps = Prettify<
  Omit<HeadlessCardOpts, 'screen' | 'onClick' | 'children'> & {
    /** React children — portaled into the card's real element. */
    children?: ReactNode;
    onClick?: (e: MouseEvent) => void;
    screen?: ScreenController;
    ref?: Ref<ScreeanCardHandle | null>;
  }
>;

export const ScreeanCard = ({
  children,
  onClick,
  screen,
  ref,
  ...opts
}: ScreeanCardProps): ReactNode => {
  const onClickRef = useLatest(onClick);
  // Presence of onClick is STRUCTURAL (the factory wires cursor + listener
  // only when given a handler) — identity changes stay tier-1.
  const hasClick = onClick !== undefined;
  const { hostRef, handle } = useHeadless(
    (s) =>
      headlessCard({
        ...opts,
        screen: s,
        onClick: hasClick ? (e) => onClickRef.current?.(e) : undefined,
      }),
    [
      hasClick,
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
  useImperativeHandle(ref, () => handle as ScreeanCardHandle, [handle]);
  return (
    <span ref={hostRef} style={HOST_STYLE}>
      {handle ? createPortal(children, handle.el) : null}
    </span>
  );
};
