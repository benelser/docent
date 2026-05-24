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
    // causal-loop scene fields — only present on `type: 'causal-loop'`.
    variables?: {id: string}[];
    causalEdges?: {id: string; from: string; to: string; polarity: '+' | '-'}[];
    loops?: {id: string; path: string[]; kind: 'reinforcing' | 'balancing'; label?: string}[];
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

  // causal-loop contract — the "loop" must actually CLOSE. A causal-loop
  // scene that ships loops whose `path` is a straight line (last variable
  // doesn't reach back to the first) has labelled a non-loop with R/B —
  // a failure of the scene's whole argument. We check, per loop, that an
  // edge exists from path[last] → path[0]. The structural validator
  // (cli/validate.ts) already enforced that every consecutive pair has
  // an edge; this is the wrap-around dimension. A scene with no loops
  // skips this entirely (the structural validator demands at least 1).
  const causalLoopScenes = spec.scenes.filter((sc) => sc.type === 'causal-loop');
  if (causalLoopScenes.length > 0) {
    const openLoops: {scene: string; loop: string}[] = [];
    for (const sc of causalLoopScenes) {
      const edgeKeys = new Set(
        (sc.causalEdges ?? []).map((e) => `${e.from}->${e.to}`),
      );
      for (const loop of sc.loops ?? []) {
        if (!Array.isArray(loop.path) || loop.path.length < 2) {
          openLoops.push({scene: sc.type, loop: loop.id});
          continue;
        }
        const first = loop.path[0];
        const last = loop.path[loop.path.length - 1];
        if (!edgeKeys.has(`${last}->${first}`)) {
          openLoops.push({scene: sc.type, loop: loop.id});
        }
      }
    }
    const allClosed = openLoops.length === 0;
    findings.push({
      id: 'loop-actually-loops',
      label: 'Loops actually close — a causal-loop scene argues a cycle, not a line',
      status: allClosed ? 'ok' : 'fail',
      detail: allClosed
        ? `${causalLoopScenes.length} causal-loop scene(s); every loop closes`
        : `${openLoops.length} loop(s) do not close — path[last] has no edge back to path[0]: ${openLoops.map((o) => o.loop).join(', ')}`,
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
