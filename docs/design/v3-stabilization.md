# v3.0 Stabilization — Debt Audit + Cleanup Plan

> **Status: SPIKE COMPLETE, STABILIZATION PENDING.**
>
> The §10 acceptance test from `plugin-architecture-strategy.md` is GREEN —
> a third-party plugin pack renders end-to-end via `docent build` without
> forking `@docent/core`. The framework/implementation split is real.
>
> **But the work is a scaffold proof, not a finished product.** Several
> behaviors regressed, several architectural commitments are unfulfilled,
> and the API surface isn't yet stable enough to point external developers
> at.
>
> This document captures the debt and the cleanup plan. **Success: a
> stabilized API third-party developers can build on.**

---

## 1. Success criteria — what "stabilized" means

When this sprint is done, we should be able to publish the following claim
without qualification:

> "docent v3.0 ships as `@docent/kit` (framework) + `@docent/core`
> (implementation) + `@docent/cli` (binary) on npm. Third-party developers
> ship plugins as separate packages that register through the same public
> protocol `@docent/core` uses. Films built with v2.5.x render
> byte-equivalent (within compression tolerance) through the new pipeline."

The bar in concrete terms:

| Surface | Stable contract |
|---|---|
| Public types exported from `@docent/kit` | Frozen. Breaking them is a major version bump. |
| `engine.use(plugin)` protocol | Public, documented, versioned. |
| `Scene` / `Preset` / `Feature` / `TtsProvider` plugin shapes | Public, documented, externally implementable. |
| `docent` CLI commands + flags | Public, documented. |
| Plugin manifest assembly | Auto-generated, not hand-edited. |
| Strict TypeScript across all packages | `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` ON everywhere. |
| 4 README hero films | Re-rendered through `@docent/cli` against the new architecture, parity confirmed. |
| Hermetic 4/4 GREEN | Verified end-to-end through `docent hermetic`, not inherited from v2.5.x. |
| Audio in renders | Real (no `--skip-tts` workaround required for parity). |
| Developer onboarding | README with plugin-authoring guide + example plugin pack beyond scifi. |

---

## 2. Debt inventory (audited 2026-05-26)

Organized by severity. The full audit context is in conversation memory;
this is the persistent reference.

### 🟥 BLOCKERS — these prevent v3.0 from replacing v2.5.x

#### D1. Audio overlay missing
- **Symptom:** `out/*.mp4` from `docent build` is silent. Both acceptance renders used `--skip-tts` to dodge.
- **Why:** `narrationFeature.wrapRender` is a pass-through stub. The Remotion composition (`<DocentFilm>` in `@docent/kit/src/remotion/composition.tsx`) doesn't yet thread `<Audio>` elements for synthesized clips.
- **Fix:** Wire `narrationFeature` to mount `<Audio src={beat.audio} startFrom={...} />` into the composition. Per-beat audio paths come from the TTS stage's manifest write.
- **Blast radius:** 2 files — `@docent/core/src/features/narration/index.ts`, `@docent/kit/src/remotion/composition.tsx`. Plus a small feature-lifecycle hook in the cascade orchestrator.

#### D2. Compositional embeds are stubs
- **Symptom:** Films using Sprint B's `embed?: EmbeddedScene` slot render placeholders. Specifically `films/sprint-b-composition-demo.json` produces visibly-wrong output.
- **Why:** 6 scene plugins (`compare`, `journey-map`, `landscape`, `structure`, `timeline`, `tree`) include `_embedded-scene.tsx` files that render only the outline + caption affordance. The per-type tableau body (mechanism / venn / chart / etc.) is empty.
- **Fix:** Move the `EmbeddedScene` dispatcher into `@docent/core/_shared/embedded-scene.tsx` (shared across all 6 host scenes). Implement the 8 type-specific tableau renderers per `packages/engine/src/scenes/EmbeddedScene.tsx`.
- **Blast radius:** 1 new shared file + 6 host scenes updated to import it.

#### D3. README hero films never re-rendered through @docent/cli
- **Symptom:** `docent-self.mp4`, `openclaw-ar.mp4`, `lethal-trifecta-blog.mp4`, `arxiv-2512-14806.mp4` were last rendered through v2.5.x's engine.
- **Why:** We never ran `docent build <each>` through the new pipeline.
- **Fix:** Render all 4 via `@docent/cli`. Diff visually against the v2.5.x outputs. Investigate any major divergence.
- **Blast radius:** Operational, not architectural. ~30 minutes of render time + manual inspection.

