+++
title = "Embedding drift: Part 2 - How are they trained?"
date = 2025-11-27
description = "Where embedding models get their sense of similar: training pairs, the InfoNCE objective as a multiple-choice exam, negatives and temperature, dual- vs cross-encoders, and why even identical training recipes produce incompatible maps."

[extra]
tags = ["llm", "embeddings", "retrieval", "vector-search", "testing", "ai"]
categories = ["Research Notes"]
+++

*This is Part 2 of a series on embedding drift. [Part 1](@/blog/0002-what-are-embeddings.md) covered what embeddings are.*

In Part 1 we established that an embedding model is a mail-sorting machine: it stamps a coordinate on every letter and pins it to a map, and what survives the fold is decided by training, not by anyone's deliberate choice. Which raises the obvious question: how does a machine *learn* where to pin things? Nobody writes down rules like "sourdough is 0.3 away from ciabatta." So where does the sense of "similar" come from?

**TL;DR**

- Embedding models learn from **pairs**: examples of things that should land close (positives) amid things that shouldn't (negatives). The pairs *are* the definition of similar.
- The workhorse objective, **InfoNCE**, is a multiple-choice exam in disguise: given a query, pick the true match out of a lineup. Temperature controls how harshly wrong answers are punished; negatives decide which distinctions get carved.
- The modern recipe is two-stage: **contrastive pretraining** on web-scale weak pairs, then **supervised fine-tuning** on curated pairs, often with a cross-encoder as reranker or distillation teacher.
- The objective only constrains **relative** positions: rotate the entire map and the loss doesn't change. Combined with random init and data ordering, this means two training runs produce **incompatible coordinate systems even with the same recipe**. Drift isn't an accident of upgrades; it's baked into how these models are made.

## Flashcards for a sorting machine

You can't teach the machine with rules, so you teach it with **flashcards**: here is a letter, here is another letter that belongs near it, and here is a pile that doesn't. Do this a few hundred million times and the machine develops a sense of placement. The crucial consequence: *the flashcards define what "close" means*. Change the deck, change the geometry.

What counts as a card? Anything you can plausibly call a pair:

- **Query-passage pairs**: a question and the passage that answered it.
- **Paraphrases and duplicates**: two phrasings of the same thing.
- **Structural pairs**: a title and its body, a paper and its abstract, adjacent turns of a conversation, two pages that link to each other.
- **Behavioral signals**: co-clicks, items bought in the same session, tickets resolved by the same article. Weak and noisy, but abundant.

At foundation-model scale, the deck is a giant scrape of the public web plus curated sources: **Common Crawl**-style snapshots, **Wikipedia** and reference corpora, books, news, academic papers, and for multimodal models, image-text datasets that tie pictures to captions. That mix produces a very general, very *web-shaped* notion of similarity: great at topics, paraphrases, and casual text; oblivious to your internal ticket taxonomy, invoice formats, or proprietary jargon, because no flashcard ever mentioned them.

Which is why production systems layer **domain data** on top: search logs, query-click pairs, FAQ pairs, support tickets and the articles that resolved them. These cards teach the model what *your product* considers similar. Which document actually answered the question, which items belong on the same shelf. Recall the rule from Part 1: capacity determines what a model *could* keep; training determines what it *does* keep. Domain pairs are how you change the "does."

## The objective: a multiple-choice exam

Strip away the jargon and the central training loop is an exam question:

> *Here's a query. Here are `$N+1$` documents; one is the true match, the rest are decoys. Point to the match.*

The model answers by placing everything on the map and betting on whatever landed closest to the query. Then we grade it. Formally, for a query embedding `$q$`, its positive `$p$`, and negatives `$\{n_i\}$`, the **InfoNCE** loss is:

```math
\mathcal{L}_{\text{InfoNCE}} = -\log
\frac{\exp(q \cdot p / \tau)}
     {\exp(q \cdot p / \tau) + \sum_i \exp(q \cdot n_i / \tau)}.
```

This looks exotic and is anything but: it's **softmax cross-entropy**, the same loss as ordinary classification, where the "classes" are the candidate documents and the "logits" are similarity scores (dot products, usually on L2-normalized vectors; see [Part 1](@/blog/0002-what-are-embeddings.md) for why normalized dot product equals cosine). Training an embedding model is training a classifier whose answer sheet is the geometry of the map.

Don't take that on faith. Compute both, watch them agree to the last digit:

```python
import numpy as np
rng = np.random.default_rng(0)
unit = lambda v: v / np.linalg.norm(v, axis=-1, keepdims=True)

q, p, negs = unit(rng.normal(size=64)), unit(rng.normal(size=64)), unit(rng.normal(size=(7, 64)))
tau = 0.05
logits = np.concatenate(([q @ p], negs @ q)) / tau

info_nce = -np.log(np.exp(logits[0]) / np.exp(logits).sum())   # the formula above
cross_entropy = -(logits[0] - np.log(np.exp(logits).sum()))    # log-softmax, label = 0
print(f"InfoNCE       = {info_nce:.6f}")
print(f"cross-entropy = {cross_entropy:.6f}")
```

