#!/usr/bin/env bun
// Validator unit smoke — exercise validatePromptBody + autofixPromptBody
// against the rule set the /250 trailer-music POC named.

// Import directly from the worktree's core/src so this runs against the
// in-flight code (the @bjelser/core node_modules symlink resolves to the
// MAIN repo's checkout, which doesn't have R9 yet).
import {validatePromptBody, autofixPromptBody} from '../../packages/core/src/score/validate-prompt';

type Case = {
  readonly name: string;
  readonly body: string;
  readonly expectErrors: ReadonlyArray<string>; // rule ids
  readonly expectWarnings?: ReadonlyArray<string>;
};

const CASES: ReadonlyArray<Case> = [
  {
    name: 'clean prompt is clean',
    body:
      'A cinematic orchestral score, 60 seconds long. At 10 seconds, ' +
      'strings layer. At 50 seconds, a boom. Style: no vocals, no electronic elements.',
    expectErrors: [],
  },
  {
    name: 'ALL-CAPS is flagged',
    body: 'A CINEMATIC score with TIMPANI and BRASS at the CLIMAX.',
    expectErrors: ['all-caps', 'all-caps', 'all-caps', 'all-caps'],
  },
  {
    name: 'banned proper noun is flagged',
    body: 'Cinematic, in the style of Hans Zimmer, with brass.',
    expectErrors: ['banned-term'],
  },
  {
    name: 'banned military is flagged',
    body: 'A driving military score with brass and percussion.',
    expectErrors: ['banned-term'],
  },
  {
    name: 'negated banned term is allowed',
    body: 'A cinematic instrumental score, no vocals, no lyrics, no choir.',
    expectErrors: [],
  },
  {
    name: 'word-cap fires above 500',
    body: ('word '.repeat(510)).trim(),
    expectErrors: [],
    expectWarnings: ['word-cap'],
  },
  {
    name: 'adjective stacking is flagged',
    body:
      // ~20% adjective-class words — > 18% threshold.
      'cinematic dramatic epic emotional powerful inspiring soaring' +
      ' grand cinematic dramatic epic emotional powerful inspiring soaring grand' +
      ' the and a but with',
    expectErrors: [],
    expectWarnings: ['adjective-stack'],
  },
];

const log = (s: string) => process.stdout.write(`${s}\n`);

let passed = 0;
let failed = 0;
for (const c of CASES) {
  const findings = validatePromptBody(c.body);
  const errorRules = findings.filter((f) => f.severity === 'error').map((f) => f.rule).sort();
  const warningRules = findings.filter((f) => f.severity === 'warning').map((f) => f.rule).sort();
  const wantErrors = [...c.expectErrors].sort();
  const wantWarnings = c.expectWarnings ? [...c.expectWarnings].sort() : undefined;

  const errorsOk = JSON.stringify(errorRules) === JSON.stringify(wantErrors);
  const warningsOk = wantWarnings === undefined || JSON.stringify(warningRules) === JSON.stringify(wantWarnings);

  if (errorsOk && warningsOk) {
    log(`  ✓ ${c.name}`);
    passed++;
  } else {
    log(`  ✗ ${c.name}`);
    log(`    wanted errors:   ${JSON.stringify(wantErrors)}`);
    log(`    got errors:      ${JSON.stringify(errorRules)}`);
    if (wantWarnings !== undefined) {
      log(`    wanted warnings: ${JSON.stringify(wantWarnings)}`);
      log(`    got warnings:    ${JSON.stringify(warningRules)}`);
    }
    failed++;
  }
}

// Autofix round-trip — the ALL-CAPS case should leave a clean body.
const dirty = 'A CINEMATIC score with TIMPANI and BRASS at the CLIMAX.';
const fixed = autofixPromptBody(dirty);
const stillErr = validatePromptBody(fixed.body).filter((f) => f.severity === 'error').length;
if (stillErr === 0) {
  log(`  ✓ autofix-roundtrip — ALL-CAPS becomes title case, no remaining errors`);
  passed++;
} else {
  log(`  ✗ autofix-roundtrip — ${stillErr} error(s) remain after autofix: ${fixed.body}`);
  failed++;
}

log('');
log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 2);
