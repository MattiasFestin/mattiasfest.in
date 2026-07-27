+++
title = "Embedding drift: Part 2 - How are they trained?"
date = 2025-11-27
description = "Where embedding models get their sense of similar: training data, contrastive losses like InfoNCE, dual- vs cross-encoders, and the small choices that shape the geometry of the space."

[extra]
tags = ["llm", "embeddings", "retrieval", "mixture-of-experts", "testing", "ai"]
categories = ["Research Notes"]
+++

*This is Part 2 of a series on embedding drift. [Part 1](@/blog/0002-what-are-embeddings.md) covered what embeddings are.*

## Training an embedding model 💪

Training an embedding model is both craft and tuning — more like sculpting than flipping a switch. You begin with data, and the shape of that data strongly biases the final space: paired examples of queries and relevant passages, duplicate documents, paraphrase sets, or weak signals like co-clicks and session proximity. Those examples define what "close" should mean for your system.

At the foundation-model scale, the raw material is usually a giant scrape of the public web plus a few curated sources. Think of ingredients like:

- **Common Crawl** and similar large web snapshots  
- **Wikipedia**, project documentation, and other clean reference-style corpora  
- **Books / articles** (BookCorpus, news datasets, academic papers)  
- For multimodal models, image–text datasets (e.g. LAION-style) that tie text to visuals  

That mix trains a very general notion of “semantic similarity”: sentences about the same topic, paraphrases, matching titles and bodies, linked pages, and so on. But it also bakes in the biases and blind spots of that data: a web-scale embedding is great at “online knowledge” and casual text, and much worse at your internal ticket tags, invoice formats, or proprietary jargon.

For production systems you almost always layer **domain data** on top: support tickets, search logs, query–click pairs, FAQ pairs, internal docs. These examples define what *your* product considers “similar”: which document actually answered the question, which results users clicked, which items belong in the same category.

---

At the algorithmic center is a **contrastive signal**: show the model a target that should be nearby and many others that should be distant, then nudge the model to rearrange the space accordingly. A widely used objective is contrastive learning, where the model is encouraged to pull *positive* pairs together and push *negative* pairs apart.

One practical and popular contrastive loss is **InfoNCE**. For a query embedding `$q$` and a set containing one positive `$p$` and many negatives `$\{n_i\}$`, the loss is often written as:

```math
\mathcal{L}_{\text{InfoNCE}} = -\log
\frac{\exp(q \cdot p / \tau)}
     {\exp(q \cdot p / \tau) + \sum_i \exp(q \cdot n_i / \tau)}.
```

Here the dot denotes a similarity (often a dot product on L2-normalized embeddings), and `$\tau$` is a **temperature** hyperparameter that sharpens or smooths the distribution. Smaller `$\tau$` makes the model focus more strongly on the very top similarities; larger `$\tau$` spreads the focus out.

In practice, implementations rarely hand-pick every negative. Instead they use **in-batch negatives**: everything else in the batch becomes a negative example for the current query. This makes training efficient and encourages the model to separate many examples at once. To go beyond "easy" negatives, engineers often add **hard negatives** that are close under the current model but actually wrong, so the model learns finer distinctions.

---

Architecturally, you usually choose between:

- **Dual-encoders** (bi-encoders):  
  Separate encoders for query and document. They independently map inputs to vectors, which makes retrieval fast because you can pre-compute and index document embeddings. This is the standard choice for large-scale search and retrieval systems.

- **Cross-encoders**:  
  A single model that processes the query and candidate document together (e.g., concatenated). They typically give stronger relevance scores but are much slower, because you must run the model for each query–document pair.

A common workflow is:

1. Train a **dual-encoder** with contrastive objectives on large-scale data (web + logs) to get a fast retrieval model.
2. Train or fine-tune a **cross-encoder** for higher-accuracy scoring on top-k candidates.
3. Use the cross-encoder as a **reranker**, or as a **teacher** during distillation to transfer some of its finer judgments back into the dual-encoder.

---

Small but impactful choices shape the geometry you end up with:

- Whether you **L2-normalize** embeddings before computing similarities.
- How you sample or generate **negatives** (random, in-batch, mined, adversarial).
- The value of **`$\tau$`**, which controls how aggressively the model distinguishes top matches.
- **Batch size**, which affects how many negatives each query sees.
- The **curriculum** for adding hard negatives (when and how you introduce them).

On top of that, real-world data brings its own surprises: label noise, class imbalance, domain shifts. Models trained only on generic web text often ignore domain-specific signals (like invoice numbers, product codes, or internal taxonomy) unless you **fine-tune with in-domain examples**. Engineers will often combine multiple loss terms—contrastive objectives plus supervised classification loss, for example—to retain different kinds of signal in the same embedding.

The result is that an embedding model is never “just a model”: it is the frozen judgement of your architecture, data, objective, and training tricks about what counts as "similar". When you retrain or swap models, you're effectively asking a new sculptor, with new raw material, to re-carve the space.

And that's exactly why upgrades hurt: two sculptors never carve the same statue. In [Part 3](@/blog/0004-what-are-drift.md) we treat that as what it really is — an API break — and look at how to measure and manage it.
