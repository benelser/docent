// Judge dimensions contributed by the `quantities` scene type.
//
// MIGRATED from `packages/engine/cli/judge.ts`. As of v2.5.x, the judge pass
// had NO quantities-specific dimensions — the quantified-claim grading was
// folded into the film-wide rubric ("the film earns its keep with a
// quantified claim"), not a per-scene dimension. The array is intentionally
// empty in v1; future quantities-specific dimensions (e.g. "does the metric
// counting up across beats actually pay off the narration's claim?") slot
// in here without touching the protocol.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
