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
  meta: {prompt?: string};
  scenes: {
    type: string;
    nodes?: {kind?: string}[];
    beats: {id: string; narration: string}[];
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
const narrationOf = (scenes: Spec['scenes']): string =>
  scenes.flatMap((sc) => sc.beats).map((b) => b.narration).join('  ');

export const runDepthCheck = (spec: Spec): DepthFinding[] => {
  const findings: DepthFinding[] = [];
  const narration = narrationOf(spec.scenes);
  const sketches = spec.scenes.filter((sc) => sc.type === 'sketch');
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
    id: 'sketch-scene',
    label: isPr(spec) ? 'A sketch verdict scene' : 'A sketch failure-modes / trade-offs scene',
    status: sketches.length > 0 ? 'ok' : 'fail',
    detail: sketches.length > 0
      ? `${sketches.length} sketch scene(s) — the reasoning layer`
      : 'no sketch scene — the reasoning layer is missing',
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
    const verdictText = narrationOf(sketches);
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
      .filter((sc) => sc.type === 'recap' || sc.type === 'sketch')
      .slice(-1);
    findings.push({
      id: 'scorecard',
      label: 'An honest closing scorecard — names a fragility, not only praise',
      status: SCORECARD.test(narrationOf(closing)) ? 'ok' : 'warn',
      detail: SCORECARD.test(narrationOf(closing))
        ? 'the close names a limit or fragility'
        : 'the close reads as unqualified praise',
    });
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
