// @bjelser/core/score — the R9 surface.
//
// `buildScorePrompt(engine, spec, schedule)` derives the IR; the four
// adapters (`template`, `aiva`, `udio`, `suno`) render the IR to the
// dialect each music-gen API speaks. The content-filter validator catches
// the /250 lesson set BEFORE emit.
//
// Third-party adapters depend only on the IR type from `@bjelser/kit`,
// not on this module — keeping the surface decoupled.

export {buildScorePrompt, wordsInFilm} from './build-prompt';

export {validatePromptBody, autofixPromptBody} from './validate-prompt';

export {renderTemplate} from './providers/template';
export {renderAiva} from './providers/aiva';
export {renderUdio} from './providers/udio';
export {renderSuno} from './providers/suno';

import type {RenderedScorePrompt, ScorePrompt, ScoreProvider} from '@bjelser/kit';
import {renderTemplate} from './providers/template';
import {renderAiva} from './providers/aiva';
import {renderUdio} from './providers/udio';
import {renderSuno} from './providers/suno';

/**
 * Dispatch table — pick the adapter by provider id. The CLI calls this;
 * a third-party adapter pack can either extend the dispatch or call
 * `renderTemplate` directly and post-process.
 */
export const renderScorePrompt = (
  provider: ScoreProvider,
  prompt: ScorePrompt,
): RenderedScorePrompt => {
  switch (provider) {
    case 'aiva':
      return renderAiva(prompt);
    case 'udio':
      return renderUdio(prompt);
    case 'suno':
      return renderSuno(prompt);
    case 'template':
    default:
      return renderTemplate(prompt);
  }
};
