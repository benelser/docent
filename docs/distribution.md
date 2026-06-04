# Distribution — the drip publication pipeline

A rendered film is not the end. A film that nobody watches because it sat in
`out/` and never made it to a feed is wasted work. The drip pipeline is
docent's answer: queue the film, schedule the drop, and let a cron tick walk
the queue. One JSON file is the source of truth; one command (`docent drip
tick`) does the work; one audit log records what happened.

The pattern is the same as a content farm's drip publisher — a queue of
`{filmId, schedule, platforms, status}` entries, a tick that fires the next
batch on time — but multi-platform from day one: a single entry can fan out
to docent.studio, YouTube, Vimeo, Mastodon and Bluesky in one cycle.

This document covers:

1. The queue schema (`drip/queue.json`).
2. The scheduling vocabulary (cadence shorthand, datetime, cron).
3. The platform-adapter contract (one file per platform under
   `@bjelser/core/distribution`).
4. The audit log (NDJSON, append-only).
5. The CLI surface (`docent drip add | list | status | cancel | tick`).
6. Wiring it into cron (local crontab + GitHub Actions).
7. Platform setup — what each adapter needs (especially YouTube OAuth).
8. Operational reality: locks, atomic writes, recovery, log rotation.

---

## 1. The queue

The queue lives at `drip/queue.json` at the repo root. It is a single file
because:

- Atomic writes — POSIX rename gives us all-or-nothing consistency without
  a database.
- Reviewable — `git diff drip/queue.json` reads like a change log.
- Distributable — copying the queue between machines (or commiting it from
  the cron workflow) is a one-line rsync.

Shape:

```jsonc
{
  "version": 1,
  "lastTick": "2026-06-04T15:30:00.000Z",
  "entries": [
    {
      "id": "docent-self",
      "platforms": ["docent-studio", "youtube"],
      "schedule": { "cadence": "MWF", "timeOfDay": "15:00", "timezone": "America/Chicago" },
      "status": "published",
      "attempts": 1,
      "publishedAt": "2026-06-02T20:00:01.234Z",
      "results": [
        { "platform": "docent-studio", "status": "published", "url": "https://docent.studio/v/docent-self", "publishedAt": "..." },
        { "platform": "youtube",       "status": "published", "url": "https://youtu.be/abc123", "publishedAt": "..." }
      ]
    }
  ]
}
```

### Lifecycle states

| status        | meaning                                                                  |
|---------------|--------------------------------------------------------------------------|
| `pending`     | queued, scheduled time still in the future                              |
| `scheduled`   | (reserved) tick has soft-claimed it but adapter hasn't started yet      |
| `publishing`  | adapters are running                                                    |
| `published`   | every platform reported success; `publishedAt` is set                   |
| `skipped`     | manually cancelled with `docent drip cancel`                            |
| `failed`      | at least one platform errored; `error` is set, `attempts` incremented   |

`pending → publishing → published` is the happy path. `failed` is a terminal
state until the operator either re-queues (cancel + add) or hand-edits the
queue back to `pending` after fixing the upstream problem (e.g. re-rendered
the broken mp4, refreshed an expired OAuth token).

---

## 2. Scheduling

Three shapes, picked by the field present on the `schedule` object.

### Cadence shorthand — the friendly form

```json
{ "cadence": "MWF", "timeOfDay": "15:00", "timezone": "America/Chicago" }
```

Cadences: `MWF` (Mon/Wed/Fri), `TTH` (Tue/Thu), `daily`, `weekly`. The
timezone is an IANA name — `America/Chicago`, `Europe/Berlin`, `UTC`, etc.
DST is handled correctly because we round-trip through `Intl.DateTimeFormat`.

CLI shorthand: `--schedule "MWF 15:00 America/Chicago"`.

### One-shot datetime

```json
{ "datetime": "2026-06-15T18:00:00Z" }
```

CLI shorthand: `--schedule "@2026-06-15T18:00:00Z"`.

Useful for: launch days, embargo lifts, press cycles.

### Cron

```json
{ "cron": "0 15 * * 1" }
```

CLI shorthand: `--schedule "cron: 0 15 * * 1"`.

**Subset supported in this PR**: 5-field cron, `*` and integer literals
only. Ranges, steps, and lists (`1-5`, `*/15`, `1,3,5`) are NOT yet supported
— the planner walks minute-by-minute up to 7 days out. A fuller cron parser
(`croner`, `node-cron`) belongs in a separate adapter PR once a real use
case lands.

