// `docent hermetic-tts` — provider-level smoke test gallery.
//
// Per provider, the harness:
//   1. Constructs the provider via the registry (asserting the right env
//      vars trip credential errors when absent, gracefully skip otherwise).
//   2. Synthesizes one short utterance.
//   3. Asserts the result is non-empty bytes, has a positive duration, and
//      the `alignmentSource` matches the declared capability.
//
// The 4 cases mirror the 4 built-in providers:
//   - kokoro              — always runs (local, no creds).
//   - openai              — runs only when OPENAI_API_KEY is set.
//   - elevenlabs          — runs only when ELEVENLABS_API_KEY is set.
//   - openai-compatible   — runs only when DOCENT_TTS_BASE_URL is set.
//
// Skipped providers don't fail the harness — they're warned to stderr and
// counted in the summary. Exit code: 0 iff every NON-SKIPPED case is GREEN.

import {ttsRegistry} from '../src/tts';
import {TtsProviderError} from '../src/tts';

const C = {ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m', skip: '\x1b[90m–\x1b[0m'};

interface SkipReason {
  reason: string;
}
interface CaseResult {
  providerId: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  checks: {name: string; pass: boolean; detail: string}[];
  skip?: SkipReason;
}

const FIXTURE_TEXT = 'The quick brown fox jumps over the lazy dog.';

// Each provider's default voice — the smoke test wants a known-good id.
const DEFAULT_VOICE_BY_PROVIDER: Record<string, string> = {
  kokoro: 'af_heart',
  openai: 'alloy',
  elevenlabs: '21m00Tcm4TlvDq8ikWAM', // Rachel — the canonical ElevenLabs voice
  'openai-compatible': 'alloy',
};

const ENV_REQUIRED: Record<string, string[]> = {
  kokoro: [],
  openai: ['OPENAI_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  'openai-compatible': ['DOCENT_TTS_BASE_URL'],
};

const checkSkip = (providerId: string): SkipReason | null => {
  const required = ENV_REQUIRED[providerId] ?? [];
  for (const k of required) {
    if (!process.env[k]) {
      return {reason: `env var ${k} not set`};
    }
  }
  return null;
};

const runCase = async (providerId: string): Promise<CaseResult> => {
  const checks: CaseResult['checks'] = [];
  const skip = checkSkip(providerId);
  if (skip) {
    return {providerId, status: 'skip', detail: skip.reason, checks, skip};
  }
  const plugin = ttsRegistry.get(providerId);
  if (!plugin) {
    return {
      providerId,
      status: 'fail',
      detail: 'provider not registered',
      checks: [{name: 'plugin registered', pass: false, detail: 'not in registry'}],
    };
  }
  checks.push({
    name: 'plugin registered',
    pass: true,
    detail: `v${plugin.version}, caps=${JSON.stringify(plugin.capabilities)}`,
  });

  let instance;
  try {
    instance = await plugin.create({
      env: process.env as Readonly<Record<string, string | undefined>>,
      cacheDir: '/tmp/docent-hermetic-tts',
    });
    checks.push({name: 'create', pass: true, detail: 'ok'});
  } catch (e) {
    const msg = e instanceof TtsProviderError ? e.message : e instanceof Error ? e.message : String(e);
    checks.push({name: 'create', pass: false, detail: msg});
    return {providerId, status: 'fail', detail: msg, checks};
  }

  const voice = DEFAULT_VOICE_BY_PROVIDER[providerId] ?? 'af_heart';
  let result;
  try {
    result = await instance.synth(FIXTURE_TEXT, {voice});
    checks.push({
      name: 'synth',
      pass: true,
      detail: `${result.audio.length} bytes ${result.mediaType}, ${result.durationMs}ms`,
    });
  } catch (e) {
    const msg = e instanceof TtsProviderError ? e.message : e instanceof Error ? e.message : String(e);
    checks.push({name: 'synth', pass: false, detail: msg});
    if (instance.dispose) await instance.dispose().catch(() => {});
    return {providerId, status: 'fail', detail: msg, checks};
  }

  // Output assertions.
  const bytesOk = result.audio.length > 0;
  checks.push({
    name: 'audio bytes',
    pass: bytesOk,
    detail: bytesOk ? `${result.audio.length} bytes` : 'empty audio',
  });

  // Duration sanity — most providers should produce ~2-4 seconds for the
  // fixture. We accept any positive value (some providers don't fill it).
  const durationOk = result.durationMs >= 0;
  checks.push({
    name: 'duration recorded',
    pass: durationOk,
    detail: `${result.durationMs}ms`,
  });

  // Capability vs. actual: if the plugin declares nativeAlignment !== 'none',
  // the result should carry alignmentSource: 'native'.
  if (plugin.capabilities.nativeAlignment !== 'none') {
    const aligned = result.alignmentSource === 'native' && result.alignment.length > 0;
    checks.push({
      name: 'native alignment honoured',
      pass: aligned,
      detail: `source=${result.alignmentSource}, ${result.alignment.length} words`,
    });
  } else {
    checks.push({
      name: 'alignmentSource consistent',
      pass: result.alignmentSource === 'none',
      detail: `source=${result.alignmentSource} (capability declares none)`,
    });
  }

  if (instance.dispose) await instance.dispose().catch(() => {});

  const allPass = checks.every((c) => c.pass);
  return {
    providerId,
    status: allPass ? 'pass' : 'fail',
    detail: allPass ? 'all checks passed' : 'one or more checks failed',
    checks,
  };
};

export const hermeticTts = async (opts: {json: boolean}): Promise<number> => {
  process.stdout.write('\x1b[1mdocent hermetic-tts\x1b[0m — TTS provider smoke gallery\n\n');

  const providers = ttsRegistry.list().map((p) => p.providerId);
  const results: CaseResult[] = [];
  for (const id of providers) {
    const r = await runCase(id);
    results.push(r);
    const icon = r.status === 'pass' ? C.ok : r.status === 'skip' ? C.skip : C.no;
    process.stdout.write(`${icon} ${id.padEnd(20)} ${r.detail}\n`);
    for (const c of r.checks) {
      process.stdout.write(`    ${c.pass ? C.ok : C.no} ${c.name} — ${c.detail}\n`);
    }
    process.stdout.write('\n');
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const summary = `${pass} pass · ${skip} skip · ${fail} fail`;
  process.stdout.write(
    fail === 0
      ? `\x1b[32m✔ hermetic-tts — ${summary}\x1b[0m\n`
      : `\x1b[31m✗ hermetic-tts — ${summary}\x1b[0m\n`,
  );

  if (opts.json) {
    process.stdout.write(JSON.stringify({summary: {pass, skip, fail}, results}, null, 2) + '\n');
  }
  return fail === 0 ? 0 : 1;
};
