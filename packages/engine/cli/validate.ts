// Structural validation of a film spec — the contract the engine enforces and
// the agent layer must satisfy. This is not a full JSON Schema validator; it
// is a focused check of the shape the engine actually depends on.
// schema/film.schema.json is the documented contract this mirrors.

const SCENE_TYPES = ['frame', 'structure', 'progression', 'walkthrough', 'compare', 'quantities', 'probe', 'tension', 'closeup', 'passage', 'figure', 'demonstrate', 'recap', 'diff', 'chart'];
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'];

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
            issues.push({
              path: `${at}.nodes[${k}]`,
              message: `cell (col=${c}, row=${r}) is outside the ${gCols}×${gRows} grid`,
            });
            continue;
          }
          const key = `${c},${r}`;
          const prior = occupied.get(key);
          if (prior !== undefined && prior !== n.id) {
            issues.push({
              path: `${at}.nodes[${k}]`,
              message: `box overlap — "${n.id}" and "${prior}" both occupy cell (col=${c}, row=${r})`,
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

  return issues;
};
