// docent judge — the adversarial depth gate, actually invoked.
//
// docent's quality surface is the film spec: the engine is deterministic, so
// every quality decision lives in the survey→spec step. Today that step is
// one-shot — the survey authors a spec, `depthcheck` mechanically lints it,
// done. depthcheck is a *floor*: a regex contract that catches the obvious
// misses (no risk node, no number, no verdict). It cannot tell a verdict that
// *rules* from one that *restates*.
//
// The depth-review sub-agent brief (packages/agent/agents/depth-review.md) is
// the judgement-based gate that catches the subtle ones. Until now it has been
// a doc — a rubric that was never run. This module wires it into a real cycle:
//
//   judge       — invoke the depth-review agent headlessly against a spec,
//                 read back a STRUCTURED verdict, print a graded summary, and
//                 run the mechanical depthcheck alongside it as the floor.
//   reviseLoop  — the inner loop: author → JUDGE → revise → re-judge, bounded,
//                 until the judge passes or the rounds run out.
//
// The judge is SEPARATE from the author by design — adversarial. The author
// is invested in its own spec; the judge is briefed to send it back. Like the
// survey, a judge run is an LLM: hermetically *run*, not deterministically
// *reproduced*. The harness validates the run completes and the verdict parses.

import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {runDepthCheck, depthSummary} from './depthcheck';

// reviews/ is a content directory alongside films/ and analysis/. Like
// treatment.ts's treatments/, it is not declared in paths.ts (which this
// module must not modify), so it is resolved here against the same REPO_ROOT.
const REVIEWS_DIR = join(REPO_ROOT, 'reviews');

// The judge's rubric and the authoring method. The judge follows the
// depth-review brief; the reviser follows the survey method to rewrite.
const DEPTH_REVIEW_BRIEF = 'packages/agent/agents/depth-review.md';

export type Agent = 'claude' | 'codex';

export type JudgeOpts = {
  id: string;
  agent: Agent;
  timeoutMin?: number;
};

export type ReviseLoopOpts = JudgeOpts & {
  maxRounds?: number;
};

// The depth dimensions the depth-review brief defines — eight numbered
// judgement questions. The judge scores each; this list is what the prompt
// names and what the printed summary expects back. Kept here so the structured
// verdict has a fixed, checkable shape. Some dimensions are mode-scoped — the
// brief tells the judge when to mark a dimension n/a (e.g. takeaway-earned for
// non-explainers, novelty-named/prior-art-honest for non-AR).
const DEPTH_DIMENSIONS = [
  {id: 'triage', label: 'Triage — finds the load-bearing change, reviews that'},
  {id: 'where-wrong', label: 'Where it could be wrong — weird input + at-scale failure walked'},
  {id: 'tests-prove-it', label: 'Tests prove it — points at the specific claimed behavior'},
  {id: 'the-numbers', label: 'The numbers — a real quantity, used to reason'},
  {id: 'the-trade-off', label: 'The trade-off — a rejected alternative named, with its cost'},
  {id: 'verdict-adjudicates', label: 'The verdict adjudicates — a disposition, a residual risk'},
  // Explainer-mode: the Big Idea must be earned by the film, not asserted.
  {id: 'takeaway-earned', label: 'The takeaway earned — the Big Idea is proven by the film, not asserted'},
  // AR-mode: the film argues against a lineage. PR films mark these n/a.
  {id: 'novelty-named', label: 'Novelty named — the film says what is *new*, not what the components are'},
  {id: 'prior-art-honest', label: 'Prior art honest — prior systems named with version/year, divergence is dimensional'},
  // Style-honest — appended for the schema-driven styling pipeline. Today the
  // pipeline lands but no scene component consumes its tokens yet, so this
  // dimension scores informatively (n/a is acceptable until the renderer
  // migration lands).
  {id: 'style-honest', label: 'Style is honest — the preset matches the film\'s register; an analytical paper does not ship in playful, an executive deck is not editorial'},
  // Timeline scene: time as load-bearing axis.
  {id: 'time-is-load-bearing', label: 'Time is load-bearing — the gaps between events are part of the argument, not decoration'},
  // tree-scene: when the film uses a `tree`, the levels must carry information.
  // A tree whose depth is decorative — only one node per level, or levels that
  // restate the level above — fails this dimension. Films with no tree scene
  // mark this n/a.
  {id: 'hierarchy-meaningful', label: 'Hierarchy meaningful — the levels carry information; depth is not decorative'},
] as const;

