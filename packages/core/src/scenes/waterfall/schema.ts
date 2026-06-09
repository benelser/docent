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
  },
};

export default schema;
