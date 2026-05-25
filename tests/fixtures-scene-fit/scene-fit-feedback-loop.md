# Survey — scene-fit-feedback-loop (hermetic fixture)

Mode: ex
Subject: The two-sided marketplace flywheel — why Uber's growth compounds

This is a synthetic survey used by `docent hermetic-scene-fit` to verify that
the scene-fit mapper recognizes a self-reinforcing dynamic and pulls the
`causal-loop` primitive into the recommendation.

## 0. Content boundary

The film covers ONE feedback loop: rider supply ↔ driver supply on a
two-sided ride-share marketplace. The labor-market policy debate, the
regulatory layer, and the unit-economics literature are out of scope.

## 1. Triage — the load-bearing dynamic

The marketplace exhibits a classic self-reinforcing dynamic: more riders pull
in more drivers (higher utilization, higher per-driver earnings), and more
drivers pull in more riders (shorter wait times, lower surge). It is the
canonical reinforcing loop in platform economics — a flywheel where the
output of one variable feeds into the input of the other, and the cycle
compounds.

## 2. What it is

A positive feedback loop with two coupled variables. The polarity of every
edge in the cycle is `+`: an increase in riders drives an increase in
drivers; an increase in drivers drives an increase in riders. Two positive
edges means a reinforcing cycle — the loop compounds, it does not balance
itself out.

## 3. The hard parts

- **Where it breaks** — the loop fails at the cold-start boundary: with zero
  drivers, no rider gets matched, and no driver shows up. The flywheel is
  bootstrapped by subsidies on one side.
- **The misconception** — the loop is not magic; it is just a balancing
  cycle waiting for a negative-feedback term to turn it from virtuous to
  vicious. Surge pricing is the negative term that keeps it from
  overshooting.

## 4. Verdict

The flywheel is real but conditional — every two-sided marketplace promises
this dynamic and most fail to bootstrap it.
