// Render stage — the cascade's final move.
//
// Calls into Remotion via the bindings module. **Phase A.9** is the agent
// that authors `remotion-bindings.ts` (composition spec builder + frame
// schedule + bundle/renderMedia invocation). Until A.9 lands, this stage
// is a stub that throws so the cascade's earlier stages (validate, style,
// tts) remain exercisable in isolation.
//
// Contract once A.9 lands:
//   - The render stage accepts the spec, the resolved style, the TTS
//     manifest, and the engine (for scene component lookup), and returns
//     `{outPath, durationMs}`.
//   - It does NOT re-validate; the orchestrator guarantees validation
//     ran first.

import type {Engine} from '../engine';
import type {FilmSpec, RenderOptions, RenderResult} from '../protocols';
import type {ResolvedStyle} from '../types/style';
import type {TtsStageManifest} from './tts-stage';

export interface RenderStageInput {
  readonly spec: FilmSpec;
  readonly engine: Engine;
  readonly style: ResolvedStyle;
  readonly tts: TtsStageManifest;
  readonly opts: RenderOptions;
}

/**
 * Render the film. **Phase A.9 dependency — currently throws.**
 *
 * The shape of the call is fixed; what it does is filled in when the
 * Remotion bindings land. A caller that needs to exercise the earlier
 * stages (validate, style, tts) can do so by catching this throw.
 */
export const runRenderStage = async (
  _input: RenderStageInput,
): Promise<RenderResult> => {
  throw new Error(
    '[@docent/kit] render stage — not implemented (A.9 dependency). ' +
      'The cascade orchestrator (A.7) is wired and exercises validate + ' +
      'resolveStyle + tts; the Remotion bindings (A.9) land separately and ' +
      'fill in this stage with the composition-spec builder + renderMedia call.',
  );
};
