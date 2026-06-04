# Archetype × variant — the narrative-function and visual-treatment matrix

A scene's `type` says *what* it shows — a `frame`, a `structure`, a `recap`.
But "what" is half the picture. The other half is *how the scene is moving
the reader's attention* (an arresting cold open vs. a quiet reflection) and
*how loud the visuals should be* (a hero billboard vs. a chamber piece). The
docent grammar names both axes:

- **`archetype`** — the *narrative function*. The rhetorical move the scene
  makes. Borrowed from the prior `/ventures/250` taxonomy.
- **`variant`** — the *visual treatment*. The skin the move wears.

Both are optional. A scene with neither tag renders identically to v3.0.4 —
nothing about an untagged scene shifts. Both, together, are how one
canonical scene spec renders as multiple visually distinct frames carrying
the same meaning, without duplicating any per-scene-type fields.

This document covers:

1. What each archetype and variant means.
2. The resolver — how the kit composes the overlay token bag scene
   components honour.
3. The 4-scenes-in-v1 surface — which scene types actually read the
   overlay and how each one honours it.
4. The worked-example matrix — a `frame` scene rendered as
   `provocation × bold` vs. `mirror × minimal`.
5. The closing note on how `docent help <scene-type>` should surface
   the new dimensions (this doc is the source of truth; the help-scene
   command will read from it in a follow-up).

---

## 1. The archetype vocabulary

Six closed archetypes, named after the rhetorical move they perform.

| Archetype       | Move                                                                                | Default entrance | Title-scale nudge |
|-----------------|-------------------------------------------------------------------------------------|------------------|-------------------|
| `provocation`   | The cold open — a claim that should arrest the reader.                              | `snap`           | × 1.10            |
| `turn`          | The pivot — a "but" or "however" that changes direction.                            | `translate`      | × 1.00            |
| `question`      | The open prompt — invites the reader to predict.                                    | `spring`         | × 1.00            |
| `list`          | An enumeration — three reasons, four traits, five failure modes.                    | `translate`      | × 0.98            |
| `history`       | A backward look — "and this is how we got here".                                    | `fade`           | × 0.96            |
| `mirror`        | Reflects back the reader's likely interpretation — "you might be thinking…".        | `fade`           | × 0.95            |

A spec author tags an archetype to declare the move. The engine reads the
tag and biases entrance shape, title scale, and accent strength via the
`ARCHETYPE_NUDGE` table in `packages/kit/src/frameworks/scene-variants.ts`.

The nudges are *deltas*: they overlay on top of the variant table (next
section). The rhetorical shape always wins on `entranceShape` —
`mirror × bold` is still a fade entrance, not a snap. The title scale
*multiplies*, so a `provocation × minimal` is louder than a plain
`minimal` but still smaller than a `provocation × bold`.

---

## 2. The variant vocabulary

Four closed visual variants, named after the treatment they apply.

| Variant     | Title scale | Entrance shape | Entrance ms | Accent opacity | Grid density | Kicker visible |
|-------------|-------------|----------------|-------------|----------------|--------------|----------------|
| `standard`  | 1.00        | `fade`         | 420         | 0.85           | `normal`     | `true`         |
| `bold`      | 1.25        | `snap`         | 180         | 1.00           | `normal`     | `true`         |
| `stacked`   | 1.05        | `translate`    | 520         | 0.90           | `wide`       | `true`         |
| `minimal`   | 0.85        | `fade`         | 640         | 0.60           | `tight`      | `false`        |

The variant is the visual function — *how loud, how dense, how chrome-y*.
`bold` is the hero billboard; `minimal` is the chamber piece. `stacked`
favours a vertical layout the way the prior `/ventures/250` shorts did,
opening the gap density and softening accent. The fields here mirror the
visualStyle config from that project (font scale, spring physics, opacity
curves, fade-vs-translate behaviour), re-anchored to the kit's token
system.

---

## 3. The overlay token bag

The resolver, `resolveSceneVariant(style, archetype, variant)`, returns a
frozen `SceneVariantTokens` bag with six fields:

