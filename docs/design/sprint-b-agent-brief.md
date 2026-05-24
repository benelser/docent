# Sprint B agent brief — compositional grammar

> This is the agent-facing brief, ready to paste into an Agent dispatch the
> moment Sprint A + styling pipeline merge to main.

---

Isolated git worktree of github.com/benelser/docent. **Goal: enable
compositional grammar — scenes can embed other scenes as static visual
snapshots, multiplying every primitive's expressive range.**

## Prerequisites verified at dispatch time

- Sprint A's 5 scene types (`timeline`, `tree`, `map`, `journey-map`,
  `causal-loop`) all merged to main.
- Styling pipeline merged to main; `ResolvedStyle` is the chrome's contract.
- The migration sprint may or may not have landed first; assume your
  scene renderers still read both legacy knobs and `ResolvedStyle`.

Read `docs/design/sprint-b-compositional-grammar.md` IN FULL before
designing — this brief is its operational companion, not a substitute.

## What you must build

### 1. The `EmbeddedScene` type

In `packages/engine/src/engine/spec.ts`, after the `Scene` type, add:

```ts
export type EmbeddedScene = Omit<
  Scene,
  'beats' | 'kicker' | 'heading' | 'cut' | 'cam' | 'style'
> & {
  // optional caption rendered below the embed (max 24 chars)
  caption?: string;
};
```

Strip those chrome fields from any spec input that lands in an `embed`
slot — the validator hard-fails on their presence.

### 2. Slot composition — opt-in additive fields

For each of these parent scene types, add `embed?: EmbeddedScene` to the
named sub-record:

| Parent type | Sub-record | Field |
|---|---|---|
| `landscape` | `LandscapeSubject` | `embed?: EmbeddedScene` |
| `timeline` | `TimelineEvent` | `embed?: EmbeddedScene` |
| `journey-map` | `JourneyStage` | `embed?: EmbeddedScene` |
| `tree` | `TreeNode` | `embed?: EmbeddedScene` |
| `structure` | `Node` | `embed?: EmbeddedScene` |
| `compare` | `CompareCell` | `embed?: EmbeddedScene` |

Every other sub-record stays untouched.

### 3. The allowlists

In `packages/engine/cli/validate.ts`, add a constant table:

```ts
const EMBED_ALLOWLIST: Record<string, SceneType[]> = {
  'landscape': ['mechanism', 'venn', 'chart', 'quantities'],
  'timeline':  ['venn', 'quantities', 'compare', 'structure'],
  'journey-map': ['causal-loop', 'mechanism', 'compare'],
  'tree':      ['tree', 'compare', 'quantities'],
  'structure': ['mechanism', 'chart', 'venn'],
  'compare':   ['quantities', 'chart', 'venn'],
};
```

Validate every `embed.type` against the parent scene's row. Hard-fail
otherwise.

### 4. Hard-fail rules

Add these to `validate.ts`, all severity-default (hard fail):

1. An `embed` field on a sub-record whose parent scene type is not in
   `EMBED_ALLOWLIST` — reject.
2. An `embed.type` not in the parent's allowed types — reject.
3. An embed depth > 2 (parent → embed → embed-of-embed) — reject.
4. An embedded scene that carries `beats`, `kicker`, `heading`, `cut`,
   `cam`, or `style` — reject with the field name in the message.
5. A `reveal` or `focus` dotted path (`item-id.embed`) that doesn't
   resolve to an embed slot — reject.

### 5. Render contract — every scene component gains an embedded mode

Add to every scene renderer's props (`Card.tsx`-level prop change first,
then every scene component):

```ts
type SceneRenderMode = 'full' | 'embedded';
interface EmbedContext {
  bounds: { cx: number; cy: number; w: number; h: number };
  inheritedStyle: ResolvedStyle;
  caption?: string;
}
```

In embedded mode each component:

- Renders inside `bounds` (no full STAGE).
- Drops chrome: no kicker, heading, wordmark, progress, camera.
- Drops narration overlay (parent owns audio).
- Scales typography proportional to `bounds.w` — clamp to the existing
  auto-fit floors so labels never go below 11 px.
- Renders the **final visual state** — no per-beat animation. Embedded
  scenes are tableaux, not movies-within-movies. The reason: audio is
  one track per scene; if embeds animated, the audience would need two
  attention paths.

### 6. Beat orchestration in the parent

Parent scenes' `reveal` and `focus` accept dotted paths:

- `'docent'` — reveal the docent marker on a `landscape`
- `'docent.embed'` — reveal the embed inside the docent marker
- `['docent', 'docent.embed']` — both at once

When `<item>.embed` is in `reveal`, the parent scene component renders the
sub-scene at the item's allocated bounds. Same opacity-spring as the
parent uses for its items.

### 7. The demo film

A `landscape` of explanation tools (Reveal.js / Excalidraw / Manim /
docent) where the docent marker embeds a `mechanism` thumbnail showing
the docent flywheel:

```
parts: [survey, render, judge, distill, brief]
motion: { kind: 'cycle', path: [survey, render, judge, distill, brief], period: 180 }
```

Beat sequence:
1. Reveal the four other markers, no embeds.
2. Reveal the docent marker, no embed yet — it sits as another dot.
3. Reveal `docent.embed` — the mechanism appears inside docent's slot,
   the flywheel renders its final state (no animation; just the diagram).

This proves the contract works end-to-end. 5 scenes total; render at
scale 0.5; save as `films/compositional-demo.json` (untracked per
allow-list).

### 8. Non-regression

- `docent depthcheck linear-algebra` — 5/5 met
- `docent hermetic linear-algebra --scale 0.5` — PASS
- Every gallery film validates with no errors (warnings allowed).

## Non-negotiables

- No commit, no push. Stop at "ready for review."
- `bun` over `npm`.
- Local commits end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Report back with

(a) Files added/modified.
(b) Demo film path + a description of the rendered embed state.
(c) Regression proofs (linear-algebra depthcheck + hermetic).
(d) Any allowlist entries that, in hindsight, should be tighter or
    looser based on your implementation experience.
(e) Anything you couldn't validate.
