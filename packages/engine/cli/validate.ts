// Structural validation of a film spec — the contract the engine enforces and
// the agent layer must satisfy. This is not a full JSON Schema validator; it
// is a focused check of the shape the engine actually depends on.
// schema/film.schema.json is the documented contract this mirrors.

import {parseTimelineDate} from '../src/engine/time';

const SCENE_TYPES = ['big-idea', 'causal-loop', 'chart', 'closeup', 'compare', 'demonstrate', 'diff', 'figure', 'frame', 'journey-map', 'landscape', 'map', 'mechanism', 'passage', 'prior-art', 'probe', 'progression', 'quantities', 'recap', 'structure', 'tension', 'timeline', 'tree', 'venn', 'walkthrough'];
// journey-map — the closed allowlist of emotion chips. An emotion outside
// this list is rejected: the author names a feeling, the engine owns the chip.
const JOURNEY_EMOTIONS = ['delight', 'curiosity', 'satisfaction', 'neutral', 'fatigue', 'frustration', 'pain'];
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'];
// big-idea — the closed allowlist of anchor kinds. An anchor outside this list
// is rejected: the author picks the kind, the engine owns the pixels.
const BIG_IDEA_ANCHOR_KINDS = ['glyph', 'equation', 'image', 'chart-fragment'];

// chart scenes — the closed allowlist of named functions a `line` series may
// plot, and the closed set of series kinds. Like the intent knobs above, a
// value outside these enums is rejected: the `fn` allowlist is the contract
// that keeps charts declarative — never an arbitrary expression.
const CHART_FNS = ['linear', 'x^2', 'sqrt', 'sin', 'exp', 'log', 'reciprocal'];
const SERIES_KINDS = ['line', 'bars', 'point'];
const MAX_BARS = 8;
const MAX_TICKS = 10;
// tree scenes — hard ceilings the renderer can draw cleanly. Past 5 levels the
// boxes shrink past legibility; past ~30 visible nodes the breadth axis goes
// thinner than label width. The validator hard-fails so a bad tree never reaches
// the cascade.
const TREE_MAX_DEPTH = 5;
const TREE_MAX_NODES = 30;

// Intent knobs — semantic dials the author may set; the engine interprets
// them. Each is a closed enum, and that is the point: a value outside the
// enum would be a free-form (pixel) value sneaking in — exactly what these
// checks forbid. An intent knob cannot degrade into a raw value.
const KNOBS: Record<string, string[]> = {
  register: ['grave', 'neutral', 'calm', 'urgent', 'playful'],
  cut: ['dissolve', 'hold', 'continue'],
  palette: ['cool', 'warm', 'signal', 'mono'],
  treatment: ['crisp', 'sketch', 'whiteboard'],
  pace: ['hold', 'settle', 'normal', 'brisk'],
  cadence: ['cascade', 'together', 'snap'],
  shot: ['wide', 'follow', 'push', 'hold'],
  weight: ['hero', 'primary', 'normal', 'recede'],
  // tween directive — a metric's number formatter and a tween's easing curve.
  format: ['int', 'float1', 'percent'],
  ease: ['linear', 'spring', 'accelerate', 'settle'],
  // morph directive — a node's representation. `box` is the default Card; the
  // rest are the forms a node can morph into. `equation` typesets `expr`.
  as: ['box', 'matrix', 'vector', 'grid', 'code', 'equation'],
  // progression — the track topology. `linear`/`cycle` are the originals;
  // `braided` runs two parallel lanes, `iterate` is a converging cycle.
  flow: ['linear', 'cycle', 'braided', 'iterate'],
  // structure edges — the relationship a line asserts. `relation`/`feedback`
  // are the originals; `entails` is a logical "therefore", `causes` a causal
  // claim. `edgeStrength` qualifies a `causes` edge's weight.
  edgeKind: ['relation', 'feedback', 'entails', 'causes'],
  edgeStrength: ['necessary', 'contributing'],
};

// An issue is an error by default. A `warning` is advisory — it flags a spec
// that renders but past a recommended bound (e.g. too many bars to read
// cleanly). Consumers may choose to treat warnings as non-fatal.
export type ValidationIssue = {
  path: string;
  message: string;
  severity?: 'error' | 'warning';
};

// Sprint B — compositional grammar. The closed allowlist of which embed scene
// types each parent slot accepts. The validator HARD-FAILS any embed whose
// `type` is outside its slot's allowlist; new compositions must be added to
// the table (and to the design doc) before any spec can use them.
const EMBED_ALLOWLIST: Record<string, string[]> = {
  'landscape.subjects': ['mechanism', 'venn', 'chart', 'quantities'],
  'timeline.events': ['venn', 'quantities', 'compare', 'structure'],
  'journey-map.stages': ['causal-loop', 'mechanism', 'compare'],
  'tree.children': ['tree', 'compare', 'quantities'],
  'structure.nodes': ['mechanism', 'chart', 'venn'],
  'compare.cells': ['quantities', 'chart', 'venn'],
};

// The chrome fields an embedded scene must NOT carry — the parent owns them.
const EMBED_FORBIDDEN_FIELDS = ['beats', 'kicker', 'heading', 'cut', 'cam', 'style'];

// Max nesting depth — an embed may itself embed (depth 2), but no deeper.
const EMBED_MAX_DEPTH = 2;

// Validate one embedded scene at `path`. Enforces:
//   - chrome fields (beats/kicker/heading/cut/cam/style) are absent
//   - `type` is in the slot's allowlist
//   - depth ≤ EMBED_MAX_DEPTH (1 = embed inside a top-level scene; 2 = embed
//     inside an embed; 3+ = REJECTED)
//   - the per-scene-type structural rules (axes, regions, parts, etc.) of
//     the same shape the top-level scene check enforces — minus the body
//     minimum-count requirements (an embed is a tableau, not a full scene)
//   - recursive: nested embeds get the same treatment at depth+1
const validateEmbed = (
  embed: any,
  slot: string,
  parentPath: string,
  depth: number,
  issues: ValidationIssue[],
): void => {
  if (!embed || typeof embed !== 'object' || Array.isArray(embed)) {
    issues.push({path: parentPath, message: 'embed must be an object {type, ...}'});
    return;
  }
  // Depth gate — past EMBED_MAX_DEPTH, reject before any other check so the
  // error is unambiguous (a nested embed past the cap is the only failure).
  if (depth > EMBED_MAX_DEPTH) {
    issues.push({
      path: parentPath,
      message: `embed nesting exceeds max depth ${EMBED_MAX_DEPTH} (an embed may itself embed once; deeper nesting is rejected)`,
    });
    return;
  }
  // Chrome — parent owns it; embed must not carry any of these fields.
  for (const f of EMBED_FORBIDDEN_FIELDS) {
    if (embed[f] !== undefined) {
      issues.push({
        path: `${parentPath}.${f}`,
        message: `embed must not carry "${f}" — the parent scene owns chrome/beats/style/transitions`,
      });
    }
  }
  // Type allowlist for this slot.
  const allowed = EMBED_ALLOWLIST[slot];
  if (!allowed) {
    issues.push({
      path: parentPath,
      message: `unknown embed slot "${slot}" — this should not happen (embed at a non-opt-in slot)`,
    });
    return;
  }
  if (typeof embed.type !== 'string' || !allowed.includes(embed.type)) {
    issues.push({
      path: `${parentPath}.type`,
      message: `embed type "${embed.type ?? '(unset)'}" not allowed in ${slot} — one of: ${allowed.join(', ')}`,
    });
    return;
  }
  // Per-scene-type shape — re-run validateSpec on a synthetic spec that wraps
  // the embed as the sole scene, with a stub beat that satisfies the
  // first-beat-visual rule generically. Filter the result to keep only the
  // structural errors (drop body-minimum and film-level contracts).
  // The `__embed_synthetic` flag tells validateSpec NOT to recurse into the
  // embed's own slot table — `validateEmbed` already calls `walkEmbedSlots`
  // recursively below, so a duplicate walk would double-report.
  const synthetic = {
    __embed_synthetic: true,
    meta: {
      id: 'embed-check',
      title: 'embed',
      subject: 'embed',
      prompt: 'embed',
      fps: 30,
      width: 1920,
      height: 1080,
    },
    scenes: [
      {
        ...embed,
        // Stub chrome so the validator's required keys (id, type, beats)
        // are satisfied; we then strip any errors that touch beats/chrome.
        id: '__embed__',
        kicker: '__embed__',
        beats: [
          {
            id: '__embed__beat',
            narration: 'embed',
            // Make the first-beat-visual check pass for any scene type.
            reveal: ['__none__'],
            focus: ['__none__'],
            show: '__none__',
          },
        ],
      },
    ],
  };
  const synthIssues = validateSpec(synthetic);
  // Filter: drop minimum-body messages and film-level contracts; rewrite paths
  // from `scenes[0]` to `parentPath`.
  const PATH_PREFIX = 'scenes[0]';
  for (const iss of synthIssues) {
    // Drop synthetic beat errors (the stub satisfies the contract; any
    // residual error on beats came from our stub, not the embed).
    if (iss.path === 'scenes[0].beats' || iss.path.startsWith('scenes[0].beats')) continue;
    if (iss.path === 'scenes[0].kicker') continue;
    if (iss.path === 'scenes[0].id') continue;
    // Drop film-level contracts (AR-prior-art, big-idea) that fire when the
    // meta prompt looks like 'architecture-review' / 'explain*'. Our synthetic
    // uses 'embed' for prompt; defensive in case future strings overlap.
    if (iss.path === 'scenes' && /architecture-review|big-idea|explainer/i.test(iss.message)) {
      continue;
    }
    // Drop minimum-body messages — an embed is a tableau, not a full scene,
    // so it is exempt from "needs at least N items" floors. The shape rules
    // (axis kinds, region refs, polarity math, etc.) still apply.
    if (iss.path === PATH_PREFIX && /requires at least|requires \d/.test(iss.message)) {
      continue;
    }
    // Drop the chrome-on-embed messages we already raised above (avoid dups).
    if (
      EMBED_FORBIDDEN_FIELDS.some(
        (f) => iss.path === `${PATH_PREFIX}.${f}` || iss.path.startsWith(`${PATH_PREFIX}.${f}.`),
      )
    ) {
      continue;
    }
    // Rewrite path: scenes[0].foo → parentPath.foo
    const newPath = iss.path === PATH_PREFIX
      ? parentPath
      : parentPath + iss.path.slice(PATH_PREFIX.length);
    issues.push({path: newPath, message: iss.message, severity: iss.severity});
  }

  // Recurse — check the embed's own embed-able sub-records at depth+1.
  // Only the slot-table entries are scanned; other fields are leaf.
  walkEmbedSlots(embed, parentPath, depth + 1, issues);
};

// Walk a scene's (or embed's) sub-records and validate any `.embed` field
// against the slot's allowlist. Called once at top level for each scene, and
// recursively for nested embeds via validateEmbed.
const walkEmbedSlots = (
  sc: any,
  parentPath: string,
  depth: number,
  issues: ValidationIssue[],
): void => {
  // landscape.subjects[].embed
  if (sc?.type === 'landscape' && Array.isArray(sc.subjects)) {
    sc.subjects.forEach((s: any, i: number) => {
      if (s?.embed !== undefined) {
        validateEmbed(
          s.embed,
          'landscape.subjects',
          `${parentPath}.subjects[${i}].embed`,
          depth,
          issues,
        );
      }
    });
  }
  // timeline.events[].embed
  if (sc?.type === 'timeline' && Array.isArray(sc.events)) {
    sc.events.forEach((e: any, i: number) => {
      if (e?.embed !== undefined) {
        validateEmbed(
          e.embed,
          'timeline.events',
          `${parentPath}.events[${i}].embed`,
          depth,
          issues,
        );
      }
    });
  }
  // journey-map.stages[].embed
  if (sc?.type === 'journey-map' && Array.isArray(sc.journeyStages)) {
    sc.journeyStages.forEach((js: any, i: number) => {
      if (js?.embed !== undefined) {
        validateEmbed(
          js.embed,
          'journey-map.stages',
          `${parentPath}.journeyStages[${i}].embed`,
          depth,
          issues,
        );
      }
    });
  }
  // tree.children[].embed — recursive walk over the tree, only checking
  // *children*, not the root (root is the spine — embedding inside it would
  // collide with the chrome the renderer owns).
  if (sc?.type === 'tree' && sc.root && typeof sc.root === 'object') {
    const walkTree = (n: any, p: string): void => {
      if (Array.isArray(n.children)) {
        n.children.forEach((c: any, i: number) => {
          if (c?.embed !== undefined) {
            validateEmbed(c.embed, 'tree.children', `${p}.children[${i}].embed`, depth, issues);
          }
          walkTree(c, `${p}.children[${i}]`);
        });
      }
    };
    walkTree(sc.root, `${parentPath}.root`);
  }
  // structure.nodes[].embed
  if (sc?.type === 'structure' && Array.isArray(sc.nodes)) {
    sc.nodes.forEach((n: any, i: number) => {
      if (n?.embed !== undefined) {
        validateEmbed(
          n.embed,
          'structure.nodes',
          `${parentPath}.nodes[${i}].embed`,
          depth,
          issues,
        );
      }
    });
  }
  // compare.cells[].embed — cells live inside rows[].
  if (sc?.type === 'compare' && Array.isArray(sc.rows)) {
    sc.rows.forEach((r: any, ri: number) => {
      if (!Array.isArray(r?.cells)) return;
      r.cells.forEach((c: any, ci: number) => {
        if (c?.embed !== undefined) {
          validateEmbed(
            c.embed,
            'compare.cells',
            `${parentPath}.rows[${ri}].cells[${ci}].embed`,
            depth,
            issues,
          );
        }
      });
    });
  }
  // Every other scene type is leaf-only: an `.embed` field anywhere else
  // is a sneak past the schema. Scan generic sub-arrays that the slot table
  // does NOT name and reject any `.embed` there. This is the "don't let
  // authors stuff embed into a passage" guard from the brief.
  // The list of fields that ARE legit hosts above; everything else with an
  // embed inside is wrong.
  const LEGIT_HOSTS: Record<string, string[]> = {
    landscape: ['subjects'],
    timeline: ['events'],
    'journey-map': ['journeyStages'],
    tree: [],
    structure: ['nodes'],
    compare: ['rows'],
  };
  const legit = LEGIT_HOSTS[sc?.type] ?? [];
  // Find any sub-array on the scene that carries an `embed` field but is not
  // in the legit list — e.g. someone trying landscape.quadrants.embed (which
  // is an object, not an array, but covered by the schema). Iterate all
  // top-level fields generically.
  for (const [key, val] of Object.entries(sc ?? {})) {
    if (key === 'beats' || key === 'embed') continue;
    if (legit.includes(key)) continue;
    if (Array.isArray(val)) {
      val.forEach((item: any, i: number) => {
        if (item && typeof item === 'object' && 'embed' in item) {
          issues.push({
            path: `${parentPath}.${key}[${i}].embed`,
            message: `scene type "${sc.type}" does not declare an embed slot at "${key}[]" — embed is rejected here`,
          });
        }
      });
    }
  }
};

