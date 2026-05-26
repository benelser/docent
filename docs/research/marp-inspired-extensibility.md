# Marp-Inspired Extensibility for docent

A research brief on the patterns that the Marp ecosystem (marp-team) got right,
and which of them docent should adopt to evolve from a monolithic Remotion app
into an extensible explanation engine with a plugin surface, third-party scene
types, and shareable presets.

The goal of this document is not to recommend adopting Marp wholesale — Marp
renders static HTML slides, docent renders animated MP4 explainers — but to
extract the **architectural moves** Marp made that translate directly to
docent's problem.

---

## 1. The Marp ecosystem at a glance

Marp is intentionally layered, with each layer doing one job:

| Layer | Repo | What it owns |
|---|---|---|
| Framework | `marp-team/marpit` | Markdown → AST → HTML/CSS pipeline. No themes, no opinions. Defines the *contract* a slide deck honors. |
| Implementation | `marp-team/marp-core` | An opinionated subclass of Marpit: built-in themes, math, emoji, auto-scaling, code highlighting, GFM. The "batteries-included" default. |
| Surface (CLI) | `marp-team/marp-cli` | Output formats (HTML, PDF, PPTX, PNG), watch/server modes, presenter, browser drivers. Accepts `--engine` to swap the engine. |
| Surface (editor) | `marp-team/marp-vscode` | Live preview, theme picker, command palette. |
| Surfaces (inactive) | `marp-web`, `marp-react`, `marp-vue` | Embed surfaces. Discontinued — the CLI won. |

The split is load-bearing. Marpit is the framework; Marp Core is *one* implementation; the CLI is a *consumer*. Anyone can write a custom engine that subclasses Marpit, hand it to the CLI via `--engine`, and ship a fully different presentation product without forking anything.

Marpit's README is blunt about this: *"We do not provide any themes because Marpit is just a framework."* The framework's job is to be useful to other implementers, not to look good out of the box.

This is the move docent is missing.

---

## 2. What the framework owns vs. what the implementation owns

The split is the most important pattern in Marp. It maps cleanly onto docent.

**Marpit (the framework) owns:**

- The Markdown → token AST pipeline (delegated to `markdown-it`).
- The closed grammar of *what a slide is*: a `<section>` element, with directives, with a background, with a header/footer.
- The directive system as a sealed object (`customDirectives.global`, `customDirectives.local`) — the framework defines *how* directives plug in, the implementation defines *which* ones exist.
- The theme contract: a theme is a CSS string with a `/* @theme name */` meta-comment. A `ThemeSet` collects themes. The framework owns the contract; it ships zero themes.
- The plugin protocol: `marpit.use(plugin)`. Plugins are typed at runtime (markdown-it vs. PostCSS vs. Marpit) by sniffing properties.

**Marp Core (the implementation) owns:**

- The default themes (Default, Gaia, Uncover) shipped as CSS strings registered through `themeSet.add()`.
- The opinionated extensions: math (KaTeX/MathJax swap), emoji (twemoji), auto-scaling (`<!-- fit -->`), code highlighting (highlight.js), GFM tables/strikethrough.
- Constructor defaults that *flip Marpit options on*: `inlineSVG: true`, `looseYAML: true`, `cssContainerQuery: true`, `breaks: true`, `linkify: true`.

The key trick: **Marp Core registers its features as plugins on a vanilla Marpit instance.** It is a customer of the framework just like any third party. The proof is in `marp-core/src/marp.ts`:

```ts
protected applyMarkdownItPlugins(md) {
  super.applyMarkdownItPlugins(md)
  md.use(htmlPlugin.markdown)
    .use(emojiPlugin.markdown)
    .use(mathPlugin.markdown)
    .use(autoScalingPlugin.markdown)
    .use(sizePlugin.markdown)
    .use(scriptPlugin.markdown)
    .use(slugPlugin.markdown)
}
```

There is no privileged path. Marp Core uses the same `md.use(...)` chain that a third-party plugin would use. That single discipline — **the default implementation is itself a plugin pack** — is what makes the framework genuinely extensible. The day the framework starts having "fast paths" that plugins can't take, extensibility dies.

---

## 3. The directive system — declarative annotations that stay terse

Marp's directives are the pattern most directly portable to docent's JSON spec.

### Grammar

Directives are YAML. They live in two places:

```markdown
---
theme: gaia
paginate: true
---

<!-- _backgroundColor: aqua -->
# A slide with a cyan background
```

