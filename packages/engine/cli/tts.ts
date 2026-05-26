// docent tts — the agent-facing introspection surface over the TTS adapter
// layer. Mirrors `docent style` and `docent scene-fit` one layer down.
//
//   docent tts list-providers
//     enumerate every registered provider with its capabilities + version.
//
//   docent tts list-voices [--provider X]
//     enumerate the voices available for that provider. Default: kokoro.
//     Hits the network for providers with remote voice catalogs (elevenlabs).
//
//   docent tts synth <text> --provider X --voice Y [--output file.wav]
//     one-shot synthesis for debugging/testing. Writes the audio bytes to
//     stdout (or to --output) and prints the duration/alignment summary to
//     stderr.
//
// All JSON output the agent or a downstream tool needs to parse goes on
// stdout; human chrome goes to stderr. The exit code is the contract.

import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {paths} from './paths';
import {ttsRegistry} from '../src/tts';
import {TtsProviderError} from '../src/tts';

const die = (msg: string): never => {
  process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
  process.exit(1);
};

// ----- docent tts list-providers --------------------------------------------

export const ttsListProviders = (json: boolean): number => {
  const providers = ttsRegistry.list();
  if (json) {
    process.stdout.write(
      JSON.stringify(
        providers.map((p) => ({
          providerId: p.providerId,
          version: p.version,
          capabilities: p.capabilities,
        })),
        null,
        2,
      ) + '\n',
    );
    return 0;
  }
  process.stdout.write('\x1b[1mdocent tts\x1b[0m — registered providers\n\n');
  for (const p of providers) {
    const caps = p.capabilities;
    const flags = [
      caps.local ? 'local' : 'remote',
      `align:${caps.nativeAlignment}`,
      caps.streaming ? 'streaming' : null,
      caps.ssml ? 'ssml' : null,
      caps.voiceCloning ? 'clone' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    process.stdout.write(`  ${p.providerId.padEnd(20)} v${p.version}  [${flags}]\n`);
  }
  process.stdout.write(`\n  ${providers.length} provider(s) registered\n`);
  return 0;
};

// ----- docent tts list-voices ------------------------------------------------

export const ttsListVoices = async (
  providerId: string,
  json: boolean,
): Promise<number> => {
  const plugin = ttsRegistry.get(providerId);
  if (!plugin) {
    const known = ttsRegistry.ids().join(', ') || '(none)';
    process.stderr.write(
      `\x1b[31m✗\x1b[0m unknown provider "${providerId}" — known: ${known}\n`,
    );
    return 1;
  }
  let instance;
  try {
    instance = await plugin.create({
      env: process.env as Readonly<Record<string, string | undefined>>,
      cacheDir: paths.publicDir,
    });
  } catch (e) {
    process.stderr.write(
      `\x1b[31m✗\x1b[0m provider "${providerId}" failed to initialize: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return 1;
  }
  let voices;
  try {
    voices = await instance.listVoices();
  } catch (e) {
    process.stderr.write(
      `\x1b[31m✗\x1b[0m listVoices failed: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return 1;
  } finally {
    if (instance.dispose) {
      try {
        await instance.dispose();
      } catch {
        // tolerable
      }
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify(voices, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(`\x1b[1mdocent tts list-voices\x1b[0m — ${providerId}\n\n`);
  for (const v of voices) {
    process.stdout.write(
      `  ${v.id.padEnd(28)}  ${v.name.padEnd(20)} ${v.language}${v.gender ? `  ${v.gender}` : ''}\n`,
    );
  }
  process.stdout.write(`\n  ${voices.length} voice(s)\n`);
  return 0;
};

// ----- docent tts synth ------------------------------------------------------

export const ttsSynth = async (args: {
  text: string;
  provider: string;
  voice: string;
  output?: string;
  pace?: 'hold' | 'settle' | 'normal' | 'brisk';
}): Promise<number> => {
  const plugin = ttsRegistry.get(args.provider);
  if (!plugin) {
    const known = ttsRegistry.ids().join(', ') || '(none)';
    process.stderr.write(
      `\x1b[31m✗\x1b[0m unknown provider "${args.provider}" — known: ${known}\n`,
    );
    return 1;
  }
  let instance;
  try {
    instance = await plugin.create({
      env: process.env as Readonly<Record<string, string | undefined>>,
      cacheDir: paths.publicDir,
    });
  } catch (e) {
    const msg = e instanceof TtsProviderError ? e.message : e instanceof Error ? e.message : String(e);
    process.stderr.write(`\x1b[31m✗\x1b[0m create failed: ${msg}\n`);
    return 1;
  }
  let result;
  try {
    result = await instance.synth(args.text, {voice: args.voice, pace: args.pace});
  } catch (e) {
    const msg = e instanceof TtsProviderError ? e.message : e instanceof Error ? e.message : String(e);
    process.stderr.write(`\x1b[31m✗\x1b[0m synth failed: ${msg}\n`);
    return 1;
  }
  if (instance.dispose) {
    try {
      await instance.dispose();
    } catch {}
  }

  // Write the audio bytes.
  if (args.output) {
    writeFileSync(args.output, result.audio);
    process.stderr.write(
      `\x1b[32m✓\x1b[0m wrote ${result.audio.length} bytes (${result.mediaType}) to ${args.output}\n`,
    );
  } else {
    // Stream to stdout — let the caller `> file.wav` or pipe to ffmpeg.
    process.stdout.write(result.audio);
    process.stderr.write(
      `\x1b[32m✓\x1b[0m emitted ${result.audio.length} bytes (${result.mediaType}) on stdout\n`,
    );
  }
  process.stderr.write(
    `  provider:        ${args.provider}\n` +
      `  voice:           ${args.voice}\n` +
      `  durationMs:      ${result.durationMs}\n` +
      `  alignmentSource: ${result.alignmentSource}\n` +
      `  alignment:       ${result.alignment.length} entries\n` +
      (result.metrics ? `  metrics:         ${JSON.stringify(result.metrics)}\n` : ''),
  );
  return 0;
};

// ----- argv parsing ---------------------------------------------------------

export const runTts = async (argv: string[]): Promise<number> => {
  const sub = argv[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write('docent tts — introspect the TTS adapter layer\n\n');
    process.stdout.write('  docent tts list-providers [--json]\n');
    process.stdout.write('    enumerate every registered provider with its capabilities\n\n');
    process.stdout.write('  docent tts list-voices [--provider <id>] [--json]\n');
    process.stdout.write('    enumerate voices for a provider (default: kokoro)\n\n');
    process.stdout.write(
      '  docent tts synth <text> --provider <id> --voice <id> [--output <file>] [--pace <p>]\n',
    );
    process.stdout.write(
      '    one-shot synthesis for testing — writes audio bytes to --output or stdout\n',
    );
    return sub ? 0 : 1;
  }

  if (sub === 'list-providers') {
    return ttsListProviders(argv.includes('--json'));
  }

  if (sub === 'list-voices') {
    let provider = 'kokoro';
    for (let i = 1; i < argv.length; i++) {
      const tok = argv[i];
      if (tok === '--provider') provider = argv[++i];
      else if (tok === '--json') {
        // handled below
      } else if (tok === '--help' || tok === '-h') {
        process.stdout.write('docent tts list-voices [--provider <id>] [--json]\n');
        return 0;
      } else {
        die(`unknown flag "${tok}"`);
      }
    }
    return ttsListVoices(provider, argv.includes('--json'));
  }

  if (sub === 'synth') {
    let text: string | undefined;
    let provider: string | undefined;
    let voice: string | undefined;
    let output: string | undefined;
    let pace: 'hold' | 'settle' | 'normal' | 'brisk' | undefined;
    for (let i = 1; i < argv.length; i++) {
      const tok = argv[i];
      if (tok === '--provider') provider = argv[++i];
      else if (tok === '--voice') voice = argv[++i];
      else if (tok === '--output') output = argv[++i];
      else if (tok === '--pace') {
        const v = argv[++i];
        if (v === 'hold' || v === 'settle' || v === 'normal' || v === 'brisk') pace = v;
        else die(`--pace must be hold | settle | normal | brisk (got: ${v})`);
      } else if (tok === '--help' || tok === '-h') {
        process.stdout.write(
          'docent tts synth <text> --provider <id> --voice <id> [--output <file>] [--pace <p>]\n',
        );
        return 0;
      } else if (!text && !tok.startsWith('--')) {
        text = tok;
      } else {
        die(`unknown flag "${tok}"`);
      }
    }
    if (!text) die('usage: docent tts synth <text> --provider <id> --voice <id> [--output <file>]');
    if (!provider) die('--provider is required');
    if (!voice) die('--voice is required');
    return ttsSynth({text: text!, provider: provider!, voice: voice!, output, pace});
  }

  process.stderr.write(
    `\x1b[31m✗\x1b[0m unknown tts subcommand "${sub}" — use list-providers | list-voices | synth\n`,
  );
  return 1;
};
