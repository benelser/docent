#!/usr/bin/env bun
// @bjelser/cli — the thin CLI shell for docent.
//
// Subcommand routing on top of `@bjelser/kit`'s public Engine surface. Every
// subcommand is a few lines: parse args, call into a command module, exit
// with a meaningful code.
//
// The CLI is INTENTIONALLY THIN. It owns no domain logic — that lives in
// `@bjelser/kit` (the framework) and `@bjelser/core` (the default plugin
// pack). The CLI's only opinionated choice: loading `@bjelser/core` by
// default, plus any `docent.config.ts` the project ships.

import {runAssert} from './commands/assert';
import {runAssertNarrative} from './commands/assert-narrative';
import {runBuild} from './commands/build';
import {runCi} from './commands/ci';
import {runDepthcheck} from './commands/depthcheck';
import {runDoctor} from './commands/doctor';
import {runFcpxml} from './commands/fcpxml';
import {
  parsePlatformList,
  runDripAdd,
  runDripCancel,
  runDripList,
  runDripStatus,
  runDripTick,
} from './commands/drip';
import {runGrammarCheck} from './commands/grammar-check';
import {runHelpScene} from './commands/help-scene';
import {runHermetic} from './commands/hermetic';
import {runInit} from './commands/init';
import {runInitConfig, type InitConfigKind} from './commands/init-config';
import {runPreview} from './commands/preview';
import {runRenderCheck} from './commands/render-check';
import {runSceneFitList, runSceneFitRecommend} from './commands/scene-fit';
import {runStyleList, runStyleRecommend} from './commands/style';
import {runTreatment} from './commands/treatment';
import {runScore} from './commands/score';
import {runValidate} from './commands/validate';
import {runWatch} from './commands/watch';