#### D4. Hermetic 4/4 GREEN status inherited, not verified
- **Symptom:** We claim the 4 gallery fixtures still pass through the new architecture, but only `linear-algebra` was actually built end-to-end. `kubernetes-pr`, `euclid-primes`, `stopping-by-woods` were never individually rendered through `@docent/cli`.
- **Fix:** Run `docent hermetic --scale 0.5` and confirm 4/4 GREEN through the new path.
- **Blast radius:** Operational. Run, observe.

### 🟧 ARCHITECTURAL DEBT — works for now, costs later

#### D5. tsc strict flags weakened on @docent/core
- **Symptom:** `packages/core/tsconfig.json` has `noUncheckedIndexedAccess: false` and `exactOptionalPropertyTypes: false`. Both are `true` on `@docent/kit`.
- **Why:** When `@docent/core` scenes import from `packages/engine/` through `@docent-engine-bridge/*`, the engine's looser typing trips core's strict mode.
- **Fix:** Re-enable both flags. Fix what breaks. Eliminate the engine back-channel (D6).
- **Blast radius:** Every scene plugin under `@docent/core/src/scenes/`. Will surface real bugs (`undefined` index access, optional-property assignments).

#### D6. @docent-engine-bridge/* private back-channel
- **Symptom:** `packages/core/tsconfig.json` has `"@docent-engine-bridge/*": ["../engine/src/*"]`. Multiple scene plugins reach into `packages/engine/` through this alias.
- **Why:** Some shared types and utilities weren't fully migrated; back-channel is the shortcut.
- **Architectural violation:** Directly contradicts the strategic plan's "no private path between core and engine" discipline. The Marp research explicitly warned against this.
- **Fix:** For every import through `@docent-engine-bridge/*`, either inline the thing into `@docent/core/_shared/*` or promote it to `@docent/kit`. Remove the path alias.
- **Blast radius:** ~4-6 scene plugins (`mechanism`, `objection`, `quantities`, `prior-art`).

#### D7. 29 copies of inlined helpers
- **Symptom:** Every scene plugin has `_helpers.ts`, `_scene-frame.tsx`, `_narration.tsx`, `_fitted-text.tsx`, `_fonts.ts`, `_code-theme.ts` (where relevant). That's ~29× duplication of `glow`, `activeBeatIndex`, `SceneFrame`, `Narration`, `FittedText`, etc.
- **Why:** The fan-out agents inlined the engine's shared infra rather than dispatching a "migrate shared chrome" agent first.
- **Architectural violation:** Strategic plan §3 listed `@docent/core/_shared/*` as the consolidation point. It was never built.
- **Fix:** Create `@docent/core/_shared/{scene-frame,narration,fitted-text,fonts,helpers,code-theme}.ts`. Migrate one set, delete 29 copies, replace with imports.
- **Blast radius:** All 29 scene plugins. Mechanical but extensive.

#### D8. Per-provider TTS plugins still in packages/engine/
- **Symptom:** `openai`, `elevenlabs`, `openai-compatible` TTS adapters live in `packages/engine/src/tts/providers/`. The strategic plan's §3 package layout lists them as `@docent/tts-*` separate packages.
- **Fix:** Carve `@docent/tts-openai`, `@docent/tts-elevenlabs`, `@docent/tts-compatible` packages. Each declares `peerDependencies` on the underlying SDK. Move source. Update `@docent/cli` to optionally register them based on `docent.config.ts`.
- **Blast radius:** 3 new npm packages, 3 source moves, CLI changes to discovery.

#### D9. Plugin manifest is hand-assembled
- **Symptom:** `@docent/core/src/index.ts` lists every plugin import + every entry in `corePlugins[]`. 38 plugins = 38 hand-written lines. Every new plugin = manual edit.
- **Fix:** Code-generate the manifest from a glob of `src/{scenes,presets,features,tts}/*/index.ts`. Use a `bun run gen:manifest` script.
- **Blast radius:** New script + remove manual file maintenance.

### 🟨 MINOR — known, documented, low priority

#### D10. `public/audio/manifest.json` stub
Pre-existing engine issue. Gitignored stub historically required for `packages/core` tsc to pass when walking through `@docent-engine-bridge/*`.

