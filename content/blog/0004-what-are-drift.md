+++
title = "Embedding drift: Part 3 - Drift is an API break, versioning embedding spaces"
date = 2025-11-29
description = "Upgrading an embedding model changes the coordinate system of your memory layer. Treat it like the API break it is: drift metrics that actually mean something, shadow testing, canary rollouts, and a Procrustes compatibility bridge."

[extra]
tags = ["llm", "embeddings", "retrieval", "mixture-of-experts", "testing", "ai"]
categories = ["Research Notes"]
+++

*This is Part 3 of a series on embedding drift. [Part 1](@/blog/0002-what-are-embeddings.md) covered what embeddings are, [Part 2](@/blog/0003-how-are-embeddings-trained.md) how they're trained.*

The upgrade looks like a one-line diff: `embedding_model: v2`. No schema change, no code change, tests are green. And yet next morning your app is Part 1's forgetful librarian: shelving baking books under astronomy, retrieving last quarter's memo for this quarter's question, deduplicating documents that were never duplicates.

Nothing in your code changed. But you didn't change a config value; you changed the coordinate system of your product's memory. This post is about treating that with the ceremony it deserves.

**TL;DR**

- A stored embedding is a promise: *these coordinates mean something in this model's map*. Swapping the model breaks that promise for every vector you've persisted. It's a **breaking change to a public interface**, and your version number should say so.
- The "interface" is the whole **embedding pipeline** (weights, pooling, instruction prefixes, normalization, chunking), not just the model name. Any change to any of it is a new version.
- Measure drift at three levels: **geometry** (did the map change shape?), **behavior** (did neighbors change?), **outcomes** (did answers change?). Only the last one pays the bills, and naive geometric metrics are actually *invalid* across model swaps, courtesy of Part 2's rotation argument.
- Roll out like any API migration: **dual-write, shadow-read, canary, rollback**. And recalibrate every hardcoded similarity threshold; absolute cosine values do not transfer between models.
- The rotation argument also gives you a tool: a learned **linear bridge** (orthogonal Procrustes) from old space to new can smooth migrations for a surprisingly low price.

## The contract you didn't know you published

If your system stores embeddings, your embedding function is a contract:

- You persist `$z = E_v(x)$`, where `$E_v$` is embedding pipeline version `$v$`.
- Retrieval, clustering, dedup, routing, and "memory" all consume nearest-neighbor structure in that `$z$`-space.

Every vector in your index is a callback into `$E_v$`. When you upgrade `$E_v \to E_{v+1}$`, every one of those stored promises is void: the coordinates still *parse* (same dtype, maybe even same dimension), but they no longer *mean* anything in the new map. In software terms: same wire format, different semantics. The most dangerous kind of break, because nothing crashes.

One sharpening that saves real-world pain: **the version is the pipeline, not the model.** All of these produce a different `$E$`, and each deserves a version bump:

- model weights (obviously), but also
- **pooling** strategy (mean vs. CLS vs. last-token),
- **instruction prefixes** (`query:` / `passage:`; embedding without the prefix the model was trained with is a silent version change),
- **normalization** (did you L2-normalize before storing, or not?),
- **chunking and truncation** rules (different chunks are literally different inputs),
- tokenizer or preprocessing changes.

Teams that version "the model" get burned by everything else on that list. Hash the pipeline config; store it next to every vector.

## Minimal formalization

Just enough notation to make the metrics precise. The pipeline is a map (in both senses):

```math
E_v : X \to \mathbb{R}^{d_v}, \qquad z_v(x) = E_v(x),
```

retrieval scores by cosine similarity,

```math
\operatorname{sim}(a, b) = \frac{a \cdot b}{\|a\|\,\|b\|},
```

and behavior depends on top-k neighbor sets `$N_v^k(x)$`. Drift matters exactly when `$N_v^k(x) \ne N_{v+1}^k(x)$`: different retrieved context means different answers, different memory recall means different downstream decisions. The vectors are an implementation detail; the neighbor structure is the API.

## What to measure

Three levels, from cheap-and-weak to expensive-and-decisive. You want all three, but never confuse which level a number lives at.

### Level 1: geometry - did the map change shape?

There is a trap the rotation argument from [Part 2](@/blog/0003-how-are-embeddings-trained.md) sets for the unwary. The obvious metric is *anchor cosine drift*: pick a fixed anchor set `$A$` and average `$\cos(z_v(x),\, z_{v+1}(x))$` over it. But that compares coordinates **across two different maps**, and we know two runs can encode the *same* relative geometry in arbitrarily rotated coordinate systems. For a genuine model swap, anchor cosine can read near zero while retrieval behavior is nearly unchanged, or read high while behavior breaks. Use it only for incremental retrains of the *same* space lineage (continued fine-tuning of `$v$`), where coordinates are actually comparable.