const USAGE = `docent — render explanatory films via @bjelser/kit.

USAGE
  docent <command> [args]

AUTHOR FLOW
  The three-step author cycle is:

      analysis/<id>.md   →   treatments/<id>.md   →   films/<id>.json
        survey                 treatment                 spec

  Survey by hand (or with the agent) into analysis/<id>.md. Run
  \`docent treatment <id>\` to scaffold the plain-language treatment.
  Edit it. Then \`docent treatment <id> --to-spec\` to compile to the
  renderable spec. \`docent validate <id>\` and \`docent build <id>\`
  finish the cycle.

COMMANDS
  init <film-id>          Scaffold a starter spec at films/<film-id>.json.
                          The fastest path from "bun add" to a rendered MP4 —
                          drops a working 4-scene film (frame, structure,
                          tension, recap) that builds out of the box. Edit
                          the narration + nodes, then "docent build <id>".
  init-config             Scaffold a starter docent.config.ts at the project
                          root with worked examples for every plugin kind
                          (preset, scene, feature, tts). The on-ramp for
                          shipping a brand pack or third-party plugin
                          without forking @bjelser/core. Pass
                          --with preset|scene|feature|tts to scaffold one
                          kind only.
  treatment <id>          Scaffold treatments/<id>.md from analysis/<id>.md —
                          a plain-language outline the human reads, edits,
                          and steers WITHOUT ever seeing JSON. The
                          human-in-the-loop layer of the author flow.
  treatment <id> --to-spec
                          Compile the approved treatments/<id>.md to
                          films/<id>.json — walks the scene list and
                          emits placeholder scenes for the spec author.
  build <film-id>         Render a film to MP4 at out/<film-id>.mp4.
  preview <film-id>       Launch Remotion Studio against the film spec for
                          hot-reload editing. Component edits hot-reload via
                          Studio's dev server; spec edits require re-running
                          preview. Defaults to http://localhost:3000.
  watch <film-id>         Watch films/<id>.json (+ docent.config.ts if present)
                          and re-run validate + depthcheck + build on every
                          save. Pass --no-build to skip the render (pairs
                          well with "docent preview", since Remotion Studio
                          re-renders frames itself). Ctrl+C to stop.
  validate <film-id>      Structurally validate a film spec via engine.validate().
  depthcheck <film-id>    Aggregate every plugin's depthRules over a film spec.
  render-check <film-id>  Render at low scale + assert every narrated scene
                          evolves visibly across its window. Guards against
                          chrome-only renders (audio without body).
  assert <film-id>        Visual regression test: extract one frame per scene
                          at its midpoint and diff each against the committed
                          golden in golden/<film-id>/. First run (or --update)
                          captures the goldens; subsequent runs exit 2 if any
                          scene exceeds --threshold mean abs pixel diff.
  assert <film-id> --narrative
                          Narrative-quality cascade: lint every beat for
                          filler / hedge / tic / opener / anaphora; pass
                          --judges to add the LLM voice / accuracy / viz
                          checks. Exit 0 PASS, 2 REJECT, 3 HUMAN_REVIEW.
  grammar-check           Run the cover-set of demo films and assert three
                          invariants across the registered scene library:
                          coverage (every plugin exercised), taxonomy
                          (every plugin declares a valid cognitive cluster),
                          pipeline (every cover-set film renders + passes
                          render-check).
  scene-fit list          Enumerate registered scene plugins by cluster.
  scene-fit recommend     Read analysis/<id>.md + recommend scene types.
                          The agent-facing introspection over the grammar.
  style list              Enumerate registered presets + the intent axes.
  style recommend         Read analysis/<id>.md + recommend a preset.
  doctor                  Plugin conformance + setup diagnostics. Grades
                          every registered plugin against the protocol
                          contract; surfaces missing cues, empty signals,
                          bad clusters, registry conflicts. Exit 6 on error.
  score <film-id>         Emit a timeline-annotated music-gen prompt for
                          the film. Walks the schedule, tags rhetorical
                          moves (open / develop / inflect / pull-back /
                          boom / resolve), and renders the IR into the
                          provider's dialect. --provider aiva|udio|suno|
                          template (default template). --write persists
                          to out/<id>-score-prompt.{txt,json}. --validate
                          gates emit on the content-filter rules
                          (ALL-CAPS, banned terms, adjective stacking).
                          --json emits the full IR + body for tooling.
                          Music-gen APIs are NEVER called — gate behind
                          --execute (not implemented; deliberate safety).
  fcpxml <film-id>        Emit an FCPXML 1.11 editorial sidecar for the
                          rendered film at out/<film-id>.fcpxml — drop it
                          into DaVinci Resolve / Final Cut Pro / Premiere
                          to see the docent structure on a real timeline.
                          One asset-clip per scene on V1 (so the editor
                          sees cuts at scene boundaries) + per-beat audio
                          asset-clips on A1 (each TTS line is its own
                          mutable clip) + chapter markers at scenes, gray
                          markers at beats, orange "to-do" markers at
                          big-idea scenes (tension / recap / closeup).
                          Reads the persisted TTS manifest if present so
                          beat lengths reflect real synth time. --out
                          overrides the output path.
  hermetic                Render the 4 gallery fixtures end to end.
  ci                      Hermetic /tmp smoke against the PUBLISHED package
                          (or worktree via --local). The dogfood gate — runs
                          \`bun add @bjelser/*@latest\` into an empty project,
                          then walks init → validate → depthcheck → build →
                          assert → translate → portrait. Catches the bug
                          classes that worktree smoke tests cannot see
                          (webpack-bundling errors, missing published files,
                          peer-dep mismatches). Exit 2 on any failure;
                          tmpdir kept on red for inspection.
  drip add <film-id>      Queue a built film for scheduled publication.
                          --schedule "<cadence> HH:MM <tz>" (e.g.
                          "MWF 15:00 America/Chicago"), or "@<ISO>" for
                          a one-shot, or "cron: 0 15 * * 1" for cron.
                          --platform docent-studio,youtube (csv).
  drip list               Print the queue with status + next-fire-time
                          per entry. --json for machine output.
  drip status <film-id>   Show the full history of an entry (status,
                          attempts, per-platform results).
  drip cancel <film-id>   Mark an entry "skipped" so the tick stops
                          considering it.
  drip tick               Wake the queue. Find every pending entry whose
                          scheduled time has elapsed, run its platform
                          adapters, update status. --mock skips external
                          side-effects (Firebase deploy, YouTube upload)
                          but exercises the full code path. --force fires
                          every non-published entry regardless of schedule
                          (smoke-test only). Intended for cron.
  help                    Print this usage and exit.
  help <scene-type>       Surface the schema docs for a registered scene
                          plugin (description, required + optional fields,
                          beat-level open-index hooks, depth rules, and a
                          canonical example pulled from films/).

BUILD FLAGS
  --scale <n>             Render scale (0.25, 0.5, 1). Default: 1.
  --concurrency <n>       Render frame concurrency. Default: Remotion's auto.
  --still <s>             Render a single still at second offset s.
  --skip-tts              Skip the TTS stage — produces a silent mp4.
  --no-tts-cache          Disable the content-hash TTS cache for this build.
                          Default: caching is ON. Each beat is keyed by
                          SHA256(text + voice + model + providerOptions),
                          recorded in the per-film manifest, and reused
                          verbatim on the next build when the hash matches.
                          Pass this flag to force a full re-synth (e.g.
                          after a provider version bump).
  --output-dir <p>        Override the output directory.
  --films-dir <p>         Override the films/ directory.
  --project-root <p>      Override the project root (config + entry generation).
  --lang <code>           Translate narration into <code> (ISO 639-1:
                          es, fr, de, ja, zh, ...). Output filename becomes
                          out/<film-id>-<code>.mp4. Requires a translation
                          provider; the default 'noop' provider warns and
                          falls back to source narration.
  --voice <id>            Override the TTS voice (e.g. af_heart, bm_george).
                          With --lang, the CLI auto-picks from a built-in
                          lang→voice map if --voice is not given.
  --translation-provider <id>
                          Pick a registered translation provider by id.
                          Defaults to meta.translation.provider or 'noop'.

PREVIEW FLAGS
  --port <n>           Remotion Studio port. Default: 3000.
  --films-dir <p>      Override the films/ directory.
  --project-root <p>   Override the project root (config + entry generation).

WATCH FLAGS
  --no-build           Re-validate + depthcheck on save; skip the render.

ASSERT FLAGS
  --update             Capture mode: (re)write golden/<film-id>/ from the
                       current out/<film-id>.mp4. First run does this
                       implicitly when no goldens are present.
  --threshold <n>      Mean abs pixel diff threshold in [0, 1]. Default 0.05.
                       Per-scene override via spec: scenes[i].assert.threshold.
  --compare-width <n>  Width (px) frames are decoded to for diffing. Default 480.
  --golden-dir <p>     Override the goldens root. Default <project>/golden.

ASSERT --narrative FLAGS  (narrative-quality cascade)
  --narrative          Run the narration linter + verdict instead of
                       pixel-diff. Walks every beat, applies the
                       regex/structural rule set, and prints a per-scene
                       findings table. Exit 0 PASS, 2 REJECT, 3 HUMAN.
  --judges             Also run the LLM judges (voice / accuracy / viz).
                       Defaults to the noop provider — pass
                       --judge-provider openai for real grading.
  --judge-provider <id>
                       Pick a registered judge provider. Built in: noop
                       (always), openai (requires OPENAI_API_KEY and
                       @bjelser/tts-openai installed).
  --judge-beat-limit <n>
                       Cap on beats sampled per judge category. Default 20.

  Per-scene knobs (authored on each Scene in the spec, NOT a CLI flag):
    assert.threshold     Override the CLI threshold for one scene. Tighter
                         for text-heavy scenes (~0.02), looser for stochastic
                         backgrounds (~0.10).
    assert.maskRegions   Rectangles in compare-image px space (origin top-
                         left). Zeroed in both golden and candidate before
                         MAE — clean way to ignore a starfield patch.

CI FLAGS
  --local <repo>       Path to a sibling docent repo. After "bun add", overlay
                       <repo>/packages/{cli,core,kit}/src + package.json onto
                       node_modules/@bjelser/{cli,core,kit}/. The pre-push
                       contributor smoke — tests your unpublished changes
                       against a hermetic install.
  --versions <pins>    Pin versions instead of @latest. Form:
                       "cli=3.0.12,core=3.0.11,kit=3.0.4".
  --skip-portrait      Skip the 9:16 portrait variant step.
  --keep               Keep the tmpdir even on green (for inspection).

EXAMPLES
  docent build linear-algebra --scale 0.5
  docent validate kubernetes-pr
  docent depthcheck euclid-primes
  docent hermetic --scale 0.5
  docent assert docent-self --update           # capture goldens
  docent assert docent-self                    # diff against goldens
  docent assert docent-self --threshold 0.02   # tighter regression bar
  docent assert thermostat --narrative                       # lint only
  docent assert thermostat --narrative --judges              # + LLM judges (noop)
  docent assert thermostat --narrative --judges --judge-provider openai
`;

