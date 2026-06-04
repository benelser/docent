# The CI dogfood gate

> "Every release must survive a cold `bun add` into an empty /tmp project."

This is the philosophy behind `docent ci` and the workflows that run it.
Read this once before you touch anything that ships in a tarball.

## The thing the gate does

A single command — `docent ci` — does this, in order:

1. `mktemp -d` a fresh project root.
2. `bun init -y` in it.
3. `bun add @bjelser/cli@latest @bjelser/core@latest @bjelser/kit@latest`.
4. `bun pm trust onnxruntime-node protobufjs` (the kokoro postinstalls).
5. (`--local <repo>`) overlay the worktree's `packages/{cli,core,kit}/src` +
   `package.json` over the freshly-installed `node_modules/@bjelser/*`. This
   is the **pre-publish** mode — you test your unpublished changes against
   what a cold consumer's environment looks like.
6. Walk a validation matrix: `help structure` → `init smoke` → `validate` →
   `depthcheck` → `build --skip-tts` → `assert --update` → `build` (warm) →
   `assert` → `build --lang es` → portrait variant + ffprobe `1080×1920`.
7. Tear down the tmpdir on green; leave it on red so you can `cd` in and
   diagnose by hand.

Two flavors run in CI:

- `ci --local "$(pwd)"` — **catch regressions before they ship**. The PR
  surface. The same as the local pre-push smoke a contributor runs.
- `ci` (pure registry) — **catch regressions that already shipped**. The
  nightly. If `bun add` of `@latest` is broken right now, the workflow
  goes red and we know — even if no code on `main` changed.

## Why it must run in `/tmp`, not in the worktree

This is the load-bearing decision. Every previous attempt at a smoke test
ran against the worktree, and every previous attempt missed the bug the
gate is meant to catch.

The worktree carries:

- a `remotion.config.ts` that stubs `node:` imports for webpack;
- a `bunfig.toml` with workspace overrides;
- sibling `packages/*/src/` directories that resolve `@bjelser/*` to source
  rather than to the published tarball;
- a `node_modules` populated by the root `bun install` against the workspace,
  not by `bun add` against the registry.

None of that exists in a downstream consumer's project. A worktree smoke
test answers a different question than the one we need to ask. The /tmp
install is the only environment that asks "does the published artifact
work as advertised?" — every other test silently substitutes the worktree's
helping hand.

## The four bug classes the gate catches

1. **Wrong files in `npm publish`.** A field missing from `package.json`'s
   `files` array, or a `.gitignore`'d artifact the build relies on. The
   browser-bundle `.js` extension bug we hit in feature #4 fell here:
   `index.browser.ts` was in the source but the `exports` map pointed to
   `dist/index.browser.js` that the publish never produced. A worktree smoke
   resolved the import to `src/`; a cold `bun add` couldn't.

2. **Wrong peer-deps.** The CLI pinning `@bjelser/core@^2.x` while shipping
   APIs from `@bjelser/core@3.x` — the CLI's nested `@bjelser/core` issue.
   `bun add` brings the wrong major down the dependency tree, and the
   command surface fails at runtime in a way that's invisible from the
   workspace.

3. **Webpack-bundling errors.** The `node:fs` UnhandledSchemeError that
   prompted this whole gate. A top-level `import * as nodeFs from 'node:fs'`
   sneaks into a module that ends up in the chrome-headless browser bundle.
   The worktree's `remotion.config.ts` carries a webpack plugin that stubs
   `node:` schemes — the published package does not. The bug is invisible
   from the worktree and certain to fire on a cold consumer.

4. **Schema mismatches between docs and the published shape.** Docs say
   `meta.aspect: '9:16'` produces 1080×1920; the gate's portrait step
   asserts it via `ffprobe`. The moment a refactor changes the dimensions
   table or the schema's enum without updating the docs (or vice versa),
   this step goes red and someone has to explain themselves.

## The one bug class the gate **can't** catch yet

**Runtime-only failures during render.** A scene that bundles fine, builds
without throwing, and produces a valid mp4 — but renders a black frame, or
a frame where two elements overlap, or a frame whose text is cut off by a
viewport change. The bundler is happy. ffmpeg is happy. The pixels are
wrong.

The gate **does** catch this in one specific case: the `assert` step diffs
the second build's frames against the goldens captured by the first. If a
non-deterministic bug flips between runs, the diff fires. But a deterministic
visual regression that was *already there* on first capture goes through.

This is the coupling between `docent ci` and `docent assert` that's still
loose. The right move is one of:

- run `docent ci` against a film *with committed goldens* (so the first
  `assert --update` is replaced by a real golden diff against a checked-in
  baseline);
- or carry a second corpus film whose goldens are captured at publish time
  and asserted against on every consumer install.

We are not there yet. Track it.

## How to use it locally

Before you push a change to any `@bjelser/*` package:

```sh
bun packages/cli/src/index.ts ci --local "$(pwd)"
```

Three minutes. If it goes green, your change ships safely from a cold
install. If it goes red, the tmpdir is preserved — `cd` in and reproduce.

Before you publish:

```sh
./scripts/release.sh cli            # publishes @bjelser/cli
./scripts/release.sh kit --dry-run  # rehearsal, no actual publish
```

The script runs the gate first; `npm publish` only fires if the gate is
green.

## How to use it in CI

`.github/workflows/dogfood.yml` runs both flavors on every push to `main`
and on `workflow_dispatch`. macos-14 (Apple Silicon) matches the local
dev surface; ffmpeg and ffprobe ship on the runner image.

`.github/workflows/release.yml` is `workflow_dispatch`-only and adds the
gate as a `needs:` dependency of the `publish` job. The publish step **cannot
run** if the gate is red.

## Friction notes (worth reading)

- **macOS Actions runner ffmpeg.** `macos-14` ships ffmpeg out of the box;
  the workflow's `ffmpeg -version` step is a sanity check, not an install.
  If we ever migrate to `ubuntu-latest` we'll need `apt-get install ffmpeg`
  and (for the chrome-headless render path) a fonts package.
- **Run time.** Cold `bun add @bjelser/*@latest` + the full matrix runs in
  90–180 seconds locally on Apple Silicon. If CI runs trend > 5 minutes,
  cache the `~/.bun/install/cache/` directory in the workflow to amortise
  the tarball fetch.
- **Should this run on a cron?** Yes. Supply-chain issues (a transitive
  dep yanked, a kokoro model URL rot, a chrome-headless break from an OS
  update) only surface in a cold install. A nightly `workflow_dispatch`
  schedule on `dogfood.yml` would catch those before consumers do. Not yet
  wired — track as follow-up.
