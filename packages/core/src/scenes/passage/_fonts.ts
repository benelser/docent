// Local font loaders — mirror of packages/engine/src/fonts.ts (subset).
//
// Only the families the passage scene actually uses (inter for chrome
// labels, mono for the optional "primary source · read in full" caption
// and the SceneFrame's kicker). Loaded via @remotion/google-fonts so
// renders are deterministic and offline.
//
// Note: the passage scene reads its serif, sans, and mono families
// THROUGH the resolved style tokens (`style.tokens.typography.family.*`)
// — those are owned by the active preset, not by this scene. The font
// loaders here exist so the local SceneFrame chrome can fall back to
// the Inter/JetBrainsMono families the engine ships by default.
//
// At integration, the integrator replaces this with a single shared
// import in @docent/core/_shared/fonts.

import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

export const interFamily = loadInter('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
}).fontFamily;

export const monoFamily = loadMono('normal', {
  weights: ['400', '500', '600'],
  subsets: ['latin'],
}).fontFamily;