interface ParsedArgs {
  readonly command: string;
  readonly positional: ReadonlyArray<string>;
  readonly flags: Readonly<Record<string, string | boolean>>;
}

const parseArgs = (argv: ReadonlyArray<string>): ParsedArgs => {
  const args = argv.slice();
  const command = args.shift() ?? 'help';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return {command, positional, flags};
};

const num = (v: string | boolean | undefined): number | undefined =>
  typeof v === 'string' ? Number(v) : undefined;
const str = (v: string | boolean | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;

const main = async (): Promise<number> => {
  // process.argv[0] is the bun/node binary, [1] is the script path.
  const {command, positional, flags} = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    const sceneType = positional[0];
    if (sceneType) {
      return runHelpScene({
        sceneType,
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === 'init') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent init: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runInit({
      filmId,
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
      ...(flags.force ? {force: true} : {}),
    });
  }

  if (command === 'init-config') {
    const withRaw = str(flags.with);
    const allowed: ReadonlyArray<InitConfigKind> = [
      'preset',
      'scene',
      'feature',
      'tts',
    ];
    if (withRaw !== undefined && !allowed.includes(withRaw as InitConfigKind)) {
      process.stderr.write(
        `docent init-config: --with must be one of: ${allowed.join(', ')} (got "${withRaw}")\n`,
      );
      return 64;
    }
    return runInitConfig({
      ...(withRaw !== undefined ? {withKind: withRaw as InitConfigKind} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
      ...(flags.force ? {force: true} : {}),
    });
  }

  if (command === 'build') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent build: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runBuild({
      filmId,
      ...(num(flags.scale) !== undefined ? {scale: num(flags.scale)!} : {}),
      ...(num(flags.concurrency) !== undefined
        ? {concurrency: num(flags.concurrency)!}
        : {}),
      ...(num(flags.still) !== undefined ? {still: num(flags.still)!} : {}),
      ...(flags['skip-tts'] ? {skipTts: true} : {}),
      ...(flags['no-tts-cache'] ? {noTtsCache: true} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
      ...(str(flags.lang) ? {lang: str(flags.lang)!} : {}),
      ...(str(flags.voice) ? {voice: str(flags.voice)!} : {}),
      ...(str(flags['translation-provider'])
        ? {translationProvider: str(flags['translation-provider'])!}
        : {}),
    });
  }

  if (command === 'preview') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent preview: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runPreview({
      filmId,
      ...(num(flags.port) !== undefined ? {port: num(flags.port)!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'watch') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent watch: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runWatch({
      filmId,
      ...(num(flags.scale) !== undefined ? {scale: num(flags.scale)!} : {}),
      ...(flags['skip-tts'] ? {skipTts: true} : {}),
      ...(flags['no-build'] ? {noBuild: true} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'treatment') {
    const id = positional[0];
    if (!id) {
      process.stderr.write('docent treatment: missing <id>\n' + USAGE);
      return 64;
    }
    return runTreatment({
      id,
      ...(flags['to-spec'] ? {toSpec: true} : {}),
      ...(flags.force ? {force: true} : {}),
      ...(str(flags['analysis-dir'])
        ? {analysisDir: str(flags['analysis-dir'])!}
        : {}),
      ...(str(flags['treatments-dir'])
        ? {treatmentsDir: str(flags['treatments-dir'])!}
        : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'validate') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent validate: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runValidate({
      filmId,
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'depthcheck') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent depthcheck: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runDepthcheck({
      filmId,
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'render-check') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent render-check: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runRenderCheck({
      filmId,
      ...(num(flags.scale) !== undefined ? {scale: num(flags.scale)!} : {}),
      ...(num(flags.concurrency) !== undefined
        ? {concurrency: num(flags.concurrency)!}
        : {}),
      ...(num(flags.samples) !== undefined ? {samples: num(flags.samples)!} : {}),
      ...(flags['skip-tts'] ? {skipTts: true} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'assert') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent assert: missing <film-id>\n' + USAGE);
      return 64;
    }
    // --narrative routes to the narrative-quality cascade (R2 deliverable).
    // The pixel-diff assert remains the default — narrative is opt-in.
    if (flags.narrative) {
      return runAssertNarrative({
        filmId,
        ...(flags.judges ? {judges: true} : {}),
        ...(str(flags['judge-provider']) ? {judgeProvider: str(flags['judge-provider'])!} : {}),
        ...(num(flags['judge-beat-limit']) !== undefined
          ? {judgeBeatLimit: num(flags['judge-beat-limit'])!}
          : {}),
        ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
        ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    return runAssert({
      filmId,
      ...(flags.update ? {update: true} : {}),
      ...(num(flags.threshold) !== undefined ? {threshold: num(flags.threshold)!} : {}),
      ...(num(flags['compare-width']) !== undefined
        ? {compareWidth: num(flags['compare-width'])!}
        : {}),
      ...(str(flags['golden-dir']) ? {goldenDir: str(flags['golden-dir'])!} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'scene-fit') {
    const sub = positional[0];
    if (!sub || sub === 'list') {
      return runSceneFitList({
        json: Boolean(flags.json),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
        ...(str(flags['analysis-dir'])
          ? {analysisDir: str(flags['analysis-dir'])!}
          : {}),
      });
    }
    if (sub === 'recommend') {
      const subjectId = positional[1];
      if (!subjectId) {
        process.stderr.write(
          'docent scene-fit recommend: missing <subject-id>\n' + USAGE,
        );
        return 64;
      }
      return runSceneFitRecommend({
        subjectId,
        json: Boolean(flags.json),
        ...(num(flags.top) !== undefined ? {top: num(flags.top)!} : {}),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
        ...(str(flags['analysis-dir'])
          ? {analysisDir: str(flags['analysis-dir'])!}
          : {}),
      });
    }
    process.stderr.write(`docent scene-fit: unknown subcommand "${sub}" — use list | recommend\n` + USAGE);
    return 64;
  }

  if (command === 'style') {
    const sub = positional[0];
    if (!sub || sub === 'list') {
      return runStyleList({
        json: Boolean(flags.json),
        ...(str(flags['project-root']) ? {projectRoot: str(flags['project-root'])!} : {}),
        ...(str(flags['analysis-dir']) ? {analysisDir: str(flags['analysis-dir'])!} : {}),
      });
    }
    if (sub === 'recommend') {
      const subjectId = positional[1];
      if (!subjectId) {
        process.stderr.write('docent style recommend: missing <subject-id>\n' + USAGE);
        return 64;
      }
      return runStyleRecommend({
        subjectId,
        json: Boolean(flags.json),
        ...(str(flags['project-root']) ? {projectRoot: str(flags['project-root'])!} : {}),
        ...(str(flags['analysis-dir']) ? {analysisDir: str(flags['analysis-dir'])!} : {}),
      });
    }
    process.stderr.write(`docent style: unknown subcommand "${sub}" — use list | recommend\n` + USAGE);
    return 64;
  }

  if (command === 'doctor') {
    return runDoctor({
      json: Boolean(flags.json),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'grammar-check') {
    return runGrammarCheck({
      ...(num(flags.scale) !== undefined ? {scale: num(flags.scale)!} : {}),
      ...(flags['skip-tts'] === false ? {skipTts: false} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'ci') {
    return runCi({
      ...(str(flags.local) ? {local: str(flags.local)!} : {}),
      ...(str(flags.versions) ? {versions: str(flags.versions)!} : {}),
      ...(flags['skip-portrait'] ? {skipPortrait: true} : {}),
      ...(flags.keep ? {keep: true} : {}),
    });
  }

  if (command === 'score') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent score: missing <film-id>\n' + USAGE);
      return 64;
    }
    const providerRaw = str(flags.provider);
    const allowedProviders = ['template', 'aiva', 'udio', 'suno'] as const;
    if (providerRaw !== undefined && !allowedProviders.includes(providerRaw as typeof allowedProviders[number])) {
      process.stderr.write(
        `docent score: --provider must be one of ${allowedProviders.join(', ')} (got "${providerRaw}")\n`,
      );
      return 64;
    }
    return runScore({
      filmId,
      ...(providerRaw !== undefined
        ? {provider: providerRaw as typeof allowedProviders[number]}
        : {}),
      ...(flags.write ? {write: true} : {}),
      ...(flags.validate ? {validate: true} : {}),
      ...(flags.json ? {json: true} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'fcpxml') {
    const filmId = positional[0];
    if (!filmId) {
      process.stderr.write('docent fcpxml: missing <film-id>\n' + USAGE);
      return 64;
    }
    return runFcpxml({
      filmId,
      ...(str(flags.out) ? {out: str(flags.out)!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'hermetic') {
    return runHermetic({
      ...(num(flags.scale) !== undefined ? {scale: num(flags.scale)!} : {}),
      ...(num(flags.concurrency) !== undefined
        ? {concurrency: num(flags.concurrency)!}
        : {}),
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
      ...(str(flags['films-dir']) ? {filmsDir: str(flags['films-dir'])!} : {}),
      ...(str(flags['project-root'])
        ? {projectRoot: str(flags['project-root'])!}
        : {}),
    });
  }

  if (command === 'drip') {
    const sub = positional[0];
    if (!sub || sub === 'list') {
      return runDripList({
        json: Boolean(flags.json),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    if (sub === 'add') {
      const filmId = positional[1];
      const schedule = str(flags.schedule);
      const platformRaw = str(flags.platform);
      if (!filmId || !schedule || !platformRaw) {
        process.stderr.write(
          'docent drip add: missing arguments. ' +
            'Usage: docent drip add <filmId> --schedule "MWF 15:00 America/Chicago" ' +
            '--platform docent-studio,youtube\n',
        );
        return 64;
      }
      let platforms;
      try {
        platforms = parsePlatformList(platformRaw);
      } catch (e) {
        process.stderr.write(`docent drip add: ${(e as Error).message}\n`);
        return 64;
      }
      return runDripAdd({
        filmId,
        schedule,
        platforms,
        ...(str(flags.note) ? {note: str(flags.note)!} : {}),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    if (sub === 'status') {
      const filmId = positional[1];
      if (!filmId) {
        process.stderr.write('docent drip status: missing <filmId>\n');
        return 64;
      }
      return runDripStatus({
        filmId,
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    if (sub === 'cancel') {
      const filmId = positional[1];
      if (!filmId) {
        process.stderr.write('docent drip cancel: missing <filmId>\n');
        return 64;
      }
      return runDripCancel({
        filmId,
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    if (sub === 'tick') {
      return runDripTick({
        ...(flags.mock ? {mock: true} : {}),
        ...(flags.force ? {force: true} : {}),
        ...(str(flags['project-root'])
          ? {projectRoot: str(flags['project-root'])!}
          : {}),
      });
    }
    process.stderr.write(
      `docent drip: unknown subcommand "${sub}" — expected one of: ` +
        `add | list | status | cancel | tick\n`,
    );
    return 64;
  }

  process.stderr.write(`docent: unknown command "${command}"\n` + USAGE);
  return 64;
};

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(
      `\x1b[31mdocent: unhandled error\x1b[0m\n` +
        (err instanceof Error ? err.stack ?? err.message : String(err)) +
        '\n',
    );
    process.exit(1);
  });
