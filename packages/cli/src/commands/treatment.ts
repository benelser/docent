// `docent treatment <id>` — the human-in-the-loop author surface.
//
// docent's author flow has three steps:
//
//   analysis/<id>.md  →  treatments/<id>.md  →  films/<id>.json
//      survey              treatment              spec
//
// The treatment is the steering surface. The human reads it, edits it,
// approves it — and never has to look at JSON. It is a plain-language
// outline of what the film will be about, what thread it will follow,
// and what scenes (in order) it will make. The agent compiles the
// approved treatment to the spec.
//
// Two modes:
//
//   docent treatment <id>
//     reads analysis/<id>.md, scaffolds treatments/<id>.md with a
//     starter set of 5-8 scenes inferred from the survey's section
//     headings. Deterministic — no LLM call. The human edits it.
//
//   docent treatment <id> --to-spec
//     reads the (approved) treatment at treatments/<id>.md and
//     emits films/<id>.json. Walks the markdown's numbered scene
//     list, reads each item's `<!-- scene-type: X -->` hint, and
//     emits a placeholder scene object the human will fill in.
//
// This file is intentionally dumb: the smart layer is the human's
// edits to the treatment, plus the later survey → film cycle the
// docent agent runs. The CLI just shuttles markdown ↔ JSON.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';

const log = (s: string): void => process.stdout.write(`${s}\n`);
const err = (s: string): void => process.stderr.write(`${s}\n`);

export interface TreatmentArgs {
  readonly id: string;
  readonly toSpec?: boolean;
  readonly projectRoot?: string;
  readonly analysisDir?: string;
  readonly treatmentsDir?: string;
  readonly filmsDir?: string;
  readonly force?: boolean;
}

// ----- markdown helpers ----------------------------------------------------

interface ParsedSurvey {
  readonly title: string;
  readonly opener: string;
  readonly throughLine: string;
  readonly sections: ReadonlyArray<{heading: string; body: string}>;
}

/**
 * Lightly parse a survey markdown — pull the title, the first
 * meaningful paragraph (used as the opener), and every level-2
 * section (used to seed scene proposals).
 */
