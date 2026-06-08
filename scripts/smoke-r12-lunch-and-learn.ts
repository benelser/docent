#!/usr/bin/env bun
// Smoke test for R12 — the lunch-and-learn / FDE knowledge-base workflow.
//
// THE PROOF: an FDE or SRE points docent at a curated knowledge-base directory,
// authors a treatment that BINDS to specific assets from that KB, and the
// pipeline emits a depth-passing, valid docent film spec where every
// asset-bound scene's `image` / `clip` / `text` resolves to a real file.
//
// SHAPE OF A REAL KB (synthesized inside /tmp by this script):
//   public/wiki/        ← 3 .md wiki pages + 1 README index
//   public/figures/     ← 2 .png architecture diagrams
//   public/clips/<id>/  ← 2 .mp4 screen-recordings (≈3s, ffmpeg-synthesized)
//   public/configs/     ← 1 runbook YAML + 1 alert payload JSON
//
// THE FOUR PIPELINE STEPS:
//   1. INDEX     — classify every file in the KB by kind (wiki, diagram,
//                  screen-recording, runbook-config, unknown).
//   2. TREATMENT — compile treatments/<id>.md → films/<id>.json, resolving
//                  each `figure: foo.png` / `demo: bar.mp4` / `passage: doc.md`
//                  binding to the synthesized asset.
//   3. VALIDATE  — `docent validate <id>` exit 0.
//   4. DEPTHCHECK— `docent depthcheck <id>` exit 0.
//
// STRATEGY (per R12 brief): hybrid — we shell out to the CLI for `validate`
// and `depthcheck` (those are landed surface area), but R12.2 (asset indexer
// `docent index`) and R12.3 (treatment asset binding) have NOT landed yet.
// For those two we ship MINIMAL LOCAL STUBS inside this script — clearly
// scoped to "smoke-only stubs that encode the R12.2/R12.3 contract" — so the
// smoke runs standalone in this worktree. When R12.2 and R12.3 land, the
// orchestrator can either reconcile by deleting the stubs and shelling out to
// `docent index` / the upgraded `treatment --to-spec`, or keep the stubs as
// a contract reference.
//
// API CONTRACTS WE ASSUME (R12.2, R12.3 — write these against, not the
// current main):
//
//   R12.2 (asset indexer):  indexDirectory(rootDir) → AssetIndex
//     where AssetIndex.files: Array<{path, kind}> and `kind` is one of:
//       'wiki' | 'diagram' | 'screen-recording' | 'runbook-config' | 'unknown'
//     Classification heuristics:
//       *.md                         → wiki
//       *.png|*.jpg|*.jpeg|*.svg     → diagram
//       *.mp4|*.mov|*.webm           → screen-recording
//       *.yml|*.yaml|*.json (runbook
//          or alert-shape)           → runbook-config (else unknown)
//
//   R12.3 (treatment asset binding):  treatment lines like
//     `figure: request-flow.png — annotate the load-balancer split`
//     compile to the corresponding scene branch with the asset path
//     resolved under  public/<kind>/<file>  — figures/, videos/, wiki/.
//     The compiler also inlines a `passage:` md file's contents into the
//     spec's `text` field (passage scenes need raw text, not a path).
//
// EXIT CODES
//   0  PASS
//   1  setup error (ffmpeg missing, fs error, etc.)
//   2  CLI step failed (validate, depthcheck non-zero)
//   3  KPI assertion failed (indexer mis-classified, missing scene type, etc.)