Frontmatter for *global* directives, HTML comments for *local* directives. Same key/value language in both — only the location varies. A `_` prefix means "this slide only" (a "spot directive"). No prefix means "this slide and onward."

### Resolution model

Three tiers:

- **Global** (`theme`, `lang`, `headingDivider`, `style`) — affect the whole deck. Last-write-wins on duplicates.
- **Local** (`backgroundColor`, `class`, `header`, `paginate`, ...) — affect this slide and inherit forward.
- **Spot** (same names as local, prefixed `_`) — affect *only* this slide; don't inherit.

This three-tier model — deck / slide-onward / slide-only — is exactly the inheritance structure docent needs for film-wide / scene-onward / beat-only style and intent.

### The extension point

```js
marpit.customDirectives.global.$theme = (value, marpit) => ({ theme: value })

marpit.customDirectives.local.colorPreset = (value, marpit) => {
  switch (value) {
    case 'sunset': return { backgroundColor: '#e62e00', color: '#fffff2' }
    case 'dark':   return { backgroundColor: '#303033', color: '#f8f8ff' }
    default:       return {}
  }
}
```

A custom directive is a pure function `(value, marpit) -> partialProps`. It returns a partial property object that is *merged into the same downstream object the built-in directives produce*. There's no separate code path for built-in vs. custom — both feed the same merge. The merged object then lands on the `<section>` tag as both a `data-*` attribute and a CSS custom property, in kebab-case.

That last detail is the punchline: **directives are not just config, they are reified into the DOM/CSS so themes can react to them.** A theme can write `section[data-color-preset="sunset"] { ... }` and respond to a user-defined directive it has never heard of. The directive system is the contract between author intent and theme behavior.

---

## 4. The theme system — themes are CSS, themes are data

A Marpit theme is *just a CSS string* with one mandatory meta-comment:

```css
/* @theme my-first-theme */
section {
  background: #123;
  color: #fff;
  width: 1280px;
  height: 720px;
}
```

That's the entire contract: one comment for the name, optionally `@size`, optionally `@auto-scaling`. Selectors target raw HTML elements (`section`, `h1`, `p`). No mixins. No special classes. No SCSS required. The framework provides no helpers because there's nothing to help with.

### Composition

Themes compose via `@import` or `@import-theme`:

```css
/* @theme my-extension */
@import 'default';
section { color: red; }
```

The imported theme's metadata cascades (e.g. `@size` from the parent is honored unless explicitly disabled). This gives a *real* inheritance graph for themes without the framework defining one — CSS does the work.

### Author override without forking

Three escape hatches, in order of locality:

1. `<style>` block in Markdown → bundled into the theme CSS for this deck only.
2. `<style scoped>` block → scoped to a single slide.
3. `style:` global directive in frontmatter → same as `<style>` but expressed declaratively.

This three-way escalation (scoped → deck → theme file) lets authors override without ever editing the theme. Docent's presets system has *none* of these escape hatches today: a film either inherits from a preset or doesn't, with no inline override path.

### Registration API

```js
const theme = marpit.themeSet.add(`/* @theme dark */ section { ... }`)
marpit.themeSet.default = theme
```

A theme set is a registry keyed by `@theme name`. Adding a theme returns a `Theme` instance. Setting `themeSet.default` defines the fallback. A theme can be added from a string, from a file, or from a Marpit plugin. This means a third-party npm package can ship a theme as a one-line plugin: `marpit.use(({ marpit }) => marpit.themeSet.add(themeCSS))`.

---

## 5. The plugin model — one `use()`, three kinds of plugin

Marpit accepts three plugin types through a single `use()` chain:

```js
const marpit = new Marpit()
  .use(markdownItContainer, 'columns')  // markdown-it plugin
  .use(postcssMinify())                  // PostCSS plugin
  .use(({ marpit }) => { /* ... */ })    // Marpit plugin
```

`use()` sniffs the plugin's shape (`postcss` / `postcssPlugin` properties → PostCSS; else markdown-it; else Marpit), dispatches it, and returns the Marpit instance for chaining. Plugin authors don't have to declare what type they are; the framework figures it out.

The `marpitPlugin` helper (`src/plugin.js`) wraps a markdown-it plugin so it can access the Marpit instance via `md.marpit`. This is the bridge that lets feature plugins (math, emoji, auto-scaling) register CSS, themes, and directives — not just markdown tokens.

