+++
title = "Embedding drift: Part 3 - Drift is an API break, versioning embedding spaces"
date = 2025-11-29
description = "Upgrading an embedding model changes the coordinate system of your memory layer. Treat it like an API break: drift metrics, shadow testing, canary rollouts, and compatibility mappings."

[extra]
tags = ["llm", "embeddings", "retrieval", "mixture-of-experts", "testing", "ai"]
categories = ["Research Notes"]
+++

*This is Part 3 of a series on embedding drift. [Part 1](@/blog/0002-what-are-embeddings.md) covered what embeddings are, [Part 2](@/blog/0003-how-are-embeddings-trained.md) how they're trained.*

## The core issue: embedding drift is an API break

If your system stores embeddings, your embedding function is effectively a contract:

- You store `$z = E_v(x)$`, where `$E_v$` is embedding model version `$v$`
- Retrieval depends on nearest neighbors in that `$z$`-space

When you upgrade `$E_v \to E_{v+1}$`, you did not “just upgrade a model”.

You changed the coordinate system of your memory and retrieval layer.

In software engineering terms:
**you changed a public interface**.

---

## Minimal formalization (just enough math)

We represent an item `$x$` with an embedding vector:

- `$E_v : X \to \mathbb{R}^d$`
- `$z_v(x) = E_v(x)$`

Retrieval typically uses cosine similarity:

```math
\operatorname{sim}(a, b) = \frac{a \cdot b}{\|a\|\,\|b\|}
```

Drift matters because **nearest neighbors can change**:
- `$N_v^k(x)$` (top-k neighbors under `$v$`)
- `$N_{v+1}^k(x)$` (top-k neighbors under `$v+1$`)

If those differ, your system’s behavior changes:
- different retrieved context → different answers
- different “memory recall” → different decisions downstream

---

## What to measure (practical drift metrics)

You want metrics that track **behavior**, not just geometry.

### 1) Anchor cosine drift (sanity check)
Pick a fixed anchor set `$A$` (a few thousand representative items).

Compute:

```math
\operatorname{drift}_{\cos} = 1 - \frac{1}{|A|} \sum_{x \in A} \cos\bigl(z_v(x),\, z_{v+1}(x)\bigr)
```

This catches “the space moved”, but doesn’t always predict “the app broke”.

### 2) Neighbor stability@k (retrieval behavior)
For each anchor `$x$`:

```math
\text{stability@}k(x) = \frac{|N_v^k(x) \cap N_{v+1}^k(x)|}{k}
```

then average over `$A$`.

If stability is low, your RAG and memory will change a lot.

### 3) Task-level delta rate (the one that matters)
Pick a regression suite:
- questions → expected sources
- or queries → relevant doc ids
- or user scenarios → pass/fail criteria

Then compare the system output under `v` vs `v+1`:
- answer correctness
- cited sources overlap
- tool/expert call patterns
- latency/cost changes

---

## Shadow testing: dual-run embedding upgrades safely

A safe rollout pattern is basically what we already do with API migrations:

1. **Dual-write embeddings**
   - On ingestion, compute and store both:
     - `$z_v(x)$` and `$z_{v+1}(x)$`

2. **Shadow-read retrieval**
   - Serve production using `v`
   - In the background, also retrieve using `v+1`
   - Log comparisons:
     - neighbor stability
     - which sources would have been retrieved
     - downstream answer deltas

3. **Promote with canary**
   - Route a small percentage of traffic to `v+1`
   - Monitor regressions and rollback quickly if needed

This turns embedding upgrades from “pray and reindex” into “measured rollout”.

---

## A compatibility bridge (optional but powerful)

If you can’t dual-store forever, one trick is learning a mapping from old space to new space.

Learn `$W$` such that `$W z_v(x) \approx z_{v+1}(x)$` for anchors `$x \in A$`.

A simple (often surprisingly useful) first attempt is a linear map:

```math
W = \operatorname*{arg\,min}_W \sum_{x \in A} \bigl\| W z_v(x) - z_{v+1}(x) \bigr\|^2
```

Then you can:
- embed queries with the old model
- map `$z_v(\text{query})$` through `$W$`
- search in a `v+1` index

It’s not perfect, but it can smooth migrations and reduce “all-at-once” re-embedding pressure.

---

## Why this matters even more in Mixture-of-Experts (MoE) style systems

In modular systems (including MoE-style routing patterns), you often have:
- a **gating / routing mechanism** that decides which specialist to use
- a **retrieval/memory layer** that feeds context into specialist computation

If retrieval changes due to embedding drift, then:
- your context changes,
- which can change routing decisions,
- which can change the whole computation path.

So embedding drift becomes **system-level nondeterminism** unless you manage it deliberately.

---

## Closing thoughts

The through-line of this series: an embedding model is a frozen judgement about what counts as "similar" ([Part 1](@/blog/0002-what-are-embeddings.md)), that judgement comes from data and training choices ([Part 2](@/blog/0003-how-are-embeddings-trained.md)), and changing it changes a public interface of your system. Version it, measure it, and roll it out like the API break it is — and “upgrade the embedding model” stops being a scary ticket.