---

## 3. Platform adapters

The adapter contract (`@bjelser/core/src/distribution/types.ts`):

```ts
interface AdapterContext {
  filmId: string;
  projectRoot: string;
  mp4Path: string;                // out/<id>.mp4
  posterPath?: string;            // out/<id>-poster.jpg if present
  mock: boolean;                  // honour for any externally-visible action
  log: (msg: string) => void;
}

type AdapterResult =
  | { ok: true;  url: string; note?: string }
  | { ok: false; error: string };

type PlatformAdapter = (ctx: AdapterContext) => Promise<AdapterResult>;
```

Five adapters ship in this PR:

| platform        | status   | side effects                                                                                  |
|-----------------|----------|------------------------------------------------------------------------------------------------|
| `docent-studio` | live     | copies mp4 + poster into `landing/static/films/`, patches `landing/src/lib/films.ts`, runs `bun run build` + `firebase deploy --only hosting --project docent-497713 -t main`. Mock mode walks every step EXCEPT the deploy. |
| `youtube`       | gated    | requires `OAUTH_CLIENT_ID`; without it, returns `{ok: false, error: "not configured"}`. The real upload (`videos.insert` resumable) is wired in R5. |
| `vimeo`         | stub     | reserves the identifier; real upload via TUS lands in R6.                                     |
| `mastodon`      | stub     | reserves the identifier; v1 statuses POST lands in R7.                                        |
| `bluesky`       | stub     | reserves the identifier; AT-proto video upload lands in R8.                                   |

**Adapter contract rules**:

1. Read inputs only from `AdapterContext` — no environment scrapes, no `fs`
   probes outside what `projectRoot` implies. This is what makes adapters
   unit-testable.
2. Return `{ok: false, error}` for "not configured", "auth expired",
   "rate-limited" — i.e. anything the operator can fix. THROW only for
   genuine panics (missing input file, JSON-parse failure of a manifest
   the adapter owns).
3. Honour `mock: true`. Walk local steps (copy files, patch manifests) but
   skip the externally visible action (deploy, upload, post). Return
   `ok: true` with `note: 'mock'` so the smoke can validate the wiring.
4. Be idempotent. The tick may retry a `failed` entry; the second call
   must converge on the same final state without double-publishing.

### docent-studio specifics

The adapter patches `landing/src/lib/films.ts` by literal-text edit
(not by TypeScript AST). The file shape is known: a single
`export const FILMS: Film[] = [ … ]` literal. We scan for the marker,
walk bracket depth to find the closing `]`, and splice a new record in.

**Failure mode**: if the marker or array close can't be found, the adapter
logs a "rewrite films.ts and re-run" message and returns `{ok: false, …}`
without touching disk. This is brittle in theory — change the file shape
and the adapter breaks — but the file is ours, the shape is part of the
contract, and an AST round-trip would force a heavy dep on `@bjelser/core`
for one literal edit. We documented the contract here.

**Friction noted**: A future improvement would be to externalise the films
list to a JSON file the route loads at build time. The route is then
content-free; the adapter writes JSON, which is trivially safe. This is on
the table for v3.1.

---

## 4. Audit log

`drip/audit.log` is NDJSON — one event per line, append-only:

```jsonl
{"ts":"2026-06-04T15:00:00.000Z","filmId":"*","event":"tick-start","note":"entries=3 mock=true"}
{"ts":"2026-06-04T15:00:00.012Z","filmId":"docent-self","event":"publish-start","note":"platforms=docent-studio mock=true"}
{"ts":"2026-06-04T15:00:00.045Z","filmId":"docent-self","event":"publish-ok","platform":"docent-studio","url":"https://docent.studio/v/docent-self"}
{"ts":"2026-06-04T15:00:00.100Z","filmId":"*","event":"tick-end","note":"published=1 failed=0 deferred=0"}
```

Events:

- `add` — a new entry was queued.
- `tick-start` / `tick-end` — bracket every tick (event-pair for log-tailing).
- `tick-skip` — an entry was due but couldn't fire (e.g. mp4 not yet
  rendered); the entry stays `pending` for the next tick.
- `publish-start` — adapter dispatch began.
- `publish-ok` / `publish-fail` — per-platform result.
- `cancel` — operator ran `docent drip cancel`.