// Flag a knob whose value is outside its closed enum.
const checkKnob = (
  obj: Record<string, any>,
  key: keyof typeof KNOBS,
  path: string,
  issues: ValidationIssue[],
): void => {
  const v = obj[key];
  if (v !== undefined && !KNOBS[key].includes(v)) {
    issues.push({
      path: `${path}.${key}`,
      message: `not a valid ${key} — one of: ${KNOBS[key].join(', ')}`,
    });
  }
};

export const validateSpec = (spec: unknown): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const s = spec as Record<string, any>;
  if (!s || typeof s !== 'object') {
    return [{path: '', message: 'spec is not an object'}];
  }

  // meta
  if (!s.meta || typeof s.meta !== 'object') {
    issues.push({path: 'meta', message: 'missing meta block'});
  } else {
    for (const k of ['id', 'title', 'subject', 'prompt']) {
      if (typeof s.meta[k] !== 'string' || !s.meta[k].trim()) {
        issues.push({path: `meta.${k}`, message: 'missing or empty string'});
      }
    }
    for (const k of ['fps', 'width', 'height']) {
      if (typeof s.meta[k] !== 'number' || s.meta[k] <= 0) {
        issues.push({path: `meta.${k}`, message: 'missing or non-positive number'});
      }
    }
    checkKnob(s.meta, 'register', 'meta', issues);
  }

  // scenes
  if (!Array.isArray(s.scenes) || s.scenes.length === 0) {
    issues.push({path: 'scenes', message: 'missing or empty scenes array'});
    return issues;
  }

  const sceneIds = new Set<string>();
  const beatIds = new Set<string>();
  s.scenes.forEach((sc: Record<string, any>, i: number) => {
    const at = `scenes[${i}]`;
    if (typeof sc.id !== 'string') {
      issues.push({path: `${at}.id`, message: 'missing id'});
    } else if (sceneIds.has(sc.id)) {
      issues.push({path: `${at}.id`, message: `duplicate scene id "${sc.id}"`});
    } else {
      sceneIds.add(sc.id);
    }
    if (!SCENE_TYPES.includes(sc.type)) {
      issues.push({path: `${at}.type`, message: `unknown scene type "${sc.type}"`});
    }
    if (sc.accent && !ACCENTS.includes(sc.accent)) {
      issues.push({path: `${at}.accent`, message: `unknown accent "${sc.accent}"`});
    }
    checkKnob(sc, 'cut', at, issues);
    checkKnob(sc, 'palette', at, issues);
    checkKnob(sc, 'treatment', at, issues);
    // progression — the track topology. Closed enum; an unknown value is a
    // free-form layout sneaking in, exactly what an intent knob forbids.
    checkKnob(sc, 'flow', at, issues);
    // node ids in this scene — the morph `transform` directive must name one.
    const nodeIds = new Set<string>();
    if (Array.isArray(sc.nodes)) {
      sc.nodes.forEach((n: Record<string, any>, k: number) => {
        if (!n || typeof n !== 'object') return;
        const nAt = `${at}.nodes[${k}]`;
        checkKnob(n, 'weight', nAt, issues);
        // morph — a node's representation (`as`), its `cells`, and its
        // `expr`. `as` is a closed enum. `cells` must be a row-major array of
        // arrays: the grid/matrix/vector forms need it; box/code/equation must
        // not carry it. `equation` needs `expr` — the math markup the engine
        // typesets; any other representation must not carry `expr`.
        checkKnob(n, 'as', nAt, issues);
        if (typeof n.id === 'string') nodeIds.add(n.id);
        const repr = n.as ?? 'box';
        if (n.cells !== undefined) {
          if (
            !Array.isArray(n.cells) ||
            !n.cells.every(
              (row: any) =>
                Array.isArray(row) &&
                row.every(
                  (c: any) => typeof c === 'string' || typeof c === 'number',
                ),
            )
          ) {
            issues.push({
              path: `${nAt}.cells`,
              message: 'cells must be a row-major array of (string | number) arrays',
            });
          } else if (repr !== 'matrix' && repr !== 'vector' && repr !== 'grid') {
            issues.push({
              path: `${nAt}.cells`,
              message: `cells has no meaning for as: "${repr}" — only matrix/vector/grid`,
            });
          }
        } else if (repr === 'matrix' || repr === 'vector' || repr === 'grid') {
          issues.push({
            path: `${nAt}.cells`,
            message: `as: "${repr}" needs a cells array`,
          });
        }
        if (n.expr !== undefined) {
          if (typeof n.expr !== 'string' || !n.expr.trim()) {
            issues.push({
              path: `${nAt}.expr`,
              message: 'expr must be a non-empty string of math markup',
            });
          } else if (repr !== 'equation') {
            issues.push({
              path: `${nAt}.expr`,
              message: `expr has no meaning for as: "${repr}" — only equation`,
            });
          }
        } else if (repr === 'equation') {
          issues.push({
            path: `${nAt}.expr`,
            message: 'as: "equation" needs an expr string',
          });
        }
      });
    }

    // Box-overlap guarantee — a card MUST never sit on top of another. Each
    // node's occupied cells are (col, row) plus (col+1, row) if wide; two
    // nodes sharing a cell, or a cell poking outside the grid, is rejected.
    // The engine cannot recover from a static-render collision; the validator
    // must catch it before the cascade ever runs.
    if (Array.isArray(sc.nodes) && sc.nodes.length > 0) {
      const gCols = (sc.grid?.cols as number | undefined) ?? 3;
      const gRows = (sc.grid?.rows as number | undefined) ?? 3;
      const occupied = new Map<string, string>();
      sc.nodes.forEach((n: Record<string, any>, k: number) => {
        if (typeof n.col !== 'number' || typeof n.row !== 'number') return;
        const cells: [number, number][] = [[n.col, n.row]];
        if (n.wide === true) cells.push([n.col + 1, n.row]);
        for (const [c, r] of cells) {
          if (c < 0 || c >= gCols || r < 0 || r >= gRows) {
            // Soft fail — resolveLayout drops the wide flag at render time, so
            // a frame-overflow cannot reach the screen. The validator surfaces
            // the bad spec for the author; the cascade still renders.
            issues.push({
              path: `${at}.nodes[${k}]`,
              message: `cell (col=${c}, row=${r}) is outside the ${gCols}×${gRows} grid`,
              severity: 'warning',
            });
            continue;
          }
          const key = `${c},${r}`;
          const prior = occupied.get(key);
          if (prior !== undefined && prior !== n.id) {
            // Soft fail — resolveLayout reconciles overlap visually; the spec
            // is still flagged so the author can correct it.
            issues.push({
              path: `${at}.nodes[${k}]`,
              message: `box overlap — "${n.id}" and "${prior}" both occupy cell (col=${c}, row=${r})`,
              severity: 'warning',
            });
          } else {
            occupied.set(key, n.id);
          }
        }
      });
    }

    // edges — the lines of a structure diagram. `kind` types what the line
    // asserts (`relation`/`feedback`/`entails`/`causes`); `strength` qualifies
    // a causal claim's weight. Both are closed enums. `strength` only has
    // meaning on a `causes` edge — declaring it elsewhere is a force-fit.
    if (sc.edges !== undefined && !Array.isArray(sc.edges)) {
      issues.push({path: `${at}.edges`, message: 'edges must be an array'});
    } else if (Array.isArray(sc.edges)) {
      const edgeIds = new Set<string>();
      sc.edges.forEach((e: Record<string, any>, k: number) => {
        const eAt = `${at}.edges[${k}]`;
        if (!e || typeof e !== 'object') {
          issues.push({path: eAt, message: 'edge must be an object {id, from, to}'});
          return;
        }
        if (typeof e.id !== 'string' || !e.id.trim()) {
          issues.push({path: `${eAt}.id`, message: 'missing or empty string'});
        } else if (edgeIds.has(e.id)) {
          issues.push({path: `${eAt}.id`, message: `duplicate edge id "${e.id}"`});
        } else {
          edgeIds.add(e.id);
        }
        for (const f of ['from', 'to']) {
          if (typeof e[f] !== 'string' || !e[f].trim()) {
            issues.push({path: `${eAt}.${f}`, message: 'missing node id'});
          }
        }
        if (e.kind !== undefined && !KNOBS.edgeKind.includes(e.kind)) {
          issues.push({
            path: `${eAt}.kind`,
            message: `not a valid kind — one of: ${KNOBS.edgeKind.join(', ')}`,
          });
        }
        if (e.strength !== undefined) {
          if (!KNOBS.edgeStrength.includes(e.strength)) {
            issues.push({
              path: `${eAt}.strength`,
              message: `not a valid strength — one of: ${KNOBS.edgeStrength.join(', ')}`,
            });
          } else if (e.kind !== 'causes') {
            issues.push({
              path: `${eAt}.strength`,
              message: 'strength has meaning only on a `causes` edge',
            });
          }
        }
      });
    }

    // stages — progression markers. `track` (0 or 1) picks a braided lane;
    // it is the only closed value on a stage, and only meaningful when the
    // scene's `flow` is `braided`.
    if (sc.stages !== undefined && !Array.isArray(sc.stages)) {
      issues.push({path: `${at}.stages`, message: 'stages must be an array'});
    } else if (Array.isArray(sc.stages)) {
      sc.stages.forEach((st: Record<string, any>, k: number) => {
        if (!st || typeof st !== 'object') return;
        if (st.track !== undefined && st.track !== 0 && st.track !== 1) {
          issues.push({
            path: `${at}.stages[${k}].track`,
            message: 'track must be 0 or 1 (a braided lane)',
          });
        }
      });
    }

    // metrics — figure cards whose number is a tweened value. Each must name a
    // grid cell, a label, and a `bind` key driven by a beat's `set`.
    if (sc.metrics !== undefined && !Array.isArray(sc.metrics)) {
      issues.push({path: `${at}.metrics`, message: 'metrics must be an array'});
    } else if (Array.isArray(sc.metrics)) {
      sc.metrics.forEach((m: Record<string, any>, k: number) => {
        const mAt = `${at}.metrics[${k}]`;
        if (!m || typeof m !== 'object') {
          issues.push({path: mAt, message: 'metric must be an object'});
          return;
        }
        for (const f of ['id', 'label', 'bind']) {
          if (typeof m[f] !== 'string' || !m[f].trim()) {
            issues.push({path: `${mAt}.${f}`, message: 'missing or empty string'});
          }
        }
        for (const f of ['col', 'row']) {
          if (typeof m[f] !== 'number' || !Number.isInteger(m[f]) || m[f] < 0) {
            issues.push({path: `${mAt}.${f}`, message: 'must be a non-negative integer'});
          }
        }
        checkKnob(m, 'format', mAt, issues);
        if (m.accent !== undefined && !ACCENTS.includes(m.accent)) {
          issues.push({path: `${mAt}.accent`, message: `unknown accent "${m.accent}"`});
        }
      });
    }

    // chart — a plotted coordinate graph. Axes are labelled domains; series
    // are line / bars / point. The `fn` allowlist and series `kind` are closed
    // enums (the chart analogue of the intent knobs); density is capped, and a
    // spec past the cap earns an advisory warning rather than a hard error.
    const checkAxis = (axis: any, axisAt: string): void => {
      if (axis === undefined) return;
      if (!axis || typeof axis !== 'object') {
        issues.push({path: axisAt, message: 'axis must be an object {kind: "chart", label, min, max, ticks?}'});
        return;
      }
      // `kind: 'chart'` is the discriminator that narrows `Scene.xAxis`/`yAxis`
      // from the widened `Axis | LandscapeAxis` union at the renderer.
      if (sc.type === 'chart' && axis.kind !== 'chart') {
        issues.push({
          path: `${axisAt}.kind`,
          message: 'chart scene requires `axis.kind: "chart"` (the discriminator that narrows the union)',
        });
      }
      if (typeof axis.label !== 'string' || !axis.label.trim()) {
        issues.push({path: `${axisAt}.label`, message: 'missing or empty string'});
      }
      for (const f of ['min', 'max']) {
        if (typeof axis[f] !== 'number' || !Number.isFinite(axis[f])) {
          issues.push({path: `${axisAt}.${f}`, message: 'must be a finite number'});
        }
      }
      if (
        typeof axis.min === 'number' &&
        typeof axis.max === 'number' &&
        axis.min >= axis.max
      ) {
        issues.push({path: `${axisAt}.max`, message: 'max must be greater than min'});
      }
      if (axis.ticks !== undefined) {
        if (typeof axis.ticks !== 'number' || !Number.isInteger(axis.ticks) || axis.ticks < 2) {
          issues.push({path: `${axisAt}.ticks`, message: 'ticks must be an integer ≥ 2'});
        } else if (axis.ticks > MAX_TICKS) {
          issues.push({
            path: `${axisAt}.ticks`,
            severity: 'warning',
            message: `${axis.ticks} ticks is dense — ${MAX_TICKS} or fewer reads cleanly`,
          });
        }
      }
    };
    // `xAxis`/`yAxis` on a landscape scene are a different shape — the
    // trade-off (lowLabel/highLabel), not a numeric domain (min/max). The
    // landscape per-scene block below checks them; skip the chart-axis check
    // when the scene is a landscape.
    if (sc.type !== 'landscape') {
      checkAxis(sc.xAxis, `${at}.xAxis`);
      checkAxis(sc.yAxis, `${at}.yAxis`);
    }

    if (sc.series !== undefined && !Array.isArray(sc.series)) {
      issues.push({path: `${at}.series`, message: 'series must be an array'});
    } else if (Array.isArray(sc.series)) {
      const seriesIds = new Set<string>();
      sc.series.forEach((se: Record<string, any>, k: number) => {
        const seAt = `${at}.series[${k}]`;
        if (!se || typeof se !== 'object') {
          issues.push({path: seAt, message: 'series must be an object'});
          return;
        }
        if (typeof se.id !== 'string' || !se.id.trim()) {
          issues.push({path: `${seAt}.id`, message: 'missing or empty string'});
        } else if (seriesIds.has(se.id)) {
          issues.push({path: `${seAt}.id`, message: `duplicate series id "${se.id}"`});
        } else {
          seriesIds.add(se.id);
        }
        if (!SERIES_KINDS.includes(se.kind)) {
          issues.push({
            path: `${seAt}.kind`,
            message: `not a valid kind — one of: ${SERIES_KINDS.join(', ')}`,
          });
        }
        if (se.accent !== undefined && !ACCENTS.includes(se.accent)) {
          issues.push({path: `${seAt}.accent`, message: `unknown accent "${se.accent}"`});
        }
        if (se.kind === 'line') {
          const hasFn = se.fn !== undefined;
          const hasPoints = se.points !== undefined;
          if (!hasFn && !hasPoints) {
            issues.push({path: seAt, message: 'a line series needs either `fn` or `points`'});
          }
          if (hasFn && !CHART_FNS.includes(se.fn)) {
            issues.push({
              path: `${seAt}.fn`,
              message: `not an allowed fn — one of: ${CHART_FNS.join(', ')}`,
            });
          }
          if (hasPoints) {
            if (!Array.isArray(se.points) || se.points.length < 2) {
              issues.push({path: `${seAt}.points`, message: 'points must be an array of ≥ 2 [x, y] pairs'});
            } else {
              se.points.forEach((p: any, pi: number) => {
                if (
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  typeof p[0] !== 'number' ||
                  typeof p[1] !== 'number'
                ) {
                  issues.push({path: `${seAt}.points[${pi}]`, message: 'must be a [number, number] pair'});
                }
              });
            }
          }
        } else if (se.kind === 'bars') {
          if (!Array.isArray(se.data) || se.data.length === 0) {
            issues.push({path: `${seAt}.data`, message: 'a bars series needs a non-empty `data` array'});
          } else {
            if (se.data.length > MAX_BARS) {
              issues.push({
                path: `${seAt}.data`,
                severity: 'warning',
                message: `${se.data.length} bars is dense — ${MAX_BARS} or fewer reads cleanly`,
              });
            }
            se.data.forEach((d: any, di: number) => {
              const dAt = `${seAt}.data[${di}]`;
              if (!d || typeof d !== 'object') {
                issues.push({path: dAt, message: 'datum must be an object {label, value}'});
                return;
              }
              if (typeof d.label !== 'string' || !d.label.trim()) {
                issues.push({path: `${dAt}.label`, message: 'missing or empty string'});
              }
              if (typeof d.value !== 'number' || !Number.isFinite(d.value)) {
                issues.push({path: `${dAt}.value`, message: 'must be a finite number'});
              }
            });
          }
        } else if (se.kind === 'point') {
          if (se.bind !== undefined && (typeof se.bind !== 'string' || !se.bind.trim())) {
            issues.push({path: `${seAt}.bind`, message: 'bind must be a non-empty string naming a `set` key'});
          }
          if (se.along !== undefined && (typeof se.along !== 'string' || !se.along.trim())) {
            issues.push({path: `${seAt}.along`, message: 'along must be a non-empty string naming a line series id'});
          }
        }
      });
    }

    // landscape — N options plotted on M dimensions in 2-D. Axes are NOT a
    // numeric domain; they are trade-offs with a `lowLabel`/`highLabel` phrase
    // at each end. Subjects sit at normalized {x, y} ∈ [0..1]² — the engine
    // maps them to pixels. HARD FAILs:
    //   - xAxis/yAxis both required with non-empty label, lowLabel, highLabel
    //   - 2-8 subjects
    //   - each subject's x/y in [0..1]
    //   - subject ids unique
    if (sc.type === 'landscape') {
      const checkLandscapeAxis = (axis: any, axisAt: string): void => {
        if (!axis || typeof axis !== 'object' || Array.isArray(axis)) {
          issues.push({
            path: axisAt,
            message: 'landscape requires this axis as an object {kind: "landscape", label, lowLabel, highLabel}',
          });
          return;
        }
        // `kind: 'landscape'` is the discriminator that narrows
        // `Scene.xAxis`/`yAxis` from the widened `Axis | LandscapeAxis` union
        // at the renderer.
        if (axis.kind !== 'landscape') {
          issues.push({
            path: `${axisAt}.kind`,
            message: 'landscape scene requires `axis.kind: "landscape"` (the discriminator that narrows the union)',
          });
        }
        for (const f of ['label', 'lowLabel', 'highLabel']) {
          if (typeof axis[f] !== 'string' || !axis[f].trim()) {
            issues.push({
              path: `${axisAt}.${f}`,
              message: `landscape ${axisAt.split('.').pop()} requires a non-empty ${f}`,
            });
          }
        }
      };
      checkLandscapeAxis(sc.xAxis, `${at}.xAxis`);
      checkLandscapeAxis(sc.yAxis, `${at}.yAxis`);

      if (!Array.isArray(sc.subjects) || sc.subjects.length < 2 || sc.subjects.length > 8) {
        issues.push({
          path: `${at}.subjects`,
          message: 'landscape requires 2-8 subjects (the markers plotted on the plane)',
        });
      } else {
        const subjectIds = new Set<string>();
        sc.subjects.forEach((sub: Record<string, any>, k: number) => {
          const subAt = `${at}.subjects[${k}]`;
          if (!sub || typeof sub !== 'object') {
            issues.push({path: subAt, message: 'subject must be an object {id, label, x, y, sub?, accent?}'});
            return;
          }
          if (typeof sub.id !== 'string' || !sub.id.trim()) {
            issues.push({path: `${subAt}.id`, message: 'missing or empty string'});
          } else if (subjectIds.has(sub.id)) {
            issues.push({path: `${subAt}.id`, message: `duplicate subject id "${sub.id}"`});
          } else {
            subjectIds.add(sub.id);
          }
          if (typeof sub.label !== 'string' || !sub.label.trim()) {
            issues.push({path: `${subAt}.label`, message: 'missing or empty string'});
          }
          if (sub.sub !== undefined && (typeof sub.sub !== 'string' || !sub.sub.trim())) {
            issues.push({path: `${subAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
          for (const f of ['x', 'y']) {
            if (typeof sub[f] !== 'number' || !Number.isFinite(sub[f])) {
              issues.push({path: `${subAt}.${f}`, message: 'must be a finite number in [0..1]'});
            } else if (sub[f] < 0 || sub[f] > 1) {
              issues.push({
                path: `${subAt}.${f}`,
                message: `must be in [0..1] (got ${sub[f]}) — landscape positions are normalized`,
              });
            }
          }
          if (sub.accent !== undefined && !ACCENTS.includes(sub.accent)) {
            issues.push({path: `${subAt}.accent`, message: `unknown accent "${sub.accent}"`});
          }
        });
      }

      if (sc.quadrants !== undefined) {
        if (!sc.quadrants || typeof sc.quadrants !== 'object' || Array.isArray(sc.quadrants)) {
          issues.push({path: `${at}.quadrants`, message: 'quadrants must be an object {tl?, tr?, bl?, br?}'});
        } else {
          for (const f of ['tl', 'tr', 'bl', 'br']) {
            const v = (sc.quadrants as Record<string, any>)[f];
            if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
              issues.push({path: `${at}.quadrants.${f}`, message: 'must be a non-empty string when present'});
            }
          }
        }
      }
    }

    // passage — a plain-text artifact and the spans (`marks`) to annotate on
    // it. `text` is a string; each mark carries an id, the exact `quote`
    // substring to locate, and a `note`. A quote that is not a substring of
    // `text` is rejected — the engine would have nowhere to pin the mark.
    if (sc.text !== undefined && typeof sc.text !== 'string') {
      issues.push({path: `${at}.text`, message: 'text must be a string'});
    }
    if (sc.marks !== undefined && !Array.isArray(sc.marks)) {
      issues.push({path: `${at}.marks`, message: 'marks must be an array'});
    } else if (Array.isArray(sc.marks)) {
      const markIds = new Set<string>();
      const passageText = typeof sc.text === 'string' ? sc.text : '';
      sc.marks.forEach((m: Record<string, any>, k: number) => {
        const mAt = `${at}.marks[${k}]`;
        if (!m || typeof m !== 'object') {
          issues.push({path: mAt, message: 'mark must be an object {id, quote, note}'});
          return;
        }
        if (typeof m.id !== 'string' || !m.id.trim()) {
          issues.push({path: `${mAt}.id`, message: 'missing or empty string'});
        } else if (markIds.has(m.id)) {
          issues.push({path: `${mAt}.id`, message: `duplicate mark id "${m.id}"`});
        } else {
          markIds.add(m.id);
        }
        if (typeof m.quote !== 'string' || !m.quote.trim()) {
          issues.push({path: `${mAt}.quote`, message: 'missing or empty string'});
        } else if (passageText && !passageText.includes(m.quote)) {
          issues.push({
            path: `${mAt}.quote`,
            message: `quote is not a substring of the passage text`,
          });
        }
        if (typeof m.note !== 'string' || !m.note.trim()) {
          issues.push({path: `${mAt}.note`, message: 'missing or empty string'});
        }
      });
      if (sc.marks.length > 0 && !passageText.trim()) {
        issues.push({
          path: `${at}.text`,
          message: 'a passage with marks needs non-empty text to locate them in',
        });
      }
    }

    // figure — a still image and the regions (`callouts`) to annotate on it.
    // `image` is a path resolved via staticFile; each callout carries an id, a
    // normalized 0..1 `at` point, a `label`, and an optional `note`.
    if (sc.image !== undefined && (typeof sc.image !== 'string' || !sc.image.trim())) {
      issues.push({path: `${at}.image`, message: 'image must be a non-empty string path'});
    }
    if (sc.callouts !== undefined && !Array.isArray(sc.callouts)) {
      issues.push({path: `${at}.callouts`, message: 'callouts must be an array'});
    } else if (Array.isArray(sc.callouts)) {
      const calloutIds = new Set<string>();
      sc.callouts.forEach((c: Record<string, any>, k: number) => {
        const cAt = `${at}.callouts[${k}]`;
        if (!c || typeof c !== 'object') {
          issues.push({path: cAt, message: 'callout must be an object {id, at, label, note?}'});
          return;
        }
        if (typeof c.id !== 'string' || !c.id.trim()) {
          issues.push({path: `${cAt}.id`, message: 'missing or empty string'});
        } else if (calloutIds.has(c.id)) {
          issues.push({path: `${cAt}.id`, message: `duplicate callout id "${c.id}"`});
        } else {
          calloutIds.add(c.id);
        }
        if (typeof c.label !== 'string' || !c.label.trim()) {
          issues.push({path: `${cAt}.label`, message: 'missing or empty string'});
        }
        if (c.note !== undefined && (typeof c.note !== 'string' || !c.note.trim())) {
          issues.push({path: `${cAt}.note`, message: 'note must be a non-empty string when present'});
        }
        if (
          !Array.isArray(c.at) ||
          c.at.length !== 2 ||
          !c.at.every(
            (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1,
          )
        ) {
          issues.push({
            path: `${cAt}.at`,
            message: 'at must be a normalized [x, y] pair, each in 0..1',
          });
        }
      });
    }

    // prior-art — the AR placement scene. 2-4 prior systems (columns), 2-4
    // trade-off dimensions (rows), one cell per (system, dimension) pair, and
    // one named novelty. The HARD-FAIL contracts are:
    //   - orphan cells (cells that reference a missing system or dimension)
    //   - a system with no `diverges` cell (it isn't prior art, it *is* the
    //     subject — the table makes no claim against it)
    //   - novelty.dimension must reference a real dimension id
    // The AR position contract — that exactly one prior-art scene sits between
    // frame and the first structure — is enforced at the film level below.
    if (sc.type === 'prior-art') {
      // systems
      const systemIds = new Set<string>();
      if (!Array.isArray(sc.systems) || sc.systems.length < 2 || sc.systems.length > 4) {
        issues.push({
          path: `${at}.systems`,
          message: 'prior-art requires 2-4 systems (the columns of the comparison)',
        });
      } else {
        sc.systems.forEach((p: Record<string, any>, k: number) => {
          const pAt = `${at}.systems[${k}]`;
          if (!p || typeof p !== 'object') {
            issues.push({path: pAt, message: 'system must be an object {id, label, sub?, year?}'});
            return;
          }
          if (typeof p.id !== 'string' || !p.id.trim()) {
            issues.push({path: `${pAt}.id`, message: 'missing or empty string'});
          } else if (systemIds.has(p.id)) {
            issues.push({path: `${pAt}.id`, message: `duplicate system id "${p.id}"`});
          } else {
            systemIds.add(p.id);
          }
          if (typeof p.label !== 'string' || !p.label.trim()) {
            issues.push({path: `${pAt}.label`, message: 'missing or empty string'});
          }
          if (p.sub !== undefined && (typeof p.sub !== 'string' || !p.sub.trim())) {
            issues.push({path: `${pAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
          if (p.year !== undefined && (typeof p.year !== 'string' || !p.year.trim())) {
            issues.push({path: `${pAt}.year`, message: 'year must be a non-empty string when present'});
          }
        });
      }
      // dimensions
      const dimensionIds = new Set<string>();
      if (!Array.isArray(sc.dimensions) || sc.dimensions.length < 2 || sc.dimensions.length > 4) {
        issues.push({
          path: `${at}.dimensions`,
          message: 'prior-art requires 2-4 dimensions (the rows of the comparison)',
        });
      } else {
        sc.dimensions.forEach((d: Record<string, any>, k: number) => {
          const dAt = `${at}.dimensions[${k}]`;
          if (!d || typeof d !== 'object') {
            issues.push({path: dAt, message: 'dimension must be an object {id, label}'});
            return;
          }
          if (typeof d.id !== 'string' || !d.id.trim()) {
            issues.push({path: `${dAt}.id`, message: 'missing or empty string'});
          } else if (dimensionIds.has(d.id)) {
            issues.push({path: `${dAt}.id`, message: `duplicate dimension id "${d.id}"`});
          } else {
            dimensionIds.add(d.id);
          }
          if (typeof d.label !== 'string' || !d.label.trim()) {
            issues.push({path: `${dAt}.label`, message: 'missing or empty string'});
          }
        });
      }
      // cells — every cell must reference a real (system, dimension) pair.
      const divergesBySystem = new Map<string, number>();
      if (sc.cells === undefined || !Array.isArray(sc.cells)) {
        issues.push({path: `${at}.cells`, message: 'prior-art requires a cells array'});
      } else {
        sc.cells.forEach((c: Record<string, any>, k: number) => {
          const cAt = `${at}.cells[${k}]`;
          if (!c || typeof c !== 'object') {
            issues.push({path: cAt, message: 'cell must be an object {system, dimension, mark, note}'});
            return;
          }
          if (typeof c.system !== 'string' || !c.system.trim()) {
            issues.push({path: `${cAt}.system`, message: 'missing or empty system id'});
          } else if (!systemIds.has(c.system)) {
            issues.push({
              path: `${cAt}.system`,
              message: `orphan cell — system "${c.system}" is not a system in this scene`,
            });
          }
          if (typeof c.dimension !== 'string' || !c.dimension.trim()) {
            issues.push({path: `${cAt}.dimension`, message: 'missing or empty dimension id'});
          } else if (!dimensionIds.has(c.dimension)) {
            issues.push({
              path: `${cAt}.dimension`,
              message: `orphan cell — dimension "${c.dimension}" is not a dimension in this scene`,
            });
          }
          if (c.mark !== 'same' && c.mark !== 'diverges') {
            issues.push({
              path: `${cAt}.mark`,
              message: 'mark must be "same" or "diverges"',
            });
          }
          if (typeof c.note !== 'string' || !c.note.trim()) {
            issues.push({path: `${cAt}.note`, message: 'missing or empty string'});
          }
          if (c.mark === 'diverges' && typeof c.system === 'string') {
            divergesBySystem.set(c.system, (divergesBySystem.get(c.system) ?? 0) + 1);
          }
        });
      }
      // Every system needs at least one `diverges` cell — a system that's
      // "same" on every dimension isn't prior art, it's the same system. The
      // table would make no claim against it.
      for (const sid of systemIds) {
        if ((divergesBySystem.get(sid) ?? 0) === 0) {
          issues.push({
            path: `${at}.cells`,
            message: `system "${sid}" has no diverges cell — a prior system that's "same" on every dimension is the same system, not prior art`,
          });
        }
      }
      // novelty — the prior-art variant. `kind: 'prior-art'` is the
      // discriminator that narrows `Scene.novelty` from the widened
      // `PriorArtNovelty | VennNovelty` union at the renderer.
      if (!sc.novelty || typeof sc.novelty !== 'object') {
        issues.push({path: `${at}.novelty`, message: 'prior-art requires a novelty {kind: "prior-art", dimension, statement}'});
      } else {
        if (sc.novelty.kind !== 'prior-art') {
          issues.push({
            path: `${at}.novelty.kind`,
            message: 'prior-art scene requires `novelty.kind: "prior-art"` (the discriminator that narrows the union)',
          });
        }
        if (typeof sc.novelty.dimension !== 'string' || !sc.novelty.dimension.trim()) {
          issues.push({path: `${at}.novelty.dimension`, message: 'missing or empty dimension id'});
        } else if (!dimensionIds.has(sc.novelty.dimension)) {
          issues.push({
            path: `${at}.novelty.dimension`,
            message: `novelty references dimension "${sc.novelty.dimension}", which is not a dimension in this scene`,
          });
        }
        if (typeof sc.novelty.statement !== 'string' || !sc.novelty.statement.trim()) {
          issues.push({path: `${at}.novelty.statement`, message: 'missing or empty statement'});
        }
      }
    }

    // venn — overlap analysis. 2 or 3 named sets, every region (each (in, out)
    // combination of the sets, except the implicit "outside all") is
    // addressable by a stable id beats reveal/focus, and exactly one named
    // novelty whose `regionId` references the dangerous intersection. The
    // HARD-FAIL contracts are:
    //   - `sets` must have 2 or 3 entries (a 1-circle Venn is not a Venn; a
    //     4+ Venn does not have a clean planar layout).
    //   - every region's `in` must reference real set ids in `sets`.
    //   - every region's `in` must be NON-EMPTY (the outside-all region is
    //     not addressable: a film does not argue about what lies outside
    //     every set).
    //   - `novelty.regionId` must reference a real region in `regions`.
    if (sc.type === 'venn') {
      const setIds = new Set<string>();
      if (!Array.isArray(sc.sets) || sc.sets.length < 2 || sc.sets.length > 3) {
        issues.push({
          path: `${at}.sets`,
          message: 'venn requires 2 or 3 sets (the circles of the diagram)',
        });
      } else {
        sc.sets.forEach((p: Record<string, any>, k: number) => {
          const pAt = `${at}.sets[${k}]`;
          if (!p || typeof p !== 'object') {
            issues.push({path: pAt, message: 'set must be an object {id, label, sub?}'});
            return;
          }
          if (typeof p.id !== 'string' || !p.id.trim()) {
            issues.push({path: `${pAt}.id`, message: 'missing or empty string'});
          } else if (setIds.has(p.id)) {
            issues.push({path: `${pAt}.id`, message: `duplicate set id "${p.id}"`});
          } else {
            setIds.add(p.id);
          }
          if (typeof p.label !== 'string' || !p.label.trim()) {
            issues.push({path: `${pAt}.label`, message: 'missing or empty string'});
          }
          if (p.sub !== undefined && (typeof p.sub !== 'string' || !p.sub.trim())) {
            issues.push({path: `${pAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
        });
      }
      // regions — each must reference real set ids in `in`, and `in` must be
      // non-empty (the outside-all region is not addressable).
      const regionIds = new Set<string>();
      if (sc.regions === undefined || !Array.isArray(sc.regions)) {
        issues.push({path: `${at}.regions`, message: 'venn requires a regions array (the addressable zones)'});
      } else {
        sc.regions.forEach((r: Record<string, any>, k: number) => {
          const rAt = `${at}.regions[${k}]`;
          if (!r || typeof r !== 'object') {
            issues.push({path: rAt, message: 'region must be an object {id, in, label?, note?}'});
            return;
          }
          if (typeof r.id !== 'string' || !r.id.trim()) {
            issues.push({path: `${rAt}.id`, message: 'missing or empty string'});
          } else if (regionIds.has(r.id)) {
            issues.push({path: `${rAt}.id`, message: `duplicate region id "${r.id}"`});
          } else {
            regionIds.add(r.id);
          }
          if (!Array.isArray(r.in) || r.in.length === 0) {
            issues.push({
              path: `${rAt}.in`,
              message: 'in must be a non-empty array of set ids — the implicit "outside all" region is not addressable',
            });
          } else {
            r.in.forEach((sid: any, ii: number) => {
              if (typeof sid !== 'string' || !sid.trim()) {
                issues.push({path: `${rAt}.in[${ii}]`, message: 'must be a set id'});
              } else if (!setIds.has(sid)) {
                issues.push({
                  path: `${rAt}.in[${ii}]`,
                  message: `region references set "${sid}", which is not a set in this scene`,
                });
              }
            });
          }
          if (r.label !== undefined && (typeof r.label !== 'string' || !r.label.trim())) {
            issues.push({path: `${rAt}.label`, message: 'label must be a non-empty string when present'});
          }
          if (r.note !== undefined && (typeof r.note !== 'string' || !r.note.trim())) {
            issues.push({path: `${rAt}.note`, message: 'note must be a non-empty string when present'});
          }
        });
      }
      // novelty — the dangerous intersection. Must reference a real region.
      // `kind: 'venn'` is the discriminator that narrows `Scene.novelty` from
      // the widened `PriorArtNovelty | VennNovelty` union at the renderer.
      if (!sc.novelty || typeof sc.novelty !== 'object') {
        issues.push({path: `${at}.novelty`, message: 'venn requires a novelty {kind: "venn", regionId, claim} — the intersection the film argues from'});
      } else {
        const nv = sc.novelty as Record<string, any>;
        if (nv.kind !== 'venn') {
          issues.push({
            path: `${at}.novelty.kind`,
            message: 'venn scene requires `novelty.kind: "venn"` (the discriminator that narrows the union)',
          });
        }
        if (typeof nv.regionId !== 'string' || !nv.regionId.trim()) {
          issues.push({path: `${at}.novelty.regionId`, message: 'missing or empty region id'});
        } else if (!regionIds.has(nv.regionId)) {
          issues.push({
            path: `${at}.novelty.regionId`,
            message: `novelty references region "${nv.regionId}", which is not a region in this scene`,
          });
        }
        if (typeof nv.claim !== 'string' || !nv.claim.trim()) {
          issues.push({path: `${at}.novelty.claim`, message: 'missing or empty claim'});
        }
      }
    }

    // big-idea — the takeaway scene. Non-empty statement; optional anchor
    // with a valid kind. Position/uniqueness enforced film-wide below.
    if (sc.type === 'big-idea') {
      if (typeof sc.statement !== 'string' || !sc.statement.trim()) {
        issues.push({
          path: `${at}.statement`,
          message: 'a big-idea scene requires a non-empty statement (the sentence the viewer leaves with)',
        });
      }
      if (sc.anchor !== undefined) {
        if (!sc.anchor || typeof sc.anchor !== 'object' || Array.isArray(sc.anchor)) {
          issues.push({path: `${at}.anchor`, message: 'anchor must be an object {kind, value}'});
        } else {
          if (!BIG_IDEA_ANCHOR_KINDS.includes(sc.anchor.kind)) {
            issues.push({
              path: `${at}.anchor.kind`,
              message: `not a valid anchor kind — one of: ${BIG_IDEA_ANCHOR_KINDS.join(', ')}`,
            });
          }
          if (typeof sc.anchor.value !== 'string' || !sc.anchor.value.trim()) {
            issues.push({path: `${at}.anchor.value`, message: 'anchor.value must be a non-empty string'});
          }
        }
      }
    } else {
      if (sc.statement !== undefined) {
        issues.push({path: `${at}.statement`, message: `statement has no meaning for type "${sc.type}" — only big-idea`});
      }
      if (sc.anchor !== undefined) {
        issues.push({path: `${at}.anchor`, message: `anchor has no meaning for type "${sc.type}" — only big-idea`});
      }
    }

    // timeline — events plotted on a real date axis. The HARD-FAIL contracts:
    //   - axis.start, axis.end parse as dates; end > start
    //   - every event's date parses, lies in [start, end]
    //   - every span's from/to parse, from <= to, both in [start, end]
    //   - event/span ids unique within the scene
    //   - axis.ticks (if present) each parse as dates
    // Phrases like "early 2024" or "during the war" fail the date parser —
    // the time axis is load-bearing, the dates must be real.
    if (sc.type === 'timeline') {
      let axisStartMs: number | null = null;
      let axisEndMs: number | null = null;
      if (!sc.axis || typeof sc.axis !== 'object' || Array.isArray(sc.axis)) {
        issues.push({path: `${at}.axis`, message: 'timeline requires an axis {start, end, ticks?}'});
      } else {
        if (typeof sc.axis.start !== 'string' || !sc.axis.start.trim()) {
          issues.push({path: `${at}.axis.start`, message: 'missing or empty start date'});
        } else {
          axisStartMs = parseTimelineDate(sc.axis.start);
          if (axisStartMs === null) {
            issues.push({
              path: `${at}.axis.start`,
              message: `axis.start "${sc.axis.start}" is not a parseable date — use ISO "YYYY-MM-DD", month-year "Jun 2025" / "2025-06", or year-only "1914"`,
            });
          }
        }
        if (typeof sc.axis.end !== 'string' || !sc.axis.end.trim()) {
          issues.push({path: `${at}.axis.end`, message: 'missing or empty end date'});
        } else {
          axisEndMs = parseTimelineDate(sc.axis.end);
          if (axisEndMs === null) {
            issues.push({
              path: `${at}.axis.end`,
              message: `axis.end "${sc.axis.end}" is not a parseable date — use ISO "YYYY-MM-DD", month-year "Jun 2025" / "2025-06", or year-only "1914"`,
            });
          }
        }
        if (axisStartMs !== null && axisEndMs !== null && axisEndMs <= axisStartMs) {
          issues.push({
            path: `${at}.axis.end`,
            message: `axis.end (${sc.axis.end}) must lie strictly after axis.start (${sc.axis.start})`,
          });
        }
        if (sc.axis.ticks !== undefined) {
          if (!Array.isArray(sc.axis.ticks)) {
            issues.push({path: `${at}.axis.ticks`, message: 'ticks must be an array of date strings'});
          } else {
            sc.axis.ticks.forEach((tk: unknown, ti: number) => {
              if (typeof tk !== 'string' || !tk.trim()) {
                issues.push({path: `${at}.axis.ticks[${ti}]`, message: 'tick must be a non-empty date string'});
                return;
              }
              const ms = parseTimelineDate(tk);
              if (ms === null) {
                issues.push({
                  path: `${at}.axis.ticks[${ti}]`,
                  message: `tick "${tk}" is not a parseable date`,
                });
              } else if (axisStartMs !== null && axisEndMs !== null && (ms < axisStartMs || ms > axisEndMs)) {
                issues.push({
                  path: `${at}.axis.ticks[${ti}]`,
                  message: `tick "${tk}" falls outside the axis [${sc.axis.start}, ${sc.axis.end}]`,
                });
              }
            });
          }
        }
      }

      const tlIds = new Set<string>();
      // events
      if (sc.events !== undefined && !Array.isArray(sc.events)) {
        issues.push({path: `${at}.events`, message: 'events must be an array'});
      } else if (Array.isArray(sc.events)) {
        sc.events.forEach((e: Record<string, any>, k: number) => {
          const eAt = `${at}.events[${k}]`;
          if (!e || typeof e !== 'object') {
            issues.push({path: eAt, message: 'event must be an object {id, date, label, sub?, lane?}'});
            return;
          }
          if (typeof e.id !== 'string' || !e.id.trim()) {
            issues.push({path: `${eAt}.id`, message: 'missing or empty string'});
          } else if (tlIds.has(e.id)) {
            issues.push({path: `${eAt}.id`, message: `duplicate timeline id "${e.id}"`});
          } else {
            tlIds.add(e.id);
          }
          if (typeof e.label !== 'string' || !e.label.trim()) {
            issues.push({path: `${eAt}.label`, message: 'missing or empty string'});
          }
          if (e.sub !== undefined && (typeof e.sub !== 'string' || !e.sub.trim())) {
            issues.push({path: `${eAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
          if (e.lane !== undefined && (typeof e.lane !== 'number' || !Number.isInteger(e.lane) || e.lane < 0)) {
            issues.push({path: `${eAt}.lane`, message: 'lane must be a non-negative integer'});
          }
          if (typeof e.date !== 'string' || !e.date.trim()) {
            issues.push({path: `${eAt}.date`, message: 'missing or empty date string'});
          } else {
            const ms = parseTimelineDate(e.date);
            if (ms === null) {
              issues.push({
                path: `${eAt}.date`,
                message: `date "${e.date}" is not parseable — phrases like "early 2024" or "during the war" are rejected; use a real date`,
              });
            } else if (axisStartMs !== null && axisEndMs !== null && (ms < axisStartMs || ms > axisEndMs)) {
              issues.push({
                path: `${eAt}.date`,
                message: `event date "${e.date}" falls outside the axis [${sc.axis?.start}, ${sc.axis?.end}]`,
              });
            }
          }
        });
      }

      // spans
      if (sc.spans !== undefined && !Array.isArray(sc.spans)) {
        issues.push({path: `${at}.spans`, message: 'spans must be an array'});
      } else if (Array.isArray(sc.spans)) {
        sc.spans.forEach((sp: Record<string, any>, k: number) => {
          const sAt = `${at}.spans[${k}]`;
          if (!sp || typeof sp !== 'object') {
            issues.push({path: sAt, message: 'span must be an object {id, from, to, label, lane?}'});
            return;
          }
          if (typeof sp.id !== 'string' || !sp.id.trim()) {
            issues.push({path: `${sAt}.id`, message: 'missing or empty string'});
          } else if (tlIds.has(sp.id)) {
            issues.push({path: `${sAt}.id`, message: `duplicate timeline id "${sp.id}"`});
          } else {
            tlIds.add(sp.id);
          }
          if (typeof sp.label !== 'string' || !sp.label.trim()) {
            issues.push({path: `${sAt}.label`, message: 'missing or empty string'});
          }
          if (sp.lane !== undefined && (typeof sp.lane !== 'number' || !Number.isInteger(sp.lane) || sp.lane < 0)) {
            issues.push({path: `${sAt}.lane`, message: 'lane must be a non-negative integer'});
          }
          let fMs: number | null = null;
          let tMs: number | null = null;
          if (typeof sp.from !== 'string' || !sp.from.trim()) {
            issues.push({path: `${sAt}.from`, message: 'missing or empty from date'});
          } else {
            fMs = parseTimelineDate(sp.from);
            if (fMs === null) {
              issues.push({
                path: `${sAt}.from`,
                message: `from "${sp.from}" is not a parseable date`,
              });
            } else if (axisStartMs !== null && axisEndMs !== null && (fMs < axisStartMs || fMs > axisEndMs)) {
              issues.push({
                path: `${sAt}.from`,
                message: `span.from "${sp.from}" falls outside the axis [${sc.axis?.start}, ${sc.axis?.end}]`,
              });
            }
          }
          if (typeof sp.to !== 'string' || !sp.to.trim()) {
            issues.push({path: `${sAt}.to`, message: 'missing or empty to date'});
          } else {
            tMs = parseTimelineDate(sp.to);
            if (tMs === null) {
              issues.push({
                path: `${sAt}.to`,
                message: `to "${sp.to}" is not a parseable date`,
              });
            } else if (axisStartMs !== null && axisEndMs !== null && (tMs < axisStartMs || tMs > axisEndMs)) {
              issues.push({
                path: `${sAt}.to`,
                message: `span.to "${sp.to}" falls outside the axis [${sc.axis?.start}, ${sc.axis?.end}]`,
              });
            }
          }
          if (fMs !== null && tMs !== null && fMs > tMs) {
            issues.push({
              path: `${sAt}.to`,
              message: `span.to (${sp.to}) must be on or after span.from (${sp.from})`,
            });
          }
        });
      }
    } else {
      if (sc.axis !== undefined) {
        issues.push({path: `${at}.axis`, message: `axis has no meaning for type "${sc.type}" — only timeline (chart uses xAxis/yAxis)`});
      }
      if (sc.events !== undefined) {
        issues.push({path: `${at}.events`, message: `events has no meaning for type "${sc.type}" — only timeline`});
      }
      if (sc.spans !== undefined) {
        issues.push({path: `${at}.spans`, message: `spans has no meaning for type "${sc.type}" — only timeline`});
      }
    }

    // tree — a rooted hierarchy. HARD FAILS:
    //   - `root.id` is not a string
    //   - any two tree nodes share an id (walking the tree)
    //   - the tree is deeper than TREE_MAX_DEPTH (renderer can't fit it)
    //   - the tree carries more than TREE_MAX_NODES nodes total
    //   - `orientation` is not a closed-enum value
    // `root` itself being absent is caught by the requiredBody check below; this
    // block runs only when `root` is present, and validates the shape.
    if (sc.type === 'tree') {
      if (sc.orientation !== undefined && sc.orientation !== 'vertical' && sc.orientation !== 'horizontal') {
        issues.push({
          path: `${at}.orientation`,
          message: 'orientation must be "vertical" or "horizontal"',
        });
      }
      if (sc.root !== undefined) {
        if (!sc.root || typeof sc.root !== 'object' || Array.isArray(sc.root)) {
          issues.push({path: `${at}.root`, message: 'root must be a tree-node object {id, label, children?}'});
        } else {
          const treeIds = new Set<string>();
          let nodeCount = 0;
          let depthOverflow = false;
          let nodeOverflow = false;
          const walk = (n: Record<string, any>, path: string, depth: number): void => {
            nodeCount++;
            if (nodeCount > TREE_MAX_NODES && !nodeOverflow) {
              issues.push({
                path: `${at}.root`,
                message: `tree exceeds ${TREE_MAX_NODES} nodes — the breadth axis goes thinner than label width past that`,
              });
              nodeOverflow = true;
            }
            if (depth > TREE_MAX_DEPTH - 1) {
              // depth is 0-based; TREE_MAX_DEPTH counts levels (root is level 1).
              if (!depthOverflow) {
                issues.push({
                  path,
                  message: `tree exceeds ${TREE_MAX_DEPTH} levels — the renderer's boxes shrink past legibility past that`,
                });
                depthOverflow = true;
              }
            }
            if (typeof n.id !== 'string' || !n.id.trim()) {
              issues.push({path: `${path}.id`, message: 'tree-node id must be a non-empty string'});
            } else if (treeIds.has(n.id)) {
              issues.push({path: `${path}.id`, message: `duplicate tree-node id "${n.id}" — every id must be unique across the tree`});
            } else {
              treeIds.add(n.id);
            }
            if (typeof n.label !== 'string' || !n.label.trim()) {
              issues.push({path: `${path}.label`, message: 'tree-node label must be a non-empty string'});
            }
            if (n.sub !== undefined && (typeof n.sub !== 'string' || !n.sub.trim())) {
              issues.push({path: `${path}.sub`, message: 'sub must be a non-empty string when present'});
            }
            if (n.accent !== undefined && !ACCENTS.includes(n.accent)) {
              issues.push({path: `${path}.accent`, message: `unknown accent "${n.accent}"`});
            }
            if (n.children !== undefined) {
              if (!Array.isArray(n.children)) {
                issues.push({path: `${path}.children`, message: 'children must be an array of tree-nodes'});
              } else {
                n.children.forEach((c: any, k: number) => {
                  if (!c || typeof c !== 'object' || Array.isArray(c)) {
                    issues.push({path: `${path}.children[${k}]`, message: 'tree-node must be an object {id, label, children?}'});
                    return;
                  }
                  walk(c, `${path}.children[${k}]`, depth + 1);
                });
              }
            }
          };
          walk(sc.root as Record<string, any>, `${at}.root`, 0);
        }
      }
    } else {
      // tree-specific fields have no meaning on other scene types.
      if (sc.root !== undefined) {
        issues.push({path: `${at}.root`, message: `root has no meaning for type "${sc.type}" — only tree`});
      }
      if (sc.orientation !== undefined) {
        issues.push({path: `${at}.orientation`, message: `orientation has no meaning for type "${sc.type}" — only tree`});
      }
    }

    // map — a spatial / topological layout. 2-12 regions; markers must point
    // at a real region; connection from/to must point at real regions; grid
    // layout requires gridSize.
    if (sc.type === 'map') {
      const layout = sc.layout ?? 'topology';
      if (layout !== 'topology' && layout !== 'grid') {
        issues.push({
          path: `${at}.layout`,
          message: `not a valid layout — one of: topology, grid`,
        });
      }
      const regionIds = new Set<string>();
      if (!Array.isArray(sc.regions) || sc.regions.length < 2) {
        issues.push({
          path: `${at}.regions`,
          message: 'map requires at least 2 regions (position carries information)',
        });
      } else if (sc.regions.length > 12) {
        issues.push({
          path: `${at}.regions`,
          message: `${sc.regions.length} regions is past the legibility cap — keep to 12 or fewer`,
        });
      } else {
        sc.regions.forEach((r: Record<string, any>, k: number) => {
          const rAt = `${at}.regions[${k}]`;
          if (!r || typeof r !== 'object') {
            issues.push({path: rAt, message: 'region must be an object {id, label, pos, sub?}'});
            return;
          }
          if (typeof r.id !== 'string' || !r.id.trim()) {
            issues.push({path: `${rAt}.id`, message: 'missing or empty string'});
          } else if (regionIds.has(r.id)) {
            issues.push({path: `${rAt}.id`, message: `duplicate region id "${r.id}"`});
          } else {
            regionIds.add(r.id);
          }
          if (typeof r.label !== 'string' || !r.label.trim()) {
            issues.push({path: `${rAt}.label`, message: 'missing or empty string'});
          }
          if (r.sub !== undefined && (typeof r.sub !== 'string' || !r.sub.trim())) {
            issues.push({path: `${rAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
          if (!r.pos || typeof r.pos !== 'object') {
            issues.push({path: `${rAt}.pos`, message: 'pos must be an object {x, y, w?, h?}'});
          } else {
            for (const f of ['x', 'y']) {
              if (typeof r.pos[f] !== 'number' || !Number.isFinite(r.pos[f])) {
                issues.push({path: `${rAt}.pos.${f}`, message: 'must be a finite number'});
              }
            }
            if (layout === 'topology') {
              for (const f of ['x', 'y']) {
                if (typeof r.pos[f] === 'number' && (r.pos[f] < 0 || r.pos[f] > 1)) {
                  issues.push({
                    path: `${rAt}.pos.${f}`,
                    message: 'topology positions must be normalized in 0..1',
                  });
                }
              }
              for (const f of ['w', 'h']) {
                if (r.pos[f] !== undefined) {
                  if (typeof r.pos[f] !== 'number' || !Number.isFinite(r.pos[f])) {
                    issues.push({path: `${rAt}.pos.${f}`, message: 'must be a finite number'});
                  } else if (r.pos[f] <= 0 || r.pos[f] > 1) {
                    issues.push({
                      path: `${rAt}.pos.${f}`,
                      message: 'topology sizes must be in (0..1]',
                    });
                  }
                }
              }
            } else {
              // grid — integer cell coords
              for (const f of ['x', 'y']) {
                if (typeof r.pos[f] === 'number' && !Number.isInteger(r.pos[f])) {
                  issues.push({
                    path: `${rAt}.pos.${f}`,
                    message: 'grid layout positions must be integers (col / row)',
                  });
                }
              }
            }
          }
        });
      }
      // gridSize required when layout is `grid`.
      if (layout === 'grid') {
        if (
          !sc.gridSize ||
          typeof sc.gridSize !== 'object' ||
          typeof sc.gridSize.cols !== 'number' ||
          typeof sc.gridSize.rows !== 'number' ||
          !Number.isInteger(sc.gridSize.cols) ||
          !Number.isInteger(sc.gridSize.rows) ||
          sc.gridSize.cols < 1 ||
          sc.gridSize.rows < 1
        ) {
          issues.push({
            path: `${at}.gridSize`,
            message: 'layout: "grid" requires gridSize {cols, rows} of positive integers',
          });
        } else if (Array.isArray(sc.regions)) {
          // Validate every region's grid pos sits inside the gridSize.
          sc.regions.forEach((r: Record<string, any>, k: number) => {
            if (!r?.pos) return;
            if (
              typeof r.pos.x === 'number' &&
              (r.pos.x < 0 || r.pos.x >= sc.gridSize.cols)
            ) {
              issues.push({
                path: `${at}.regions[${k}].pos.x`,
                message: `col ${r.pos.x} is outside the ${sc.gridSize.cols}-column grid`,
              });
            }
            if (
              typeof r.pos.y === 'number' &&
              (r.pos.y < 0 || r.pos.y >= sc.gridSize.rows)
            ) {
              issues.push({
                path: `${at}.regions[${k}].pos.y`,
                message: `row ${r.pos.y} is outside the ${sc.gridSize.rows}-row grid`,
              });
            }
          });
        }
      } else if (sc.gridSize !== undefined) {
        issues.push({
          path: `${at}.gridSize`,
          message: 'gridSize has meaning only when layout is "grid"',
        });
      }
      // markers — `at` must reference a real region id.
      if (sc.markers !== undefined && !Array.isArray(sc.markers)) {
        issues.push({path: `${at}.markers`, message: 'markers must be an array'});
      } else if (Array.isArray(sc.markers)) {
        const markerIds = new Set<string>();
        sc.markers.forEach((m: Record<string, any>, k: number) => {
          const mAt = `${at}.markers[${k}]`;
          if (!m || typeof m !== 'object') {
            issues.push({path: mAt, message: 'marker must be an object {id, at, label, kind?}'});
            return;
          }
          if (typeof m.id !== 'string' || !m.id.trim()) {
            issues.push({path: `${mAt}.id`, message: 'missing or empty string'});
          } else if (markerIds.has(m.id)) {
            issues.push({path: `${mAt}.id`, message: `duplicate marker id "${m.id}"`});
          } else {
            markerIds.add(m.id);
          }
          if (typeof m.at !== 'string' || !m.at.trim()) {
            issues.push({path: `${mAt}.at`, message: 'missing region id'});
          } else if (regionIds.size > 0 && !regionIds.has(m.at)) {
            issues.push({
              path: `${mAt}.at`,
              message: `marker "at" references "${m.at}", which is not a region in this scene`,
            });
          }
          if (typeof m.label !== 'string' || !m.label.trim()) {
            issues.push({path: `${mAt}.label`, message: 'missing or empty string'});
          }
          if (m.kind !== undefined && !['pin', 'dot', 'flag'].includes(m.kind)) {
            issues.push({
              path: `${mAt}.kind`,
              message: 'not a valid kind — one of: pin, dot, flag',
            });
          }
        });
      }
      // connections — from / to must reference real region ids.
      if (sc.connections !== undefined && !Array.isArray(sc.connections)) {
        issues.push({path: `${at}.connections`, message: 'connections must be an array'});
      } else if (Array.isArray(sc.connections)) {
        const connIds = new Set<string>();
        sc.connections.forEach((c: Record<string, any>, k: number) => {
          const cAt = `${at}.connections[${k}]`;
          if (!c || typeof c !== 'object') {
            issues.push({path: cAt, message: 'connection must be an object {id, from, to, label?, kind?}'});
            return;
          }
          if (typeof c.id !== 'string' || !c.id.trim()) {
            issues.push({path: `${cAt}.id`, message: 'missing or empty string'});
          } else if (connIds.has(c.id)) {
            issues.push({path: `${cAt}.id`, message: `duplicate connection id "${c.id}"`});
          } else {
            connIds.add(c.id);
          }
          for (const f of ['from', 'to']) {
            if (typeof c[f] !== 'string' || !c[f].trim()) {
              issues.push({path: `${cAt}.${f}`, message: 'missing region id'});
            } else if (regionIds.size > 0 && !regionIds.has(c[f])) {
              issues.push({
                path: `${cAt}.${f}`,
                message: `connection "${f}" references "${c[f]}", which is not a region in this scene`,
              });
            }
          }
          if (c.kind !== undefined && !['route', 'transmission', 'supply'].includes(c.kind)) {
            issues.push({
              path: `${cAt}.kind`,
              message: 'not a valid kind — one of: route, transmission, supply',
            });
          }
        });
      }
    } else {
      // map-specific fields have no meaning on other scene types. `regions`
      // is shared with venn scenes (validated by the venn block above), so
      // it is exempted from this rejection when the scene is a venn.
      if (sc.layout !== undefined) {
        issues.push({path: `${at}.layout`, message: `layout has no meaning for type "${sc.type}" — only map`});
      }
      if (sc.gridSize !== undefined) {
        issues.push({path: `${at}.gridSize`, message: `gridSize has no meaning for type "${sc.type}" — only map`});
      }
      if (sc.regions !== undefined && sc.type !== 'venn') {
        issues.push({path: `${at}.regions`, message: `regions has no meaning for type "${sc.type}" — only map or venn`});
      }
      if (sc.markers !== undefined) {
        issues.push({path: `${at}.markers`, message: `markers has no meaning for type "${sc.type}" — only map`});
      }
      if (sc.connections !== undefined) {
        issues.push({path: `${at}.connections`, message: `connections has no meaning for type "${sc.type}" — only map`});
      }
    }

    // journey-map — a person's emotional arc across 3-8 stages. HARD-FAIL
    // contracts: 3-8 stages; each stage's `curveValue` in [0..1]; stage ids
    // unique; `emotion` from the JourneyEmotion enum. The journey-map is the
    // UX/service-design primitive — without these guarantees the curve
    // cannot draw and the chips have no colour. journeyStages must NOT
    // appear on any other scene type (it would be a force-fit).
    if (sc.type === 'journey-map') {
      if (!Array.isArray(sc.journeyStages)) {
        issues.push({
          path: `${at}.journeyStages`,
          message: 'journey-map requires a journeyStages array (3-8 stages along the journey)',
        });
      } else {
        if (sc.journeyStages.length < 3 || sc.journeyStages.length > 8) {
          issues.push({
            path: `${at}.journeyStages`,
            message: `journey-map requires 3-8 stages — ${sc.journeyStages.length} is ${sc.journeyStages.length < 3 ? 'too few (the arc has no shape)' : 'too many (the journey ceases to read)'}`,
          });
        }
        const stageIds = new Set<string>();
        sc.journeyStages.forEach((js: Record<string, any>, k: number) => {
          const jAt = `${at}.journeyStages[${k}]`;
          if (!js || typeof js !== 'object') {
            issues.push({path: jAt, message: 'journey stage must be an object {id, label, emotion, curveValue, ...}'});
            return;
          }
          if (typeof js.id !== 'string' || !js.id.trim()) {
            issues.push({path: `${jAt}.id`, message: 'missing or empty string'});
          } else if (stageIds.has(js.id)) {
            issues.push({path: `${jAt}.id`, message: `duplicate journey stage id "${js.id}"`});
          } else {
            stageIds.add(js.id);
          }
          if (typeof js.label !== 'string' || !js.label.trim()) {
            issues.push({path: `${jAt}.label`, message: 'missing or empty string'});
          }
          if (js.sub !== undefined && (typeof js.sub !== 'string' || !js.sub.trim())) {
            issues.push({path: `${jAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
          if (typeof js.emotion !== 'string' || !JOURNEY_EMOTIONS.includes(js.emotion)) {
            issues.push({
              path: `${jAt}.emotion`,
              message: `not a valid emotion — one of: ${JOURNEY_EMOTIONS.join(', ')}`,
            });
          }
          if (
            typeof js.curveValue !== 'number' ||
            !Number.isFinite(js.curveValue) ||
            js.curveValue < 0 ||
            js.curveValue > 1
          ) {
            issues.push({
              path: `${jAt}.curveValue`,
              message: 'curveValue must be a number in [0..1] (1 = best emotion, 0 = worst)',
            });
          }
          for (const f of ['touchpoints', 'painPoints'] as const) {
            const v = (js as Record<string, unknown>)[f];
            if (v === undefined) continue;
            if (!Array.isArray(v)) {
              issues.push({path: `${jAt}.${f}`, message: `${f} must be an array of short strings`});
              continue;
            }
            v.forEach((s: unknown, si: number) => {
              if (typeof s !== 'string' || !s.trim()) {
                issues.push({path: `${jAt}.${f}[${si}]`, message: 'must be a non-empty string'});
              }
            });
          }
        });
      }
    } else if (sc.journeyStages !== undefined) {
      issues.push({
        path: `${at}.journeyStages`,
        message: `journeyStages has no meaning for type "${sc.type}" — only journey-map`,
      });
    }

    // causal-loop — feedback diagrams. Variables sit on a ring; directed
    // edges between them carry a polarity glyph (+/-); one or more loops
    // overlay the diagram and are labelled reinforcing (R) or balancing (B).
    //
    // HARD-FAIL contracts:
    //  - 3-8 variables.
    //  - Every causalEdge `from`/`to` references a real variable id.
    //  - Every causalEdge `polarity` is exactly '+' or '-'.
    //  - Every loop's `path` references real variable ids.
    //  - Every consecutive pair in a loop's path (and the wrap last→first)
    //    has a corresponding causal edge.
    //  - Every loop's `kind` matches the parity of '-' edges in its path
    //    (even count → reinforcing R; odd → balancing B). The labelling
    //    cannot lie — the math IS the argument.
    if (sc.type === 'causal-loop') {
      const variableIds = new Set<string>();
      if (!Array.isArray(sc.variables) || sc.variables.length < 3 || sc.variables.length > 8) {
        issues.push({
          path: `${at}.variables`,
          message: 'causal-loop requires 3-8 variables (the nouns of the feedback diagram)',
        });
      } else {
        sc.variables.forEach((v: Record<string, any>, k: number) => {
          const vAt = `${at}.variables[${k}]`;
          if (!v || typeof v !== 'object') {
            issues.push({path: vAt, message: 'variable must be an object {id, label, sub?}'});
            return;
          }
          if (typeof v.id !== 'string' || !v.id.trim()) {
            issues.push({path: `${vAt}.id`, message: 'missing or empty string'});
          } else if (variableIds.has(v.id)) {
            issues.push({path: `${vAt}.id`, message: `duplicate variable id "${v.id}"`});
          } else {
            variableIds.add(v.id);
          }
          if (typeof v.label !== 'string' || !v.label.trim()) {
            issues.push({path: `${vAt}.label`, message: 'missing or empty string'});
          }
          if (v.sub !== undefined && (typeof v.sub !== 'string' || !v.sub.trim())) {
            issues.push({path: `${vAt}.sub`, message: 'sub must be a non-empty string when present'});
          }
        });
      }
      const edgePolarity = new Map<string, '+' | '-'>();
      const causalEdgeIds = new Set<string>();
      if (sc.causalEdges !== undefined && !Array.isArray(sc.causalEdges)) {
        issues.push({path: `${at}.causalEdges`, message: 'causalEdges must be an array'});
      } else if (Array.isArray(sc.causalEdges)) {
        sc.causalEdges.forEach((e: Record<string, any>, k: number) => {
          const eAt = `${at}.causalEdges[${k}]`;
          if (!e || typeof e !== 'object') {
            issues.push({path: eAt, message: 'edge must be an object {id, from, to, polarity}'});
            return;
          }
          if (typeof e.id !== 'string' || !e.id.trim()) {
            issues.push({path: `${eAt}.id`, message: 'missing or empty string'});
          } else if (causalEdgeIds.has(e.id)) {
            issues.push({path: `${eAt}.id`, message: `duplicate edge id "${e.id}"`});
          } else {
            causalEdgeIds.add(e.id);
          }
          let fromOk = false;
          let toOk = false;
          if (typeof e.from !== 'string' || !e.from.trim()) {
            issues.push({path: `${eAt}.from`, message: 'missing variable id'});
          } else if (!variableIds.has(e.from)) {
            issues.push({
              path: `${eAt}.from`,
              message: `edge references variable "${e.from}", which is not a variable in this scene`,
            });
          } else {
            fromOk = true;
          }
          if (typeof e.to !== 'string' || !e.to.trim()) {
            issues.push({path: `${eAt}.to`, message: 'missing variable id'});
          } else if (!variableIds.has(e.to)) {
            issues.push({
              path: `${eAt}.to`,
              message: `edge references variable "${e.to}", which is not a variable in this scene`,
            });
          } else {
            toOk = true;
          }
          if (e.polarity !== '+' && e.polarity !== '-') {
            issues.push({
              path: `${eAt}.polarity`,
              message: 'polarity must be "+" (reinforcing) or "-" (opposing)',
            });
          } else if (fromOk && toOk) {
            edgePolarity.set(`${e.from}->${e.to}`, e.polarity);
          }
          if (e.label !== undefined && (typeof e.label !== 'string' || !e.label.trim())) {
            issues.push({path: `${eAt}.label`, message: 'label must be a non-empty string when present'});
          }
        });
      }
      const loopIds = new Set<string>();
      if (sc.loops !== undefined && !Array.isArray(sc.loops)) {
        issues.push({path: `${at}.loops`, message: 'loops must be an array'});
      } else if (Array.isArray(sc.loops)) {
        sc.loops.forEach((loop: Record<string, any>, k: number) => {
          const lAt = `${at}.loops[${k}]`;
          if (!loop || typeof loop !== 'object') {
            issues.push({path: lAt, message: 'loop must be an object {id, path, kind, label?}'});
            return;
          }
          if (typeof loop.id !== 'string' || !loop.id.trim()) {
            issues.push({path: `${lAt}.id`, message: 'missing or empty string'});
          } else if (loopIds.has(loop.id)) {
            issues.push({path: `${lAt}.id`, message: `duplicate loop id "${loop.id}"`});
          } else {
            loopIds.add(loop.id);
          }
          if (loop.label !== undefined && (typeof loop.label !== 'string' || !loop.label.trim())) {
            issues.push({path: `${lAt}.label`, message: 'label must be a non-empty string when present'});
          }
          if (loop.kind !== 'reinforcing' && loop.kind !== 'balancing') {
            issues.push({path: `${lAt}.kind`, message: 'kind must be "reinforcing" or "balancing"'});
          }
          if (!Array.isArray(loop.path) || loop.path.length < 2) {
            issues.push({path: `${lAt}.path`, message: 'path must be an array of at least 2 variable ids'});
            return;
          }
          let pathOk = true;
          loop.path.forEach((pid: any, pi: number) => {
            if (typeof pid !== 'string' || !pid.trim()) {
              issues.push({path: `${lAt}.path[${pi}]`, message: 'path entry must be a variable id'});
              pathOk = false;
            } else if (!variableIds.has(pid)) {
              issues.push({
                path: `${lAt}.path[${pi}]`,
                message: `path references variable "${pid}", which is not a variable in this scene`,
              });
              pathOk = false;
            }
          });
          if (!pathOk) return;
          let minusCount = 0;
          const pathLen = loop.path.length;
          for (let pi = 0; pi < pathLen; pi++) {
            const from = loop.path[pi];
            const to = loop.path[(pi + 1) % pathLen];
            const key = `${from}->${to}`;
            const pol = edgePolarity.get(key);
            if (pol === undefined) {
              issues.push({
                path: `${lAt}.path`,
                message: `loop edge "${from}" → "${to}" has no matching entry in causalEdges (a loop cannot draw over a missing edge)`,
              });
              pathOk = false;
              continue;
            }
            if (pol === '-') minusCount += 1;
          }
          if (!pathOk) return;
          const expectedKind = minusCount % 2 === 0 ? 'reinforcing' : 'balancing';
          if (loop.kind === 'reinforcing' || loop.kind === 'balancing') {
            if (loop.kind !== expectedKind) {
              issues.push({
                path: `${lAt}.kind`,
                message:
                  `loop labelled "${loop.kind}" but path has ${minusCount} '-' edge(s) — ` +
                  `the parity demands "${expectedKind}" (even '-' count → reinforcing R; odd → balancing B)`,
              });
            }
          }
        });
      }
    } else {
      if (sc.variables !== undefined) {
        issues.push({path: `${at}.variables`, message: `variables has no meaning for type "${sc.type}" — only causal-loop`});
      }
      if (sc.causalEdges !== undefined) {
        issues.push({path: `${at}.causalEdges`, message: `causalEdges has no meaning for type "${sc.type}" — only causal-loop`});
      }
      if (sc.loops !== undefined) {
        issues.push({path: `${at}.loops`, message: `loops has no meaning for type "${sc.type}" — only causal-loop`});
      }
    }

    // mechanism — a working diagram in continuous motion. The author names a
    // fixed set of `parts` at normalized positions and one `motion` primitive
    // (cycle / oscillate / descend / iterate). Every part id the motion
    // references must exist; every freeze must address a phase in range; the
    // motion's `period` must loop within a reasonable view time. HARD FAILs:
    //   - parts: 2-10 entries, unique ids, pos in [0..1]
    //   - motion.kind: one of the four enumerated kinds
    //   - motion.period: > 0 and < 600 frames
    //   - cycle.path / oscillate.between / descend.from/to / iterate.show:
    //     every id references a real part
    //   - freezes[].phase: in [0, length-of-loop)
    if (sc.type === 'mechanism') {
      // parts — 2-10 entries with unique ids and normalized positions.
      const partIds = new Set<string>();
      if (!Array.isArray(sc.parts) || sc.parts.length < 2 || sc.parts.length > 10) {
        issues.push({
          path: `${at}.parts`,
          message: 'mechanism requires 2-10 parts (the named positions the motion visits)',
        });
      } else {
        sc.parts.forEach((p: Record<string, any>, k: number) => {
          const pAt = `${at}.parts[${k}]`;
          if (!p || typeof p !== 'object') {
            issues.push({path: pAt, message: 'part must be an object {id, label, pos}'});
            return;
          }
          if (typeof p.id !== 'string' || !p.id.trim()) {
            issues.push({path: `${pAt}.id`, message: 'missing or empty string'});
          } else if (partIds.has(p.id)) {
            issues.push({path: `${pAt}.id`, message: `duplicate part id "${p.id}"`});
          } else {
            partIds.add(p.id);
          }
          if (typeof p.label !== 'string' || !p.label.trim()) {
            issues.push({path: `${pAt}.label`, message: 'missing or empty string'});
          }
          if (!p.pos || typeof p.pos !== 'object' || Array.isArray(p.pos)) {
            issues.push({path: `${pAt}.pos`, message: 'pos must be an object {x, y}, each in 0..1'});
          } else {
            for (const ax of ['x', 'y']) {
              const v = (p.pos as Record<string, unknown>)[ax];
              if (
                typeof v !== 'number' ||
                !Number.isFinite(v) ||
                v < 0 ||
                v > 1
              ) {
                issues.push({path: `${pAt}.pos.${ax}`, message: 'must be a number in 0..1'});
              }
            }
          }
          if (p.kind !== undefined && !['node', 'value', 'token'].includes(p.kind)) {
            issues.push({
              path: `${pAt}.kind`,
              message: 'kind must be one of: node, value, token',
            });
          }
        });
      }

      // motion — one of the four enumerated kinds, every referenced id real,
      // period bounded so the loop closes within a reasonable view time.
      const motion = sc.motion;
      const MOTION_KINDS = ['cycle', 'oscillate', 'descend', 'iterate'];
      let motionLen = 0;
      if (!motion || typeof motion !== 'object') {
        issues.push({path: `${at}.motion`, message: 'mechanism requires a motion primitive'});
      } else if (!MOTION_KINDS.includes(motion.kind)) {
        issues.push({
          path: `${at}.motion.kind`,
          message: `not a valid motion kind — one of: ${MOTION_KINDS.join(', ')}`,
        });
      } else {
        // period: > 0 and < 600 frames (so the motion loops within view time)
        if (
          typeof motion.period !== 'number' ||
          !Number.isFinite(motion.period) ||
          motion.period <= 0 ||
          motion.period >= 600
        ) {
          issues.push({
            path: `${at}.motion.period`,
            message: 'period must be a number > 0 and < 600 frames (the loop must close within view time)',
          });
        }
        const refOk = (id: unknown, where: string): void => {
          if (typeof id !== 'string' || !id.trim()) {
            issues.push({path: where, message: 'missing part id'});
          } else if (!partIds.has(id)) {
            issues.push({path: where, message: `part "${id}" is not a part in this scene`});
          }
        };
        if (motion.kind === 'cycle') {
          if (!Array.isArray(motion.path) || motion.path.length < 2) {
            issues.push({
              path: `${at}.motion.path`,
              message: 'cycle motion requires a path of ≥ 2 part ids',
            });
          } else {
            motion.path.forEach((id: unknown, k: number) =>
              refOk(id, `${at}.motion.path[${k}]`),
            );
            motionLen = motion.path.length;
          }
        } else if (motion.kind === 'oscillate') {
          if (!Array.isArray(motion.between) || motion.between.length !== 2) {
            issues.push({
              path: `${at}.motion.between`,
              message: 'oscillate motion requires `between` as a [partA, partB] pair',
            });
          } else {
            refOk(motion.between[0], `${at}.motion.between[0]`);
            refOk(motion.between[1], `${at}.motion.between[1]`);
            motionLen = 2;
          }
        } else if (motion.kind === 'descend') {
          refOk(motion.from, `${at}.motion.from`);
          refOk(motion.to, `${at}.motion.to`);
          motionLen = 2;
        } else if (motion.kind === 'iterate') {
          if (!Array.isArray(motion.phases) || motion.phases.length < 2) {
            issues.push({
              path: `${at}.motion.phases`,
              message: 'iterate motion requires ≥ 2 phases',
            });
          } else {
            motion.phases.forEach((ph: Record<string, any>, k: number) => {
              const phAt = `${at}.motion.phases[${k}]`;
              if (!ph || typeof ph !== 'object') {
                issues.push({path: phAt, message: 'phase must be an object {label, show}'});
                return;
              }
              if (typeof ph.label !== 'string' || !ph.label.trim()) {
                issues.push({path: `${phAt}.label`, message: 'missing or empty string'});
              }
              if (!Array.isArray(ph.show) || ph.show.length < 1) {
                issues.push({
                  path: `${phAt}.show`,
                  message: 'phase requires a non-empty `show` array of part ids',
                });
              } else {
                ph.show.forEach((id: unknown, j: number) =>
                  refOk(id, `${phAt}.show[${j}]`),
                );
              }
            });
            motionLen = motion.phases.length;
          }
        }
      }

      // freezes — each names a beat and a phase in [0, length-of-loop).
      const beatIdSet = new Set<string>();
      if (Array.isArray(sc.beats)) {
        sc.beats.forEach((b: Record<string, any>) => {
          if (typeof b?.id === 'string') beatIdSet.add(b.id);
        });
      }
      if (sc.freezes !== undefined && !Array.isArray(sc.freezes)) {
        issues.push({path: `${at}.freezes`, message: 'freezes must be an array'});
      } else if (Array.isArray(sc.freezes)) {
        sc.freezes.forEach((f: Record<string, any>, k: number) => {
          const fAt = `${at}.freezes[${k}]`;
          if (!f || typeof f !== 'object') {
            issues.push({path: fAt, message: 'freeze must be an object {beatId, phase}'});
            return;
          }
          if (typeof f.beatId !== 'string' || !f.beatId.trim()) {
            issues.push({path: `${fAt}.beatId`, message: 'missing or empty string'});
          } else if (beatIdSet.size > 0 && !beatIdSet.has(f.beatId)) {
            issues.push({
              path: `${fAt}.beatId`,
              message: `freeze references beat "${f.beatId}" which is not a beat in this scene`,
            });
          }
          if (
            typeof f.phase !== 'number' ||
            !Number.isInteger(f.phase) ||
            f.phase < 0 ||
            (motionLen > 0 && f.phase >= motionLen)
          ) {
            issues.push({
              path: `${fAt}.phase`,
              message:
                motionLen > 0
                  ? `phase must be an integer in [0, ${motionLen})`
                  : 'phase must be a non-negative integer',
            });
          }
        });
      }
    } else {
      // The mechanism-only fields have no meaning on other scene types.
      if (sc.parts !== undefined) {
        issues.push({
          path: `${at}.parts`,
          message: `parts has no meaning for type "${sc.type}" — only mechanism`,
        });
      }
      if (sc.motion !== undefined) {
        issues.push({
          path: `${at}.motion`,
          message: `motion has no meaning for type "${sc.type}" — only mechanism`,
        });
      }
      if (sc.freezes !== undefined) {
        issues.push({
          path: `${at}.freezes`,
          message: `freezes has no meaning for type "${sc.type}" — only mechanism`,
        });
      }
    }

    // Every scene type carries narration via beats; every scene type must
    // also carry SOMETHING visible for that narration to land on. A scene
    // that ships narration with no body renders a void with audio playing
    // over it — terrible UX, and the validator's job to prevent.
    const hasN = (n: number | undefined): boolean => typeof n === 'number' && n > 0;
    const arrLen = (a: unknown): number => (Array.isArray(a) ? a.length : 0);
    const requiredBody: Record<string, () => string | null> = {
      // recap — at least 3 ruling points the narration speaks to.
      recap: () => (arrLen(sc.points) < 3 ? 'recap requires at least 3 points (the body the narration speaks to)' : null),
      // structure — at least one node. Edges optional.
      structure: () => (arrLen(sc.nodes) < 1 ? 'structure requires at least 1 node (the diagram body)' : null),
      // progression — at least one stage on a track.
      progression: () => (arrLen(sc.stages) < 1 ? 'progression requires at least 1 stage' : null),
      // compare — at least one column AND one row.
      compare: () => (arrLen(sc.columns) < 1 || arrLen(sc.rows) < 1 ? 'compare requires at least 1 column and 1 row' : null),
      // quantities — at least one of figures, matrix cells, or metrics.
      quantities: () => {
        const hasFigs = arrLen(sc.figures) >= 1;
        const hasMatrix = sc.matrix && arrLen((sc.matrix as Record<string, unknown>).cells) >= 1;
        const hasMetrics = arrLen(sc.metrics) >= 1;
        return hasFigs || hasMatrix || hasMetrics ? null : 'quantities requires at least one of figures, matrix.cells, or metrics';
      },
      // walkthrough — at least 2 actors (a message goes between two).
      walkthrough: () => (arrLen(sc.actors) < 2 ? 'walkthrough requires at least 2 actors' : null),
      // probe — at least one variation (the baseline alone is not interrogated).
      probe: () => (arrLen(sc.variations) < 1 ? 'probe requires at least 1 variation against the baseline' : null),
      // passage — non-empty text body.
      passage: () => (typeof sc.text !== 'string' || !sc.text.trim() ? 'passage requires non-empty text' : null),
      // figure — non-empty image reference.
      figure: () => (typeof sc.image !== 'string' || !sc.image.trim() ? 'figure requires an image path' : null),
      // closeup — non-empty code or file reference.
      closeup: () => (
        (typeof sc.code !== 'string' || !sc.code.trim()) && (typeof sc.file !== 'string' || !sc.file.trim())
          ? 'closeup requires either code or file'
          : null
      ),
      // chart — at least one series.
      chart: () => (arrLen(sc.series) < 1 ? 'chart requires at least 1 series' : null),
      // landscape — at least 2 subjects (a single dot isn't a landscape).
      landscape: () => (arrLen(sc.subjects) < 2 ? 'landscape requires at least 2 subjects (the markers plotted on the plane)' : null),
      // mechanism — at least one part AND a motion primitive (the working
      // diagram body). The detailed shape contract is enforced above.
      mechanism: () => (
        arrLen(sc.parts) < 1 || !sc.motion
          ? 'mechanism requires at least 1 part and a motion primitive (the body the motion animates over)'
          : null
      ),
      // tension — at least one node (the ledger items).
      tension: () => (arrLen(sc.nodes) < 1 ? 'tension requires at least 1 node (chosen/rejected/risk)' : null),
      // demonstrate — non-empty clip reference.
      demonstrate: () => (typeof sc.clip !== 'string' || !sc.clip.trim() ? 'demonstrate requires a clip path' : null),
      // frame — title is the load-bearing visual. Subtitle/footnote optional.
      frame: () => (typeof sc.title !== 'string' || !sc.title.trim() ? 'frame requires a title' : null),
      // big-idea — statement is the load-bearing visual. Anchor optional.
      'big-idea': () => null, // already enforced above (statement required)
      // prior-art / venn / diff — already enforced by their dedicated checks above.
      'prior-art': () => null,
      venn: () => null,
      diff: () => null,
      // timeline — at least one event OR one span (an empty axis is not a
      // story; the axis exists to carry markers).
      timeline: () => {
        const hasE = arrLen(sc.events) >= 1;
        const hasS = arrLen(sc.spans) >= 1;
        return hasE || hasS ? null : 'timeline requires at least 1 event or 1 span (the axis exists to carry markers)';
      },
      // tree — `root` is required, and the root must carry at least one child
      // (a single node is not a hierarchy; it's a node). Depth / count / id
      // uniqueness already enforced by the dedicated walk above.
      tree: () => {
        const root = sc.root as Record<string, any> | undefined;
        if (!root || typeof root !== 'object' || Array.isArray(root)) {
          return 'tree requires a root tree-node {id, label, children}';
        }
        if (!Array.isArray(root.children) || root.children.length < 1) {
          return 'tree root must carry at least 1 child — a single node is not a hierarchy';
        }
        return null;
      },
      // map — at least 2 regions (the spatial argument needs places to argue
      // among). Further constraints (grid needs gridSize, refs must resolve)
      // are enforced by the per-scene block above.
      map: () => (arrLen(sc.regions) < 2 ? 'map requires at least 2 regions (position carries information)' : null),
      // journey-map — at least 3 stages (a journey with fewer is just a list).
      // The dedicated check above already pins the 3-8 bound and shape; this
      // entry surfaces the body requirement in the standard required-body table.
      'journey-map': () => (arrLen(sc.journeyStages) < 3 ? 'journey-map requires at least 3 stages (a journey with fewer is just a list)' : null),
      // causal-loop — at least 3 variables AND at least 1 loop. The
      // per-scene block above pins the upper bound (8 vars) and the
      // labelling math; this is the minimum-body floor.
      'causal-loop': () => {
        const hasVars = arrLen(sc.variables) >= 3;
        const hasLoop = arrLen(sc.loops) >= 1;
        return hasVars && hasLoop ? null : 'causal-loop requires at least 3 variables and at least 1 loop';
      },
    };
    const bodyCheck = requiredBody[sc.type];
    if (bodyCheck) {
      const msg = bodyCheck();
      if (msg) issues.push({path: `${at}`, message: msg});
    }
    // Use hasN to silence the unused-name warning while keeping the helper
    // available for future per-beat checks (e.g. reveal references).
    void hasN;

    if (!Array.isArray(sc.beats) || sc.beats.length === 0) {
      issues.push({path: `${at}.beats`, message: 'missing or empty beats array'});
      return;
    }
    sc.beats.forEach((b: Record<string, any>, j: number) => {
      const bAt = `${at}.beats[${j}]`;
      if (typeof b.id !== 'string' || !b.id.trim()) {
        issues.push({path: `${bAt}.id`, message: 'missing beat id'});
      } else if (beatIds.has(b.id)) {
        issues.push({path: `${bAt}.id`, message: `duplicate beat id "${b.id}" (TTS keys on it)`});
      } else {
        beatIds.add(b.id);
      }
      if (typeof b.narration !== 'string' || !b.narration.trim()) {
        issues.push({path: `${bAt}.narration`, message: 'missing narration text'});
      }

      // First beat of every scene MUST drive a visual change — otherwise the
      // scene opens with narration playing over a void (the bug the user
      // saw across multiple films). After the first beat, silent beats are
      // fine: the scene already has content visible. Scene types that show
      // their body from frame 1 — passage text, figure image, closeup code,
      // frame title, diff (before/after code), demonstrate (clip playing) —
      // don't need a per-beat trigger and are exempt.
      const ALWAYS_ON = new Set(['passage', 'figure', 'closeup', 'frame', 'diff', 'demonstrate', 'mechanism']);
      if (j === 0 && !ALWAYS_ON.has(sc.type)) {
        const hasReveal =
          (Array.isArray(b.reveal) && b.reveal.length > 0) ||
          (typeof b.reveal === 'number' && b.reveal > 0);
        const hasFocus = Array.isArray(b.focus) && b.focus.length > 0;
        const hasShow = typeof b.show === 'string' && b.show.trim().length > 0;
        const hasPulse = Array.isArray(b.pulse) && b.pulse.length > 0;
        const hasTransform = Array.isArray(b.transform) && b.transform.length > 0;
        const hasMessage = b.message && typeof b.message === 'object';
        const hasSet =
          b.set && typeof b.set === 'object' && !Array.isArray(b.set) && Object.keys(b.set).length > 0;
        const hasAnyVisual =
          hasReveal || hasFocus || hasShow || hasPulse || hasTransform || hasMessage || hasSet;
        if (!hasAnyVisual) {
          issues.push({
            path: bAt,
            message:
              'the first beat of a scene must drive a visual change ' +
              '(reveal | focus | show | pulse | transform | message | set) — ' +
              'otherwise narration plays over a void',
          });
        }
      }
      checkKnob(b, 'pace', bAt, issues);
      checkKnob(b, 'cadence', bAt, issues);
      checkKnob(b, 'shot', bAt, issues);

      // set — the tween directive. Each entry is a bare number (a jump) or a
      // Tween object {to, from?, ease?}; nothing else.
      if (b.set !== undefined) {
        if (typeof b.set !== 'object' || b.set === null || Array.isArray(b.set)) {
          issues.push({path: `${bAt}.set`, message: 'set must be a map of name → number | Tween'});
        } else {
          for (const [name, v] of Object.entries(b.set as Record<string, any>)) {
            const sAt = `${bAt}.set.${name}`;
            if (typeof v === 'number') continue;
            if (!v || typeof v !== 'object') {
              issues.push({path: sAt, message: 'must be a number or a Tween object {to, from?, ease?}'});
              continue;
            }
            if (typeof v.to !== 'number') {
              issues.push({path: `${sAt}.to`, message: 'Tween requires a numeric "to"'});
            }
            if (v.from !== undefined && typeof v.from !== 'number') {
              issues.push({path: `${sAt}.from`, message: '"from" must be a number'});
            }
            checkKnob(v, 'ease', sAt, issues);
          }
        }
      }

      // transform — the morph directive. Each entry re-binds a node to a new
      // definition; its `node` must reference a real node id in this scene,
      // and `into` is a partial Node (the `as` knob, if present, is checked).
      if (b.transform !== undefined) {
        if (!Array.isArray(b.transform)) {
          issues.push({path: `${bAt}.transform`, message: 'transform must be an array'});
        } else {
          b.transform.forEach((t: Record<string, any>, k: number) => {
            const tAt = `${bAt}.transform[${k}]`;
            if (!t || typeof t !== 'object') {
              issues.push({path: tAt, message: 'transform entry must be an object {node, into}'});
              return;
            }
            if (typeof t.node !== 'string' || !t.node.trim()) {
              issues.push({path: `${tAt}.node`, message: 'missing node id to transform'});
            } else if (!nodeIds.has(t.node)) {
              issues.push({
                path: `${tAt}.node`,
                message: `node "${t.node}" is not a node in this scene`,
              });
            }
            if (!t.into || typeof t.into !== 'object' || Array.isArray(t.into)) {
              issues.push({path: `${tAt}.into`, message: 'into must be a partial Node object'});
            } else {
              checkKnob(t.into, 'as', `${tAt}.into`, issues);
              checkKnob(t.into, 'weight', `${tAt}.into`, issues);
            }
          });
        }
      }
    });

    // Sprint B — compositional grammar. Walk this scene's slot table and
    // validate any embedded sub-scene against the per-slot allowlist, the
    // chrome-exclusion contract, and max-depth-2. Embeds at non-host scene
    // types or at non-opt-in fields are rejected.
    //
    // Skip the walk when validating a synthetic embed wrapper: validateEmbed
    // already walks the embed's sub-records recursively, so a second walk
    // here would double-report.
    if (!(s as Record<string, unknown>).__embed_synthetic) {
      walkEmbedSlots(sc, at, 1, issues);
    }
  });

  // AR-mode contract — every architecture-review film must carry exactly one
  // prior-art scene, sitting immediately after the frame and immediately
  // before the first structure scene. The position is part of the grammar:
  // the viewer learns what's at stake (frame), then what's been tried
  // (prior-art), then sees the system itself (structure). A film with no
  // prior-art is admiring its subject without placing it; two is incoherent.
  //
  // The contract triggers on `meta.prompt === 'architecture-review'` — the
  // hyphenated string the cascade emits in AR mode. Existing gallery films
  // (which use the legacy "architecture review" string, or no AR mode at all)
  // are untouched.
  const promptStr = typeof s.meta?.prompt === 'string' ? s.meta.prompt.trim() : '';
  if (promptStr === 'architecture-review' && Array.isArray(s.scenes)) {
    const priorArtIdx: number[] = [];
    let firstStructureIdx = -1;
    let firstFrameIdx = -1;
    s.scenes.forEach((sc: Record<string, any>, i: number) => {
      if (sc.type === 'prior-art') priorArtIdx.push(i);
      if (sc.type === 'structure' && firstStructureIdx === -1) firstStructureIdx = i;
      if (sc.type === 'frame' && firstFrameIdx === -1) firstFrameIdx = i;
    });
    if (priorArtIdx.length === 0) {
      issues.push({
        path: 'scenes',
        message:
          'architecture-review films require a `prior-art` scene — placing the subject against 2-4 prior systems on 2-4 dimensions',
      });
    } else if (priorArtIdx.length > 1) {
      issues.push({
        path: 'scenes',
        message: `architecture-review films require exactly one prior-art scene; ${priorArtIdx.length} found (indices ${priorArtIdx.join(', ')})`,
      });
    } else {
      const paIdx = priorArtIdx[0];
      // Position contract — immediately after frame, immediately before the
      // first structure. If there is no frame, prior-art must be index 0; if
      // there is no structure, prior-art must come before every other
      // non-frame scene type that would normally follow it.
      if (firstFrameIdx >= 0 && paIdx !== firstFrameIdx + 1) {
        issues.push({
          path: `scenes[${paIdx}]`,
          message: `prior-art must sit immediately after the frame scene (expected index ${firstFrameIdx + 1}, found ${paIdx})`,
        });
      }
      if (firstStructureIdx >= 0 && paIdx >= firstStructureIdx) {
        issues.push({
          path: `scenes[${paIdx}]`,
          message: `prior-art must sit immediately before the first structure scene (structure at index ${firstStructureIdx})`,
        });
      }
      if (firstFrameIdx < 0 && paIdx !== 0) {
        issues.push({
          path: `scenes[${paIdx}]`,
          message: `prior-art must open the film when no frame scene is present (expected index 0, found ${paIdx})`,
        });
      }
    }
  }

  // big-idea — the explainer contract. Every explainer film MUST carry
  // exactly one big-idea scene, sitting immediately before the recap
  // (the recap is the last scene). The takeaway lifts the film off;
  // the recap formalizes. Less / more / out-of-position → HARD FAIL.
  //
  // Grandfather: the pre-Big-Idea gallery was authored before the contract
  // existed. Retrofitting them is out of scope; they render as-is. Every
  // NEW explainer must comply.
  const BIG_IDEA_GRANDFATHERED = new Set([
    'euclid-primes',
    'linear-algebra',
    'stopping-by-woods',
  ]);
  const isExplainer =
    typeof s.meta?.prompt === 'string' && /explain/i.test(s.meta.prompt);
  const isBigIdeaGrandfathered =
    typeof s.meta?.id === 'string' && BIG_IDEA_GRANDFATHERED.has(s.meta.id);
  if (isExplainer && !isBigIdeaGrandfathered && Array.isArray(s.scenes)) {
    const bigIdeaIdx: number[] = [];
    s.scenes.forEach((sc: Record<string, any>, i: number) => {
      if (sc?.type === 'big-idea') bigIdeaIdx.push(i);
    });
    if (bigIdeaIdx.length === 0) {
      issues.push({
        path: 'scenes',
        message: 'an explainer film MUST include exactly one big-idea scene (the takeaway)',
      });
    } else if (bigIdeaIdx.length > 1) {
      issues.push({
        path: 'scenes',
        message: `an explainer film must include exactly one big-idea scene — found ${bigIdeaIdx.length}`,
      });
    } else {
      const lastIdx = s.scenes.length - 1;
      const lastScene = s.scenes[lastIdx];
      const idx = bigIdeaIdx[0];
      if (lastScene?.type !== 'recap') {
        issues.push({
          path: `scenes[${lastIdx}]`,
          message:
            'an explainer film must end with a recap; the big-idea sits immediately before it',
        });
      } else if (idx !== lastIdx - 1) {
        issues.push({
          path: `scenes[${idx}]`,
          message: `the big-idea must sit immediately before the recap (expected at scenes[${lastIdx - 1}], found at scenes[${idx}])`,
        });
      }
    }
  }

  return issues;
};
