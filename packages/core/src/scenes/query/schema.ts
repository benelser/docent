// JSON Schema fragment for the `query` scene's per-type spec branch.
//
// The `query` scene's native shape IS the observability primitive every
// lunch-and-learn on PromQL / LogQL / SQL / Jaeger query / KQL needs but
// no existing docent scene can render: a query being progressively
// typed/built next to a live result that evolves with it. Closeup is for
// source listings, not query DSLs; passage is for prose, not code; chart
// renders a curve but never the SQL behind it. This scene is the missing
// observability primitive.
//
// The split-pane layout is fixed: the query editor on the left (60% width)
// and the result panel on the right (40% width). Beats progressively
// reveal lines via `revealId` (a per-line opaque marker pulled into
// `beat.reveal`) and drive the result value via the existing `beat.set`
// directive — the same tween grammar `quantities` metrics ride.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "query scenes — a query being progressively typed (PromQL / LogQL / SQL / Jaeger / KQL) next to a live result that evolves with it. The split-pane is fixed: editor on the left, result panel on the right. Each line carries an optional `revealId`; a beat's `reveal: [<revealId>]` slides that line in. The result value rides the existing `beat.set` tween — `set: { <result.bind>: { to: <number> } }`.",
  required: ['dialect', 'query', 'result'],
  properties: {
    dialect: {
      type: 'string',
      enum: ['promql', 'logql', 'sql', 'jql', 'kql'],
      description:
        "the query DSL — drives the syntax highlighter. `sql` rides Prism's native sql grammar; `promql`, `logql`, `jql`, `kql` use the scene's hand-rolled, dialect-aware token classifier (PromQL doesn't have a native Prism mode and `prism-react-renderer` can't accept a custom grammar through props in v2; the in-scene tokenizer ships the highlight inline).",
    },
    query: {
      type: 'array',
      minItems: 1,
      description:
        'the query, split into lines. Each line is one item; the renderer numbers them in the gutter and applies dialect-aware syntax highlighting. A line with a `revealId` starts hidden and slides in (translateX -20 → 0 over 12 frames) when a beat lists that id in its `reveal`. A line WITHOUT a `revealId` is visible from frame 0 — the canonical pattern is a visible first line ("SELECT" / "sum(...)") plus reveal-gated trailing lines.',
      items: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            description:
              'one line of the query (no trailing newline). Tabs are advanced as 4 spaces by the renderer; indentation as spaces is preferred.',
          },
          revealId: {
            type: 'string',
            minLength: 1,
            description:
              "stable id surfaced to beats. A beat's `reveal: [<revealId>]` slides this line in. Lines without a revealId render from frame 0.",
          },
          note: {
            type: 'string',
            description:
              "sub-line annotation. When a beat's `focus: [<revealId>]` (or `reveal: [<revealId>]`) targets this line, the note floats to the right of the editor pane as a callout. Keep notes short — one phrase, ~10 words.",
          },
        },
      },
    },
    result: {
      type: 'object',
      required: ['kind', 'value'],
      additionalProperties: false,
      description:
        "the result panel — what to show alongside the query as it builds. The `kind` selects the visual idiom; `value` is the final value the result settles on. For `counter` and `gauge`, beats drive an animated count-up via `beat.set: { <bind>: { to: <n> } }` where `<bind>` is the scene's result bind key — see the `bind` property below.",
      properties: {
        kind: {
          type: 'string',
          enum: ['counter', 'gauge', 'table', 'timeseries'],
          description:
            'the result idiom. `counter` — one big number that ticks up (drives via `beat.set`). `gauge` — a 0..1 percentage gauge with a swept arc fill (drives via `beat.set`; thresholded color, see `threshold`). `table` — N rows × M cols of strings, revealed row by row across beats. `timeseries` — sparkline that evolves; `value` is an array of numbers.',
        },
        value: {
          description:
            'the final value the result settles on. For `counter` / `gauge`, a number (the target the `beat.set` tween eases toward). For `timeseries`, an array of numbers (the sparkline samples). For `table`, a 2-D string matrix (rows × cols) — the first row is the header.',
        },
        unit: {
          type: 'string',
          description: 'rendered next to the value (e.g. `ms`, `%`, `$`, `req/s`).',
        },
        label: {
          type: 'string',
          description:
            "the result panel's top label (e.g. `flow stability`, `error rate`). Drawn above the value in muted ink.",
        },
        bind: {
          type: 'string',
          description:
            "for `counter` and `gauge`: the `set` key the result tween reads from. A beat drives the count-up via `set: { <bind>: { to: <n> } }`. Defaults to the scene's `id` + `.value` when omitted — the recommended pattern is to set it explicitly so it reads cleanly in the spec.",
        },
        threshold: {
          type: 'number',
          description:
            "for `gauge`: the threshold the arc fill is colored against. When the current value is >= threshold the arc is accent-green; when below, accent-rose. Defaults to 0.5 — half-full. Authoring a flow-stability gauge against a 0.9 SLO means setting threshold: 0.9.",
        },
        format: {
          type: 'string',
          enum: ['int', 'float1', 'percent'],
          description:
            "for `counter` / `gauge`: the numeric format the count-up text renders in. Defaults to `float1` for gauges (the natural 0.94 form) and `int` for counters. Mirrors the `MetricFormat` shared with `quantities`.",
        },
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE QUERY').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
    dataSource: {
      type: 'object',
      description:
        "R16.2 — OPTIONAL live data source. When present, the cascade's data-fetch stage evaluates this against the named endpoint at build time and replaces `result.value` with the live scalar / vector. Falls back to the AUTHORED value when the endpoint is unreachable or returns no data — the film always renders, fresh or stale. The authored `result.value` is the canonical fallback; the live fetch is an enhancement, never a precondition.",
      required: ['kind', 'url'],
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['prometheus', 'loki'],
          description:
            'the endpoint dialect. `prometheus` hits POST /api/v1/query (and /api/v1/query_range when the result kind is `timeseries`). `loki` hits GET /loki/api/v1/query and is most useful for `table` result kinds (recent log entries).',
        },
        url: {
          type: 'string',
          minLength: 1,
          description:
            "endpoint base URL (no trailing slash; the stage appends the dialect's path). e.g. `http://localhost:9090` for Prometheus, `http://localhost:3100` for Loki.",
        },
        expr: {
          type: 'string',
          description:
            "the query expression. PromQL for `prometheus`; LogQL for `loki`. When absent the stage joins `scene.query[].text` with newlines — useful when the displayed query IS the executed query (the lunch-and-learn flow).",
        },
        range: {
          type: 'string',
          description:
            "time window for range queries (default `5m`). For Prometheus this becomes the `[range]` selector when the stage chooses query_range over instant query. Format: `30s`, `5m`, `1h`, `1d`.",
        },
      },
    },
  },
};

export default schema;
