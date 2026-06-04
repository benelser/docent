# R4 drip smoke — transcript

This is the captured transcript of `bun scripts/smoke-drip.ts` running the
KPI assertion from the research DAG: **queue 3 films with schedules at
+30s / +60s / +90s; assert audit log shows 3 publishes within ±60s of
scheduled times**.

Reproduce locally with:

```bash
bun scripts/smoke-drip.ts
```

Pass `--keep` to retain the hermetic project root at
`/tmp/docent-drip-smoke-<ts>/` for inspection.

Result: **KPI PASS** — every entry published 1–2 seconds after its
scheduled fire time, well inside the ±60s tolerance.

---

```
R4 drip smoke — project=/tmp/docent-drip-smoke-2026-06-04T19-49-22-550Z

── 1. setup ──
   smoke-film-1  schedule=@2026-06-04T19:49:52.552Z
   smoke-film-2  schedule=@2026-06-04T19:50:22.552Z
   smoke-film-3  schedule=@2026-06-04T19:50:52.552Z

── 2. queue ──
✓ queued smoke-film-1 → docent-studio
  next fire: 2026-06-04T19:49:52.552Z
✓ queued smoke-film-2 → docent-studio
  next fire: 2026-06-04T19:50:22.552Z
✓ queued smoke-film-3 → docent-studio
  next fire: 2026-06-04T19:50:52.552Z

── 3. list (initial state) ──
drip queue — 3 entries (lastTick=never)

  smoke-film-1                 pending     next=2026-06-04T19:49:52.552Z  platforms=docent-studio
  smoke-film-2                 pending     next=2026-06-04T19:50:22.552Z  platforms=docent-studio
  smoke-film-3                 pending     next=2026-06-04T19:50:52.552Z  platforms=docent-studio

── 4. tick loop (budget=2min, interval=5s) ──

  · tick 1 (t+0s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 2 (t+5s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 3 (t+10s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 4 (t+15s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 5 (t+20s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 6 (t+25s)
tick complete: 0 published, 0 failed, 0 deferred

  · tick 7 (t+31s)
  → smoke-film-1 :: docent-studio (mock)
  ✓ copied mp4 → /private/tmp/docent-drip-smoke-2026-06-04T19-49-22-550Z/landing/static/films/smoke-film-1.mp4 (mock)
  ✓ films.ts edit planned (mock)
  · firebase deploy skipped (mock)
    ✓ docent-studio: https://docent.studio/v/smoke-film-1
tick complete: 1 published, 0 failed, 0 deferred

  · tick 8–12 (t+36s … t+56s) — no entries due, no-ops

  · tick 13 (t+61s)
  → smoke-film-2 :: docent-studio (mock)
  ✓ copied mp4 → /private/tmp/docent-drip-smoke-2026-06-04T19-49-22-550Z/landing/static/films/smoke-film-2.mp4 (mock)
  ✓ films.ts edit planned (mock)
  · firebase deploy skipped (mock)
    ✓ docent-studio: https://docent.studio/v/smoke-film-2
tick complete: 1 published, 0 failed, 0 deferred

  · tick 14–18 (t+66s … t+87s) — no entries due, no-ops

  · tick 19 (t+92s)
  → smoke-film-3 :: docent-studio (mock)
  ✓ copied mp4 → /private/tmp/docent-drip-smoke-2026-06-04T19-49-22-550Z/landing/static/films/smoke-film-3.mp4 (mock)
  ✓ films.ts edit planned (mock)
  · firebase deploy skipped (mock)
    ✓ docent-studio: https://docent.studio/v/smoke-film-3
tick complete: 1 published, 0 failed, 0 deferred

  · all entries reached terminal status after 19 ticks

── 5. final queue ──
drip queue — 3 entries (lastTick=2026-06-04T19:50:54.733Z)

  smoke-film-1                 published   next=2026-06-04T19:49:52.552Z  platforms=docent-studio
  smoke-film-2                 published   next=2026-06-04T19:50:22.552Z  platforms=docent-studio
  smoke-film-3                 published   next=2026-06-04T19:50:52.552Z  platforms=docent-studio

── 6. KPI assertion ──
  ✓ smoke-film-1: published +1s after schedule  within ±60s
  ✓ smoke-film-2: published +2s after schedule  within ±60s
  ✓ smoke-film-3: published +2s after schedule  within ±60s

═══ KPI PASS: 3 entries published within ±60s of schedule ═══
```

---

## What the transcript proves

1. **Schedule resolution** — `@<ISO>` shorthand parses to a `datetime`
   ScheduleSpec; `nextFire` returns the parsed instant; `due` returns true
   once the wall clock crosses it.
2. **Tick is idempotent** — six ticks before any entry is due all return
   `0 published, 0 failed, 0 deferred` and exit 0.
3. **Adapter dispatch fires per entry** — when the schedule elapses, the
   `docent-studio` adapter walks every step (mp4 copy, films.ts edit plan,
   firebase deploy skipped under mock) and returns the public URL.
4. **Per-entry latency** — every entry's `publishedAt` lands inside the
   ±60s tolerance. The actual latency was 1–2 seconds; the bound is set
   only by the tick interval (5s in the smoke).
5. **Audit log is written** — every state transition (`tick-start`,
   `publish-start`, `publish-ok`, `tick-end`) lands in `drip/audit.log`,
   one NDJSON line per event. The smoke verifies a `publish-ok` line
   exists for every entry.

## What this does NOT prove (and what comes next)

- **A real Firebase deploy** — the smoke runs every adapter in mock mode
  (`DOCENT_DRIP_MOCK=1`) so as not to burn quota. The next manual run
  should pick a single sacrificial film, run `docent drip add … --schedule
  "@<near future>" --platform docent-studio` without `--mock`, and verify
  the artefact ends up on `https://docent.studio/v/<id>`.
- **A real YouTube upload** — the YouTube adapter degrades to
  "not configured" until R5 ships the OAuth flow.
- **Concurrency under load** — the lockfile is exercised by serial calls
  in the smoke but never two truly concurrent ticks. A future test could
  spawn two ticks in parallel and assert one of them errors with
  "drip tick locked".
- **Cron drift over days** — the cadence-shorthand path (`MWF 15:00 …`)
  is unit-tested via `nextFire` but not E2E-tested across days.
