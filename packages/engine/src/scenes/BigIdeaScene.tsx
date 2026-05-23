import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import type {BigIdeaAnchor, SceneProps} from '../engine/spec';

// BigIdeaScene — the takeaway.
//
// The single sentence the viewer should leave with — the claim that survives
// if everything else is forgotten. Pure breathing room: one accent, one
// anchor, one long held pause. Not a verdict (the recap rules), not a
// summary; a takeaway. The contract is rigid (one sentence ≤ 20 words, held
// pace, positioned immediately before the recap); validate.ts enforces it.
//
// The author has freedom in treatment (`sketch` / `whiteboard` / default
// void), register (read off film meta), accent, palette, and the anchor
// kind. The renderer honours those knobs the way other scenes do: the
// SceneFrame parallax space is the default; `sketch` and `whiteboard`
// rebuild a paper-like backdrop locally. The kicker, heading, and progress
// chrome stay consistent with the rest of the film.

// ----- anchor renderers ----------------------------------------------------
//
// Each anchor kind is a small, self-contained renderer. The author picks the
// kind through the spec; the engine owns the pixels. All anchors share the
// same enter spring so they read as one family.

const GlyphAnchor: React.FC<{value: string; accentHex: string; isLight: boolean}> = ({
  value,
  accentHex,
  isLight,
}) => (
  <div
    style={{
      fontFamily: interFamily,
      fontSize: 220,
      fontWeight: 600,
      color: accentHex,
      letterSpacing: -2,
      lineHeight: 1,
      textShadow: isLight ? 'none' : `0 0 80px ${glow(accentHex, 0.55)}`,
    }}
  >
    {value}
  </div>
);

const EquationAnchor: React.FC<{value: string; accentHex: string; isLight: boolean}> = ({
  value,
  accentHex,
  isLight,
}) => (
  <div
    style={{
      fontFamily: monoFamily,
      fontSize: 88,
      fontWeight: 500,
      color: isLight ? '#15161a' : theme.ink.hi,
      letterSpacing: 1,
      padding: '22px 56px',
      border: `1.5px solid ${isLight ? '#cbb98f' : glow(accentHex, 0.45)}`,
      borderRadius: 18,
      background: isLight
        ? '#fffdf6'
        : `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
      boxShadow: isLight
        ? '0 10px 24px -16px #0000003a'
        : `0 24px 64px -20px ${glow(accentHex, 0.4)}`,
    }}
  >
    {value}
  </div>
);

const ImageAnchor: React.FC<{value: string; accentHex: string; isLight: boolean}> = ({
  value,
  accentHex,
  isLight,
}) => {
  // staticFile resolves under public/ — author can pass either a bare
  // filename (lives under public/figures/) or a full sub-path.
  const src = value.startsWith('figures/') || value.startsWith('/')
    ? staticFile(value.replace(/^\//, ''))
    : staticFile(`figures/${value}`);
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 18,
        background: isLight ? '#fffdf6' : `${theme.bg.panel}`,
        border: `1.5px solid ${isLight ? '#cbb98f' : glow(accentHex, 0.4)}`,
        boxShadow: isLight
          ? '0 10px 24px -16px #0000003a'
          : `0 24px 64px -20px ${glow(accentHex, 0.45)}`,
      }}
    >
      <Img
        src={src}
        style={{
          maxWidth: 540,
          maxHeight: 340,
          borderRadius: 10,
          display: 'block',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

// `chart-fragment` — a stripped, decorative chart shape: a sparkline of
// numeric pairs the author writes as "x1,y1; x2,y2; ..." in [0..1] space. The
// engine maps those into a small SVG and strokes them in the accent ink. This
// is not a chart scene — it carries no axes; it is the *fragment* a viewer
// remembers, the shape of a curve, no more.
const ChartFragmentAnchor: React.FC<{value: string; accentHex: string; isLight: boolean}> = ({
  value,
  accentHex,
  isLight,
}) => {
  const points: [number, number][] = value
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map((s) => Number(s.trim()));
      return [
        Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0,
        Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : 0,
      ] as [number, number];
    });
  if (points.length < 2) {
    // A malformed fragment falls back to a single stroke so the slot never
    // renders empty. The author should be flagged by validation in a future
    // iteration; today the anchor is best-effort.
    points.push([0, 0.5], [1, 0.5]);
  }
  const W = 540;
  const H = 220;
  const PAD = 18;
  const project = ([x, y]: [number, number]) => [
    PAD + x * (W - 2 * PAD),
    H - PAD - y * (H - 2 * PAD),
  ];
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${project(p).join(' ')}`)
    .join(' ');
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: isLight ? '#fffdf6' : `${theme.bg.panel}`,
        border: `1.5px solid ${isLight ? '#cbb98f' : glow(accentHex, 0.4)}`,
        boxShadow: isLight
          ? '0 10px 24px -16px #0000003a'
          : `0 24px 64px -20px ${glow(accentHex, 0.4)}`,
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path
          d={path}
          fill="none"
          stroke={accentHex}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            isLight ? undefined : {filter: `drop-shadow(0 0 8px ${glow(accentHex, 0.55)})`}
          }
        />
        {points.map((p, i) => {
          const [px, py] = project(p);
          return <circle key={i} cx={px} cy={py} r={5} fill={accentHex} />;
        })}
      </svg>
    </div>
  );
};

const Anchor: React.FC<{
  anchor: BigIdeaAnchor;
  accentHex: string;
  isLight: boolean;
}> = ({anchor, accentHex, isLight}) => {
  switch (anchor.kind) {
    case 'glyph':
      return <GlyphAnchor value={anchor.value} accentHex={accentHex} isLight={isLight} />;
    case 'equation':
      return <EquationAnchor value={anchor.value} accentHex={accentHex} isLight={isLight} />;
    case 'image':
      return <ImageAnchor value={anchor.value} accentHex={accentHex} isLight={isLight} />;
    case 'chart-fragment':
      return (
        <ChartFragmentAnchor value={anchor.value} accentHex={accentHex} isLight={isLight} />
      );
    default:
      return null;
  }
};

