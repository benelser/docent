#!/usr/bin/env bun
// docent — turn a codebase or a pull request into a narrated, animated
// explainer. The CLI orchestrates; the cascade renders; the agent layer
// (distributed via APM) authors the spec.
//
//   docent doctor [--json]            validate the environment
//   docent build  <film> [--still N]  run the cascade for a known spec
//   docent pr     <repo> <pr#>        PR-review film
//   docent ar     <repo> [subsystem]  architecture-review film
//   docent score  <owner/repo> <pr#>  the triggering matrix — no render
//   docent env                        resolved paths and versions

import {existsSync} from 'node:fs';
import {basename, join} from 'node:path';
import {ENGINE_ROOT, REPO_ROOT, paths} from './paths';
import {doctor} from './doctor';
import {runCascade} from './cascade';
import {scorePr} from './score';
import {hermetic} from './hermetic';
import {depthcheck} from './depthcheck';
import {survey} from './survey';
import {authorTreatment, treatmentToSpec} from './treatment';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n: string): boolean => argv.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
// positionals — args that are neither a --flag nor a value consumed by one.
const VALUE_FLAGS = new Set(['scale', 'still', 'mode', 'subsystem', 'pr', 'agent', 'id', 'feedback', 'subject']);
const positionals: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (VALUE_FLAGS.has(a.slice(2))) i++;
    continue;
  }
  positionals.push(a);
}
const num = (s: string | undefined): number | undefined => (s === undefined ? undefined : Number(s));

const die = (msg: string): never => {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
};

// Map a repo reference + mode to a film id. The agent layer will author new
// specs; until it is wired, an id with an existing films/<id>.json renders.
const filmId = (repo: string, mode: 'pr' | 'ar', subsystem?: string): string => {
  const key = basename(repo).replace(/\.git$/, '').toLowerCase();
  if (mode === 'pr') return `${key}-pr`;
  return subsystem ? `${key}-${subsystem.toLowerCase()}` : key;
};

const knownFilms = (): string[] =>
  [...new Bun.Glob('*.json').scanSync(paths.films)].map((f) => f.replace(/\.json$/, '')).sort();

const buildOrExplain = async (
  id: string,
  invocation: string,
  opts: {still?: number; scale?: number},
): Promise<void> => {
  if (!existsSync(join(paths.films, `${id}.json`))) {
    console.error(`\x1b[33m⚠\x1b[0m  no spec for "${id}" (films/${id}.json does not exist).`);
    console.error(`   ${invocation} needs the survey step — the docent-agent APM package`);
    console.error(`   (task 5) authors the spec from the repo. Specs that render today:`);
    console.error(`   ${knownFilms().join(', ')}`);
    process.exit(2);
  }
  const result = await runCascade({film: id, still: opts.still, scale: opts.scale});
  console.log(`\n\x1b[1m🎬 ${result.output}\x1b[0m`);
  console.log(`   ${result.stages.map((s) => `${s.name} ${s.seconds.toFixed(1)}s`).join('  ·  ')}`);
};

