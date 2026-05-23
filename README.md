# docent

> **An explanation engine.** Point it at a codebase, a pull request, an
> essay, a wiki, a URL — *any subject* — and it produces a narrated,
> animated film that **interrogates** the subject. Not a tour that admires
> it.

[![distribution](https://img.shields.io/badge/distribution-APM-6ea8fe)](https://github.com/microsoft/apm)
[![license](https://img.shields.io/badge/license-MIT-c0c5cf)](LICENSE)

A closed **grammar of explanation** a coding agent renders any idea
into, with a deterministic engine that owns every pixel and a quality
cycle that grades every film before it ships.

---

## Install

One command. Pick the target that matches your coding agent.

**Claude Code:**

```bash
apm install -t claude benelser/docent/packages/agent
```

**Codex:**

```bash
apm install -t codex benelser/docent/packages/agent
```

Both are validated end-to-end — skills land at `.claude/skills/` and
`.agents/skills/` respectively, four skills each. For other targets
APM supports the same shape:

| Agent | Flag | Skills land at |
|---|---|---|
| Claude Code | `-t claude` | `.claude/skills/` |
| Codex | `-t codex` | `.agents/skills/` |
| Cursor | `-t cursor` | `.cursor/skills/` |
| Copilot (default) | `-t copilot` | `.github/skills/` |
| All of the above | `-t all` | every target |

Then, inside your coding agent, run:

```
/docent-doctor
```

The first invocation is the bootstrap: it clones the engine into
`~/.local/share/docent/engine`, installs every cascade dependency
(uv, ffmpeg, Python env, Kokoro voice weights, Remotion), and puts
the `docent` CLI on your PATH. Subsequent invocations just re-verify
and repair.

> docent needs `bun` (the runtime that runs the bootstrap itself).
> If you don't have it: `curl -fsSL https://bun.sh/install | bash`,
> then `exec $SHELL -l`. Everything else `/docent-doctor` handles.

## Use

Inside Claude Code, Codex, or Cursor:

```
/docent-doctor                   verify the environment is green
/docent-explain  <subject>       any subject, any mode, end to end
```

`<subject>` is anything: a repo path, a GitHub PR URL, an essay file,
a wiki section, a blog post. The skill picks the mode automatically;
override with `--mode pr|ar|ex`.

| Slash command | What it does |
|---|---|
| `/docent-doctor` | Verifies (and installs) the environment. |
| `/docent-pr <repo> <pr#>` | PR-review film — load-bearing 5%, the trade-off, a verdict. |
| `/docent-ar <repo> [--subsystem X]` | Architecture-review film — components, flow, failure modes. |
| `/docent-explain <subject>` | The one-shot — any subject, any mode, end to end. |

## How

A film is a JSON spec. The engine renders a closed grammar of
**fifteen scene types** (`frame`, `structure`, `walkthrough`,
`compare`, `tension`, `recap`, …), **eight intent knobs**
(`register`, `pace`, `weight`, `shot`, `cut`, `cadence`, `palette`,
`treatment`), and three motion primitives (`tween`, `chart`, `morph`).

The cascade runs in four cached stages:

```
survey   →  films/<id>.json       the spec — authored by the agent
tts      →  public/audio/<id>/*   Kokoro narration, parallel
clips    →  public/clips/<id>/*   optional Manim inserts
render   →  out/<id>.mp4          Remotion, frame-parallel
```

Every spec is judged by an adversarial sub-agent along six
dimensions — **triage**, **where it could be wrong**, **do the tests
prove it**, **the numbers**, **the trade-off**, **the verdict
adjudicates** — and the `judge → revise → re-judge` loop is mandatory
on every render. A film the judge rejects does not ship.

## License

MIT (see [`LICENSE`](LICENSE)). Distribution:
[APM](https://github.com/microsoft/apm) only — the agent layer
installs into your coding agent; the engine runs locally.