// ----- backdrops for sketch / whiteboard treatments ------------------------
//
// `sketch` and `whiteboard` re-skin the scene's surface. The crisp default
// uses SceneFrame's parallax space; the two paper registers paint locally so
// the scene is utterly different. Same vocabulary as TensionScene's twin
// registers — kept simple here because BigIdea is a single composition, not a
// ledger.

const WhiteboardBackdrop: React.FC = () => (
  <>
    <AbsoluteFill style={{backgroundColor: '#f4eedf'}} />
    <div
      style={{
        position: 'absolute',
        width: 1500,
        height: 900,
        left: 220,
        top: 90,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, #ece5d2 0%, transparent 70%)',
        opacity: 0.55,
      }}
    />
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 78% 70% at 50% 48%, transparent 42%, #d9cfb8 100%)',
      }}
    />
  </>
);

const SketchBackdrop: React.FC<{accentHex: string}> = ({accentHex}) => (
  <>
    <AbsoluteFill style={{backgroundColor: theme.bg.base}} />
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(${theme.bg.line} 1.15px, transparent 1.15px)`,
        backgroundSize: '46px 46px',
        opacity: 0.18,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1400,
        height: 1400,
        right: -300,
        top: -540,
        background: `radial-gradient(circle, ${glow(accentHex, 0.16)} 0%, transparent 60%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 74% 66% at 50% 44%, transparent 38%, ${theme.bg.void}e0 100%)`,
      }}
    />
  </>
);

// ----- the scene ------------------------------------------------------------

export const BigIdeaScene: React.FC<SceneProps> = ({ts, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
  const treatment = scene.treatment;
  const isLight = treatment === 'whiteboard';
  const isSketch = treatment === 'sketch';

  // The statement and anchor are the load-bearing fields. validate.ts forbids
  // a big-idea scene without a statement; the anchor is optional in the type
  // but every well-formed big-idea ships one. Authors who skip the anchor get
  // a clean type-only render.
  const statement = scene.statement ?? '';
  const anchor = scene.anchor;

  // Auto-fit the sentence — ≤ 20 words still varies in character count. The
  // step-down keeps the line within the safe band at every legal length.
  const fontSize =
    statement.length <= 60 ? 78 :
    statement.length <= 90 ? 66 :
    statement.length <= 120 ? 56 :
    48;

  // Enter springs — anchor first, sentence beneath. Two staggered springs so
  // the reader's eye lands on the anchor, then drops to the claim. Both ease
  // off well before the long held tail.
  const anchorEnter = spring({frame: frame - 8, fps, config: {damping: 200, mass: 1.4}});
  const sentenceEnter = spring({
    frame: frame - 28,
    fps,
    config: {damping: 200, mass: 1.2},
  });

  const body = (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 56,
        padding: '180px 200px 220px',
      }}
    >
      {/* visual anchor — the thing the eye lands on first */}
      {anchor ? (
        <div
          style={{
            opacity: anchorEnter,
            transform: `translateY(${(1 - anchorEnter) * 18}px) scale(${interpolate(
              anchorEnter,
              [0, 1],
              [0.92, 1],
            )})`,
          }}
        >
          <Anchor anchor={anchor} accentHex={accentHex} isLight={isLight} />
        </div>
      ) : null}

      {/* the sentence — centered, one accent, long held pause */}
      <div
        style={{
          maxWidth: 1480,
          textAlign: 'center',
          opacity: sentenceEnter,
          transform: `translateY(${(1 - sentenceEnter) * 14}px)`,
        }}
      >
        <div
          style={{
            fontFamily: interFamily,
            fontSize,
            fontWeight: 600,
            color: isLight ? '#15161a' : theme.ink.hi,
            letterSpacing: -0.6,
            lineHeight: 1.18,
            textShadow: isLight ? 'none' : `0 12px 60px ${glow(accentHex, 0.25)}`,
          }}
        >
          {statement}
        </div>

        {/* divider — a thin accent rule, the breath under the sentence */}
        <div
          style={{
            margin: '38px auto 0',
            width: interpolate(sentenceEnter, [0, 1], [0, 240]),
            height: 2,
            background: isLight
              ? '#b9a677'
              : `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
            opacity: sentenceEnter,
          }}
        />
      </div>
    </AbsoluteFill>
  );

  // The crisp default uses SceneFrame; sketch and whiteboard rebuild a local
  // backdrop so the paper register is honest. Either way the kicker /
  // heading / progress UI from SceneFrame stays — we drop into SceneFrame as
  // a transparent shell for the chrome and paint the backdrop behind it.
  if (isSketch || isLight) {
    // A locally-skinned backdrop. We still want the SceneFrame chrome (kicker,
    // heading, progress) so the scene reads as part of the film. The crisp
    // chrome is drawn over a fresh backdrop by re-using SceneFrame and
    // overpainting its background with the treatment's wash.
    return (
      <AbsoluteFill>
        {isLight ? <WhiteboardBackdrop /> : <SketchBackdrop accentHex={accentHex} />}
        <SceneFrame
          accentHex={accentHex}
          kicker={scene.kicker}
          heading={scene.heading}
          sceneIndex={sceneIndex}
          sceneCount={sceneCount}
          glowScale={isLight ? 0 : 0.6}
        >
          {body}
        </SceneFrame>
        <Narration beats={ts.beats} />
      </AbsoluteFill>
    );
  }

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      {body}
      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
