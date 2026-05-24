import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {glow} from '../theme';
import type {DesignTokens, ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {STAGE, resolveLayout} from '../engine/layout';
import {activeBeatIndex, type Node, type SceneProps} from '../engine/spec';

// TensionScene — the trade-off ledger.
//
// A tension scene's job is to make a *choice* legible: this path was taken,
// these alternatives were rejected, this risk survives. The layout sorts the
// scene's nodes into three sworn columns of a ledger so the verdict reads at
// a glance: CHOSEN on the left, REJECTED on the right, RISKS pinned in a band
// below. Authors keep declaring `kind: 'rejected'` and `kind: 'risk'`; the
// renderer maps `kind` onto the ledger lane, so the spec contract is unchanged
// — the grid `col`/`row` is ignored here (the ledger owns placement).
//
// Two registers, both built from the same primitives so they read as one
// family with two voices rather than two scenes:
//
//   sketch (default for `type: 'tension'` with no treatment, or explicit
//     `treatment: 'sketch'`) — the dark register. Sits inside the same parallax
//     space, dotted grid, vignette, kicker, and progress chrome as every other
//     docent scene; the trade-off itself is the diagram.
//
//   whiteboard (explicit `treatment: 'whiteboard'`) — the light register. A
//     cream paper backdrop, deep marker-blue ink, drop-shadow card facets. The
//     chrome is rebuilt locally with the same vocabulary (kicker, heading,
//     progress dots, the docent wordmark) but on paper.
//
// The verdict marks (a green diamond on CHOSEN, a red ✕ on REJECTED, an amber
// ! on RISK) and the typographic column headers carry the meaning so the same
// shape says "this is the trade-off" in either register.

// ----- register palette -----------------------------------------------------
//
// Both registers are described by one shape. The renderer never branches on
// the register name past this table: every colour, shadow, and font weight is
// read off the active register.

type Register = {
  // surface
  base: string; // page / void backdrop fill
  surface: string; // card body fill
  surfaceHi: string; // top-of-card highlight in the body gradient
  surfaceDim: string; // rejected-card body fill (visibly muted)
  // strokes & dividers
  divider: string; // vertical "vs" rule between chosen/rejected
  hairline: string; // header underline / band separator
  // ink
  inkHi: string; // primary text
  inkMid: string; // sub-text
  inkLow: string; // muted (e.g. rejected sub-text)
  inkFaint: string; // wordmark, dim chrome
  // accents (verdict marks)
  inkChosen: string; // the diamond on a chosen card / column header
  inkRejected: string; // the ✕ on a rejected card / column header
  inkRisk: string; // the ! on a risk card / band header
  // shadows
  cardShadow: string; // CSS box-shadow value applied to every card
  cardShadowFocus: string; // shadow when state === 'focus'
  // tag tile fill / stroke (the verdict pill in each card's corner)
  pillFill: (hex: string) => string;
  pillStroke: (hex: string) => string;
  // typography
  headingFamily: string;
  // wordmark / kicker accent of brand colour (chrome only)
  brandFamily: string;
  brandLetterSpacing: number;
};

// The sketch (dark) register is built from the active token bundle so a
// preset switch (e.g. paper → engineering) re-skins the ledger without code
// changes. The verdict accent hexes (chosen green, risk rose) read from
// `tokens.accent` so they track the palette family too.
const buildSketch = (tokens: DesignTokens): Register => ({
  base: tokens.bg.base,
  surface: tokens.bg.panel,
  surfaceHi: tokens.bg.panelHi,
  surfaceDim: '#0e1218',
  divider: tokens.bg.line,
  hairline: tokens.bg.line,
  inkHi: tokens.ink.hi,
  inkMid: tokens.ink.mid,
  inkLow: tokens.ink.low,
  inkFaint: tokens.ink.faint,
  inkChosen: tokens.accent.green,
  inkRejected: '#8c98ad', // a cool graphite — visibly desaturated
  inkRisk: tokens.accent.rose,
  cardShadow: `0 18px 44px -24px #000000cc, inset 0 1px 0 ${glow('#ffffff', 0.04)}`,
  // The sketch register computes its focus shadow inline (the accent glow
  // breathes with the active beat), so this is only a non-empty fallback for
  // any future caller that reads it directly.
  cardShadowFocus: `0 22px 56px -20px #000000d0, inset 0 1px 0 ${glow('#ffffff', 0.05)}`,
  pillFill: (hex) => glow(hex, 0.12),
  pillStroke: (hex) => glow(hex, 0.32),
  headingFamily: interFamily,
  brandFamily: monoFamily,
  brandLetterSpacing: 3,
});

const WHITEBOARD: Register = {
  base: '#f4eedf', // warm cream paper
  surface: '#fffdf6', // clean inset where the marker sits
  surfaceHi: '#fffaf0',
  surfaceDim: '#ebe3d0', // visibly tired / set-aside
  divider: '#cbb98f', // pencil-ruled column divider
  hairline: '#b9a677',
  inkHi: '#15161a', // ink black
  inkMid: '#3a3d44',
  inkLow: '#6c727a', // graphite
  inkFaint: '#8a8472',
  inkChosen: '#2e7d4f', // marker green (deeper, reads on cream)
  inkRejected: '#6c727a', // graphite — muted, never red
  inkRisk: '#b3261e', // marker red
  cardShadow: '0 10px 24px -16px #0000003a, 0 1px 0 #00000010',
  cardShadowFocus: '0 16px 30px -14px #0000004a, 0 1px 0 #00000018',
  pillFill: (hex) => glow(hex, 0.14),
  pillStroke: (hex) => glow(hex, 0.55),
  headingFamily: interFamily,
  brandFamily: monoFamily,
  brandLetterSpacing: 3,
};

// ----- ledger geometry ------------------------------------------------------
//
// The ledger sits inside the STAGE the rest of docent's diagrams use, so
// nothing can drift outside the safe band. The horizontal split between the
// CHOSEN and REJECTED columns is fixed (with a gutter for the divider). The
// risk band, when present, takes the bottom strip; the chosen/rejected
// columns shrink to fit so nothing overflows.

const COLUMN_GAP = 110; // pixels between chosen/rejected — wide enough that the
//                       60-pixel "vs" pill sitting on the divider keeps a real
//                       ~25-pixel gutter to each column's cards.
const HEADER_H = 46; // height of a column header above its cards
const HEADER_GAP = 12; // air between a header and its first card
const RISK_HEADER_H = 38; // the bottom band's header is shorter
const RISK_TOP_GAP = 56; // air between the upper ledger and the risk band — must
//                         be > 0 even when the upper column body fills, so the
//                         "RISK" header never gets stomped by a tall stack.
const CARD_GAP = 16; // vertical air between stacked cards in a column

// The ledger lane a node lives in. The mapping is rigid and explicit so a
// reader doesn't have to puzzle out the layout: kind decides lane.
type Lane = 'chosen' | 'rejected' | 'risk';
const laneOf = (n: Node): Lane =>
  n.kind === 'rejected' ? 'rejected' : n.kind === 'risk' ? 'risk' : 'chosen';

// Resolved geometry for one rendered card.
type Slot = {
  node: Node;
  lane: Lane;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Compute the full ledger layout. `nodes` is already kind-bucketed; the
// returned slots fit within STAGE and never overlap.
const layoutLedger = (nodes: Node[]): Slot[] => {
  const chosen = nodes.filter((n) => laneOf(n) === 'chosen');
  const rejected = nodes.filter((n) => laneOf(n) === 'rejected');
  const risks = nodes.filter((n) => laneOf(n) === 'risk');

  const hasRisk = risks.length > 0;
  const hasRejected = rejected.length > 0;

  // The upper ledger (CHOSEN + REJECTED) takes the full stage height when
  // there is no risk band; otherwise it cedes the bottom band to the risks.
  // The risk band height is chosen by content: one risk → a short strip; two
  // or three → a slightly taller band. Bounded so the upper ledger always
  // gets at least 60% of the stage.
  // A slimmer risk band — one risk is a single strip, not a panel. Bounded so
  // the upper ledger (where the trade-off itself lives) keeps the lion's share.
  const riskBandH = !hasRisk
    ? 0
    : Math.min(STAGE.h * 0.34, risks.length === 1 ? 138 : risks.length === 2 ? 160 : 180);
  const upperH = STAGE.h - (hasRisk ? riskBandH + RISK_TOP_GAP : 0);

  // Each column's body region (below the header).
  const upperBodyH = Math.max(0, upperH - HEADER_H - HEADER_GAP);

  // Column widths: split STAGE.w into chosen / rejected with a gutter. When
  // there is no rejected column (a tension scene that lists only a chosen
  // path + risks), CHOSEN takes the full stage width.
  const colW = hasRejected
    ? (STAGE.w - COLUMN_GAP) / 2
    : STAGE.w;
  const leftX = STAGE.x;
  const rightX = hasRejected ? STAGE.x + colW + COLUMN_GAP : STAGE.x; // unused if !hasRejected

  // Stack cards within a column body. Each card gets an even share of the
  // body's available height, minus the gaps between siblings. A column with
  // a single card centres it vertically inside the body.
  const stack = (
    list: Node[],
    x: number,
    w: number,
    bodyTop: number,
    bodyH: number,
  ): Slot[] => {
    if (list.length === 0) return [];
    const gaps = (list.length - 1) * CARD_GAP;
    const each = (bodyH - gaps) / list.length;
    // Ceiling — a single card must not balloon into a panel. Floor — the card
    // must never exceed its share of the body (an explicit hard cap, since a
    // soft floor like `max(96, …)` would push a four-card stack past the body
    // and into the RISK header below).
    const h = Math.min(180, each);
    // Re-centre vertically if the soft ceiling left air at the bottom.
    const usedH = h * list.length + gaps;
    const y0 = bodyTop + Math.max(0, (bodyH - usedH) / 2);
    return list.map((n, i) => ({
      node: n,
      lane: laneOf(n),
      x,
      y: y0 + i * (h + CARD_GAP),
      w,
      h,
    }));
  };

  const upperBodyTop = STAGE.y + HEADER_H + HEADER_GAP;

  const chosenSlots = stack(chosen, leftX, colW, upperBodyTop, upperBodyH);
  const rejectedSlots = hasRejected
    ? stack(rejected, rightX, colW, upperBodyTop, upperBodyH)
    : [];

  // The risk band lays its cards left-to-right (a horizontal stack). It owns
  // the bottom of the stage, with its own header above.
  const riskSlots: Slot[] = (() => {
    if (!hasRisk) return [];
    const bandTop = STAGE.y + upperH + RISK_TOP_GAP;
    const bandBodyTop = bandTop + RISK_HEADER_H + HEADER_GAP;
    const bandBodyH = Math.max(70, riskBandH - RISK_HEADER_H - HEADER_GAP);
    const gaps = (risks.length - 1) * CARD_GAP;
    const w = (STAGE.w - gaps) / risks.length;
    return risks.map((n, i) => ({
      node: n,
      lane: laneOf(n) as Lane,
      x: STAGE.x + i * (w + CARD_GAP),
      y: bandBodyTop,
      w,
      h: bandBodyH,
    }));
  })();

  return [...chosenSlots, ...rejectedSlots, ...riskSlots];
};

// ----- verdict mark ---------------------------------------------------------
//
// A small glyph that travels with each lane: diamond ◆ for CHOSEN, ✕ for
// REJECTED, ! for RISK. Drawn as a self-contained SVG so it scales cleanly
// with the column header and the card's corner pill.

const MarkDiamond: React.FC<{size: number; color: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M12 2 L22 12 L12 22 L2 12 Z"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinejoin="round"
    />
    <circle cx={12} cy={12} r={3.2} fill={color} />
  </svg>
);

const MarkCross: React.FC<{size: number; color: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M5 5 L19 19 M19 5 L5 19"
      fill="none"
      stroke={color}
      strokeWidth={2.8}
      strokeLinecap="round"
    />
  </svg>
);

const MarkBang: React.FC<{size: number; color: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M12 3 L21 20 L3 20 Z"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinejoin="round"
    />
    <rect x={11} y={9} width={2} height={6.5} rx={1} fill={color} />
    <circle cx={12} cy={17.5} r={1.3} fill={color} />
  </svg>
);

const MarkFor: React.FC<{lane: Lane; size: number; color: string}> = ({
  lane,
  size,
  color,
}) =>
  lane === 'chosen' ? (
    <MarkDiamond size={size} color={color} />
  ) : lane === 'rejected' ? (
    <MarkCross size={size} color={color} />
  ) : (
    <MarkBang size={size} color={color} />
  );

const COLUMN_LABEL: Record<Lane, string> = {
  chosen: 'CHOSEN',
  rejected: 'REJECTED',
  risk: 'RISK',
};

// ----- text autofit --------------------------------------------------------
//
// A card's inner width is fixed; long labels shrink until they fit. The
// estimator is the same conservative per-char advance Card.tsx uses, so a
// rejected card's long sub-line (the trade-off note) never spills past the
// pill or the edge of the column.

const fitFont = (text: string, base: number, innerW: number, floor = 14): number => {
  const est = text.length * base * 0.6;
  return est <= innerW ? base : Math.max(floor, innerW / (text.length * 0.6));
};

// ----- card -----------------------------------------------------------------
//
// One ledger entry. The same component for both registers; the active
// register's palette decides every surface, ink, and shadow.

type CardState = 'hidden' | 'normal' | 'focus' | 'dim';

const inkForLane = (lane: Lane, reg: Register): string =>
  lane === 'chosen'
    ? reg.inkChosen
    : lane === 'rejected'
      ? reg.inkRejected
      : reg.inkRisk;

const LedgerCard: React.FC<{
  slot: Slot;
  accentHex: string;
  state: CardState;
  enterFrame: number;
  reg: Register;
  isWhiteboard: boolean;
}> = ({slot, accentHex, state, enterFrame, reg, isWhiteboard}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const appear =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});

  if (state === 'hidden') return null;

  const {node, lane, x, y, w, h} = slot;
  // Chosen cards get the scene/node accent; rejected & risk cards take the
  // lane ink directly so the column's verdict reads off the colour too.
  const lineInk = lane === 'chosen' ? accentHex : inkForLane(lane, reg);

  const dim = state === 'dim' || lane === 'rejected';
  const focus = state === 'focus';
  const baseOpacity = dim ? 0.55 : 1;
  const opacity = appear * baseOpacity;
  const scale = interpolate(appear, [0, 1], [0.94, 1]);
  // Subtle breathing on focus — only the dark register breathes (paper
  // doesn't glow).
  const breathe =
    focus && !isWhiteboard ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;

  // Surface fill — rejected cards take the muted body; the rest take the
  // normal panel gradient. The whiteboard register paints the same shape
  // with the cream-on-paper palette.
  const surfaceCss =
    lane === 'rejected'
      ? reg.surfaceDim
      : isWhiteboard
        ? reg.surface
        : focus
          ? `radial-gradient(120% 140% at 0% 0%, ${glow(accentHex, 0.14)} 0%, ${reg.surfaceHi} 42%, ${reg.surface} 100%)`
          : `linear-gradient(158deg, ${reg.surfaceHi} 0%, ${reg.surface} 100%)`;

  // Shadow — focus lifts the card slightly. Sketch focus adds an accent
  // glow; whiteboard focus deepens the drop shadow.
  const shadowCss = focus
    ? isWhiteboard
      ? reg.cardShadowFocus
      : `0 0 0 1px ${glow(accentHex, 0.32)}, 0 24px 60px -22px ${glow(
          accentHex,
          0.42 + breathe * 0.22,
        )}, inset 0 1px 0 ${glow('#ffffff', 0.05)}`
    : reg.cardShadow;

  // Reserve room for the corner pill so the label can't collide with it.
  const innerW = w - 18 /* left rail */ - 26 * 2 /* hpad */ - 110 /* pill */;
  const labelBase = lane === 'risk' ? 28 : 28;
  const subBase = 16;
  // Aggressive floor — for monospaced sub lines (e.g. a snippet of code) the
  // 14-px default leaves room for ~25 chars before truncation. Lowering to
  // 10 lets ~40 chars fit, which is what "default_max_turns.unwrap_or_default()
  // — agent body runs forever" needs.
  const labelSize = fitFont(node.label, labelBase, innerW, 12);
  const subSize = node.sub ? fitFont(node.sub, subBase, innerW, 10) : subBase;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 16,
        background: surfaceCss,
        border: `1.5px solid ${
          isWhiteboard
            ? lane === 'rejected'
              ? reg.divider
              : focus
                ? lineInk
                : reg.hairline
            : focus
              ? lineInk
              : reg.divider
        }`,
        boxShadow: shadowCss,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        // Rejected entries get a subtle diagonal-stripe wash so they read as
        // "set aside" even at a thumbnail glance. The wash sits behind the
        // body fill (which is opaque) so it shows through only where the body
        // is the dim surface.
      }}
    >
      {/* left rail — the lane's ink. On rejected cards it's the graphite
          rejected ink; on risk cards the rose/red; on chosen the accent. */}
      <div
        style={{
          width: 6,
          alignSelf: 'stretch',
          background: lineInk,
          boxShadow: isWhiteboard
            ? 'none'
            : `0 0 20px ${glow(lineInk, focus ? 0.85 : 0.45)}`,
        }}
      />

      {/* body — label, sub, and the strikethrough on rejected entries */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: '0 26px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: interFamily,
            fontSize: labelSize,
            fontWeight: lane === 'chosen' ? 600 : 600,
            color: reg.inkHi,
            letterSpacing: -0.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            // The rejected lane is struck through — the page rejected this
            // path. The stroke colour matches the lane ink so it sits with
            // the rest of the card's palette.
            textDecoration: lane === 'rejected' ? 'line-through' : 'none',
            textDecorationColor: lane === 'rejected' ? reg.inkRejected : undefined,
            textDecorationThickness: lane === 'rejected' ? 2 : undefined,
          }}
        >
          {node.label}
        </div>
        {node.sub ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: subSize,
              color:
                lane === 'risk'
                  ? reg.inkRisk
                  : lane === 'rejected'
                    ? reg.inkLow
                    : focus
                      ? reg.inkMid
                      : reg.inkMid,
              letterSpacing: 0.2,
              // Wrap to 2 lines (multi-line ellipsis) so a long ledger
              // sub doesn't truncate mid-thought. Same pattern as Card.tsx.
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              lineHeight: 1.25,
            }}
          >
            {node.sub}
          </div>
        ) : null}
      </div>

      {/* corner pill — the lane's verdict mark + word. Sits with the same
          geometry on every card so the eye learns the shape. */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 9px 4px 7px',
          borderRadius: 8,
          background: reg.pillFill(lineInk),
          border: `1px solid ${reg.pillStroke(lineInk)}`,
        }}
      >
        <MarkFor lane={lane} size={14} color={lineInk} />
        <span
          style={{
            fontFamily: monoFamily,
            fontSize: 11.5,
            letterSpacing: 0.9,
            color: lineInk,
            fontWeight: 600,
          }}
        >
          {COLUMN_LABEL[lane]}
        </span>
      </div>
    </div>
  );
};

