// Structural validation of a film spec — the contract the engine enforces and
// the agent layer must satisfy. This is not a full JSON Schema validator; it
// is a focused check of the shape the engine actually depends on.
// schema/film.schema.json is the documented contract this mirrors.

const SCENE_TYPES = ['frame', 'structure', 'progression', 'walkthrough', 'compare', 'quantities', 'probe', 'tension', 'closeup', 'passage', 'figure', 'demonstrate', 'recap', 'diff', 'chart', 'big-idea', 'prior-art', 'venn'];
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
        issues.push({path: axisAt, message: 'axis must be an object {label, min, max, ticks?}'});
        return;
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
    checkAxis(sc.xAxis, `${at}.xAxis`);
    checkAxis(sc.yAxis, `${at}.yAxis`);

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
      // novelty
      if (!sc.novelty || typeof sc.novelty !== 'object') {
        issues.push({path: `${at}.novelty`, message: 'prior-art requires a novelty {dimension, statement}'});
      } else {
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
      if (!sc.novelty || typeof sc.novelty !== 'object') {
        issues.push({path: `${at}.novelty`, message: 'venn requires a novelty {regionId, claim} — the intersection the film argues from'});
      } else {
        if (typeof sc.novelty.regionId !== 'string' || !sc.novelty.regionId.trim()) {
          issues.push({path: `${at}.novelty.regionId`, message: 'missing or empty region id'});
        } else if (!regionIds.has(sc.novelty.regionId)) {
          issues.push({
            path: `${at}.novelty.regionId`,
            message: `novelty references region "${sc.novelty.regionId}", which is not a region in this scene`,
          });
        }
        if (typeof sc.novelty.claim !== 'string' || !sc.novelty.claim.trim()) {
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
      const ALWAYS_ON = new Set(['passage', 'figure', 'closeup', 'frame', 'diff', 'demonstrate']);
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
