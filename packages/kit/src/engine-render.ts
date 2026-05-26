// Node-only render entry point.
//
// Lives outside `engine.ts` so the chromium-side webpack bundle never has to
// chase down `node:fs` / `node:child_process` references. CLI callers can
// import this module directly (`import {runRender} from '@docent/kit/
// engine-render'`) or call `engine.render(spec, opts)` which internally
// uses a webpack-blind dynamic import to find this file.
//
// Anything that needs `node:*` (the cascade orchestrator, render-stage,
// tts-stage) is reached from here.

import type {Engine} from './engine';
import type {FilmSpec, RenderOptions, RenderResult} from './protocols';
import {runCascade} from './cascade/orchestrator';

/**
 * Render a spec via the populated engine. Runs the full cascade (validate →
 * resolveStyle → tts → render).
 */
export const runRender = async (
  engine: Engine,
  spec: FilmSpec,
  opts: RenderOptions = {},
): Promise<RenderResult> => {
  return runCascade(spec, engine, opts);
};