The geometric metric that *is* valid across spaces compares relative structure: **second-order drift**. Sample anchor pairs `$(x, y)$` and compare each space's own opinion of them:

```math
\operatorname{drift}_{2^{nd}} = 1 - \operatorname{corr}\Bigl(\;\cos\bigl(z_v(x), z_v(y)\bigr),\;\; \cos\bigl(z_{v+1}(x), z_{v+1}(y)\bigr)\;\Bigr)
```

Each cosine is computed *within* one space, so no cross-map comparison ever happens; you're asking whether the two models *agree about which things are similar*, which is rotation-proof and the question you actually care about. (This is the small-scale cousin of representation-similarity measures like CKA.)

{{ manim(file="0004-anchor-cosine-lies", title="Sixty unit vectors on a circle embedded by two models, measured first by anchor cosine and then by a scatter of the two maps' own pairwise cosines", step_one="Model v puts the corpus on the ring in blue and the retrain puts the same corpus down in gold, turned by a quarter turn with a little per-item disagreement on top — the situation Part 2 says every retrain lands you in.", step_two="The red chords are the per-item displacement that anchor cosine averages over, and it reads +0.013: by that number the two models have nothing whatsoever to do with each other.", step_three="Ask each map about the same pairs instead and every sample lands on the diagonal, corr = 0.946 — no cosine in that scatter ever crossed from one map to the other.", caption="Both numbers are measured from the same two sets of points. Anchor cosine compares coordinates across two maps and reads near zero; second-order drift compares each map's own opinion of the same pairs and sees a model that barely changed its mind.") }}

### Level 2: behavior - did the neighbors change?

For each anchor, compare the retrieved sets directly:

```math
\text{stability@}k(x) = \frac{\bigl|N_v^k(x) \cap N_{v+1}^k(x)\bigr|}{k},
```

averaged over `$A$`. This is the workhorse: cheap to compute offline against both indexes, and it measures the thing your application actually consumes. Low stability@k means your RAG context, dedup decisions, and memory recalls are about to change wholesale. If ordering matters to you (it usually does; the top slot feeds the prompt first), also check a rank-weighted variant so that swapping neighbors 1 and 10 doesn't score the same as a stable list.

One more behavioral landmine: **absolute thresholds**. Every hardcoded number of the form "similarity above 0.9 means duplicate" or "below 0.35 means no match, refuse to answer" was calibrated to `$E_v$`'s score distribution. Model families differ wildly in how they spread cosine values: some cluster everything in `[0.6, 0.9]`, others use the whole range. Recalibrate every threshold against `$E_{v+1}$` on a labeled sample, or watch perfectly good retrieval get vetoed by a stale constant.

{{ manim(file="0004-neighbors-are-the-api", title="One query's ten nearest neighbours listed before and after a model upgrade, then a histogram of every pair cosine sliding under a fixed duplicate threshold", step_one="The ranked list under v is read straight off the ring; after the upgrade seven of those ten items survive and three are new, so stability@10 for this query is 0.70 against a corpus average of 0.745.", step_two="The histogram is every pair in the corpus scored by model v, with the hardcoded “above 0.90 is a duplicate” rule cutting off 18% of them.", step_three="Swap in a model family that packs the same corpus into a much narrower range and the same untouched rule now flags 63% of all pairs.", caption="The neighbour list, not the vector, is what your RAG context and your dedup actually consume — and every constant sitting on top of it was calibrated against one model's score distribution.") }}

One simulation shows the Level 1 trap and the Level 2 truth together. Fake a "v+1" by rotating v's space (Part 2's argument says this is realistic) and adding a little genuine disagreement:

```python
import numpy as np
rng = np.random.default_rng(0)
unit_rows = lambda M: M / np.linalg.norm(M, axis=1, keepdims=True)

z_v = unit_rows(rng.normal(size=(2000, 64)))                  # "model v"
Q, _ = np.linalg.qr(rng.normal(size=(64, 64)))
z_v1 = unit_rows(z_v @ Q + 0.02 * rng.normal(size=z_v.shape))  # "v+1": rotated + real drift

anchors = np.arange(500)

# Level 1, the trap: anchor cosine across the two maps
print(f"anchor cosine:      {np.mean(np.sum(z_v[anchors] * z_v1[anchors], axis=1)):.3f}")

# Level 1, done right: second-order drift (each cosine computed within one map)
pairs = rng.choice(2000, size=(1000, 2))
s_v = np.sum(z_v[pairs[:, 0]] * z_v[pairs[:, 1]], axis=1)
s_v1 = np.sum(z_v1[pairs[:, 0]] * z_v1[pairs[:, 1]], axis=1)
print(f"second-order corr:  {np.corrcoef(s_v, s_v1)[0, 1]:.3f}")

# Level 2: stability@10
k, overlaps = 10, []
for i in range(100):
    nv = np.argsort(-(z_v @ z_v[i]))[1:k + 1]
    nv1 = np.argsort(-(z_v1 @ z_v1[i]))[1:k + 1]
    overlaps.append(len(set(nv) & set(nv1)) / k)
print(f"stability@10:       {np.mean(overlaps):.3f}")
```