// The structured verdict the judge writes to reviews/<id>.json. A score per
// depth dimension, an overall pass boolean, and a list of specific actionable
// critiques (each naming the scene/beat id and the concrete problem).
export type DimensionScore = {
  dimension: string; // one of DEPTH_DIMENSIONS[].id
  score: number; // 1-5 — 1 a tour, 5 a genuine interrogation
  note: string; // one line: why this score
};

export type Critique = {
  target: string; // the scene id and/or beat id the critique is about
  problem: string; // the concrete depth failure
  fix: string; // what the strong version must interrogate instead
};

export type Verdict = {
  pass: boolean;
  scores: DimensionScore[];
  critiques: Critique[];
  summary?: string;
};

// --- shared headless-agent plumbing (mirrors survey.ts / treatment.ts) -------

const preflight = (agent: Agent): number | null => {
  if (agent !== 'claude' && agent !== 'codex') {
    console.error(`\x1b[31m✗\x1b[0m unknown agent "${agent}" — use claude or codex`);
    return 1;
  }
  if (!Bun.which(agent)) {
    console.error(`\x1b[31m✗\x1b[0m ${agent} not on PATH`);
    return 1;
  }
  return null;
};

// Build the headless invocation — identical pattern to survey.ts/treatment.ts:
// the docent repo is the working root, approvals are bypassed, opus is pinned,
// and the brief reaches the agent through the prompt.
const agentCmd = (agent: Agent, prompt: string): string[] =>
  agent === 'claude'
    ? ['claude', '-p', prompt,
       '--permission-mode', 'bypassPermissions',
       '--model', 'opus']
    : ['codex', 'exec', prompt,
       '-C', REPO_ROOT,
       '--dangerously-bypass-approvals-and-sandbox'];

const runAgent = async (
  agent: Agent,
  prompt: string,
  label: string,
  timeoutMin: number,
): Promise<number> => {
  const t0 = performance.now();
  const proc = Bun.spawn(agentCmd(agent, prompt), {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
  const killer = setTimeout(() => {
    console.error(`\n\x1b[31m✗\x1b[0m ${label} exceeded ${timeoutMin}m — killing the agent`);
    proc.kill();
  }, timeoutMin * 60_000);
  const code = await proc.exited;
  clearTimeout(killer);
  const wall = (performance.now() - t0) / 1000;
  console.log(`\n  agent exited ${code} · ${wall.toFixed(0)}s wall`);
  return code;
};

// --- verdict parsing ---------------------------------------------------------

// Read reviews/<id>.json back and coerce it into a Verdict. A judge run is an
// LLM: it can drift on shape, so this is forgiving where it safely can be (a
// missing critiques list is an empty list) and strict where it must be (no
// `pass` boolean is a malformed verdict — the loop cannot proceed on it).
const parseVerdict = (raw: unknown): Verdict => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('verdict is not a JSON object');
  }
  const v = raw as Record<string, unknown>;
  if (typeof v.pass !== 'boolean') {
    throw new Error('verdict has no boolean `pass` field');
  }
  const scores: DimensionScore[] = Array.isArray(v.scores)
    ? v.scores
        .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map((s) => ({
          dimension: String(s.dimension ?? '(unnamed)'),
          score: Number(s.score ?? 0),
          note: String(s.note ?? ''),
        }))
    : [];
  const critiques: Critique[] = Array.isArray(v.critiques)
    ? v.critiques
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
          target: String(c.target ?? c.beat ?? c.scene ?? '(unspecified)'),
          problem: String(c.problem ?? ''),
          fix: String(c.fix ?? ''),
        }))
    : [];
  return {
    pass: v.pass,
    scores,
    critiques,
    summary: typeof v.summary === 'string' ? v.summary : undefined,
  };
};

