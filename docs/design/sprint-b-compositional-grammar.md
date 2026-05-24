# Sprint B — compositional grammar

> Status: design draft, not yet dispatched. Awaiting Sprint A merge.

## The move

Today, every scene type stands alone. A `landscape` has subjects; each subject
is a dot with a label. A `timeline` has events; each event is a date plus a
label. None of them can contain another scene.

Sprint B lets scenes **nest**. A `landscape` whose markers are `mechanism`
thumbnails. A `timeline` whose events are `venn` snapshots. A `journey-map`
stage that contains a `causal-loop` showing the dynamics at that moment.

The unlock is *exponential, not linear*. Every primitive multiplies what every
other primitive can express. Five new scene types added to a flat grammar
shipped five new things. The same five added to a compositional grammar ship
*all the ways those five can host every other primitive*.

## The contract

### 1. Slot composition, not arbitrary recursion

Each scene type opts in by declaring which fields can hold a sub-scene. Not
every field can. The author can't make a `frame` whose title is itself a
`mechanism` — that's nonsense, and the validator hard-fails on it.

Opt-in slots (initial pass):

| Parent scene | Slot field | Sub-scene type allowlist |
|---|---|---|
| `landscape` | `subjects[].embed` | `mechanism`, `venn`, `chart`, `quantities` |
| `timeline` | `events[].embed` | `venn`, `quantities`, `compare`, `structure` |
| `journey-map` | `stages[].embed` | `causal-loop`, `mechanism`, `compare` |
| `tree` | `children[].embed` | recursive `tree`, `compare`, `quantities` |
| `structure` | `nodes[].embed` | `mechanism`, `chart`, `venn` |
| `compare` | `cells[].embed` | `quantities`, `chart`, `venn` |

Every other scene type is leaf-only in this sprint. We can extend the
allowlists in later sprints as we learn what compositions actually serve
arguments.

### 2. Embedded scenes are a constrained subtype

```ts
// New type added next to Scene.
export type EmbeddedScene = Omit<
  Scene,
  | 'beats'        // parent's beats orchestrate
  | 'kicker'       // no chrome — parent owns it
  | 'heading'      // ditto
  | 'cut' | 'cam'  // no scene-level camera or cut transitions
  | 'style'        // inherits resolved style from parent
>;
```

A pre-flight transform produces an `EmbeddedScene` from a `Scene` (drop the
chrome fields). At schema/validator level we reject embedded scenes that
carry chrome fields, with a clear error.

### 3. Render contract — every scene component gains an embedded mode

Every scene renderer takes a new prop:

```ts
interface SceneRenderProps {
  // ... existing ...
  mode?: 'full' | 'embedded';
  // When embedded: bounding box the parent allocates, in stage coordinates.
  bounds?: { cx: number; cy: number; w: number; h: number };
  // When embedded: the parent's resolved style is inherited.
  inheritedStyle?: ResolvedStyle;
}
```

In embedded mode each component:

- Renders inside `bounds`, not the full STAGE.
- Drops all chrome (kicker / heading / wordmark / progress / camera).
- Drops the narration overlay (parent owns audio).
- Scales typography proportional to `bounds.w` — long-label safety nets still
  hold but at the embedded scale.
- Drops any per-beat animation; renders the *final* visual state. The parent
  decides when the embed appears via `reveal` directives. Embedded sub-scenes
  are *static snapshots*, not movies-within-movies.

That last point is critical: **embedded scenes do not animate over time**.
They render as a single visual state. The reason is audio: only one narration
track per scene. If embeds animated, the audience would need eyes in two
places at once. Embeds are tableaux — a snapshot of one cognitive move,
captured at the moment the parent's beat reveals it.

### 4. Beat orchestration

A parent scene's `reveal` can reference both its top-level items AND the
embedded sub-scenes inside those items:

```ts
{
  id: 'landscape-3',
  reveal: ['docent', 'docent.embed'],   // reveals docent's marker AND its mechanism thumbnail
  focus: ['docent.embed']                // zooms attention to the embed
}
```

The dotted-path syntax (`<item>.embed`) is the only way the parent refers to
its sub-scenes' visibility. The validator enforces that dotted paths resolve
to real embed slots.

### 5. Validator rules — hard fails

- An embed's `type` must be in the parent's allowlist for that slot.
- Embed depth max 2 (a parent can embed; that embed cannot itself embed
  another scene). Prevents pathological nesting; we can lift to 3 if a real
  use case demands.
- Embedded scenes must not carry `beats`, `kicker`, `heading`, `cut`,
  `cam`, `style` (the dropped chrome fields).
- Reveal/focus dotted paths must resolve to existing embed slots.
- A scene type that doesn't declare an embed slot rejects any `.embed` field
  (don't let authors stuff embed into a `passage`).

### 6. Schema additions

For each parent scene type with embed slots: add `embed?: EmbeddedScene` to
the relevant sub-record's $def. Add the `EmbeddedScene` $def itself.
Document the allowlist in the $def's description so the JSON Schema's own
docs are honest.

### 7. Render-time fidelity

The renderer renders the embed at the resolved bounds, using the inherited
style. Two visual choices:

- The embed gets a subtle bounding-box outline (1.5 px, 30% accent) so it
  reads as a *thing-within-a-thing*, not a redrawn primary visual.
- A short caption (max 24 chars) under the embed gives it a label —
  `embed.caption`, optional.

### 8. One demo film proving it

A single demo at the end of the sprint:

A `landscape` of explanation tools (Reveal.js / Excalidraw / Manim / docent),
where the docent marker has a `mechanism` embedded showing the docent
flywheel (survey → render → judge → distill → repeat). When the docent
marker reveals, its embed reveals with it; the audience sees `docent`'s
position on the landscape *and* the loop that makes it run, in one frame.

That's the kind of film no current tool can render.

## Non-regression contract

After this sprint:

- Every existing gallery film still validates (no parent scene was edited;
  embeds are opt-in additive fields).
- `docent hermetic linear-algebra --scale 0.5` still PASSES.
- `docent depthcheck linear-algebra` still 5/5 met.
- The new render path for embedded scenes is exercised by the demo film.

## Out of scope for this sprint

- Cross-film citation (the `quote` scene type) — a separate primitive.
- Animated embeds — we render static snapshots only.
- Self-documenting grammar (`/docent-teach`) — separate sprint, builds on
  this one.

## Dependencies before dispatch

Sprint B must wait for:

1. Sprint A's 5 scene-type agents merge cleanly (so the parent scene types
   `timeline`, `tree`, `journey-map`, `causal-loop` exist in the spec for
   slot-composition opt-in).
2. The styling pipeline merges (so `ResolvedStyle` exists for the
   `inheritedStyle` prop to consume).

After both: Sprint B dispatches as a **single agent** (not parallel — it's
foundational and touches every scene renderer). Estimated effort: ~3-4 hours
of agent time given the scope. Same worktree pattern; demo film proof at the
end.
