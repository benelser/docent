# Survey — Linear Algebra (explainer mode)

**Subject.** The `mdata/wiki` knowledge base — a directory of content built as the
ground-truth map for Module 1 of an applied deep-learning course. Surveyed as an
*idea to interrogate*, not a system to trace.

**Mode.** Explainer (`ex`). The film is `films/linear-algebra.json`.

---

## 0. Content boundary — the explainable unit

The wiki (`index.md`) catalogues, for Module 1 · Linear Algebra: ten concept
pages (`tensor`, `vector`, `matrix`, `linear-combination`, `dot-product`, `norm`,
`cosine-similarity`, `linear-transformation`, `matrix-multiplication`,
`identity-matrix`), plus `overview.md`, `depth-map.md`, `log.md`, and one source
page (`deep-learning-book-ch02.md`). Modules 2–4 (probability, numerical
computation, ML basics) are listed but unwritten.

Following the links from the index, the ten concept pages are not ten separate
films. `overview.md` states their **through-line** explicitly:

> "complex operations are stacks of simple ones. A matrix product is a pile of
> dot products. That compounding is the whole game — and it is why the dot
> product, mastered early, pays off everywhere downstream."

**The explainable unit chosen:** *that thesis* — Module 1's spine — "linear
algebra is a small base of objects plus one keystone operation (the dot
product), and every bigger operation is that keystone, restacked." The film
interrogates the compounding claim.

- **In scope:** the objects (`tensor`/`vector`/`matrix`), the dot product
  (`dot-product`), and the operations the wiki says descend from it
  (`norm`, `cosine-similarity`, `matrix-multiplication`,
  `linear-transformation`, `identity-matrix`).
- **Named neighbours at the edge:** `linear-combination` (the other base
  pattern; mentioned, not centred); the matrix *inverse* and span — the wiki's
  own "next lesson," used as the boundary case.
