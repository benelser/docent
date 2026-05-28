// docent treatment — the human-in-the-loop scoping stage.
//
// Between survey and spec sits one checkpoint. The survey establishes what the
// subject *is*; the spec is the JSON the engine renders. Today the survey
// agent jumps straight to the spec — the human never gets to steer scope,
// emphasis, or framing without reading JSON. The treatment layer inserts that
// steering wheel.
//
// A *treatment*, in the cinema sense, is the prose outline of a film, agreed
// before anything is shot. docent's treatment is the same: a plain-language
// film outline the human reviews and edits — controlling scope, emphasis,
// framing, and order — with zero exposure to the spec format or the scene
// grammar. There are two contracts here, kept deliberately separate:
//
//   treatment  — human  ⇄ docent — plain language, treatments/<id>.md
//   spec       — docent ⇄ engine — technical JSON, films/<id>.json
//
// This module exposes the two halves of the checkpoint, each invoking a
// coding agent headlessly exactly as survey.ts does:
//
//   authorTreatment  — survey notes  → treatments/<id>.md  (for the human)
//   treatmentToSpec  — approved treatment → films/<id>.json (for the engine)
//
// Like the survey, a treatment run is an LLM: hermetically *run*, not
// deterministically *reproduced*. The harness validates that the run completes
// and — for the spec half — that the output clears schema + depth.

import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';

// treatments/ is a content directory alongside films/ and analysis/. It is not
// declared in paths.ts (which this module must not modify), so it is resolved
// here, against the same REPO_ROOT.
const TREATMENTS_DIR = join(REPO_ROOT, 'treatments');

// The treatment-authoring brief — the plain-language contract. Lives beside
// the survey template so the two prompt assets sit together.
const TREATMENT_BRIEF = 'packages/agent/prompts/treatment.md';

export type Agent = 'claude' | 'codex';

export type TreatmentOpts = {
  id: string;
  agent: Agent;
  // The subject in human words — what the film is about. For authorTreatment
  // this seeds the header; for treatmentToSpec the treatment already carries it.
  subject?: string;
  feedback?: string; // optional human steering on a re-run of authorTreatment
  timeoutMin?: number;
};

// --- shared headless-agent plumbing (mirrors survey.ts) ----------------------

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

// Build the headless invocation. Both agents run with the docent repo as the
// working root and bypass approvals; the brief reaches the agent through the
// prompt — the same pattern survey.ts uses.
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

// --- (a) authorTreatment -----------------------------------------------------

const buildTreatmentPrompt = (o: TreatmentOpts): string => {
  const lines = [
    `You are docent's treatment author. Between surveying a subject and`,
    `authoring the technical film spec sits one human checkpoint: the`,
    `treatment — a plain-language film outline the human reviews and steers.`,
    `Your job here is Part A: produce that treatment.`,
    ``,
    `BRIEF — read this file in your working directory (the docent repo) first,`,
    `and follow Part A of it exactly:`,
    `  ${TREATMENT_BRIEF}   the treatment-authoring contract`,
    ``,
    `INPUTS — read these:`,
    `  analysis/${o.id}.md   the survey notes — the true things about the subject`,
  ];
  if (o.subject) {
    lines.push(`  Subject (human words): ${o.subject}`);
  }
  lines.push(
    ``,
    `TASK:`,
    `  Write treatments/${o.id}.md — a plain-language film outline: a short`,
    `  four-line header (subject, audience, angle, estimated length), then a`,
    `  numbered outline of 6-8 proposed scenes — each a SHORT TITLE plus ONE`,
    `  SENTENCE of intent, written as a topic or beat of understanding — then`,
    `  an "Open choices" section with 1-3 genuine framing forks for the human.`,
    ``,
    `HARD RULE — zero technical leakage. The reader is an editor, not an`,
    `  engineer: never name a scene type, never show JSON, schema, field names,`,
    `  or engine file paths, and use no docent jargon ("spec", "scene type",`,
    `  "depthcheck"). Subject-domain terms are fine; docent's vocabulary is not.`,
  );
  if (o.feedback) {
    lines.push(
      ``,
      `RE-RUN WITH HUMAN FEEDBACK — a treatment already exists at`,
      `  treatments/${o.id}.md. Treat its current contents plus this feedback as`,
      `  binding; the human's steering wins over any earlier draft:`,
      `    ${o.feedback}`,
    );
  }
  lines.push(
    ``,
    `Write only treatments/${o.id}.md. Do NOT author films/${o.id}.json — that`,
    `is Part B, run only after a human approves the treatment. Print DONE when`,
    `finished.`,
  );
  return lines.join('\n');
};