<!-- output -->

An eight-way multiple-choice exam (one positive, seven decoys), graded exactly like a classifier.

Two knobs deserve a closer look.

**Temperature `$\tau$`** scales the logits before the softmax. Small `$\tau$` makes the exam brutal: the model is punished sharply for *any* decoy that scores close to the positive, so it concentrates the signal on the hardest confusions. Large `$\tau$` spreads the attention out and smooths the pressure. Too small and training gets twitchy, especially when the flashcards contain labeling noise, because the model is being maximally punished for "errors" that are actually bad labels.

**The gradient tells you what gets carved.** Differentiate the loss and you find that each negative is pushed away *in proportion to its softmax weight*, that is, in proportion to how confusable it currently is with the positive. Distant, irrelevant decoys contribute almost nothing; near-misses dominate the learning signal. The model spends its capacity exactly where the distinctions are hardest. This one fact explains most of the engineering that follows.

## Negatives: where the geometry gets carved

If near-misses dominate the gradient, then *choosing the decoys* is choosing what the model learns. In practice nobody hand-picks them:

- **In-batch negatives**: every other example in the training batch doubles as a decoy for the current query. Free, efficient, and it's why **batch size** is secretly a modeling decision: a batch of 4,096 gives each query 4,095 decoys and a much stronger uniformity signal than a batch of 64.
- **Hard negatives**: documents that the *current* model ranks high but that are actually wrong, mined from the index or generated adversarially. These supply exactly those near-misses, teaching distinctions like "same topic, wrong answer." A **curriculum** matters: introduce them too early and the model chases noise; too late and it stays coarse.
- **False negatives**: the failure mode of in-batch sampling. If your batch happens to contain a document that's *genuinely relevant* to the query, the loss punishes the model for placing it correctly. At web scale this is a real source of label noise, and part of why curated fine-tuning data and de-duplication earn their keep.

There's an elegant way to see what all this pushing and pulling converges to. Contrastive objectives decompose into two forces (Wang & Isola, 2020). **Alignment**: positives should land close together. **Uniformity**: embeddings overall should spread out evenly over the unit sphere, so the space's capacity is actually used. Alignment without uniformity collapses the map to a point ("everything is similar"); uniformity without alignment scatters it randomly. A good embedding space is the tension between the two. That's also a tidy explanation for why pipelines normalize embeddings onto the sphere in the first place: it's the surface the objective is implicitly sculpting.

## One encoder or two?

Architecturally there's a fork in the road:

- **Dual-encoders** (bi-encoders): query and document are embedded *independently*. This is what makes retrieval fast: document vectors are computed once, indexed, and searched at query time. It's the standard for large-scale retrieval, and it's the architecture this whole series assumes.
- **Cross-encoders**: one model reads the query and the candidate *together* and outputs a relevance score. Much more accurate, since it can attend across the pair and catch interactions a fixed vector can't, but much too slow to run against a corpus: every query-document pair needs a full forward pass.

The standard production compromise uses both:

1. Train a **dual-encoder** with contrastive objectives on large-scale pairs, which gives fast candidate retrieval.
2. Train a **cross-encoder** on curated relevance data, which gives accurate scoring.
3. Deploy the cross-encoder as a **reranker** over the dual-encoder's top-k, and/or as a **teacher**: distill its finer judgments back into the dual-encoder, so some of that pairwise nuance gets baked into the map itself.

## The small choices that shape the map

Beyond data and objective, a scatter of seemingly minor decisions each leave fingerprints on the final geometry:

- **L2-normalization**: whether similarity means cosine or raw dot product (and whether vector length is allowed to carry information at all).
- **Pooling**: a transformer produces one vector *per token*; the embedding is a summary. Mean-pooling, CLS-token, and last-token pooling produce genuinely different spaces from the same backbone.
- **Temperature `$\tau$`**, **batch size**, and the **negative-mining curriculum**: as above.
- **Instruction prefixes**: many modern models are trained with task markers like `query:` / `passage:`, or full natural-language instructions. Embedding text *without* the prefix the model was trained with puts you in a different region of the map.
- **Matryoshka training**: some models are trained so that truncating a vector to its first `$k$` dimensions still works as a coarser embedding, making dimension a runtime dial rather than a fixed choice.
- **Mixed objectives**: contrastive terms combined with classification or distillation losses, to keep several kinds of signal alive in one vector.

And beneath it all, real-world data brings label noise, class imbalance, and domain shift. None of these choices is exotic on its own; the point is that *every one of them* changes where letters land, and no two teams, or even two releases from the same team, make all of them identically.