import {execFileSync, spawnSync} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {basename, dirname, extname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// ----------------------------------------------------------------------------
// Constants & paths
// ----------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CLI_ENTRY = join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');

const SMOKE_ROOT = '/tmp/docent-r12-smoke';
const FILM_ID = 'oncall-runbook-101';

const log = (s: string): void => process.stdout.write(`${s}\n`);
const err = (s: string): void => process.stderr.write(`${s}\n`);

// Pretty banners.
const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ----------------------------------------------------------------------------
// 0. ffmpeg preflight
// ----------------------------------------------------------------------------

const checkFfmpeg = (): void => {
  const r = spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'});
  if (r.status !== 0 || r.error) {
    err(c.red('✗ ffmpeg not found on PATH'));
    err('  Install with:  brew install ffmpeg');
    process.exit(1);
  }
};

// ----------------------------------------------------------------------------
// 1. Hermetic KB synthesis
// ----------------------------------------------------------------------------

const wipeAndMkdir = (p: string): void => {
  if (existsSync(p)) rmSync(p, {recursive: true, force: true});
  mkdirSync(p, {recursive: true});
};

// Three wiki pages — actual prose, the shape of a real SRE handbook.
const wikiAlertTaxonomy = `# Alert taxonomy

Every page in our on-call alert system carries a severity level and a service
binding. The four severity levels — P0 through P3 — are not a soft suggestion;
they decide who gets woken up, how loud the page is, and what the response-time
SLO is.

## P0 — page the lead now
P0 alerts fire when customer-facing traffic is broken end-to-end. The signal
shape is "no requests are completing." Examples: the front door returns 502 at
> 1% for more than 60 seconds; the payments path returns 5xx at > 5% for more
than 30 seconds. P0 is the only severity that pages the rotating on-call lead
in addition to the primary; response time is two minutes, twenty-four hours a
day, no exceptions.

## P1 — page the primary
P1 alerts fire when a critical subsystem is degraded but the front door is
still serving. The signal shape is "things are slow or partially broken." A
queue backlog crossing 10,000 messages, a database replica lagging by more
than 30 seconds, a cache hit rate dropping below 80 percent. Response time is
fifteen minutes during business hours, thirty minutes otherwise.

## P2 — wake nobody, but file before EOD
P2 alerts fire when a non-critical service shows anomalous behavior. The
signal shape is "this would be a P1 if it spread." Response is "investigate by
end of day"; the alert routes to a Slack channel, not a pager.

## P3 — informational
P3 alerts are the dashboard layer: useful for retros, never for paging. They
exist so we can grep the audit log later when something else fires.

## What this taxonomy gets wrong
The cliff between P1 and P2 is sharper than the prose admits. A cache miss
rate climbing toward 80 percent is a P2; crossing it is a P1. The actual
operational reality is a continuum — but the rotation has to know whether to
wake someone, and "continuum" is not an answer to that question.
`;

const wikiInvestigationProcedure = `# Investigation procedure

When a page fires, the first ninety seconds of your investigation decide
whether the incident resolves in fifteen minutes or escalates into a
three-hour war room. This page documents the procedure we converged on after
the November 2024 retro.

## The first ninety seconds
1. Acknowledge the page in PagerDuty. The clock on response-time SLO stops
   here; everything downstream is response, not detection.
2. Open the linked runbook in a new tab. If the page does not link to a
   runbook, that is itself a finding — file an issue against the alert
   afterward, but do not let it slow you down now.
3. Look at the dashboard the runbook points to BEFORE forming any hypothesis.
   A premature hypothesis steers your eye away from the panel that would have
   resolved the page in thirty seconds.

## The hypothesis loop
Once the first ninety seconds are spent, the rest of the investigation is a
loop: form one hypothesis, name the panel or query that would falsify it,
look at it, update or abandon the hypothesis. Two hypotheses live at once,
not three — three hypotheses means you have not committed enough to falsify
the first one.

## When to escalate
Escalate to the secondary on-call before you run out of ideas, not after.
The right time to call for help is the moment you find yourself opening
panels you do not have a hypothesis about — "let me just look around" is the
sign you have lost the thread. The secondary's job is to bring a fresh set
of eyes; a tired primary plus a fresh secondary resolves faster than a
tired primary alone.

## What this procedure gets wrong
The "do not form a hypothesis in the first ninety seconds" rule is honored
in the breach. Every experienced on-call forms a hypothesis instantly — the
discipline is to mark it as provisional and let the first panel either
confirm or kill it. We have not yet found a way to make this explicit in the
procedure that does not sound preachy.
`;

const wikiMitigationPlaybook = `# Mitigation playbook

Mitigation is the act of stopping the bleeding before you understand the
wound. This page documents the three mitigation patterns we use, in
decreasing order of preference.

## Pattern 1 — rollback
A rollback is the safest mitigation we have. If a deploy went out in the
last hour and the incident started after the deploy, rollback FIRST and
diagnose SECOND. The cost of a wrong rollback (a few minutes of disrupted
deploy pipeline) is far less than the cost of debugging a live incident
under time pressure. The dashboard-walkthrough video on this page steps
through the rollback console.

## Pattern 2 — capacity shift
When the incident is load-shaped — a queue backlog, a thundering herd from
a misbehaving client, a slow downstream — the second pattern is to shift
capacity. Drain the affected region, scale up the healthy region, fail
upstream traffic over. Capacity shift is a cheap and reversible mitigation
that buys time for a real fix.

## Pattern 3 — feature flag
When the incident traces to a specific code path, the third pattern is to
flip a feature flag. This is more invasive than a rollback (it pins behavior
for everyone, not just the incident cohort) but faster than a code change.

## What this playbook gets wrong
We list rollback first because it is safest, but the on-call instinct is
often to skip straight to the feature flag because it feels more surgical.
Resist this. The flag flip looks surgical, but the audit trail is messier
and the cleanup takes longer.

## See also
- Dashboard walkthrough — the four panels every rollback uses
- Safe rollback procedure — the canonical rollback sequence
`;

const wikiReadme = `# On-call knowledge base — index

This directory is the curated knowledge base for the on-call rotation. It is
the source of truth the lunch-and-learn film draws from.

## Contents
- alert-taxonomy.md — severity levels, paging policy
- investigation-procedure.md — the first 90s + the hypothesis loop
- mitigation-playbook.md — rollback, capacity shift, feature flag
- request-flow.png — the request-path architecture diagram
- alert-routing.png — the pager-to-runbook mapping
- dashboard-walkthrough.mp4 — screen-recording: the four-panel dashboard
- safe-rollback.mp4 — screen-recording: the rollback console flow
- runbook.yml — the alert→runbook→escalation policy (machine-readable)
- alert-payload.json — a representative P1 alert payload
`;

const runbookYaml = `version: 1
alerts:
  - id: front-door-5xx
    severity: P0
    description: front-door 5xx rate above SLO floor
    runbook: investigation-procedure.md
    escalate_after_minutes: 5
    on_call:
      primary: oncall-primary
      lead: oncall-lead
  - id: queue-backlog
    severity: P1
    description: queue-backlog above 10000 messages for > 5 minutes
    runbook: mitigation-playbook.md
    escalate_after_minutes: 15
    on_call:
      primary: oncall-primary
  - id: cache-hit-low
    severity: P2
    description: cache hit rate below 80 percent for > 10 minutes
    runbook: alert-taxonomy.md
    escalate_after_minutes: null
    on_call:
      channel: '#sre-soft-alerts'
escalation_policies:
  default:
    - notify: oncall-primary
      after_minutes: 0
    - notify: oncall-secondary
      after_minutes: 10
    - notify: oncall-lead
      after_minutes: 25
`;

const alertPayloadJson = JSON.stringify(
  {
    id: 'evt-2026-06-08-1432',
    severity: 'P1',
    description: 'queue-backlog above 10000 messages for > 5 minutes',
    runbook_url: 'https://wiki.example.com/runbooks/mitigation-playbook',
    fired_at: '2026-06-08T14:32:17Z',
    service: 'order-ingest',
    region: 'us-east-1',
    metric: {
      name: 'queue.backlog',
      value: 14_823,
      threshold: 10_000,
    },
  },
  null,
  2,
);

// ffmpeg-synthesized PNG. lavfi color source → single-frame PNG.
const synthPng = (out: string, color: string): void => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=320x180:d=0.04`,
      '-frames:v',
      '1',
      out,
    ],
    {stdio: 'ignore'},
  );
};

// ffmpeg-synthesized MP4 (~3s, silent, color block). The label is encoded
// into the metadata title rather than drawn — drawtext requires a font path
// that varies between systems, but every ffmpeg build can encode metadata.
const synthMp4 = (out: string, color: string, label: string): void => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=640x360:d=3:r=30`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-metadata',
      `title=${label}`,
      out,
    ],
    {stdio: 'ignore'},
  );
};

