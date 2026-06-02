// Published entry for the six-ink GPU hero/background.
//
// The implementation currently lives at site/experiments/sixShowcaseInk.ts
// (where it's also the live dev-preview experiment). This entry re-exports its
// public surface so the bundled package is self-contained — the lib build
// bundles the hero + its loaders + the glTF asset into dist, so the on-disk
// source location is irrelevant to consumers.
export {
  mount,
  type SixColorway,
  type SixInkOptions,
  type SixInkHandle,
  type SixInkControlKey,
  type SixInkControlMeta,
  type SixInkChromeFlags,
} from '../../site/experiments/sixShowcaseInk'
