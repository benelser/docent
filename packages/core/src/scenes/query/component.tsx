// QueryScene — observability-native. A query (PromQL / LogQL / SQL /
// Jaeger / KQL) being progressively typed/built next to a live result that
// evolves with it. The split-pane is the move: editor left (60%), result
// panel right (40%). Lines are reveal-gated; the result tween rides the
// same `beat.set` grammar `quantities` metrics use, so a counter / gauge
// ticks up to its target rather than cutting to it.
//
// Highlighting strategy. PromQL / LogQL / JQL / KQL don't have native
// Prism grammars, and `prism-react-renderer` doesn't accept a custom
// language through its props (the only way to register one is to monkey-
// patch the bundled `prismjs` global, which is fragile and side-effecty
// across the SSR + browser bundle split). Rather than alias every dialect
// to `bash` or `lua` and live with mistuned tokens, this scene rolls a
// small, dialect-aware tokenizer of its own (see `tokenize` below). It's
// a few regexes per dialect — enough to color the load-bearing tokens
// (metric / function / operator / duration / label / string) the way a
// reader of that DSL expects, with no Prism dependency for the four
// non-native dialects. SQL keeps its own well-tuned tokenizer here too,
// for consistency.
//
// Animated count-up. The result panel reuses the project's `BoundValue`
// — the same primitive `quantities` metrics ride — so the count-up tween
// is byte-identical to the existing animated-values grammar. A beat
// drives the value via `beat.set: { <result.bind>: { to: <n> } }`.

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {
  BoundValue,
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  glow,
  interFamily,
  monoFamily,
  tweenValue,
} from '../../_shared';
import type {QueryLine, QueryScene, QueryResult} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

// --- dialect-aware tokenization ---------------------------------------------
// A token's `kind` maps to one of the project's `codeTheme` token classes:
//   keyword     — control keyword / clause head  → violet
//   function    — function call / aggregation    → blue
//   string      — string literal / quoted value  → green
//   number      — numeric literal                 → amber
//   duration    — `[5m]` / `1h` / `30s` style    → amber (treated as number)
//   operator    — `/`, `*`, `=`, `=~`, `|`        → muted ink
//   label       — `{label="value"}` key           → rose
//   metric      — PromQL metric / LogQL stream    → cyan
//   punctuation — `{`, `}`, `(`, `)`, `,`         → muted ink
//   comment     — `# …` / `-- …`                  → muted italic
//   plain       — fallback                        → ink

type TokenKind =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'duration'
  | 'operator'
  | 'label'
  | 'metric'
  | 'punctuation'
  | 'comment'
  | 'plain';

interface Token {
  text: string;
  kind: TokenKind;
}

// Token colour palette — sourced inline (rather than via prism-react-renderer's
// theme map) so the scene works without registering a Prism grammar. Hexes
// mirror `_shared/code-theme.ts` so the look matches `closeup`.
const tokenColor = (kind: TokenKind, ink: ResolvedStyle['tokens']['ink']): string => {
  switch (kind) {
    case 'keyword':
      return '#b69cff';
    case 'function':
      return '#5cb6ff';
    case 'string':
      return '#5fe8a4';
    case 'number':
    case 'duration':
      return '#ffc24d';
    case 'operator':
    case 'punctuation':
      return '#8a93a6';
    case 'label':
      return '#ff9bb0';
    case 'metric':
      return '#3fe0d0';
    case 'comment':
      return ink.low;
    case 'plain':
    default:
      return ink.hi;
  }
};

// The keyword sets per dialect. Pulled deliberately tight — only the
// load-bearing clause heads / aggregations / known functions land here.
const PROMQL_FUNCS = new Set([
  'sum', 'avg', 'min', 'max', 'count', 'rate', 'irate', 'increase',
  'histogram_quantile', 'topk', 'bottomk', 'absent', 'absent_over_time',
  'changes', 'delta', 'deriv', 'predict_linear', 'stddev', 'stdvar',
  'quantile', 'quantile_over_time', 'avg_over_time', 'sum_over_time',
  'min_over_time', 'max_over_time', 'count_over_time', 'last_over_time',
  'present_over_time',
]);
const PROMQL_KEYWORDS = new Set(['by', 'without', 'on', 'ignoring', 'group_left', 'group_right', 'offset']);

