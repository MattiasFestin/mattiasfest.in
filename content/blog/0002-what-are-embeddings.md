+++
title = "Embedding drift: Part 1 - What is an embedding?"
date = 2025-11-26
description = "An embedding model is a learned function that folds text into a point in a vector space, trained so that similar things land close together. What that means, how cosine and Euclidean distance compare, and why swapping the model moves every point on the map."

[extra]
tags = ["llm", "embeddings", "retrieval", "vector-search", "testing", "ai"]
categories = ["Research Notes"]
+++

If you’ve ever upgraded an embedding model and opened your search results only to find your app suddenly behaving like a forgetful librarian who insists that every book about 'baking' actually belongs in 'astronomy', you’ve run into **<u>embedding drift</u>**.

**TL;DR**

- An *embedding model* is a learned function that maps an input (text, image, code) to a point in `$\mathbb{R}^n$`, trained so that inputs the training process considered similar land close together.
- The mapping is lossy, but it's not compression for reconstruction. It's a projection optimized for a *specific, trained-in notion of similarity*. What survives is decided by the training data and objective, not chiefly by model size.
- On L2-normalized vectors, ranking by cosine similarity and ranking by Euclidean distance are the same thing. Cosine *distance* is not a true metric, though: it can violate the triangle inequality.
- Two different models produce points on two different, incomparable maps. That's the root of embedding drift.

## The mail-sorting machine

Think of an embedding model as a clever mail-sorting machine. It reads a letter (your text, image, or code), and instead of filing it away, it stamps a **coordinate** on the envelope (a fixed-size vector) and pins it to a spot on an enormous map. Letters about similar things end up pinned near each other. When a query arrives, the machine stamps it the same way and looks around that spot on the map for its neighbors.

Note the thing it does *not* do: it doesn't drop letters into labeled bins. There are no bins. The map is a **continuous space**: every letter gets its own point, and "similar" simply means "nearby." (Bins come later, when we build indexes *on top of* the map to search it faster. More on that below.)

Strip the analogy away and an embedding model is just a learned function

```math
f : \text{inputs} \to \mathbb{R}^n
```

trained so that a chosen notion of similarity in the input world becomes geometric closeness in the output space. Everything else in this series follows from that one sentence.

## What survives the fold?

The envelope is small and the letter is not, so the stamping is **<u>lossy</u>**: most of the letter's detail doesn't fit into the coordinate. The part people miss is that nobody sat down and *decided* what to keep. The model isn't compressing the letter so it can be reconstructed later. It's answering a much narrower question: *where should this letter sit so that the things my training called "similar" end up nearby?*

That means what survives the fold is dictated by the **training data and objective**, not primarily by model size or vector dimension. A model trained to match questions to answers will preserve whatever helps with that (topic, intent, phrasing patterns) and discard the rest. A model trained on paraphrase pairs keeps different things than one trained on code search. A gigantic model trained on broad topical similarity will still throw away your invoice numbers, because nothing in its training ever rewarded keeping them.

