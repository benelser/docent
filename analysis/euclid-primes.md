# Survey — Euclid's Theorem (explainer mode)

**Subject.** The Wikipedia page `Euclid's theorem`, fetched to
`analysis/euclid-primes.source.md`, treated as an argument about what the
infinitude proof really proves and what later results add.

**Mode.** Explainer (`ex`). The film is `films/euclid-primes.json`.

---

## 0. Content boundary — the explainable unit

The page is much larger than one film. It begins with Euclid's original proof,
then moves through a factorial variation, Euler, Erdos, Furstenberg, several
recent proofs, and stronger results such as Dirichlet's theorem, the prime
number theorem, and Bertrand-Chebyshev (source lines 237-237, 239-261,
263-2236).

**The explainable unit chosen:** Euclid's original "escape any finite list"
argument, plus the immediate boundary the page itself draws around it: the
theorem proves that no finite list exhausts the primes, but it does not tell
you where primes lie or how densely they occur.

- **In scope:** the introduction; Euclid's proof; the factorial variation that
  restates the same idea as "for every positive integer n there is at least one
  prime bigger than n"; Euler's proof as a stronger comparator; and the
  "Stronger results" section that shows what Euclid's theorem does not claim
  (source lines 237-261, 267-323, 645-723, 2123-2265).
- **Named neighbours at the edge:** Erdos's proof, Furstenberg's topological
  proof, and the recent proof catalog. They show the theorem's reach, but they
  are breadth, not the load-bearing idea for this film (source lines 787-2119).
- **Out of scope:** the full proof catalog; topology on the integers;
  incompressibility; detailed recent proofs; and the full machinery behind the
  prime number theorem.
- **Prerequisites assumed of the viewer:** what a prime number is, what it
  means for one integer to divide another, and the difference between a finite
  list and an infinite set.

## 1. Triage — load-bearing vs. mechanical

**Load-bearing:**
- The theorem's real claim is local and universal at once: from **any** finite
  list of primes, one can force at least one more prime not on that list
  (source lines 245-253).
- The mechanism is divisibility, not magic. The reason the proof works is that
  no listed prime can divide both the product `P` and `P + 1`, because then it
  would divide their difference, `1` (source lines 249-249).
- The page is explicit that Euclid's proof is commonly misreported: it is not
  fundamentally a contradiction proof from "all primes," but a proof by cases,
  a direct proof method (source lines 253-253).
- The theorem is intentionally narrow. Later sections show stronger results
  that answer different questions: where a prime must lie, or how many primes
  lie below `x` (source lines 2131-2233, 2240-2265).

**Mechanical:**
- The statement that there are "at least 200 proofs" is useful scale, but the
  film does not need to tour that catalog (source lines 237-237).
- The long list of later proofs is historical abundance, not the one idea that
  makes Euclid's theorem explainable (source lines 787-2119).
- The heavy analytic and topological machinery in later sections matters only
  as a named boundary, not as the center of the film.

The cut line: the film interrogates **why Euclid's original proof defeats every
finite list, and what that proof still cannot tell you**. It does not survey
the whole proof museum.

## 2. What the idea is / why it exists

In my own words: **Euclid's theorem says that primes cannot be finished off by
enumeration.** Any time you hand the theorem a finite roster of primes, it can
manufacture a number that evades every prime on that roster, which forces at
least one more prime outside the list (source lines 245-251).

Why this idea exists: it answers the basic question "Do prime numbers ever run
out?" and corrects a bad intuition about what a proof of infinity should look
like. The proof does not rely on scanning larger and larger tables. It forces
the conclusion from one divisibility move.

## 3. The hard parts of the idea

- **Where it is counterintuitive.** Many first hear the argument as a recipe
  for the next prime: multiply known primes and add 1. But the page's actual
  proof does not need `q = P + 1` to be prime. It only needs `q` to have a
  prime factor not in the original list. The composite case is not a bug in the
  proof; it is half of the proof (source lines 245-249).
- **The misconception it must kill.** The strongest misconception is double.
  First, that Euclid begins with "all primes" on the table. Second, that the
  punchline is "P + 1 itself is the new prime." The page repairs the first
  explicitly by saying the proof is really a direct proof by cases from an
  arbitrary finite list (source lines 245-253). The second is repaired by the
  proof's own composite branch: a new factor is enough (source lines 247-249).