// --- prompt assembly ---------------------------------------------------------

const buildJudgePrompt = (id: string, reviewRel: string): string =>
  [
    `You are docent's depth-review judge — an adversarial quality gate. You did`,
    `NOT author this film. Your job is not to admire it; it is to decide whether`,
    `it *interrogates* its subject or merely *tours* it, and to send it back if`,
    `it tours.`,
    ``,
    `BRIEF — read this file in your working directory (the docent repo) and`,
    `follow its rubric exactly. It is the contract for this judgement:`,
    `  ${DEPTH_REVIEW_BRIEF}`,
    ``,
    `WHAT YOU ARE JUDGING — read both:`,
    `  films/${id}.json    the draft film spec under review`,
    `  analysis/${id}.md   the survey notes — the GROUND TRUTH the film must be`,
    `                      faithful to. A claim in the film not supported by the`,
    `                      notes is a finding; depth the notes contain that the`,
    `                      film drops is a finding.`,
    ``,
    `The mechanical contract (docent depthcheck) is a separate, cheaper gate —`,
    `a floor, never the bar. Judge what a regex cannot: a verdict that restates`,
    `instead of ruling, a trade-off that is named but not costed, a film as`,
    `undifferentiated as the diff.`,
    ``,
    `OUTPUT — write a STRUCTURED verdict as JSON to ${reviewRel}. Write ONLY`,
    `that file. The JSON object MUST have exactly this shape:`,
    `{`,
    `  "pass": <boolean>,        // true only if the film interrogates its subject`,
    `  "scores": [               // one entry PER depth dimension below`,
    `    {"dimension": "<id>", "score": <1-5>, "note": "<one line: why>"}`,
    `  ],`,
    `  "critiques": [            // [] if and only if pass is true`,
    `    {"target": "<scene id and/or beat id>",`,
    `     "problem": "<the concrete depth failure — quote the weak narration>",`,
    `     "fix": "<what the strong version must interrogate instead>"}`,
    `  ],`,
    `  "summary": "<2-3 sentences: the overall disposition>"`,
    `}`,
    ``,
    `The depth dimensions — score every one, by its id (these ARE the six`,
    `numbered judgement questions of the depth-review brief):`,
    ...DEPTH_DIMENSIONS.map((d) => `  ${d.id} — ${d.label}`),
    ``,
    `Scoring: 1 = a tour (admires, does not interrogate); 3 = competent but`,
    `safe; 5 = a genuine interrogation. Set "pass" to false if ANY dimension`,
    `scores 2 or below, or if the verdict scene does not adjudicate. Each`,
    `critique MUST name the scene id and/or beat id it is about and state a`,
    `concrete, actionable problem — not "make it deeper". A film that always`,
    `flatters its subject is the failure mode you exist to prevent; a non-clean`,
    `verdict inside the film itself is allowed and often correct.`,
    ``,
    `Do not edit films/${id}.json — you judge, you do not revise. Write only`,
    `${reviewRel}. Print DONE when finished.`,
  ].join('\n');

