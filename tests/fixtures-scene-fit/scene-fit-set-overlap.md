# Survey — scene-fit-set-overlap (hermetic fixture)

Mode: ex
Subject: The prompt-injection trifecta — when an LLM agent becomes exploitable

This is a synthetic survey used by `docent hermetic-scene-fit` to verify the
mapper pulls the `venn` primitive when the argument hinges on the
intersection of multiple sets.

## 0. Content boundary

The film covers Simon Willison's "lethal trifecta" for LLM agents — the set
intersection of three capabilities that together produce exploitable
prompt-injection surface. Single-capability vulnerabilities (e.g. plain
prompt injection in a non-agent setting) are out of scope.

## 1. Triage — what's in the intersection

The argument is purely about set overlap. The trifecta is three sets:

- Set A: **access to private data** (the agent can read PII, secrets, or
  user-owned documents).
- Set B: **exposure to untrusted input** (the agent reads attacker-controlled
  content — emails, web pages, user-submitted text).
- Set C: **ability to externally communicate** (outbound HTTP, sending
  email, posting to APIs).

What's in both A and B? An agent that reads attacker text but can't speak
out — leaks possible only via internal log; lives in the intersection of
two sets, not all three. What lives only in the intersection of A, B, and
C? An agent that can be told to exfiltrate the user's private data to the
attacker.

## 2. What it is

A three-circle set diagram. Each circle is a capability. The dangerous
region — the small triangle where all three overlap — is the load-bearing
geometry. Two-of-three overlaps are recoverable; the triple overlap is not.

## 3. The hard parts

- **Why the intersection alone is the argument** — A or B or C alone is
  fine; A ∧ B alone leaks but can't escape; A ∧ C alone has nothing
  attacker-controlled to act on. Only the all-three intersection composes
  the full attack chain.
- **Where the framing strains** — "outbound communication" is fractal; even
  a database write can be an out-of-band channel. Set C is bigger than it
  looks.

## 4. Verdict

The argument needs the geometry — what's in the intersection — and a
structure scene cannot render it.
