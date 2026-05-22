# Dogfood log

docent's PR mode is a **developer's review instrument** — invoked on demand,
not a bot on every PR. Dogfooding means: whoever picks up a review runs docent
on it first, and logs three things —

- **wall time** — the viability metric (a slow tool is a dead tool here)
- **did it help** — the value metric (did the film let me review faster)
- **was anything wrong** — the accuracy metric (the one that matters most)

## Protocol

1. Before reviewing a PR — docent's own, or one in the arch-repos — run
   `docent score`, then `docent pr` / `docent ar`.
2. Log the run in the table below.
3. **Exit criterion → the catalog conversation:** a developer reaches for the
   film over the diff, wall time stays within the tier budget, and accuracy
   holds across N PRs.

## Runs

| date | invocation | tier | wall | result | notes |
|------|------------|------|------|--------|-------|
| 2026-05-22 | `docent score kubernetes/kubernetes 139003` | FULL | <1s | matrix only | 674 logic lines → full |
| 2026-05-22 | `docent hermetic kubernetes-pr --scale 0.5` | — | 56s | ✓ 7/7 | engine cascade, end-to-end |
| 2026-05-22 | `docent hermetic kubernetes --scale 0.5` | — | 81s | ✓ 7/7 | engine cascade, end-to-end |
| 2026-05-22 | `docent hermetic kubernetes-scheduler --scale 0.5` | — | _(see hermetic/report.json)_ | — | new subsystem film |

## Notes

- The **survey stage** (the agent authors the spec from the repo) is not yet
  wired into the CLI — these runs exercise the deterministic half, the engine
  cascade, against committed specs. Full dogfooding of PR mode arrives when the
  `docent-agent` APM package drives the survey under a headless coding agent.
- Wall times above are at `--scale 0.5` (960×540). A glance-tier cut (60–90 s,
  3 scenes, 720p draft) is the wall-time target for review-time use; a full cut
  is the merge-time record.