const buildRevisePrompt = (id: string, reviewRel: string): string =>
  [
    `You are docent's spec author. A film you (or a peer) authored has been`,
    `through an adversarial depth review and FAILED. Your job is to revise`,
    `films/${id}.json so it clears the bar — interrogates its subject rather`,
    `than touring it.`,
    ``,
    `BRIEF — read these files in your working directory (the docent repo) first:`,
    `  ${DEPTH_REVIEW_BRIEF}                       the depth bar you must clear`,
    `  packages/engine/schema/film.schema.json     the spec contract`,
    `  packages/agent/instructions/docent.md       the review method + depth bar`,
    ``,
    `INPUTS — read all three:`,
    `  films/${id}.json    the current draft spec — the thing you are revising`,
    `  analysis/${id}.md   the survey notes — the GROUND TRUTH; pull real numbers,`,
    `                      file names, and failure modes from here into narration`,
    `  ${reviewRel}   the judge's STRUCTURED verdict — BINDING revision feedback`,
    ``,
    `THE FEEDBACK IS BINDING. ${reviewRel} contains a "critiques" array. Each`,
    `critique names a "target" (a scene id and/or beat id), the "problem" with`,
    `it, and the "fix" it needs. Address EVERY critique:`,
    `  - Rewrite the named beat/scene so it does what "fix" demands.`,
    `  - Where a critique asks for depth not in the spec (a quantity, a failure`,
    `    mode, a costed trade-off, an adjudicating verdict), source it from the`,
    `    survey notes — do not invent it.`,
    `  - Do not paper over a critique with a complimentary adjective.`,
    ``,
    `CONSTRAINTS — keep the film coherent:`,
    `  - Keep the same subject, the same scene count and order unless a critique`,
    `    explicitly calls for a structural change.`,
    `  - The result MUST still validate against the schema and clear the`,
    `    mechanical depth contract (docent depthcheck) — that is the floor.`,
    ``,
    `SELF-CHECK — run:  bun packages/engine/cli/docent.ts depthcheck ${id}`,
    `  Revise until it validates and reports the depth contract met, no failures.`,
    ``,
    `Do NOT run TTS or a full render. Write only films/${id}.json. Print DONE`,
    `when finished.`,
  ].join('\n');

// --- printing ----------------------------------------------------------------

const SCORE_GLYPH = (n: number): string =>
  n >= 4 ? '\x1b[32m' : n >= 3 ? '\x1b[33m' : '\x1b[31m';

const printVerdict = (verdict: Verdict): void => {
  console.log(`\n  \x1b[1mdepth-review verdict\x1b[0m`);
  for (const d of DEPTH_DIMENSIONS) {
    const s = verdict.scores.find((x) => x.dimension === d.id);
    if (s) {
      console.log(
        `    ${SCORE_GLYPH(s.score)}${s.score}/5\x1b[0m  ${d.label}`,
      );
      if (s.note) console.log(`         ${s.note}`);
    } else {
      console.log(`    \x1b[90m–/5\x1b[0m  ${d.label}  \x1b[90m(not scored)\x1b[0m`);
    }
  }
  // Any score the judge returned that is not one of the known dimensions.
  for (const s of verdict.scores) {
    if (!DEPTH_DIMENSIONS.some((d) => d.id === s.dimension)) {
      console.log(`    ${SCORE_GLYPH(s.score)}${s.score}/5\x1b[0m  ${s.dimension}  \x1b[90m(extra)\x1b[0m`);
    }
  }
  if (verdict.critiques.length > 0) {
    console.log(`\n  \x1b[1mcritiques\x1b[0m — ${verdict.critiques.length} actionable`);
    for (const c of verdict.critiques) {
      console.log(`    \x1b[31m✗\x1b[0m [${c.target}] ${c.problem}`);
      if (c.fix) console.log(`        → ${c.fix}`);
    }
  }
  if (verdict.summary) console.log(`\n  ${verdict.summary}`);
  console.log(
    verdict.pass
      ? `\n  \x1b[32m✔ judge: PASS — the film interrogates its subject\x1b[0m`
      : `\n  \x1b[31m✗ judge: REVISE — the film tours, it does not interrogate\x1b[0m`,
  );
};

