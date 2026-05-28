// epigraph — depth rules.
//
// `epigraph-on-point` — the quote must look like a quoted passage with a real
// attribution span. The regex floor: the attribution must carry a proper-
// noun-shaped source span (a Capitalized word, optionally followed by a year
// or work title). A bare attribution with no source span ('Anon.', 'A
// reader', 'Someone') is rejected. The judge (Layer 3) catches the harder
// case: does the rest of the film argue WITH the quote, or merely decorate
// FROM it.
//
// Migrated from `packages/engine/cli/depthcheck.ts` — the `epigraph-on-point`
// block in the rhetorical-primitive depth contracts section.

import type {DepthFinding, DepthRule, Scene} from '@bjelser/kit';

interface EpigraphScene extends Scene {
  type: 'epigraph';
  quote?: string;
  attribution?: string;
}

const epigraphOnPoint: DepthRule<EpigraphScene> = {
  id: 'epigraph-on-point',
  description:
    'Epigraph on point — the quote is a real cited passage and the attribution names a source span',
  severity: 'warning',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const path =
      ctx.sceneIndex !== undefined
        ? `scenes[${ctx.sceneIndex}]`
        : 'scenes[*]';

    const quote = (scene.quote ?? '').trim();
    const attribution = (scene.attribution ?? '').trim();

    // The attribution span — a Capitalized name or a Capitalized work
    // title, optionally with a year. Examples that PASS:
    //   "Karl Popper, 1934"
    //   "Aristotle, Metaphysics"
    //   "The Federalist Papers, 1788"
    // Examples that FAIL:
    //   "Anonymous"      (no proper noun span)
    //   "A friend"       (no proper noun span)
    //   "1934"           (year alone — no source)
    const PROPER_SPAN = /\b[A-Z][a-zA-Z'’\-]{2,}/;
    const YEAR = /\b\d{3,4}\b/;
    const hasProperSpan = PROPER_SPAN.test(attribution);
    const hasSomething = hasProperSpan || YEAR.test(attribution);
    const quoteWords = quote.split(/\s+/).filter(Boolean).length;
    const quoteOk = quote.length > 0 && quoteWords >= 4 && quoteWords <= 60;
    const ok = quoteOk && hasSomething && hasProperSpan;

    if (ok) return null;

    const message = !quote
      ? 'epigraph has no quote'
      : quoteWords < 4
        ? `quote is ${quoteWords} word(s) — too short to read as a cited passage; expand it or drop the epigraph`
        : quoteWords > 60
          ? `quote is ${quoteWords} words — keep epigraphs to ≤ 60 words (the typographic register is a small breath)`
          : !hasProperSpan
            ? `attribution "${attribution}" has no proper-noun source span — a bare attribution ("Anon.", "A reader") fails the depth contract; name the source`
            : 'epigraph fails the depth contract';

    return {
      ruleId: 'epigraph-on-point',
      path,
      message,
      severity: 'warning',
      suggestion:
        'Name the source span: a Capitalized author/work and (ideally) a year — e.g. "Karl Popper, 1934", "Aristotle, Metaphysics".',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<EpigraphScene>> = [
  epigraphOnPoint,
];
