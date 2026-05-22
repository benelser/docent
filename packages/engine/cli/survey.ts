// docent survey — the headless-survey wiring.
//
// Invokes a coding agent headlessly, with the docent-agent brief as its
// context, to survey a subject and author films/<id>.json. This is the survey
// stage of the cascade made *programmatic*: a survey runs hermetically —
// pinned subject, pinned brief, pinned model — instead of a human driving an
// interactive agent.
//
// The survey is an LLM: it can be hermetically *run* but not deterministically
// *reproduced*. The harness validates that the run completes and the output
// clears the schema + depth contract; the agent-to-agent axis is a quality
// comparison, not an equality check.
//
// Three modes:
//   pr  — a pull-request review of a code repository.
//   ar  — an architecture review of a code repository (or subsystem).
//   ex  — an explainer of a *non-code* subject: a book, an essay, a blog post,
//         a wiki. The subject is content to be explained, not code to trace.
//
// The subject input is generalized. It is inferred into one of four shapes:
//   - a git repo directory   (a directory containing .git)
//   - a knowledge-base dir   (a directory without .git — a wiki / docs tree)
//   - a single local file    (one document)
//   - a URL                  (fetched once to analysis/<id>.source.md)

import {existsSync, statSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {validateSpec} from './validate';
import {runDepthCheck, depthSummary} from './depthcheck';
import {fetchSource} from './fetch-source';

export type SurveyMode = 'pr' | 'ar' | 'ex';

export type SurveyOpts = {
  // The subject. For pr/ar this is a repository path (today's behavior). For
  // ex it can be a directory, a single file, or a URL.
  repo: string;
  mode: SurveyMode;
  subsystem?: string;
  pr?: string;
  agent: 'claude' | 'codex';
  id: string;
  timeoutMin?: number;
};

// The four shapes a subject can take. `repo` and `dir` and `file` are local
// paths the agent reaches via --add-dir; `url` is fetched to a local file.
type SubjectKind = 'repo' | 'dir' | 'file' | 'url';

type Subject = {
  kind: SubjectKind;
  raw: string; // the input as given
  // For local subjects: the absolute path. For a file, this is the file; the
  // directory to expose to the agent is `addDir`.
  abs?: string;
  // The directory to pass to --add-dir so the agent can read the subject.
  addDir?: string;
  // For a URL subject, after fetching: the local source file the agent reads.
  sourcePath?: string;
  // A human-readable limitation note, surfaced in the prompt (e.g. SPA shell).
  note?: string;
};

const isUrl = (s: string): boolean => /^https?:\/\//i.test(s);

const expandHome = (p: string): string =>
  resolve(p.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));

// Classify the subject input without fetching anything yet.
const classify = (raw: string): {kind: SubjectKind; abs?: string} => {
  if (isUrl(raw)) return {kind: 'url'};
  const abs = expandHome(raw);
  if (!existsSync(abs)) return {kind: 'file', abs}; // reported as missing later
  const st = statSync(abs);
  if (st.isFile()) return {kind: 'file', abs};
  // A directory: a git repo if it has .git, otherwise a knowledge base.
  return {kind: existsSync(join(abs, '.git')) ? 'repo' : 'dir', abs};
};

// Resolve the subject — validating local paths, fetching a URL once. Throws a
// user-facing Error on a bad subject.
const resolveSubject = async (o: SurveyOpts): Promise<Subject> => {
  const {kind, abs} = classify(o.repo);

  if (kind === 'url') {
    const sourcePath = join(paths.analysis, `${o.id}.source.md`);
    console.log(`  fetching ${o.repo} → analysis/${o.id}.source.md`);
    const res = await fetchSource(o.repo, sourcePath);
    if (res.note) console.warn(`  \x1b[33m⚠\x1b[0m  ${res.note.split('\n')[0]}`);
    else console.log(`  fetched ${res.bytes} chars of readable text`);
    return {
      kind,
      raw: o.repo,
      sourcePath,
      addDir: paths.analysis,
      note: res.note,
    };
  }

  if (!abs || !existsSync(abs)) {
    throw new Error(`subject not found: ${abs ?? o.repo}`);
  }

  if (kind === 'file') {
    // Expose the file's directory so the agent can read it; name the file.
    return {kind, raw: o.repo, abs, addDir: resolve(abs, '..')};
  }

  // A directory — repo or knowledge base.
  return {kind, raw: o.repo, abs, addDir: abs};
};