// Run the mechanical depthcheck alongside the judge — the floor, reported but
// never the bar.
const printDepthcheck = async (specPath: string): Promise<void> => {
  try {
    const spec = (await Bun.file(specPath).json()) as Parameters<typeof runDepthCheck>[0];
    const ds = depthSummary(runDepthCheck(spec));
    console.log(
      `\n  mechanical depthcheck (the floor): ` +
        (ds.fail === 0
          ? `\x1b[32m${ds.ok}/${ds.total} ok, ${ds.warn} warn\x1b[0m`
          : `\x1b[31m${ds.fail} fail\x1b[0m, ${ds.warn} warn, ${ds.ok} ok`),
    );
  } catch (e) {
    console.log(`\n  mechanical depthcheck: \x1b[33mskipped — ${e instanceof Error ? e.message : e}\x1b[0m`);
  }
};

// --- (1) judge ---------------------------------------------------------------

// Invoke the depth-review sub-agent headlessly against films/<id>.json, read
// back the structured verdict, print a graded summary, and report the
// mechanical depthcheck alongside it. Returns the parsed Verdict; throws a
// user-facing Error if the run produces no parseable verdict.
//
// `reviewPath` lets the loop point the judge at a per-round file
// (reviews/<id>.round-N.json); it defaults to reviews/<id>.json.
export const judge = async (
  o: JudgeOpts,
  reviewPath?: string,
): Promise<Verdict> => {
  const pre = preflight(o.agent);
  if (pre !== null) throw new Error(`agent preflight failed for "${o.agent}"`);

  const specPath = join(paths.films, `${o.id}.json`);
  if (!existsSync(specPath)) {
    throw new Error(`films/${o.id}.json not found — author a spec first`);
  }
  const notesPath = join(paths.analysis, `${o.id}.md`);
  if (!existsSync(notesPath)) {
    throw new Error(`analysis/${o.id}.md not found — the judge needs the survey notes as ground truth`);
  }

  mkdirSync(REVIEWS_DIR, {recursive: true});
  const outPath = reviewPath ?? join(REVIEWS_DIR, `${o.id}.json`);
  // The path the agent is told to write — relative to REPO_ROOT for the prompt.
  const reviewRel = outPath.startsWith(REPO_ROOT + '/')
    ? outPath.slice(REPO_ROOT.length + 1)
    : outPath;

  console.log(
    `\x1b[1mdocent judge\x1b[0m — ${o.agent} · ` +
      `films/${o.id}.json → ${reviewRel}\n`,
  );

  const code = await runAgent(
    o.agent,
    buildJudgePrompt(o.id, reviewRel),
    'depth-review judging',
    o.timeoutMin ?? 20,
  );
  if (code !== 0) {
    console.warn(`  \x1b[33m⚠\x1b[0m  judge agent exited non-zero — verdict may be incomplete`);
  }

  if (!existsSync(outPath)) {
    throw new Error(`judge produced no ${reviewRel}`);
  }
  let raw: unknown;
  try {
    raw = await Bun.file(outPath).json();
  } catch (e) {
    throw new Error(`${reviewRel} is not valid JSON: ${e}`);
  }
  const verdict = parseVerdict(raw);

  printVerdict(verdict);
  await printDepthcheck(specPath);

  return verdict;
};

// --- (2) reviseLoop ----------------------------------------------------------

