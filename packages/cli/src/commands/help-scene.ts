// `docent help <scene-type>` — surface the rich schema docs that already
// live inside each scene plugin's `schema` field (a JSON Schema fragment
// with author-written `description` strings) at the CLI, so a spec author
// or agent can ask "what does a structure scene look like?" without having
// to crack open packages/core.
//
// The command walks the engine registry exactly like scene-fit, finds the
// plugin whose `sceneType` matches the requested name, then prints:
//   - the type name + cluster + cue
//   - the top-level schema description
//   - required + optional scene-level fields with their descriptions/types
//   - any plugin-declared depthRules
//   - a "BEATS" section that names the open-index beat fields the scene's
//     component actually reads (frame: `show`, recap: numeric `reveal`,
//     diff/closeup: `highlight`, structure: `transform`/`pulse`, etc.)
//     — these are the soft contract beats need to honor to hit the
//     scene's reveal/focus animation. They are NOT in the per-scene
//     schema (the kit's Beat schema is open) so this command is the only
//     place an author sees them documented.
//   - one canonical example pulled from a known films/ spec, when present.
//
// This is a READ-ONLY introspection command — no engine state mutates, no
// files write. Exits 0 on hit, 1 on miss (with the available scene-type
// list printed for orientation).

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import type {JSONSchema7, JSONSchema7Definition} from 'json-schema';
import type {DepthRule, ScenePlugin} from '@bjelser/kit';

import {createEngine} from '../engine-factory';

// ---- ANSI helpers (mirrored from commands/doctor.ts) ------------------------

const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
const err = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

// ---- beat open-index contracts ---------------------------------------------
//
// The kit's `Beat` schema is intentionally open: each scene's component
// reads its OWN beat fields via a `(beat as {foo?: T}).foo` cast. The
// schema layer never sees those keys — which means an author has no way
// to discover them. This table is the authored documentation of those
// reads, harvested from the components themselves.
//
// Keep entries terse — one line per key, naming what the key drives.

interface BeatHook {
  readonly key: string;
  readonly type: string;
  readonly note: string;
}

const BEAT_HOOKS: Readonly<Record<string, ReadonlyArray<BeatHook>>> = {
  frame: [
    {
      key: 'show',
      type: 'string',
      note: "names a frame slot to spring in (e.g. 'title', 'tagline', 'footnote').",
    },
  ],
  recap: [
    {
      key: 'reveal',
      type: 'number',
      note: '1-based index of the last recap point visible at this beat (NOT the string[] reveal the kit Beat schema describes).',
    },
  ],
  diff: [
    {
      key: 'highlight',
      type: '[number, number]',
      note: 'spotlight a hunk by [startLine, endLine] (1-indexed against the diff body).',
    },
  ],
  closeup: [
    {
      key: 'highlight',
      type: '[number, number]',
      note: 'spotlight a code range by [first, last] (1-indexed against the code listing).',
    },
    {
      key: 'note',
      type: 'string',
      note: 'a single-line accent annotation pinned under the window.',
    },
  ],
  structure: [
    {
      key: 'transform',
      type: '{node: string, ...directives}',
      note: "re-bind a node's representation mid-scene (box → matrix → equation, etc.).",
    },
    {
      key: 'pulse',
      type: 'Array<[string, string]>',
      note: 'flow pulses along edges, as [fromNodeId, toNodeId] pairs.',
    },
    {
      key: 'focus',
      type: 'string[]',
      note: 'node ids to lean the camera toward this beat.',
    },
  ],
  passage: [
    {key: 'reveal', type: 'string[]', note: 'phrase ids revealed at this beat.'},
    {key: 'focus', type: 'string[]', note: 'phrase ids to emphasize at this beat.'},
  ],
  venn: [
    {key: 'reveal', type: 'string[]', note: 'set/intersection ids revealed at this beat.'},
    {key: 'focus', type: 'string[]', note: 'set/intersection ids to emphasize at this beat.'},
  ],
  tree: [
    {key: 'focus', type: 'string[]', note: 'tree node ids to lean toward this beat.'},
  ],
  figure: [
    {key: 'focus', type: 'string[]', note: 'figure region ids to emphasize at this beat.'},
  ],
  map: [
    {key: 'focus', type: 'string[]', note: 'map region ids to emphasize at this beat.'},
  ],
  probe: [
    {key: 'reveal', type: 'string[]', note: 'probe row ids revealed at this beat.'},
    {key: 'focus', type: 'string[]', note: 'probe row ids to emphasize at this beat.'},
    {key: 'cadence', type: "'together' | 'cascade' | 'snap'", note: 'rhythm reveals enter with.'},
  ],
  walkthrough: [
    {key: 'message', type: 'string', note: 'optional inline message displayed at this beat.'},
  ],
};