// Light, non-blocking lint of the treatment for technical leakage — the
// treatment's contract is "no scene-type names, no JSON". This is the
// treatment-side equivalent of survey.ts's schema + depth gates: it cannot
// prove plain language, but it catches the obvious breaches.
const SCENE_TYPE_WORDS = [
  'frame', 'structure', 'progression', 'walkthrough', 'compare', 'quantities',
  'probe', 'tension', 'closeup', 'demonstrate', 'recap', 'diff',
];

const leakWarnings = (md: string): string[] => {
  const warns: string[] = [];
  const lower = md.toLowerCase();
  // A scene-type name used as docent vocabulary. Word-boundary matched so
  // ordinary prose ("compare the two", "the structure of the system") is not
  // flagged — only the phrasings that read as the grammar leaking through.
  for (const t of SCENE_TYPE_WORDS) {
    const asType = new RegExp(`\\b(a |an |the )?${t}\\s+(scene|type)\\b`, 'i');
    if (asType.test(md)) warns.push(`names a scene type as docent vocabulary: "${t}"`);
  }
  if (/films\/|\.json\b/i.test(md)) warns.push('references the spec file (films/<id>.json)');
  if (/[{[]"\w+"|"beats"|"nodes"|"accent"/.test(md)) warns.push('appears to contain JSON or schema field names');
  for (const j of ['depthcheck', 'film spec', 'scene type', 'the grammar']) {
    if (lower.includes(j)) warns.push(`uses docent jargon: "${j}"`);
  }
  return [...new Set(warns)];
};

// Author treatments/<id>.md from the survey notes. The human then reviews and
// edits that file directly, or re-runs this with `feedback`.
export const authorTreatment = async (o: TreatmentOpts): Promise<number> => {
  const pre = preflight(o.agent);
  if (pre !== null) return pre;

  const notesPath = join(paths.analysis, `${o.id}.md`);
  if (!existsSync(notesPath)) {
    console.error(`\x1b[31m✗\x1b[0m survey notes not found: analysis/${o.id}.md — run the survey first`);
    return 1;
  }

  mkdirSync(TREATMENTS_DIR, {recursive: true});
  const treatmentPath = join(TREATMENTS_DIR, `${o.id}.md`);
  const isRerun = o.feedback !== undefined && existsSync(treatmentPath);

  console.log(
    `\x1b[1mdocent treatment\x1b[0m — ${o.agent} · ` +
      `analysis/${o.id}.md → treatments/${o.id}.md` +
      `${isRerun ? ' · re-run with feedback' : ''}\n`,
  );

  const code = await runAgent(
    o.agent,
    buildTreatmentPrompt(o),
    'treatment authoring',
    o.timeoutMin ?? 20,
  );

  if (!existsSync(treatmentPath)) {
    console.error(`\x1b[31m✗\x1b[0m no treatments/${o.id}.md produced`);
    return 1;
  }
  const md = await Bun.file(treatmentPath).text();
  if (!md.trim()) {
    console.error(`\x1b[31m✗\x1b[0m treatments/${o.id}.md is empty`);
    return 1;
  }

  // Non-blocking leakage report — the treatment must read as plain language.
  const warns = leakWarnings(md);
  console.log(
    warns.length === 0
      ? `  leakage: \x1b[32mclean — no scene-type names, no JSON\x1b[0m`
      : `  leakage: \x1b[33m${warns.length} warning(s)\x1b[0m`,
  );
  for (const w of warns) console.log(`    \x1b[33m⚠\x1b[0m ${w}`);

  console.log(
    `\x1b[32m✔ treatment written\x1b[0m — review and edit treatments/${o.id}.md, ` +
      `then run treatmentToSpec (or re-run with feedback)`,
  );
  // The treatment is a human artifact — the agent run completing is the gate.
  // Leakage warnings are advisory; they do not fail the run.
  return code === 0 ? 0 : 1;
};

// --- (b) treatmentToSpec -----------------------------------------------------

const buildSpecPrompt = (o: TreatmentOpts): string =>
  [
    `You are docent's spec author. A human has reviewed and approved a film`,
    `treatment — a plain-language outline. Your job here is Part B: author the`,
    `technical film spec FROM that approved treatment, faithfully.`,
    ``,
    `BRIEF — read these files in your working directory (the docent repo)`,
    `first, and follow Part B of the treatment brief exactly:`,
    `  ${TREATMENT_BRIEF}                          the treatment-to-spec contract`,
    `  packages/engine/schema/film.schema.json     the spec contract`,
    `  packages/agent/instructions/docent.md       the review method + depth bar`,
    `  films/kubernetes-pr.json                    the worked example — match its format`,
    ``,
    `INPUTS — read these:`,
    `  treatments/${o.id}.md   the APPROVED treatment — fixed scope, the film's spine`,
    `  analysis/${o.id}.md     the survey notes — the true facts the narration must carry`,
    ``,
    `TASK:`,
    `  Author films/${o.id}.json from the treatment. Map each treatment scene,`,
    `  in order, to exactly one grammar scene type — that mapping is YOUR job`,
    `  and is hidden from the human. Do not add, drop, or reorder scenes`,
    `  relative to the treatment's outline. Honour every resolved Open choice;`,
    `  if a framing fork in the treatment is still unresolved, stop and say so`,
    `  rather than guessing. Pull real numbers, file names, and failure modes`,
    `  from the survey notes into the narration.`,
    ``,
    `DEPTH — the depth the human approved in the treatment must survive into`,
    `  the spec. The result MUST validate against the schema and clear the`,
    `  depth contract: a tension scene, a quantified claim, failure-mode`,
    `  language, and a verdict that adjudicates (PR) or an honest scorecard`,
    `  (architecture).`,
    ``,
    `SELF-CHECK — run:  bun packages/engine/cli/docent.ts depthcheck ${o.id}`,
    `  Revise films/${o.id}.json until it validates and reports the depth`,
    `  contract met, with no failures.`,
    ``,
    `Do NOT run TTS or a full render — the harness does that. Write only`,
    `films/${o.id}.json. Print DONE when finished.`,
  ].join('\n');

// Author films/<id>.json from an approved treatment. Validates the output
// against schema + depthcheck, exactly as survey.ts does.
export const treatmentToSpec = async (o: TreatmentOpts): Promise<number> => {
  const pre = preflight(o.agent);
  if (pre !== null) return pre;

  const treatmentPath = join(TREATMENTS_DIR, `${o.id}.md`);
  if (!existsSync(treatmentPath)) {
    console.error(
      `\x1b[31m✗\x1b[0m no treatments/${o.id}.md — run authorTreatment and get human sign-off first`,
    );
    return 1;
  }
  const notesPath = join(paths.analysis, `${o.id}.md`);
  if (!existsSync(notesPath)) {
    console.error(`\x1b[31m✗\x1b[0m survey notes not found: analysis/${o.id}.md`);
    return 1;
  }

  const specPath = join(paths.films, `${o.id}.json`);
  console.log(
    `\x1b[1mdocent treatment → spec\x1b[0m — ${o.agent} · ` +
      `treatments/${o.id}.md → films/${o.id}.json\n`,
  );

  const code = await runAgent(
    o.agent,
    buildSpecPrompt(o),
    'spec authoring',
    o.timeoutMin ?? 30,
  );

  // Schema + depth gates — identical to survey.ts's tail.
  if (!existsSync(specPath)) {
    console.error(`\x1b[31m✗\x1b[0m no films/${o.id}.json produced`);
    return 1;
  }
  let spec: unknown;
  try {
    spec = await Bun.file(specPath).json();
  } catch (e) {
    console.error(`\x1b[31m✗\x1b[0m films/${o.id}.json is not valid JSON: ${e}`);
    return 1;
  }
  // Validate + depthcheck via subprocess to the v3 @docent/cli — no engine
  // imports remain.
  const cli = ['bun', 'run', 'docent'];
  const validateProc = Bun.spawnSync({
    cmd: [...cli, 'validate', o.id],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const depthProc = Bun.spawnSync({
    cmd: [...cli, 'depthcheck', o.id],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const validateOk = validateProc.exitCode === 0;
  const depthOk = depthProc.exitCode === 0;
  console.log(
    `  schema:  ${
      validateOk ? '\x1b[32mvalid\x1b[0m' : `\x1b[31m${validateProc.exitCode} issue(s)\x1b[0m`
    }`,
  );
  if (!validateOk) {
    console.log(new TextDecoder().decode(validateProc.stdout).trim());
  }
  console.log(
    `  depth:   ${depthOk ? '\x1b[32mcontract met\x1b[0m' : '\x1b[31mdepth failures (see depthcheck output)\x1b[0m'}`,
  );
  const ok = validateOk && depthOk;
  console.log(
    ok
      ? `\x1b[32m✔ treatment authored a valid, depth-clean spec\x1b[0m`
      : `\x1b[31m✗ spec needs work\x1b[0m`,
  );
  // Surface a non-zero agent exit even when the artifact happens to be clean.
  return ok && code === 0 ? 0 : 1;
};
