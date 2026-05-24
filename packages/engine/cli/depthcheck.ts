// depthcheck — a machine-checkable depth contract over a film spec.
//
// The depth-review audits (analysis/depth-review-*.md) found that docent films
// drift to "admire, not interrogate" because the depth bar lives only as prose
// in the brief. depthcheck makes the bar mechanical: a spec that lacks a risk
// node, a quantified claim, a failure-modes scene, or a verdict that
// adjudicates fails the contract.
//
// This is the cheap, deterministic gate — Layer 2 of depth enforcement. It
// catches the mechanical misses; the depth-review sub-agent (shipped in the
// docent-agent APM package) is the second, judgement-based gate that catches
// the subtle ones ("this verdict restates, it does not rule").

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {paths} from './paths';
import {parseTimelineDate} from '../src/engine/time';

// tree scenes — a recursive node carrying optional children. The depthcheck
// only needs to know the shape; the engine's TreeNode owns the full type.
type DepthTreeNode = {id?: string; label?: string; children?: DepthTreeNode[]};

type Spec = {
  meta: {prompt?: string; id?: string};
  scenes: {
    type: string;
    statement?: string;
    nodes?: {kind?: string}[];
    beats: {id: string; narration: string}[];
    // prior-art scene fields — only present on `type: 'prior-art'`.
    systems?: {id: string; label: string; year?: string}[];
    dimensions?: {id: string; label: string}[];
    cells?: {system: string; dimension: string; mark: 'same' | 'diverges'; note: string}[];
    novelty?: {dimension: string; statement: string};
    // timeline scene fields — only present on `type: 'timeline'`.
    axis?: {start: string; end: string; ticks?: string[]};
    events?: {id: string; date: string; label: string}[];
    spans?: {id: string; from: string; to: string; label: string}[];
    // tree scene fields — only present on `type: 'tree'`.
    root?: DepthTreeNode;
    // map scene fields — only present on `type: 'map'`.
    regions?: {id: string; label: string; sub?: string}[];
    // journey-map scene fields — only present on `type: 'journey-map'`.
    journeyStages?: {
      id: string;
      label: string;
      emotion: string;
      curveValue: number;
      touchpoints?: string[];
      painPoints?: string[];
    }[];
  }[];
};

