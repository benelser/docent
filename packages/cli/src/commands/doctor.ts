// docent doctor — plugin-pack conformance + setup diagnostics.
//
// Surfaces "is my plugin pack right?" without having to render a film.
// Reads the engine registry (core + any user-config plugins) and grades
// every registered plugin against the protocol contract. The bar:
//
//   ERROR    — the plugin is structurally invalid; renders WILL fail.
//   WARN     — the plugin is valid but missing something authors want
//              (a `cue` for scene-fit, signals for the recommender to
//              ever pull it in, judgeDimensions to be graded by the
//              LLM judge, etc.).
//   INFO     — counts + cluster distribution, useful for orientation.
//
// Exit code 0 on no errors; 6 on at least one error. Warnings never fail
// the exit code — they're informational, not blocking.
//
// Output formats:
//   docent doctor          human-readable terminal output (default).
//   docent doctor --json   machine-readable for CI gates.

import {createEngine} from '../engine-factory';
import {describeSearchPath} from '../load-config';
import {
  COGNITIVE_CLUSTERS,
  isCognitiveCluster,
  type Plugin,
  type ScenePlugin,
} from '@bjelser/kit';

type Severity = 'error' | 'warn' | 'info';

interface Finding {
  readonly severity: Severity;
  readonly plugin: string;
  readonly sceneType: string | null;
  readonly code: string;
  readonly message: string;
}

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};

/**
 * Pull the kind-specific identifier off a plugin — `sceneType` for scenes,
 * `presetName` for presets, `providerId` for TTS. Features have no extra
 * identity beyond `name`, so we return null and let the caller render a dim
 * dash. Pure — does no I/O.
 */
const identifyPlugin = (
  p: Plugin,
): {readonly label: string; readonly value: string} | null => {
  switch (p.kind) {
    case 'scene':
      return {label: 'sceneType', value: p.sceneType};
    case 'preset':
      return {label: 'presetName', value: p.presetName};
    case 'tts':
      return {label: 'providerId', value: p.providerId};
    case 'feature':
      return null;
    default:
      // Forward-compat: an unknown kind. Surface name only.
      return null;
  }
};

const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;

export interface DoctorArgs {
  /** Override the project root (config + plugin discovery). */
  readonly projectRoot?: string;
  /** Emit JSON on stdout instead of human output. */
  readonly json?: boolean;
}