const LOGQL_FUNCS = new Set([
  'sum', 'avg', 'min', 'max', 'count', 'rate', 'count_over_time',
  'bytes_rate', 'bytes_over_time', 'topk', 'bottomk', 'quantile_over_time',
  'avg_over_time', 'sum_over_time', 'min_over_time', 'max_over_time',
]);
const LOGQL_KEYWORDS = new Set(['by', 'without', 'json', 'logfmt', 'regexp', 'pattern', 'label_format', 'line_format', 'unwrap']);

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT',
  'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'ON',
  'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
  'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'DISTINCT', 'ALL', 'INTO', 'VALUES', 'INSERT', 'UPDATE', 'DELETE',
  'CREATE', 'TABLE', 'INDEX', 'VIEW', 'DESC', 'ASC',
]);
const SQL_FUNCS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ABS', 'ROUND', 'COALESCE',
  'NULLIF', 'CAST', 'DATE', 'TIME', 'NOW', 'CURRENT_TIMESTAMP',
  'EXTRACT', 'DATE_TRUNC', 'CONCAT', 'LENGTH', 'LOWER', 'UPPER',
  'PERCENTILE_CONT', 'PERCENTILE_DISC', 'STDDEV', 'VARIANCE',
]);

// KQL — Kusto Query Language: pipeline operators after `|`.
const KQL_KEYWORDS = new Set([
  'where', 'project', 'summarize', 'extend', 'join', 'union', 'order',
  'sort', 'top', 'take', 'limit', 'distinct', 'by', 'on', 'asc', 'desc',
  'and', 'or', 'not', 'in', 'contains', 'has', 'startswith', 'endswith',
  'matches', 'regex', 'between',
]);
const KQL_FUNCS = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'dcount', 'percentile', 'percentiles',
  'bin', 'ago', 'now', 'startofday', 'endofday', 'todynamic', 'tostring',
  'toint', 'todouble', 'todatetime', 'iff', 'iif', 'case', 'isnotempty',
  'isempty', 'isnull', 'isnotnull',
]);

// Jaeger / JQL — Jaeger's tag-based filter DSL: `service=foo operation=bar`.
// It's flatter than the others — keywords are `tag` references and ranges.
const JQL_KEYWORDS = new Set([
  'service', 'operation', 'tags', 'minDuration', 'maxDuration', 'lookback',
  'limit', 'and', 'or',
]);