**Resolution (2026-05-26):** ✅ With D6 closed and the bridge alias removed from `tsconfig.json` (root), every v3 contract package — `@docent/kit`, `@docent/core`, `@docent/cli`, `@docent/tts-{openai,elevenlabs,compatible}`, and the four example packs — tsc's clean with the stub absent. The stub is now a runtime artifact written by the TTS stage during renders; on a fresh clone it doesn't exist, and that is fine for every v3 workflow. The only consumer that still imports it statically is `packages/engine/src/engine/spec.ts`, which is preserved-as-source (v2.5 monolith) but no longer part of the tsc contract.

#### D11. `zod` version mismatch warning
Remotion logs warning every render: installed 4.4.3, expected 4.3.6. Non-blocking. Pin in `package.json`.

#### D12. `requiresTtsCapabilities` declared infrastructure, no scene uses it
The cross-bind exists in the protocol; no plugin actually declares `requiresTtsCapabilities`. Karaoke-style passage scenes would legitimately need `nativeAlignment: 'word'`. **Not blocking** but worth filling in for at least `passage` so the cross-bind is exercised end-to-end.

#### D13. packages/agent/ not normalized to @docent/agent
Per strategic plan §3, the agent package was supposed to be normalized to the `@docent/` scope. Resolved in Wave C3: `packages/agent/package.json` `name` is `@docent/agent` and `version` is `3.0.0-pre.0`, aligning with the other v3 packages. The directory stays at `packages/agent/` so skill-cascade discovery continues to work; only the npm-package identity changed.

#### D14. Kokoro byte-equivalence
`kokoro-js` (ONNX) and Python Kokoro (PyTorch) produce ~10% audio size delta, sample correlation 0.09.

**Decision (2026-05-26):** ✅ accepted as a known divergence. The hermetic
harness verifies *behavior* — duration within tolerance, format (WAV /
PCM16 / 24kHz / mono), and that audio actually plays. Byte parity is the
wrong bar for a cross-runtime port: ONNX and PyTorch use different
floating-point kernels, so identical sample-level output across runtimes
isn't a realistic invariant. If a downstream consumer ever needs literal
PyTorch-output parity, they can plug in `@docent/tts-compatible` against a
Python Kokoro endpoint; for the in-process Node default, we standardize
on `kokoro-js` and the divergence stays here on record.

### 🟦 DEVELOPER EXPERIENCE — what we owe external builders

These don't exist yet. None of them block the acceptance test. All of them
block "point developers at this and let them build on it."

#### D15. README with plugin-authoring guide
The current README is the v2.5.x README. No section explains:
- How to create a `@yourorg/docent-*` plugin pack
- The `ScenePlugin` / `PresetPlugin` / `FeaturePlugin` / `TtsProviderPlugin` shapes
- How to register via `docent.config.ts`
- The cognitive-cluster taxonomy (closed list)
- The depthcheck + judge contract obligations

#### D16. Example plugin pack(s) beyond `@example/docent-scifi`
The scifi pack is an acceptance proof. Real developers need richer examples:
- A vertical scene pack (e.g., `@example/docent-finance` with OHLC chart)
- A brand preset pack (e.g., `@example/docent-preset-brand`)
- A feature plugin (e.g., `@example/docent-feature-captions` for SRT export)

#### D17. Public types JSDoc
Every type exported from `@docent/kit/src/index.ts` should have JSDoc that explains intent, gives examples, and links to the strategic plan section. Today they're bare types.

#### D18. Versioning + npm publish prep
- Move `@docent/*` versions from `3.0.0-pre.0` to `3.0.0-rc.0`
- Verify `package.json` `exports`, `files`, `types` fields
- `npm pack --dry-run` for each package — confirm what ships

---

## 3. Sequencing — how the cleanup runs

Five waves, each runs as a parallel agent fan-out. Total estimated:
**~12-15 days of work, ~3-5 wall-clock days at peak fan-out.**

### Wave A — Foundation cleanup (parallel)
- **A1: `@docent/core/_shared/*` consolidation** — single agent, owns ~30 files. Creates the shared infra; migrates 29 scenes to import it; deletes the `_`-prefixed duplicates.
- **A2: Audio overlay** — single agent, narrationFeature.wrapRender + composition <Audio> threading.
- **A3: Embed renderers** — single agent, real per-type tableau implementations into `@docent/core/_shared/embedded-scene.tsx`.

