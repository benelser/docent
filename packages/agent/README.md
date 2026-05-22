# docent-agent

The **agent layer** of docent — distributed via [APM](https://github.com/microsoft/apm)
so docent rides inside whatever coding agent a developer already uses
(Claude Code, Codex, …) rather than being bound to one.

docent is a method for a coding agent to author a **film spec**; the engine
(`@docent/engine`) renders it. This package is that method.

## Layout

```
docent-agent/
  apm.yml                       APM manifest
  plugin.json                   APM plugin metadata
  instructions/docent.md        the review method — the two modes, the workflow
  prompts/survey-template.md    the structured survey — Layer 1 of depth enforcement
  agents/depth-review.md        the adversarial depth-review sub-agent — Layer 3
```

## The decoupling boundary

The contract between this package and the engine is the film spec JSON Schema
(`../engine/schema/film.schema.json`). The agent's only job is to produce a
spec that:

1. validates against that schema (`docent` enforces it before every render), and
2. clears `docent depthcheck` (the mechanical depth contract — Layer 2).

Any agent that does both works. That is what "decoupled from Claude" means.

## The three layers of depth enforcement

1. **The structured survey** (`prompts/survey-template.md`) — front-loads the
   hard parts so the depth is found before the spec is written.
2. **`docent depthcheck`** (in the engine) — a machine-checkable contract: a
   risk node, a quantified claim, a failure scene, a verdict that adjudicates.
3. **The depth-review sub-agent** (`agents/depth-review.md`) — the
   judgement-based gate that catches what a regex cannot ("this verdict
   restates, it does not rule").

## Status

APM is young (0.8.x at time of writing; the schema is still moving). The
content files here are authored and current; the precise `apm compile` and
`scripts:` wiring should be validated against the installed APM version
before publishing. `docent doctor` reports whether this package is installed.
