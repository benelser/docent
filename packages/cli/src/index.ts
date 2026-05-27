#!/usr/bin/env bun
// @docent/cli — the thin CLI shell for docent.
//
// Subcommand routing on top of `@docent/kit`'s public Engine surface. Every
// subcommand is a few lines: parse args, call into a command module, exit
// with a meaningful code.
//
// The CLI is INTENTIONALLY THIN. It owns no domain logic — that lives in
// `@docent/kit` (the framework) and `@docent/core` (the default plugin
// pack). The CLI's only opinionated choice: loading `@docent/core` by
// default, plus any `docent.config.ts` the project ships.

import {runBuild} from './commands/build';
import {runDepthcheck} from './commands/depthcheck';
import {runHermetic} from './commands/hermetic';
import {runRenderCheck} from './commands/render-check';
import {runValidate} from './commands/validate';

const USAGE = `docent — render explanatory films via @docent/kit.

USAGE
  docent <command> [args]

COMMANDS
  build <film-id>         Render a film to MP4 at out/<film-id>.mp4.
  validate <film-id>      Structurally validate a film spec via engine.validate().
  depthcheck <film-id>    Aggregate every plugin's depthRules over a film spec.
  render-check <film-id>  Render at low scale + assert every narrated scene
                          evolves visibly across its window. Guards against
                          chrome-only renders (audio without body).
  hermetic                Render the 4 gallery fixtures end to end.
  help                    Print this usage and exit.

BUILD FLAGS
  --scale <n>          Render scale (0.25, 0.5, 1). Default: 1.
  --concurrency <n>    Render frame concurrency. Default: Remotion's auto.
  --still <s>          Render a single still at second offset s.
  --skip-tts           Skip the TTS stage — produces a silent mp4.
  --output-dir <p>     Override the output directory.
  --films-dir <p>      Override the films/ directory.
  --project-root <p>   Override the project root (config + entry generation).

EXAMPLES
  docent build linear-algebra --scale 0.5
  docent validate kubernetes-pr
  docent depthcheck euclid-primes
  docent hermetic --scale 0.5
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
    process.stdout.write(USAGE);
    return 0;
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
      ...(str(flags['output-dir']) ? {outputDir: str(flags['output-dir'])!} : {}),
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
