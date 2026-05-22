# Kubernetes PR Analysis — Scheduler Heap Optimization

**PR #139003 — "scheduler: Eliminate map lookups from heap comparison path"**
URL: https://github.com/kubernetes/kubernetes/pull/139003
Author: helayoty (Heba) · Merged 2026-05-20 into `master` · Milestone v1.37
Headline stat: **2 files changed, +541 / -133** (size/XL, sig/scheduling)

## What it introduces / does

The Kubernetes scheduler keeps pending pods in priority heaps so it can always
pick the highest-priority pod next. This PR rewrites the internal heap data
structure (`pkg/scheduler/backend/heap/heap.go`) so that heap items are stored
directly in the heap-ordered slice instead of being held in a side map and
referenced indirectly by key. The hot heap operations `Less` and `Swap` — called
O(log n) times for every Push, Pop, and Fix — now use direct pointer
dereferences with zero hash-map lookups. It is purely an internal data-structure
change with no user-facing API impact; measured speedups are 24-46% across heap
operations with allocations roughly halved.

## What it touches

- `pkg/scheduler/backend/heap/heap.go` — the generic heap implementation itself
  (the only production file changed).
- `pkg/scheduler/backend/heap/heap_test.go` — tests substantially rewritten and
  expanded into table-driven cases (`go-cmp` added for diffing pop order).
- Indirect consumers (unchanged but exercised): the scheduler's pending-pod
  queues — `pkg/scheduler/backend/queue/active_queue.go`,
  `pkg/scheduler/backend/queue/backoff_queue.go`, and
  `pkg/scheduler/backend/queue/scheduling_queue.go` — all build `Heap` instances
  via `heap.NewWithRecorder`. The public `Heap[T]` API (`AddOrUpdate`, `Delete`,
  `Pop`, `Peek`, `Get`, `GetByKey`, `Has`, `List`) is unchanged, so these
  callers needed no edits.

## The core change

Before, the heap held a `queue []string` of keys plus an `items` map keyed by
those strings; every comparison had to look up two map entries:

```go
type heapItem[T any] struct {
	obj   T
	index int
}
type data[T any] struct {
	items map[string]*heapItem[T]
	queue []string
	...
}

func (h *data[T]) Less(i, j int) bool {
	if i > len(h.queue) || j > len(h.queue) { return false }
	itemi, ok := h.items[h.queue[i]]
	if !ok { return false }
	itemj, ok := h.items[h.queue[j]]
	if !ok { return false }
	return h.lessFunc(itemi.obj, itemj.obj)
}
```

After, the queue holds item pointers directly and a separate `keyIndex` map is
consulted only for key-based lookups; `Less` becomes a pure pointer deref:

```go
type heapItem[T any] struct {
	obj T
	key string
}
type data[T any] struct {
	queue    []*heapItem[T]
	keyIndex map[string]int
	...
}

func (h *data[T]) Less(i, j int) bool {
	return h.lessFunc(h.queue[i].obj, h.queue[j].obj)
}
```

`Swap` likewise drops its map fetches and just swaps two slice pointers, then
updates `keyIndex` for the two affected keys. The `itemKeyValue[T]` wrapper type
is deleted — `heapItem[T]` is now pushed directly into `container/heap`.

## Ripple effects

- **API:** none. No user-facing change, no flag, no KEP. Public `Heap[T]`
  surface is identical, so the scheduling-queue callers are untouched.
- **Performance:** author-run benchmarks at sizes 100/1000/5000 — Pop 16.7ms→9.6ms
  (-43%), AddOrUpdate/Fix 2.7ms→1.5ms (-45%), Push 6.6ms→5.0ms (-24%), Mixed
  15.1ms→8.2ms (-46%); allocations per Push/Mixed down ~50%. Verified against
  the `kubernetes-e2e-gce-100-performance` Prow job.
- **Correctness/memory:** `Pop` now nils the tail slot before truncation
  (`h.queue[n-1] = nil`) to avoid leaking popped objects through the backing
  array. Bounds-guard dead code in `Less`/`Swap` (e.g. `i < 0` checks) was
  removed since `container/heap` never passes out-of-range indices. `Delete`
  now returns the value from `heap.Remove` directly instead of re-reading it.
- **Tests:** the old ad-hoc tests were replaced with table-driven coverage
  (`TestHeapPopOrder`, `TestHeapDeleteMiddle`, `TestHeapUpdatePriority`,
  `TestHeapLen`, `TestHeapDeleteAll`, `TestHeapLargeScale`, etc.), and assertions
  that poked internals were updated to the new fields (`queue[0].key`,
  `keyIndex["baz"]`).

## Why it matters

The scheduler heap sits on the critical path of every scheduling cycle: in large
clusters with thousands of pending pods, the constant-factor cost of two hash
lookups per comparison multiplies across O(log n) comparisons per operation and
across thousands of operations per second. Removing that indirection — trading a
key-string slice for an item-pointer slice — cuts scheduling-queue latency and
GC pressure with no behavioral risk, a textbook example of a cache-friendly,
zero-API-cost performance refactor of a core subsystem.

## Four beats

1. **The bottleneck.** Profiling the scheduler's priority heap reveals that
   every `Less`/`Swap` comparison pays for two hash-map lookups, multiplied over
   O(log n) comparisons per Push/Pop/Fix on queues holding thousands of pods.
2. **The redesign.** The `queue []string` + `items map` double indirection is
   replaced by a single `queue []*heapItem[T]` of pointers, with a lean
   `keyIndex map[string]int` kept only for key-based lookups.
3. **The hot path slims down.** `Less` collapses to a direct pointer dereference
   and `Swap` to a pointer swap plus two index writes; the `itemKeyValue` wrapper
   and defensive bounds checks are deleted, and `Pop` nils the freed slot to
   avoid a memory leak.
4. **Proof and hardening.** Benchmarks show 24-46% faster operations and ~50%
   fewer allocations, validated by the GCE 100-node performance job, while the
   test suite is rebuilt into broad table-driven cases that lock in heap
   invariants.