The three plugin layers correspond exactly to the three stages of the pipeline:

| Plugin type | Pipeline stage | What it can do |
|---|---|---|
| markdown-it plugin | Markdown → AST | Add new syntax, new tokens, new directives |
| Marpit plugin | AST → HTML | Register themes, mutate Marpit options, add custom directives |
| PostCSS plugin | CSS bundling | Transform the emitted CSS (minify, autoprefix, custom properties) |

A docent equivalent of this would map onto: spec validation/AST, scene rendering, and style bundling.

---

## 6. The markdown-it integration — don't build a parser, extend one

Marpit didn't build a Markdown parser. It uses `markdown-it`, which already has:

- A documented token-stream AST.
- A ruler system (`core`, `block`, `inline`, `renderer`) where plugins can insert rules between named existing rules.
- A vast plugin ecosystem (container, footnote, anchor, mathjax, etc.) Marpit gets for free.

Marpit's "slides as `<section>`" mechanic is implemented as a single `markdown-it` core rule that splits the token stream on `hr` tokens (`---`) and wraps each segment in section-open/close tokens (`src/markdown/slide.js`). That's *all the slide grammar is*: a thematic break splits a slide. Authors already know this syntax. No new grammar to learn.

Image directives like `![bg right:33% w:300px](url)` are likewise just an `alt` text microsyntax parsed by an image plugin (`src/markdown/image/`). They piggyback on standard markdown image syntax.

**The lesson for docent:** the closed scene grammar (29 types) is doing the job a parser ecosystem could do. The grammar should be reified as a typed AST with a documented ruler-like extension order, so that a third party can insert a new scene type between two existing ones without forking the engine.

---

## 7. Specific Marpit features worth studying

- **Slide backgrounds** via `![bg](url)`. The alt text is the directive: `bg`, `bg right`, `bg blur:5px`, `bg fit`. Markdown stays standard; the modifier vocabulary lives in alt text.
- **`<!-- fit -->`** in a heading. A heading containing this comment auto-scales to fit the slide width. Implemented as a Web Component (`<marp-auto-scaling>`) in Marp Core v3 so CSS selectors still work. The directive is *inline*, attached to the element it modifies — not declared globally.
- **Math (`$x$`, `$$y$$`)** with KaTeX/MathJax. Selected by a global directive (`math: katex`). The renderer is swapped at runtime; CSS is appended to the theme bundle conditionally. This is the cleanest "feature with two interchangeable backends" pattern in the repo.
- **Pagination** as a four-state directive: `true`/`false`/`hold`/`skip`. The richness lives in the *value vocabulary*, not in new directive names.
- **Presenter notes** as HTML comments. The render method returns `{ html, css, comments }` — comments collected per slide are notes. The grammar piggybacks on Markdown's existing throwaway construct.
- **Inline SVG slide mode**. An optional rendering mode that wraps each slide in `<svg viewBox>` for pixel-perfect scaling. Selected by a constructor option, not by changing the API.

---

## 8. What translates to docent

Docent has analogues to every major Marp primitive. The mapping is unusually clean:

