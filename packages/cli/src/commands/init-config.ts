// `docent init-config [--with preset|scene|feature|tts]` —
// scaffold a starter `docent.config.ts`.
//
// The single biggest plugin-pack on-ramp friction is: a user reads the
// help, sees the CLI mentions a `docent.config.ts`, and then has to spelunk
// through source (`load-config.ts`, `engine-factory.ts`) to learn the
// search rules and the export contract. This command closes that gap.
//
// It drops a working `docent.config.ts` at the project root with a worked
// example for the chosen plugin kind. `--with` picks one kind; omitted it
// emits all four so the author can see the full surface.
//
// The scaffold is intentionally educational — verbose comments explain
// each field, the protocol contract, and what the registry will refuse.

import {existsSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {CONFIG_FILENAMES, CONFIG_SEARCH_ANCESTORS} from '../load-config';

export type InitConfigKind = 'preset' | 'scene' | 'feature' | 'tts';

export interface InitConfigArgs {
  readonly projectRoot?: string;
  /** Which example to include; absent = all four. */
  readonly withKind?: InitConfigKind;
  readonly force?: boolean;
}

const log = (s: string): void => process.stdout.write(`${s}\n`);

const PRESET_EXAMPLE = `// ----- preset plugin --------------------------------------------------------
// A PresetPlugin contributes a named style (token bundle + visualization
// knobs). Films opt in via \`style: {preset: 'my-brand'}\`.
//
// Conflict rule: two presets sharing a \`presetName\` reject at registry time.

import type {PresetPlugin} from '@bjelser/kit';

const myBrandPreset: PresetPlugin = {
  kind: 'preset',
  name: '@me/my-brand',
  version: '0.1.0',
  presetName: 'my-brand',

  // Optional — extend an already-registered preset. Inheritance is
  // base-first; your tokens shadow the parent. \`'neutral'\` is the
  // implicit floor and does not need to be registered.
  // extends: 'engineering',

  // Token overrides — shallow-merged with the parent + neutral floor.
  tokens: {
    background: {primary: '#0c0f1c'},
    accent: {hue: '#7dd3fc'},
  },

  // Visualization knobs — picks defaults for charts, legends, gridlines.
  visualization: {
    legendPosition: 'bottom',
    gridLines: false,
    axisLabels: true,
  },

  // Human-readable one-liner — surfaced by \`docent style list\` and the
  // recommender. The author reads this when deciding which preset to use.
  cue: 'cool dark broadsheet — long-form technical explainers.',

  // Recommender signals: substrings (case-insensitive) the recommender
  // matches against analysis/<id>.md, weighted 1-4.
  signals: [
    {needle: 'distributed system', weight: 3},
    {needle: 'protocol', weight: 2},
  ],
};
`;

const SCENE_EXAMPLE = `// ----- scene plugin ---------------------------------------------------------
// A ScenePlugin contributes a new scene \`type\` to the grammar — its own
// schema fragment, validator, and Remotion component. The kit's union
// schema picks up your branch automatically.
//
// Conflict rule: two scene plugins sharing a \`sceneType\` reject at
// registry time. The closed cluster taxonomy (see \`COGNITIVE_CLUSTERS\`)
// names the cognitive move the scene performs.

import type {ScenePlugin} from '@bjelser/kit';

const exampleScenePlugin: ScenePlugin = {
  kind: 'scene',
  name: '@me/example-scene',
  version: '0.1.0',
  sceneType: 'example',
  cluster: 'narrative', // closed taxonomy: connection|time|flow|comparison|categorization|experience|narrative|null

  // JSON Schema fragment merged into the union film schema. Keep it
  // disciplined: \`additionalProperties: false\` so a typo surfaces at
  // validate time, not render time.
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'heading'],
    properties: {
      type: {const: 'example'},
      heading: {type: 'string'},
      beats: {type: 'array'},
    },
  },

  // The Remotion component the engine mounts for this scene type.
  component: (() => null) as never, // replace with your React component

  cue: 'reach for it when the canonical example move calls for it.',
  signals: [{needle: 'example', weight: 4}],
};
`;

const FEATURE_EXAMPLE = `// ----- feature plugin -------------------------------------------------------
// A FeaturePlugin is the cross-cutting hook — it can inject style tokens,
// wrap every scene, validate the whole film, preprocess the spec, or
// register additional child plugins. The 'audio-bed' feature in
// @bjelser/core is the canonical example.

import type {FeaturePlugin} from '@bjelser/kit';

const exampleFeature: FeaturePlugin = {
  kind: 'feature',
  name: '@me/example-feature',
  version: '0.1.0',

  // Surface a film-level validation hook — runs after every scene plugin's
  // \`validate\`. Use it to verify cross-scene invariants (e.g. that an
  // ASSET referenced by the film actually exists on disk).
  validateSpec(spec, ctx) {
    void spec; void ctx;
    return []; // empty = clean
  },
};
`;

const TTS_EXAMPLE = `// ----- tts provider plugin --------------------------------------------------
// A TtsProviderPlugin wires up a synthesis backend. Films opt in via
// \`meta.tts: {provider: 'my-tts'}\`. The kit's \`@bjelser/tts-*\` packages
// are reference implementations.

import type {TtsProviderPlugin} from '@bjelser/kit';

const myTtsProvider: TtsProviderPlugin = {
  kind: 'tts',
  name: '@me/my-tts',
  version: '0.1.0',
  providerId: 'my-tts',

  capabilities: {
    voices: [{id: 'default', label: 'Default voice'}],
    languages: ['en'],
  },

  create() {
    return {
      providerId: 'my-tts',
      async synthesize(_opts) {
        throw new Error('replace with your provider');
      },
    };
  },
};
`;

const buildConfig = (kind: InitConfigKind | undefined): string => {
  const header = `// docent.config.ts — registers project-local plugins on top of @bjelser/core.
//
// The CLI walks UP from the working directory looking for the first
// docent.config.{ts,tsx,js,mjs} it finds (up to ${CONFIG_SEARCH_ANCESTORS} ancestors).
// When found, the default export's \`plugins\` array is registered on
// top of corePlugins.
//
// Conflict policy: registering a plugin that reuses a \`sceneType\`,
// \`presetName\`, or \`providerId\` already claimed by core (or by an earlier
// plugin in this array) throws at engine construction time with both
// names surfaced.
//
// Search path: ${CONFIG_FILENAMES.join(', ')}
`;

  const exampleByKind: Record<InitConfigKind, string> = {
    preset: PRESET_EXAMPLE,
    scene: SCENE_EXAMPLE,
    feature: FEATURE_EXAMPLE,
    tts: TTS_EXAMPLE,
  };

  const examples = kind
    ? exampleByKind[kind]
    : [PRESET_EXAMPLE, SCENE_EXAMPLE, FEATURE_EXAMPLE, TTS_EXAMPLE].join('\n');

  const exportNames: Record<InitConfigKind, string> = {
    preset: 'myBrandPreset',
    scene: 'exampleScenePlugin',
    feature: 'exampleFeature',
    tts: 'myTtsProvider',
  };
  const plugins = kind
    ? `[${exportNames[kind]}]`
    : `[
    myBrandPreset,
    exampleScenePlugin,
    exampleFeature,
    myTtsProvider,
  ]`;

  return `${header}
${examples}
export default {
  plugins: ${plugins},
};
`;
};

export const runInitConfig = async (args: InitConfigArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const target = resolve(projectRoot, 'docent.config.ts');

  if (existsSync(target) && !args.force) {
    log(`\x1b[31m✗ ${target} already exists. Pass --force to overwrite.\x1b[0m`);
    return 1;
  }

  const content = buildConfig(args.withKind);
  writeFileSync(target, content, 'utf-8');

  log(`\x1b[32m✓ wrote ${target}\x1b[0m`);
  log('');
  log('  Next:');
  log('    1. Replace the stub component / synthesize / token values with your own.');
  log('    2. \x1b[36mbunx docent doctor\x1b[0m   — confirms your plugin registered cleanly.');
  log('    3. \x1b[36mbunx docent style list\x1b[0m   (or scene-fit list) — see the new entry.');
  log('');
  if (!args.withKind) {
    log('  Tip: pass \x1b[36m--with preset|scene|feature|tts\x1b[0m to scaffold one kind only.');
  }
  return 0;
};