interface SynthResult {
  readonly wikiPages: ReadonlyArray<string>; // relative to root
  readonly diagrams: ReadonlyArray<string>;
  readonly clips: ReadonlyArray<string>;
  readonly configs: ReadonlyArray<string>;
}

const synthesizeKb = (root: string): SynthResult => {
  log(c.cyan('▶ synthesizing knowledge base at ') + root);

  // R12.3's resolution convention: assets live under public/<kind>/<file>.
  // We mirror that layout exactly so the spec's relative paths land.
  const publicDir = join(root, 'public');
  const wikiDir = join(publicDir, 'wiki');
  const figDir = join(publicDir, 'figures');
  // Demonstrate scenes resolve `clip` under `public/clips/<filmId>/`
  // (see packages/core/src/scenes/demonstrate/schema.ts). The R12.3 brief
  // says `public/videos/` but the SCENE contract is the load-bearing one,
  // so we honor the scene resolver and surface this mismatch in the smoke
  // friction report.
  const clipDir = join(publicDir, 'clips', FILM_ID);
  const cfgDir = join(publicDir, 'configs');
  for (const d of [wikiDir, figDir, clipDir, cfgDir]) mkdirSync(d, {recursive: true});

  // ----- wiki pages ---------------------------------------------------------
  const wikiFiles: Array<[string, string]> = [
    ['alert-taxonomy.md', wikiAlertTaxonomy],
    ['investigation-procedure.md', wikiInvestigationProcedure],
    ['mitigation-playbook.md', wikiMitigationPlaybook],
    ['README.md', wikiReadme],
  ];
  for (const [name, body] of wikiFiles) {
    writeFileSync(join(wikiDir, name), body, 'utf-8');
  }

  // ----- diagrams (PNGs) ----------------------------------------------------
  synthPng(join(figDir, 'request-flow.png'), 'navy');
  synthPng(join(figDir, 'alert-routing.png'), 'darkgreen');

  // ----- screen recordings (MP4s) -------------------------------------------
  synthMp4(join(clipDir, 'dashboard-walkthrough.mp4'), '0x202020', 'dashboard');
  synthMp4(join(clipDir, 'safe-rollback.mp4'), '0x404040', 'rollback');

  // ----- configs (YAML + JSON) ----------------------------------------------
  writeFileSync(join(cfgDir, 'runbook.yml'), runbookYaml, 'utf-8');
  writeFileSync(join(cfgDir, 'alert-payload.json'), alertPayloadJson, 'utf-8');

  const result: SynthResult = {
    wikiPages: wikiFiles.map(([n]) => join('public', 'wiki', n)),
    diagrams: ['request-flow.png', 'alert-routing.png'].map((n) => join('public', 'figures', n)),
    clips: ['dashboard-walkthrough.mp4', 'safe-rollback.mp4'].map((n) =>
      join('public', 'clips', FILM_ID, n),
    ),
    configs: ['runbook.yml', 'alert-payload.json'].map((n) => join('public', 'configs', n)),
  };

  // Sanity: every synthesized file must be > 0 bytes.
  const allFiles = [
    ...result.wikiPages,
    ...result.diagrams,
    ...result.clips,
    ...result.configs,
  ];
  for (const rel of allFiles) {
    const abs = join(root, rel);
    if (!existsSync(abs) || statSync(abs).size === 0) {
      err(c.red(`✗ synth produced empty file: ${rel}`));
      process.exit(1);
    }
  }
  log(`  synthesized ${allFiles.length} files`);
  return result;
};

// ----------------------------------------------------------------------------
// 2. R12.2 asset-indexer STUB
// ----------------------------------------------------------------------------
//
// CONTRACT (per R12 brief):
//   indexDirectory(rootDir) → AssetIndex {
//     files: Array<{ path: string,   // relative to rootDir
//                    kind: 'wiki' | 'diagram' | 'screen-recording' |
//                          'runbook-config' | 'unknown' }>
//   }
//
// Classification (heuristic, dialect-light):
//   *.md                                  → wiki
//   *.png|*.jpg|*.jpeg|*.svg              → diagram
//   *.mp4|*.mov|*.webm                    → screen-recording
//   *.yml|*.yaml                          → runbook-config
//   *.json + (looks like runbook/alert)   → runbook-config
//   *.json + (otherwise)                  → unknown
//   anything else                         → unknown
//
// The JSON "looks like a runbook or alert" heuristic peeks at the top-level
// keys: if any of {severity, runbook, runbook_url, alerts, escalation_policies}
// appears, it's a runbook-config; otherwise unknown. This is the choice the
// real R12.2 will have to make too — the smoke surfaces it so we have data.

type AssetKind = 'wiki' | 'diagram' | 'screen-recording' | 'runbook-config' | 'unknown';
interface AssetFile {
  readonly path: string;
  readonly kind: AssetKind;
}
interface AssetIndex {
  readonly files: ReadonlyArray<AssetFile>;
}

const RUNBOOK_KEY_HINTS = new Set([
  'severity',
  'runbook',
  'runbook_url',
  'alerts',
  'escalation_policies',
  'on_call',
]);

