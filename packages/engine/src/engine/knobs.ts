// Intent-knob interpretation — the engine's reading of the semantic dials an
// author sets on a film. The *contract* (the closed enums) lives in spec.ts,
// schema/film.schema.json, and cli/validate.ts; this module is the engine's
// *interpretation* of three of them: `cadence`, `palette`, `treatment`.
//
// Every helper here is a pure function whose default branch reproduces the
// engine's pre-knob behaviour exactly — a film that sets none of these knobs
// renders byte-identically to before any of this existed.

import {spring} from 'remotion';
import type {Beat, Scene} from './spec';
import {ACCENTS, type AccentKey} from '../theme';

// ----- cadence — the rhythm with which a beat's revealed items enter --------
//
// A beat may reveal a *set* of items (StructureScene's nodes/edges, or the
// numeric `reveal` count the list scenes read). `cadence` shapes how that set
// arrives:
//   together (default) — every revealed item shares the beat's start frame;
//                         this is the engine's original behaviour.
//   cascade            — each item's entrance is staggered by CASCADE_STEP
//                         frames in declared order, so the set unrolls.
//   snap               — all items enter together (like `together`) but on a
//                         sharper, lower-mass spring, so they arrive crisper.
//
// The reveal *content* never changes — only the per-item entrance frame and
// the spring used to animate that entrance.

export const CASCADE_STEP = 5; // frames of stagger between cascaded items

// The per-item entrance-frame offset for the item at declared `order` within
// a beat's revealed set. `cascade` staggers; `together`/`snap` do not.
export const cadenceOffset = (
  cadence: Beat['cadence'],
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

// The spring config a revealed item's entrance uses. `snap` lowers the mass
// for a sharper arrival; every other cadence keeps the engine's original
// {damping: 200, mass: 0.7} so untouched films are unchanged.
export const cadenceSpringConfig = (
  cadence: Beat['cadence'],
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

// The eased 0..1 entrance progress for one revealed item. `enterFrame` is the
// beat's reveal frame; `order` is the item's index in the beat's declared
// reveal set (0 for the first). When `cadence` is undefined / `together` and
// `order` is 0 this is identical to the original
//   spring({frame: frame - enterFrame, fps, config: {damping: 200, mass: 0.7}})
// every list scene used — so a knob-free film is byte-identical.
export const cadenceAppear = (
  cadence: Beat['cadence'],
  frame: number,
  enterFrame: number,
  order: number,
  fps: number,
): number => {
  const local = frame - enterFrame - cadenceOffset(cadence, order);
  if (local <= 0) return 0;
  return spring({frame: local, fps, config: cadenceSpringConfig(cadence)});
};

// ----- numeric-reveal cadence (the list scenes) -----------------------------
//
// StructureScene reveals items by *id* (a string[] `reveal`); the list scenes
// (progression / compare / quantities / probe) reveal by *count* (a numeric
// `reveal` — "the first N items are visible"). The cadence interpretation is
// the same, but the per-item batch order has to be derived from the counts.
//
// A `RevealEntry` is the engine's reading of how item `index` enters: the
// frame its revealing beat starts (`from`), that beat's `cadence`, and the
// item's `order` within that beat's newly-revealed batch (0 for the batch's
// first item — so a `cascade` beat that reveals items 3,4,5 staggers them 0,
// 1, 2 regardless of how many items earlier beats revealed).
export type RevealEntry = {
  from: number;
  cadence: Beat['cadence'];
  order: number;
};

// Build, for a scene with numeric `reveal` beats, the RevealEntry of every
// item index 0..count-1. `beats` is the scene's timed beats. An item never
// reached by any beat's count gets {from: 0, cadence: undefined, order: 0} —
// exactly the engine's original `revealFrameFor` fallback.
export const numericRevealMap = (
  beats: {from: number; reveal?: Beat['reveal']; cadence?: Beat['cadence']}[],
  count: number,
): RevealEntry[] => {
  const entries: RevealEntry[] = Array.from({length: count}, () => ({
    from: 0,
    cadence: undefined,
    order: 0,
  }));
  let revealedSoFar = 0; // items revealed by all prior beats
  for (const b of beats) {
    if (typeof b.reveal !== 'number') continue;
    const upTo = Math.min(count, b.reveal);
    for (let i = revealedSoFar; i < upTo; i++) {
      entries[i] = {from: b.from, cadence: b.cadence, order: i - revealedSoFar};
    }
    if (upTo > revealedSoFar) revealedSoFar = upTo;
  }
  return entries;
};

// ----- palette — accent as meaning ------------------------------------------
//
// `palette` is a scene knob: it does not introduce colour, it *selects* over
// the existing six accents and biases the glow intensity. Each family is an
// ordered preference list over ACCENTS — when a scene declares a palette, its
// elements draw from that family's accents, and its glows scale by the
// family's `glowScale`.
//   cool   — blue / cyan / violet, restrained glow.
//   warm   — amber / rose, mid glow.
//   signal — rose-forward, high glow (the alarm palette).
//   mono   — a single accent, glow near-zero (the austere palette).
// A scene with no `palette` is untouched: every accent resolves exactly as
// `accent()` resolved it before this knob existed.

type PaletteFamily = {accents: AccentKey[]; glowScale: number};

const PALETTES: Record<NonNullable<Scene['palette']>, PaletteFamily> = {
  cool: {accents: ['blue', 'cyan', 'violet'], glowScale: 0.7},
  warm: {accents: ['amber', 'rose'], glowScale: 1.0},
  // signal — rose leads (the alarm colour), amber is the only secondary, so a
  // signal scene reads hot. High glow: this palette is meant to draw the eye.
  signal: {accents: ['rose', 'amber'], glowScale: 1.35},
  // mono — one accent, glow near-zero: the austere, flat palette.
  mono: {accents: ['blue'], glowScale: 0.12},
};

// The glow-intensity multiplier a scene's palette implies. 1 (the identity)
// when no palette is set — so untouched scenes keep their exact glow.
export const paletteGlowScale = (palette: Scene['palette']): number =>
  palette ? PALETTES[palette].glowScale : 1;

// Resolve an accent *key* under a scene's palette. Without a palette this is
// the identity — `key` (or the scene default) is returned unchanged, so the
// caller's existing `accent()` lookup is byte-identical.
//
// With a palette, the family biases selection. `index` lets a scene spread a
// set of elements across the family (node 0 → family[0], node 1 → family[1],
// …, wrapping); the scene's own declared accent still wins for index 0 when
// it already falls inside the family, so an author's explicit choice is kept.
export const paletteAccentKey = (
  palette: Scene['palette'],
  sceneAccent: string,
  ownAccent: string | undefined,
  index = 0,
): string => {
  // No palette — identity: the element's own accent, else the scene's.
  if (!palette) return ownAccent ?? sceneAccent;
  const fam = PALETTES[palette].accents;
  // An element that names its own in-family accent keeps it — authorial
  // intent is never overridden, the palette only fills the unset.
  if (ownAccent && fam.includes(ownAccent as AccentKey)) return ownAccent;
  return fam[((index % fam.length) + fam.length) % fam.length];
};

// The resolved accent *hex* for the scene as a whole under its palette. Used
// for the scene's chrome (SceneFrame light, kicker). Without a palette this is
// exactly `accent(scene.accent)`.
export const paletteSceneHex = (
  palette: Scene['palette'],
  sceneAccent: string,
): string => {
  const key = paletteAccentKey(palette, sceneAccent, sceneAccent, 0);
  return (ACCENTS as Record<string, string>)[key] ?? ACCENTS.blue;
};