// The inner loop: judge → (if fail) revise → re-judge, bounded. Each round's
// verdict is recorded to reviews/<id>.round-N.json; the final verdict is also
// mirrored to reviews/<id>.json. Stops when the judge passes or the round
// budget is exhausted. Returns 0 if the spec cleared the bar, 1 otherwise.
export const reviseLoop = async (o: ReviseLoopOpts): Promise<number> => {
  const pre = preflight(o.agent);
  if (pre !== null) return pre;

  const specPath = join(paths.films, `${o.id}.json`);
  if (!existsSync(specPath)) {
    console.error(`\x1b[31m✗\x1b[0m films/${o.id}.json not found — author a spec first`);
    return 1;
  }
  if (!existsSync(join(paths.analysis, `${o.id}.md`))) {
    console.error(`\x1b[31m✗\x1b[0m analysis/${o.id}.md not found — the loop needs the survey notes`);
    return 1;
  }

  const maxRounds = Math.max(1, o.maxRounds ?? 3);
  mkdirSync(REVIEWS_DIR, {recursive: true});

  console.log(
    `\x1b[1mdocent revise-loop\x1b[0m — ${o.agent} · films/${o.id}.json · ` +
      `up to ${maxRounds} round(s)\n`,
  );

  // Round-by-round trajectory, printed at the end.
  type RoundRecord = {round: number; pass: boolean; critiques: number; avg: number};
  const trajectory: RoundRecord[] = [];
  let lastVerdict: Verdict | null = null;
  let passed = false;

  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\x1b[1m── round ${round}/${maxRounds} — judge ──\x1b[0m`);
    const roundPath = join(REVIEWS_DIR, `${o.id}.round-${round}.json`);

    let verdict: Verdict;
    try {
      verdict = await judge({id: o.id, agent: o.agent, timeoutMin: o.timeoutMin}, roundPath);
    } catch (e) {
      console.error(`\x1b[31m✗\x1b[0m round ${round} judge failed: ${e instanceof Error ? e.message : e}`);
      break;
    }
    lastVerdict = verdict;

    const avg =
      verdict.scores.length > 0
        ? verdict.scores.reduce((a, s) => a + s.score, 0) / verdict.scores.length
        : 0;
    trajectory.push({
      round,
      pass: verdict.pass,
      critiques: verdict.critiques.length,
      avg,
    });

    if (verdict.pass) {
      passed = true;
      console.log(`\n\x1b[32m✔ round ${round}: the judge passed the spec\x1b[0m`);
      break;
    }
    if (round === maxRounds) {
      console.log(`\n\x1b[33m⚠\x1b[0m  round budget exhausted — spec still fails the judge`);
      break;
    }

    // The judge failed and rounds remain — revise. The reviser reads the
    // round's verdict file as binding feedback.
    console.log(`\n\x1b[1m── round ${round}/${maxRounds} — revise ──\x1b[0m`);
    const reviewRel = roundPath.startsWith(REPO_ROOT + '/')
      ? roundPath.slice(REPO_ROOT.length + 1)
      : roundPath;
    const reviseCode = await runAgent(
      o.agent,
      buildRevisePrompt(o.id, reviewRel),
      'spec revision',
      o.timeoutMin ?? 30,
    );
    if (reviseCode !== 0) {
      console.warn(`  \x1b[33m⚠\x1b[0m  reviser exited non-zero — re-judging the spec as-is`);
    }
    console.log('');
  }

  // Mirror the final round's verdict to the canonical reviews/<id>.json.
  if (lastVerdict) {
    await Bun.write(
      join(REVIEWS_DIR, `${o.id}.json`),
      JSON.stringify(lastVerdict, null, 2),
    );
  }

  // The round-by-round trajectory.
  console.log(`\n\x1b[1mtrajectory\x1b[0m — ${o.id}`);
  for (const r of trajectory) {
    console.log(
      `  round ${r.round}: ` +
        `${r.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mREVISE\x1b[0m'} · ` +
        `avg ${r.avg.toFixed(1)}/5 · ${r.critiques} critique(s)`,
    );
  }
  console.log(
    passed
      ? `\n\x1b[32m✔ spec cleared the depth-review bar in ${trajectory.length} round(s)\x1b[0m`
      : `\n\x1b[31m✗ spec did not clear the bar in ${trajectory.length} round(s)\x1b[0m — ` +
          `see reviews/${o.id}.json for the residual critique`,
  );
  return passed ? 0 : 1;
};