// The subject block of the prompt — names the subject in the agent-appropriate
// framing for the mode.
const subjectBlock = (o: SurveyOpts, subject: Subject): string[] => {
  if (o.mode === 'ex') {
    const lines: string[] = ['SUBJECT — content to be explained, not code to trace:'];
    if (subject.kind === 'url') {
      lines.push(
        `  Source page: ${subject.raw}`,
        `    Fetched for you to: analysis/${o.id}.source.md`,
        `    Read that file — it is the readable text of the page.`,
      );
      if (subject.note) {
        lines.push(
          `    LIMITATION: the fetch was degraded (likely a JavaScript-rendered`,
          `    page). Survey what is present; if it is thin, narrow the film's`,
          `    claim to what the source actually supports and say so.`,
        );
      }
    } else if (subject.kind === 'file') {
      lines.push(
        `  Document: ${subject.abs}`,
        `    A single piece of content — a chapter, an essay, a post. Read it`,
        `    closely. This is the idea to interrogate.`,
      );
    } else {
      // dir — a wiki / knowledge base
      lines.push(
        `  Knowledge base: ${subject.abs}`,
        `    A directory of content — a wiki, a docs tree, a book. Start from`,
        `    its index or table of contents, follow the links, map the`,
        `    territory, then resolve ONE explainable unit (see section 0 of the`,
        `    survey method).`,
      );
    }
    lines.push(
      `  Task: an explainer film — interrogate the idea, do not merely relay it.`,
    );
    return lines;
  }

  // pr / ar — a code repository (today's behavior).
  const task =
    o.mode === 'pr'
      ? `a PR review of pull request #${o.pr ?? '(unspecified)'}`
      : o.subsystem
        ? `an architecture review of the "${o.subsystem}" subsystem`
        : `an architecture review of the whole system`;
  return [
    'SUBJECT:',
    `  Repository: ${subject.abs}`,
    `    Read-only. Trace the real code, the real build manifest, the real history.`,
    `  Task: ${task}.`,
  ];
};

