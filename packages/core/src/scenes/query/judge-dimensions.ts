// Judge dimensions for the `query` scene.
//
// No scene-specific judge dimensions today — the judge surface is
// film-wide. The empty array honors the ScenePlugin contract while leaving
// room for a future dimension like "the query reads as the analyst's
// actual keystrokes, not as a polished slide".

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