// ---- canonical example registry --------------------------------------------
//
// One known canonical film + scene-id per scene-type. Looked up at help
// time from films/<film>.json; absence falls through to the synthesized
// minimal example. The films listed here are all check-in fixtures in
// the repo's films/ directory; missing files just degrade gracefully.

interface CanonicalRef {
  readonly film: string;
  readonly sceneId: string;
}

const CANONICAL_EXAMPLES: Readonly<Record<string, CanonicalRef>> = {
  structure: {film: 'docent-self', sceneId: 'vocab'},
  frame: {film: 'docent-self', sceneId: 'frame'},
  progression: {film: 'docent-self', sceneId: 'gates'},
  compare: {film: 'docent-self', sceneId: 'fork'},
  tension: {film: 'docent-self', sceneId: 'strain'},
  quantities: {film: 'docent-self', sceneId: 'numbers'},
  recap: {film: 'docent-self', sceneId: 'verdict'},
  'prior-art': {film: 'docent-self', sceneId: 'prior-art'},
};

const findSceneInFilm = (
  projectRoot: string,
  ref: CanonicalRef,
): unknown | null => {
  const path = join(projectRoot, 'films', `${ref.film}.json`);
  if (!existsSync(path)) return null;
  try {
    const spec = JSON.parse(readFileSync(path, 'utf-8')) as {
      scenes?: ReadonlyArray<{id?: string}>;
    };
    return (
      spec.scenes?.find((s) => s && typeof s === 'object' && s.id === ref.sceneId) ??
      null
    );
  } catch {
    return null;
  }
};

// ---- JSON-Schema introspection ---------------------------------------------

const isObjectSchema = (s: JSONSchema7Definition): s is JSONSchema7 =>
  typeof s === 'object' && s !== null;

const formatType = (schema: JSONSchema7): string => {
  if (schema.enum) {
    return schema.enum
      .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(' | ');
  }
  if (schema.type === 'array') {
    const items = schema.items;
    if (Array.isArray(items)) return 'array';
    if (items && isObjectSchema(items)) {
      const inner = items.type ?? 'object';
      return `${Array.isArray(inner) ? inner.join('|') : inner}[]`;
    }
    return 'array';
  }
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  return schema.type ?? 'object';
};

const printProperty = (
  name: string,
  schema: JSONSchema7Definition,
  required: boolean,
  indent: string = '  ',
): void => {
  if (!isObjectSchema(schema)) {
    log(`${indent}${cyan(name)}  ${dim(`<inline schema>`)}`);
    return;
  }
  const typeStr = formatType(schema);
  const reqTag = required ? red(' (required)') : '';
  log(`${indent}${cyan(name)}  ${dim(typeStr)}${reqTag}`);
  const desc = schema.description;
  if (desc) {
    for (const line of wrap(desc, 92, indent + '    ')) {
      log(dim(line));
    }
  }
};

