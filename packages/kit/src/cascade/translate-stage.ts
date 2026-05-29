// Translate stage — maps every beat's `narration` through the active
// {@link TranslationProvider} when a target language is requested.
//
// Runs BEFORE the TTS stage so the rest of the cascade (TTS, captions
// sidecars, alignment) sees the translated text as if it were authored that
// way. Returns a new spec — the input is never mutated.
//
// Provider precedence (highest first):
//   1. `opts.providerId` (CLI override).
//   2. `spec.meta.translation.provider`.
//   3. `'noop'` (the safe default — ships in @bjelser/core).
//
// **The noop fallback is the point.** A user who passes `--lang es` without
// configuring an LLM provider gets:
//   - A one-line "no translation provider configured — narration unchanged"
//     warning, exactly once per cascade.
//   - The film builds normally, with the SOURCE narration intact (audible,
//     not silent).
//
// This is preferred over a hard failure because translation is an *add-on*
// — the film is already authored in the source language; the failure mode
// should be "you get the source film" not "you get nothing".

import type {Engine} from '../engine';
import type {FilmSpec, Beat, Scene} from '../types/spec';
import type {
  TranslationProvider,
  TranslationProviderContext,
} from '../types/translation';
import {TranslationProviderError} from '../types/translation';

/** Options accepted by `runTranslateStage`. */
export interface TranslateStageOptions {
  /**
   * Target language code (ISO 639-1: `'es'`, `'fr'`, `'ja'`, `'zh'`).
   * REQUIRED — the cascade only calls this stage when a target language
   * is set.
   */
  targetLang: string;
  /**
   * Translation provider id to use. Overrides
   * `spec.meta.translation.provider`. Defaults to `'noop'` when neither is
   * set.
   */
  providerId?: string;
  /** Cache dir handed to the provider's `create` context. */
  cacheDir?: string;
  /** Override the env passed to the provider (defaults to `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Per-beat translation result row in the stage manifest. */
export interface TranslateBeatResult {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly beatId?: string;
  readonly sourceText: string;
  readonly translatedText: string;
  /** Whether the text actually changed (a noop translator returns false). */
  readonly translated: boolean;
}

/** The manifest the stage returns. */
export interface TranslateStageManifest {
  /** The resolved provider id (after CLI override + spec + fallback). */
  readonly providerId: string;
  /** Target language code. */
  readonly targetLang: string;
  /** Per-beat results. */
  readonly beats: ReadonlyArray<TranslateBeatResult>;
  /** Count of beats that were materially translated (text changed). */
  readonly translatedCount: number;
  /** Count of beats that passed through unchanged. */
  readonly unchangedCount: number;
}

/**
 * The result of running the translate stage: the new spec (with translated
 * narration) and a manifest describing what was translated.
 */
export interface TranslateStageResult {
  readonly spec: FilmSpec;
  readonly manifest: TranslateStageManifest;
}

/**
 * Run the translate stage over a film spec. Returns a NEW spec with every
 * beat's `narration` replaced by the translated text, plus a manifest of
 * what happened. The input spec is never mutated.
 */
export const runTranslateStage = async (
  spec: FilmSpec,
  engine: Engine,
  opts: TranslateStageOptions,
): Promise<TranslateStageResult> => {
  const targetLang = opts.targetLang;
  const metaTranslation = spec.meta?.translation ?? {};
  const providerId: string =
    opts.providerId ?? metaTranslation.provider ?? 'noop';

  const plugin = engine.translations.get(providerId);
  if (!plugin) {
    const known = engine.translations
      .all()
      .map((p) => p.providerId)
      .sort()
      .join(', ');
    throw new TranslationProviderError(
      providerId,
      `no translation provider registered with id "${providerId}" — known: ${known || '(none)'}`,
    );
  }

  // Check capability surface — if the provider declares a finite list and
  // the target lang isn't in it, surface a clear warning and short-circuit
  // to noop-style passthrough. Don't hard-fail: this is an add-on stage.
  const caps = plugin.capabilities;
  if (caps.targetLanguages !== '*') {
    const supported = caps.targetLanguages.map((s) => s.toLowerCase());
    if (!supported.includes(targetLang.toLowerCase())) {
      process.stderr.write(
        `[translate] provider "${providerId}" does not declare support for "${targetLang}" ` +
          `(supports: ${supported.join(', ')}). Passing narration through unchanged.\n`,
      );
      return buildPassthroughResult(spec, providerId, targetLang);
    }
  }

  // We type `process` defensively — same pattern as the tts stage, since
  // the kit does NOT depend on `@types/node`.
  const env: Readonly<Record<string, string | undefined>> =
    opts.env ??
    ((globalThis as {process?: {env?: Record<string, string | undefined>}}).process
      ?.env ??
      {});

  const model = metaTranslation.model;
  const providerOptions = metaTranslation.providerOptions;
  const ctx: TranslationProviderContext = {
    env,
    cacheDir: opts.cacheDir ?? '',
    ...(model !== undefined ? {model} : {}),
    ...(providerOptions !== undefined ? {providerOptions} : {}),
  };

  let provider: TranslationProvider;
  try {
    provider = await plugin.create(ctx);
  } catch (e) {
    if (e instanceof TranslationProviderError) throw e;
    throw new TranslationProviderError(
      providerId,
      `failed to initialize — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const beats: TranslateBeatResult[] = [];
  let translatedCount = 0;
  let unchangedCount = 0;
  // Build a new scenes array with translated narration. We avoid mutating
  // input objects so a caller that re-uses the spec elsewhere sees no
  // surprises.
  const inScenes: Scene[] = spec.scenes ?? [];
  const newScenes: Scene[] = [];

  try {
    for (let sceneIndex = 0; sceneIndex < inScenes.length; sceneIndex++) {
      const scene = inScenes[sceneIndex];
      if (!scene) {
        newScenes.push(scene as Scene);
        continue;
      }
      if (!Array.isArray(scene.beats)) {
        newScenes.push(scene);
        continue;
      }
      const inBeats = scene.beats as Beat[];
      const outBeats: Beat[] = [];
      for (let beatIndex = 0; beatIndex < inBeats.length; beatIndex++) {
        const beat = inBeats[beatIndex];
        if (!beat) {
          outBeats.push(beat as Beat);
          continue;
        }
        const sourceText = beat.narration ?? '';
        if (sourceText.length === 0) {
          outBeats.push(beat);
          beats.push({
            sceneIndex,
            beatIndex,
            sourceText: '',
            translatedText: '',
            translated: false,
            ...(beat.id !== undefined ? {beatId: beat.id} : {}),
          });
          unchangedCount++;
          continue;
        }
        let translatedText: string;
        try {
          translatedText = await provider.translate(sourceText, targetLang);
        } catch (e) {
          throw new Error(
            `translate stage: translate failed for scene ${sceneIndex}, beat ${beatIndex} (${beat.id ?? '<no-id>'}) — ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        const changed = translatedText !== sourceText;
        if (changed) translatedCount++;
        else unchangedCount++;
        outBeats.push({...beat, narration: translatedText});
        beats.push({
          sceneIndex,
          beatIndex,
          sourceText,
          translatedText,
          translated: changed,
          ...(beat.id !== undefined ? {beatId: beat.id} : {}),
        });
      }
      newScenes.push({...scene, beats: outBeats});
    }
  } finally {
    if (provider.dispose) {
      try {
        await provider.dispose();
      } catch {
        // tolerable — the run already succeeded or failed.
      }
    }
  }

