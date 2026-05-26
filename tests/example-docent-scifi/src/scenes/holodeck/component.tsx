// HolodeckScene — a minimal third-party scene component.
//
// The acceptance test does NOT need this to be visually polished — it needs
// to prove that the kit can register a scene type from a package other than
// @docent/core and drive it through the render pipeline. A simple panel with
// the scene's declared fields, fading in over the scene's lifetime, suffices.

import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

import type {SceneRenderProps} from '@docent/kit';

import type {HolodeckSceneSpec} from './schema';

export const HolodeckSceneComponent: React.FC<
  SceneRenderProps<HolodeckSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 24], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const t = scene.title ?? 'HOLODECK';
  const k = scene.kicker ?? '— THIRD-PARTY SCENE —';

  return (
    <AbsoluteFill
      style={{
        background: '#0a0420',
        color: '#e6f3ff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        opacity: enter,
      }}
    >
      <div
        style={{
          color: '#7af8ff',
          letterSpacing: 4,
          fontSize: 22,
          marginBottom: 32,
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 700,
          color: '#c0aaff',
          textShadow: '0 0 24px rgba(192,170,255,0.55)',
          textAlign: 'center',
        }}
      >
        {t}
      </div>
      {scene.subtitle ? (
        <div
          style={{
            marginTop: 28,
            fontSize: 28,
            color: '#aab8ff',
            textAlign: 'center',
            maxWidth: 1200,
          }}
        >
          {scene.subtitle}
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          right: 64,
          fontSize: 16,
          color: '#7af8ff',
          opacity: 0.6,
        }}
      >
        scene {common.sceneIndex + 1} of {common.sceneCount}
      </div>
    </AbsoluteFill>
  );
};
