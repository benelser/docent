# Survey — style-recommend-code (hermetic fixture)

Mode: pr
Subject: Kubernetes pull request #139003 — scheduler heap optimization

This is a synthetic survey used by `docent hermetic-style` to verify that the
style-recommendation mapper resolves a code-heavy PR to the **engineering**
preset.

## 1. Triage

The diff under review is in `pkg/scheduler/internal/heap/`. The load-bearing
change is a single function in `heap.go` that swaps the comparison routine
the scheduler's priority queue uses when a pod with higher-priority preempts.

Files in the diff:

- `pkg/scheduler/internal/heap/heap.go` — load-bearing (the comparator change)
- `pkg/scheduler/internal/heap/heap_test.go` — proves the new ordering
- `pkg/scheduler/scheduler.go` — wires the new heap in (one-line)
- `vendor/` — mechanical, set aside

This is a real pull request against a real codebase; the film must interrogate
the comparator change at the function level, not relay the diff as a wall of
text.

## 2. Why it exists

The scheduler used to re-sort the entire queue on every pod admission — O(n
log n) per event. The new comparator turns that into an incremental heap
update — O(log n) — which under load matters: the control plane was seeing
seven-second scheduling stalls at 4000 pending pods.

## 3. Hard parts

- **Where it could be wrong** — a pod whose priority changes mid-flight.
  Walked: the comparator is called with stale priority data because the heap
  doesn't see the priority update event until the next reconcile pass. At
  scale: 4000 pods, ~120 such races per minute. Recovery: the next reconcile
  fixes it within 30s.

## 4. Tests prove it

`pkg/scheduler/internal/heap/heap_test.go::TestPriorityChangeMidFlight` pins
the race; it would fail if the comparator regressed.

## 5. Verdict

Approve-with-caveats — the scheduler subsystem now degrades cleanly under
load, but the race window above is the residual risk to watch.
