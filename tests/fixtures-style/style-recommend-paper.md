# Survey — style-recommend-paper (hermetic fixture)

Mode: ex
Subject: arxiv.org/abs/2312.09390 — "Attention is All You Need"

This is a synthetic survey used by `docent hermetic-style` to verify that the
style-recommendation mapper resolves an arXiv-PDF academic paper to the
**paper** preset.

## 0. Content boundary

This film covers the 8-page arXiv preprint published 12 Jun 2017
(arxiv.org/abs/1706.03762). The arxiv abstract is just the entry point; the
load-bearing surface is the paper's PDF — Figure 1, Section 3.2.2 (Scaled
Dot-Product Attention), and Table 2 (benchmark results vs. prior models).
The DOI is 10.48550/arXiv.1706.03762.

Out of scope: the citation graph, subsequent papers that extend the
architecture, the GPT/BERT lineage. The film argues the paper's central
claim, not the field that grew out of it.

## 1. Triage — the load-bearing claim

The paper makes one bold claim: recurrence and convolution are unnecessary
for sequence modeling — attention alone, properly scaled, is sufficient and
strictly faster to train. Section 3 is the load-bearing section; the
introduction and related work are scaffolding.

## 2. What the idea is

The transformer replaces the recurrent unit (LSTM, GRU) with self-attention:
every output position attends to every input position in parallel. The
mechanism is one matrix multiplication, not a sequence of state updates. The
peer-reviewed result: it trains faster AND scores higher on the WMT2014
en-de benchmark — 28.4 BLEU vs. the prior best of 26.8.

## 3. The hard parts

- **Where it is counterintuitive** — recurrence was thought to be where
  the sequence-modelling magic lived. The paper claims it is the bottleneck,
  not the engine. Figure 1 is the visual claim: positions attend in parallel,
  not in sequence.
- **The misconception it must kill** — that self-attention is "just" a
  weighted average. The scaling factor (1/sqrt(d_k)) in equation 1 is what
  keeps the dot-product distribution from collapsing as d_k grows. Without
  it, the paper does not train.
- **Where it breaks** — the O(n^2) memory cost of full attention. The
  paper does not address this; subsequent papers (Performer, Linformer)
  do. This is the boundary of the original claim's scope.

## 4. Is the claim earned

The paper is a research preprint; the claim is grounded in Table 2 (BLEU
scores against four prior baselines) and Section 3.2.2 (the dot-product
attention derivation). The citation count (~100k+ as of 2024) is decorative
— the film does not need to cite it; the in-paper evidence is sufficient.

## 7. The Big Idea

Attention is sufficient because the dot product, properly scaled, encodes
relevance and order in one operation.

## 8. Verdict

Sound — the paper earns its title within the boundary it sets (sequence
modeling, machine translation). The O(n^2) memory cost is the paper's biggest
unaddressed weak point, and the field that grew around the paper is exactly
the story of working around it.
