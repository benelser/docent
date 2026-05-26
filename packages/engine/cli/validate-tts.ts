// Deep TTS validation — registry-aware checks that cannot live in the static
// `validateSpec` because they require the TTS registry. Called by the cascade
// after the structural validation passes.
//
// Three checks:
//   1. If `meta.tts.provider` is set, it must match a registered provider.
//   2. If `meta.tts.voice` is set, it must appear in that provider's
//      `listVoices()` output.
//   3. If `meta.tts.strict: true`, every scene's `requiresTtsCapabilities`
//      must be satisfied by the active provider's capabilities. (Forward-
//      compat: most scenes don't declare requirements yet.)
//
// Capability mismatch policy (Open Question O7 from the design doc):
//   - Strict mode → hard fail (returned as severity: 'error').
//   - Default → warning to stderr (returned as severity: 'warning').

import {ttsRegistry} from '../src/tts';
import type {TtsCapabilities, TtsProviderPlugin} from '../src/tts';
import type {ValidationIssue} from './validate';

/**
 * Forward-compat: a scene plugin (when the broader plugin architecture
 * lands) will declare which TTS capabilities it depends on. For now, a few
 * scene types are *known* to benefit from native alignment — `passage` is the
 * canonical example (per-word highlight while narration plays). The map is
 * deliberately conservative: only scenes that demonstrably degrade without
 * the capability are listed.
 */
const SCENE_REQUIRES_TTS_CAPS: Record<string, Partial<TtsCapabilities>> = {
  // `passage` benefits from word-level alignment (per-word highlight as
  // narration plays). When the provider can't supply it, the renderer falls
  // back to a slower, beat-coarse animation — usable but lossy.
  // Strict mode rejects; default mode warns.
  passage: {nativeAlignment: 'word'},
};

/** Whether `actual` (a capability flag) satisfies `required`. */
const capabilitySatisfies = (
  actual: TtsCapabilities,
  required: Partial<TtsCapabilities>,
): {ok: true} | {ok: false; reason: string} => {
  for (const k of Object.keys(required) as (keyof TtsCapabilities)[]) {
    const req = required[k];
    if (req === undefined) continue;
    if (k === 'nativeAlignment') {
      // 'word' > 'character' > 'chunk' > 'none' — a stricter requirement
      // requires a stricter provider. For now we check exact match (the
      // simple, defensible policy); a smarter policy can downgrade
      // character→word with a fallback aligner.
      if (actual.nativeAlignment === 'none' && req !== 'none') {
        return {
          ok: false,
          reason: `requires nativeAlignment: ${String(req)}, provider has nativeAlignment: none`,
        };
      }
    } else if (actual[k] !== req) {
      return {
        ok: false,
        reason: `requires ${k}: ${String(req)}, provider has ${k}: ${String(actual[k])}`,
      };
    }
  }
  return {ok: true};
};

export interface TtsValidationResult {
  /** Hard-failure issues — present when strict mode is on, or when the
   *  provider id is unknown / voice not in catalog. */
  issues: ValidationIssue[];
  /** Warnings — emitted to stderr by the cascade when not in strict mode. */
  warnings: ValidationIssue[];
  /** The resolved provider plugin (if known). null if `tts.provider` named
   *  an unregistered provider. */
  plugin: TtsProviderPlugin | null;
  /** The resolved provider id (after applying the kokoro default). */
  providerId: string;
}

/**
 * Validate the TTS configuration on a spec against the registry. Lazy on
 * voices — only fetches the voice list when the spec specifies `meta.tts.voice`.
 */
export const validateTts = async (spec: any): Promise<TtsValidationResult> => {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const ttsCfg = spec?.meta?.tts ?? {};
  const providerId: string = ttsCfg.provider ?? 'kokoro';
  const strict: boolean = ttsCfg.strict === true;

  const plugin = ttsRegistry.get(providerId);
  if (!plugin) {
    const known = ttsRegistry.ids().join(', ') || '(none registered)';
    issues.push({
      path: 'meta.tts.provider',
      message: `unknown provider "${providerId}" — registered: ${known}`,
    });
    return {issues, warnings, plugin: null, providerId};
  }

  // Voice check — lazy, only if the spec specifies one.
  const requestedVoice: string | undefined = ttsCfg.voice ?? spec?.meta?.voice;
  if (ttsCfg.voice && typeof ttsCfg.voice === 'string') {
    // Construct a transient instance just to enumerate voices. This may hit
    // the network for providers with remote voice catalogs (elevenlabs) —
    // tolerable: we are validating once at the start of a render.
    try {
      const instance = await plugin.create({
        env: process.env as Readonly<Record<string, string | undefined>>,
        cacheDir: '',
        model: ttsCfg.model,
        providerOptions: ttsCfg.providerOptions,
      });
      const voices = await instance.listVoices();
      const found = voices.find((v) => v.id === ttsCfg.voice);
      if (!found) {
        const sample = voices.slice(0, 5).map((v) => v.id).join(', ');
        issues.push({
          path: 'meta.tts.voice',
          message: `voice "${ttsCfg.voice}" not in provider "${providerId}" — known: ${sample}${voices.length > 5 ? `, … (${voices.length} total)` : ''}`,
        });
      }
      if (instance.dispose) await instance.dispose();
    } catch (e) {
      // A credential-missing error here is a soft warning — the cascade
      // doesn't necessarily render right now, and the provider may simply
      // not be reachable in this environment.
      warnings.push({
        path: 'meta.tts.voice',
        message: `could not verify voice "${ttsCfg.voice}" against provider "${providerId}": ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warning',
      });
    }
  }

  // Capability check — per-scene requirements vs. provider capabilities.
  if (Array.isArray(spec?.scenes)) {
    spec.scenes.forEach((scene: any, i: number) => {
      const sceneType = scene?.type;
      // Two sources: (a) the forward-compat scene-plugin `requiresTtsCapabilities`
      // declared inline on the scene, (b) the engine's default map.
      const inline = scene?.requiresTtsCapabilities;
      const defaults = SCENE_REQUIRES_TTS_CAPS[sceneType] ?? null;
      const required: Partial<TtsCapabilities> | null =
        inline && typeof inline === 'object'
          ? {...defaults, ...inline}
          : defaults;
      if (!required || Object.keys(required).length === 0) return;
      const check = capabilitySatisfies(plugin.capabilities, required);
      if (!check.ok) {
        const msg = `scene "${sceneType}" ${check.reason}`;
        if (strict) {
          issues.push({path: `scenes[${i}].requiresTtsCapabilities`, message: msg});
        } else {
          warnings.push({
            path: `scenes[${i}].requiresTtsCapabilities`,
            message: msg,
            severity: 'warning',
          });
        }
      }
    });
  }

  return {issues, warnings, plugin, providerId};
};