const parseSurvey = (source: string, fallbackId: string): ParsedSurvey => {
  const lines = source.split('\n');

  // Title — first `# ...` heading, else the fallback id.
  let title = fallbackId;
  for (const ln of lines) {
    const m = ln.match(/^#\s+(.+)$/);
    if (m && m[1]) {
      title = m[1].trim();
      break;
    }
  }

  // Opener — the first non-empty paragraph after the title that isn't
  // a heading or a horizontal rule. Strip markdown emphasis lightly.
  let opener = '';
  {
    let sawTitle = false;
    const buf: string[] = [];
    for (const ln of lines) {
      if (!sawTitle && /^#\s+/.test(ln)) {
        sawTitle = true;
        continue;
      }
      if (!sawTitle) continue;
      const trimmed = ln.trim();
      if (trimmed === '' && buf.length > 0) break;
      if (trimmed === '' || trimmed === '---' || /^#/.test(trimmed)) continue;
      buf.push(trimmed);
    }
    opener = buf.join(' ').replace(/\*\*/g, '').trim();
  }
  if (!opener) {
    opener = `The survey for ${title} did not include a short opening paragraph — write the one-line framing of why this film matters here.`;
  }

  // Sections — every `## ...` heading and the body until the next
  // heading. Skip the "section 0 — content boundary" convention
  // if present; it's scope, not a scene.
  const sections: Array<{heading: string; body: string}> = [];
  let current: {heading: string; body: string[]} | null = null;
  for (const ln of lines) {
    const m = ln.match(/^##\s+(.+)$/);
    if (m && m[1]) {
      if (current) sections.push({heading: current.heading, body: current.body.join('\n').trim()});
      current = {heading: m[1].trim(), body: []};
    } else if (current) {
      current.body.push(ln);
    }
  }
  if (current) sections.push({heading: current.heading, body: current.body.join('\n').trim()});

  // Pull a candidate through-line: prefer a section whose heading
  // contains "through", "claim", "thesis", "argument", "idea", or
  // "load-bearing"; else first non-boundary section's first sentence.
  let throughLine = '';
  const tlNeedles = ['through', 'claim', 'thesis', 'argument', 'idea', 'load-bearing', 'load bearing'];
  for (const s of sections) {
    const h = s.heading.toLowerCase();
    if (tlNeedles.some((n) => h.includes(n))) {
      throughLine = firstSentence(s.body);
      if (throughLine) break;
    }
  }
  if (!throughLine && sections[0]) {
    throughLine = firstSentence(sections[0].body) ||
      'The single thread the film should follow — pull this from the survey, in one sentence.';
  }
  if (!throughLine) {
    throughLine = 'The single thread the film should follow — pull this from the survey, in one sentence.';
  }

  return {title, opener, throughLine, sections};
};

const firstSentence = (body: string): string => {
  // Take the first paragraph (up to a blank line), collapse internal
  // newlines to spaces so we can match a sentence that wraps lines.
  const stripped = body
    .split(/\n\s*\n/)[0]!
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (!stripped) return '';
  // First sentence — stop at the first period followed by space/EOS.
  const m = stripped.match(/^(.+?\.)(?:\s|$)/);
  if (m && m[1]) return m[1].trim();
  return stripped;
};

// ----- scene proposal heuristics -------------------------------------------

/**
 * The 15 canonical scene moves from the docent grammar. This list is
 * deliberately SMALL — the treatment is a steering surface for a human,
 * not a registry browser. The full plugin catalog (29 scenes) lives in
 * `docent scene-fit list`.
 */
const SCENE_TYPES: ReadonlyArray<string> = [
  'frame',
  'structure',
  'progression',
  'walkthrough',
  'compare',
  'quantities',
  'chart',
  'probe',
  'tension',
  'closeup',
  'passage',
  'figure',
  'demonstrate',
  'recap',
  'diff',
];

interface SceneProposal {
  readonly sceneType: string;
  readonly summary: string;
}

/**
 * Map a heading + body to a scene-type guess. Deliberately coarse —
 * the human's edits to the treatment are where intent gets sharpened.
 */
const guessSceneType = (heading: string): string => {
  const h = heading.toLowerCase();
  if (/^(0\.|introduction|boundary|scope|frame|setup)/.test(h)) return 'frame';
  if (/(part|component|piece|architect|structure|anatomy|map|tree)/.test(h)) return 'structure';
  if (/(progress|stage|phase|step|timeline|history|evolution)/.test(h)) return 'progression';
  if (/(walk|trace|step.through|example|worked|instance)/.test(h)) return 'walkthrough';
  if (/(compare|contrast|versus|vs\.|alternative|option)/.test(h)) return 'compare';
  if (/(number|metric|count|quantit|measur|stat)/.test(h)) return 'quantities';
  if (/(chart|plot|axis|curve|graph)/.test(h)) return 'chart';
  if (/(probe|vary|sweep|sensitivity|what if)/.test(h)) return 'probe';
  if (/(trade.?off|break|fail|risk|tension|weak|limit|where it (fails|breaks))/.test(h)) return 'tension';
  if (/(code|closeup|annotat|listing|snippet)/.test(h)) return 'closeup';
  if (/(quote|passage|prose|text|excerpt|line)/.test(h)) return 'passage';
  if (/(figure|image|map|diagram|painting|photo)/.test(h)) return 'figure';
  if (/(demo|run|play|see it|watch)/.test(h)) return 'demonstrate';
  if (/(recap|verdict|takeaway|summary|conclusion)/.test(h)) return 'recap';
  if (/(diff|change|before|after|delta)/.test(h)) return 'diff';
  return 'structure';
};

/**
 * Translate a scene-type guess + heading into a plain-language
 * one-line summary the human can read without knowing the grammar.
 */
const proseForScene = (sceneType: string, heading: string, body: string): string => {
  const focus = heading.replace(/^\d+\.\s*/, '').trim();
  const sentence = firstSentence(body);
  const tail = sentence ? ` ${sentence}` : '';
  switch (sceneType) {
    case 'frame':
      return `Open the film. Set up "${focus}" so the viewer knows in one breath what we are after.${tail}`;
    case 'structure':
      return `Lay out the parts of ${focus}, and how they connect.${tail}`;
    case 'progression':
      return `Walk the stages of ${focus} — one step at a time, in order.${tail}`;
    case 'walkthrough':
      return `Take one concrete instance of ${focus} and trace it end to end.${tail}`;
    case 'compare':
      return `Place the options for ${focus} side by side and name what is at stake.${tail}`;
    case 'quantities':
      return `Surface the numbers that pin down ${focus}.${tail}`;
    case 'chart':
      return `Plot ${focus} on real axes — let the curve do the arguing.${tail}`;
    case 'probe':
      return `Vary one input and follow what happens to ${focus}.${tail}`;
    case 'tension':
      return `Name the trade-off in ${focus} — what was chosen, what was rejected, and what risk remains.${tail}`;
    case 'closeup':
      return `Annotate one code artifact tied to ${focus}, line by load-bearing line.${tail}`;
    case 'passage':
      return `Annotate the text of ${focus} phrase by phrase, in the order the reader meets it.${tail}`;
    case 'figure':
      return `Annotate the figure for ${focus} by region — guide the eye, do not narrate over it.${tail}`;
    case 'demonstrate':
      return `Show ${focus} actually running, not described — let the motion do the explaining.${tail}`;
    case 'recap':
      return `Close with the verdict on ${focus}: the disposition, the biggest residual risk, the line to carry off.${tail}`;
    case 'diff':
      return `Show what changed in ${focus} — before vs. after, the load-bearing 5%.${tail}`;
    default:
      return `Cover ${focus}.${tail}`;
  }
};

/**
 * Pick 5-8 scene proposals from the survey's sections. The first
 * is always a frame; the last is always a recap; the body picks the
 * best-fitting type per section. Section 0 ("content boundary") is
 * skipped — it is scope, not a scene.
 */
const proposeScenes = (sections: ReadonlyArray<{heading: string; body: string}>): SceneProposal[] => {
  const out: SceneProposal[] = [];

  // Opening frame is mandatory.
  out.push({
    sceneType: 'frame',
    summary:
      'Open the film. State the subject in one breath, name the misconception we are about to kill, and tell the viewer what they will know by the recap.',
  });

  // Skip section-zero "content boundary" if it exists; it is scope.
  const usable = sections.filter((s) => !/^0\./.test(s.heading));

  // Pick up to 6 body scenes from sections, but cap the total film at 8.
  const bodyCap = 6;
  const picked: SceneProposal[] = [];
  const seenTypes = new Set<string>(['frame']);
  for (const s of usable) {
    if (picked.length >= bodyCap) break;
    const type = guessSceneType(s.heading);
    if (type === 'frame' || type === 'recap') continue; // those are bracketing scenes
    // Allow one repeat of structure; otherwise prefer variety.
    if (seenTypes.has(type) && type !== 'structure') continue;
    seenTypes.add(type);
    picked.push({sceneType: type, summary: proseForScene(type, s.heading, s.body)});
  }

  // Always carry at least one tension scene — the depth bar requires it.
  if (!picked.find((p) => p.sceneType === 'tension')) {
    picked.push({
      sceneType: 'tension',
      summary:
        'Name the trade-off. What was chosen, what was rejected on the way, and what residual risk the chosen path still carries. The film fails the depth bar without this.',
    });
  }

  // Always carry at least one structure scene if nothing else.
  if (picked.length === 0) {
    picked.push({
      sceneType: 'structure',
      summary: 'Lay out the parts of the subject and how they connect.',
    });
  }

  for (const p of picked) out.push(p);

  // Closing recap is mandatory.
  out.push({
    sceneType: 'recap',
    summary:
      'Close with the verdict. State the disposition (sound? not sound? sound-with-a-watch?), the single biggest residual risk, and the one line to carry off the page.',
  });

  return out;
};

// ----- the treatment markdown ----------------------------------------------

const renderTreatment = (id: string, survey: ParsedSurvey, scenes: ReadonlyArray<SceneProposal>): string => {
  const lines: string[] = [];
  lines.push(`# ${survey.title}`);
  lines.push('');
  lines.push(`<!-- docent-treatment id: ${id} -->`);
  lines.push('');
  lines.push('> A treatment is the steering surface between the survey and the spec.');
  lines.push('> Read it. Edit it. When the scenes below say what this film should be,');
  lines.push('> run `docent treatment ' + id + ' --to-spec` to compile to `films/' + id + '.json`.');
  lines.push('');
  lines.push('## What this film is about');
  lines.push('');
  lines.push(survey.opener);
  lines.push('');
  lines.push('## The through-line');
  lines.push('');
  lines.push(survey.throughLine);
  lines.push('');
  lines.push('## Proposed scenes');
  lines.push('');
  lines.push('Each item is one scene the film will make, in order.');
  lines.push('Edit the prose freely. To change a scene\'s move, edit the `scene-type` HTML comment.');
  lines.push('');
  let i = 1;
  for (const sc of scenes) {
    lines.push(`${i}. <!-- scene-type: ${sc.sceneType} -->`);
    lines.push(`   ${sc.summary}`);
    lines.push('');
    i++;
  }
  lines.push('## Notes for the human');
  lines.push('');
  lines.push('- Is the through-line above the *actual* thread, or is it a section heading dressed up?');
  lines.push('- Does the scene list reach the trade-off, or does it tour the happy path?');
  lines.push('- Are any of the proposed scenes the wrong move? Swap the `scene-type` hint and refine the prose.');
  lines.push('- Drop scenes that do not earn their keep. Add scenes the survey demands but this scaffold missed.');
  lines.push('- Aim for 6-8 scenes total. More than 9, the film loses its spine; fewer than 5, it is a slide deck.');
  lines.push('');
  return lines.join('\n');
};

// ----- treatment → spec -----------------------------------------------------

/**
 * An asset-reference line a human can drop into the treatment to bind a
 * concrete file to the scene the line lives under. The R12 author surface.
 *
 * Today the compiler emits placeholder paths like `figures/edit-me.png`.
 * With an asset reference, the compiler emits the real path and the human
 * never has to open the JSON to wire it up.
 *
 * Syntax — a line anywhere inside a scene's prose (the head of the
 * numbered item or any continuation line) of the form:
 *
 *     - figure: arch-diagram.png — annotate the request flow
 *     - demo: rollback.mp4 — play the actual sequence
 *     - passage: runbook.md — the canonical runbook prose
 *     - walkthrough: dashboard.mp4 — step through the four panels
 *     - closeup: handler.ts — the load-bearing request handler
 *
 * The leading `- ` bullet marker is optional (the head line of a numbered
 * item rarely starts with one). Both `demo:` and `demonstrate:` are
 * accepted; both map to scene kind `demonstrate`. The em-dash is
 * preferred but a plain `-` is also accepted as the description
 * separator.
 *
 * The asset reference *overrides* the heuristic scene-type guess and the
 * `<!-- scene-type: X -->` hint: the prefix is explicit intent. When
 * absent, the existing path through `guessSceneType` is unchanged.
 */
interface AssetReference {
  readonly kind: 'figure' | 'demonstrate' | 'walkthrough' | 'passage' | 'closeup';
  /** The bare filename as written in the treatment (e.g. `arch-diagram.png`). */
  readonly filename: string;
  /**
   * The path the compiler should write into the spec. Relative to the
   * project `public/` root — Remotion's `staticFile()` resolves it. So a
   * value of `figures/arch-diagram.png` reaches the file at
   * `public/figures/arch-diagram.png`. The treatment compiler does NOT
   * prepend `public/` — the scene components do not expect it.
   */
  readonly normalizedPath: string;
  /** Text after the em-dash, if present — surfaced as the scene heading. */
  readonly description?: string;
}

/**
 * The asset-reference syntax pattern. The leading `- ` bullet is optional
 * so the line can appear as a bullet OR as the head of a numbered item.
 * Both `demo` and `demonstrate` are accepted. Description separator is
 * either an em-dash `—` (the docent house style) or a hyphen `-`.
 */
const ASSET_REFERENCE_RE =
  /^\s*-?\s*(figure|demo|demonstrate|walkthrough|passage|closeup):\s+(\S+)(?:\s+[—-]\s+(.+))?$/;

/**
 * Map a kind keyword to the `public/` subdirectory the asset lives under.
 * The convention matches the existing scene components:
 *   - figure       → public/figures/   (Remotion `staticFile('figures/<f>')`)
 *   - demonstrate  → public/clips/     (the demonstrate component already
 *                                       prepends the film id at render
 *                                       time; we store the bare filename)
 *   - walkthrough  → public/clips/     (mirrors demonstrate)
 *   - passage      → public/wiki/      (prose source the agent inlines)
 *   - closeup      → public/code/      (source listing the agent inlines)
 */
const conventionalDirFor = (kind: AssetReference['kind']): string => {
  switch (kind) {
    case 'figure':
      return 'figures';
    case 'demonstrate':
      return 'clips';
    case 'walkthrough':
      return 'clips';
    case 'passage':
      return 'wiki';
    case 'closeup':
      return 'code';
  }
};

const parseAssetReference = (line: string): AssetReference | undefined => {
  const m = line.match(ASSET_REFERENCE_RE);
  if (!m) return undefined;
  const rawKind = m[1]!;
  const filename = m[2]!;
  const description = m[3]?.trim();
  const kind: AssetReference['kind'] =
    rawKind === 'demo' ? 'demonstrate' : (rawKind as AssetReference['kind']);

  // Already an explicit path under `public/<subdir>/` — accept verbatim
  // (strip the `public/` prefix so we store the Remotion-relative form).
  // Already an explicit path with a slash — accept verbatim.
  // Otherwise resolve under the conventional dir for this kind.
  let normalizedPath: string;
  if (filename.startsWith('public/')) {
    normalizedPath = filename.slice('public/'.length);
  } else if (filename.includes('/')) {
    normalizedPath = filename;
  } else {
    normalizedPath = `${conventionalDirFor(kind)}/${filename}`;
  }

  return description
    ? {kind, filename, normalizedPath, description}
    : {kind, filename, normalizedPath};
};

interface ScenePick {
  readonly sceneType: string;
  readonly summary: string;
  readonly asset?: AssetReference;
}

const parseTreatmentScenes = (source: string): ScenePick[] => {
  const lines = source.split('\n');
  const out: ScenePick[] = [];

  // The "## Proposed scenes" section, until the next ## heading.
  let inScenes = false;
  let pending: {
    sceneType: string;
    lines: string[];
    asset?: AssetReference;
  } | null = null;

  const flush = (): void => {
    if (!pending) return;
    const summary = pending.lines.join(' ').trim() || '(no summary)';
    const pick: ScenePick = pending.asset
      ? {sceneType: pending.sceneType, summary, asset: pending.asset}
      : {sceneType: pending.sceneType, summary};
    out.push(pick);
    pending = null;
  };

  for (const raw of lines) {
    const ln = raw;
    const headMatch = ln.match(/^##\s+(.+)$/);
    if (headMatch) {
      if (inScenes) {
        flush();
        break;
      }
      if (/proposed scenes/i.test(headMatch[1]!)) inScenes = true;
      continue;
    }
    if (!inScenes) continue;

    // A numbered list item — possibly with a `<!-- scene-type: X -->` hint.
    const itemMatch = ln.match(/^\s*(\d+)\.\s*(.*)$/);
    if (itemMatch) {
      flush();
      const rest = itemMatch[2] ?? '';
      const hint = rest.match(/<!--\s*scene-type:\s*([a-z-]+)\s*-->/);
      const sceneType = hint?.[1] ?? '';
      // Strip the comment from the summary text on this line, if any.
      const head = rest.replace(/<!--\s*scene-type:\s*[a-z-]+\s*-->/, '').trim();
      // The head itself may BE an asset reference (e.g. when the human
      // dropped the prefix on the same line as the list number).
      const headAsset = head ? parseAssetReference(head) : undefined;
      if (headAsset) {
        pending = {
          sceneType: headAsset.kind,
          lines: headAsset.description ? [headAsset.description] : [],
          asset: headAsset,
        };
      } else {
        pending = {sceneType, lines: head ? [head] : []};
      }
      continue;
    }

    // Continuation line — either prose, a stray comment, or an asset ref.
    if (pending) {
      const trimmed = ln.trim();
      if (trimmed === '') continue;
      // Pick up a `<!-- scene-type: X -->` on its own line.
      const hint = trimmed.match(/^<!--\s*scene-type:\s*([a-z-]+)\s*-->$/);
      if (hint) {
        if (!pending.sceneType) pending.sceneType = hint[1]!;
        continue;
      }
      // Pick up an asset-reference line — the R12 author surface. The
      // first asset reference under a scene wins; later ones are folded
      // into the prose so they survive into the spec as breadcrumbs.
      const asset = parseAssetReference(trimmed);
      if (asset && !pending.asset) {
        pending.asset = asset;
        // The asset reference *overrides* the heuristic / hint kind — the
        // explicit prefix is the strongest signal of authorial intent.
        pending.sceneType = asset.kind;
        if (asset.description) pending.lines.push(asset.description);
        continue;
      }
      pending.lines.push(trimmed);
    }
  }
  flush();

  // Default unmarked scenes — first is frame, last is recap, middle is structure.
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.sceneType) continue;
    let fallback = 'structure';
    if (i === 0) fallback = 'frame';
    else if (i === out.length - 1) fallback = 'recap';
    const existing = out[i]!;
    out[i] = existing.asset
      ? {sceneType: fallback, summary: existing.summary, asset: existing.asset}
      : {sceneType: fallback, summary: existing.summary};
  }
  return out;
};

/**
 * Build a placeholder scene object the human will fill in. Only the
 * required schema fields are written; everything else is left for the
 * spec author. We pick the fields most commonly required across the
 * core scene grammar; the spec will still need `docent validate` to
 * clear depthcheck.
 *
 * When `pick.asset` is present (an R12 asset-reference line lived under
 * this scene in the treatment) the corresponding field is bound to the
 * normalized path and the description, if any, is surfaced as the
 * scene's `heading`. The asset reference *overrides* the per-scene-type
 * placeholder field — the human gave explicit intent and we honour it.
 */
/**
 * Reads a `.md` passage source from `<projectRoot>/public/<source>` and
 * returns its contents. Returns null when the file is missing or
 * unreadable; the caller falls back to the placeholder + _todo path so
 * a treatment that references a file the FDE plans to author later
 * still compiles cleanly.
 */
const readPassageSource = (projectRoot: string, source: string): string | null => {
  try {
    const candidate = resolve(projectRoot, 'public', source);
    if (!existsSync(candidate)) return null;
    return readFileSync(candidate, 'utf-8');
  } catch {
    return null;
  }
};

/**
 * Infers the closeup scene's `lang` from a filename extension. Returns
 * undefined when the extension is unknown so the caller can fall back to
 * the default ('ts'). Covers the languages a closeup scene reasonably
 * highlights — TypeScript/JS, Python, Go, Rust, shell, SQL, YAML, etc.
 */
const inferCodeLang = (filename: string): string | undefined => {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    py: 'python', go: 'go', rs: 'rust', java: 'java',
    rb: 'ruby', sh: 'bash', zsh: 'bash', bash: 'bash',
    sql: 'sql', yaml: 'yaml', yml: 'yaml', json: 'json',
    toml: 'toml', tf: 'hcl', hcl: 'hcl', md: 'markdown',
    css: 'css', html: 'html', xml: 'xml', c: 'c', cpp: 'cpp', h: 'c',
  };
  return map[ext];
};

const placeholderScene = (
  i: number,
  pick: ScenePick,
  projectRoot?: string,
): Record<string, unknown> => {
  const idStem = `s${i + 1}`;
  const base: Record<string, unknown> = {
    id: idStem,
    type: pick.sceneType,
    kicker: `${String(i + 1).padStart(2, '0')} // EDIT ME`,
    heading: pick.asset?.description ?? pick.summary,
    beats: [
      {
        id: `${idStem}-1`,
        narration: pick.summary,
      },
    ],
  };

  switch (pick.sceneType) {
    case 'frame':
      base.title = 'Edit me — the film title';
      base.tagline = pick.summary;
      base.footnote = 'context note · author · date';
      delete base.heading;
      break;
    case 'structure':
      base.nodes = [
        {id: 'a', label: 'First part', sub: 'what it does'},
        {id: 'b', label: 'Second part', sub: 'what it does'},
        {id: 'c', label: 'Third part', sub: 'what it does'},
      ];
      base.edges = [
        {id: 'ab', from: 'a', to: 'b', kind: 'relation', label: 'flows into'},
      ];
      break;
    case 'tension':
      base.nodes = [
        {id: 'chosen', label: 'The chosen path', sub: 'why this one'},
        {id: 'rejected', label: 'A real alternative', sub: 'why it was rejected', kind: 'rejected'},
        {id: 'risk', label: 'A residual risk', sub: 'what the choice did not resolve', kind: 'risk'},
      ];
      break;
    case 'recap':
      base.points = [
        'Disposition — sound / not sound / sound-with-a-watch.',
        'The single biggest residual risk.',
        'The one line to carry off the page.',
      ];
      // recap beats use a numeric `reveal` (the 1-based point index).
      base.beats = [
        {id: `${idStem}-1`, reveal: 1, narration: 'Restate the disposition.'},
        {id: `${idStem}-2`, reveal: 2, narration: 'Name the residual risk.'},
        {id: `${idStem}-3`, reveal: 3, narration: 'Carry off the single line.'},
      ];
      break;
    case 'compare':
      base.columns = [
        {id: 'col-a', label: 'Option A'},
        {id: 'col-b', label: 'Option B'},
      ];
      base.rows = [
        {
          id: 'row-1',
          label: 'A criterion to compare on',
          cells: [{text: 'what A does here'}, {text: 'what B does here'}],
        },
      ];
      break;
    case 'quantities':
      base.figures = [
        {id: 'f1', label: 'A measured quantity', value: '0', unit: ''},
      ];
      break;
    case 'progression':
      base.stages = [
        {id: 'p1', label: 'Stage one'},
        {id: 'p2', label: 'Stage two'},
        {id: 'p3', label: 'Stage three'},
      ];
      break;
    case 'probe':
      base.baseline = {label: 'The baseline state', outcome: 'what happens'};
      base.variations = [
        {
          id: 'v1',
          label: 'Vary the input',
          change: 'what you changed',
          outcome: 'what happened',
        },
      ];
      break;
    case 'chart':
      base.xAxis = {kind: 'chart', label: 'x', min: 0, max: 10};
      base.yAxis = {kind: 'chart', label: 'y', min: 0, max: 10};
      base.series = [
        {id: 'series-1', kind: 'line', fn: 'linear', accent: 'blue'},
      ];
      break;
    case 'walkthrough':
      base.actors = [
        {id: 'caller', label: 'Caller', sub: 'edit me'},
        {id: 'callee', label: 'Callee', sub: 'edit me'},
      ];
      // A walkthrough scene's native shape is a sequence diagram, not a
      // video — but the asset-reference syntax (e.g.
      // `walkthrough: dashboard.mp4`) is a human-readable shorthand the
      // R12 surface accepts. We stash the bound path on a `clip` field
      // and leave a TODO so the human knows the wiring needs a second
      // pass at render time (an actor-cast still needs to be authored).
      if (pick.asset) {
        base.clip = pick.asset.normalizedPath;
        base._todo =
          'walkthrough is a sequence diagram — the bound clip path is a hint, not the rendered media. Replace `actors` with the real cast or convert the scene to `demonstrate` if you really want a clip.';
      }
      break;
    case 'closeup':
      base.lang = pick.asset
        ? inferCodeLang(pick.asset.filename) ?? 'ts'
        : 'ts';
      if (pick.asset) {
        base.file = pick.asset.normalizedPath;
        // Symmetric with passage: when the file exists under the project's
        // public/ tree, read it and inline. Otherwise leave the placeholder
        // + _todo so a treatment referencing not-yet-authored code still
        // compiles cleanly.
        const inlined = projectRoot
          ? readPassageSource(projectRoot, pick.asset.normalizedPath)
          : null;
        if (inlined !== null) {
          base.code = inlined;
        } else {
          base.code = '// paste the code artifact here\n';
          base._todo = `paste the source of ${pick.asset.filename} into \`code\`.`;
        }
      } else {
        base.code = '// paste the code artifact here\n';
      }
      break;
    case 'demonstrate':
      // `clip` is resolved at render time under `public/clips/<filmId>/`;
      // for a bare filename we store just the filename so the existing
      // resolver works. For an explicit path we store it verbatim.
      if (pick.asset) {
        base.clip = pick.asset.filename.includes('/')
          ? pick.asset.normalizedPath
          : pick.asset.filename;
      } else {
        base.clip = 'public/clips/edit-me.mp4';
      }
      break;
    case 'passage':
      base.marks = [];
      // A passage scene carries the text inline. When a `.md` asset is
      // bound at compile time AND the file exists on disk under the
      // project's public/ tree, we read its content and inline it
      // directly — the FDE/SRE workflow has the runbook source on disk
      // already, no reason to defer to a human paste step.
      if (pick.asset) {
        base._source = pick.asset.normalizedPath;
        const inlined = projectRoot
          ? readPassageSource(projectRoot, pick.asset.normalizedPath)
          : null;
        if (inlined !== null) {
          base.text = inlined;
        } else {
          base.text = 'Paste the source text here, line by line.';
          base._todo = `inline the prose of ${pick.asset.filename} into \`text\`.`;
        }
      } else {
        base.text = 'Paste the source text here, line by line.';
      }
      break;
    case 'figure':
      base.image = pick.asset?.normalizedPath ?? 'public/figures/edit-me.png';
      base.callouts = [];
      break;
    case 'diff':
      base.code =
        '--- a/path/to/file\n+++ b/path/to/file\n@@ -1,1 +1,1 @@\n-the before line\n+the after line';
      break;
    default:
      break;
  }
  return base;
};

const buildSpec = (
  id: string,
  title: string,
  picks: ReadonlyArray<ScenePick>,
  projectRoot?: string,
): unknown => ({
  meta: {
    id,
    title,
    subject: 'Edit me — the one-line description that goes under the title',
    fps: 30,
    voice: 'af_heart',
  },
  scenes: picks.map((p, i) => placeholderScene(i, p, projectRoot)),
});

// ----- the CLI surface ------------------------------------------------------

export const runTreatment = async (args: TreatmentArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const analysisDir = args.analysisDir ?? join(projectRoot, 'analysis');
  const treatmentsDir = args.treatmentsDir ?? join(projectRoot, 'treatments');
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');

  if (args.toSpec) {
    return runTreatmentToSpec({
      id: args.id,
      treatmentsDir,
      filmsDir,
      force: args.force ?? false,
      projectRoot,
    });
  }
  return runTreatmentScaffold({
    id: args.id,
    analysisDir,
    treatmentsDir,
    force: args.force ?? false,
  });
};

interface ScaffoldArgs {
  readonly id: string;
  readonly analysisDir: string;
  readonly treatmentsDir: string;
  readonly force: boolean;
}

const runTreatmentScaffold = async (args: ScaffoldArgs): Promise<number> => {
  const surveyPath = resolve(args.analysisDir, `${args.id}.md`);
  const treatmentPath = resolve(args.treatmentsDir, `${args.id}.md`);

  if (!existsSync(surveyPath)) {
    err(`\x1b[31m✗ analysis/${args.id}.md not found at ${surveyPath}\x1b[0m`);
    err('  Run the survey first — write the deep notes at analysis/<id>.md.');
    return 1;
  }
  if (existsSync(treatmentPath) && !args.force) {
    err(`\x1b[31m✗ ${treatmentPath} already exists. Pass --force to overwrite.\x1b[0m`);
    return 1;
  }

  let source: string;
  try {
    source = readFileSync(surveyPath, 'utf-8');
  } catch (e) {
    err(`treatment error: ${surveyPath}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const fallbackTitle = basename(surveyPath, '.md');
  const survey = parseSurvey(source, fallbackTitle);
  const scenes = proposeScenes(survey.sections);
  const md = renderTreatment(args.id, survey, scenes);

  mkdirSync(dirname(treatmentPath), {recursive: true});
  writeFileSync(treatmentPath, md, 'utf-8');

  log(`\x1b[32m✓ wrote ${treatmentPath}\x1b[0m`);
  log('');
  log('  Next:');
  log(`    1. Open ${treatmentPath} and steer the outline — the human-readable layer.`);
  log(`    2. \x1b[36mbunx docent treatment ${args.id} --to-spec\x1b[0m   — compile to films/${args.id}.json`);
  log(`    3. \x1b[36mbunx docent validate ${args.id}\x1b[0m              — check the spec`);
  return 0;
};

interface ToSpecArgs {
  readonly id: string;
  readonly treatmentsDir: string;
  readonly filmsDir: string;
  readonly force: boolean;
  readonly projectRoot?: string;
}

const runTreatmentToSpec = async (args: ToSpecArgs): Promise<number> => {
  const treatmentPath = resolve(args.treatmentsDir, `${args.id}.md`);
  const specPath = resolve(args.filmsDir, `${args.id}.json`);

  if (!existsSync(treatmentPath)) {
    err(`\x1b[31m✗ treatments/${args.id}.md not found at ${treatmentPath}\x1b[0m`);
    err(`  Run \`docent treatment ${args.id}\` first to scaffold the treatment.`);
    return 1;
  }
  if (existsSync(specPath) && !args.force) {
    err(`\x1b[31m✗ ${specPath} already exists. Pass --force to overwrite.\x1b[0m`);
    return 1;
  }

  let source: string;
  try {
    source = readFileSync(treatmentPath, 'utf-8');
  } catch (e) {
    err(`treatment error: ${treatmentPath}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  // Pull the title — the treatment's first `# ...` heading.
  let title = args.id;
  for (const ln of source.split('\n')) {
    const m = ln.match(/^#\s+(.+)$/);
    if (m && m[1]) {
      title = m[1].trim();
      break;
    }
  }

  const picks = parseTreatmentScenes(source);
  if (picks.length === 0) {
    err(`\x1b[31m✗ no proposed scenes found under "## Proposed scenes" in ${treatmentPath}.\x1b[0m`);
    return 1;
  }

  const spec = buildSpec(args.id, title, picks, args.projectRoot);

  mkdirSync(dirname(specPath), {recursive: true});
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');

  log(`wrote films/${args.id}.json — run docent validate ${args.id} next.`);
  return 0;
};
