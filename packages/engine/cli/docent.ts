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
import {hermeticFreshUser, type FreshUserTarget} from './fresh-user';
import {hermeticExplain, type ExplainTarget} from './hermetic-explain';
import {depthcheck} from './depthcheck';
import {survey} from './survey';
import {authorTreatment, treatmentToSpec} from './treatment';
import {judge, reviseLoop} from './judge';
import {flywheel} from './flywheel';
import {preflight} from './preflight';
import {runStyle} from './style';
import {hermeticStyle} from './hermetic-style';
import {runSceneFit} from './scene-fit';
import {hermeticSceneFit} from './hermetic-scene-fit';
import {runTts} from './tts';
import {hermeticTts} from './hermetic-tts';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n: string): boolean => argv.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
// positionals — args that are neither a --flag nor a value consumed by one.
const VALUE_FLAGS = new Set(['scale', 'still', 'mode', 'subsystem', 'pr', 'agent', 'id', 'feedback', 'subject', 'max-rounds', 'target']);
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
      return doctor(flag('json'), {install: flag('install'), yes: flag('yes')});

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
      // Default agent: prefer the host we're running under. Codex sets
      // CODEX_* env vars; Claude Code sets CLAUDE_* / runs inside a session
      // tagged via CLAUDECODE. Fall back to whichever is on PATH; final
      // fallback is claude (the historic default).
      const detectAgent = (): 'claude' | 'codex' => {
        if (process.env.CODEX || process.env.CODEX_HOME || process.env.CODEX_SESSION_ID) return 'codex';
        if (process.env.CLAUDE_CODE || process.env.CLAUDECODE) return 'claude';
        if (Bun.which('claude')) return 'claude';
        if (Bun.which('codex')) return 'codex';
        return 'claude';
      };
      const agent = (opt('agent') as 'claude' | 'codex') ?? detectAgent();
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
      // Same auto-detect logic as `survey` — pick the host we're under.
      const detectTreatmentAgent = (): 'claude' | 'codex' => {
        if (process.env.CODEX || process.env.CODEX_HOME || process.env.CODEX_SESSION_ID) return 'codex';
        if (process.env.CLAUDE_CODE || process.env.CLAUDECODE) return 'claude';
        if (Bun.which('claude')) return 'claude';
        if (Bun.which('codex')) return 'codex';
        return 'claude';
      };
      const agent = (opt('agent') as 'claude' | 'codex') ?? detectTreatmentAgent();
      return flag('to-spec')
        ? treatmentToSpec({id, agent})
        : authorTreatment({id, agent, subject: opt('subject'), feedback: opt('feedback')});
    }

    case 'judge': {
      const id = positionals[0] ?? die('usage: docent judge <id> [--agent claude]');
      const agent = (opt('agent') as 'claude' | 'codex') ?? 'claude';
      // A single graded verdict — the depth-review sub-agent, finally invoked.
      const verdict = await judge({id, agent});
      return verdict.pass ? 0 : 1;
    }

    case 'review': {
      const id =
        positionals[0] ??
        die('usage: docent review <id> [--max-rounds N] [--agent claude]');
      const agent = (opt('agent') as 'claude' | 'codex') ?? 'claude';
      const maxRounds = num(opt('max-rounds'));
      // The inner loop — judge → revise → re-judge, bounded.
      return reviseLoop({id, agent, maxRounds});
    }

    case 'flywheel':
      // The outer-loop dashboard — what is *consistently* falling short.
      return flywheel();

    case 'hermetic': {
      if (flag('fresh-user')) {
        const rawTarget = opt('target') ?? 'claude';
        if (rawTarget !== 'claude' && rawTarget !== 'codex' && rawTarget !== 'all') {
          die(`--target must be claude | codex | all (got: ${rawTarget})`);
        }
        const {code} = await hermeticFreshUser({
          target: rawTarget as FreshUserTarget,
          keep: flag('keep'),
        });
        return code;
      }
      if (flag('explain')) {
        // `docent hermetic --explain <url> --target all` — the end-to-end
        // Go Live gate. Runs the FULL skill cascade per agent host and
        // asserts an mp4 lands on disk. ~30-50 min for --target all.
        const url = positionals[0] ?? opt('url') ?? die('usage: docent hermetic --explain <url> [--target claude|codex|all] [--mode pr|ar|ex] [--id slug] [--scale S]');
        const rawTarget = opt('target') ?? 'all';
        if (rawTarget !== 'claude' && rawTarget !== 'codex' && rawTarget !== 'all') {
          die(`--target must be claude | codex | all (got: ${rawTarget})`);
        }
        const rawMode = opt('mode') ?? 'ex';
        if (rawMode !== 'pr' && rawMode !== 'ar' && rawMode !== 'ex') {
          die(`--mode must be pr | ar | ex (got: ${rawMode})`);
        }
        const scale = num(opt('scale')) ?? 0.5;
        const id = opt('id');
        const {code} = await hermeticExplain({
          url,
          target: rawTarget as ExplainTarget,
          mode: rawMode as 'pr' | 'ar' | 'ex',
          scale,
          id,
        });
        return code;
      }
      const scale = num(opt('scale')) ?? (flag('full') ? 1 : 0.5);
      return hermetic({fixtureId: positionals[0], scale, json: flag('json')});
    }

    case 'style':
      // `docent style list | resolve | recommend` — the agent-facing
      // introspection surface over packages/engine/src/style. Delegates to
      // ./style.ts; argv[1..] is the subcommand and its flags.
      return runStyle(argv.slice(1));

    case 'hermetic-style':
      // The style-fixture harness — three synthetic surveys + a resolve probe
      // per preset, all green or none.
      return hermeticStyle({json: flag('json')});

    case 'scene-fit':
      // `docent scene-fit list | recommend` — the agent-facing introspection
      // surface over the 29-scene grammar. Mirrors `docent style` one layer
      // down: closes the "which scene types fit?" loop the agent had no
      // handle on. Delegates to ./scene-fit.ts.
      return runSceneFit(argv.slice(1));

    case 'hermetic-scene-fit':
      // The scene-fit fixture harness — 10 synthetic surveys, one per
      // cognitive cluster, asserting the recommender pulls the expected
      // scene type into the top N with a rationale that cites the signal
      // needle. All green or none.
      return hermeticSceneFit({json: flag('json')});

    case 'tts':
      // `docent tts list-providers | list-voices | synth` — the agent-facing
      // introspection surface over the TTS adapter layer. Mirrors style /
      // scene-fit. Delegates to ./tts.ts.
      return runTts(argv.slice(1));

    case 'hermetic-tts':
      // Per-provider smoke gallery. Kokoro green by default; the paid
      // providers skip cleanly when their credentials are absent.
      return hermeticTts({json: flag('json')});

    case 'preflight':
      return preflight();

    default:
      console.log('docent — narrated, animated explainers for code\n');
      console.log('  docent doctor [--json] [--install [--yes]]  validate (or bootstrap) the environment');
      console.log('  docent build  <film> [--still N]  run the cascade for a known spec');
      console.log('  docent pr     <repo> <pr#>        PR-review film');
      console.log('  docent ar     <repo> [subsystem]  architecture-review film');
      console.log('  docent score  <owner/repo> <pr#>  the triggering matrix — no render');
      console.log('  docent survey <subject> [--mode]  headless survey → a spec (pr/ar/ex)');
      console.log('  docent treatment <id> [--to-spec] scope a film — human in the loop');
      console.log('  docent judge <id> [--agent]       grade a spec — the depth-review judge');
      console.log('  docent review <id> [--max-rounds] the inner loop: judge → revise → repeat');
      console.log('  docent flywheel                   the outer loop — recurring failures');
      console.log('  docent depthcheck <film>          the depth contract over a spec');
      console.log('  docent style <list|resolve|recommend>  styling-resolver introspection (agent-facing)');
      console.log('  docent scene-fit <list|recommend> scene-grammar introspection — which scenes fit this subject');
      console.log('  docent tts <list-providers|list-voices|synth>  TTS adapter introspection');
      console.log('  docent env                        resolved paths and versions');
      console.log('');
      console.log('  internal-test commands (not part of the user-facing surface):');
      console.log('    docent hermetic [id]            cascade harness against pinned gallery fixtures');
      console.log('    docent hermetic --fresh-user    simulate install path in a tmpdir [--target claude|codex|all]');
      console.log('    docent hermetic --explain <url> full skill cascade per agent host [--target all]');
      console.log('    docent hermetic-style           style-recommendation fixture sweep (3 synthetic surveys + resolve)');
      console.log('    docent hermetic-scene-fit       scene-fit fixture sweep (10 synthetic surveys, one per cluster)');
      console.log('    docent hermetic-tts             TTS provider smoke gallery (kokoro green; paid providers skip without creds)');
      console.log('    docent preflight                aggregate Go Live readiness check');
      return cmd ? 1 : 0;
  }
};

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`\x1b[31m✗\x1b[0m ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
