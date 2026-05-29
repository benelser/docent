# Brand pack tutorial — shipping a docent preset without forking core

This walkthrough is the prose companion to `films/brand-pack-tutorial.json` —
the docent film about how to build a docent brand pack. Watch the film once,
then come back here for the seams it points at.

The promise: **a third party can ship a complete docent visual theme in three
files** (`tokens.ts`, `index.ts`, `docent.config.ts`), without forking
`@bjelser/core` and without touching the rendering engine. This file
documents the seams the engine commits to, the seams you implement, and the
two seams that today require care.

The tutorial source lives at:

```
docent.config.ts                                      ← repo-root entry point
tutorials/brand-pack/presets/tutorial-brand/
  ├─ index.ts                                         ← the PresetPlugin object
  └─ tokens.ts                                        ← the DesignTokens bundle
films/brand-pack-tutorial.json                        ← the tutorial film
tutorials/brand-pack/validation-transcript.txt        ← the doctor/validate evidence
```

If you only read one file in the tutorial, read
[`tutorials/brand-pack/presets/tutorial-brand/index.ts`][index] — it is the
PresetPlugin shape, annotated.

[index]: ../tutorials/brand-pack/presets/tutorial-brand/index.ts


## 1. The load mechanism — `docent.config.ts`

`docent.config.ts` is the only entry point a brand pack needs. The CLI loads
it at startup and registers any plugins it exports.

**Where it lives.** Anywhere in your project's ancestor tree from the working
directory you invoke `docent` in. The loader (`packages/cli/src/load-config.ts`)
walks up directory by directory, looking for the first of:

```
docent.config.ts
docent.config.tsx
docent.config.js
docent.config.mjs
```

The walk caps at 12 ancestors. In a workspace repo, putting the file at the
repo root is the conventional choice — every subcommand from anywhere in the
tree picks it up.

**What it exports.** A `default` export whose shape is:

```ts
export interface DocentConfig {
  readonly plugins?: ReadonlyArray<Plugin>;
}
```

A `Plugin` is the discriminated union of `ScenePlugin`, `PresetPlugin`,
`TtsProviderPlugin`, and `FeaturePlugin`. The engine sniffs each plugin's
`kind` field and routes it to the matching registry — your config file does
not need to know the difference.

The tutorial's config file is nine lines of executable code:

```ts
// docent.config.ts — repo-root extension point for the brand-pack tutorial.
import {tutorialBrandPreset} from './tutorials/brand-pack/presets/tutorial-brand';

export default {
  plugins: [tutorialBrandPreset],
};
```

**What happens at startup.** `packages/cli/src/engine-factory.ts` is the
*only* place in the CLI that constructs an `Engine`. The order is fixed:

1. `engine.use(corePlugins)` — `@bjelser/core`'s 29 scenes, 6 presets,
   1 TTS provider (`kokoro`), 2 features.
2. `engine.use(loadedConfig.plugins)` — your registrations, on top.

Conflict detection is hard, not soft: a user plugin that reuses a
`presetName` (or `sceneType`, or `providerId`, or feature `name`) already
claimed by core throws at `engine.use()` with both plugin names surfaced.
You will see this immediately the first time you try it — there is no silent
shadowing.

**How to confirm it loaded.** `bunx docent doctor` is the audit. With the
tutorial registered, it reports `7 presets` (6 from core + 1 from
`docent.config.ts`) and lists the config path on the same line:

```
engine: 29 scenes · 7 presets · 1 tts · 2 features
        (+1 from /…/docent.config.ts)
```

The `+1 from <path>` is the load-bearing evidence. If it does not appear,
your config did not load.


## 2. The plugin shape — `PresetPlugin`

`PresetPlugin` is one of the four discriminated `Plugin` shapes. The full
type lives in [`packages/kit/src/protocols.ts`][protocols]. The mandatory
surface:

[protocols]: ../packages/kit/src/protocols.ts

```ts
export interface PresetPlugin extends PluginBase {
  readonly kind: 'preset';            // discriminator
  readonly name: string;              // human ID; surfaced in doctor
  readonly version: string;           // your semver
  readonly presetName: string;        // looked up by FilmSpec.style.preset
  readonly tokens: DesignTokens;      // the bundle every scene reads
  readonly notes: string;             // one-line description for style list
  // Optional:
  readonly visualization?: VisualizationStyle;
  readonly cue?: string;              // surfaced by `docent style list`
  readonly signals?: SceneFitSignal[]; // weighted needles for `style recommend`
  readonly extends?: string;          // R4 — preset composition
  readonly intent?: …;                // intent → token-delta map
  readonly sceneOverrides?: …;        // sceneType → token-delta map
}
```

**`presetName` vs. `name`.** `name` is the human-facing plugin id
(`@tutorial/brand-pack`); `presetName` is the string the film spec opts in
with (`tutorial-brand`). Two different namespaces — collisions happen on
`presetName`, not `name`.

**`tokens`.** The structured bundle that holds every visual decision. See
section 3.

