# Plugin Architecture — Execution DAG

> Companion to `docs/design/plugin-architecture-strategy.md`. The strategic
> plan lays out *what* we're shipping; this doc lays out *the dependency
> graph for executing it concurrently*.
>
> Read this before dispatching any agent. The DAG tells you which tasks
> are bottlenecks (do them first, single-agent), which are fan-out heavy
> (dispatch many parallel agents), and where the integration points are.

---

## 1. The bottleneck

Everything depends on **A.1 — Protocols + types**. Until those land in
`@docent/kit`, no other track can start safely. This is the only fully
sequential task in the entire build.

After A.1, the work fans out aggressively. Up to ~30 tasks can run
concurrently.

---

## 2. The DAG (textual)

```
                         ┌──────────────────────────────┐
                         │  BUILD A (in flight)         │
                         │  TTS adapter — kokoro-js,    │
                         │  OpenAI, ElevenLabs, compat  │
                         │                              │
                         │  Produces TtsProvider proto- │
                         │  type that A.1 references    │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                       ╔═══════════════════════════════╗
                       ║  A.1 — PROTOCOLS + TYPES      ║
                       ║  @docent/kit/src/protocols.ts ║
                       ║  PluginBase, ScenePlugin,     ║
                       ║  PresetPlugin, TtsProvider,   ║
                       ║  FeaturePlugin, ModifierReg.  ║
                       ║                               ║
                       ║  THE BOTTLENECK. Single agent.║
                       ╚═══════════════╤═══════════════╝
                                       │
        ┌──────────────────┬───────────┼────────────┬────────────────┐
        │                  │           │            │                │
        ▼                  ▼           ▼            ▼                ▼
┌──────────────┐  ┌─────────────┐  ┌──────────┐ ┌──────────┐  ┌──────────────┐
│ A.2 Registries│  │ A.3 Engine  │  │ A.4-A.6  │ │ A.7      │  │ A.8 Schema   │
│ 5 registries  │  │ class       │  │ Frame-   │ │ Cascade  │  │ from         │
│ (scene/preset │  │ + use()     │  │ work     │ │ orches-  │  │ registry     │
│ /tts/feature/ │  │ polymorphism│  │ hooks    │ │ trator   │  │ (Engine.     │
│ modifier)     │  │             │  │ (validate│ │          │  │  schema())   │
│               │  │             │  │ depth-   │ │          │  │              │
│               │  │             │  │ check    │ │          │  │              │
│               │  │             │  │ judge)   │ │          │  │              │
└───────┬───────┘  └──────┬──────┘  └────┬─────┘ └────┬─────┘  └──────┬───────┘
        │                 │              │            │               │
        │                 │              │            │               │
        └─────────────────┴──────────────┴────────────┴───────────────┘
                                       │
                                       │ A.* COMPLETE → @docent/kit ready
                                       │
                  ┌────────────────────┼─────────────────────┐
                  │                    │                     │
                  ▼                    ▼                     ▼
        ┌──────────────────┐  ┌────────────────┐  ┌─────────────────┐
        │  A.9 Remotion    │  │  B.scene.1-29  │  │  B.preset.1-6   │
        │  bindings        │  │                │  │                 │
        │  Composition     │  │  Each scene    │  │  Each preset    │
        │  spec, frame     │  │  → ScenePlugin │  │  → PresetPlugin │
        │  schedule        │  │                │  │                 │
        │                  │  │  29 PARALLEL   │  │  6 PARALLEL     │
        │                  │  │  TASKS         │  │  TASKS          │
        └─────────┬────────┘  └────────┬───────┘  └────────┬────────┘
                  │                    │                   │
                  │                    │                   │
                  │            ┌───────┴──────────┐        │
                  │            │                  │        │
                  ▼            ▼                  ▼        ▼
        ┌──────────────────┐  ┌──────────────┐  ┌────────────────┐
        │ B.feature.1      │  │ B.feature.2  │  │ B.tts.kokoro   │
        │ Narration        │  │ Audio rhythm │  │ Kokoro plugin  │
        │ feature plugin   │  │ feature      │  │ (built atop    │
        │                  │  │ (Kokoro silen│  │  Build A's     │
        │                  │  │  trim + per- │  │  TtsProvider   │
        │                  │  │  beat pace)  │  │  prototype)    │
        └─────────┬────────┘  └──────┬───────┘  └────────┬───────┘
                  │                  │                   │
                  └──────────────────┴───────────────────┘
                                     │
                                     ▼  ALL @docent/core PLUGINS REGISTERED
                  ┌──────────────────┴────────────────────┐
                  │                                       │
                  ▼                                       ▼
        ┌──────────────────┐                  ┌────────────────────┐
        │ D.1 Film.tsx     │                  │ D.2 cascade.ts ←   │
        │ → registry       │                  │ engine.* (drop     │
        │ dispatch         │                  │ direct theme.ts    │
        │                  │                  │ + provider calls)  │
        └─────────┬────────┘                  └─────────┬──────────┘
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼  PIPELINE INTEGRATED
                  ┌──────────────────┴──────────────────┐
                  │                                     │
                  ▼                                     ▼
        ┌──────────────────────┐            ┌───────────────────────┐
        │ E — @example/docent  │            │ F.1 — @docent/cli     │
        │ scifi acceptance test│            │ thin shell, command   │
        │ (1 scene + 1 preset +│            │ routing, doctor       │
        │ 1 demo film)         │            │                       │
        │                      │            │                       │
        │ HARD GATE. Build is  │            │                       │
        │ not done unless this │            │                       │
        │ passes.              │            │                       │
        └──────────┬───────────┘            └───────────┬───────────┘
                   │                                    │
                   │                                    │
                   │                                    ▼
                   │                          ┌───────────────────┐
                   │                          │ F.2 — @docent/    │
                   │                          │ agent updates     │
                   │                          │ (prompts ref      │
                   │                          │ new CLI surface)  │
                   │                          └─────────┬─────────┘
                   │                                    │
                   └─────────────────┬──────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ G — Publish v3.0.0   │
                          │ • npm publish 5 pkgs │
                          │ • Tag + GH release   │
                          │ • README install bump│
                          │ • Re-render 4 README │
                          │   films vs v3.0.0    │
                          └──────────────────────┘
```