| Marp | docent |
|---|---|
| Markdown source | JSON film spec |
| `<section>` per slide | scene per scene |
| markdown-it AST | (currently absent — spec is consumed directly by React renderers) |
| Theme CSS + `themeSet` | `stylePresets` / `theme.ts` |
| Global / local / spot directives | film `meta`, scene-level fields, beat-level fields |
| `marpit.use(plugin)` | (absent) |
| `marpit.customDirectives.global/local` | (absent) |
| `<style>` and `<style scoped>` in markdown | (absent — no per-film or per-scene CSS override) |
| Marp Core's plugin pack of features | the 29 scene React components in `src/scenes/` |
| `marp-cli --engine` swap | (absent — there's one engine) |

The gaps are where the recommendations land.

---

## 9. Recommendations — highest-leverage first

### R1. Split the engine into `docent-kit` (framework) and `docent-core` (implementation)

This is the move. Today `packages/engine` is monolithic — the scene grammar, the default renderers, the presets, the pipeline, and the CLI all live together. Split it the way Marp did:

- **`docent-kit`** owns: the spec schema, validation, the AST representation, the rendering protocol (what a scene component must implement), the preset registry, the directive registry, the plugin protocol. Ships zero scene implementations and zero presets.
- **`docent-core`** owns: the 29 default scene renderers, the default presets (`engineering`, `editorial`, ...), the Remotion bindings, the narration pipeline. Depends on `docent-kit` and registers everything through the same plugin protocol a third party would use.

The acceptance test: can a third party publish `@someone/docent-scifi` as an npm package that adds 3 new scene types and a preset, install it, and use it via `docent.use(scifi)` *without forking docent-core*? Today the answer is no. After the split it should be yes.

The discipline the Marp team holds is: **the default implementation must use exactly the API a third party would use.** No private fast-paths. If `docent-core` has to reach into private internals to register a scene, the API is wrong — fix the API first.

### R2. Reify the scene grammar as a pluggable registry, not a switch statement

Today the scene types are a closed enum and the renderers are a switch (one React component per type). Replace this with a registry:

```ts
// in docent-kit
type SceneRenderer = { schema: JSONSchema, component: React.FC<Props>, depthRules?: DepthRule[] }
const sceneRegistry = new Map<string, SceneRenderer>()
docent.registerScene('frame', { schema, component, depthRules })
```

`docent-core` registers all 29 default scenes through this exact API at startup. A third-party plugin registers new scene types the same way. The film schema becomes the *union* of registered scene schemas, computed at runtime — not a hand-written union in `film.schema.json`.

This is the docent equivalent of `marpit.use(markdownItContainer, 'columns')` adding a new block-level container. It's the single most valuable extension point because today every new scene type requires a PR into the engine.

### R3. Adopt a custom-directive surface for the spec — but call them "modifiers"

Marp's `customDirectives.global` / `customDirectives.local` lets a plugin invent a new declarative knob without changing the parser or the schema. Docent should add the same:

```ts
docent.customModifiers.film.brand = (value) => ({ /* film-level meta */ })
docent.customModifiers.scene.colorMood = (value) => {
  if (value === 'sunset') return { palette: 'warm', /* ... */ }
}
docent.customModifiers.beat.emphasis = (value, beat) => ({ pace: 'hold', shot: 'push' })
```

The three tiers (film / scene / beat) mirror Marp's three tiers (global / local / spot). Each modifier is a pure function returning a partial object, merged with the built-in resolution result. Crucially, the merged object should land in the rendered scene's DOM as data attributes / CSS vars (per Marp's pattern) so user-authored CSS in a preset can react to user-defined modifiers without engine changes.

The terser-spec win: a film author can write `mood: anxious` in a scene and a project-local plugin expands it to `{ palette: "signal", register: "urgent", pace: "hold" }`. Today the author has to set all three by hand every scene.

### R4. Promote presets to first-class "themes" with composition

Marp's themes have three properties docent's `stylePresets` lacks:

1. **Imports** (`@import 'default'`). docent presets should be able to extend another preset and override selectively, the way `editorial.preset.json extends engineering` would. Today presets are atomic.
2. **Inline override paths** — Marpit's `<style>` block bundled into a deck, and `<style scoped>` for one slide. docent should allow `theme: { override: {...} }` at film level and `style: {...}` at scene level, both merged into the resolved preset. The Marp lesson: *give authors a one-key escape hatch so they don't fork the preset for a single tweak.*
3. **Registration as a plugin asset.** `presetRegistry.add(presetJson)` should be callable from a plugin, so a third party can ship a preset as `@someone/docent-preset-fintech` and have it auto-register on `docent.use(fintech)`.

### R5. Adopt the markdown-it-style "feature plugin" pattern for cross-cutting features

Marp Core implements math, emoji, auto-scaling, and code-highlighting as self-contained feature plugins that each touch: parser rules, theme CSS, custom directives, and runtime helpers. They live in folders like `src/math/`, `src/emoji/`, and they expose `{ markdown, css, ...helpers }`.

Docent has equivalents: narration/captions, music, watermark, lower-thirds. These should be feature plugins, not features burned into `Film.tsx`. The pattern:

```ts
const captionsFeature: DocentFeature = {
  registerScenes: (registry) => { /* none */ },
  registerModifiers: (registry) => { registry.scene.caption = ... },
  injectCSS: (preset) => captionsBaseCss,
  wrapRender: (rendered, ctx) => attachCaptions(rendered, ctx),
}
docent.use(captionsFeature)
```

This is what lets `docent-core` itself be expressed as a feature pack rather than a god-object.

### R6. Borrow the inline microsyntax idea sparingly

Marp's image syntax `![bg right:33% w:300px blur:5px](url)` packs five modifiers into a standard Markdown alt text. The docent equivalent for terser specs would be allowing a string shorthand alongside the object form:

```json
{ "node": "queue", "weight": "hero", "shot": "push" }
// vs.
{ "node": "queue@hero/push" }
```

The trade-off: terseness vs. readability. Marp's microsyntax works because alt text is *already* a string the author has to write. Docent's spec is already structured JSON — adding a string microsyntax may not pay for itself. **Recommend: prototype this only for very high-frequency tuples** (e.g. node weight+shot, beat pace+cadence). Don't generalize.

---

## 10. NO-GO patterns

- **`<!-- _key: value -->` HTML comments as a directive carrier.** Marp uses them because Markdown has no native key/value mechanism. JSON does. Adopting comment-directives in the docent spec would be retrograde.
- **CSS-as-theme with raw HTML element selectors.** Marp themes work because the output is HTML; selectors target `section`, `h1`, `code`. Docent's output is video frames composited by React + Remotion. The selectors are React props, not CSS rules. Themes for docent should remain *typed object trees* (style tokens), not CSS strings. The pattern to adopt is the *composition discipline* (imports, scoped overrides), not the literal `.css` artifact.
- **An engine-swap CLI flag (`--engine`).** Marp-cli supports this so a user can replace Marpit entirely. Docent's value is the closed grammar; swapping the whole engine doesn't make sense for an LLM-authored explainer. Plugins yes, full-engine swap no.
- **`markdown-it` as the parser.** Docent's source is JSON, not Markdown. The lesson to take is *use a typed AST with a ruler*, not *use markdown-it*.
- **Per-slide `@theme` overrides via inline `<style>` blocks.** The mechanism is right, but the implementation (inline CSS strings parsed at render time) doesn't fit a video pipeline. Equivalent in docent should be JSON style overrides, validated against the same `styleSchema.ts` the presets use.
- **HTML-comment presenter notes.** Docent already has `narration` as a typed field on each beat. Don't redo it as a comment.

---

## 11. A note on naming

Marp's split is named cleanly: **Marpit** is a framework, **Marp** is the product. The product name is what end users say; the framework name is what implementers say. Docent today has only one name. If the split happens, the framework needs a name (e.g. `docent-kit`, `docent-stage`, `explainer-kit`) that the user-facing product (`docent`) is built on. Naming locks the discipline in: every time someone proposes a "small" private path between `docent` and `docent-kit`, the name reminds them what's happening.

---

## Sources

- [marp-team/marpit](https://github.com/marp-team/marpit) — framework source
- [marp-team/marp-core](https://github.com/marp-team/marp-core) — implementation source
- [marp-team/marp-cli](https://github.com/marp-team/marp-cli) — CLI surface
- [marp-team/marp](https://github.com/marp-team/marp) — ecosystem entrance
- [Marpit Introduction](https://raw.githubusercontent.com/marp-team/marpit/main/docs/introduction.md)
- [Marpit Usage](https://raw.githubusercontent.com/marp-team/marpit/main/docs/usage.md)
- [Marpit Directives](https://raw.githubusercontent.com/marp-team/marpit/main/docs/directives.md)
- [Marpit Theme CSS](https://raw.githubusercontent.com/marp-team/marpit/main/docs/theme-css.md)
- [Marpit src/marpit.js](https://raw.githubusercontent.com/marp-team/marpit/main/src/marpit.js)
- [Marpit src/plugin.js](https://raw.githubusercontent.com/marp-team/marpit/main/src/plugin.js)
- [Marpit src/theme_set.js](https://raw.githubusercontent.com/marp-team/marpit/main/src/theme_set.js)
- [Marpit src/markdown/directives/](https://github.com/marp-team/marpit/tree/main/src/markdown/directives) — `directives.js`, `parse.js`, `apply.js`, `yaml.js`
- [Marpit src/markdown/slide.js](https://raw.githubusercontent.com/marp-team/marpit/main/src/markdown/slide.js)
- [marp-core src/marp.ts](https://raw.githubusercontent.com/marp-team/marp-core/main/src/marp.ts)
- [marp-core src/math/](https://github.com/marp-team/marp-core/tree/main/src/math)
- [Marp Fitting Header guide](https://github.com/marp-team/marp/blob/main/website/docs/guide/fitting-header.md)
- [The story of Marp Next](https://marp.app/blog/the-story-of-marp-next)
- [DeepWiki — marp-team/marp](https://deepwiki.com/marp-team/marp)