  const newSpec: FilmSpec = {...spec, scenes: newScenes};
  return {
    spec: newSpec,
    manifest: {
      providerId,
      targetLang,
      beats,
      translatedCount,
      unchangedCount,
    },
  };
};

/**
 * Build a TranslateStageResult that passes the spec through unchanged.
 * Used when the provider's capabilities don't cover the target language —
 * we surface a warning and let the film build with source narration.
 */
const buildPassthroughResult = (
  spec: FilmSpec,
  providerId: string,
  targetLang: string,
): TranslateStageResult => {
  const beats: TranslateBeatResult[] = [];
  let unchangedCount = 0;
  for (let si = 0; si < (spec.scenes ?? []).length; si++) {
    const sc = (spec.scenes ?? [])[si];
    if (!sc || !Array.isArray(sc.beats)) continue;
    const sceneBeats = sc.beats as Beat[];
    for (let bi = 0; bi < sceneBeats.length; bi++) {
      const b = sceneBeats[bi];
      if (!b) continue;
      const text = b.narration ?? '';
      beats.push({
        sceneIndex: si,
        beatIndex: bi,
        sourceText: text,
        translatedText: text,
        translated: false,
        ...(b.id !== undefined ? {beatId: b.id} : {}),
      });
      unchangedCount++;
    }
  }
  return {
    spec,
    manifest: {
      providerId,
      targetLang,
      beats,
      translatedCount: 0,
      unchangedCount,
    },
  };
};