```ts
interface SceneVariantTokens {
  titleScale: number;          // multiplier on title basePx
  entranceShape: 'fade' | 'translate' | 'spring' | 'snap';
  entranceMs: number;          // ramp duration in ms
  accentOpacity: number;       // 0..1.25 — accent glow strength
  gridDensity: 'tight' | 'normal' | 'wide';
  kickerVisible: boolean;
}
```

The bag is carried on `CommonSceneProps.variantTokens` and is always
populated — the byte-zero path returns `STANDARD_VARIANT_TOKENS` (the
frozen identity overlay) so an untagged scene reads `titleScale: 1`,
`kickerVisible: true`, etc. without nullchecks.

Compose order (later wins):

1. Baseline `STANDARD_VARIANT_TOKENS`.
2. `VARIANT_TABLE[variant]` delta. Fields the variant doesn't set
   inherit the baseline.
3. `ARCHETYPE_NUDGE[archetype]` nudge. Title scale and accent opacity
   *multiply* the variant's choice; entrance shape and ramp delta
   *overwrite*.

`titleScale` is clamped to `[0.5, 1.6]` after all overlays, so a
malformed nudge cannot explode the type beyond the safe band.

---

## 4. The scene-component contract (v1)

R3 ships variant-honouring renderers for *four* scene components:

- **`frame`** — title hero, tagline, footnote. Honours `titleScale` on
  the hero font, `entranceShape` + `entranceMs` on the title/tagline/
  footnote reveals, `accentOpacity` on the title's halo, `kickerVisible`
  on the chrome kicker pill.
- **`big-idea`** — the takeaway sentence. Honours `titleScale` on the
  sentence font, `entranceShape` + `entranceMs` on the anchor and
  sentence reveals, `kickerVisible` on the chrome kicker.
- **`recap`** — numbered points list. Honours `titleScale` on every
  bullet's font, `entranceShape` + `entranceMs` on each bullet reveal,
  `kickerVisible` on the chrome kicker.
- **`structure`** — node-and-edge diagram. Honours `titleScale` as a
  scale transform on the whole diagram layer (composed with the camera
  scale), `kickerVisible` on the chrome kicker. `gridDensity` is
  resolved on the props but not yet wired into the node-box layout —
  v1 leaves it for the layout-aware structure refactor.

The other 25 scene types in `@bjelser/core` continue to render the
standard treatment as a baseline — they read `variantTokens` from
`common`, but the resolved bag is the byte-zero identity overlay when
the scene is untagged, so existing films render byte-equivalently. A
scene component opts into variant-aware rendering when it's ready; the
threading is universal.

### What "byte-equivalent untagged" means

For each of the 4 updated components, the variant code path is gated
by `scene.variant !== undefined || scene.archetype !== undefined`. When
both are absent, the component falls through to the v1 spring-based
entrance and the v1 font-size table, producing pixel-identical frames
to v3.0.4. The new code path is reached *only* when an author opts in
by tagging the scene.

This is deliberate: R3 is additive. Every existing film renders the
same. The variant system is an *opportunity*, not a default.

---

## 5. The worked-example matrix

Take a `frame` scene with `title: "The runtime is a hostile place"` and
`tagline: "Everything is a process; nothing is a guarantee."`. Author it
twice — once as `provocation × bold`, once as `mirror × minimal`. The
spec change is two lines:

```json
{
  "type": "frame",
  "archetype": "provocation",
  "variant": "bold",
  "title": "The runtime is a hostile place",
  "tagline": "Everything is a process; nothing is a guarantee."
}
```

vs.

```json
{
  "type": "frame",
  "archetype": "mirror",
  "variant": "minimal",
  "title": "The runtime is a hostile place",
  "tagline": "Everything is a process; nothing is a guarantee."
}
```

How the resolver composes the overlay:

| Step                                 | provocation × bold | mirror × minimal |
|--------------------------------------|--------------------|-------------------|
| baseline `titleScale`                | 1.00               | 1.00              |
| variant overlay                      | 1.25               | 0.85              |
| archetype nudge (multiply)           | × 1.10 → **1.38**  | × 0.95 → **0.81** |
| baseline `entranceShape`             | fade               | fade              |
| variant overlay                      | snap               | fade              |
| archetype nudge (overwrite)          | snap               | fade              |
| baseline `entranceMs`                | 420                | 420               |
| variant overlay                      | 180                | 640               |
| archetype nudge (`+delta`)           | 180 − 120 = **60** | 640 + 160 = **800** |
| baseline `accentOpacity`             | 0.85               | 0.85              |
| variant overlay                      | 1.00               | 0.60              |
| archetype nudge (multiply)           | × 1.10 → **1.10**  | × 0.80 → **0.48** |
| baseline `kickerVisible`             | true               | true              |
| variant overlay                      | true               | **false**         |

After clamping `titleScale` to `[0.5, 1.6]`:

- `provocation × bold`: title at **1.38× the base font**, kicker visible,
  title snaps on at frame 0 of its reveal beat, the glow halo at **+10%**
  accent opacity.
- `mirror × minimal`: title at **0.81× the base font**, kicker
  hidden, title fades in over **800ms**, the halo at **0.48 accentOpacity**
  (about half the baseline glow).

Two frames carrying the same statement, one of them an arresting cold
open and the other a quiet reflection. The spec author makes one
edit; the render does the rest.

### Why the byte-equivalent fallback matters

A film tagged with `mirror × minimal` and a film tagged with nothing at
all are *different* renders. Untagged means "I don't want to make this
decision; render the default". `mirror × minimal` means "render the
softest possible version of this move". The kit treats those as
distinct intents — the byte-zero path only fires when both fields are
absent.

---

## 6. `docent help <scene-type>` — note for the CLI follow-up

The current `packages/cli/src/commands/help-scene.ts` walks a scene
plugin's schema and prints required/optional fields, depth rules, and
one canonical example. It does *not* (yet) surface the archetype ×
variant matrix. The follow-up should:

- Add a `VARIANT MATRIX` section after the existing `BEATS` section,
  listing the 6 archetypes and 4 variants and their meanings — pulled
  from the tables in §1 and §2 above.
- For each of the 4 scenes that read `variantTokens` in v1 (`frame`,
  `big-idea`, `recap`, `structure`), append a `HONOURS` block naming
  which fields of `SceneVariantTokens` the scene component actually
  reads, so an author knows what changes when they tag the scene.
- Optionally: a `--variant <name>` flag on `docent help` that re-prints
  the canonical example with the variant tag applied, so the author
  can see what the spec looks like end-to-end.

The current help-scene.ts is intentionally not modified by R3 — the
overlay-local-source pattern keeps that file outside the smoke test
surface area. The note here is the authored contract for the follow-up
agent.

---

## 7. Open questions (logged in the R3 friction notes)

The PR's final report tracks three pieces of friction worth surfacing
in a future iteration:

1. **Component-shape uniformity.** The 4 updated scenes did NOT have
   identical structural shapes; each one needed a small custom adapter
   for how it read the overlay (frame had to gate its `enter()` helper,
   big-idea had to compose with its spring-based anchor sequence,
   recap had to apply the entrance per-bullet, structure had to compose
   `titleScale` with the camera transform). A shared `useVariantEnter()`
   hook would absorb this duplication if R4 adds more variant-aware
   scenes.

2. **Brand-pack extension.** v1's `VARIANT_TABLE` and `ARCHETYPE_NUDGE`
   are kit-owned. A `PresetPlugin` cannot override them today. The
   resolver's `style` argument is reserved for this — a future
   `PresetPlugin.variantTokens?` hook would let brand packs (the
   `tutorial-brand` from PR #7, or a future `fintech` pack) ship their
   own variant deltas, the way they ship their own design tokens.

3. **Archetype on beats?** A 5-beat scene that shifts archetypes
   mid-scene (a `question` archetype that opens with a `provocation`
   beat and lands on a `mirror` beat) cannot express that intent with
   the scene-level tag alone. Adding `archetype?` to `Beat` is
   non-breaking but the rendering contract becomes "the active beat's
   archetype wins" — which would require every variant-aware scene
   component to re-resolve `variantTokens` per beat, not per scene.
   Worth weighing against the simpler scene-level model in R4.