## Why two runs never draw the same map

Drift is inevitable rather than unlucky, and the reason is worth stating precisely.

Look back at the InfoNCE loss: it depends on the embeddings **only through dot products** like `$q \cdot p$`. Now take any orthogonal transformation `$Q$` (a rotation, possibly with reflections) and apply it to *every* embedding the model produces. Dot products don't budge:

```math
(Qx) \cdot (Qy) = x \cdot y.
```

Every similarity, every ranking, every loss value: identical. Which means the training objective **cannot see the difference** between a solution and any rotation of it. There is an entire family of maps, one for every possible `$Q$`, that are all exactly equally good, and nothing in training pins down which one you get. The objective constrains the *relative* geometry (who is near whom) and says nothing about *absolute* coordinates.

Six lines of numpy make the argument concrete. Rotate a batch of embeddings by a random orthogonal matrix and compare:

```python
import numpy as np
rng = np.random.default_rng(0)

X = rng.normal(size=(5, 64))                     # five embeddings
Q, _ = np.linalg.qr(rng.normal(size=(64, 64)))   # a random orthogonal matrix
XQ = X @ Q                                       # every embedding rotated

def cos_matrix(A):
    n = np.linalg.norm(A, axis=1)
    return (A @ A.T) / np.outer(n, n)

print("max similarity change:", np.abs(cos_matrix(X) - cos_matrix(XQ)).max())
print("max coordinate change:", np.abs(X - XQ).max())
```

<!-- output -->

Every pairwise similarity preserved to machine precision; every individual coordinate scrambled beyond recognition. Both maps are, to the training objective, *the same model*.

The numpy demo tested one random rotation. The actual claim is stronger: *no* orthogonal transformation can ever change a dot product. That's a universally quantified statement, and the Z3 theorem prover (`pip install z3-solver`) can check it outright. Encode an arbitrary 2x2 matrix, constrain it to be orthogonal (`$Q^\top Q = I$`), and ask whether dot products survive:

```python
from z3 import Reals, And, Implies, prove

a, b, c, d = Reals("a b c d")                    # Q = [[a, b], [c, d]], any matrix
x1, x2, y1, y2 = Reals("x1 x2 y1 y2")            # any two embeddings
orthogonal = And(a * a + c * c == 1, b * b + d * d == 1, a * b + c * d == 0)

Qx1, Qx2 = a * x1 + b * x2, c * x1 + d * x2
Qy1, Qy2 = a * y1 + b * y2, c * y1 + d * y2
prove(Implies(orthogonal, Qx1 * Qy1 + Qx2 * Qy2 == x1 * y1 + x2 * y2))
```

<!-- output -->

For every orthogonal `$Q$` and every pair of vectors, with no exceptions to find. The training objective is provably blind to orientation.

So which map do you get? Whichever one the accidents of the run steered you into: random weight initialization, the shuffle order of the data, batch composition, even nondeterministic GPU arithmetic. Retrain the **same architecture** on the **same data** with the **same hyperparameters**, and you'll converge to a space that's comparably good and *differently oriented*. Dimension 217 of run A has no relationship to dimension 217 of run B. And that's the best case; real upgrades also change the data, the objective, and the architecture, so the relative geometry shifts too (that's the neighborhood reshuffling from Part 1), on top of the arbitrary orientation.

Two useful corollaries:

1. **Never mix vectors from different runs or versions.** Not "risky": meaningless, for the same reason coordinates from two arbitrarily rotated maps can't be compared. (Part 1's first failure mode, now with a proof sketch.)
2. **Cross-version mappings are learnable.** If a big share of the difference between two spaces is "same relative geometry, different orientation," then a linear map from old space to new can recover a lot of compatibility. That's exactly the bridge we'll build in Part 3.

## Closing thoughts

An embedding model is never "just a model." It's the frozen judgment of a mountain of flashcards, a multiple-choice objective, a pile of negatives, and a dozen small geometric decisions about what counts as "similar", plus one final twist: even after all those choices are fixed, the coordinate system itself is an accident of the run.

Which reframes the scary upgrade ticket. When you swap embedding models you aren't tweaking a component; you're replacing one frozen judgment with another that was never constrained to agree with the first, not even about which way is up. Two sculptors never carve the same statue, even from the same block.

In [Part 3](@/blog/0004-what-are-drift.md) we treat that as what it really is, **an API break**, and look at how to measure it, roll it out safely, and build the compatibility bridge the rotation argument just promised us.

## Further reading

- Oord, Li, Vinyals, *Representation Learning with Contrastive Predictive Coding* (2018): where InfoNCE comes from.
- Chen et al., *SimCLR* (2020): in-batch negatives, temperature, and batch size, studied carefully (in vision).
- Karpukhin et al., *Dense Passage Retrieval* (2020): the dual-encoder retrieval blueprint.