**Rotation**: not automated in this PR. When `drip/audit.log` exceeds
~10 MB (≈ 50k events), rotate by hand: `mv drip/audit.log drip/audit.log.1`.
A future patch can wire automatic rotation into the tick itself.

---

## 5. The CLI surface

### `docent drip add <filmId>`

Queue a film. The spec at `films/<filmId>.json` MUST exist (we don't queue
films that don't have a spec). `out/<filmId>.mp4` does NOT have to exist
yet — the tick re-checks at fire time, so you can queue ahead of the build.

```bash
docent drip add docent-self \
  --schedule "MWF 15:00 America/Chicago" \
  --platform docent-studio,youtube \
  --note "kicks off the architecture review series"
```

Errors with exit 64 if the spec is missing, the schedule is malformed, the
platform list contains an unknown identifier, or the film is already in the
queue.

### `docent drip list`

Print every entry with its current status and computed next-fire-time:

```
drip queue — 3 entries (lastTick=2026-06-04T15:00:00.000Z)

  docent-self              published         next=2026-06-08T20:00:00.000Z  platforms=docent-studio
  euclid-primes            pending           next=2026-06-04T20:30:00.000Z  platforms=docent-studio,youtube
  arxiv-2512-14806         failed            next=2026-06-05T20:00:00.000Z  platforms=docent-studio
      err: docent-studio: mp4 missing at out/arxiv-2512-14806.mp4
```

Add `--json` for machine output (the raw queue manifest).

### `docent drip status <filmId>`

Full per-entry detail — attempts, schedule, the per-platform breakdown.

### `docent drip cancel <filmId>`

Marks the entry `skipped`. Idempotent on a `published` entry (no-op + warn).

### `docent drip tick`

The unit of work. Reads the queue, finds every `pending` entry whose
`due(schedule, now)` is true, runs adapters, writes the queue back.

Flags:

- `--mock` — pass through to every adapter. Honour `DOCENT_DRIP_MOCK=1`
  as an env-var equivalent.
- `--force` — treat every non-published entry as due. **Smoke-test only**;
  do not use in production unless you mean it.

Exit codes:

- `0` — every fired entry succeeded (or nothing was due).
- `2` — at least one entry rolled up to `failed`.

The tick acquires a directory lock at `drip/.tick.lock` so two concurrent
ticks can't race on the same entry. The lock is broken if it's older than
5 minutes (a previous tick crashed).

---

## 6. Wiring it into cron

### Local crontab — the minimum-viable cron

The tick is idempotent and cheap; running it every 15 minutes is fine.

```cron
# Wake the docent drip queue every 15 minutes.
*/15 * * * * cd /Users/you/ventures/archcast && /opt/homebrew/bin/bunx docent drip tick >> drip/cron.log 2>&1
```

Caveats:

- Use an absolute path to `bunx` — cron's `PATH` is sparse.
- Append, don't truncate, so you can `tail -f drip/cron.log` while
  debugging.
- A laptop on standby will NOT fire missed ticks when it wakes. For
  laptop-class hosts, use `launchd` with a `StartCalendarInterval` array,
  or move the cron to a server.

### GitHub Actions — the team-friendly cron

`.github/workflows/drip.yml` ships in this PR. It runs every 15 minutes on
GitHub-hosted runners, executes `docent drip tick`, and commits
`drip/queue.json` back to main.

**It is disabled by default**. To turn it on:

1. Merge `drip.yml` to main.
2. In the repo's Settings → Variables → Actions, add `DRIP_ENABLED = "true"`.
3. Add the platform secrets you need:
   - `FIREBASE_TOKEN` — for the docent-studio adapter; mint via
     `firebase login:ci`.
   - `OAUTH_CLIENT_ID` (+ companion refresh-token storage) — for YouTube,
     once R5 lands.
4. Make sure `permissions: contents: write` is granted to the workflow
   (it is, in the shipped YAML).

The `if: vars.DRIP_ENABLED == 'true'` guard means every scheduled run is a
no-op until you explicitly opt in. You can also use `workflow_dispatch` to
trigger a manual tick, with an optional `mock` toggle.

---

## 7. Platform setup

### docent-studio (Firebase Hosting)

The adapter shells out to `firebase deploy --only hosting --project
docent-497713 -t main`. Requirements:

1. Local install: `bun add -g firebase-tools` (or use the project-local
   `bunx firebase`).
2. Authentication: either `firebase login` interactively (local dev), or
   `FIREBASE_TOKEN` (for CI; `firebase login:ci` mints one).
3. `.firebaserc` must point at `docent-497713` — already true in this repo.
4. The `main` hosting target must be defined in `firebase.json` — already
   true.

### YouTube (Data API v3) — UX friction noted

YouTube is the highest-friction platform to wire. The friction is real and
acknowledged. The flow (planned for R5):

1. **Create an OAuth client** in Google Cloud Console:
   - APIs & Services → Credentials → Create credentials → OAuth client ID.
   - Application type: "Desktop app" (so we can use the device-code flow
     without standing up a redirect URL).
   - Save the client ID + secret.
2. **Enable the YouTube Data API v3** for the project.
3. **Authorise once** with `docent drip auth youtube` (lands in R5):
   - The CLI prints a URL + a device code.
   - You paste them into a browser, sign in, grant the scope
     (`https://www.googleapis.com/auth/youtube.upload`).
   - The CLI catches the access + refresh tokens and writes them to
     `~/.docent/youtube.json` (mode 0600).
4. **Set the env var** `OAUTH_CLIENT_ID` so the adapter knows it's
   configured. The refresh token in `~/.docent/youtube.json` does the
   per-tick auth dance silently.

The UX is friction — five clicks, one redirect, one device-code paste — but
it's a one-time setup. The adapter never asks again unless the refresh token
expires (YouTube refresh tokens last 6 months under inactivity).

Until R5 lands, the YouTube adapter degrades to "not configured" and the
entry rolls up to `failed`. Operator workflow: cancel + re-add with
`--platform docent-studio` only.

### Vimeo / Mastodon / Bluesky — stubs

All three return `{ok: false, error: "not yet implemented"}` outside mock
mode. In mock mode they return success with a synthetic URL so the smoke
test can exercise the full code path.

---

## 8. Operational reality

### Concurrency

`docent drip tick` acquires a directory lock at `drip/.tick.lock`. The lock
is broken after 5 minutes (`LOCK_STALE_MS`) on the assumption a tick that
takes longer has wedged. If you have a film that genuinely takes longer
than 5 minutes to publish (e.g. a 2 GB mp4 to YouTube), bump that constant
in `packages/cli/src/drip/manifest.ts`.

### Atomic writes

The queue file is written via "write to `.tmp`, rename into place". POSIX
rename is atomic; if the tick crashes mid-write, the old queue is intact.
The audit log is `appendFileSync` — one event per write — so a crash mid-
event truncates one line at worst.

### Recovery

If the queue file is corrupted by a hand-edit:

```
docent drip list
# error: failed to read drip/queue.json: SyntaxError ...
```

Roll back via `git checkout drip/queue.json`, or open the file and fix the
JSON. The audit log will replay events one-by-one — a future
`docent drip rebuild` could regenerate the queue from the audit log, but
that has not yet been wired.

### Stale entries

If a film is queued, then deleted from `films/`, the next tick will:

1. Find the entry pending and due.
2. Check `out/<id>.mp4` — missing.
3. Emit a `tick-skip` audit line, log a yellow warning, leave the entry
   `pending`.

This is deliberately benign: a missing render is "not ready yet", not
"failed forever". To actually drop a stale entry, run
`docent drip cancel <filmId>`.

### Log rotation

Not automated. When `drip/audit.log` exceeds ~10 MB:

```bash
mv drip/audit.log "drip/audit.log.$(date -u +%Y%m%d)"
```

A future patch can wire rotation into the tick (rotate when the file is
larger than a threshold).

### Timezones

Cadence schedules carry an explicit timezone. We compute next-fire-time
through `Intl.DateTimeFormat` so DST transitions are honoured. **Caveats**:

- Invalid timezones (typos like `American/Chicago`) throw at next-fire
  computation. We surface the error in `docent drip list`; the entry stays
  in the queue (no autopurge).
- One-shot datetimes are stored as ISO strings; the parser is `Date.parse`
  which accepts almost anything. Be explicit — `2026-06-15T18:00:00Z` not
  `June 15`.

---

## Roadmap

- **R5**: YouTube OAuth — real upload via `videos.insert` + the
  device-code flow.
- **R6**: Vimeo upload via TUS resumable + PAT auth.
- **R7**: Mastodon v1 status post with media attachment.
- **R8**: Bluesky AT-proto video upload + post.
- **R9**: `docent drip rebuild` — regenerate queue from audit log.
- **R10**: A richer cron parser (steps, ranges, lists).
