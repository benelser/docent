# docent

> **An explanation engine.** Point it at a codebase, a pull request, an
> essay, a wiki, a URL — *any subject* — and it produces a narrated,
> animated film that **interrogates** the subject. Not a tour that admires
> it.

[![status](https://img.shields.io/badge/corpus-5%2F5%20PASS-32d287)](#the-sample-films)
[![distribution](https://img.shields.io/badge/distribution-APM-6ea8fe)](https://github.com/microsoft/apm)
[![license](https://img.shields.io/badge/license-MIT-c0c5cf)](LICENSE)

It is not a slide tool. It is not a screen recorder. It is a closed
**grammar of explanation** a coding agent renders any idea into, with a
deterministic engine that owns every pixel, and a quality cycle that
raises its own floor every time a film is judged.

---

## Quickstart

Three steps to the first rendered film. The first is interactive (installs
uv / ffmpeg / `.venv` / `node_modules` / Kokoro weights). The second
installs the skills into your coding agent. The third you'll repeat.

```bash
# 1.  Bootstrap the cascade
git clone https://github.com/benelser/docent && cd docent
bun packages/engine/cli/docent.ts doctor --install --yes

# 2.  Install the docent skills into your coding agent (Claude Code, Codex, Cursor, …)
apm install benelser/docent/packages/agent
```

Then, inside your coding agent — **two slash commands**, the rest is
conversation:

```
/docent-doctor                   verify the environment is green
/docent-explain  <subject>       survey → treatment → spec → render → open
```

`<subject>` is anything: a repo path, a GitHub PR URL, an essay file, a
wiki directory, a blog post. The skill picks the mode automatically; pass
`--mode pr|ar|ex` to override.

> **Don't have bun yet?** `curl -fsSL https://bun.sh/install | bash`, then
> re-shell. Everything else is `docent doctor --install --yes`.

## The four skills

The slash commands are mode-centric — they match how you think about the
subject, not how docent's CLI is structured.

| Slash command | What it does | When to reach for it |
|---|---|---|
| `/docent-doctor` | Verifies (and installs) the environment. | First, and whenever a film fails to render. |
| `/docent-pr <repo> <pr#>` | PR-review film — load-bearing 5%, the trade-off, a verdict. | The sprawling AI-agent PR no human reads as a wall of text. |
| `/docent-ar <repo> [--subsystem X]` | Architecture-review film — components, flow, failure modes, trade-offs. | A system, or one subsystem, interrogated at depth. |
| `/docent-explain <subject>` | The one-shot — any subject, any mode, end to end. | The default. Hand over a subject, get a film. |

Each skill walks the user through the cascade — survey → treatment →
spec → render — and surfaces the verdict, the residual risks, and one
line of the adjudicated finding. The pause points are where the
*framing* forks, not where the engine does. The engine never asks; it
explains.

## A grammar of explanation, not of software

A film is a JSON spec. The engine renders a closed grammar of
**fifteen scene types** — the cognitive moves any subject is made of:

> `frame` · `structure` · `progression` · `walkthrough` · `compare` ·
> `quantities` · `chart` · `probe` · `tension` · `closeup` ·
> `passage` · `figure` · `demonstrate` · `recap` · `diff`

Plus **eight intent knobs** — semantic dials the author turns, the engine
interprets deterministically. Never a hex code, never a coordinate:

> `register` · `pace` · `weight` · `shot` · `cut` · `cadence` ·
> `palette` · `treatment`

Plus three motion primitives that go past "animated slides":

- **`tween`** — a value counts *up* to its result, not cuts to it.
- **`chart`** — data plotted on real axes: curves, growing bars, a point
  riding a curve.
- **`morph`** — a node *becomes* another representation. A vector morphs
  into a matrix; a box becomes a code window; one equation rewrites into
  the next.

## The judge is on the happy path, not the failure path

Every user-rendered film runs through the adversarial sub-agent that
grades along six dimensions: **triage**, **where it could be wrong**,
**do the tests prove it**, **the numbers**, **the trade-off**, **the
verdict adjudicates**. The inner loop — `judge → revise → re-judge`,
bounded to two rounds — is mandatory in every mode skill, not a fallback
on contract failure.

Why mandatory? Because on the corpus we measured, the loop is the
difference between a film that ships and one that does not:

| Film | First draft | After `review` | Lift |
|---|---|---|---|
| `kubernetes-pr` | 18 | 26 / 30 PASS | +8 |
| `euclid-primes` | 20 | 23 / 30 PASS | +3 |

**Mean lift: +5.5 points / 30** on the films that needed the loop.
Two films in the bench passed on the first draft
(`linear-algebra`, `stopping-by-woods`) — the loop costs ~30 s for
them and confirms they ship. For the others, the loop is why they
ship at all.

```
docent judge     <id>   grade one film along six dimensions
docent review    <id>   the inner loop, bounded — runs on every user film
docent flywheel         what is consistently falling short across the corpus
```

`docent flywheel` distills recurring weaknesses across every film back
into the survey brief. **docent gets better as it runs.**

## The cascade

```
survey   →  films/<id>.json       the spec — authored by the agent
tts      →  public/audio/<id>/*   Kokoro narration, beats in parallel
clips    →  public/clips/<id>/*   optional Manim inserts
render   →  out/<id>.mp4          Remotion, frame-parallel
```

Each stage is cached; a beat whose narration has not changed is not
re-rendered.

## The corpus

A small bench of films exercises the grammar across five domains — math,
software, history, math proof, and literature — with a unified bar:
**5 / 5 PASS through the depth-review judge.** Renders ship in
`films/<id>.json`; pick what to feature here yourself.

Render any of them with `/docent-build <id>`, or directly:

```bash
bun packages/engine/cli/docent.ts build <id>
```

## Go Live gate

Two commands guard every shipped change.

```
docent preflight                  environment, contracts, cycle surface, hygiene
docent hermetic --fresh-user      simulate apm install → first film in a tmpdir
```

`docent hermetic --fresh-user` is the human-out-of-the-loop validator: in
a clean tmpdir it runs `apm install`, verifies the skill surface loads,
runs the equivalent of `/docent-doctor`, then renders `linear-algebra`
end-to-end against the prebuilt fixtures. Pass `--keep` to leave the
tmpdir behind for inspection.

## Dogfooding the install path

The thing that gets dogfooded is the *install*, not the engine.

```bash
./scripts/clean-slate.sh
```

Wipes every artifact docent itself lays down — `node_modules/`,
`.venv/`, `out/`, `public/audio/`, `public/clips/`, the installed APM
skills, the Kokoro voice weights — without touching the system tools
underneath (`bun`, `uv`, `ffmpeg`). After this, the three Quickstart
commands re-walk the whole loop as a fresh user would. Run it, re-install,
then file feedback on what broke.

## Two packages

- **`@docent/engine`** — the Remotion render engine, the cascade
  pipeline, the `docent` CLI. The deterministic runtime.
- **`@docent/agent`** — the brief, the survey prompts, the four mode
  skills, the depth-review judge. Shaped as an
  [APM](https://github.com/microsoft/apm) package so docent rides inside
  any coding agent.

## Status

Engineering: feature-complete. Quality cycle: operational, with a
**5 / 5 PASS corpus across 5 domains**. The brief has raised its own
floor four times via the outer-loop distillation; the inner loop iterates
failing films to PASS; the flywheel surfaces recurring weaknesses across
the corpus.

License: MIT (see [`LICENSE`](LICENSE)). Distribution:
[APM](https://github.com/microsoft/apm) only — the agent layer installs
into your coding agent; the engine runs locally.