- **Where it breaks — walk one boundary case to the failure.** Ask the theorem
  for more than existence and it stops. In the composite branch, `q` does not
  hand you the next prime; it only tells you some prime factor of `q` lies
  outside the list. That is exactly where a "prime generator" reading fails.
  The page's later sections show the stronger questions you have now entered:
  Bertrand-Chebyshev locates a prime between `n` and `2n`, and the prime number
  theorem estimates `pi(x)` by `x / log x` (source lines 2240-2265,
  2139-2233).
- **The mechanism, not just the conclusion.** The proof's engine is the
  remainder of `1`. A listed prime divides `P` by construction. If that same
  prime divided `q = P + 1`, then it would divide `q - P = 1`, impossible for a
  prime. So no listed prime divides `q`; if `q` is composite, its prime factor
  must be new (source lines 245-253).

## 4. Is the claim earned

- **Demonstrated.** The central claim is demonstrated step by step in the
  Euclid section itself, not merely asserted. The composite case is stated and
  discharged in the text (source lines 245-253).
- **Cited.** The page cites Euclid's *Elements* for the original theorem and
  later citations for historical and alternative proofs. Those citations matter
  most when the page moves beyond Euclid into Euler and the proof catalog
  (source lines 243-243, 267-267, 787-2119).
- **Asserted or cataloged.** "There are at least 200 proofs" is a catalog
  claim, not something the page demonstrates inside this article (source lines
  237-237). Likewise, the long list of later proofs is breadth rather than
  support the film needs to repeat.

The page therefore earns the load-bearing claim well. Its strongest material is
the original proof and the way the later sections clarify that Euclid proved an
existence theorem, not a full theory of prime distribution.

## 5. The scope of the claim — where the idea does not apply

The claim holds when the question is:

- **Can any finite list contain all primes?** No (source lines 245-251).
- **Is there always a prime larger than `n`?** Yes, via the factorial
  variation (source lines 261-261).

It does **not** answer:

- **Is `P + 1` itself prime?** No. The page explicitly includes the composite
  branch, where only a prime factor of `q` is guaranteed to be new (source
  lines 247-249).
- **Where is the next prime?** No. That is the territory of stronger results
  such as Bertrand-Chebyshev (source lines 2240-2265).
- **How many primes are there below `x`?** No. That is the territory of the
  prime number theorem and Euler's stronger analytic results (source lines
  726-780, 2139-2233).

So the safe scope sentence is: **true as an existence theorem, false as a prime
generator, and silent about density.**

## 6. The competing explanation

The strongest rival framing inside the page is **Euler's richer analytic
account**. Euclid shows that primes never end by escaping any finite list.
Euler starts instead from unique factorization and an infinite product, then
drives toward stronger facts such as the divergence of the sum of reciprocal
primes (source lines 267-323, 645-780).

Why Euclid still wins as the central film:

- It has almost no prerequisites beyond divisibility.
- It exposes the mechanism directly: the decisive fact is `q - P = 1`.
- It works from **any** finite list, not only the first `k` primes.

What that choice costs:

- It gives up location: no `n < p < 2n`.
- It gives up density: no `pi(x) ~ x / log x`.
- It gives up construction: it does not hand you the next prime number itself.

So the film should choose **Euclid's elementary escape proof over Euler's
richer census of the primes**, but say plainly that the choice buys elegance by
accepting narrowness.

## 7. Verdict inputs — a takeaway that adjudicates

- **Disposition.** Sound, and still the right first explanation. As an answer
  to "why can't primes run out," Euclid's theorem is decisive because its
  mechanism is minimal and explicit.
- **The single biggest weak point.** The theorem is easy to overclaim. Its
  elegance tempts retellings to inflate an existence proof into a prime
  generator or a contradiction drama.
- **The precise skepticism to carry forward.** Carry this sentence: *Euclid
  proves there is a prime outside any finite list; he does not prove that `P + 1`
  itself is prime, nor where the next prime will be.* The specific thing to
  doubt from here on is any retelling that turns this theorem into a recipe or a
  density law it never claimed.

---
**Surveyed from** `analysis/euclid-primes.source.md`, especially the
introduction; `Euclid's proof`; `Variations`; `Euler's proof`; and `Stronger
results`.