<!-- output -->

Anchor cosine reads near zero, as if the models were unrelated. The rotation-proof metrics tell the real story: the two models agree almost entirely about which things are similar, and about 7 of every top-10 neighbors survive the upgrade. Trust the wrong metric and you'd either panic over nothing or, in the mirror-image case, ship a break that anchor cosine happened to miss.

### Level 3: outcomes - did the product change?

The one that matters. Maintain a regression suite of end-to-end scenarios:

- questions with their expected source documents,
- queries with their relevant doc IDs,
- user journeys with pass/fail criteria.

Run the *whole system* under `$v$` and `$v{+}1$` and diff: answer correctness, cited-source overlap, tool/expert call patterns, latency and cost. Geometry and behavior metrics tell you *where to look*; only task-level deltas tell you whether the upgrade is a regression, a wash, or the improvement the model card promised. Drift isn't inherently bad; the new map is usually better on average. The suite is how you find the segments where "on average" hides "worse for you."

## Rolling it out: boring on purpose

The playbook is the same one we already trust for API migrations.

1. **Dual-write.** On ingestion, compute and store both `$z_v(x)$` and `$z_{v+1}(x)$`. Yes, that's double embedding compute and double vector storage. For the migration window, not forever. For the backlog, re-embed in priority order (hot documents first) rather than all-at-once; a lazy "re-embed on next read" strategy can spread the cost further.
2. **Shadow-read.** Serve production from `$v$`; in the background, run the same retrievals against `$v{+}1$` and log the comparisons: stability@k, would-have-retrieved sources, downstream answer deltas on sampled traffic. This is where the Level 2 and Level 3 metrics stop being estimates and become measurements of *your* workload.
3. **Canary.** Route a small slice of traffic to `$v{+}1$` end-to-end. Watch the regression suite metrics plus the product metrics that no offline suite captures. Roll back on regression, which is trivial because `$v$`'s index is still live.
4. **Retire `$v$`** only when the canary holds and the backlog is re-embedded. Then delete the old vectors; don't leave a mixed-version index lying around for someone to query into nonsense.

This turns "pray and reindex" into a measured rollout with an undo button.

## The compatibility bridge

Sometimes you can't dual-write: the corpus is too big, ingestion is out of your control, or you're stuck serving old clients that embed with `$E_v$`. Part 2's rotation argument suggests a remarkable escape hatch: if a large share of the difference between two spaces is *same relative geometry, different orientation*, then a **linear map** should recover most of the compatibility. Learn `$W$` on an anchor set:

```math
W = \operatorname*{arg\,min}_W \sum_{x \in A} \bigl\| W z_v(x) - z_{v+1}(x) \bigr\|^2.
```

This is plain least squares, and it handles dimension changes (`$d_v \ne d_{v+1}$`) for free. If dimensions match and you constrain `$W$` to be a rotation (which is exactly the transformation family training leaves undetermined), the problem is **orthogonal Procrustes** and has a closed-form solution: stack the anchors into matrices `$Z_v, Z_{v+1}$`, take the SVD `$Z_v^\top Z_{v+1} = U \Sigma V^\top$`, and set `$W = U V^\top$`. No training loop, one linear-algebra call, and the constraint acts as regularization against overfitting the anchor set.

Then old-model queries can search the new index: embed with `$E_v$`, map through `$W$`, retrieve in `$v{+}1$`-space.

{{ manim(file="0004-the-procrustes-bridge", title="Old-model vectors searching a new index, before and after a single orthogonal Procrustes rotation fitted on twenty anchors", step_one="An old query vector dropped straight into the new index retrieves whatever happens to sit where its old coordinates point: stability@10 of 0.003, which is what mixing maps looks like in numbers.", step_two="Twenty anchors, one SVD, and the whole old map turns into place — the live readout climbs from +0.013 to +0.977 mean cosine, and the recovered angle is +89.2° against a map that was turned 90°.", step_three="Bridged retrieval reaches 0.845, and the red chords are what one rotation cannot reach: 9 of the 60 items still disagree by more than 18°.", caption="The bridge recovers the part of the change that was only orientation, in closed form and with no training loop. What survives it is genuine disagreement, and that is exactly the part you upgraded the model for.") }}