---

## 3. Track-by-track breakdown

### Track A — Framework (`@docent/kit`)

| Task | Description | Predecessors | Parallel with | Estimated agent-hours |
|---|---|---|---|---|
| **A.1** | Protocols + types (`protocols.ts`) — every interface from §4 of strategy doc | — | — | 6-8 |
| **A.2** | Registry implementations (5 registries — scene, preset, tts, feature, modifier) | A.1 | A.3-A.9 | 4 |
| **A.3** | `Engine` class + `engine.use(plugin)` polymorphic dispatch | A.1 | A.2, A.4-A.9 | 3 |
| **A.4** | Validation framework — calls per-plugin `validate` | A.1 | A.5, A.6, A.7 | 4 |
| **A.5** | Depthcheck framework — aggregates per-plugin `depthRules` | A.1 | A.4, A.6 | 4 |
| **A.6** | Judge framework — aggregates per-plugin `judgeDimensions` | A.1 | A.4, A.5 | 4 |
| **A.7** | Cascade orchestrator — validate → resolve → synth → render | A.1, A.2, A.3 | A.8, A.9 | 6 |
| **A.8** | `Engine.schema()` — computes JSON schema from registry | A.1, A.2 | A.7, A.9 | 3 |
| **A.9** | Remotion bindings — composition spec, frame schedule | A.1 | A.7, A.8 | 4 |

**Track A total: ~36-38 agent-hours.** With 5 parallel agents post-A.1: ~12-15 hours wall time.

### Track B — Default implementation (`@docent/core`)

Each task within Track B is **independent** — different scenes can be migrated in parallel without conflict. Each migration is mechanical: take an existing scene component, wrap it in `ScenePlugin` shape, move its per-type rules from the central files onto the plugin.

