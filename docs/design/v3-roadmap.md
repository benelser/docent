# Docent v3 — the roadmap

> **Status:** post-rc.0 forward-look. Sets the framing, the rank-stack, and what we do first.

## The framing

> **A2A** is to agent ↔ agent. **MCP** is to model ↔ tool. **Docent** is to **LLM ↔ explanatory video** — the format that makes structured explainer video portable.

Working positioning candidates (the launch picks one):

- **"Markdown for video. Built for LLMs."**
- **"Write a video. The JSON is the source."**
- **"Structured explainer video — JSON in, narrated MP4 out."**
- **"Docent is to explainer video what Markdown is to prose."**

What it is in plain terms: a JSON file that describes a film via a closed grammar of cognitive moves; a CLI that renders it; a contract that catches sloppy authoring before render. Designed for LLMs to author + humans to share.

**Distribution channel = coding agents.** Claude Code, Cursor, Cline, Aider, and every other shell-capable agent already treat `docent build`, `docent scene-fit recommend`, `docent doctor` as first-class invocations. The CLI is the integration surface; no MCP wrapper needed for the primary audience.

---

## The road traveled

| Phase | What landed |
|---|---|
| Spike (v3.0 Phase A) | Framework/implementation split. §10 acceptance test (a third-party pack renders end-to-end without forking core). |
| Stabilization sprint | 18 debt items closed. Audio overlay wired. Embed renderers real. Strict tsc green. Engine bridge eliminated. |
| Boundary push | All three forward-compat hooks made real: R3 modifiers, R4 preset composition, R6 microsyntax preprocessor. Seven reference packs ship — one per hook. |
| Engine rip | `packages/engine/` deleted in full. `docent-legacy` script removed. Agent scripts moved to `packages/agent/scripts/`. Workspace: 8 → 7 packages. |

## Lay of the land today

- **7 contract packages** — kit + core + cli + agent + 3 TTS adapters
- **7 reference packs** covering every documented hook
- **29 canonical scene plugins** in `@docent/core`, each with cue + signals + depth rules
- **6 presets** advertising cue + signals
- **40 CLI commands/subcommands**
- **All `private: true`** — the explicit publish gate, still in place

---

## SWOT

### Strengths (earned, double down)

- **Closed grammar with sharp contracts.** Schema + depth rules + judge dimensions + cue + signals on every scene. Auditable, type-safe, registry-enforced.
- **Symmetric extension surface.** `@docent/core` is one consumer of `@docent/kit`. The §10 acceptance test proves there's no privileged path.
- **The depth contract.** Films must say something. The contract refuses sloppy renders. This is the **moat against AI slop video**.
- **Agent-first authoring loop.** survey → treatment → spec → judge → render. Each stage is named, scripted, hermetically runnable.
- **First-class taxonomy.** A closed 7-cluster cognitive taxonomy gives authors a vocabulary that's *grammatical*, not just stylistic.
- **Plurality of reference packs.** Seven runnable demos covering every hook.
- **CLI-native.** Every command is shell-callable, JSON-modeable, agent-friendly.

### Weaknesses (each one becomes a roadmap item)

| Weakness | Flipped by |
|---|---|
| No published packages | Tier 0 — publish |
| Positioning unclear ("argued explanation" was over-indexed) | Tier 0 — manifesto |
| No share surface | Tier 1 — docent.io |
| CLI ergonomics for agents not fully optimized | Tier 1 — `docent describe` + JSON-everywhere sweep |
| Author UX behind Manim / Slidev | Tier 2 — studio + VSCode |
| Slow renders cap virality | Tier 2 — `docent shorts` (60s format) |
| Discovery slow; surveys hard to write | Tier 3 — domain packs ship vertical templates |
| Quality signals invisible to viewers | Tier 3 — depth scoreboard |

### Opportunities

