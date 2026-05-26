// Ambient module shims for engine-private utilities the migrated component
// imports from `packages/engine/src/...`.
//
// Per the Phase B migration brief, `packages/engine/` is preserved during
// the rip-and-replace and `@docent/core` may NOT modify it. The
// `QuantitiesScene` component depends on a constellation of engine-private
// helpers (the `SceneFrame` chrome, the `BoundValue` tween, the `FittedText`
// helper, the `knobs.ts` palette/cadence interpreters, the `theme.ts` glow
// utility, the `fonts.ts` family constants) that have NOT yet been migrated.
//
// Until they are, the component imports them via a fixed bridge namespace
// `@docent-engine-bridge/*`. The Remotion bundler resolves the namespace via
// the `paths` mapping in `tsconfig.json`; here, we declare each module as
// opaque `any` so `tsc --noEmit` under `@docent/core`'s stricter compiler
// options (the engine's own `tsconfig.json` runs with looser settings) does
// not transitively type-check engine source files.
//
// When the supporting utilities migrate into `@docent/core`, these shims and
// the bridge imports go away; the component's import lines are the only
// thing that changes.

declare module '@docent-engine-bridge/theme' {
  export const glow: (hex: string, alpha: number) => string;
}

declare module '@docent-engine-bridge/style' {
  export type ResolvedStyle = import('@docent/kit').ResolvedStyle;
}

declare module '@docent-engine-bridge/fonts' {
  export const interFamily: string;
  export const monoFamily: string;
}

declare module '@docent-engine-bridge/components/SceneFrame' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const SceneFrame: any;
}

declare module '@docent-engine-bridge/components/Narration' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Narration: any;
}

declare module '@docent-engine-bridge/components/BoundValue' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const BoundValue: any;
}

declare module '@docent-engine-bridge/components/FittedText' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const FittedText: any;
}

declare module '@docent-engine-bridge/engine/spec' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const activeBeatIndex: (beats: any, frame: number) => number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type SceneProps = any;
}

declare module '@docent-engine-bridge/engine/knobs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const cadenceOffset: (cadence: any, order: number) => number;
  export const cadenceSpringConfig: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cadence: any,
  ) => {damping: number; mass: number};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const numericRevealMap: (beats: any, count: number) => any[];
  export const paletteAccentKey: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    palette: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accent: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fallback: any,
    index: number,
  ) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const paletteGlowScale: (palette: any) => number;
  export const paletteSceneHex: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    palette: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accent: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    style: any,
  ) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type RevealEntry = {from: number; cadence: any; order: number};
}
