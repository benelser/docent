// Judge framework — Phase A.6.
//
// `collectJudgeDimensions(engine)` aggregates judge dimensions across every
// registered ScenePlugin's `judgeDimensions?` block. The judge surface (lives
// in `@docent/agent`, not here) calls this to compose its grading rubric: the
// kit is the registry, not the grader.
//
// The kit knows NOTHING about what a film's "quality" is — every dimension is
// contributed by a plugin (a `chart` scene contributes "axes are labelled";
// the narration feature contributes "narration earns the reveal"; etc.). The
// kit composes them.
//
// Returns a flat `JudgeDimension[]`. Duplicates (two plugins declaring the
// same `id`) are surfaced via warning prefixed in the `description` so the
// agent layer can decide how to render them. The kit does NOT throw on
// duplicate dimension ids — unlike `sceneType` / `presetName` / `providerId`
// the dimension id collision is a soft conflict (different plugins might
// legitimately grade against the same concept).

import type {Engine} from '../engine';
import type {JudgeDimension} from '../protocols';

/**
 * Collect every {@link JudgeDimension} contributed by every registered
 * {@link ScenePlugin}. The judge surface (lives in `@docent/agent`) calls
 * this to compose its grading rubric.
 *
 * Order is: scenes in registration order, dimensions in declaration order
 * within each scene plugin. Callers that want a stable order across runs
 * should sort by `id` themselves.
 *
 * Duplicates (two plugins declaring the same `id`) are NOT deduped here
 * — unlike `sceneType` / `presetName` / `providerId`, a dimension id
 * collision is a soft conflict (different plugins may legitimately grade
 * against the same concept). The agent layer decides how to render.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export function collectJudgeDimensions(engine: Engine): JudgeDimension[] {
  const dimensions: JudgeDimension[] = [];
  for (const plugin of engine.scenes.all()) {
    const declared = plugin.judgeDimensions;
    if (!declared || declared.length === 0) continue;
    for (const dim of declared) {
      dimensions.push(dim);
    }
  }
  return dimensions;
}
