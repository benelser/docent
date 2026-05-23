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

```bash
git clone https://github.com/benelser/docent && cd docent
bun packages/engine/cli/docent.ts doctor --install --yes
apm install -t claude benelser/docent/packages/agent
```

The first command bootstraps the cascade (uv, ffmpeg, Python env,
Kokoro voice weights, Remotion). The second installs the four mode
skills into your coding agent.

Pick your agent with `-t`:

| Agent | Flag | Skills land at |
|---|---|---|
| Claude Code | `-t claude` | `.claude/skills/` |
| Codex | `-t codex` | `.agents/skills/` |
| Cursor | `-t cursor` | `.cursor/skills/` |
| Copilot | `-t copilot` (default) | `.github/skills/` |
| All of the above | `-t all` | every target |

Without `-t`, APM auto-detects from the cwd (a `.claude/` marker picks
`claude`, etc.) and falls back to `copilot`. Pass `-t` explicitly to
avoid the fallback.

> Don't have bun yet? `curl -fsSL https://bun.sh/install | bash`, then
> re-shell. Everything else is `docent doctor --install --yes`.

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