**`visualization`.** Family-level renderer knobs — legend position, grid
lines, axis labels, max labels per series. Distinct from tokens because
they are *layout-shaping*, not *colour-shaping*. The 6 built-ins each
declare a complete `VisualizationStyle`; a brand pack that omits the field
inherits family knobs from any preset it `extends`.

**`cue` and `signals`.** Optional, but `docent doctor` warns on a scene
plugin with empty signals (preset plugins are not subject to the same
warning, but the `style recommend` command never pulls a signal-less preset
into ranked results). Tutorial-brand declares ten weighted needles for the
broadsheet/newsprint vocabulary.

**`extends`.** A reserved R4 field. Today the resolver ignores it (presets
remain flat); ship the field if you want your preset to participate in a
preset-composition chain once R4 lands without bumping its major version.


## 3. Token shape — how `DesignTokens` maps to scene appearance

`DesignTokens` is the contract every scene component reads through. The
type is exported from `@bjelser/kit`:

```ts
export interface DesignTokens {
  bg:        BackgroundTokens;   // 6 background steps (void → lineHi)
  ink:       InkTokens;          // 4 ink steps (hi · mid · low · faint)
  accent:    AccentTokens;       // 6 accent channels (blue, cyan, green, amber, rose, violet)
  typography: TypographyTokens;  // family, size, weight, lineHeight, letterSpacing
  spacing:   SpacingTokens;      // xs · sm · md · lg · xl · gutter
  radius:    RadiusTokens;       // sm · md · lg
  stroke:    StrokeTokens;       // hairline · thin · regular · bold
}
```

**Where each group lands on screen.**

| Token group  | What it skins                                                    |
| ------------ | ---------------------------------------------------------------- |
| `bg`         | The film background (`base`), every panel (`panel`, `panelHi`), every hairline (`line`, `lineHi`), and the deepest shadow band (`void`) |
| `ink`        | Headline text (`hi`), body text (`mid`), captions (`low`), metadata / placeholders (`faint`) |
| `accent`     | Every node accent in `structure` / `tension` / `quantities`; every series colour in `chart` / `quantities`; every callout in `closeup` / `passage` |
| `typography` | Every text run: kicker / heading / display sizes (`size`), weights, line height. Family choice (`sans` / `serif` / `mono`) is what most fingerprints a brand |
| `spacing`    | Every gutter, gap, and pad in every scene's layout grid          |
| `radius`     | Corner radius on every panel and card                            |
| `stroke`     | Edge weight on every diagram rule, divider, and chart axis       |

**The single contract.** Every scene component reads via
`common.style.tokens.<group>.<key>` — never through a global theme module.
That discipline is what lets a third-party preset reskin every built-in
scene without any scene code changing.

**Distinguishing a preset from its neighbours.** The 6 built-ins differ
along these axes:

| Preset       | `bg.base`     | `ink.hi`  | Dominant `accent` | `typography.family.sans / serif`  |
| ------------ | ------------- | --------- | ----------------- | --------------------------------- |
| `neutral`    | near-black    | off-white | blue (the floor)  | sans default                      |
| `engineering`| console dark  | code-white| cyan              | mono-forward                      |
| `editorial`  | warm walnut   | cream     | burgundy / ochre  | serif everywhere                  |
| `paper`      | cool cream    | ink-black | academic blue     | serif body, sans chrome           |
| `analytical` | deep dark     | data-white| green             | sans + mono                       |
| `executive`  | rich slate    | white     | gold              | premium sans                      |
| **`tutorial-brand`** | **ivory** | **navy-graphite** | **crimson** | **condensed sans + transitional serif** |

The tutorial preset is a different point in the space, not a tweak of
editorial. If you cannot find a clear axis on which your brand sits
distinctly from these six, you may be writing intent tweaks (a tone, a
density) rather than a preset — see `StyleIntent` for the lighter touch.


## 4. Using your preset from a film spec — `style.preset`

A film spec opts into a preset by writing one field:

```jsonc
{
  "meta": {…},
  "style": {
    "preset": "tutorial-brand",
    "intent": {
      "tone": "technical",
      "audience": "technical",
      "density": "comfortable",
      "emphasis": "insight-first"
    },
    "rationale": "Why this preset for this subject — one sentence."
  },
  "scenes": [ … ]
}
```

- **`style.preset`** is the `presetName` your `PresetPlugin` declared. The
  registry looks it up by string match.
- **`style.intent`** is the lighter touch: `tone`, `audience`, `medium`,
  `density`, `theme`, `emphasis`. Each axis can pin a token-delta via the
  preset's `intent` map.
- **`style.rationale`** is documentation — a sentence the agent layer and
  the depth gate can read, explaining why this preset fits this subject.
  Omit it and the spec validates; include it and your survey notes survive
  into the spec.

The tutorial film opts in with `"preset": "tutorial-brand"`. The render
chain looks the preset up, composes its tokens on top of the neutral floor,
applies any intent-driven deltas, and produces a single `ResolvedStyle`
that every scene reads. There is no scene-by-scene preset selection — the
preset is film-scoped.


