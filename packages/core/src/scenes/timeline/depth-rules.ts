// Depthcheck rules for the `timeline` scene.
//
// Migrated from packages/engine/cli/depthcheck.ts — the `timeline-dates-real`
// finding. A phrase like "early 2024" or "during the war" fails: the time
// axis is load-bearing, the gaps between dates are part of the argument.
//
// The validator already HARD-FAILs on unparseable dates; this depth rule is
// the soft-warn layer that catches a spec author who slips a placeholder
// past the validator (e.g. via a future date format the parser is extended
// to accept). It walks every date on the scene (axis.start, axis.end,
// axis.ticks[], events[].date, spans[].from, spans[].to) and surfaces a
// finding if the parser rejects it OR the string carries non-month alpha
// content.

import type {DepthRule, DepthFinding} from '@docent/kit';

import {parseTimelineDate} from './_time';
import type {TimelineScene} from './validate';

const MONTH_OK =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;

const timelineDatesReal: DepthRule<TimelineScene> = {
  id: 'timeline-dates-real',
  description:
    'Timeline dates are real — every date parses, no "early 2024" / "during the war"',
  severity: 'warning',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const badDates: string[] = [];
    const checkDate = (label: string, value: unknown): void => {
      if (typeof value !== 'string') {
        badDates.push(`${label} (non-string)`);
        return;
      }
      if (parseTimelineDate(value) === null) {
        badDates.push(`${label} "${value}"`);
        return;
      }
      // Defensive — if the parser accepted it but it still carries
      // non-month alpha, fail the depth check.
      const alpha = value.replace(/[^A-Za-z]/g, '');
      if (alpha.length > 0 && !MONTH_OK.test(alpha)) {
        badDates.push(`${label} "${value}" (non-month alpha)`);
      }
    };

    if (scene.axis) {
      checkDate('axis.start', scene.axis.start);
      checkDate('axis.end', scene.axis.end);
      (scene.axis.ticks ?? []).forEach((t, i) =>
        checkDate(`axis.ticks[${i}]`, t),
      );
    }
    (scene.events ?? []).forEach((e) =>
      checkDate(`event "${e.id}".date`, e.date),
    );
    (scene.spans ?? []).forEach((sp) => {
      checkDate(`span "${sp.id}".from`, sp.from);
      checkDate(`span "${sp.id}".to`, sp.to);
    });

    if (badDates.length === 0) return null;
    const sceneIndex = ctx.sceneIndex ?? 0;
    return {
      ruleId: 'timeline-dates-real',
      path: `scenes[${sceneIndex}]`,
      message: `${badDates.length} unparseable date(s): ${badDates.slice(0, 5).join('; ')}${badDates.length > 5 ? '…' : ''}`,
      severity: 'warning',
      suggestion:
        'Replace placeholder phrases with real dates — ISO ("2017-06-12"), month-year ("Jun 2025"), or year-only ("1914").',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<TimelineScene>> = [
  timelineDatesReal,
];

export default depthRules;