export type DepthFinding = {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

// Narration spells numbers for the voice ("forty-three percent"), so these
// patterns look for quantity *signals*, not just digits.
const QUANTIFIED =
  /(\bpercent\b|\d+\s?%|\bO\(|\border[ -]?log|\blog[ -]?n\b|\bquorum\b|\bhalved\b|\bdoubled\b|\bbig[- ]?o\b|\b\d{2,}\b)/i;
const FAILURE =
  /\b(fails?|failure|breaks?|panics?|race|stale|at-least-once|duplicat|deadlock|crash|leak|weird input|edge case|rollback|back[- ]?pressure|unbounded|exhaust|partition|timeout|regress)\b/i;
const ADJUDICATION =
  /\b(approve|needs[- ]work|disposition|the real risk|residual risk|i would|i'd watch|before (i|merge)|reservation|the verdict)\b/i;
const TRADEOFF =
  /\b(trade[- ]?off|chose .{1,48} over|instead of|rejected|at the cost of|gives up|pays? for|the bill)\b/i;
const SCORECARD =
  /\b(fragil|weak|limit|when not to|the cost|caveat|shortcoming|cannot|breaks down|not the right)\b/i;

const isPr = (s: Spec): boolean => /pr|pull request/i.test(s.meta.prompt ?? '');
const isExplainer = (s: Spec): boolean => /explain/i.test(s.meta.prompt ?? '');

// big-idea contract: ≤ 20 words, ends with a period, no filler opening.
const BIG_IDEA_FILLER = /^\s*(this is|it is)\b/i;
const BIG_IDEA_GRANDFATHERED = new Set([
  'euclid-primes',
  'linear-algebra',
  'stopping-by-woods',
]);
// AR mode — the hyphenated string the cascade emits and the new AR contract
// triggers on. A non-PR, non-AR film (an `explainer`) does not get the
// prior-art depth checks: it is not arguing against a lineage.
const isAr = (s: Spec): boolean => /^architecture[- ]review$/i.test((s.meta.prompt ?? '').trim());

// Reject evaluative novelty statements — the trap the brief calls out:
// "X is better than Y" is a fail; "X is a runtime decision, Y was
// admission-time" is a pass. This pattern looks for the verdict-shaped
// vocabulary that betrays an evaluation, not a dimensional difference.
const EVALUATIVE_NOVELTY =
  /\b(better|worse|best|worst|inferior|superior|stronger|weaker|faster than|slower than|wins?\b|beats?\b|outperforms?|defeats?|the right (choice|answer)|the wrong (choice|answer))\b/i;
const narrationOf = (scenes: Spec['scenes']): string =>
  scenes.flatMap((sc) => sc.beats).map((b) => b.narration).join('  ');

export const runDepthCheck = (spec: Spec): DepthFinding[] => {
  const findings: DepthFinding[] = [];
  const narration = narrationOf(spec.scenes);
  const tensions = spec.scenes.filter((sc) => sc.type === 'tension');
  const riskNodes = spec.scenes
    .flatMap((sc) => sc.nodes ?? [])
    .filter((n) => n.kind === 'risk');

  findings.push({
    id: 'quantified',
    label: 'A quantified claim — a number, a percentage, or Big-O',
    status: QUANTIFIED.test(narration) ? 'ok' : 'warn',
    detail: QUANTIFIED.test(narration) ? 'present' : 'no real quantity in the narration — "a review without a number is a brochure"',
  });

  findings.push({
    id: 'failure-modes',
    label: 'Failure-mode language — what breaks, not only the happy path',
    status: FAILURE.test(narration) ? 'ok' : 'warn',
    detail: FAILURE.test(narration) ? 'present' : 'the narration never names a failure mode',
  });

  findings.push({
    id: 'tension-scene',
    label: isPr(spec) ? 'A tension verdict scene' : 'A tension failure-modes / trade-offs scene',
    status: tensions.length > 0 ? 'ok' : 'fail',
    detail: tensions.length > 0
      ? `${tensions.length} tension scene(s) — the reasoning layer`
      : 'no tension scene — the reasoning layer is missing',
  });

  if (isPr(spec)) {
    findings.push({
      id: 'risk-node',
      label: 'A named risk node (kind: "risk")',
      status: riskNodes.length > 0 ? 'ok' : 'fail',
      detail: riskNodes.length > 0
        ? `${riskNodes.length} risk node(s)`
        : 'no node flags a risk the PR did not resolve',
    });
    const verdictText = narrationOf(tensions);
    findings.push({
      id: 'adjudication',
      label: 'A verdict that adjudicates — a disposition and a residual risk',
      status: ADJUDICATION.test(verdictText) ? 'ok' : 'fail',
      detail: ADJUDICATION.test(verdictText)
        ? 'the verdict reaches a disposition'
        : 'the closing scene summarizes but does not rule',
    });
  } else {
    findings.push({
      id: 'tradeoff',
      label: 'A named trade-off — "chose X over Y; X costs Z"',
      status: TRADEOFF.test(narration) ? 'ok' : 'fail',
      detail: TRADEOFF.test(narration)
        ? 'present'
        : 'no trade-off or rejected alternative is named — the line between a tour and a review',
    });
    const closing = spec.scenes
      .filter((sc) => sc.type === 'recap' || sc.type === 'tension')
      .slice(-1);
    findings.push({
      id: 'scorecard',
      label: 'An honest closing scorecard — names a fragility, not only praise',
      status: SCORECARD.test(narrationOf(closing)) ? 'ok' : 'warn',
      detail: SCORECARD.test(narrationOf(closing))
        ? 'the close names a limit or fragility'
        : 'the close reads as unqualified praise',
    });

    // AR-mode-only — the prior-art depth contract. A non-AR explainer is not
    // arguing against a lineage, so this section is skipped for it. For AR
    // films the prior-art scene must exist (the structural validator already
    // caught that), name a real novelty dimension among its own dimensions,
    // and the novelty statement must be DIMENSIONAL — never evaluative.
    if (isAr(spec)) {
      const priorArt = spec.scenes.find((sc) => sc.type === 'prior-art');
      if (priorArt) {
        const dimensionIds = (priorArt.dimensions ?? []).map((d) => d.id);
        const noveltyDim = priorArt.novelty?.dimension;
        const noveltyInDims =
          typeof noveltyDim === 'string' && dimensionIds.includes(noveltyDim);
        findings.push({
          id: 'novelty-dimension',
          label:
            'The novelty rides a real dimension — the row the film argues from is one of its own',
          status: noveltyInDims ? 'ok' : 'fail',
          detail: noveltyInDims
            ? `novelty.dimension "${noveltyDim}" is named in the comparison`
            : `novelty.dimension "${noveltyDim ?? '(unset)'}" is not among the scene's dimensions [${dimensionIds.join(', ') || '(none)'}]`,
        });
        const statement = priorArt.novelty?.statement ?? '';
        const evaluative = EVALUATIVE_NOVELTY.test(statement);
        findings.push({
          id: 'novelty-dimensional',
          label:
            'The novelty statement is dimensional, not evaluative — what was traded, not what is "better"',
          status: statement.trim() && !evaluative ? 'ok' : 'fail',
          detail: !statement.trim()
            ? 'novelty.statement is empty'
            : evaluative
              ? `novelty reads as evaluative ("better"/"wins"/etc.) — restate as a trade-off: "X is a runtime decision; Y was admission-time"`
              : 'the statement names a dimensional difference',
        });
      }
    }
  }

  // timeline-dates-real — every timeline event's date must be a real,
  // parseable date string. A phrase like "early 2024" or "during the war"
  // fails: the time axis is load-bearing, the gaps between dates are part
  // of the argument. Soft-fail (warn) if a date contains alpha characters
  // outside the month-abbreviation allowlist, since parseTimelineDate
  // already HARD-FAILs at the validator. This is the depth-layer signal:
  // a spec author who slips a placeholder past the validator (say, via a
  // future date format we extend the parser to accept) still gets flagged.
  const timelineScenes = spec.scenes.filter((sc) => sc.type === 'timeline');
  if (timelineScenes.length > 0) {
    const MONTH_OK = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
    const badDates: string[] = [];
    for (const sc of timelineScenes) {
      const checkDate = (label: string, value: string): void => {
        if (parseTimelineDate(value) === null) {
          badDates.push(`${label} "${value}"`);
          return;
        }
        // Defensive — if the parser accepted it but it still carries
        // non-month alpha (an extended parser future could let "Q3 2023"
        // through, etc.), fail the depth check.
        const alpha = value.replace(/[^A-Za-z]/g, '');
        if (alpha.length > 0 && !MONTH_OK.test(alpha)) {
          badDates.push(`${label} "${value}" (non-month alpha)`);
        }
      };
      if (sc.axis) {
        checkDate('axis.start', sc.axis.start);
        checkDate('axis.end', sc.axis.end);
        (sc.axis.ticks ?? []).forEach((t, i) => checkDate(`axis.ticks[${i}]`, t));
      }
      (sc.events ?? []).forEach((e) => checkDate(`event "${e.id}".date`, e.date));
      (sc.spans ?? []).forEach((sp) => {
        checkDate(`span "${sp.id}".from`, sp.from);
        checkDate(`span "${sp.id}".to`, sp.to);
      });
    }
    findings.push({
      id: 'timeline-dates-real',
      label: 'Timeline dates are real — every date parses, no "early 2024" / "during the war"',
      status: badDates.length === 0 ? 'ok' : 'fail',
      detail:
        badDates.length === 0
          ? `${timelineScenes.length} timeline scene(s); every date is parseable`
          : `${badDates.length} unparseable date(s): ${badDates.slice(0, 5).join('; ')}${badDates.length > 5 ? '…' : ''}`,
    });
  }

  // tree-discriminates — a rooted tree carries meaning only when at least one
  // level *branches*. A degenerate tree where every node has 0 or 1 child is a
  // chain, which is a list (or a progression), not a hierarchy. The classifier
  // claim of a tree scene is that depth encodes a real axis; a chain encodes
  // nothing the line of stages couldn't carry.
  const trees = spec.scenes.filter((sc) => sc.type === 'tree' && sc.root);
  if (trees.length > 0) {
    const hasSiblings = (n: DepthTreeNode | undefined): boolean => {
      if (!n) return false;
      const kids = n.children ?? [];
      if (kids.length >= 2) return true;
      for (const c of kids) if (hasSiblings(c)) return true;
      return false;
    };
    const branching = trees.filter((sc) => hasSiblings(sc.root));
    const degenerate = trees.length - branching.length;
    findings.push({
      id: 'tree-discriminates',
      label: 'The tree branches — at least one node has siblings, so depth is hierarchical, not a chain',
      status: degenerate === 0 ? 'ok' : 'fail',
      detail:
        degenerate === 0
          ? `${trees.length} tree scene(s) carry real branching — depth encodes a classification axis`
          : `${degenerate} tree scene(s) are degenerate (every node has 0 or 1 child) — a chain is a list, not a hierarchy`,
    });
  }

  // map scenes — the `position-meaningful` contract. A map argues from
  // *where* things sit; if regions carry no annotated `sub` text they are
  // just dots — the position is decoration, not argument. At least 30% of
  // regions across all map scenes must carry a non-empty `sub`. A film
  // with no map scenes skips this check.
  const mapScenes = spec.scenes.filter((sc) => sc.type === 'map');
  if (mapScenes.length > 0) {
    const allRegions = mapScenes.flatMap((sc) => sc.regions ?? []);
    if (allRegions.length === 0) {
      findings.push({
        id: 'position-meaningful',
        label: 'Position is load-bearing — regions carry annotated meaning, not just dots',
        status: 'fail',
        detail: 'a map scene has no regions to argue from',
      });
    } else {
      const annotated = allRegions.filter(
        (r) => typeof r.sub === 'string' && r.sub.trim().length > 0,
      ).length;
      const ratio = annotated / allRegions.length;
      findings.push({
        id: 'position-meaningful',
        label: 'Position is load-bearing — at least 30% of regions carry annotated meaning',
        status: ratio >= 0.3 ? 'ok' : 'fail',
        detail:
          ratio >= 0.3
            ? `${annotated}/${allRegions.length} regions annotated (${Math.round(ratio * 100)}%)`
            : `${annotated}/${allRegions.length} regions annotated (${Math.round(ratio * 100)}%) — without per-region "sub" the regions are dots, the spatial argument doesn't land`,
      });
    }
  }

  // journey-map — every scene of this type must have a real emotional ARC,
  // not a flat experience. A journey-map all-delight or all-pain is not a
  // journey; it is a verdict in disguise. HARD-FAIL: at least one stage
  // ≥ 0.7 AND at least one ≤ 0.3 (the curve must visibly rise and fall),
  // AND at least 50% of stages must have either touchpoints OR painPoints
  // documented — a journey without specifics is just a list of feelings.
  const journeys = spec.scenes.filter((sc) => sc.type === 'journey-map');
  for (const j of journeys) {
    const jstages = j.journeyStages ?? [];
    if (jstages.length === 0) continue; // structural validator owns the empty case
    const high = jstages.some((s) => s.curveValue >= 0.7);
    const low = jstages.some((s) => s.curveValue <= 0.3);
    findings.push({
      id: 'journey-asymmetric',
      label: 'Journey-map emotional arc — at least one high (≥ 0.7) AND one low (≤ 0.3); a flat curve is not a journey',
      status: high && low ? 'ok' : 'fail',
      detail:
        high && low
          ? 'the arc visibly rises and falls'
          : !high && !low
            ? 'the curve is flat — every stage sits in the middle band; not a journey'
            : !high
              ? 'no stage reaches the top of the curve (≥ 0.7) — the journey has no payoff or relief'
              : 'no stage reaches the bottom of the curve (≤ 0.3) — the journey has no friction; a journey-map that flatters is not a journey',
    });
    const documented = jstages.filter(
      (s) => (s.touchpoints?.length ?? 0) > 0 || (s.painPoints?.length ?? 0) > 0,
    ).length;
    const ratio = documented / jstages.length;
    findings.push({
      id: 'journey-specifics',
      label: 'Journey-map specifics — at least half the stages name touchpoints or pain points',
      status: ratio >= 0.5 ? 'ok' : 'fail',
      detail:
        ratio >= 0.5
          ? `${documented}/${jstages.length} stages carry concrete touchpoints or pain points`
          : `only ${documented}/${jstages.length} stages have any touchpoint or pain-point — a journey without specifics is just a list of feelings`,
    });
  }

  // big-idea contract — the takeaway sentence the viewer should leave with.
  // Every NEW explainer ships exactly one. Grandfathered films skip the
  // check (the brief forbids retrofitting them).
  if (isExplainer(spec) && !BIG_IDEA_GRANDFATHERED.has(spec.meta.id ?? '')) {
    const bigIdeas = spec.scenes.filter((sc) => sc.type === 'big-idea');
    if (bigIdeas.length !== 1) {
      findings.push({
        id: 'big-idea-present',
        label: 'A Big Idea scene — the single takeaway',
        status: 'fail',
        detail:
          bigIdeas.length === 0
            ? 'no big-idea scene — the takeaway is missing'
            : `${bigIdeas.length} big-idea scenes — an explainer must include exactly one`,
      });
    } else {
      const statement = (bigIdeas[0].statement ?? '').trim();
      const words = statement.split(/\s+/).filter(Boolean).length;
      const endsWithPeriod = /\.$/.test(statement);
      const filler = BIG_IDEA_FILLER.test(statement);
      const ok = statement.length > 0 && words <= 20 && endsWithPeriod && !filler;
      const reasons: string[] = [];
      if (!statement) reasons.push('statement is empty');
      if (words > 20) reasons.push(`${words} words (> 20)`);
      if (!endsWithPeriod) reasons.push('statement does not end with a period');
      if (filler) reasons.push('statement starts with "This is" / "It is" — a filler opening');
      findings.push({
        id: 'big-idea-shape',
        label: 'Big Idea — one sentence (≤ 20 words), ends with a period, no filler opening',
        status: ok ? 'ok' : 'fail',
        detail: ok
          ? `"${statement}" — ${words} words`
          : `the big-idea sentence fails the contract: ${reasons.join('; ')}`,
      });
    }
  }

  return findings;
};

export type DepthSummary = {ok: number; warn: number; fail: number; total: number};

export const depthSummary = (findings: DepthFinding[]): DepthSummary => ({
  ok: findings.filter((f) => f.status === 'ok').length,
  warn: findings.filter((f) => f.status === 'warn').length,
  fail: findings.filter((f) => f.status === 'fail').length,
  total: findings.length,
});

const GLYPH = {ok: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m⚠\x1b[0m', fail: '\x1b[31m✗\x1b[0m'};

export const depthcheck = async (film: string, json: boolean): Promise<number> => {
  const specPath = join(paths.films, `${film}.json`);
  if (!existsSync(specPath)) {
    console.error(`\x1b[31m✗\x1b[0m films/${film}.json not found`);
    return 1;
  }
  const spec = (await Bun.file(specPath).json()) as Spec;
  const findings = runDepthCheck(spec);
  const s = depthSummary(findings);

  if (json) {
    console.log(JSON.stringify({film, summary: s, findings}, null, 2));
    return s.fail > 0 ? 1 : 0;
  }

  const mode = isPr(spec) ? 'PR review' : 'architecture review';
  console.log(`\x1b[1mdocent depthcheck\x1b[0m — ${film}  (${mode})\n`);
  for (const f of findings) {
    console.log(`  ${GLYPH[f.status]} ${f.label}`);
    console.log(`      ${f.detail}`);
  }
  console.log('');
  if (s.fail > 0) {
    console.log(`\x1b[31m✗ depth contract not met\x1b[0m — ${s.fail} failing, ${s.warn} warning`);
  } else {
    console.log(`\x1b[32m✔ depth contract met\x1b[0m — ${s.ok}/${s.total} (${s.warn} warning${s.warn === 1 ? '' : 's'})`);
  }
  return s.fail > 0 ? 1 : 0;
};
