---
name: docent-doctor
description: First-run bootstrap and ongoing health check for docent. On first invocation, clones the docent engine into ~/.local/share/docent/engine, installs every cascade dependency (uv, ffmpeg, Kokoro voice weights, Remotion), and puts the `docent` CLI on PATH. On subsequent invocations, just runs `docent doctor --install --yes` to verify and repair. Use when the user says "/docent-doctor", asks to set up docent, hits a missing-dependency error from another docent skill, or wants to confirm the cascade can render end-to-end.
---

# docent-doctor — bootstrap or verify the docent environment

You are responsible for getting docent ready to render a film, or for
confirming it still is. Two paths to walk depending on whether docent is
already on PATH:

## Path A — first run (`docent` not on PATH)

The user just installed the skills via `apm install` and has never used
docent before. You need to clone the engine, bootstrap the cascade, and
put the `docent` CLI on PATH.

Detect this case by running `command -v docent`. If it returns nothing,
take Path A.

Execute these steps in order. Walk through each with the user so they
see what's happening; do not paste the whole block silently.

1. **Pick the engine location.** Default:
   ```bash
   DOCENT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/docent/engine"
   ```
   Tell the user this is where the engine will live — about 1 GB after
   `bun install` + `uv sync` + Kokoro weights. They can override by
   exporting `DOCENT_HOME` before re-running.

2. **Verify bun is on PATH.** If `command -v bun` returns nothing, stop
   and tell the user:
   ```
   docent requires bun. Install it first:
     curl -fsSL https://bun.sh/install | bash
     exec $SHELL -l
   Then re-invoke /docent-doctor.
   ```
   Bun is the only prerequisite docent itself can't bootstrap (it is
   the runtime that runs the bootstrap).

3. **Clone the engine** (or fast-forward an existing clone):
   ```bash
   mkdir -p "$(dirname "$DOCENT_HOME")"
   if [ -d "$DOCENT_HOME/.git" ]; then
     git -C "$DOCENT_HOME" pull --ff-only
   else
     git clone https://github.com/benelser/docent "$DOCENT_HOME"
   fi
   ```

4. **Bootstrap the cascade.** This is the long step — `uv sync` pulls
   torch + transformers + kokoro, Kokoro downloads ~300 MB of voice
   weights, and `bun install` materializes Remotion. Allow 3-8 minutes
   on a warm machine, longer on a cold one.
   ```bash
   cd "$DOCENT_HOME" && bun packages/engine/cli/docent.ts doctor --install --yes
   ```
   That command installs uv, ffmpeg, gh, apm if missing; writes
   `~/.local/bin/docent` (the shim that lets you call `docent <cmd>`
   from any cwd); and records `DOCENT_HOME` at
   `~/.config/docent/home`. Show the user the live output — every
   step is labeled.

5. **Verify the shim is callable.** From the user's original cwd:
   ```bash
   command -v docent && docent env | head -5
   ```
   If `command -v docent` returns nothing, the shim is installed but
   `~/.local/bin` is not on PATH. Print:
   ```
   Add ~/.local/bin to PATH:
     echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
     exec $SHELL -l
   ```
   and stop.

6. **Hand back.** Print:
   - the engine location (`$DOCENT_HOME`)
   - "Ready" if every required check is green; otherwise list the
     failing check ids
   - "Next: `/docent-explain <subject>`" as the next step

## Path B — re-verify (`docent` already on PATH)

The user has docent installed and wants a health check or a repair.

```bash
docent doctor --install --yes
```

This re-runs every check and installs anything missing — Kokoro
weights got evicted, `node_modules` got blown away by a clean-slate,
ffmpeg got upgraded oddly, etc. Show the user the raw output (it is
already formatted with per-stage grouping and remediation hints on
every failure).

If `docent doctor` exits 0, print **Ready** and suggest
`/docent-explain <subject>`.

If it exits non-zero, list the failing check ids by stage so the user
can resume mid-setup, and explain what each one means in one line.

## What "ready" means

Required by cascade stage:

- **system**: `bun`, `git`
- **survey**: at least one of `claude` or `codex` on PATH (the agent
  that authors the spec); `apm` (the install channel)
- **tts**: `uv`, the `.venv` materialized, the Kokoro voice weights
  cached
- **render**: `ffmpeg`, `ffprobe`, Remotion (from `bun install`), and
  the `docent` shim on PATH

Optional (warnings, not failures): `gh-auth` (interactive — `docent
ar` and the PR poster need it eventually), `manim` (only films with
a `manim/<id>` directory use it).
