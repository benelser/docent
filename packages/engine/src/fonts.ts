// Typography — loaded via Remotion's bundled Google Fonts so renders are
// deterministic and offline.
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';
import {loadFont as loadSourceSerif} from '@remotion/google-fonts/SourceSerif4';

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

// Serif — the editorial / paper register: longform prose, academic figures.
// Source Serif 4 is the Google Fonts successor of Adobe's Source Serif Pro.
export const serifFamily = loadSourceSerif('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
}).fontFamily;
