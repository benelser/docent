// JSON Schema fragment for the `timeline` scene's per-type spec branch.
//
// Contributed to the computed film schema by the timeline plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// A timeline plots events on a real date axis: the gaps between events are
// part of the argument. `axis.start` and `axis.end` are date strings the
// engine parses (ISO "2017-06-12", year-only "1914", or month-year
// "Jun 2025"); `ticks` are optional date strings to label on the axis
// (auto-spaced if omitted). `events` are pinned to a parsed date and reveal
// on their beat; `spans` are horizontal bars between two dates, useful for
// eras / wars / treaty periods. Cross-field invariants (dates parse, dates
// fall within the axis, ids unique, end > start) live in ./validate.ts;
// the schema enforces the shape, the validator enforces the meaning.

import type {JSONSchema7} from 'json-schema';

const dateString: JSONSchema7 = {
  type: 'string',
  minLength: 1,
  description:
    'a parseable date string — ISO "YYYY-MM-DD", month-year "Jun 2025" / "2025-06", or year-only "1914". Phrases like "early 2024" or "during the war" are rejected by the parser.',
};

const embeddedSceneSchema: JSONSchema7 = {
  type: 'object',
  description:
    'an embedded compositional scene rendered statically inside the event card. Allowlist: venn, quantities, compare, structure.',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      description: 'the embed scene type.',
    },
    id: {type: 'string'},
    caption: {type: 'string'},
  },
  additionalProperties: true,
};

const eventSchema: JSONSchema7 = {
  type: 'object',
  required: ['id', 'date', 'label'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'stable id; unique within the scene; used by reveal/focus.',
    },
    date: {
      ...dateString,
      description:
        'a parseable date the event pins to. Must lie within [axis.start, axis.end].',
    },
    label: {
      type: 'string',
      minLength: 1,
      description: 'the event headline drawn on the card above the axis.',
    },
    sub: {
      type: 'string',
      minLength: 1,
      description: 'optional second line beneath the event label.',
    },
    lane: {
      type: 'integer',
      minimum: 0,
      description:
        'vertical lane (0..N) — stacks events above the axis when they cluster.',
    },
    embed: embeddedSceneSchema,
  },
};

const spanSchema: JSONSchema7 = {
  type: 'object',
  required: ['id', 'from', 'to', 'label'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'stable id; unique within the scene; used by reveal/focus.',
    },
    from: {
      ...dateString,
      description: 'span start date — must lie within [axis.start, axis.end].',
    },
    to: {
      ...dateString,
      description:
        'span end date — must lie within [axis.start, axis.end] and not precede `from`.',
    },
    label: {
      type: 'string',
      minLength: 1,
      description: 'the bar label drawn inside the span — the "war years", the era, the regime.',
    },
    lane: {
      type: 'integer',
      minimum: 0,
      description:
        'vertical lane (0..N) — stacks spans below the axis when they overlap.',
    },
  },
};

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'timeline scenes — events plotted on a real date axis. Progression renders ordinal stages; timeline renders actual dates with the proportional gap between them visible on screen. `axis.start`/`axis.end` define the span; `events` are dated markers, `spans` are horizontal bars between two dates (eras, wars, treaty periods). The time axis is load-bearing — the gaps carry the argument, the dates must be real.',
  required: ['axis'],
  properties: {
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE LONG GAP').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
    axis: {
      type: 'object',
      required: ['start', 'end'],
      description:
        'the date range the timeline spans. `start` / `end` are parseable date strings; `ticks` (optional) are extra labelled dates on the axis (auto-spaced when omitted).',
      properties: {
        start: dateString,
        end: dateString,
        ticks: {
          type: 'array',
          description:
            'optional explicit tick labels — each a parseable date string falling within [start, end].',
          items: dateString,
        },
      },
    },
    events: {
      type: 'array',
      description:
        'dated markers along the axis. Each pinned to a parsed date; `lane` stacks them vertically when they cluster.',
      items: eventSchema,
    },
    spans: {
      type: 'array',
      description:
        'horizontal bars between two dates — eras, wars, treaty periods. `from <= to`, both within the axis bounds.',
      items: spanSchema,
    },
  },
};

export default schema;
