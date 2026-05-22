// docent survey — the headless-survey wiring.
//
// Invokes a coding agent headlessly, with the docent-agent brief as its
// context, to survey a repository and author films/<id>.json. This is the
// survey stage of the cascade made *programmatic*: a survey runs hermetically
// — pinned repo, pinned brief, pinned model — instead of a human driving an
// interactive agent.
//
// The survey is an LLM: it can be hermetically *run* but not deterministically
// *reproduced*. The harness validates that the run completes and the output
// clears the schema + depth contract; the agent-to-agent axis is a quality
// comparison, not an equality check.

import {existsSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {validateSpec} from './validate';
import {runDepthCheck, depthSummary} from './depthcheck';

export type SurveyOpts = {
  repo: string;
  mode: 'pr' | 'ar';
  subsystem?: string;
  pr?: string;
  agent: 'claude' | 'codex';
  id: string;
  timeoutMin?: number;
};

const buildPrompt = (o: SurveyOpts, repoAbs: string): string => {
  const example = o.mode === 'pr' ? 'films/kubernetes-pr.json' : 'films/kubernetes.json';
  const task =
    o.mode === 'pr'
      ? `a PR review of pull request #${o.pr ?? '(unspecified)'}`
      : o.subsystem
        ? `an architecture review of the "${o.subsystem}" subsystem`
        : `an architecture review of the whole system`;
  return [
    `You are docent's survey-and-author agent. Produce one film spec the docent`,
    `engine can render — by surveying real code, never by guessing.`,
    ``,
    `BRIEF — read these files in your working directory (the docent repo) first:`,
    `  packages/agent/instructions/docent.md      the review method`,
    `  packages/agent/prompts/survey-template.md  the structured survey — fill every section`,
    `  packages/engine/schema/film.schema.json    the spec contract`,
    `  ${example}   the worked example — match this exact format and scene directives`,
    ``,
    `SUBJECT:`,
    `  Repository: ${repoAbs}`,
    `    Read-only. Trace the real code, the real build manifest, the real history.`,
    `  Task: ${task}.`,
    ``,
    `STEPS:`,
    `  1. Survey the repository. Write survey notes to analysis/${o.id}.md, following`,
    `     every section of the survey template (including the hard parts).`,
    `  2. Author films/${o.id}.json — a 6-8 scene film. It MUST validate against the`,
    `     schema and clear the depth contract: a sketch reasoning scene, a quantified`,
    `     claim, failure-mode language, and a verdict that adjudicates (PR) or an`,
    `     honest scorecard (architecture).`,
    `  3. Self-check — run:  bun packages/engine/cli/docent.ts depthcheck ${o.id}`,
    `     Revise films/${o.id}.json until it reports the depth contract met, no failures.`,
    `  4. Do NOT run TTS or a full render — the harness does that.`,
    ``,
    `Write only films/${o.id}.json and analysis/${o.id}.md. Print DONE when finished.`,
  ].join('\n');
};

export const survey = async (o: SurveyOpts): Promise<number> => {
  const repoAbs = resolve(o.repo.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  if (!existsSync(repoAbs)) {
    console.error(`\x1b[31m✗\x1b[0m repo not found: ${repoAbs}`);
    return 1;
  }
  if (o.agent !== 'claude' && o.agent !== 'codex') {
    console.error(`\x1b[31m✗\x1b[0m unknown agent "${o.agent}" — use claude or codex`);
    return 1;
  }
  if (!Bun.which(o.agent)) {
    console.error(`\x1b[31m✗\x1b[0m ${o.agent} not on PATH`);
    return 1;
  }

  const specPath = join(paths.films, `${o.id}.json`);
  const prompt = buildPrompt(o, repoAbs);
  console.log(
    `\x1b[1mdocent survey\x1b[0m — ${o.agent} · ${o.mode}${o.subsystem ? `/${o.subsystem}` : ''} · ` +
      `${basename(repoAbs)} → films/${o.id}.json\n`,
  );
  const t0 = performance.now();

  // Each agent's headless invocation. Both run with the docent repo as the
  // working root (to write films/<id>.json) and full filesystem access (to
  // read the target repo); the brief reaches the agent through the prompt.
  const cmd =
    o.agent === 'claude'
      ? ['claude', '-p', prompt,
         '--add-dir', repoAbs,
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
