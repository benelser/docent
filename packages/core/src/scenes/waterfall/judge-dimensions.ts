// Judge dimensions for the `waterfall` scene.
//
// Empty in v1 — the film-wide judge rubric covers waterfall scenes
// alongside every other scene type. If a future build wants a waterfall-
// specific axis (e.g. "the focused span's attributes are the ones the
// argument actually needs", or "the depth structure mirrors the
// taxonomy claim"), this is where it lands.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