- **Out of scope:** the D1/D3/D4/D5 rungs of every page (all marked `○` "not yet
  climbed" — the wiki currently stands entirely at D2); the depth-ladder
  pedagogy machinery itself; Modules 2–4.
- **Prerequisites assumed of the viewer:** arithmetic, and the idea of an
  ordered list of numbers. No prior linear algebra.

## 1. Triage — load-bearing vs. mechanical

**Load-bearing** (the film interrogates this):
- The compounding thesis: complexity = simplicity, stacked.
- The dot product as the *keystone* — the one operation everything else is
  built from.
- The dual identity of a matrix: a data table *and* a transformation.
- The structural fact that `norm`, `cosine-similarity`, `matrix×vector`,
  `matrix×matrix` are each the dot product in a costume.

**Mechanical** (named in one line, set aside): the five-rung Depth Ladder
machinery (`SCHEMA.md`); the per-page boilerplate (`In our course` / `Grounding`
/ `Related`); the NumPy/`mdlib` API notes (`a @ b`, `.ndim`, `np.eye(n)`). These
are how the wiki is *maintained*, not the idea it teaches.

The cut line: a learner can read ten pages and still not see the spine that
connects them. Extracting that spine — and stress-testing it — *is* the survey.

## 2. What the idea is / why it exists

In my own words: **Linear algebra, as Module 1 frames it, is a language for
putting the world into arrays of numbers and computing on them — and its
grammar is unusually small.** There is one family of objects (scalar → vector →
matrix → tensor, differing only in *rank*, the count of axes) and one keystone
operation (the dot product). The central claim is that the bigger operations are
not new rules to learn — they are the dot product, restacked.

Why the idea exists: it answers "how do you compute on data at all," and it
*corrects* a specific prior belief — that mathematics is a pile of disconnected
formulas, each memorised on its own. The wiki's framing replaces that with a
dependency tree rooted at one operation.

## 3. The hard parts of the idea

- **Where it is counterintuitive.** Stacking is assumed to always *compound* —
  more layers, more power. But stacking *linear transformations* does the
  opposite: two matrices compose into one matrix (`matrix-multiplication` D2:
  "the product `AB` is the single machine"). A tower of linear layers is
  provably equal to a single linear layer. Intuition predicts growth; the
  algebra delivers collapse.
- **The misconception it must kill.** The learner arrives believing linear
  algebra is a bag of unrelated formulas — one for the norm, one for cosine
  similarity, one for matrix multiply. The right model: one keystone, restacked.
  The wiki must *displace* the bag-of-formulas model, not merely state the
  dependency tree.
- **Where it breaks.** "Complexity = stacked simplicity" is the *forward* story
  only. (a) Stacking the simple linear op adds no power without a nonlinearity.
  (b) The matrix *inverse* — "un-transforming the world," the wiki's very next
  lesson — is not built by stacking dot products forward, and not every matrix
  is invertible. (c) Linearity itself is the load-bearing assumption: straight
  lines stay straight and the origin stays fixed (`linear-transformation` D2) —
  no bending, no translation.
- **Mechanism, not just conclusion.** For the matrix-product claim the wiki
  shows the mechanism: `matrix-multiplication` D2 derives matrix×vector as a
  stack of dot products and matrix×matrix as a grid of them. For the dot
  product's *geometric* meaning, it does not — see §4.

## 4. Is the claim earned

- **Demonstrated.** "Matrix work is restacked dot products" — shown directly in
  `matrix-multiplication` D2, not asserted. The dot product itself is worked
  numerically: `[2,3]·[4,5] = (2×4)+(3×5) = 8+15 = 23` (`dot-product` D2). The
  "weighted total / fantasy-sports score" framing is concrete and apt.
- **Cited.** Every page maps to a section of *Deep Learning* (Goodfellow,
  Bengio & Courville, 2016), Ch. 2, via `deep-learning-book-ch02.md`. The
  citation is load-bearing — the section map is the wiki's backbone — not
  decorative.
- **Asserted (the yellow flag).** The dot product's *geometric* identity —
  `a·b = ‖a‖‖b‖cosθ`, the reason it measures alignment — is never derived.
  `dot-product` D3, the rung where it would be earned, is explicitly marked
  "*Not yet climbed.*" Yet `cosine-similarity` D2 already *uses*
  `cosθ = (a·b)/(‖a‖‖b‖)` to teach alignment. So a D2 page leans on an identity
  the wiki's own tracker says has not been climbed. The meaning of the keystone
  is, right now, an IOU.

## 5. The scope of the claim — where it does not apply

True when: operations are *linear* and *composed forward*. Fails when:
- **Depth must add power.** Stacking linear maps collapses to one map — "true
  that complexity stacks" fails here outright (`matrix-multiplication` D2).
- **You must invert.** The inverse `M⁻¹` is not a forward stack of dot products,
  and not every matrix has one (`identity-matrix` D3 preview; the wiki's Lesson 4
  is literally "learning to *un-transform* the world").
- **The transformation must bend or translate.** Linearity forbids both.

To its credit, the wiki *names* its own boundary: `linear-transformation` D5
notes a real network layer is "a linear transformation followed by a
nonlinearity," and `overview.md` flags Lesson 4 as the inverse. But Module 1 *as
taught* presents forward-stacking as the whole game — the limits are previews on
unclimbed rungs, not part of the lesson.

## 6. The competing explanation

**Rival framing:** a *geometry-first* account — transformations, span, and the
angle between vectors taught as visual intuition *before* the arithmetic (the
3Blue1Brown lineage). The wiki deliberately chose the opposite: arithmetic- and
code-first, every operation worked by hand into `mdlib` primitives, geometry
deferred to D3.

Why the wiki's choice can win: `SCHEMA.md` is explicit that "the user is an
engineer, so code is a *handhold*, the most concrete thing available" — and
mechanical fluency compounds downstream. Why it costs: the geometric *soul* of
the subject — why the dot product measures alignment, what span and basis are,
why matrix order matters — all sits at D3, unclimbed. A learner who finishes
Module 1 can *compute* a dot product but cannot yet *say why* it measures
alignment. This is a genuine, unresolved trade — not a settled question.

## 7. Verdict inputs

- **Disposition: sound, with caveats.** The compounding thesis is the right
  spine — it is true for the forward operations, it is demonstrated rather than
  asserted, and it kills the bag-of-formulas misconception. It is not
  overstated; it is *incompletely scoped* by its own design.
- **The single biggest weak point.** The keystone's geometric meaning is
  unearned at the depth currently taught: `cosine-similarity` D2 borrows against
  `dot-product` D3, which the wiki itself marks not yet climbed. The most
  important operation in the module is, today, taught as a recipe without its
  reason.
- **What to carry away.** Learn the dot product cold and most of Module 1 falls
  out for free — that payoff is real. But stay skeptical of "stacked simplicity"
  as a law: it is the *forward grammar* of linear algebra, and the most
  interesting half of deep learning — the nonlinearity, the inverse — lives in
  exactly what that grammar leaves out.

---
**Surveyed from** `mdata/wiki` — `index.md`, `overview.md`, `depth-map.md`,
`SCHEMA.md`, all ten `concepts/` pages, `sources/deep-learning-book-ch02.md`.
**Grounding** *Deep Learning* (Goodfellow, Bengio & Courville, 2016), Chapter 2.
