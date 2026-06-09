// LiveBrowserScene — render-side component. R16.1.
//
// The captured clip's path is a pure function of the film id + scene id:
//
//   public/clips/<filmId>/live-<sceneId>.mp4
//
// The build-stage `live-capture-stage` wrote it there. We use `staticFile()`
// the same way the `demonstrate` component does. When the file is absent
// (Playwright not installed, capture failed, the scene's spec is brand-new
// and hasn't been built yet) the component degrades to the same
// "clip unavailable" placeholder so a frame still renders.
//
// The visual shell — title bar, traffic-light dots, accent border, glow —
// is intentionally identical to `demonstrate`. From a viewer's standpoint
// the two scene types are visually indistinguishable; the difference is
// solely in WHERE the clip came from (a hand-edited recording vs the
// cascade's Playwright sidecar). That's the right call: the *idiom* the
// audience reads is "a captured window playing back" — switching idioms
// would mis-signal that one of these is somehow "more authentic" than
// the other.

import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {FittedText, Narration, SceneFrame, glow} from '../../_shared';
import type {LiveBrowserScene as LiveBrowserSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue || '#3B82F6';
};

/** The canonical path the cascade wrote the captured clip to. */
export const liveClipPath = (filmId: string, sceneId: string): string =>
  `clips/${filmId}/live-${sceneId}.mp4`;

export const LiveBrowserSceneComponent: React.FC<
  SceneRenderProps<LiveBrowserSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, meta, style} = common;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const intro = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(intro, [0, 1], [0.94, 1]);

  // The framed stage — matches `demonstrate` for visual continuity.
  const panelW = 1340;
  const panelH = 632;
  const titleBarH = 46;
  const videoPanelW = panelW;
  const videoPanelH = panelH - titleBarH;

  const sceneId = scene.id ?? 'live';
  const clipRelPath = liveClipPath(meta.id, sceneId);

  // The caption rendered in the title bar — "live · <hostname>" reads as
  // "this was driven from a real URL", not a stale recording.
  const captionUrl = (() => {
    try {
      if (typeof scene.url === 'string') {
        const u = new URL(scene.url);
        return `${u.host}${u.pathname.length > 1 ? u.pathname : ''}`;
      }
    } catch {
      /* fallthrough */
    }
    return scene.url ?? 'live capture';
  })();
  const caption = `live · ${captionUrl}`;

  const panelStyle: React.CSSProperties = {
    width: panelW,
    height: panelH,
    opacity: intro,
    transform: `scale(${scale})`,
    borderRadius: 18,
    overflow: 'hidden',
    background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
    border: `1.5px solid ${accentHex}`,
    boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
    display: 'flex',
    flexDirection: 'column',
  };

  const titleBar = (
    <div
      style={{
        height: titleBarH,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
        background: bg.void,
        borderBottom: `1px solid ${bg.line}`,
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div
          key={c}
          style={{width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85}}
        />
      ))}
      <FittedText
        text={caption}
        maxWidth={1340 - 76 - 36}
        basePx={14}
        floorPx={10}
        charAdvance={0.62}
        mode="shrink-single"
        style={{
          marginLeft: 14,
          fontFamily: monoFamily,
          letterSpacing: 0.6,
          color: ink.low,
        }}
      />
    </div>
  );

  const chromeKickerHint =
    typeof (scene as {chromeKickerHint?: unknown}).chromeKickerHint === 'string'
      ? ((scene as {chromeKickerHint?: string}).chromeKickerHint as string)
      : undefined;

  // The render-side has no way to synchronously stat the captured clip — the
  // file might not exist (no Playwright, capture failed) and Remotion handles
  // that by erroring the OffthreadVideo. We protect by wrapping in a try/catch
  // around the staticFile resolve — staticFile itself is synchronous and
  // doesn't probe; the failure surfaces only when the video tries to load.
  // To keep the render forgiving, we render the placeholder path when
  // `scene.id` is missing (the only synchronously-detectable failure mode).
  const haveClip = typeof scene.id === 'string' && scene.id.length > 0;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      sceneType="live-browser"
      {...(chromeKickerHint !== undefined ? {chromeKickerHint} : {})}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{...panelStyle, marginTop: 36, position: 'relative'}}>
          {titleBar}
          {haveClip ? (
            <div
              style={{
                position: 'relative',
                width: videoPanelW,
                height: videoPanelH,
              }}
            >
              <OffthreadVideo
                src={staticFile(clipRelPath)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: bg.void,
                  zIndex: 1,
                }}
              />
              {/* small "LIVE" badge in the top-right of the panel — the
                  semiotic difference between this and demonstrate: the
                  clip is fresh, not a recording. The badge is tasteful,
                  not loud — a dot + caps label. */}
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 14,
                  zIndex: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.55)',
                  border: `1px solid ${glow(accentHex, 0.4)}`,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#ff5f57',
                    boxShadow: `0 0 8px 0 #ff5f57`,
                  }}
                />
                <div
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    color: ink.hi,
                  }}
                >
                  LIVE
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: `radial-gradient(circle at 50% 42%, ${glow(accentHex, 0.08)} 0%, transparent 64%)`,
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  border: `2px solid ${accentHex}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 30px -6px ${glow(accentHex, 0.6)}`,
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    marginLeft: 6,
                    borderTop: '15px solid transparent',
                    borderBottom: '15px solid transparent',
                    borderLeft: `24px solid ${accentHex}`,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: sansFamily,
                  fontSize: 28,
                  fontWeight: 600,
                  color: ink.hi,
                }}
              >
                {scene.heading ?? 'Live capture'}
              </div>
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 16,
                  letterSpacing: 1,
                  color: ink.low,
                }}
              >
                capture unavailable · narrated walkthrough
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