Size and dimensionality do matter, since a roomier envelope *can* hold finer distinctions. But capacity only determines what the model *could* keep. Training determines what it *does* keep. (That's the whole subject of [Part 2](@/blog/0003-how-are-embeddings-trained.md).)

The practical takeaway: if your application depends on a specific signal (exact product codes, negation, rare entities), don't assume any model preserves it. Test it.

## Measuring "close"

We compare envelopes by their direction more often than their length: **<u>cosine similarity</u>** is like checking whether two envelopes have the same tilt when you hold them up to the light. In practice, most pipelines L2-normalize their vectors first, and once everything has the same length, cosine ranking and Euclidean ranking agree exactly. Same neighbors, same order. The formal section below makes this precise.

One caveat: cosine *distance* isn't a true metric, because it can break the triangle inequality. For most retrieval systems that's harmless, but some algorithms and index structures assume metric properties, and it's worth knowing when your notion of "distance" is only mostly a distance.

## Searching the map

The map is a crowded, many-dimensional place, and exact search means measuring your query against every single pin, which is slow and expensive at scale. So we build **<u>approximate nearest neighbor</u>** indexes: shortcuts that partition or graph-connect the map so we only check the most promising regions.

This is where the "bins" live: in the index, not the embedding. And it's worth being precise about how an approximate index fails: a badly tuned index doesn't confuse baking with astronomy. It just *misses*. Some true neighbors don't get checked, so recall drops. If your results are semantically bizarre, the problem is almost always the embedding (or a model mismatch), not the index.

<video src="/videos/EmbeddingVectorSpace.mp4" autoplay loop controls></video>

## So what is embedding drift?

Now we can say it precisely. Each model defines its own map. Swap the model and there are two distinct failure modes, and it pays to keep them apart:

1. **Mixing maps.** If you swap the query model but keep your old document vectors, you're comparing coordinates from two unrelated maps. The results aren't "drifted"; they're meaningless. Vectors from different models are simply not comparable.
2. **Redrawing the map.** If you re-embed your whole corpus with the new model, every comparison is valid again. But the new model kept different things when it folded, so distances shift and **neighborhoods reshuffle**. Your data didn't move; the definition of "similar" did.

The second one is what this series means by **<u>embedding drift</u>**. It's subtler and more dangerous than the first, because everything still *works* (queries return plausible results) while your carefully tuned thresholds, clusters, and "memory" layers stop meaning what they used to.

(A note on terminology: in ML monitoring, "embedding drift" often means your *data* distribution shifting over time under a fixed model. Related, but not our topic. Here the data holds still and the model moves.)

## A More Formal Look

Now let's replace the analogies with precise notation for a moment. (If you want the full tour of vector spaces, norms, and metrics, see [this post](@/blog/0001-linear-vector-spaces.md).) Write an embedding as a vector `$x \in \mathbb{R}^n$`. For two embeddings `$x$` and `$y$`, the cosine similarity is

```math
\cos(x,y) = \frac{x \cdot y}{\|x\|_2\ \|y\|_2}
```

A commonly used dissimilarity is the cosine distance, defined as `$1 - \cos(x,y)$`. If vectors are L2-normalized so that `$\|x\|_2 = \|y\|_2 = 1$`, cosine similarity reduces to the plain dot product `$x \cdot y$`, and ranking by cosine is the same as ranking by dot product.

Euclidean distance is the usual L2 metric,

```math
\|x - y\|_2 = \sqrt{\sum_{i=1}^n (x_i - y_i)^2}.
```

When vectors are unit-normalized, the squared Euclidean distance relates to cosine similarity by

```math
\|x - y\|_2^2 = 2\,(1 - x \cdot y) = 2\,(1 - \cos(x,y)).
```

This is the identity behind the earlier claim: on normalized vectors, cosine ranking and Euclidean ranking are interchangeable, which is exactly why so many pipelines normalize embeddings before indexing.

You can watch the interchangeability happen. Rank a thousand random "documents" against a query both ways:

```python
import numpy as np
rng = np.random.default_rng(0)

docs = rng.normal(size=(1000, 64))
docs /= np.linalg.norm(docs, axis=1, keepdims=True)   # L2-normalize
q = rng.normal(size=64)
q /= np.linalg.norm(q)

by_cosine = np.argsort(-(docs @ q))                       # highest similarity first
by_euclid = np.argsort(np.linalg.norm(docs - q, axis=1))  # smallest distance first
print("identical rankings:", np.array_equal(by_cosine, by_euclid))
```

<!-- output -->

All one thousand positions, not just the top hit. And if a thousand random documents feel anecdotal, the claim is small enough to *prove*. The Z3 theorem prover (`pip install z3-solver`) can verify it for every possible query and pair of documents on the unit sphere in `$\mathbb{R}^3$`: whenever `$x$` beats `$y$` on cosine, `$x$` beats `$y$` on Euclidean distance too.

```python
from z3 import Reals, And, Implies, prove

q1, q2, q3, x1, x2, x3, y1, y2, y3 = Reals("q1 q2 q3 x1 x2 x3 y1 y2 y3")
unit = lambda a, b, c: a * a + b * b + c * c == 1
dot = lambda a, b, c, d, e, f: a * d + b * e + c * f
sqd = lambda a, b, c, d, e, f: (a - d) * (a - d) + (b - e) * (b - e) + (c - f) * (c - f)

prove(Implies(And(unit(q1, q2, q3), unit(x1, x2, x3), unit(y1, y2, y3),
                  dot(q1, q2, q3, x1, x2, x3) > dot(q1, q2, q3, y1, y2, y3)),
              sqd(q1, q2, q3, x1, x2, x3) < sqd(q1, q2, q3, y1, y2, y3)))
```

<!-- output -->

No counterexample exists. On normalized vectors, the two rankings cannot disagree, ever.

Let `$d(x, y)$` be a distance function between vectors `$x$` and `$y$`. The requirements for a **metric** are:

1. **Non-negativity**: for all `$x, y$`, `$d(x, y) \ge 0$`.
2. **Identity of indiscernibles**: `$d(x, y) = 0$` if and only if `$x = y$`.
3. **Symmetry**: `$d(x, y) = d(y, x)$`.
4. **Triangle inequality**: for all `$x, y, z$`, `$d(x, z) \le d(x, y) + d(y, z)$`.

Cosine distance `$1 - \cos(x, y)$` can fail the triangle inequality, so it's not a true metric. If you need one on directions, the angular distance `$\arccos(\cos(x, y))$` *is* a proper metric on the unit sphere. But for ranking neighbors, plain cosine is almost always what you want.

## Closing Thoughts

An embedding model is a learned way of folding the world into a fixed-size vector and declaring that "things that land close together are similar enough." The fold is lossy, and the choice of what survives isn't made by anyone in particular; it's the frozen residue of the training data and objective.

Cosine similarity, Euclidean distance, and the metric axioms are just different ways of turning those vectors into a notion of "near" and "far." On normalized vectors the first two agree; what matters is being consistent and knowing the trade-offs when you normalize, rank, or cluster.

And embedding drift is what happens when you redraw the map. The documents didn't move, but the rules for what counts as "similar" did, so neighborhoods reshuffle. Sometimes that's an improvement; sometimes it breaks your retrieval or memory layer without any error showing up.

So the natural next question is: where does a model's sense of "similar" actually come from? In the next post we look at how these machines are trained, and why training choices are exactly what makes two model versions disagree: [Part 2 - How are they trained?](@/blog/0003-how-are-embeddings-trained.md)