- The format becomes the share unit. `.docent.json` files travel like Markdown does.
- Vertical domain packs are a network-effect surface. Medicine, security, finance, education each ship docent variants tuned for that domain.
- Translation pipeline (one spec, N languages) is a single-spec multiplier — already enabled by ElevenLabs adapter.
- Public depth scoreboard turns the contract into a visible quality signal — differentiates against AI slop video.

### Threats

| Threat | Mitigation |
|---|---|
| Remotion lock-in | Keep `SceneRenderProps` minimal; watch Theatre.js + Motion Canvas as fallbacks. |
| "AI slop video" backlash | Lean into depth contract as the differentiator. |
| Big AI players ship film-from-prompt (Veo, Sora, Pika) | Docent is *explanation*, not *generation*. Grammar is the moat. |
| Closed grammar reads as restrictive | "29 cognitive moves is the point" — manifesto leans into the framing. |
| Plugin ecosystem doesn't materialize | Seed 3–5 high-quality domain packs ourselves first. |
| Author UX falls behind community-driven tools | Studio + live preview before adoption tests author patience. |

---

## The rank-stack

### Tier 0 — the unblock (this week)

**1. v3.0.0 GA — publish the 6 public packages to npm.**
Flip `private: true` on kit + core + cli + tts-openai + tts-elevenlabs + tts-compatible. Bump versions from `3.0.0-rc.0` → `3.0.0`. One more `npm pack --dry-run` per package. Tag `v3.0.0`. `npm publish` ×6. ~1 hour of work.

**2. The manifesto — `docs/the-format.md` (+ landing-page copy).**
Names the format. Includes the one-line framing (TBD which candidate), the wire-format primer, the depth contract framing, and the "29 cognitive moves" justification. ~2 hours.

### Tier 1 — make docent native to LLM workflows

**3. `docent.io` v0 — paste a spec, get a share URL.**
No accounts. Paste JSON → render queued → public link + thumbnail + embed code. Cached forever. Cloudflare Worker + R2 + a render worker is enough. ~3–5 days.

**4. CLI ergonomics for agent invocation.**
- `--json` on every command (most have it; finish the sweep)
- `docent describe` — emits the full computed schema + scene catalog + preset catalog + cluster taxonomy as one JSON blob. An agent reads this and knows what's available.
- Clean exit codes + machine-parseable error envelopes everywhere
- `docent agent-brief` — outputs the SKILL.md / prompt scaffolding so an agent can self-prime
- ~3–5 days

### Tier 2 — make docent first-class to humans too

**5. `docent studio` — live preview.**
Remotion Studio integration (`docent studio <film>`) + a VSCode extension (schema-aware JSON, inline scene-fit recommendations, "preview at cursor"). ~1–2 weeks for the extension; Studio wiring is mostly config.

**6. `docent shorts` — the 60-second format.**
New `meta.format: "short"` that gates duration + scene count. Optimized for vertical 9:16 + horizontal 1080p. ~1–2 days.

### Tier 3 — network effects + depth at scale

**7. Seed 3 first-party domain packs.**
`@docent/medicine` (case studies, clinical workflows), `@docent/security` (CVE walkthroughs, incident timelines), `@docent/education` (lesson explainers). Each ships scenes + surveys + treatment templates tuned for that domain.

**8. Depth scoreboard.**
Public surface at `docent.io/scoreboard`. Every published docent auto-scores. Top films climb. The depth contract becomes a visible quality signal.

**9. Translation pipeline.**
One spec, N languages. Agent translates narration; renderer renders N films. Pairs with `@docent/tts-elevenlabs` (multilingual, native alignment).

---

## What we do first

Tier 0, both items, this week.

1. **Publish v3.0.0.** Flip the 6 private flags, bump to `3.0.0`, dry-pack, `npm publish`. Real GitHub release with the 4 hero films attached (already produced).
2. **Draft the manifesto.** ~300 lines naming the format. Picks one of the framing candidates and runs with it.

Once both land, Tier 1 #3 (`docent.io`) and #4 (CLI ergonomics) move to the front of the queue together. Tier 2 + 3 are scheduled in cadence as adoption signals grow.