## 5. The 6 built-in presets — read these for shape

When in doubt, copy a built-in and modify. The 6 ship-with presets live
under `packages/core/src/presets/`:

| Path                                           | When to use it as a template                              |
| ---------------------------------------------- | --------------------------------------------------------- |
| `packages/core/src/presets/neutral/`           | The thinnest scaffolding — minimal opinion. Read this if your brand has no strong identity yet and you want to layer tokens onto the floor. |
| `packages/core/src/presets/engineering/`       | Console / IDE aesthetic. Read this for monospace-forward type and tight grid spacing. |
| `packages/core/src/presets/editorial/`         | Warm-walnut serif. The closest analogue if your brand is long-form prose. The tutorial-brand preset uses editorial as its starting structure. |
| `packages/core/src/presets/paper/`             | Cool paper-cream, academic blue. Read this for a light ground with a restrained, ink-on-paper feel. |
| `packages/core/src/presets/analytical/`        | Dark, data-first. Read this for charts where the grid does the work. |
| `packages/core/src/presets/executive/`         | C-suite deck — rich dark slate, gold single-accent emphasis. Read this for a single-accent brand voice. |

Each preset is two files: `index.ts` (the `PresetPlugin` object — typically
fewer than 30 lines) and `tokens.ts` (the bundle — typically fewer than
100 lines). The whole built-in surface fits in a single screen per preset.


## 6. The verification gates — running them on your pack

Three commands grade a brand pack without rendering a film:

```
bunx docent doctor                              # plugin conformance + load proof
bunx docent validate <film-id>                  # structural spec check
bunx docent depthcheck <film-id>                # every plugin's depth rules
```

**`doctor`** is the load proof. With your config registered, the engine
line reports your preset count incremented by one:

```
engine: 29 scenes · 7 presets · 1 tts · 2 features
        (+1 from /…/docent.config.ts)
```

**`validate`** runs the engine's structural validator (`engine.validate(spec)`).
It checks per-scene shape (every scene plugin's `validate` hook), film-level
structure (scene ordering, position contracts), and the spec's JSON Schema.
A spec that uses a preset name that does not resolve gets flagged at
render-time, not here — `validate` does not look up the preset.

**`depthcheck`** runs every registered plugin's `depthRules` over the spec.
A preset plugin contributes no depth rules; the value of running depthcheck
on a tutorial spec is to confirm the *content* of the film clears the bar
that every scene type advertises. The tutorial film clears cleanly on all
seven scenes.

The full transcript from this tutorial run lives at
[`tutorials/brand-pack/validation-transcript.txt`][txn]. The JSON form of
`doctor` is the easiest to assert in CI:

[txn]: ../tutorials/brand-pack/validation-transcript.txt

```
$ bunx docent doctor --json | jq '.engine'
{
  "scenes": 29,
  "presets": 7,
  "features": 2,
  "tts": 1,
  "userPlugins": 1,
  "configPath": "/…/docent.config.ts"
}
```

`userPlugins` going from `0` to `1` (and `presets` from `6` to `7`) is the
single load-bearing assertion to gate on.


## 7. Two seams that take care

The architecture is clean enough that a brand pack mostly *just works*.
The two places it does not are worth naming.

**Contrast on the brightest panel.** A token bundle that passes WCAG AA on
`bg.base` can quietly fail on `bg.panelHi` — the focused card surface every
scene leans on. The fix is not to retune ink per panel; it is to pin
`ink.hi` against `bg.panelHi` first and accept the larger contrast ratio on
the dimmer surfaces. The tutorial-brand preset takes navy-graphite
(`#10142b`) on pure white (`#ffffff`) for 16:1, which leaves room on every
darker step.

**Accent saturation in multi-series charts.** A brand-strength accent
(`accent.rose` at full saturation for tutorial-brand) reads as the brand on
a headline; on a six-series chart, it drowns out the other five accents.
The preset has only one knob — the accent palette — and the chart scene
has only one knob — `visualization`. The resolution sits in your hands:
either dampen the dominant accent and accept a quieter brand voice, or
treat charts as a special-case and override accents at the scene level via
`sceneOverrides`. The tutorial film surfaces the trade-off as its `tension`
scene; the preset itself does not resolve it.


## 8. What this proves

The brand pack tutorial is the working acceptance test for docent's
extension contract.

- A repo-root `docent.config.ts` registers a custom `PresetPlugin`.
- The CLI walks up to find it, dynamically imports it, registers it on top
  of `corePlugins`.
- `doctor` reports `7 presets · (+1 from <path>)` — the load is visible.
- `validate` and `depthcheck` clear the spec without modification.
- A film opts in by writing `style.preset = "tutorial-brand"` and renders
  through the engine the same way every built-in film does.

No fork of `@bjelser/core` was needed. No source file under `packages/`
was modified. The third-party-pack on-ramp works.