const wrap = (text: string, width: number, indent: string): string[] => {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = indent;
  for (const w of words) {
    if (line.length + w.length + 1 > width && line.length > indent.length) {
      out.push(line);
      line = indent + w;
    } else if (line === indent) {
      line = indent + w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.length > indent.length) out.push(line);
  return out;
};

// ---- the command ------------------------------------------------------------

export interface HelpSceneArgs {
  readonly sceneType: string;
  /** Override the project root. */
  readonly projectRoot?: string;
}

export const runHelpScene = async (args: HelpSceneArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const {engine} = await createEngine(projectRoot);
  const plugins = engine.scenes.all() as ReadonlyArray<ScenePlugin>;

  const plugin = plugins.find((p) => p.sceneType === args.sceneType);
  if (!plugin) {
    err(red(`docent help: no scene plugin registered for '${args.sceneType}'`));
    err('');
    err(dim('  available scene types:'));
    const types = plugins.map((p) => p.sceneType).sort();
    const cols = 4;
    for (let i = 0; i < types.length; i += cols) {
      err(
        '    ' +
          types
            .slice(i, i + cols)
            .map((t) => t.padEnd(16))
            .join(''),
      );
    }
    return 1;
  }

  const schema = plugin.schema as JSONSchema7 | undefined;
  const cluster =
    plugin.cluster === null ? 'chrome' : (plugin.cluster ?? 'unclassified');

  // ---- header ---------------------------------------------------------------
  log('');
  log(`${bold(cyan(plugin.sceneType))}  ${dim(`(cluster: ${cluster})`)}`);
  if (plugin.cue) {
    log(dim(`  ${plugin.cue}`));
  }
  log('');

  // ---- top-level description -----------------------------------------------
  if (schema?.description) {
    log(bold(cyan('DESCRIPTION')));
    for (const line of wrap(schema.description, 92, '  ')) log(line);
    log('');
  }

  // ---- scene-level fields ---------------------------------------------------
  if (schema?.properties) {
    const required = new Set(schema.required ?? []);
    const props = Object.entries(schema.properties);
    const requiredProps = props.filter(([k]) => required.has(k));
    const optionalProps = props.filter(([k]) => !required.has(k));

    if (requiredProps.length > 0) {
      log(bold(cyan('REQUIRED')));
      for (const [name, sub] of requiredProps) {
        printProperty(name, sub, true);
      }
      log('');
    }

    if (optionalProps.length > 0) {
      log(bold(cyan('OPTIONAL')));
      for (const [name, sub] of optionalProps) {
        printProperty(name, sub, false);
      }
      log('');
    }
  }

  // ---- beat-level open-index hooks -----------------------------------------
  const beatHooks = BEAT_HOOKS[plugin.sceneType];
  if (beatHooks && beatHooks.length > 0) {
    log(bold(cyan('BEATS')));
    log(dim('  fields the scene component reads off each beat (open-index,'));
    log(dim('  outside the kit Beat schema — discoverable only here):'));
    for (const h of beatHooks) {
      log(`  ${cyan(h.key)}  ${dim(h.type)}`);
      for (const line of wrap(h.note, 92, '      ')) log(dim(line));
    }
    log('');
  }

  // ---- depth rules ----------------------------------------------------------
  const rules = plugin.depthRules as
    | ReadonlyArray<DepthRule<unknown>>
    | undefined;
  if (rules && rules.length > 0) {
    log(bold(cyan('DEPTH RULES')));
    for (const r of rules) {
      const sev =
        r.severity === 'error'
          ? red(r.severity)
          : r.severity === 'warning'
            ? yellow(r.severity)
            : dim(r.severity);
      log(`  ${cyan(r.id)}  ${dim(`[${r.scope ?? 'scene'}]`)}  ${sev}`);
      for (const line of wrap(r.description, 92, '      ')) log(dim(line));
    }
    log('');
  } else if (plugin.depthRules) {
    log(bold(cyan('DEPTH RULES')));
    log(dim('  (none — this scene inherits only film-wide depth rules)'));
    log('');
  }

  // ---- canonical example ----------------------------------------------------
  const exampleRef = CANONICAL_EXAMPLES[plugin.sceneType];
  if (exampleRef) {
    const example = findSceneInFilm(projectRoot, exampleRef);
    if (example) {
      log(bold(cyan('EXAMPLE')));
      log(
        dim(
          `  from films/${exampleRef.film}.json (scene id: '${exampleRef.sceneId}')`,
        ),
      );
      log('');
      const pretty = JSON.stringify(example, null, 2)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n');
      log(pretty);
      log('');
    }
  }

  return 0;
};
