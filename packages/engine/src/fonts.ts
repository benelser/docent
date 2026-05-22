// Typography — loaded via Remotion's bundled Google Fonts so renders are
// deterministic and offline.
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';

export const interFamily = loadInter('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
}).fontFamily;

export const monoFamily = loadMono('normal', {
  weights: ['400', '500', '600'],
  subsets: ['latin'],
}).fontFamily;

// Handwriting — for the hand-drawn "sketch" scenes (the reasoning layer).
export const handFamily = loadCaveat('normal', {
  weights: ['500', '600', '700'],
  subsets: ['latin'],
}).fontFamily;
