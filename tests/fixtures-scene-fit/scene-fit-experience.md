# Survey — scene-fit-experience (hermetic fixture)

Mode: ex
Subject: The first-hour onboarding experience for a new Postgres user

This is a synthetic survey used by `docent hermetic-scene-fit` to verify the
mapper pulls the `journey-map` primitive when the argument is about how a
person moves through something.

## 0. Content boundary

The film covers the user journey of a developer's first hour with Postgres —
from `brew install` through running their first SELECT. The DBA learning
curve, performance tuning, and replication setup are out of scope.

## 1. Triage — the load-bearing journey

The argument is the emotional arc of onboarding. The customer journey runs
through six stages, each with its own touchpoint and pain point:

- **Install** — `brew install postgresql` (touchpoint: package manager)
  → feeling: confident.
- **First connect** — `psql` (touchpoint: command line) → pain point: the
  default database name is the user's login, not "postgres".
- **First table** — `CREATE TABLE` (touchpoint: SQL prompt) → confused: no
  semicolon = no execution; the silence is the punishment.
- **First query** — `SELECT` (touchpoint: result formatting) → relieved.
- **First mistake** — DROP without WHERE (touchpoint: irreversible loss)
  → panicked.
- **First recovery** — pg_dump (touchpoint: backup story) → grounded.

This is UX research on the first-time user experience — the spine of the
analysis is a single developer's emotional arc, anchored to the
touchpoints they hit along the way.

## 2. What it is

A stages-of-experience map. Every stage has an emotion AND a touchpoint;
the pair is what makes the journey-map argue, rather than being a list of
feelings or a list of steps. The pain points cluster at stages 2 and 5.

## 3. The hard parts

- **Where the emotion misleads** — "confident" at stage 1 is
  retrospectively wrong; the user is about to be punished for that
  confidence at stage 2.

## 4. Verdict

The onboarding experience has two cliff edges (stages 2 and 5) and the
project's docs only acknowledge one.
