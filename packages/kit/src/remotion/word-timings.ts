// useBeatWordTimings — R5 render-side hook.
//
// Surfaces the per-beat frame-quantised word timings inlined by the CLI's
// render-entry generator into the kit's module-scoped TtsAudioMap.
// A scene component (or a feature that wraps scenes) calls
// `useBeatWordTimings(sceneIndex, beatIndex)` to retrieve the words for
// the active beat; absence returns `null` and the consumer falls through
// to its static path (no regression for films whose providers don't supply
// alignment).
//
// Browser-safe — no node imports; pure React.

import {createContext, useContext, useMemo} from 'react';

import type {WordTiming} from '../types/tts';
import type {TtsAudioMap} from './schedule';

/**
 * Context the kit's composition wraps `<DocentFilm>` in. Carries the
 * full inlined `TtsAudioMap` so any consumer (a scene component, a
 * wrap-scenes feature) can ask for a slot's words via the hook below.
 * Defaults to `undefined` — without a provider the hook returns `null`.
 */
export const TtsAudioMapContext = createContext<TtsAudioMap | undefined>(
  undefined,
);

/**
 * The render-side R5 hook. Returns the frame-quantised word timings for
 * a beat, or `null` when the inlined map carries none — the gracefully-
 * degraded baseline that lets a karaoke consumer (passage scene reveal,
 * R8 music choreography) fall through to its static path without
 * branching outside the hook.
 *
 * Stable across re-renders for the same `(sceneIndex, beatIndex)` — the
 * memoised result is a frozen array reference, so a downstream
 * `useMemo`/`useEffect` keyed on `words` does NOT thrash.
 */
export const useBeatWordTimings = (
  sceneIndex: number,
  beatIndex: number,
): ReadonlyArray<WordTiming> | null => {
  const map = useContext(TtsAudioMapContext);
  return useMemo(() => {
    if (!map) return null;
    const key = `${sceneIndex}-${beatIndex}` as const;
    // `TtsAudioMap`'s index signature uses a template-literal key, which
    // is not assignable from a plain `string` Record. Cast to `unknown`
    // first so the conversion compiles under `exactOptionalPropertyTypes`.
    const slot = (map as unknown as Record<
      string,
      {words?: ReadonlyArray<WordTiming>}
    >)[key];
    const words = slot?.words;
    if (!words || words.length === 0) return null;
    return words;
  }, [map, sceneIndex, beatIndex]);
};
