// Local font loaders — mirror of packages/engine/src/fonts.ts (subset).
//
// Inter for chrome / Card labels; JetBrains Mono for code, tags, and the
// scene chrome's mono accents. Loaded via @remotion/google-fonts so renders
// are deterministic and offline.
//
// At integration, the integrator replaces this with a single shared import
// in @docent/core/_shared/fonts.

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
