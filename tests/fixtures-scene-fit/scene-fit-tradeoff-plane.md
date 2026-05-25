# Survey — scene-fit-tradeoff-plane (hermetic fixture)

Mode: ex
Subject: Database engines on the consistency × latency trade-off plane

This is a synthetic survey used by `docent hermetic-scene-fit` to verify that
the scene-fit mapper recognizes a 2-D trade-off plane and pulls the
`landscape` primitive into the recommendation.

## 0. Content boundary

The film places six database engines (Postgres, MySQL, DynamoDB, Cassandra,
Spanner, CockroachDB) on a two-axis trade-off plane. Replication mechanism,
storage format, and licensing are out of scope.

## 1. Triage — the two axes

The argument is two-dimensional: every engine sits on a plane whose x-axis
is **consistency strength** (low: eventually consistent → high: linearizable)
and whose y-axis is **read latency at scale** (low: sub-millisecond → high:
seconds). The plane has four meaningful quadrants:

- TL — weakly consistent, fast (DynamoDB, Cassandra)
- TR — strongly consistent, fast (Spanner — the expensive corner)
- BL — weakly consistent, slow (a category error, no real engine)
- BR — strongly consistent, slow (single-master Postgres at scale)

## 2. What it is

A tool survey shaped as a quadrant analysis. The placement on the trade-off
plane is the argument: each engine's positioning follows from a property
named in the survey. The two axes are NOT the same trade-off (the
"simplicity vs simplicity" failure mode); they encode genuinely orthogonal
choices.

## 3. The hard parts

- **Where the placement is contested** — Spanner's position depends on
  the workload; under a write-heavy load it migrates toward the bottom-right.
- **What the plane omits** — operational cost. A three-axis chart cannot
  be rendered as a landscape; that dimension is set aside.

## 4. Verdict

The plane is real and the engines cluster sensibly; the empty BL quadrant
itself is the most informative finding.
