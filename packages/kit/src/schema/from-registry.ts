// Schema-from-registry — Phase A.8.
//
// `computeSchema(engine)` walks the registered scene plugins and assembles a
// single JSON Schema for the whole `FilmSpec`. The schema is a discriminated
// union over `scene.type`: each `ScenePlugin.schema` becomes one branch of a
// `oneOf` on `scenes[].items`, narrowed by the plugin's `sceneType` literal.
//
// The strategy doc, §11.5, fixes the top-level film keys as CLOSED: `meta`,
// `scenes`, `style`, `tts`. Plugins add scene-type branches, never new
// top-level keys. This module enforces that closure by hand-authoring the
// outer schema and only delegating `scenes[]` to plugins.
//
// What this module owns:
//   - The closed top-level shape (`meta`, `scenes`, `style`, `tts`).
//   - The `meta` sub-schema (id/title required; the rest optional, lazy on
//     enum closures so a new register or mode added to the type doesn't
//     require this file to re-export the list).
//   - The `style` and `tts` sub-schemas as permissive objects (the
//     style-resolver and tts-provider lifecycle do the real checking; this
//     schema's job is to refuse misshapen specs, not to redo every check).
//
// What this module does NOT own:
//   - Per-scene-type fields. Each plugin's `schema` carries that.
//   - The discriminator narrowing — AJV with `discriminator: { propertyName }`
//     does it natively; the schema declares both `oneOf` and `discriminator`
//     so both stricter (AJV 2020) and looser (AJV 8 default) validators
//     work.
//
// Returns: a single `JSONSchema7` ready to feed to AJV (Phase A.7 / B.* wires
// the runtime check; this function is pure).

import type {JSONSchema7, JSONSchema7Definition} from 'json-schema';

import type {Engine} from '../engine';
import type {ScenePlugin} from '../protocols';

/**
 * Compute the union film schema from the registered scenes. The pure
 * function behind {@link Engine.schema}. Surfaced as a standalone export
 * so tooling (a custom validator, a doctor surface) can call it directly.
 *
 * The schema is a discriminated union: each registered scene plugin's
 * `schema` becomes one branch of a `oneOf` on `scenes[].items`, narrowed
 * by the plugin's `sceneType` literal. The top-level keys (`meta`,
 * `scenes`, `style`, `tts`) are CLOSED — they cannot be extended by a
 * plugin.
 *
 * Even with zero scene plugins registered, the function returns a valid
 * top-level schema — the `scenes[]` items just collapse to `{not: {}}`,
 * which makes the empty-engine error "no scene types registered" instead
 * of "scenes is invalid". Future iterations may push the empty-engine
 * case to a clearer surfaced error; for the rip-and-replace, returning a
 * valid (if exclusionary) schema is the safe default.
 *
 * @returns A {@link JSONSchema7} ready to feed to AJV.
 *
 * @see docs/design/plugin-architecture-strategy.md §11.5
 */
export function computeSchema(engine: Engine): JSONSchema7 {
  const scenePlugins = engine.scenes.all();

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'FilmSpec',
    type: 'object',
    additionalProperties: false,
    required: ['meta', 'scenes'],
    properties: {
      meta: metaSchema(),
      scenes: {
        type: 'array',
        items: sceneUnion(scenePlugins),
      },
      style: styleSchema(),
      tts: ttsConfigSchema(),
    },
  };
}

/**
 * The discriminated `oneOf` over registered scene plugins. Each branch
 * inherits the plugin's own schema and narrows `type` to the plugin's
 * `sceneType` literal. Empty registry → `{not: {}}` which validates nothing
 * (correct: an engine with zero scene plugins can't validate any spec with
 * scenes).
 */
function sceneUnion(
  plugins: ReadonlyArray<ScenePlugin<any>>,
): JSONSchema7Definition {
  if (plugins.length === 0) {
    return {not: {}};
  }
  const branches: JSONSchema7Definition[] = plugins.map((p) =>
    narrowSceneSchema(p.schema, p.sceneType),
  );
  return {
    oneOf: branches,
    // AJV 8's `discriminator` keyword (off by default; opt-in by callers
    // who want fast-path narrowing). The `oneOf` above is the contract.
    discriminator: {propertyName: 'type'},
  } as unknown as JSONSchema7Definition;
}

/**
 * Take a plugin-supplied schema and produce a branch that:
 *   - Pulls in the plugin's own properties / required / additionalProperties.
 *   - PINS the `type` property to a const literal of the plugin's sceneType
 *     so the discriminator works.
 *
 * If the plugin's schema already pins `type`, we trust it; otherwise we
 * augment.
 */
function narrowSceneSchema(
  schema: JSONSchema7,
  sceneType: string,
): JSONSchema7 {
  // Defensive clone — we mutate to add the type pin without leaking back
  // into the plugin's schema. Shallow merge is enough: the type pin replaces
  // (or adds) the `properties.type` slot.
  const props: Record<string, JSONSchema7Definition> = {
    ...(schema.properties ?? {}),
    type: {const: sceneType, type: 'string'},
  };
  const required = Array.from(
    new Set<string>([...(schema.required ?? []), 'type']),
  );
  return {
    ...schema,
    type: schema.type ?? 'object',
    properties: props,
    required,
  };
}

/**
 * `meta` sub-schema. Required: id, title. Optional: subtitle, author, voice,
 * register, resolution, tts, mode, subsystem. Open-shape on extras so plugin
 * authors don't have to coordinate every new meta field through a kit bump.
 */
function metaSchema(): JSONSchema7 {
  return {
    type: 'object',
    required: ['id', 'title'],
    properties: {
      id: {type: 'string', minLength: 1},
      title: {type: 'string', minLength: 1},
      subtitle: {type: 'string'},
      author: {type: 'string'},
      voice: {type: 'string'},
      register: {
        type: 'string',
        enum: ['grave', 'neutral', 'calm', 'urgent', 'playful'],
      },
      resolution: {
        type: 'object',
        properties: {
          width: {type: 'integer', minimum: 1},
          height: {type: 'integer', minimum: 1},
          fps: {type: 'integer', minimum: 1},
        },
        required: ['width', 'height'],
      },
      tts: ttsConfigSchema(),
      mode: {type: 'string'},
      subsystem: {type: 'string'},
    },
    // Open shape — kit explicitly does not freeze meta, so authoring tools
    // can scribble metadata without a kit version bump.
    additionalProperties: true,
  };
}

/**
 * `tts` sub-schema (also embedded under `meta.tts`). Permissive shape — the
 * TTS provider does the real validation; this schema's job is to refuse the
 * wrong type (e.g., string instead of object).
 */
function ttsConfigSchema(): JSONSchema7 {
  return {
    type: 'object',
    properties: {
      provider: {type: 'string'},
      model: {type: 'string'},
      providerOptions: {type: 'object', additionalProperties: true},
      strict: {type: 'boolean'},
    },
    additionalProperties: true,
  };
}

/**
 * `style` sub-schema — the `RenderStyleInput` shape. Like meta + tts, kept
 * permissive: the style resolver does the deep check.
 */
function styleSchema(): JSONSchema7 {
  return {
    type: 'object',
    properties: {
      preset: {type: 'string'},
      intent: {
        type: 'object',
        additionalProperties: true,
      },
      tokens: {
        type: 'object',
        additionalProperties: true,
      },
      visualization: {
        type: 'object',
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  };
}