// Tokenize one line of query text. Returns segments in left-to-right order.
// The tokenizer is intentionally permissive — when in doubt, emit `plain`,
// not `error`. Highlight regressions are easier to fix than crashes.
const tokenize = (
  line: string,
  dialect: QueryScene['dialect'],
): Token[] => {
  const out: Token[] = [];
  let i = 0;
  const n = line.length;

  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_:]/.test(c);

  while (i < n) {
    const c = line[i]!;

    // Whitespace — preserved verbatim as a `plain` token (keeps indentation
    // and inter-token gaps without collapsing).
    if (c === ' ' || c === '\t') {
      let j = i;
      while (j < n && (line[j] === ' ' || line[j] === '\t')) j++;
      out.push({text: line.slice(i, j), kind: 'plain'});
      i = j;
      continue;
    }

    // Comments — `# …` (PromQL/LogQL), `-- …` (SQL), `// …` (KQL/JQL).
    if (
      c === '#' ||
      (c === '-' && line[i + 1] === '-') ||
      (c === '/' && line[i + 1] === '/')
    ) {
      out.push({text: line.slice(i), kind: 'comment'});
      i = n;
      continue;
    }

    // Strings — single or double quoted. Backtick-quoted identifiers (SQL)
    // are tokenized as strings; same render style.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n && line[j] !== quote) {
        if (line[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      // include closing quote when present
      if (j < n) j++;
      out.push({text: line.slice(i, j), kind: 'string'});
      i = j;
      continue;
    }

    // PromQL / LogQL label selector — `{key="value", key2!~"regex"}`. We
    // walk the inside char-by-char, classifying the keys as `label`, the
    // operators as `operator`, the quoted values as `string`.
    if (c === '{' && (dialect === 'promql' || dialect === 'logql')) {
      out.push({text: '{', kind: 'punctuation'});
      i++;
      while (i < n && line[i] !== '}') {
        const cc = line[i]!;
        if (cc === ' ' || cc === ',') {
          out.push({text: cc, kind: cc === ',' ? 'punctuation' : 'plain'});
          i++;
          continue;
        }
        if (isIdentStart(cc)) {
          let j = i;
          while (j < n && isIdent(line[j]!)) j++;
          out.push({text: line.slice(i, j), kind: 'label'});
          i = j;
          continue;
        }
        if (cc === '=' || cc === '!') {
          let j = i;
          // gather =, ==, !=, =~, !~ — operator runs
          while (j < n && /[=!~]/.test(line[j]!)) j++;
          out.push({text: line.slice(i, j), kind: 'operator'});
          i = j;
          continue;
        }
        if (cc === '"' || cc === "'") {
          const quote = cc;
          let j = i + 1;
          while (j < n && line[j] !== quote) {
            if (line[j] === '\\' && j + 1 < n) j += 2;
            else j++;
          }
          if (j < n) j++;
          out.push({text: line.slice(i, j), kind: 'string'});
          i = j;
          continue;
        }
        // Anything else inside the braces — emit as plain so we never
        // crash on a hand-rolled author shape we don't recognize.
        out.push({text: cc, kind: 'plain'});
        i++;
      }
      if (i < n && line[i] === '}') {
        out.push({text: '}', kind: 'punctuation'});
        i++;
      }
      continue;
    }

    // Duration literals — `[5m]`, `[1h]`, `[30s]`, `[1d]`. Bracket-wrapped
    // for PromQL/LogQL range vectors.
    if (
      c === '[' &&
      (dialect === 'promql' || dialect === 'logql')
    ) {
      const m = line.slice(i).match(/^\[(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)\]/);
      if (m) {
        out.push({text: m[0], kind: 'duration'});
        i += m[0].length;
        continue;
      }
    }

    // Bare duration literal — `5m`, `1h`, `30s` (KQL `ago(7d)`).
    if (/[0-9]/.test(c)) {
      // Try the bare duration first
      const md = line.slice(i).match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)\b/);
      if (md) {
        out.push({text: md[0], kind: 'duration'});
        i += md[0].length;
        continue;
      }
      // Generic number — int / float / sci
      const mn = line.slice(i).match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (mn) {
        out.push({text: mn[0], kind: 'number'});
        i += mn[0].length;
        continue;
      }
    }

    // Identifiers — keyword / function / metric classification per dialect.
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdent(line[j]!)) j++;
      const word = line.slice(i, j);
      const after = line[j];
      const isCall = after === '(';

      let kind: TokenKind = 'plain';

      if (dialect === 'promql') {
        if (PROMQL_KEYWORDS.has(word)) kind = 'keyword';
        else if (isCall && PROMQL_FUNCS.has(word)) kind = 'function';
        else if (isCall) kind = 'function';
        // Bare identifier outside a call is the metric name — the
        // load-bearing PromQL token.
        else kind = 'metric';
      } else if (dialect === 'logql') {
        if (LOGQL_KEYWORDS.has(word)) kind = 'keyword';
        else if (isCall && LOGQL_FUNCS.has(word)) kind = 'function';
        else if (isCall) kind = 'function';
        else kind = 'metric';
      } else if (dialect === 'sql') {
        const upper = word.toUpperCase();
        if (SQL_KEYWORDS.has(upper)) kind = 'keyword';
        else if (isCall && SQL_FUNCS.has(upper)) kind = 'function';
        else if (isCall) kind = 'function';
        else kind = 'plain';
      } else if (dialect === 'kql') {
        if (KQL_KEYWORDS.has(word)) kind = 'keyword';
        else if (isCall && KQL_FUNCS.has(word)) kind = 'function';
        else if (isCall) kind = 'function';
        else kind = 'plain';
      } else if (dialect === 'jql') {
        if (JQL_KEYWORDS.has(word)) kind = 'keyword';
        else kind = 'plain';
      }

      out.push({text: word, kind});
      i = j;
      continue;
    }

    // Operators — `/`, `*`, `+`, `-`, `=`, `==`, `=~`, `|`, `|=`, `!=`, `>`,
    // `<`, `>=`, `<=`. Walk a run of operator characters.
    if (/[/*+\-=!<>|^%]/.test(c)) {
      let j = i;
      while (j < n && /[/*+\-=!<>|^%~]/.test(line[j]!)) j++;
      out.push({text: line.slice(i, j), kind: 'operator'});
      i = j;
      continue;
    }

    // Punctuation — parens, commas, semicolons, brackets, dots.
    if (/[(),;.\[\]:{}]/.test(c)) {
      out.push({text: c, kind: 'punctuation'});
      i++;
      continue;
    }

    // Anything else — emit as plain. Never crash on a stray glyph.
    out.push({text: c, kind: 'plain'});
    i++;
  }

  return out;
};

// --- gauge / sparkline / counter helpers ------------------------------------
// All four result idioms are rendered inline in the component below — the
// shape of the result panel is a stable rectangle with the value the
// dominant visual element. See the `result.kind` switch at the bottom of
// `QuerySceneComponent`.

const polar = (cx: number, cy: number, r: number, angleDeg: number): {x: number; y: number} => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad)};
};

// SVG path for an arc segment from `startDeg` to `endDeg`, inclusive.
const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
};

// --- the renderer -----------------------------------------------------------

export const QuerySceneComponent: React.FC<SceneRenderProps<QueryScene>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const accentHex = accentOf(style, undefined);
  const {bg, ink} = style.tokens;

  const lines = scene.query ?? [];
  const result: QueryResult = scene.result;
  const dialect = scene.dialect;

  // Resolve which lines are revealed at this frame. A line without a
  // revealId is always visible (canonical first-line pattern); a line WITH
  // a revealId becomes visible at the start of the beat that first lists
  // that id in its `reveal`. We walk the timeline once; the result is a
  // per-line reveal frame (or -1 for "always visible").
  const lineRevealFrames: number[] = lines.map((l) => (l.revealId ? Number.POSITIVE_INFINITY : 0));
  const revealedById = new Map<string, number>();
  for (const slot of ts.beats) {
    const b = slot.beat as {reveal?: readonly string[]};
    if (!Array.isArray(b.reveal)) continue;
    for (const rid of b.reveal) {
      if (typeof rid !== 'string') continue;
      if (!revealedById.has(rid)) revealedById.set(rid, slot.startFrame);
    }
  }
  lines.forEach((line, i) => {
    if (!line.revealId) return;
    const r = revealedById.get(line.revealId);
    lineRevealFrames[i] = r ?? Number.POSITIVE_INFINITY;
  });

  // Which beat is on screen, and which revealId (if any) has focus.
  const activeIdx = activeBeatIndex(ts.beats, frame);
  const activeBeat = ts.beats[activeIdx]?.beat as
    | {focus?: readonly string[]; reveal?: readonly string[]}
    | undefined;
  const focusIds = new Set<string>([
    ...(activeBeat?.focus ?? []),
    // Treat the active beat's reveal as a soft focus too — a beat that
    // reveals a line without an explicit focus still implies "the new
    // line is the point of this beat".
    ...(activeBeat?.reveal ?? []),
  ]);

  // Editor pane geometry. Bound to 1920×1080 stage; portrait/square are not
  // shipped for `query` today (the split-pane idiom only reads at 16:9).
  const STAGE_W = 1920;
  const STAGE_H = 1080;
  const topY = 210;
  const safeH = STAGE_H - topY - 110; // wordmark band
  const margin = 60;
  const gap = 26;
  const totalW = STAGE_W - margin * 2;
  const editorW = Math.round(totalW * 0.6);
  const resultW = totalW - editorW - gap;
  const editorX = margin;
  const resultX = margin + editorW + gap;

  // Editor font sizing — bound by the widest line and the line count.
  const longestLen = lines.reduce(
    (a, l) => Math.max(a, l.text.replace(/\t/g, '    ').length),
    0,
  );
  const gutterW = 56;
  const editorContentW = editorW - gutterW - 36;
  const editorHeaderH = 44;
  const editorPadY = 22;
  const editorBodyH = safeH - editorHeaderH - editorPadY * 2;
  const BASE_FONT = 26;
  const FLOOR_FONT = 14;
  const charAdvance = 0.62;
  const lineHRatio = 36 / 24;
  const fitFontFromW = editorContentW / Math.max(1, longestLen * charAdvance);
  const fitFontFromH = (editorBodyH / Math.max(1, lines.length)) / lineHRatio;
  const fontSize = Math.max(
    FLOOR_FONT,
    Math.floor(Math.min(BASE_FONT, fitFontFromW, fitFontFromH)),
  );
  const lineH = Math.round(fontSize * lineHRatio);

  // Editor window intro — scale spring + opacity ramp.
  const winSpring = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const winOpacity = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // The caret blinks on the latest revealed line's last character. Cycle
  // is 30 frames at 30fps (1s); 50% duty.
  const visibleLineCount = lineRevealFrames.reduce(
    (n, f) => (frame >= f ? n + 1 : n),
    0,
  );
  const caretLineIdx = Math.max(0, visibleLineCount - 1);
  const caretLine = lines[caretLineIdx];
  const caretOn = Math.floor(frame / 15) % 2 === 0;

  // The dialect badge — sits on the editor's title bar.
  const dialectLabel: Record<QueryScene['dialect'], string> = {
    promql: 'PromQL',
    logql: 'LogQL',
    sql: 'SQL',
    jql: 'Jaeger',
    kql: 'KQL',
  };

  // Result bind — beats drive the count-up via `set: { <bind>: {to: <n>} }`.
  const resultBind = result.bind ?? `${(scene as {id?: string}).id ?? 'query'}.value`;

  // Per-line opacity / translate from the reveal frame.
  const lineEnter = (i: number): {opacity: number; tx: number} => {
    const enter = lineRevealFrames[i] ?? 0;
    if (enter === Number.POSITIVE_INFINITY) return {opacity: 0, tx: -20};
    const local = frame - enter;
    if (local <= 0) return {opacity: 0, tx: -20};
    const t = Math.min(1, local / 12);
    // ease-out quad
    const e = 1 - (1 - t) * (1 - t);
    return {opacity: e, tx: -20 + 20 * e};
  };

  // The "active note" callout — if a focused line carries a note, float it
  // to the right of the editor pane.
  const activeNote = (() => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.note || !l.revealId) continue;
      if (focusIds.has(l.revealId) && frame >= (lineRevealFrames[i] ?? 0)) {
        return {line: l, lineIdx: i};
      }
    }
    return null;
  })();

  // R15.1 chrome-kicker hint — the agentops kicker style (set on the
  // preset) renders the scene's chromeKickerHint or scene.type when set;
  // falls back gracefully to legacy kicker text everywhere else.
  const chromeKickerHint =
    typeof (scene as {chromeKickerHint?: unknown}).chromeKickerHint === 'string'
      ? ((scene as {chromeKickerHint?: string}).chromeKickerHint as string)
      : undefined;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      {...(scene.heading !== undefined ? {heading: scene.heading} : {})}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      sceneType="query"
      {...(chromeKickerHint !== undefined ? {chromeKickerHint} : {})}
    >
      <AbsoluteFill>
        {/* ─── editor pane ─────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            left: editorX,
            top: topY,
            width: editorW,
            height: safeH,
            opacity: winOpacity,
            transform: `scale(${interpolate(winSpring, [0, 1], [0.975, 1])})`,
            transformOrigin: 'top left',
            borderRadius: 16,
            overflow: 'hidden',
            background: bg.panel,
            border: `1.5px solid ${bg.line}`,
            boxShadow: `0 44px 110px -34px #000000, 0 0 0 1px ${glow(accentHex, 0.12)}`,
          }}
        >
          {/* editor title bar — traffic-light dots + dialect badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 22px',
              height: editorHeaderH,
              background: bg.panelHi,
              borderBottom: `1px solid ${bg.line}`,
            }}
          >
            <div style={{display: 'flex', gap: 8}}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <div
                  key={c}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: c,
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: 13,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: ink.mid,
                marginLeft: 8,
              }}
            >
              {dialectLabel[dialect]}
            </div>
          </div>

          {/* editor body — line gutter + tokenized text */}
          <div
            style={{
              padding: `${editorPadY}px 0`,
              fontFamily: monoFamily,
              fontSize,
              lineHeight: `${lineH}px`,
            }}
          >
            {lines.map((line, i) => {
              const {opacity, tx} = lineEnter(i);
              if (opacity <= 0) return null;
              const tokens = tokenize(line.text, dialect);
              const isCaretLine = i === caretLineIdx;
              const isFocused = !!(line.revealId && focusIds.has(line.revealId));
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    opacity,
                    transform: `translateX(${tx}px)`,
                    background: isFocused ? glow(accentHex, 0.09) : 'transparent',
                    borderLeft: `3px solid ${isFocused ? accentHex : 'transparent'}`,
                  }}
                >
                  <span
                    style={{
                      width: gutterW,
                      textAlign: 'right',
                      paddingRight: 18,
                      color: ink.faint,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{flex: 1, whiteSpace: 'pre', display: 'inline-block'}}>
                    {tokens.map((t, j) => (
                      <span key={j} style={{color: tokenColor(t.kind, ink), fontStyle: t.kind === 'comment' ? 'italic' : 'normal'}}>
                        {t.text}
                      </span>
                    ))}
                    {isCaretLine && caretOn ? (
                      <span
                        style={{
                          display: 'inline-block',
                          width: Math.max(2, Math.round(fontSize * 0.08)),
                          height: Math.round(fontSize * 0.95),
                          marginLeft: 2,
                          verticalAlign: 'middle',
                          background: accentHex,
                          boxShadow: `0 0 8px ${glow(accentHex, 0.55)}`,
                        }}
                      />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {/* focused-line callout — floats just below the editor when the
              active beat focuses a line that carries a note. Sits inside
              the editor pane so it stays visually paired with the line.
              When no focus, the panel reserves its room with `null`. */}
          {activeNote ? (
            <div
              style={{
                position: 'absolute',
                left: 22 + gutterW,
                bottom: 18,
                right: 22,
                padding: '10px 14px',
                borderRadius: 10,
                background: glow(accentHex, 0.12),
                border: `1px solid ${glow(accentHex, 0.32)}`,
              }}
            >
              <FittedText
                text={activeNote.line.note ?? ''}
                maxWidth={editorW - 22 - gutterW - 28}
                basePx={17}
                floorPx={12}
                charAdvance={0.6}
                mode="shrink-wrap"
                maxLines={2}
                lineHeight={1.32}
                style={{
                  fontFamily: interFamily,
                  color: accentHex,
                  letterSpacing: 0.3,
                }}
              />
            </div>
          ) : null}
        </div>

        {/* ─── result pane ─────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            left: resultX,
            top: topY,
            width: resultW,
            height: safeH,
            opacity: winOpacity,
            transform: `scale(${interpolate(winSpring, [0, 1], [0.975, 1])})`,
            transformOrigin: 'top right',
            borderRadius: 16,
            overflow: 'hidden',
            background: bg.panel,
            border: `1.5px solid ${bg.line}`,
            boxShadow: `0 44px 110px -34px #000000`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* result header — label */}
          <div
            style={{
              padding: '20px 24px 12px',
              borderBottom: `1px solid ${bg.line}`,
              background: bg.panelHi,
            }}
          >
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: 13,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: ink.low,
              }}
            >
              {result.label ?? 'result'}
            </div>
          </div>

          {/* result body — by kind */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              position: 'relative',
            }}
          >
            <ResultBody
              scene={scene}
              result={result}
              resultBind={resultBind}
              style={style}
              accentHex={accentHex}
              beats={ts.beats}
              frame={frame}
              fps={fps}
              focusIds={focusIds}
            />
          </div>
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};

// --- the result body ────────────────────────────────────────────────────
// Pulled out as its own component to keep the switch by `result.kind` cleanly
// scoped — and to let each idiom own its own intra-pane layout without one
// idiom's geometry leaking into another's.

interface ResultBodyProps {
  scene: QueryScene;
  result: QueryResult;
  resultBind: string;
  style: ResolvedStyle;
  accentHex: string;
  beats: SceneRenderProps<QueryScene>['common']['ts']['beats'];
  frame: number;
  fps: number;
  focusIds: Set<string>;
}

const ResultBody: React.FC<ResultBodyProps> = ({
  scene,
  result,
  resultBind,
  style,
  accentHex,
  beats,
  frame,
  fps,
  focusIds,
}) => {
  const {ink} = style.tokens;
  void focusIds; // currently unused inside the panel; reserved for row focus.

  if (result.kind === 'counter') {
    const fmt = result.format ?? 'int';
    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
        <BoundValue
          beats={beats}
          bind={resultBind}
          format={fmt}
          style={{
            fontFamily: monoFamily,
            fontSize: 96,
            fontWeight: 600,
            color: ink.hi,
            lineHeight: 1,
            letterSpacing: -1,
          }}
        />
        {result.unit ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 22,
              color: accentHex,
              letterSpacing: 0.4,
            }}
          >
            {result.unit}
          </div>
        ) : null}
      </div>
    );
  }

  if (result.kind === 'gauge') {
    const fmt = result.format;
    const target = typeof result.value === 'number' ? result.value : 0;
    const threshold = result.threshold ?? 0.5;

    // Read the tween off the timeline directly — same path BoundValue
    // walks — so the arc is frame-exact with the displayed text.
    const v = tweenValue(beats, resultBind, frame, fps);
    void target;
    const clamped = Math.max(0, Math.min(1, v));
    const over = v >= threshold;
    const arcColor = over ? '#5fe8a4' : '#ff7d97'; // accent-green / accent-rose

    // Gauge-specific formatter: when the author leaves `format` unset, we
    // render at 2-decimal resolution so a 0.94 SLI reads as `0.94`, not the
    // rounded-to-tenths `0.9` `BoundValue`'s shared `MetricFormat` enum
    // would produce. An explicit `format` (int / float1 / percent) still
    // wins — that's the override knob for a gauge author who *wants* the
    // coarser shape (e.g. a 0–100% gauge with the `percent` format).
    const gaugeText = (val: number): string => {
      if (fmt === 'int') return String(Math.round(val));
      if (fmt === 'float1') return val.toFixed(1);
      if (fmt === 'percent') return `${Math.round(val * 100)}%`;
      return val.toFixed(2);
    };

    // Geometry — a 270deg arc swept from -135° to +135°, sized to the pane.
    const size = 240;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 18;
    const startA = -135;
    const sweep = 270;
    const endA = startA + sweep * clamped;

    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
        <div style={{position: 'relative', width: size, height: size}}>
          <svg width={size} height={size} style={{position: 'absolute', inset: 0}}>
            {/* track */}
            <path
              d={arcPath(cx, cy, r, startA, startA + sweep)}
              stroke={glow(ink.faint, 0.55)}
              strokeWidth={14}
              strokeLinecap="round"
              fill="none"
            />
            {/* fill */}
            {clamped > 0.002 ? (
              <path
                d={arcPath(cx, cy, r, startA, endA)}
                stroke={arcColor}
                strokeWidth={14}
                strokeLinecap="round"
                fill="none"
                style={{filter: `drop-shadow(0 0 8px ${glow(arcColor, 0.6)})`}}
              />
            ) : null}
            {/* threshold tick */}
            {(() => {
              const tickA = startA + sweep * Math.max(0, Math.min(1, threshold));
              const inner = polar(cx, cy, r - 12, tickA);
              const outer = polar(cx, cy, r + 12, tickA);
              return (
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={ink.mid}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })()}
          </svg>
          {/* value — centred over the arc */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                fontFamily: monoFamily,
                fontSize: 56,
                fontWeight: 600,
                color: ink.hi,
                lineHeight: 1,
                letterSpacing: -0.5,
              }}
            >
              {gaugeText(v)}
            </span>
            {result.unit ? (
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 14,
                  color: ink.low,
                  letterSpacing: 0.6,
                }}
              >
                {result.unit}
              </div>
            ) : null}
          </div>
        </div>
        {/* threshold caption — orients the viewer to the green/rose break */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 13,
            color: ink.low,
            letterSpacing: 0.4,
          }}
        >
          threshold {gaugeText(threshold)}
        </div>
      </div>
    );
  }

  if (result.kind === 'timeseries') {
    const samples = Array.isArray(result.value) && typeof (result.value as unknown[])[0] === 'number'
      ? (result.value as ReadonlyArray<number>)
      : [];
    // The sparkline reveals progressively across the scene: we draw the
    // path up to the active beat's start frame, scaled to the scene's
    // total length.
    const totalFrames = beats.reduce((n, b) => n + b.frames, 0);
    const visibleFrac = totalFrames > 0 ? Math.max(0, Math.min(1, frame / totalFrames)) : 1;
    const lastIdxFloat = (samples.length - 1) * visibleFrac;
    const lastIdx = Math.max(0, Math.min(samples.length - 1, Math.floor(lastIdxFloat)));

    const w = 320;
    const h = 160;
    const padX = 10;
    const padY = 14;
    const xs = (i: number) => padX + ((w - padX * 2) * i) / Math.max(1, samples.length - 1);
    const lo = Math.min(...samples, 0);
    const hi = Math.max(...samples, 1);
    const span = Math.max(1e-9, hi - lo);
    const ys = (v: number) => padY + (h - padY * 2) * (1 - (v - lo) / span);

    const path = samples
      .slice(0, lastIdx + 1)
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`)
      .join(' ');
    const lastV = samples[lastIdx] ?? 0;

    // Pulsing dot — sine wave on the breath.
    const pulse = 0.7 + 0.3 * Math.sin((frame / fps) * 3.6);

    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
        <svg width={w} height={h}>
          <path
            d={path}
            stroke={accentHex}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{filter: `drop-shadow(0 0 6px ${glow(accentHex, 0.45)})`}}
          />
          {samples.length > 0 ? (
            <circle
              cx={xs(lastIdx)}
              cy={ys(lastV)}
              r={4 + pulse * 2}
              fill={accentHex}
              opacity={0.95}
            />
          ) : null}
        </svg>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: monoFamily,
              fontSize: 32,
              fontWeight: 600,
              color: ink.hi,
            }}
          >
            {Number.isInteger(lastV) ? String(lastV) : lastV.toFixed(2)}
          </span>
          {result.unit ? (
            <span style={{fontFamily: monoFamily, fontSize: 16, color: accentHex}}>
              {result.unit}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // table — N rows × M cols of strings. The first row is the header.
  // Rows reveal progressively by beat: row k is shown when at least k beats
  // have elapsed past the first. The active-beat row is highlighted.
  const matrix: ReadonlyArray<ReadonlyArray<string>> = Array.isArray(result.value)
    ? (result.value as ReadonlyArray<ReadonlyArray<string>>)
    : [];
  const header = matrix[0] ?? [];
  const rows = matrix.slice(1);
  const activeBeatIdx = activeBeatIndex(beats, frame);
  const rowsVisible = Math.max(0, Math.min(rows.length, activeBeatIdx + 1));

  const ncols = Math.max(1, header.length || (rows[0]?.length ?? 1));

  return (
    <div style={{width: '100%', display: 'flex', flexDirection: 'column'}}>
      {/* header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${ncols}, minmax(0, 1fr))`,
          gap: 2,
          padding: '6px 8px',
          borderBottom: `1px solid ${style.tokens.bg.line}`,
        }}
      >
        {header.map((h, i) => (
          <div
            key={i}
            style={{
              fontFamily: monoFamily,
              fontSize: 13,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: ink.low,
              textAlign: i === 0 ? 'left' : 'right',
              padding: '0 6px',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {/* rows */}
      {rows.slice(0, rowsVisible).map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${ncols}, minmax(0, 1fr))`,
            gap: 2,
            padding: '10px 8px',
            borderBottom: `1px solid ${glow(style.tokens.bg.line, 0.4)}`,
            background: ri === rowsVisible - 1 ? glow(accentHex, 0.06) : 'transparent',
          }}
        >
          {Array.from({length: ncols}, (_, ci) => (
            <div
              key={ci}
              style={{
                fontFamily: monoFamily,
                fontSize: 18,
                color: ci === 0 ? ink.hi : accentHex,
                textAlign: ci === 0 ? 'left' : 'right',
                padding: '0 6px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row[ci] ?? ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default QuerySceneComponent;