| Task family | Tasks | Predecessors | Parallel within family | Estimated |
|---|---|---|---|---|
| **B.scene.1-29** | One per scene type (frame, structure, walkthrough, …) | A.1 | All 29 in parallel | ~1-2 hours/scene = 29-58 |
| **B.preset.1-6** | One per preset (neutral, engineering, editorial, paper, analytical, executive) | A.1 | All 6 in parallel | ~1 hour/preset = 6 |
| **B.feature.1** | Narration feature plugin | A.1 | B.feature.2 | 3 |
| **B.feature.2** | Audio-rhythm feature plugin (Kokoro silence trim + pace) | A.1 | B.feature.1 | 3 |
| **B.tts.kokoro** | Kokoro plugin (consumes Build A's `kokoro-js` adapter) | A.1, Build A | — | 2 |

**Track B total: ~43-72 agent-hours.** With 10 parallel agents: ~6-8 hours wall time.

The high variance reflects that some scenes are simple (frame, recap) and some are complex (mechanism, causal-loop, journey-map). A 29-agent fan-out is plausible and brings wall time down dramatically.

### Track D — Pipeline integration

| Task | Description | Predecessors | Parallel with | Estimated |
|---|---|---|---|---|
| **D.1** | `Film.tsx` refactor — replace 29-way switch with `engine.scenes.get(type).component` | A.1-A.9 + B.scene.* | D.2 | 3 |
| **D.2** | `cascade.ts` refactor — calls only `engine.*`, never reaches into providers | A.1-A.9 + Build A | D.1 | 4 |

**Track D total: ~7 hours.** With 2 parallel agents: ~4 hours wall time.

### Track E — Acceptance test

| Task | Description | Predecessors | Parallel with | Estimated |
|---|---|---|---|---|
| **E.1** | `tests/example-docent-scifi/` — 1 scene + 1 preset + 1 demo film | A.1-A.9 + D.1-D.2 | F.1, F.2 | 5 |
| **E.2** | Hermetic integration for E.1 | E.1 | — | 2 |

**Track E total: ~7 hours.** Single-agent execution recommended (one cohesive author).

### Track F — Surface

| Task | Description | Predecessors | Parallel with | Estimated |
|---|---|---|---|---|
| **F.1** | `@docent/cli` thin shell — subcommand routing, doctor, hermetic orchestrator | D.1, D.2 | F.2, E | 6 |
| **F.2** | `@docent/agent` updates — prompts/skills reference new CLI; package scope normalization | F.1 (mostly) | E | 4 |

**Track F total: ~10 hours.** With 2 parallel agents: ~6 hours wall time.

### Track G — Publish

| Task | Description | Predecessors | Estimated |
|---|---|---|---|
| **G.1** | Cut v3.0.0 tag + GitHub release with CHANGELOG | E, F | 1 |
| **G.2** | npm publish all 5 packages | G.1 | 2 |
| **G.3** | Update README install story | G.2 | 1 |
| **G.4** | Re-render 4 README hero films vs v3.0.0 | G.2 | 2-3 (background) |

**Track G total: ~6 hours.** Single-agent serial execution.

---

## 4. The maximum-parallelization scenario

With aggressive concurrency (10-15 agents available):

| Wall-clock day | What runs in parallel | Agents needed | Output |
|---|---|---|---|
| Day 1 — morning | A.1 (single agent, blocking) | 1 | Protocols + types stable |
| Day 1 — afternoon | A.2, A.3, A.4, A.5, A.6, A.7, A.8, A.9 + B.scene.1-15 (first half of scenes) + B.preset.1-3 | 15 | Framework skeleton + half of scenes + half of presets |
| Day 2 — morning | A.* tail + B.scene.16-29 + B.preset.4-6 + B.feature.* + B.tts.kokoro | 10 | All of @docent/core registered |
| Day 2 — afternoon | D.1 + D.2 + E.1 | 3 | Pipeline integrated, acceptance test ready |
| Day 3 — morning | E.2 + F.1 | 2 | Acceptance proof + CLI shell |
| Day 3 — afternoon | F.2 + G.1 + G.2 + G.3 + G.4 (background) | 3 | Published, README live, films re-rendered |

**Aggressive estimate: 3 working days end to end.** This assumes no significant integration surprises and ≤2 hours of cross-track coordination overhead.

A realistic estimate with surprises and review cycles: **5-7 working days** (1-1.5 weeks).

A conservative estimate that absorbs the inevitable "the protocol needs one more field" iterations: **2-3 weeks**.

---

## 5. The critical path

The longest sequential chain:

```
A.1 (8h) → A.3 (3h) → A.7 (6h) → D.2 (4h) → E.1 (5h) → E.2 (2h) → F.1 (6h) → F.2 (4h) → G (6h)
```

**Critical path total: ~44 agent-hours of serial work.**

Anything off this path can be parallelized. The 29 scene migrations and 6 preset migrations together account for ~50-70 agent-hours but **none of them are on the critical path** — they can all happen during the same wall-clock window as the framework-tail work.

---

## 6. Parallel execution rules

### Worktree discipline

- Each parallel agent runs in its own git worktree (`.claude/worktrees/<task-id>/`).
- Every agent's brief MUST instruct it to commit its work before reporting back (we learned this lesson the hard way in earlier sprints).
- Agents must NOT push to origin — the integrator (the main session, me) merges.

### File ownership during parallel work

Some files are touched by multiple tracks. To avoid merge conflicts at integration time, assign exclusive ownership during parallel execution:

| File | Owner during build |
|---|---|
| `@docent/kit/src/protocols.ts` | A.1 only |
| `@docent/kit/src/engine.ts` | A.3 only |
| `@docent/kit/src/registries/*.ts` | A.2 only |
| `@docent/core/src/scenes/<sceneType>/*` | B.scene.<sceneType> exclusive |
| `@docent/core/src/presets/<presetName>/*` | B.preset.<presetName> exclusive |
| `@docent/core/src/index.ts` (the plugin manifest) | INTEGRATOR ONLY (assembled at merge time) |
| `@docent/cli/src/cli.ts` | F.1 only |
| `packages/agent/prompts/*.md` | F.2 only |

The integrator (main session) handles the central `@docent/core/src/index.ts` that re-exports every plugin from the registered packages. This prevents the "29 agents all editing the same manifest file" merge nightmare.

### Region-pinning for shared files

Some files inevitably get touched by multiple tracks (e.g., the package.json files, the README). For those:

- Agent briefs explicitly say: "do not touch packages/X — that's a separate track's scope."
- If two tracks must touch the same file, they get assigned to **regions** (lines N-M) and instructed to leave the rest alone.

### Hermetic at every checkpoint

After each phase merges, run the full hermetic gallery before dispatching the next round. The hermetic is the safety net that catches integration regressions early.

---

## 7. Sequencing recommendation

Three options, depending on appetite for concurrency:

### Option A — Conservative (1 agent at a time, sequential)

A.1 → A.2 → A.3 → … → G. ~80-100 agent-hours sequential. Wall time: **3-4 weeks** (with breaks, review, sleep).

### Option B — Moderate (3-5 parallel agents)

A.1 alone → then 3-5 parallel agents for the rest. Wall time: **1.5-2 weeks**.

### Option C — Aggressive (10-15 parallel agents) (Recommended)

A.1 alone → massive fan-out for B + parallel A tail → integration → publish. Wall time: **3-5 working days**.

Option C is recommended *because the work is structurally fanned-out by design*. The 29 scene migrations are 29 independent tasks; running them sequentially is wasted clock time. The risk is integration complexity at merge time — but the hermetic gallery catches regressions, and the file-ownership discipline above prevents conflicts.

---

## 8. Integration checkpoints (when the integrator merges)

The integrator (main session) does the merges. There are 4 natural checkpoints:

### Checkpoint 1 — After A.1

The protocol file is merged. All Track B and remaining Track A agents can now be dispatched in parallel. Hermetic at this point: skip (no implementations yet).

### Checkpoint 2 — After A.* + B.* complete

`@docent/kit` complete, all of `@docent/core`'s plugins migrated. Hermetic: run the build using a temporary shim that wires things up — every existing film should depthcheck.

### Checkpoint 3 — After D.1 + D.2 + E

Pipeline integrated, acceptance test passes. Hermetic: run the full v2.5.x gallery against the new architecture — every film byte-comparable within tolerance.

### Checkpoint 4 — After F.1 + F.2

CLI + agent surface ready. End-to-end smoke test: `docent build films/docent-self.json` renders the README film.

After Checkpoint 4 passes, we cut v3.0.0 (Track G).

---

## 9. Build A (TTS adapter) interaction

Build A is currently in flight (`aabf2235753d8ebcf`). It produces:

- A `TtsProvider` interface (will become the source of truth for A.1's `TtsProviderPlugin` type)
- Four concrete providers (Kokoro via kokoro-js, OpenAI, ElevenLabs, OpenAI-compatible)
- New CLI surface (`docent tts list-providers / list-voices / synth` + `docent hermetic-tts`)
- Drops the Python Kokoro subprocess

**Build A is the prerequisite to A.1.** A.1 references the `TtsProviderPlugin` shape that Build A landed. If Build A returns before we start the strategic plan execution, A.1 picks up the type signatures from there. If it doesn't (it's still in flight as of now), A.1 stalls until it does.

**Recommendation: do not start A.1 until Build A returns and merges to main.** Build A is a small build (1-2 day budget); it should land before we dispatch any strategic-plan agents.

---

## 10. Risks of parallel execution

| Risk | Mitigation |
|---|---|
| Two agents touch the same file → merge conflict | File ownership table (§6). Region-pinning when unavoidable. |
| Protocol changes ripple across 29 in-flight scene migrations | A.1 must be locked before dispatching B.* agents. Any post-hoc protocol change triggers all in-flight agents to receive a SendMessage with the update. |
| One scene migration breaks the integration test | Each scene migration has its own scene + integration test (test it renders). Hermetic catches regressions. |
| Integrator (me) becomes the bottleneck during fan-out | Merges are mechanical when file ownership holds. Each merge ≤ 5 minutes. |
| Misinterpretation of the brief by an agent | Briefs are extracted from the strategic doc verbatim. Every agent re-reads the relevant section before starting. |

---

## 11. The dispatch script

A concrete order-of-operations (assuming Build A has merged):

1. **Day 1 morning** — Dispatch 1 agent: A.1 (`@docent/kit/src/protocols.ts`). Wait for completion + review.
2. **Day 1 afternoon** — Dispatch in parallel (10+ agents):
   - 1 each for A.2, A.3, A.4-A.6 (combined), A.7, A.8, A.9
   - 6 agents for 6 presets (B.preset.1-6)
   - As many as available for scene migrations (B.scene.1-29 — start with 15)
   - 1 each for B.feature.1, B.feature.2, B.tts.kokoro
3. **Day 1 evening** — Merge as agents return. Integrator handles `@docent/core/src/index.ts` (plugin manifest).
4. **Day 2 morning** — Run hermetic checkpoint 2. Fix any drift. Dispatch remaining scene migrations.
5. **Day 2 afternoon** — All migrations complete. Dispatch D.1, D.2, E.1 in parallel.
6. **Day 3 morning** — Hermetic checkpoint 3. Dispatch F.1, F.2 in parallel.
7. **Day 3 afternoon** — Track G: tag, release, README bump, re-render films. v3.0.0 live.

---

## 12. The watch-list (what tells us we're off track)

These signals mean the parallel execution is hitting friction:

- A merge conflict on `@docent/core/src/index.ts` — integrator's ownership wasn't enforced.
- A hermetic regression between checkpoints — a scene migration changed semantics.
- An agent reports back "I can't proceed without X" — a dependency was missed in the DAG.
- The 29 scene migrations end up taking >2 hours each — the migration template is unclear; the brief needs tightening.
- A.1 takes >12 hours — the protocols are too complex; simplify before fanning out.

If any of these fire, pause the dispatch, fix the root cause, then resume.

---

## 13. The commitment

Once Build A returns and we kick off A.1, this is the order we follow.
Deviations need a recorded decision. The DAG isn't sacred but pretending
the work is sequential when it's structurally parallel is a self-imposed
delay.

When the acceptance test (§10 of the strategy doc) passes, the
architecture is done. The DAG is the path that gets us there fastest
without dropping pieces along the way.
