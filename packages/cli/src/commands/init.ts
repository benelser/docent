// `docent init <film-id>` — scaffold a starter film spec.
//
// The single biggest first-touch friction in the published flow is: a new
// user runs `bunx docent help`, sees `build <film-id>`, and has no idea
// what `films/<id>.json` should look like. They have to read the schema
// in node_modules or hunt for examples in the GitHub repo. This command
// closes that gap: it drops a working 4-scene starter spec at
// `films/<film-id>.json` and prints the next step.

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

export interface InitArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
  readonly force?: boolean;
}

const log = (s: string): void => process.stdout.write(`${s}\n`);

const starterSpec = (filmId: string): unknown => ({
  meta: {
    id: filmId,
    title: 'Your subject — make it one phrase',
    subject: 'the one-line description that goes under the title',
    fps: 30,
    voice: 'af_heart',
  },
  scenes: [
    {
      type: 'frame',
      kicker: 'DOCENT // FILM',
      title: 'Your subject — make it one phrase',
      tagline: 'A one-line framing of why this matters.',
      footnote: 'context note · author · date',
      narration:
        'Open with the question. State the subject. Tell the viewer in one breath what they will know in three minutes.',
    },
    {
      type: 'structure',
      kicker: '01 // THE PARTS',
      heading: 'What the subject is made of',
      nodes: [
        {id: 'a', label: 'First part', sub: 'what it does'},
        {id: 'b', label: 'Second part', sub: 'what it does'},
        {id: 'c', label: 'Third part', sub: 'what it does'},
      ],
      edges: [
        {id: 'ab', from: 'a', to: 'b', kind: 'relation', label: 'flows into'},
        {id: 'bc', from: 'b', to: 'c', kind: 'relation', label: 'returns to'},
      ],
      narration:
        'Name the components. Show how they connect. The diagram does the heavy lifting — narration just walks the viewer through what their eye is already on.',
    },
    {
      type: 'tension',
      kicker: '02 // THE TRADE-OFF',
      heading: 'What this choice costs',
      nodes: [
        {id: 'c1', label: 'The chosen path', sub: 'why this one'},
        {id: 'r1', label: 'A real alternative', sub: 'why it was rejected', kind: 'rejected'},
        {id: 'k1', label: 'A residual risk', sub: 'what the choice did not resolve', kind: 'risk'},
      ],
      narration:
        'Every design names what it is NOT. Surface the alternative the author considered and rejected. Name the risk the chosen path still carries.',
    },
    {
      type: 'recap',
      kicker: '03 // RECAP',
      heading: 'The one sentence',
      points: [
        'The first thing to remember.',
        'The second thing to remember.',
        'The single sentence that carries off the page.',
      ],
      narration:
        'Restate the through-line. Three points, each short enough to survive the viewer leaving the page.',
    },
  ],
});

export const runInit = async (args: InitArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (existsSync(specPath) && !args.force) {
    log(`\x1b[31m✗ ${specPath} already exists. Pass --force to overwrite.\x1b[0m`);
    return 1;
  }

  mkdirSync(dirname(specPath), {recursive: true});
  writeFileSync(specPath, JSON.stringify(starterSpec(args.filmId), null, 2), 'utf-8');

  log(`\x1b[32m✓ wrote ${specPath}\x1b[0m`);
  log('');
  log('  Next:');
  log(`    \x1b[36mbunx docent validate ${args.filmId}\x1b[0m   — check the spec`);
  log(`    \x1b[36mbunx docent build ${args.filmId}\x1b[0m       — render to out/${args.filmId}.mp4`);
  log('');
  log('  See every scene type:');
  log('    \x1b[36mbunx docent scene-fit list\x1b[0m');
  return 0;
};