// ----- column header --------------------------------------------------------
//
// Sits above the column's cards with the verdict mark + word + a hairline
// underline. The mark is the same glyph as the card pill so the eye reads
// the column as a continuous statement.

const ColumnHeader: React.FC<{
  lane: Lane;
  x: number;
  y: number;
  w: number;
  reg: Register;
  intro: number;
}> = ({lane, x, y, w, reg, intro}) => {
  const color = inkForLane(lane, reg);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: HEADER_H,
        opacity: intro,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <MarkFor lane={lane} size={18} color={color} />
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 18,
            letterSpacing: 4,
            color,
            fontWeight: 600,
          }}
        >
          {COLUMN_LABEL[lane]}
        </div>
      </div>
      <div
        style={{
          height: 1.5,
          width: '100%',
          background: `linear-gradient(90deg, ${color} 0%, ${
            glow(color, 0)
          } 100%)`,
        }}
      />
    </div>
  );
};

// ----- chrome (kicker, heading, progress, wordmark) ------------------------
//
// The crisp scenes get this for free from SceneFrame. The whiteboard register
// needs the same vocabulary but rebuilt locally on cream paper. The sketch
// register also rebuilds it here (rather than using SceneFrame) so the two
// registers share one chrome implementation and stay in lockstep.

const Chrome: React.FC<{
  reg: Register;
  isWhiteboard: boolean;
  accentHex: string;
  kicker: string;
  heading?: string;
  sceneIndex: number;
  sceneCount: number;
  intro: number;
  progressDim: string;
}> = ({
  reg,
  isWhiteboard,
  accentHex,
  kicker,
  heading,
  sceneIndex,
  sceneCount,
  intro,
  progressDim,
}) => {
  return (
    <>
      {/* kicker + heading */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 86,
          opacity: intro,
          transform: `translateX(${(1 - intro) * -18}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: accentHex,
              boxShadow: isWhiteboard ? 'none' : `0 0 14px ${accentHex}`,
            }}
          />
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 21,
              letterSpacing: 4,
              color: accentHex,
              fontWeight: 500,
            }}
          >
            {kicker}
          </div>
        </div>
        {heading ? (
          // Mirrors SceneFrame's heading treatment — step the base size
          // by length, wrap to 2 lines, ellipsis-then-shrink past that.
          <FittedText
            text={heading}
            maxWidth={1480}
            basePx={
              heading.length <= 38 ? 54
              : heading.length <= 50 ? 46
              : heading.length <= 64 ? 40
              : 34
            }
            floorPx={26}
            charAdvance={0.55}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.04}
            style={{
              fontFamily: reg.headingFamily,
              fontWeight: 700,
              color: reg.inkHi,
              marginTop: 14,
              letterSpacing: -0.5,
            }}
          />
        ) : null}
      </div>

      {/* progress */}
      <div
        style={{
          position: 'absolute',
          left: 122,
          bottom: 66,
          display: 'flex',
          gap: 9,
        }}
      >
        {Array.from({length: sceneCount}).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === sceneIndex ? 42 : 20,
              height: 4,
              borderRadius: 2,
              background: i <= sceneIndex ? accentHex : progressDim,
              boxShadow:
                i === sceneIndex && !isWhiteboard
                  ? `0 0 10px ${accentHex}`
                  : 'none',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 122,
          bottom: 62,
          fontFamily: reg.brandFamily,
          fontSize: 17,
          color: reg.inkFaint,
          letterSpacing: reg.brandLetterSpacing,
        }}
      >
        docent
      </div>
    </>
  );
};

// ----- backdrop -------------------------------------------------------------
//
// The sketch register sits inside the same space the crisp scenes use — a
// starfield, a dotted grid, a vignette, twin accent washes. We rebuild it
// locally (rather than using SceneFrame) because the whiteboard register
// needs an utterly different backdrop, and one implementation here keeps the
// two registers in obvious lockstep.

// Seeded RNG so the starfield is identical every render (mirrors SceneFrame).
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const STARS = (() => {
  const r = rng(20260522);
  return Array.from({length: 130}, () => ({
    x: r() * 1920,
    y: r() * 1080,
    rad: 0.4 + r() * 1.6,
    o: 0.05 + r() * 0.45,
  }));
})();

const SketchBackdrop: React.FC<{
  accentHex: string;
  bgLine: string;
  bgVoid: string;
}> = ({accentHex, bgLine, bgVoid}) => (
  <>
    {/* starfield */}
    <AbsoluteFill>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.rad} fill="#aab6d0" opacity={s.o} />
        ))}
      </svg>
    </AbsoluteFill>
    {/* dotted grid */}
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(${bgLine} 1.15px, transparent 1.15px)`,
        backgroundSize: '46px 46px',
        opacity: 0.22,
      }}
    />
    {/* accent light — restrained: the tension scene's job is to compare, not
        to glow. */}
    <div
      style={{
        position: 'absolute',
        width: 1500,
        height: 1500,
        right: -380,
        top: -560,
        background: `radial-gradient(circle, ${glow(accentHex, 0.16)} 0%, transparent 60%)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1100,
        height: 1100,
        left: -360,
        bottom: -500,
        background: `radial-gradient(circle, ${glow(accentHex, 0.08)} 0%, transparent 64%)`,
      }}
    />
    {/* vignette */}
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 74% 66% at 50% 44%, transparent 38%, ${bgVoid}e0 100%)`,
      }}
    />
  </>
);

