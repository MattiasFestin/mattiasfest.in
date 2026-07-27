+++
title = "Embedding drift: Part 1 - What is an embedding?"
date = 2025-11-26
description = "Embedding models are lossy mail-sorting machines: what embeddings are, how cosine and Euclidean distance compare, and why swapping the model reshuffles your neighborhoods."

[extra]
tags = ["llm", "embeddings", "retrieval", "mixture-of-experts", "testing", "ai"]
categories = ["Research Notes"]
+++

If you’ve ever upgraded an embedding model and opened your search results only to find your app suddenly behaving like a forgetful librarian who insists that every book about 'baking' actually belongs in 'astronomy', you’ve run into **<u>embedding drift</u>**.

Think of an embedding model as a clever mail-sorting machine. It reads a letter (your text, image, or code), folds the important bits into a tiny envelope (a fixed-size vector), and drops it into a bin that represents where similar letters live. When you later drop in a query, the machine quickly tries to find envelopes in the same bin.

The trick is that the envelope is a **<u>lossy compression</u>** — somebody had to decide what to keep and what to throw away. If you train a bigger, fancier sorter (more model parameters, higher-dimensional vector spaces), it'll remember subtler details: the stamp color, the handwriting quirks, maybe even that the letter mentions 'sourdough starter' and 'oven temperature'. A smaller, thrift-store sorter compresses ruthlessly — it keeps the general topic but loses the punctuation and the exact numbers.

We compare envelopes by their direction more often than their absolute size; **<u>cosine similarity</u>** is like checking whether two envelopes have the same tilt when you hold them up to the light. Sometimes the geometry of the space surprises you: two envelopes might both point in similar directions without the tidy triangle-like relationships textbooks promise. For many practical systems that's fine, but if you need strict distance rules you reach for Euclidean-style measures instead.

The embedding **<u>search space</u>** is a crowded, many-dimensional neighborhood. Exact searching here is like asking every house on the block if they have a copy of your letter — slow and expensive. So we use clever shortcuts (approximate indexes) that let us knock on the most promising doors first. These shortcuts are tuned to the kind of similarity we care about; tune them wrong and your favorite bakery recommendations will point you to a physics paper instead.

<video src="/videos/EmbeddingVectorSpace.mp4" autoplay loop controls></video>

Because embeddings are lossy, swapping to a new sorting machine can subtly change which features are preserved. That's the essence of **<u>embedding drift</u>**: your system's memory changes not because your data did, but because the machinist swapped the rules for what counts as important.

The kinds of details that survive the compression depend on model choices. Bigger models and higher-dimensional vectors tend to keep finer-grained signals like nuanced tone, rare entities, and sometimes precise numeric cues. Smaller models generally prioritize broad topic and tone and drop surface details like punctuation or exact phrasing. Which bits matter depends on your use case: if your app needs exact invoice numbers, test whether the embedding preserves them; if you are clustering themes for a newsletter, a compact model might be perfectly lovely.

## A More Formal Look

Now let's step up the complexity and replace the analogies with precise notation and equations for a moment. Write an embedding as a vector `$x \in \mathbb{R}^n$` where `$n \in \mathbb{N}$`. For two embeddings `$x$` and `$y$`, the cosine similarity is defined as

```math
\cos(x,y) = \frac{x \cdot y}{\|x\|_2\ \|y\|_2}
```

A commonly used dissimilarity is the cosine distance, defined as `$1 - \cos(x,y)$`. Note that if vectors are L2-normalized so that `$\|x\|_2 = \|y\|_2 = 1$`, then cosine similarity reduces to the simple dot product `$x \cdot y$` and ranking by cosine is equivalent to ranking by dot product.

Euclidean distance is the usual L2 metric,

```math
\|x - y\|_2 = \sqrt{\sum_{i=1}^d (x_i - y_i)^2}.
```

When vectors are unit-normalized the squared Euclidean distance relates to cosine similarity by

```math
\|x - y\|_2^2 = 2\,(1 - x \cdot y) = 2\,(1 - \cos(x,y)).
```

This shows the practical interchangeability of cosine ranking and Euclidean ranking on normalized vectors, and it also explains why many pipelines normalize embeddings before indexing.

Let `$d(x, y)$` be a distance / metric function between vectors `$x$` and `$y$`.

The requirements for a metric are:

1. **Non-negativity**: For all vectors `$x, y$`, the distance `$d(x, y) \ge 0$`.
2. **Identity of indiscernibles**: For all vectors `$x, y$` the distance `$d(x, y) = 0$` if and only if `$x = y$`.
3. **Symmetry**: For all vectors `$x, y$` the distance `$d(x, y) = d(y, x)$`.
4. **Triangle inequality**: For all vectors `$x, y, z$` the distance `$d(x, z) \le d(x, y) + d(y, z)$`.

In particular, the usual cosine distance `$1 - \cos(x, y)$` can fail the triangle inequality, so it’s not a true metric.

## Closing Thoughts

If we strip away the analogies, an embedding model is just a learned way of folding the world into a fixed-size vector and declaring that “things that land close together are similar enough.” The envelope is a lossy compression: some details survive, some are thrown away, and those choices depend on model size, training, and the data you cared about.

Cosine similarity, Euclidean distance, and the metric conditions are just different ways of turning those vectors into a notion of “near” and “far.” Whether you compare tilt or true distance matters less than being consistent about what you use and understanding the trade-offs when you normalize, rank, or cluster in that space.

Embedding drift is what happens when you change the sorter. The documents didn’t move, but the rules for what counts as “similar” did, so neighborhoods get reshuffled. Sometimes that’s an improvement, sometimes it quietly breaks your retrieval, routing, or “memory” layer.

In the next post we'll stay with this picture and look at how these machines are trained in the first place — and why training choices are exactly what makes two model versions disagree: [Part 2 - How are they trained?](@/blog/0003-how-are-embeddings-trained.md)