const buildPrompt = (o: SurveyOpts, subject: Subject): string => {
  const isEx = o.mode === 'ex';
  const example = o.mode === 'pr' ? 'films/kubernetes-pr.json' : 'films/kubernetes.json';
  const surveyDoc = isEx
    ? 'packages/agent/prompts/survey-explainer.md'
    : 'packages/agent/prompts/survey-template.md';
  const surveyDesc = isEx
    ? 'the explainer survey — a non-code subject; fill every section'
    : 'the structured survey — fill every section';

  // depthcheck (step 3) treats a non-PR spec like an architecture review: it
  // hard-fails without a `tension` scene and without trade-off language
  // ("chose X over Y", "rejected", "instead of", "at the cost of"). In
  // explainer mode that maps onto the idea: the tension scene carries the
  // rival explanation / the boundary where the idea breaks, phrased as a
  // trade-off ("this account is chosen over X, at the cost of Z").
  const depthLine = isEx
    ? `     schema and clear the depth contract — which, for a non-PR spec, requires`
    : `     schema and clear the depth contract: a sketch reasoning scene, a quantified`;
  const depthLine2 = isEx
    ? `     a tension scene (the rival idea or the boundary where the idea breaks,`
    : `     claim, failure-mode language, and a verdict that adjudicates (PR) or an`;
  const depthLine3 = isEx
    ? `     phrased as a trade-off: "this account is chosen over X, at the cost of Z"),`
    : `     honest scorecard (architecture).`;
  const depthLine4 = isEx
    ? `     a concrete quantified or grounded claim, failure/limit language, and a`
    : null;
  const depthLine5 = isEx
    ? `     recap that adjudicates the idea — a stated position, not "this is interesting".`
    : null;

  return [
    `You are docent's survey-and-author agent. Produce one film spec the docent`,
    isEx
      ? `engine can render — by surveying the real content, never by guessing.`
      : `engine can render — by surveying real code, never by guessing.`,
    ``,
    `BRIEF — read these files in your working directory (the docent repo) first:`,
    `  packages/agent/instructions/docent.md      the review method`,
    `  ${surveyDoc}  ${surveyDesc}`,
    `  packages/engine/schema/film.schema.json    the spec contract`,
    `  ${example}   the worked example — match this exact format and scene directives`,
    ...(isEx
      ? [
          ``,
          `NOTE: the worked example is a code subject. The SCENE GRAMMAR is general —`,
          `reuse the format, the scene types, the beat directives. Do NOT force code`,
          `concepts (closeup on source, diff) onto a non-code idea. An explainer leans`,
          `on frame, structure, progression, compare, quantities, probe, tension, recap.`,
        ]
      : []),
    ``,
    ...subjectBlock(o, subject),
    ``,
    `STEPS:`,
    `  1. Survey the subject. Write survey notes to analysis/${o.id}.md, following`,
    `     every section of the survey method (including the hard parts).`,
    `  2. Author films/${o.id}.json — a 6-8 scene film. It MUST validate against the`,
    depthLine,
    depthLine2,
    depthLine3,
    ...(depthLine4 ? [depthLine4] : []),
    ...(depthLine5 ? [depthLine5] : []),
    `  3. Self-check — run:  bun packages/engine/cli/docent.ts depthcheck ${o.id}`,
    `     Revise films/${o.id}.json until it reports the depth contract met, no failures.`,
    `  4. Do NOT run TTS or a full render — the harness does that.`,
    ``,
    `Write only films/${o.id}.json and analysis/${o.id}.md. Print DONE when finished.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
};

export const survey = async (o: SurveyOpts): Promise<number> => {
  if (o.agent !== 'claude' && o.agent !== 'codex') {
    console.error(`\x1b[31m✗\x1b[0m unknown agent "${o.agent}" — use claude or codex`);
    return 1;
  }
  if (!Bun.which(o.agent)) {
    console.error(`\x1b[31m✗\x1b[0m ${o.agent} not on PATH`);
    return 1;
  }
  if (o.mode !== 'pr' && o.mode !== 'ar' && o.mode !== 'ex') {
    console.error(`\x1b[31m✗\x1b[0m unknown mode "${o.mode}" — use pr, ar or ex`);
    return 1;
  }
  if (o.mode === 'ex' && (o.subsystem || o.pr)) {
    console.warn(`\x1b[33m⚠\x1b[0m  --subsystem/--pr are ignored in explainer mode`);
  }

  let subject: Subject;
  try {
    subject = await resolveSubject(o);
  } catch (e) {
    console.error(`\x1b[31m✗\x1b[0m ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const specPath = join(paths.films, `${o.id}.json`);
  const prompt = buildPrompt(o, subject);
  const subjectLabel =
    subject.kind === 'url' ? subject.raw : basename(subject.abs ?? subject.raw);
  console.log(
    `\x1b[1mdocent survey\x1b[0m — ${o.agent} · ${o.mode}` +
      `${o.subsystem ? `/${o.subsystem}` : ''} · ${subject.kind} · ` +
      `${subjectLabel} → films/${o.id}.json\n`,
  );
  const t0 = performance.now();

  // Each agent's headless invocation. Both run with the docent repo as the
  // working root (to write films/<id>.json) and read access to the subject;
  // the brief reaches the agent through the prompt. --add-dir exposes the
  // subject directory (a repo, a knowledge base, a file's parent, or the
  // analysis/ dir holding a fetched URL source).
  const addDir = subject.addDir;
  const cmd =
    o.agent === 'claude'
      ? ['claude', '-p', prompt,
         ...(addDir ? ['--add-dir', addDir] : []),
         '--permission-mode', 'bypassPermissions',
         '--model', 'opus']
      : ['codex', 'exec', prompt,
         '-C', REPO_ROOT,
         '--dangerously-bypass-approvals-and-sandbox'];
  const proc = Bun.spawn(cmd, {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
  const timeoutMin = o.timeoutMin ?? 30;
  const killer = setTimeout(() => {
    console.error(`\n\x1b[31m✗\x1b[0m survey exceeded ${timeoutMin}m — killing the agent`);
    proc.kill();
  }, timeoutMin * 60_000);
  const code = await proc.exited;
  clearTimeout(killer);
  const wall = (performance.now() - t0) / 1000;
  console.log(`\n  agent exited ${code} · ${wall.toFixed(0)}s wall`);

  if (!existsSync(specPath)) {
    console.error(`\x1b[31m✗\x1b[0m survey produced no films/${o.id}.json`);
    return 1;
  }
  let spec: unknown;
  try {
    spec = await Bun.file(specPath).json();
  } catch (e) {
    console.error(`\x1b[31m✗\x1b[0m films/${o.id}.json is not valid JSON: ${e}`);
    return 1;
  }
  const issues = validateSpec(spec);
  const ds = depthSummary(runDepthCheck(spec as Parameters<typeof runDepthCheck>[0]));
  console.log(
    `  schema:  ${issues.length === 0 ? '\x1b[32mvalid\x1b[0m' : `\x1b[31m${issues.length} issue(s)\x1b[0m`}`,
  );
  console.log(
    `  depth:   ${ds.fail === 0 ? `\x1b[32mcontract met ${ds.ok}/${ds.total}\x1b[0m` : `\x1b[31m${ds.fail} fail\x1b[0m`}`,
  );
  const ok = issues.length === 0 && ds.fail === 0;
  console.log(ok ? `\x1b[32m✔ survey produced a valid, depth-clean spec\x1b[0m` : `\x1b[31m✗ spec needs work\x1b[0m`);
  return ok ? 0 : 1;
};