const WhiteboardBackdrop: React.FC = () => (
  <>
    {/* paper grain wash — two soft radial blooms warm one side, cool the
        other, so the cream isn't a flat plane. */}
    <div
      style={{
        position: 'absolute',
        width: 1500,
        height: 900,
        left: 220,
        top: 90,
        borderRadius: '50%',
        background:
          'radial-gradient(ellipse, #ece5d2 0%, transparent 70%)',
        opacity: 0.55,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 700,
        height: 460,
        right: 120,
        bottom: 110,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, #e7decb 0%, transparent 72%)',
        opacity: 0.4,
      }}
    />
    {/* paper vignette — softens the edges of the page so it doesn't read as
        a screen-filling rectangle. */}
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 78% 70% at 50% 48%, transparent 42%, #d9cfb8 100%)',
      }}
    />
  </>
);

// ----- the "vs" divider ----------------------------------------------------
//
// A vertical hairline between CHOSEN and REJECTED with the glyph "vs"
// centred along it. The line itself sits inside the upper ledger; the glyph
// sits just below the headers so it never collides with a card label.

const VsDivider: React.FC<{
  x: number;
  top: number;
  bottom: number;
  reg: Register;
  intro: number;
}> = ({x, top, bottom, reg, intro}) => {
  const mid = (top + bottom) / 2;
  return (
    <>
      {/* upper segment */}
      <div
        style={{
          position: 'absolute',
          left: x - 0.75,
          top,
          width: 1.5,
          height: mid - top - 26,
          background: `linear-gradient(180deg, ${reg.hairline}00 0%, ${reg.hairline} 100%)`,
          opacity: intro,
        }}
      />
      {/* lower segment */}
      <div
        style={{
          position: 'absolute',
          left: x - 0.75,
          top: mid + 26,
          width: 1.5,
          height: bottom - (mid + 26),
          background: `linear-gradient(180deg, ${reg.hairline} 0%, ${reg.hairline}00 100%)`,
          opacity: intro,
        }}
      />
      {/* the glyph */}
      <div
        style={{
          position: 'absolute',
          left: x - 30,
          top: mid - 17,
          width: 60,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: monoFamily,
          fontSize: 17,
          letterSpacing: 3,
          color: reg.inkLow,
          fontWeight: 600,
          opacity: intro,
          border: `1px solid ${reg.hairline}`,
          borderRadius: 999,
          background: reg.surface,
        }}
      >
        vs
      </div>
    </>
  );
};