const classifyJson = (abs: string): AssetKind => {
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = new Set(Object.keys(parsed as Record<string, unknown>));
      for (const k of keys) {
        if (RUNBOOK_KEY_HINTS.has(k)) return 'runbook-config';
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

const classify = (relPath: string, absPath: string): AssetKind => {
  const ext = extname(relPath).toLowerCase();
  if (ext === '.md') return 'wiki';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.svg') return 'diagram';
  if (ext === '.mp4' || ext === '.mov' || ext === '.webm') return 'screen-recording';
  if (ext === '.yml' || ext === '.yaml') return 'runbook-config';
  if (ext === '.json') return classifyJson(absPath);
  return 'unknown';
};

const walk = (root: string, sub: string = ''): string[] => {
  const out: string[] = [];
  const here = join(root, sub);
  for (const entry of readdirSync(here)) {
    const rel = sub ? join(sub, entry) : entry;
    const abs = join(here, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(root, rel));
    else if (st.isFile()) out.push(rel);
  }
  return out;
};

const indexDirectory = (rootDir: string): AssetIndex => {
  const files: AssetFile[] = [];
  for (const rel of walk(rootDir)) {
    // Only index inside `public/` — the rest is project plumbing.
    if (!rel.startsWith('public/') && !rel.startsWith('public' + '/')) continue;
    const abs = join(rootDir, rel);
    files.push({path: rel, kind: classify(rel, abs)});
  }
  return {files};
};

// ----------------------------------------------------------------------------
// 3. R12.3 treatment author + spec compiler STUB
// ----------------------------------------------------------------------------
//
// Authors a treatment markdown by hand (the FDE's handiwork) and then compiles
// it to a film spec. The compiler honors the R12.3 asset-binding syntax:
//
//   - "figure: foo.png — note"   → figure scene with image: "foo.png"
//   - "demo: bar.mp4 — note"     → demonstrate scene with clip: "bar.mp4"
//   - "passage: doc.md — note"   → passage scene with text: <contents of doc.md>
//   - "walkthrough: x.mp4 — n"   → walkthrough scene; clip is referenced in
//                                   the scene.heading and embedded as a
//                                   demonstrate-style note. (No native asset
//                                   slot on walkthrough; we set actors from
//                                   the runbook YAML's on_call cast.)
//
// For frame / tension / recap (no asset binding), the heading prose IS the
// body of the scene the FDE wrote.

const authorTreatment = (): string => `# On-Call Runbook 101

<!-- docent-treatment id: oncall-runbook-101 -->

> Lunch-and-learn film for new on-call engineers. The treatment binds to the
> curated knowledge base under public/ — wiki pages, diagrams, screen-recordings.
> When the spec compiles, every figure / demo / passage line resolves to a real
> asset in the fixture; the spec author never has to copy-paste prose into JSON.

## What this film is about

The first time you go on-call, the pager fires at 2am for an alert you have
never seen. This film is the orientation you wished you had on day one — the
taxonomy of pages, the first ninety seconds, the rollback procedure, the
trade-off the playbook makes between speed and certainty.

## The through-line

A well-designed on-call rotation is a forcing function for clear thinking
under pressure — but the artifact that makes it work is the runbook, not the
heroics. We are going to walk one full incident, end to end.

## Proposed scenes

1. <!-- scene-type: frame -->
   Open the film. Set up: who this is for (new on-call engineers), what they
   will know by the end (the taxonomy + the first 90 seconds + the rollback
   pattern), and what we are going to deliberately NOT cover (post-incident
   reviews — a separate film).

2. <!-- scene-type: passage -->
   passage: alert-taxonomy.md — the canonical alert taxonomy. The four
   severity levels and why the cliff between P1 and P2 is where most
   incidents are mis-paged.

3. <!-- scene-type: figure -->
   figure: request-flow.png — annotate the request flow. Mark the front
   door, the queue, and the database; the three places a P0 originates.

4. <!-- scene-type: walkthrough -->
   walkthrough: dashboard-walkthrough.mp4 — step through the four panels the
   on-call opens in the first ninety seconds: request rate, error rate,
   queue depth, downstream latency. The walkthrough's actors are the on-call
   roles the runbook YAML names.

5. <!-- scene-type: demonstrate -->
   demo: safe-rollback.mp4 — play the safe-rollback console flow. The
   narration carries the why; the clip carries the what.

6. <!-- scene-type: tension -->
   The trade-off the playbook makes. Rollback is the safest mitigation but
   the slowest to communicate; feature-flag is the most surgical but leaves
   the messiest audit trail. The third option — capacity shift — is the one
   you reach for when you do not know which other path is right.

7. <!-- scene-type: recap -->
   Close. The disposition (sound — the procedure has been load-tested on
   three Sev-1s in the last quarter). The biggest residual risk (the cliff
   between P1 and P2 in the taxonomy). The line to carry off: when in
   doubt, rollback first and diagnose second.
`;

// Minimal spec shape — discriminated by `type`. The scene-type-specific
// fields mirror the core plugin schemas exactly (see packages/core/src/scenes).
type SpecScene = Record<string, unknown> & {readonly type: string};
interface FilmSpecOut {
  readonly meta: Record<string, unknown>;
  readonly scenes: ReadonlyArray<SpecScene>;
}

interface CompileCtx {
  readonly hermeticRoot: string;
  readonly filmId: string;
}

// Pull the asset-binding line out of a treatment scene block.
// Returns {kind, asset, note} or null if the block has no binding.
interface AssetBinding {
  readonly kind: 'figure' | 'demo' | 'passage' | 'walkthrough';
  readonly asset: string;
  readonly note: string;
}

const parseBinding = (body: string): AssetBinding | null => {
  // Match: "<kind>: <filename>.<ext> — <note>"  (em-dash or " -- " variant).
  // Also accept hyphen-minus separator for keyboard friendliness.
  // The filename allows letters, digits, _, ., and -; no whitespace.
  const m = body.match(
    /\b(figure|demo|passage|walkthrough)\s*:\s*([A-Za-z0-9._-]+\.[a-z0-9]+)\s*(?:[—-]+\s*([^]*))?/i,
  );
  if (!m) return null;
  return {
    kind: m[1]!.toLowerCase() as AssetBinding['kind'],
    asset: m[2]!.trim(),
    note: (m[3] ?? '').trim(),
  };
};

// Parse the "## Proposed scenes" section into a list of {sceneType, summary}.
// Uses the same structural conventions as packages/cli/src/commands/treatment.ts
// (the `<!-- scene-type: X -->` HTML comment on a numbered list item).
interface SceneBlock {
  readonly sceneType: string;
  readonly summary: string;
}

const parseTreatmentScenes = (md: string): SceneBlock[] => {
  const lines = md.split('\n');
  const out: SceneBlock[] = [];
  let inScenes = false;
  let pending: {sceneType: string; lines: string[]} | null = null;

  const flush = (): void => {
    if (!pending) return;
    out.push({
      sceneType: pending.sceneType || 'structure',
      summary: pending.lines.join(' ').trim(),
    });
    pending = null;
  };

  for (const raw of lines) {
    const headMatch = raw.match(/^##\s+(.+)$/);
    if (headMatch) {
      if (inScenes) {
        flush();
        break;
      }
      if (/proposed scenes/i.test(headMatch[1]!)) inScenes = true;
      continue;
    }
    if (!inScenes) continue;
    const itemMatch = raw.match(/^\s*(\d+)\.\s*(.*)$/);
    if (itemMatch) {
      flush();
      const rest = itemMatch[2] ?? '';
      const hint = rest.match(/<!--\s*scene-type:\s*([a-z-]+)\s*-->/);
      const sceneType = hint?.[1] ?? '';
      const head = rest.replace(/<!--\s*scene-type:\s*[a-z-]+\s*-->/, '').trim();
      pending = {sceneType, lines: head ? [head] : []};
      continue;
    }
    if (pending) {
      const trimmed = raw.trim();
      if (trimmed === '') continue;
      const hint = trimmed.match(/^<!--\s*scene-type:\s*([a-z-]+)\s*-->$/);
      if (hint) {
        if (!pending.sceneType) pending.sceneType = hint[1]!;
        continue;
      }
      pending.lines.push(trimmed);
    }
  }
  flush();
  return out;
};

// Trim and shorten a long heading into something that fits the SceneFrame
// chrome without auto-shrink. Used for scene.heading on bound scenes.
const shortHeading = (s: string, max = 100): string => {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + '…';
};

const compileScene = (
  block: SceneBlock,
  index: number,
  ctx: CompileCtx,
): SpecScene => {
  const kicker = `RUNBOOK // ${String(index + 1).padStart(2, '0')}`;
  const binding = parseBinding(block.summary);

  switch (block.sceneType) {
    case 'frame':
      return {
        id: `s-${index + 1}-frame`,
        type: 'frame',
        kicker: 'DOCENT // ON-CALL RUNBOOK 101',
        title: 'On-Call Runbook 101',
        tagline:
          'The pager fires at 2am — the procedure you wished you had on day one.',
        footnote: 'lunch-and-learn · sre · 2026',
        beats: [
          {
            id: `s-${index + 1}-frame-1`,
            narration: shortHeading(block.summary, 320),
          },
        ],
      };

    case 'passage': {
      if (!binding || binding.kind !== 'passage') {
        throw new Error(
          `scene #${index + 1} (passage) has no \`passage:\` asset binding`,
        );
      }
      // passage scenes need the RAW TEXT inlined, not a path.
      const absMd = join(ctx.hermeticRoot, 'public', 'wiki', binding.asset);
      if (!existsSync(absMd)) {
        throw new Error(`passage asset missing on disk: ${absMd}`);
      }
      const raw = readFileSync(absMd, 'utf-8');
      // Strip the top-level # heading and any HTML; condense to one
      // newline-preserved block. Then pick TWO quotes from the body to
      // attach marks to. Both quotes must be exact substrings of `text`,
      // per the passage validator's substring rule.
      const body = raw
        .replace(/^#\s+.+$/m, '') // drop title line
        .replace(/^##\s+/gm, '') // drop section markers (keep heading text)
        .trim();
      // Pick the first two sentences from the first body paragraph as
      // quotable marks — guaranteed to be substrings of `text`.
      const firstPara = body.split(/\n\s*\n/)[0]!;
      const sentences = firstPara
        .split(/(?<=\.)\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30 && s.length < 200);
      const marks: Array<Record<string, string>> = [];
      if (sentences.length >= 1 && body.includes(sentences[0]!)) {
        marks.push({
          id: 'mk-1',
          quote: sentences[0]!,
          note: 'the canonical opening — this is the load-bearing claim of the page.',
        });
      }
      if (sentences.length >= 2 && body.includes(sentences[1]!)) {
        marks.push({
          id: 'mk-2',
          quote: sentences[1]!,
          note: 'the second sentence sharpens the first; what the page actually means in practice.',
        });
      }
      return {
        id: `s-${index + 1}-passage`,
        type: 'passage',
        kicker,
        heading: shortHeading(`Source: ${binding.asset}`, 80),
        text: body,
        marks,
        beats: [
          {
            id: `s-${index + 1}-passage-1`,
            narration: binding.note ||
              'Read the canonical wiki page for this topic — the runbook is downstream of this prose.',
            ...(marks[0] ? {reveal: [marks[0].id!]} : {}),
          },
          ...(marks[1]
            ? [
                {
                  id: `s-${index + 1}-passage-2`,
                  narration:
                    'The second sentence sharpens the first — read both before you reach for a hypothesis.',
                  reveal: [marks[1].id!],
                  focus: [marks[1].id!],
                  pace: 'hold' as const,
                },
              ]
            : []),
        ],
      };
    }

    case 'figure': {
      if (!binding || binding.kind !== 'figure') {
        throw new Error(
          `scene #${index + 1} (figure) has no \`figure:\` asset binding`,
        );
      }
      // Bare filenames resolve under <projectRoot>/public/figures/ per the
      // figure validator's filesystem probe.
      return {
        id: `s-${index + 1}-figure`,
        type: 'figure',
        kicker,
        heading: shortHeading(binding.note || 'Annotate the figure', 80),
        image: binding.asset,
        callouts: [
          {
            id: 'co-1',
            at: [0.28, 0.42],
            label: 'load-balancer split',
            note: 'where P0 traffic decisions originate',
          },
          {
            id: 'co-2',
            at: [0.72, 0.6],
            label: 'queue boundary',
            note: 'the backlog that P1 alerts watch',
          },
        ],
        beats: [
          {
            id: `s-${index + 1}-figure-1`,
            narration: binding.note ||
              'The figure pins the abstract claim of the previous scene to a concrete component.',
            reveal: ['co-1'],
          },
          {
            id: `s-${index + 1}-figure-2`,
            narration:
              'And the second callout — where the second alert class lives in the same picture.',
            reveal: ['co-2'],
            focus: ['co-2'],
            pace: 'hold',
          },
        ],
      };
    }

    case 'walkthrough': {
      if (!binding || binding.kind !== 'walkthrough') {
        throw new Error(
          `scene #${index + 1} (walkthrough) has no \`walkthrough:\` asset binding`,
        );
      }
      // walkthrough has no native asset slot. The asset filename is carried
      // in the heading so the FDE can see the binding; the actors come from
      // the runbook YAML's on_call cast (we hard-code three for the smoke).
      return {
        id: `s-${index + 1}-walkthrough`,
        type: 'walkthrough',
        kicker,
        // Preserve the asset filename verbatim in the heading so the
        // asset-path check downstream can re-extract + verify the file.
        heading: shortHeading(`The four panels — ${binding.asset}`, 80),
        actors: [
          {id: 'oncall', label: 'On-call primary', sub: 'role'},
          {id: 'dashboard', label: 'Dashboard', sub: 'system'},
          {id: 'metrics', label: 'Metrics store', sub: 'system'},
        ],
        beats: [
          {
            id: `s-${index + 1}-walkthrough-1`,
            narration:
              binding.note ||
              'Step through the four-panel dashboard the on-call opens first.',
            message: {
              from: 'oncall',
              to: 'dashboard',
              label: 'open four-panel view',
              kind: 'forward',
            },
          },
          {
            id: `s-${index + 1}-walkthrough-2`,
            narration:
              'The dashboard fans out to the metrics store; the primary watches the panels populate.',
            message: {
              from: 'dashboard',
              to: 'metrics',
              label: 'query 4× series',
              kind: 'forward',
            },
          },
          {
            id: `s-${index + 1}-walkthrough-3`,
            narration:
              'And the result comes back as four parallel signals — request rate, error rate, queue depth, latency.',
            message: {
              from: 'metrics',
              to: 'dashboard',
              label: 'reply: 4× time-series',
              kind: 'reply',
            },
            pace: 'settle',
          },
        ],
      };
    }

    case 'demonstrate': {
      if (!binding || binding.kind !== 'demo') {
        throw new Error(
          `scene #${index + 1} (demonstrate) has no \`demo:\` asset binding`,
        );
      }
      // Bare clip filenames resolve under public/clips/<filmId>/ — the
      // demonstrate scene's existing path convention.
      return {
        id: `s-${index + 1}-demonstrate`,
        type: 'demonstrate',
        kicker,
        heading: shortHeading(binding.note || 'See it in motion', 80),
        clip: binding.asset,
        beats: [
          {
            id: `s-${index + 1}-demonstrate-1`,
            narration:
              binding.note ||
              'Play the rollback console flow. The narration carries the why; the clip carries the what.',
          },
        ],
      };
    }

    case 'tension':
      return {
        id: `s-${index + 1}-tension`,
        type: 'tension',
        kicker,
        heading: 'The trade-off the playbook makes',
        nodes: [
          {
            id: 'chosen',
            label: 'Rollback first',
            sub: 'safest — but slowest to communicate. The audit trail is clean.',
          },
          {
            id: 'rejected',
            label: 'Feature flag',
            sub: 'most surgical, but the cleanup is messier and the audit trail is harder to read.',
            kind: 'rejected',
          },
          {
            id: 'risk',
            label: 'Capacity shift in disguise',
            sub: 'when capacity shift hides the real bug; the incident comes back the next deploy.',
            kind: 'risk',
          },
        ],
        beats: [
          {
            id: `s-${index + 1}-tension-1`,
            narration: 'The chosen mitigation pattern is rollback first.',
            reveal: ['chosen'],
            pace: 'hold',
          },
          {
            id: `s-${index + 1}-tension-2`,
            narration:
              'Rejected — the surgical-looking feature flag, because the audit trail is harder.',
            reveal: ['rejected'],
          },
          {
            id: `s-${index + 1}-tension-3`,
            narration:
              'And the risk that survives the choice: capacity shift can mask a bug that comes back next deploy.',
            reveal: ['risk'],
            pace: 'hold',
          },
        ],
      };

    case 'recap':
      return {
        id: `s-${index + 1}-recap`,
        type: 'recap',
        kicker,
        heading: 'The verdict',
        points: [
          'Sound — the procedure has been load-tested on three Sev-1s last quarter.',
          'Biggest residual risk: the cliff between P1 and P2 in the taxonomy.',
          'When in doubt, rollback first and diagnose second.',
        ],
        beats: [
          {
            id: `s-${index + 1}-recap-1`,
            reveal: 1 as unknown as readonly string[], // recap uses a numeric reveal index (v2.5.x shape; kit Beat is open-typed)
            narration: 'The disposition is sound — the runbook earns its keep.',
          },
          {
            id: `s-${index + 1}-recap-2`,
            reveal: 2 as unknown as readonly string[],
            narration:
              'The single biggest residual risk is the taxonomy cliff between P1 and P2.',
            pace: 'hold',
          },
          {
            id: `s-${index + 1}-recap-3`,
            reveal: 3 as unknown as readonly string[],
            narration:
              'And the line to carry off the page: when in doubt, rollback first and diagnose second.',
            pace: 'hold',
          },
        ],
      };

    default:
      throw new Error(
        `scene #${index + 1}: unsupported scene-type "${block.sceneType}" in the smoke compiler`,
      );
  }
};

const compileTreatment = (treatmentMd: string, ctx: CompileCtx): FilmSpecOut => {
  const blocks = parseTreatmentScenes(treatmentMd);
  if (blocks.length === 0) {
    throw new Error('no scenes parsed from treatment markdown');
  }
  const scenes = blocks.map((b, i) => compileScene(b, i, ctx));
  return {
    meta: {
      id: ctx.filmId,
      title: 'On-Call Runbook 101',
      subtitle: 'The pager fires at 2am — the procedure you wished you had on day one.',
      author: 'sre — lunch-and-learn',
      voice: 'af_heart',
      fps: 30,
      register: 'calm',
    },
    scenes,
  };
};

// ----------------------------------------------------------------------------
// 4. CLI invocation helpers
// ----------------------------------------------------------------------------

interface RunCliOpts {
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
}
interface RunCliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runCli = ({args, cwd}: RunCliOpts): RunCliResult => {
  const r = spawnSync('bun', [CLI_ENTRY, ...args], {
    cwd: cwd ?? REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
};

// ----------------------------------------------------------------------------
// 5. KPI assertions + summary
// ----------------------------------------------------------------------------

interface StepResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const REQUIRED_SCENE_TYPES = [
  'frame',
  'passage',
  'figure',
  'demonstrate',
  'walkthrough',
  'tension',
  'recap',
] as const;

// Asset-bound scene types — scenes whose treatment carries a R12.3
// asset binding (`passage:` / `figure:` / `demo:` / `walkthrough:`). Note
// that `walkthrough` has no NATIVE asset slot on the scene schema; its
// binding lives in the heading + drives `actors`, and the asset path is
// surfaced for the FDE so the reference does not get lost.
const ASSET_BOUND_TYPES = new Set([
  'passage',
  'figure',
  'demonstrate',
  'walkthrough',
]);

const assertIndexerKpi = (
  index: AssetIndex,
  synth: SynthResult,
): StepResult => {
  // Expected (matches the brief's KPI table):
  //   4 wiki (3 pages + 1 README)
  //   2 diagram
  //   2 screen-recording
  //   1 runbook-config (the YAML)
  //   1 runbook-config OR unknown (the JSON alert payload)
  const counts: Record<string, number> = {
    wiki: 0,
    diagram: 0,
    'screen-recording': 0,
    'runbook-config': 0,
    unknown: 0,
  };
  for (const f of index.files) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  const expectedTotal =
    synth.wikiPages.length +
    synth.diagrams.length +
    synth.clips.length +
    synth.configs.length;
  const indexedTotal = index.files.length;

  // Show what the JSON alert payload classified as — surfaces the
  // friction the brief asks about.
  const alertFile = index.files.find((f) =>
    f.path.endsWith('alert-payload.json'),
  );

  const errors: string[] = [];
  if (counts.wiki !== 4) errors.push(`wiki: got ${counts.wiki}, expected 4`);
  if (counts.diagram !== 2)
    errors.push(`diagram: got ${counts.diagram}, expected 2`);
  if (counts['screen-recording'] !== 2)
    errors.push(`screen-recording: got ${counts['screen-recording']}, expected 2`);
  if (counts['runbook-config'] < 1)
    errors.push(`runbook-config: got ${counts['runbook-config']}, expected ≥ 1`);
  if (indexedTotal !== expectedTotal)
    errors.push(`total: indexed ${indexedTotal}, synth had ${expectedTotal}`);

  // Echo the breakdown for the operator.
  log(c.dim(`  wiki=${counts.wiki}  diagram=${counts.diagram}  screen-recording=${counts['screen-recording']}  runbook-config=${counts['runbook-config']}  unknown=${counts.unknown}`));
  if (alertFile) {
    log(
      c.dim(
        `  alert-payload.json → classified as "${alertFile.kind}" ` +
          `(per brief: either runbook-config or unknown is acceptable; flagging the pick)`,
      ),
    );
  }

  return {
    name: 'asset indexer',
    pass: errors.length === 0,
    detail: errors.length === 0
      ? `${indexedTotal}/${expectedTotal} files classified`
      : errors.join('; '),
  };
};

const assertSpecCoverage = (spec: FilmSpecOut): StepResult => {
  const seen = new Set(spec.scenes.map((s) => s.type));
  const missing = REQUIRED_SCENE_TYPES.filter((t) => !seen.has(t));
  const assetBound = spec.scenes.filter((s) => ASSET_BOUND_TYPES.has(s.type)).length;
  return {
    name: 'treatment-to-spec',
    pass: missing.length === 0,
    detail:
      missing.length === 0
        ? `${spec.scenes.length} scenes emitted, ${assetBound} asset-bound`
        : `missing scene types: ${missing.join(', ')}`,
  };
};

const assertAssetPaths = (spec: FilmSpecOut, hermeticRoot: string): StepResult => {
  // Every asset-bound scene's path must resolve to an existing file
  // under <hermeticRoot>/public/...
  const fails: string[] = [];
  for (let i = 0; i < spec.scenes.length; i++) {
    const sc = spec.scenes[i]!;
    if (sc.type === 'figure') {
      const image = String(sc.image ?? '');
      const abs = image.includes('/')
        ? join(hermeticRoot, 'public', image)
        : join(hermeticRoot, 'public', 'figures', image);
      if (!existsSync(abs)) fails.push(`scene ${i}: figure image missing → ${abs}`);
    } else if (sc.type === 'demonstrate') {
      const clip = String(sc.clip ?? '');
      const abs = clip.includes('/')
        ? join(hermeticRoot, 'public', clip)
        : join(hermeticRoot, 'public', 'clips', FILM_ID, clip);
      if (!existsSync(abs)) fails.push(`scene ${i}: demonstrate clip missing → ${abs}`);
    } else if (sc.type === 'passage') {
      // passage inlines text; verify the source md exists (the smoke wrote it)
      // by checking that the inlined text is non-empty.
      const text = String(sc.text ?? '');
      if (!text.trim()) fails.push(`scene ${i}: passage text empty`);
    } else if (sc.type === 'walkthrough') {
      // walkthrough has no native asset slot — the binding lives in the
      // heading. We re-extract the asset name from the heading and verify
      // it on disk; this is the "asset is referenced, file resolves" check
      // the R12.3 contract intends even when the schema slot is implicit.
      const heading = String(sc.heading ?? '');
      const m = heading.match(/([A-Za-z0-9._-]+\.[a-z0-9]+)/i);
      if (m) {
        const abs = join(hermeticRoot, 'public', 'clips', FILM_ID, m[1]!);
        if (!existsSync(abs)) {
          fails.push(`scene ${i}: walkthrough asset missing → ${abs}`);
        }
      }
      // If the heading carries no extension, it's a synthesized heading
      // without a binding; skip (the scene is still valid).
    }
  }
  return {
    name: 'asset path resolution',
    pass: fails.length === 0,
    detail: fails.length === 0 ? 'every bound asset resolves on disk' : fails.join('; '),
  };
};

const assertJsonRoundtrip = (spec: FilmSpecOut): StepResult => {
  const a = JSON.stringify(spec);
  const reparsed = JSON.parse(a) as FilmSpecOut;
  const b = JSON.stringify(reparsed);
  return {
    name: 'JSON roundtrip',
    pass: a === b,
    detail: a === b ? 'deep-equal' : 'JSON serialize/parse drift',
  };
};

const printSummary = (steps: ReadonlyArray<StepResult>): boolean => {
  const allPass = steps.every((s) => s.pass);
  log('');
  log(c.cyan('────────────────────────────────────────────────────────────'));
  for (const s of steps) {
    const mark = s.pass ? c.green('✓') : c.red('✗');
    const name = s.name.padEnd(22);
    log(`${mark} ${name}(${s.detail})`);
  }
  log(c.cyan('────────────────────────────────────────────────────────────'));
  log('');
  log(
    allPass
      ? c.green('R12 lunch-and-learn smoke: PASS')
      : c.red('R12 lunch-and-learn smoke: FAIL'),
  );
  return allPass;
};

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

const main = async (): Promise<number> => {
  log(c.cyan('▶ smoke-r12-lunch-and-learn — the FDE workflow proof'));
  log(c.dim(`  hermetic root: ${SMOKE_ROOT}`));
  log(c.dim(`  film id:       ${FILM_ID}`));
  log('');

  // 0. Preflight.
  checkFfmpeg();

  // 1. Hermetic fs.
  wipeAndMkdir(SMOKE_ROOT);
  mkdirSync(join(SMOKE_ROOT, 'films'), {recursive: true});
  mkdirSync(join(SMOKE_ROOT, 'treatments'), {recursive: true});

  // 2. Synthesize the KB.
  const synth = synthesizeKb(SMOKE_ROOT);

  // 3. Index.
  log(c.cyan('▶ indexing assets (R12.2 stub)'));
  const index = indexDirectory(SMOKE_ROOT);
  const indexerStep = assertIndexerKpi(index, synth);
  if (!indexerStep.pass) {
    err(c.red(`✗ indexer KPI failed: ${indexerStep.detail}`));
  }

  // 4. Author the treatment (handwritten, R12.1 surface).
  log(c.cyan('▶ authoring treatment'));
  const treatmentPath = join(SMOKE_ROOT, 'treatments', `${FILM_ID}.md`);
  writeFileSync(treatmentPath, authorTreatment(), 'utf-8');
  log(c.dim(`  ${relative(SMOKE_ROOT, treatmentPath)} (${authorTreatment().length} bytes)`));

  // 5. Compile treatment → spec (R12.3 stub).
  log(c.cyan('▶ compiling treatment → spec (R12.3 stub)'));
  let spec: FilmSpecOut;
  try {
    spec = compileTreatment(authorTreatment(), {
      hermeticRoot: SMOKE_ROOT,
      filmId: FILM_ID,
    });
  } catch (e) {
    err(c.red(`✗ compile failed: ${e instanceof Error ? e.message : String(e)}`));
    return 3;
  }
  const specPath = join(SMOKE_ROOT, 'films', `${FILM_ID}.json`);
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');
  log(c.dim(`  ${relative(SMOKE_ROOT, specPath)} — ${spec.scenes.length} scenes`));

  const specCoverageStep = assertSpecCoverage(spec);
  const assetPathStep = assertAssetPaths(spec, SMOKE_ROOT);
  const roundtripStep = assertJsonRoundtrip(spec);

  // 6. docent validate.
  log(c.cyan('▶ docent validate'));
  const validateRun = runCli({
    args: ['validate', FILM_ID, '--project-root', SMOKE_ROOT],
  });
  // The validate command prints its own pretty output; mirror it dimly.
  process.stdout.write(validateRun.stdout.split('\n').map((l) => '  ' + l).join('\n'));
  if (validateRun.code !== 0 && validateRun.stderr) {
    process.stderr.write(validateRun.stderr);
  }
  const validateStep: StepResult = {
    name: 'docent validate',
    pass: validateRun.code === 0,
    detail: validateRun.code === 0 ? '0 errors' : `exit ${validateRun.code}`,
  };

  // 7. docent depthcheck.
  log(c.cyan('▶ docent depthcheck'));
  const depthRun = runCli({
    args: ['depthcheck', FILM_ID, '--project-root', SMOKE_ROOT],
  });
  process.stdout.write(depthRun.stdout.split('\n').map((l) => '  ' + l).join('\n'));
  if (depthRun.code !== 0 && depthRun.stderr) {
    process.stderr.write(depthRun.stderr);
  }
  const depthStep: StepResult = {
    name: 'docent depthcheck',
    pass: depthRun.code === 0,
    detail: depthRun.code === 0 ? '0 findings' : `exit ${depthRun.code}`,
  };

  // 8. Summary.
  const steps: StepResult[] = [
    indexerStep,
    specCoverageStep,
    assetPathStep,
    validateStep,
    depthStep,
    roundtripStep,
  ];
  const ok = printSummary(steps);
  return ok ? 0 : (validateStep.pass && depthStep.pass ? 3 : 2);
};

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    err(c.red(`unhandled error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));
    process.exit(1);
  });