export const runDoctor = async (args: DoctorArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const {engine, configPath, userPlugins} = await createEngine(projectRoot);

  const findings: Finding[] = [];
  const scenePlugins = engine.scenes.all() as ReadonlyArray<ScenePlugin>;
  const presetPlugins = engine.presets.all();
  const featurePlugins = engine.features.all();
  const ttsPlugins = engine.tts.all();

  // ---- scene plugin conformance ------------------------------------------
  const sceneTypeCounts = new Map<string, number>();
  for (const p of scenePlugins) {
    const at = p.sceneType ?? '(no sceneType)';
    sceneTypeCounts.set(at, (sceneTypeCounts.get(at) ?? 0) + 1);

    // sceneType present + non-empty
    if (!p.sceneType || typeof p.sceneType !== 'string') {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: null,
        code: 'scene/missing-sceneType',
        message: 'ScenePlugin must declare a non-empty sceneType (the discriminator).',
      });
    }
    // cluster is in closed taxonomy (or null for chrome)
    const cl = p.cluster as string | null | undefined;
    if (cl === undefined) {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-cluster',
        message: `ScenePlugin must declare a cluster (one of: ${COGNITIVE_CLUSTERS.join(', ')} | null for chrome).`,
      });
    } else if (cl !== null && !isCognitiveCluster(cl)) {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/bad-cluster',
        message: `cluster '${cl}' is not in the closed taxonomy (allowed: ${COGNITIVE_CLUSTERS.join(', ')} | null).`,
      });
    }
    // schema present
    if (!p.schema) {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-schema',
        message: 'ScenePlugin.schema is required (JSON Schema fragment merged into the computed film schema).',
      });
    }
    // component present
    if (!p.component) {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-component',
        message: 'ScenePlugin.component is required.',
      });
    }
    // cue: warn-level, optional but strongly encouraged
    if (typeof p.cue !== 'string' || p.cue.trim().length === 0) {
      findings.push({
        severity: 'warn',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-cue',
        message:
          "ScenePlugin.cue is missing — `docent scene-fit list` will surface '(no cue advertised)'. " +
          'Recommended: one-line "reach for it when" description.',
      });
    }
    // signals: warn for non-chrome scenes
    const isChrome = cl === null;
    if (!isChrome && (!p.signals || p.signals.length === 0)) {
      findings.push({
        severity: 'warn',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/no-signals',
        message:
          'ScenePlugin.signals is empty on a non-chrome scene — the recommender ' +
          'will not pull this scene into ranked results. Recommended: 3+ weighted needles.',
      });
    }
    // signals validity: every weight in 1..4
    if (Array.isArray(p.signals)) {
      for (let i = 0; i < p.signals.length; i++) {
        const s = p.signals[i]!;
        if (
          typeof s.needle !== 'string' ||
          s.needle.trim().length === 0
        ) {
          findings.push({
            severity: 'error',
            plugin: p.name,
            sceneType: p.sceneType ?? null,
            code: 'scene/bad-signal-needle',
            message: `signals[${i}].needle must be a non-empty string.`,
          });
        }
        if (
          typeof s.weight !== 'number' ||
          !Number.isFinite(s.weight) ||
          s.weight < 1 ||
          s.weight > 4
        ) {
          findings.push({
            severity: 'error',
            plugin: p.name,
            sceneType: p.sceneType ?? null,
            code: 'scene/bad-signal-weight',
            message: `signals[${i}].weight must be an integer in [1..4] (got: ${s.weight}).`,
          });
        }
      }
    }
    // depth rules: empty array is allowed; missing = warn
    if (p.depthRules === undefined) {
      findings.push({
        severity: 'warn',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-depth-rules',
        message:
          'ScenePlugin.depthRules is undefined — declare an empty array `[]` to honor the depthcheck contract explicitly.',
      });
    }
    // judge dimensions: same pattern
    if (p.judgeDimensions === undefined) {
      findings.push({
        severity: 'warn',
        plugin: p.name,
        sceneType: p.sceneType ?? null,
        code: 'scene/missing-judge-dimensions',
        message:
          'ScenePlugin.judgeDimensions is undefined — declare an empty array `[]` to honor the judge contract explicitly.',
      });
    }
  }

  // duplicate sceneType detection — should never reach here (engine.use
  // hard-fails on conflict) but surface it explicitly so a runtime caller
  // can confirm the registry is clean.
  for (const [st, count] of sceneTypeCounts) {
    if (count > 1) {
      findings.push({
        severity: 'error',
        plugin: '(registry)',
        sceneType: st,
        code: 'registry/duplicate-sceneType',
        message: `${count} plugins claim sceneType '${st}' — registry should hard-fail this at engine.use().`,
      });
    }
  }

  // ---- preset extends-chain conformance (R4) ----------------------------
  //
  // The resolver throws on cycle / unknown extends at style-resolution
  // time. Doctor surfaces both at registry-load time so an author catches
  // the problem before the first render.
  const presetByName = new Map<string, (typeof presetPlugins)[number]>();
  for (const p of presetPlugins) presetByName.set(p.presetName, p);
  for (const p of presetPlugins) {
    const ext = p.extends;
    if (!ext) continue;
    if (ext === 'neutral') continue; // neutral floor — implicit, always OK
    if (!presetByName.has(ext)) {
      findings.push({
        severity: 'error',
        plugin: p.name,
        sceneType: null,
        code: 'preset/unknown-extends',
        message: `preset '${p.presetName}' extends '${ext}' which is not registered`,
      });
      continue;
    }
    // Walk to detect cycles
    const seen = new Set<string>([p.presetName]);
    let cursor: typeof p | undefined = presetByName.get(ext);
    while (cursor) {
      if (seen.has(cursor.presetName)) {
        findings.push({
          severity: 'error',
          plugin: p.name,
          sceneType: null,
          code: 'preset/extends-cycle',
          message: `preset '${p.presetName}' extends chain cycles back to '${cursor.presetName}'`,
        });
        break;
      }
      seen.add(cursor.presetName);
      const nextExt = cursor.extends;
      if (!nextExt || nextExt === 'neutral') break;
      cursor = presetByName.get(nextExt);
    }
  }

  // ---- output ------------------------------------------------------------
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.json) {
    log(
      JSON.stringify(
        {
          engine: {
            scenes: scenePlugins.length,
            presets: presetPlugins.length,
            features: featurePlugins.length,
            tts: ttsPlugins.length,
            userPlugins: userPlugins.length,
            configPath,
          },
          findings,
          errorCount: errors.length,
          warnCount: warns.length,
        },
        null,
        2,
      ),
    );
    return errors.length > 0 ? 6 : 0;
  }

  log(cyan('▶ docent doctor — plugin conformance + setup'));
  log('');
  log(
    dim(
      `  engine: ${scenePlugins.length} scenes · ${presetPlugins.length} presets · ` +
        `${ttsPlugins.length} tts · ${featurePlugins.length} features` +
        (configPath ? ` (+${userPlugins.length} from ${configPath})` : ''),
    ),
  );
  if (!configPath) {
    // The user can't tell whether docent.config.ts was picked up unless we
    // say so. Echo the search rules verbatim so a missing config or a
    // misnamed file shows up at doctor time, not at first render.
    log(dim(`  ${describeSearchPath(projectRoot)} — no config found`));
    log(dim('  scaffold one with: docent init-config'));
  }
  log('');

  // USER PLUGINS — what the docent.config.ts added on top of core. The
  // engine summary line above shows the count ("+1 from /…/docent.config.ts")
  // but the user still has to read source to know WHICH plugin registered.
  // This block names each one with its kind-specific identity (sceneType,
  // presetName, providerId, or just the plugin name for features).
  if (userPlugins.length > 0) {
    log(bold('  User plugins'));
    for (const p of userPlugins) {
      const id = identifyPlugin(p);
      const ident = id ? `${id.label}=${cyan(id.value)}` : dim('—');
      log(`    ${p.kind.padEnd(8)} ${p.name.padEnd(28)} ${ident}`);
    }
    log('');
  }

  // Cluster distribution — orientation aid
  log(bold('  Cluster distribution (scenes)'));
  const byCluster = new Map<string, number>();
  for (const p of scenePlugins) {
    const cl = p.cluster === null ? 'chrome' : (p.cluster ?? 'unclassified');
    byCluster.set(cl, (byCluster.get(cl) ?? 0) + 1);
  }
  const order = [
    'connection',
    'time',
    'flow',
    'comparison',
    'categorization',
    'experience',
    'narrative',
    'chrome',
    'unclassified',
  ];
  for (const cl of order) {
    const n = byCluster.get(cl);
    if (!n) continue;
    log(`    ${cl.padEnd(16)} ${dim(String(n))}`);
  }
  log('');

  // Errors
  if (errors.length === 0) {
    log(green('  ✓ No structural errors'));
  } else {
    log(red(`  ✗ ${errors.length} error(s)`));
    for (const f of errors) {
      const where = f.sceneType ? `${f.plugin} (${f.sceneType})` : f.plugin;
      log(red(`    ✗ ${where} · ${f.code}`));
      log(dim(`      ${f.message}`));
    }
  }
  log('');

  // Warnings
  if (warns.length === 0) {
    log(green('  ✓ No conformance warnings'));
  } else {
    log(yellow(`  ⚠ ${warns.length} warning(s) (informational)`));
    // Group by code so a missing cue across N scenes reads as N×missing-cue,
    // not N separate lines.
    const byCode = new Map<string, Finding[]>();
    for (const f of warns) {
      const bucket = byCode.get(f.code) ?? [];
      bucket.push(f);
      byCode.set(f.code, bucket);
    }
    for (const [code, group] of byCode) {
      const first = group[0]!;
      const names = group.map((g) => g.sceneType ?? g.plugin).join(', ');
      log(yellow(`    ⚠ ${code} (${group.length}):`));
      log(dim(`      ${first.message}`));
      log(dim(`      plugins: ${names}`));
    }
  }
  log('');

  if (errors.length > 0) {
    log(red(`✗ doctor FAILED — ${errors.length} error(s), ${warns.length} warning(s)`));
    return 6;
  }
  log(
    green(
      `✓ doctor PASSED — every registered plugin honors the protocol${warns.length > 0 ? ` (${warns.length} warning(s))` : ''}`,
    ),
  );
  return 0;
};
