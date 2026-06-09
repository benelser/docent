// JSON Schema fragment for the `waterfall` scene's per-type spec branch.
//
// The waterfall scene's native shape IS a distributed-trace waterfall —
// the Jaeger / Tempo / Zipkin / OpenTelemetry idiom: a vertical stack of
// rows, one per span, indented under its parent, with the bar's width
// proportional to its duration. Spans declare their parent via
// `parentId`; root spans have no parentId. Beats activate spans through
// the existing reveal/focus model (reveal brings a span row on; focus
// narrows to one span and opens an attributes panel).
//
// The killer case the type was carved out for: LLM-agent trace
// taxonomies (the AgentOps five span types — plan_step / llm_call /
// tool_call / agent_decision / flow_checkpoint — plus the
// hallucination_flag event). The `kind` enum lights up those exact
// shapes with span-kind colors and glyphs; the `generic` / `http` / `db`
// kinds keep the scene useful for non-AgentOps traces too.
//
// Zero-duration spans (flow_checkpoint, hallucination_flag) render as a
// small marker on the row, not a bar — `durationMs: 0` is the canonical
// way to author them.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "waterfall scenes — render a distributed-trace waterfall (Jaeger / Tempo / Zipkin / OpenTelemetry style). Each span is a row; children indent under their parent; bar widths are proportional to durationMs. Beats reveal spans by id (`reveal: [<span-id>]`) and focus on one (`focus: [<span-id>]`) to open an attributes panel. The `kind` enum carries the AgentOps taxonomy primitives plus generic http/db/other for non-AI traces.",
  required: ['spans'],
  properties: {
    spans: {
      type: 'array',
      minItems: 1,
      description:
        'the trace, as a flat list of spans. Spans declare their parent via parentId; root spans omit parentId. The waterfall renders rows depth-first by tree order, indented 32px per level. Bar widths are proportional to durationMs / total trace duration. A beat reveals/focuses spans by id.',
      items: {
        type: 'object',
        required: ['id', 'label', 'kind', 'startMs', 'durationMs'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'unique within the scene; beats reveal/focus this id.',
          },
          parentId: {
            type: 'string',
            minLength: 1,
            description:
              "the parent span's id. Omit for root spans. Cycles and missing parents are caught by the validator.",
          },
          label: {
            type: 'string',
            minLength: 1,
            description:
              "the span's label — usually `<service>.<operation>` (e.g. `orchestrator.plan_step`). Long labels truncate mid-row with an ellipsis; favor `<service>.<short-op>` over a fully-qualified dotted path.",
          },
          kind: {
            type: 'string',
            enum: [
              'plan-step',
              'llm-call',
              'tool-call',
              'agent-decision',
              'flow-checkpoint',
              'hallucination-flag',
              'http',
              'db',
              'generic',
            ],
            description:
              "the span kind — drives bar color and glyph. The first six are the AgentOps taxonomy (plan_step / llm_call / tool_call / agent_decision / flow_checkpoint / hallucination_flag). The last three (http / db / generic) keep the scene useful for non-AI traces. `flow-checkpoint` and `hallucination-flag` are typically zero-duration (durationMs: 0) and render as a diamond marker, not a bar.",
          },
          startMs: {
            type: 'number',
            minimum: 0,
            description: 'milliseconds from trace start (0 = trace root start).',
          },
          durationMs: {
            type: 'number',
            minimum: 0,
            description:
              'span duration in milliseconds. 0 is the canonical author shape for events / checkpoints — those render as a diamond marker on their row, not as a bar.',
          },
          statusOk: {
            type: 'boolean',
            description:
              'span status. Default true; false renders the bar with a red error border (the "this span errored" tell every Jaeger user recognizes).',
          },
          attributes: {
            type: 'object',
            description:
              "free-form key/value attribute map, surfaced in the focus panel when this span is the beat's focus. Mirrors the OpenTelemetry attribute model.",
            additionalProperties: {
              oneOf: [
                {type: 'string'},
                {type: 'number'},
              ],
            },
          },
        },
      },
    },
    kicker: {
      type: 'string',
      description:
        "the section label rendered in the scene chrome (e.g. '03 // THE TRACE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
    dataSource: {
      type: 'object',
      description:
        "R16.2 — OPTIONAL live trace source. When present, the cascade's data-fetch stage hits a Jaeger-compatible endpoint at build time and REPLACES `scene.spans` with the trace's spans (sorted, parent-linked, optionally capped). Falls back to the AUTHORED spans when the endpoint is unreachable or when the named service has no recent traces.",
      required: ['kind', 'url', 'service'],
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['jaeger'],
          description:
            'the trace backend dialect. Only `jaeger` for now — Tempo / Zipkin can be added when their query API shapes are needed.',
        },
        url: {
          type: 'string',
          minLength: 1,
          description:
            "Jaeger query base URL (no trailing slash). e.g. `http://localhost:16686`. The stage appends `/api/traces?...`.",
        },
        service: {
          type: 'string',
          minLength: 1,
          description:
            'the service the root span belongs to — passed as the Jaeger `service=` parameter (e.g. `orchestrator`, `researcher`).',
        },
        traceId: {
          type: 'string',
          description:
            'a specific trace id to fetch (overrides `recent`). Use this when the film should always reference the same canonical trace.',
        },
        recent: {
          type: 'boolean',
          description:
            'fetch the most-recent trace from the service (sorted by start time, take data[0]). Default `true` when traceId is absent. The killer case — every render shows the freshest agent run.',
        },
        operation: {
          type: 'string',
          description:
            "optional operation filter (passed as the Jaeger `operation=` parameter). Narrows to a specific span name (e.g. `plan_step`).",
        },
        maxSpans: {
          type: 'integer',
          minimum: 1,
          description:
            "max spans to display. The waterfall renders best at <=12 rows; deeper traces are visually noisy. The stage trims to the FIRST `maxSpans` spans in start-time order — keeps the trace's prefix coherent. Default 12.",
        },
      },
    },
  },
};

export default schema;
