# Subject survey — Bun (`~/ventures/arch-repos/bun`)

## What it is

"An all-in-one JavaScript runtime & toolkit designed for speed, with a bundler,
test runner, and Node.js-compatible package manager … powered by WebKit's
JavaScriptCore" (`CLAUDE.md`). Polyglot: ~1290 Zig, ~1424 Rust, ~554 C++ source
files — a Zig→Rust migration in progress.

## The toolkit — one binary (`src/`)

- **runtime** — `src/runtime/`, `src/jsc/` (JavaScriptCore integration),
  `src/event_loop/` (built on `src/uws/` — uWebSockets).
- **transpiler** — `src/transpiler/`, `src/js_parser/`, `src/js_printer/`.
- **bundler** — `src/bundler/`.
- **package manager** — `src/install/`.
- **test runner** — under `src/cli/`.
- module resolution — `src/resolver/`.

## The runtime

bun embeds JavaScriptCore (no engine of its own). A Zig/Rust core owns startup,
resolution, and the JSC bridge. Node-compatible APIs and Web APIs (`fetch`,
`WebSocket`, streams) are implemented natively; `Bun.*` adds native primitives
(`Bun.serve`, `bun:sqlite`, `Bun.file`).

## Film — `films/bun.json`

title · overview (diagram — five tools, one binary) · runtime (diagram) ·
apis (**code** — `Bun.serve` / `bun:sqlite`) · flow (**sequence** —
`bun run server.ts`) · recap.

Note: Zig is not in the syntax-highlighter's language set, so the code scene
shows bun's TypeScript-facing API surface (`lang: typescript`).
