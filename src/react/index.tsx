// React binding for the six-ink hero. Mounts the vanilla engine into a div on
// mount and tears it down on unmount; exposes the live control handle via
// `onReady` so a host menu can drive the animation (setControl / getControls).
//
// The component renders ONLY a host div — style it via `className` (the embed
// contract for theGreenRoom: `fixed inset-0 z-0`, plus pointer-events per
// whether the scene should be interactive). `fill: 'container'` is forced so
// the engine fills this div rather than the viewport.
import { useEffect, useRef } from 'react'
import { mount, type SixInkOptions, type SixInkHandle } from '../hero'

export type SixInkBackgroundProps = {
  /** Engine options. `fill` is always overridden to 'container'. */
  options?: SixInkOptions
  /** Class for the host div — own the fixed/inset/z-index/pointer-events here. */
  className?: string
  /** Receives the live control handle once mounted (for a host control menu). */
  onReady?: (handle: SixInkHandle) => void
}

export function SixInkBackground({ options, className, onReady }: SixInkBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Keep the latest callback without re-running the mount effect.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const handle = mount(el, { ...options, fill: 'container' })
    onReadyRef.current?.(handle)
    return () => handle.dispose()
    // Mount once. Post-mount option changes go through the handle, not a
    // remount — re-running this would spin a fresh WebGPU world every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} className={className} aria-hidden />
}
