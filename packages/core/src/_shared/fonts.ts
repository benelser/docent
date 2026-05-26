// Typography — Inter (chrome / prose) + JetBrainsMono (code / kicker).
//
// Loaded via Remotion's bundled Google Fonts so renders are deterministic
// and offline. Mirrors `packages/engine/src/fonts.ts` (subset — only the
// two families every scene chrome consumes; serif and handwriting
// families live on the resolved style's typography tokens for the scenes
// that need them).

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