Continuing the simulation from above, build the bridge and measure what it buys:

```python
# without the bridge: old queries against the new index
no_bridge = []
for i in range(100):
    nb = np.argsort(-(z_v1 @ z_v[i]))[1:k + 1]
    nv1 = np.argsort(-(z_v1 @ z_v1[i]))[1:k + 1]
    no_bridge.append(len(set(nb) & set(nv1)) / k)
print(f"stability@10, no bridge:  {np.mean(no_bridge):.3f}")

# the Procrustes bridge: one SVD on the anchor set
U, _, Vt = np.linalg.svd(z_v[anchors].T @ z_v1[anchors])
W = U @ Vt
print(f"cosine after bridge:      {np.mean(np.sum((z_v @ W) * z_v1, axis=1)):.3f}")

bridged = []
for i in range(100):
    nb = np.argsort(-(z_v1 @ (z_v[i] @ W)))[1:k + 1]
    nv1 = np.argsort(-(z_v1 @ z_v1[i]))[1:k + 1]
    bridged.append(len(set(nb) & set(nv1)) / k)
print(f"stability@10 via bridge:  {np.mean(bridged):.3f}")
```

<!-- output -->

Without the bridge, cross-space search returns essentially random results (0.003 is what "mixing maps" looks like in numbers). One SVD later, old vectors land within a whisker of their new-space positions and recover most of the retrieval behavior. The gap that remains, from 0.813 to a perfect 1.0, is the genuine disagreement the noise term injected; that's the part no rotation can undo.

The limits: the bridge recovers the part of the change that is orientation, and *approximates* the rest. Where the models genuinely disagree about relative geometry (the new model learned distinctions the old one never made), no linear map can help, and those are often precisely the neighborhoods you upgraded for. Measure the bridge with the same stability@k and task-level metrics as any other candidate. It's a migration smoother, not a permanent adapter: budget its retirement from day one.

## Why this compounds in modular and MoE-style systems

In modular architectures (Mixture-of-Experts routing patterns, agent systems with tool selection, anything with a gating step), retrieval output feeds *decisions*, not just prompts. Retrieval fills the context, the context influences the router or gate, the router picks a different expert or tool, and the entire computation path changes.

A drift that would cause a mild relevance dip in a flat RAG system becomes a **discrete behavioral fork** here: one reshuffled neighbor flips a routing decision, and now two "identical" requests take different paths through your system. Embedding drift graduates from a retrieval-quality issue to **system-level nondeterminism**, unless the embedding version is pinned, measured, and rolled out like the interface it is.

## The upgrade playbook

The whole post as a checklist:

- [ ] **Version the pipeline**, not the model: weights, pooling, prefixes, normalization, chunking. Store the version with every vector.
- [ ] **Never mix versions** in one index or one comparison. (Part 2 proved this is meaningless, not just risky.)
- [ ] Build an **anchor set** and a **task-level regression suite** before you need them.
- [ ] On upgrade: **second-order drift** for geometry, **stability@k** for behavior, **task deltas** for truth.
- [ ] **Recalibrate every similarity threshold** against the new model.
- [ ] Roll out via **dual-write, shadow-read, canary, retire**, with rollback live until the end.
- [ ] Consider a **Procrustes bridge** for the migration window; measure it like any candidate; plan its retirement.

## Closing thoughts

The through-line of this series: an embedding model is a frozen judgment about what counts as "similar" ([Part 1](@/blog/0002-what-are-embeddings.md)); that judgment is manufactured from training pairs and objectives, down to a coordinate system that even the training run itself doesn't control ([Part 2](@/blog/0003-how-are-embeddings-trained.md)); and therefore swapping the model rewrites a public interface of your system. Silently, with the wire format intact.

Nothing here is exotic. Version the interface, measure the break at the level that matters, roll out with an undo button, bridge where you must. It's the same discipline we already apply to every other contract in production, extended to the one contract most systems never wrote down. Do that, and "upgrade the embedding model" stops being a scary ticket and becomes what it should have been all along: a routine migration.

## Further reading

- Schönemann, *A generalized solution of the orthogonal Procrustes problem* (1966): the closed-form bridge.
- Shen et al., *Towards Backward-Compatible Representation Learning* (2020): training new models to be compatible with old indexes, the industrial-strength cousin of the bridge.
- Webber, Moffat, Zobel, *A Similarity Measure for Indefinite Rankings* (RBO, 2010): rank-aware neighbor-list comparison.

### Visual guide

- **3Blue1Brown, ["Change of basis"](https://www.3blue1brown.com/lessons/change-of-basis) (2016)**: a visual explanation of how the same vector can have different coordinates under different bases, useful context for this post's incompatible-embedding-space and linear-bridge discussion.