// ----- the scene ------------------------------------------------------------

export const TensionScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const scene = ts.scene;
  const {bg, accent: accentTokens} = style.tokens;
  const accentOf = (k?: string): string =>
    (k && ((accentTokens as unknown) as Record<string, string>)[k]) || accentTokens.blue;
  const accentHex = accentOf(scene.accent);
  // Whiteboard treatment swaps the entire register: paper backdrop, dark ink,
  // drop-shadow cards. Anything else (sketch, or no treatment on a tension
  // scene) renders the dark contemplative register.
  const isWhiteboard = scene.treatment === 'whiteboard';
  const reg = isWhiteboard ? WHITEBOARD : buildSketch(style.tokens);

  // The spec keeps its grid (we still honour `wide` collisions through
  // resolveLayout so a malformed grid is still safe), but our placement
  // ignores col/row — kind drives lane assignment. We pass the resolved nodes
  // through unchanged so the spec contract is intact.
  const cols = scene.grid?.cols ?? 3;
  const nodes = resolveLayout(scene.nodes ?? [], cols);

  // Group nodes by lane and lay out the ledger.
  const slots = layoutLedger(nodes);
  const slotById: Record<string, Slot> = {};
  slots.forEach((s) => {
    slotById[s.node.id] = s;
  });

  // Reveal frames — first beat that names each node.
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id) => {
        if (revealFrame[id] === undefined) revealFrame[id] = b.from;
      });
    }
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  // Focus — the current beat's focus set.
  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const focusNodes = new Set([...focusIds].filter((id) => slotById[id]));
  const hasFocus = focusNodes.size > 0;
  const stateOf = (id: string): CardState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusNodes.has(id) ? 'focus' : 'dim';
    return 'normal';
  };

  // Chrome intro — same easing as SceneFrame.
  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ----- column header & divider geometry --------------------------------
  //
  // Read off the laid-out slots so headers always sit above their actual
  // column (which differs when there is no rejected column at all).
  const chosenSlots = slots.filter((s) => s.lane === 'chosen');
  const rejectedSlots = slots.filter((s) => s.lane === 'rejected');
  const riskSlots = slots.filter((s) => s.lane === 'risk');
  const hasRejected = rejectedSlots.length > 0;
  const hasRisk = riskSlots.length > 0;

  // The chosen column's x/width (always present). If there are no chosen
  // entries (rare — a tension scene with only rejected + risk), the layout
  // still occupies the left column; render the header there anyway.
  const chosenX = STAGE.x;
  const colW = hasRejected ? (STAGE.w - COLUMN_GAP) / 2 : STAGE.w;
  const rejectedX = STAGE.x + colW + COLUMN_GAP;

  // The risk band's header sits above its cards.
  const upperH = (() => {
    if (!hasRisk) return STAGE.h;
    // Mirror layoutLedger's slimmer band — keep the two computations in lockstep.
    const riskBandH = Math.min(
      STAGE.h * 0.34,
      riskSlots.length === 1 ? 138 : riskSlots.length === 2 ? 160 : 180,
    );
    return STAGE.h - (riskBandH + RISK_TOP_GAP);
  })();
  const riskHeaderY = STAGE.y + upperH + RISK_TOP_GAP;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: reg.base,
        fontFamily: interFamily,
      }}
    >
      {isWhiteboard ? (
        <WhiteboardBackdrop />
      ) : (
        <SketchBackdrop accentHex={accentHex} bgLine={bg.line} bgVoid={bg.void} />
      )}

      {/* upper-ledger column headers */}
      <ColumnHeader
        lane="chosen"
        x={chosenX}
        y={STAGE.y}
        w={colW}
        reg={reg}
        intro={intro}
      />
      {hasRejected ? (
        <ColumnHeader
          lane="rejected"
          x={rejectedX}
          y={STAGE.y}
          w={colW}
          reg={reg}
          intro={intro}
        />
      ) : null}

      {/* the vs divider sits inside the upper ledger only */}
      {hasRejected ? (
        <VsDivider
          x={STAGE.x + colW + COLUMN_GAP / 2}
          top={STAGE.y + HEADER_H + HEADER_GAP}
          bottom={STAGE.y + upperH}
          reg={reg}
          intro={intro}
        />
      ) : null}

      {/* risk-band header */}
      {hasRisk ? (
        <ColumnHeader
          lane="risk"
          x={STAGE.x}
          y={riskHeaderY}
          w={STAGE.w}
          reg={reg}
          intro={intro}
        />
      ) : null}

      {/* the cards */}
      {slots.map((slot) => (
        <LedgerCard
          key={slot.node.id}
          slot={slot}
          accentHex={accentOf(slot.node.accent ?? scene.accent)}
          state={stateOf(slot.node.id)}
          enterFrame={revealOf(slot.node.id)}
          reg={reg}
          isWhiteboard={isWhiteboard}
        />
      ))}

      {/* chrome — kicker, heading, progress, wordmark */}
      <Chrome
        reg={reg}
        isWhiteboard={isWhiteboard}
        accentHex={accentHex}
        kicker={scene.kicker}
        heading={scene.heading}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        intro={intro}
        progressDim={isWhiteboard ? '#d6cdb6' : bg.line}
      />

      <Narration style={style} beats={ts.beats} />
    </AbsoluteFill>
  );
};