### Wave B — Strict mode + back-channel elimination (depends on A1)
- **B1: Restore strict tsc flags on @docent/core** — single agent, flip flags, fix everything that breaks.
- **B2: Eliminate `@docent-engine-bridge/*`** — single agent, rewire scene imports to `@docent/core/_shared/*` or `@docent/kit`.

### Wave C — Package + manifest infrastructure (parallel)
- **C1: Carve @docent/tts-{openai,elevenlabs,compatible}** — single agent, 3 new packages.
- **C2: Code-generate plugin manifest** — single agent, new build script.
- **C3: Normalize packages/agent → @docent/agent** — single agent.

### Wave D — Verification + parity (sequential after A/B/C)
- **D1: Re-render 4 README films** — through `@docent/cli`, compare to v2.5.x.
- **D2: Hermetic 4/4 GREEN end-to-end** — through `docent hermetic`.

### Wave E — Developer experience (parallel)
- **E1: README rewrite** — plugin-authoring guide, package layout, install story.
- **E2: Example packs** — finance + brand preset + caption feature.
- **E3: Public type JSDoc** — every export in `@docent/kit/src/index.ts`.
- **E4: Versioning + npm prep** — `3.0.0-rc.0`, pack dry-runs.

---

## 4. The acceptance test for stabilization

When this sprint is done, the following should hold:

```bash
# Same as v3.0 spike acceptance — still passes
docent build linear-algebra --scale 0.5    # produces mp4 WITH audio
docent build scifi-demo --scale 0.5         # third-party plugin still works

# New tests for stabilization
docent hermetic --scale 0.5                  # 4/4 GREEN, audio in every file
bun packages/kit && bunx tsc --noEmit        # clean with strict flags ON everywhere
bun packages/core && bunx tsc --noEmit       # clean with strict flags ON everywhere

# Third-party install story works
bun add @docent/kit @docent/core @docent/cli @docent/tts-openai
docent build my-film  # works against an external user's project

# Documentation passes the "stranger could ship a plugin" test
cat README.md  # explains plugin authoring; reader could ship @theirorg/docent-* in an hour
```

When all the above hold, v3.0 is **stabilized**. We can point developers at
it and they can start building.

---

## 5. What this document is FOR

- **The integrator's checklist** during the stabilization sprint.
- **The hand-off doc** if someone else picks up the work mid-sprint — they can see exactly what's broken and what to fix.
- **The retrospective record** — when v3.0 ships properly, this is what we cleaned up to get there.

This file is intended to be **deleted or archived after stabilization
lands.** Its purpose is to make the gap between "acceptance test passes"
and "API stable, developers can build on it" explicit and trackable.

When every checkbox below is ✅, this file gets the rename
`v3-stabilization.COMPLETE.md` and lives only as historical record.

### Status checklist

- [x] D1 — Audio overlay (A2 → `4534290`, merged `6e6944e`)
- [x] D2 — Embed renderers (A3 → `65002b3`, merged `8cee499`)
- [ ] D3 — README films re-rendered + compared
- [ ] D4 — Hermetic 4/4 verified end-to-end through @docent/cli
- [x] D5 — Strict tsc flags restored on @docent/core (B1 → `c578890`, merged surgically — A3 and B1 had overlapping scene-file edits)
- [x] D6 — @docent-engine-bridge/* eliminated (B2 → `44132b4`, merged `dc91e96`)
- [x] D7 — _shared/* helpers consolidated (A1)
- [x] D8 — Paid TTS providers split into @docent/tts-* (C1)
- [x] D9 — Plugin manifest code-generated (C2)
- [x] D10 — public/audio/manifest.json stub no longer required by v3 contract (proved via cross-package tsc with stub absent)
- [x] D11 — zod version pinned to 4.3.6 (`f8dd4f9`)
- [ ] D12 — `requiresTtsCapabilities` declared on at least passage
- [x] D13 — packages/agent normalized to @docent/agent (C3)
- [x] D14 — Kokoro byte-equivalence (decision: ✅ accept; behavior parity, not byte parity)
- [x] D15 — README plugin-authoring guide (E1)
- [x] D16 — Example packs beyond scifi (E2 → `6390517`: finance + brand + captions)
- [x] D17 — Public type JSDoc (E3)
- [ ] D18 — `@docent/*` packages versioned + npm pack dry-runs clean