const main = async (): Promise<number> => {
  switch (cmd) {
    case 'doctor':
      return doctor(flag('json'));

    case 'env':
      console.log('docent — resolved environment');
      console.log(`  REPO_ROOT    ${REPO_ROOT}`);
      console.log(`  ENGINE_ROOT  ${ENGINE_ROOT}`);
      console.log(`  bun          ${Bun.version}`);
      console.log(`  films        ${knownFilms().length} specs in ${paths.films}`);
      console.log(`  out          ${paths.out}`);
      return 0;

    case 'build': {
      const id = positionals[0] ?? die('usage: docent build <film> [--still N] [--scale S]');
      await buildOrExplain(id, `build ${id}`, {still: num(opt('still')), scale: num(opt('scale'))});
      return 0;
    }

    case 'pr': {
      const repo = positionals[0] ?? die('usage: docent pr <repo> <pr#>');
      const pr = positionals[1] ?? die('usage: docent pr <repo> <pr#>');
      const id = filmId(repo, 'pr');
      console.log(`docent — PR review · ${repo}#${pr} · film "${id}"\n`);
      await buildOrExplain(id, `docent pr ${repo} ${pr}`, {scale: num(opt('scale'))});
      return 0;
    }

    case 'ar': {
      const repo = positionals[0] ?? die('usage: docent ar <repo> [subsystem]');
      const subsystem = positionals[1];
      const id = filmId(repo, 'ar', subsystem);
      console.log(
        `docent — architecture review · ${repo}${subsystem ? ` / ${subsystem}` : ''} · film "${id}"\n`,
      );
      await buildOrExplain(id, `docent ar ${repo}${subsystem ? ` ${subsystem}` : ''}`, {
        scale: num(opt('scale')),
      });
      return 0;
    }

    case 'score': {
      const repo = positionals[0] ?? die('usage: docent score <owner/repo> <pr#>');
      const pr = positionals[1] ?? die('usage: docent score <owner/repo> <pr#>');
      const s = await scorePr(repo, Number(pr));
      const tint = {skip: '\x1b[90m', glance: '\x1b[36m', full: '\x1b[35m'}[s.tier];
      console.log(`docent score — ${s.repo}#${s.pr}`);
      console.log(`  ${s.title}`);
      console.log(
        `  ${s.files} files (${s.logicFiles} logic) · ${s.logicLines} logic lines · ${s.subsystems} subsystem(s)`,
      );
      console.log(`  → ${tint}${s.tier.toUpperCase()}\x1b[0m — ${s.reasons.join('; ')}`);
      return 0;
    }

    case 'depthcheck': {
      const id = positionals[0] ?? die('usage: docent depthcheck <film>');
      return depthcheck(id, flag('json'));
    }

    case 'survey': {
      const subject =
        positionals[0] ??
        die('usage: docent survey <subject> [--mode pr|ar|ex] [--subsystem X] [--pr N] [--agent claude] [--id X]');
      const mode = (opt('mode') as 'pr' | 'ar' | 'ex') ?? 'ar';
      const agent = (opt('agent') as 'claude' | 'codex') ?? 'claude';
      const subsystem = opt('subsystem');
      const pr = opt('pr');
      // A film id slugged from the subject — works for a repo path, a wiki
      // directory, a single file, or a URL.
      const key = basename(subject)
        .replace(/\.(git|html?|md|json|txt)$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const id =
        opt('id') ??
        (mode === 'pr' ? `${key}-pr` : subsystem ? `${key}-${subsystem.toLowerCase()}` : key);
      return survey({repo: subject, mode, subsystem, pr, agent, id});
    }

    case 'treatment': {
      const id =
        positionals[0] ??
        die('usage: docent treatment <id> [--feedback "..."] [--to-spec] [--agent claude]');
      const agent = (opt('agent') as 'claude' | 'codex') ?? 'claude';
      return flag('to-spec')
        ? treatmentToSpec({id, agent})
        : authorTreatment({id, agent, subject: opt('subject'), feedback: opt('feedback')});
    }

    case 'hermetic': {
      const scale = num(opt('scale')) ?? (flag('full') ? 1 : 0.5);
      return hermetic({fixtureId: positionals[0], scale, json: flag('json')});
    }

    default:
      console.log('docent — narrated, animated explainers for code\n');
      console.log('  docent doctor [--json]            validate the environment');
      console.log('  docent build  <film> [--still N]  run the cascade for a known spec');
      console.log('  docent pr     <repo> <pr#>        PR-review film');
      console.log('  docent ar     <repo> [subsystem]  architecture-review film');
      console.log('  docent score  <owner/repo> <pr#>  the triggering matrix — no render');
      console.log('  docent survey <subject> [--mode]  headless survey → a spec (pr/ar/ex)');
      console.log('  docent treatment <id> [--to-spec] scope a film — human in the loop');
      console.log('  docent depthcheck <film>          the depth contract over a spec');
      console.log('  docent hermetic [id] [--full]     end-to-end cascade validation');
      console.log('  docent env                        resolved paths and versions');
      return cmd ? 1 : 0;
  }
};

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`\x1b[31m✗\x1b[0m ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
