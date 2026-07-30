+++
title = "From lines to language models: Part 6 - Attention is dot products all the way down"
date = 2026-09-04
description = "\"The trophy would not fit in the suitcase because it was too ___\": the next token depends on what 'it' refers to, and no fixed window can know that, because relevance depends on content, not position. Attention is the fix, built from machinery this series already owns: relevance is a query·key dot product, softmax over positions is the weighted opinion poll made literal, and the 1/√d scale is a temperature. Stack attend-then-think blocks, put Part 5's softmax head on top, and you own the whole transformer."

[extra]
linkedin = "Part 6 of From lines to language models: attention is dot products all the way down. Every position publishes a key, emits a query, offers a value; relevance is an inner product, softmax over positions is a literal weighted poll, and 1/√d is just a temperature. Stack attend-then-think blocks and you own the whole transformer."
tags = ["ml", "llm", "attention", "transformers", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 6 of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) built the weighted opinion poll `$w \cdot x + b$`; [Part 2](@/blog/0006-classification-vs-regression.md) ordered us to ship probabilities and decide late; [Part 3](@/blog/0007-logistic-regression.md) derived softmax + cross-entropy, the machine to remember. [Part 4](@/blog/0008-from-neuron-to-network.md) stacked voters into a committee whose hidden layers redraw the map. [Part 5](@/blog/0009-llms-are-classifiers.md) showed the head of GPT is Part 3 with a bigger K, watched a bigram model babble word-shaped noise, and left a promissory note: the context vector `$h$` needs a mechanism that gathers from* all *previous tokens, weighted by relevance. This deep into a series about dot products, the answer will not surprise you.*

Another blank, and a harder one than Part 5's:

> The trophy would not fit in the suitcase because it was too ___

You said "big." Now change one earlier word (*suitcase* stays, but make it "the trophy would not fit in the suitcase because it was too **small**"), and suddenly "it" means the *suitcase*. Same position, same syntax, opposite referent. To predict the token after "too", the model must **fetch information from the right earlier word**, and which word is right depends on *content* (trophies are big-when-problematic, suitcases are small-when-problematic), not on *position*. "It" is not always four tokens after its noun. Part 5's fixed window is structurally incapable of this: a window is an appointment book, and relevance doesn't keep appointments. What we need is **content-based lookup**: let every position ask a question of everything before it and pull in whatever answers best.

You already own the tool that scores "answers best." It's the inner product from [the vector-space post](@/blog/0001-linear-vector-spaces.md), and this whole post is that one operation, promoted to architecture.

**TL;DR**

- **Attention is a soft dictionary lookup.** Each position publishes a **key** (what I contain), emits a **query** (what I'm looking for), and offers a **value** (what I'll contribute if chosen). Relevance = `$q \cdot k$`: the dot product from the vector-space post, now deciding *what to look at* instead of *what's similar*.
- The formula assembles itself: dot-product scores, scaled by `$1/\sqrt{d_k}$`, softmax over positions (**a weighted opinion poll over the context, literally**), then output = Σ weights · values. Dot products of random `$d$`-dim vectors have variance `$d$`, which a demo below proves, so that scale is really a **temperature**, the same knob from Parts 3 and 5.
- **Causal masking**: set future scores to `$-\infty$`, softmax makes them weight 0. That's what lets training grade every position in parallel without cheating.
- Q, K, V are **three learned linear layers** applied to the same vectors, with no new math since Part 1. **Heads** run several attention patterns in parallel; each head is a different trained-in sense of "relevant."
- A **transformer block** = attention (gather) + MLP (Part 4's committee: think) + **residual stream** (a running draft that every layer adds corrections to) + layer norm (keeps scales sane). Stack N blocks, put Part 5's softmax head on top: that's GPT, complete.
- Scoring by content makes attention **blind to word order**, provably: shuffle the context and the output vector is unchanged. Position has to be added to the embeddings before attention runs.
- One worked example with 3 tokens and `$d = 2$` that you can check by mental arithmetic.

## A soft dictionary lookup

Start with a hard dictionary: `d["cat"]` hashes the key, finds an exact match, returns the value. All or nothing: one key wins, everything else contributes zero.

Attention keeps the roles and softens the match. Every position in the sequence plays all three parts at once:

- It publishes a **key** `$k$`: a vector advertising *what I contain* ("I am a noun, singular, concrete, luggage-sized").
- It emits a **query** `$q$`: a vector describing *what I'm looking for* ("I am a pronoun; I need my referent").
- It offers a **value** `$v$`: the vector it will *contribute* if chosen, the actual payload.

Relevance between a query and a key is their **dot product**. This should land with a small shock of recognition: the vector-space post established that the inner product is where alignment lives, and [the embeddings series](@/blog/0002-what-are-embeddings.md) used `$q \cdot k$` to rank documents against queries (the mail-sorting machine stamping coordinates and looking for neighbors). Attention is that machine given a promotion: instead of pinning finished letters to a map, **it sends each position's query to a filing cabinet of keyed envelopes** (one envelope per earlier token), scores every envelope by `$q \cdot k$`, and takes a *weighted blend* of their contents. Retrieval, but differentiable; a lookup you can backpropagate through. No key "wins": every position contributes in proportion to how well its key matches the query, so gradient descent can tune the whole thing with Part 4's bookkeeping.

## The formula, assembled rather than decreed

Nothing here is invented; it's forced, one requirement at a time. Position `$t$` has a query `$q_t$`. Every position `$j \le t$` has a key `$k_j$` and value `$v_j$`.

**Step 1: score.** Relevance of position `$j$` to the question at `$t$`: `$s_{tj} = q_t \cdot k_j$`. Unbounded and sign-carrying, the raw material every part of this series starts from.

**Step 2: scale.** Divide by `$\sqrt{d_k}$`. Why: if the entries of `$q$` and `$k$` are roughly unit-variance, their dot product is a sum of `$d_k$` such terms, so its **variance is about `$d_k$`** and typical scores grow like `$\sqrt{d_k}$`. At `$d_k = 1024$` raw scores routinely land at ±30, and softmax of scores that far apart is a one-hot in disguise: one envelope gets everything, gradients to the rest die. You have held this dial twice already: it is a **temperature**, the `$\tau$` from InfoNCE and the `$T$` from Part 5's decoding loop, except here it's set once, analytically, to keep the poll competitive at any dimension. The demo below measures it.

**Step 3: vote.** Softmax the scaled scores across positions `$j$`. Positive, sum to 1: Part 3's machine, verbatim. And savor what the weights now *mean*: Part 1 called `$w \cdot x$` a "weighted opinion poll" as a metaphor. Here softmax hands position `$t$` an actual poll **over the context** ("cat" gets 79% of my attention, "sat" 11%, "the" 10%), and the metaphor stops being one.

**Step 4: mix.** Output = the poll applied to the payloads: `$\sum_j a_{tj} v_j$`.

Stack all positions into matrices and the four steps compress to the most famous line in modern ML:

```math
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
```

Dot products (`$QK^\top$`), a temperature (`$\sqrt{d_k}$`), a softmax, a weighted average. Every ingredient predates this series' halfway mark.

Step 2's claim is easy to check: dot products of random vectors grow like `$\sqrt{d}$`, and softmax saturates without the scale:

```python
import numpy as np
np.random.seed(0)

print("variance of q·k for random unit-variance vectors:")
for d in (4, 64, 1024):
    q, k = np.random.randn(100_000, d), np.random.randn(100_000, d)
    raw = (q * k).sum(axis=1)
    print(f"  d = {d:4d}   var(raw) = {raw.var():7.1f}   "
          f"var(raw / sqrt(d)) = {(raw / np.sqrt(d)).var():.2f}")

def softmax(s):
    e = np.exp(s - s.max())
    return e / e.sum()

d = 1024
q, K = np.random.randn(d), np.random.randn(8, d)   # one query, 8 keys
s = K @ q
print("\nsoftmax over 8 positions, d = 1024:")
print("  unscaled :", np.round(softmax(s), 3))
print("  / sqrt(d):", np.round(softmax(s / np.sqrt(d)), 3))
```

The raw variance tracks `$d$` almost exactly (4, 64, 1024), while the scaled version pins it near 1 at every dimension. Then the punchline rows: unscaled softmax at `$d = 1024$` zeroes out six of the eight envelopes to three decimals and lets the survivors split the poll 89/11, most candidates dead by accident of dimension, while the scaled version keeps all eight alive. That single `$\sqrt{d_k}$` is the difference between a poll and a coronation.

## Causal masking: no peeking

Part 5 said the labels write themselves: every position in a sentence is an exam question whose answer is the next token. Training computes *all* those exams **in parallel**: one forward pass grades a thousand positions at once, which is the "industrial scale" behind self-supervision's free lunch. But the exam at position `$t$` is only honest if `$t$` cannot read position `$t+1$`, which is sitting *right there* in the same matrix. The fix is brutal and clean: before the softmax, set every score `$s_{tj}$` with `$j > t$` to `$-\infty$`. Then `$e^{-\infty} = 0$`, the softmax assigns future positions exactly zero weight, and the attention matrix comes out lower-triangular, every row a poll over the past only. You'll see the triangle in the demo.

## Three tokens by hand

Here is the receipt. Three tokens (think "cat", "sat", "it") with `$d = 2$`, and Q/K/V hand-picked (to keep the arithmetic clean, the `$1/\sqrt{2}$` scale is folded into the query). Keys advertise content: dimension 1 means "noun-ish", dimension 2 "verb-ish". The pronoun's query hunts for nouns; the other two aren't looking for anything:

```math
k_1 = (1, 0), \quad k_2 = (0, 1), \quad k_3 = (0, 0), \qquad
q_1 = q_2 = (0, 0), \quad q_3 = (2, 0)
```

```math
v_1 = (1, 2), \qquad v_2 = (3, 0), \qquad v_3 = (0, 1)
```

**Row 1** ("cat"): the mask leaves only position 1. Weight 1 on itself; output `$= v_1 = (1, 2)$`.

**Row 2** ("sat"): sees positions 1–2. Scores `$q_2 \cdot k_1 = 0$` and `$q_2 \cdot k_2 = 0$`; softmax of `$(0, 0)$` is `$(0.5, 0.5)$`: an indifferent query gets a uniform poll. Output `$= 0.5\,(1,2) + 0.5\,(3,0) = (2, 1)$`.

**Row 3** ("it"): sees everything. Scores `$q_3 \cdot k_1 = 2$`, `$q_3 \cdot k_2 = 0$`, `$q_3 \cdot k_3 = 0$`. Softmax: `$e^2 \approx 7.39$` against `$1$` and `$1$`, so the weights are `$\approx (0.787,\ 0.106,\ 0.106)$`. Output:

```math
0.787\,(1,2) + 0.106\,(3,0) + 0.106\,(0,1) \approx (1.11,\ 1.68)
```

Check the pieces in your head: first coordinate `$0.787 + 0.32 \approx 1.11$`, second `$1.574 + 0.106 \approx 1.68$`. The pronoun's output vector now sits mostly on top of the noun's value: **"it" has fetched "cat"**, and the fetch happened because of what the vectors *contain*, not where they sit. Move "cat" three tokens earlier and nothing changes except which column of the row the weight lands in. That is precisely what Part 5's fixed window could not do, and it arrives with a bill attached, which the section after next pays.

## Q, K, V are learned, and heads are parallel senses of "relevant"

I hand-picked those vectors, which is Part 4's XOR-by-hand move: fine for a demo, not how it works. In the real machine each position's queries, keys, and values are **linear projections of the same input vector**:

```math
q_t = W_Q\, x_t, \qquad k_t = W_K\, x_t, \qquad v_t = W_V\, x_t
```

Three linear layers (the object you've known since Part 1's `$w \cdot x + b$`), sitting inside the loss like any other parameter, tuned by the same `$g = p - y$` flowing backward through Part 4's bookkeeping. Nobody tells the model that pronouns should hunt nouns; gradient descent discovers that queries which fetch referents pay smaller cross-entropy bills, and carves `$W_Q$` and `$W_K$` accordingly. The embeddings series' hard-won lesson applies unchanged: **similarity is a trained-in judgment**, and here the judgment being trained is "what is relevant to what."

Which raises an obvious objection: *one* sense of relevant is not enough. "It" needs its referent, but the same position might also care about the verb that governs it, the clause boundary, whether it's inside a quotation. The fix is bulk purchasing: run `$H$` attention operations **in parallel**, each with its own `$W_Q, W_K, W_V$` and each producing its own lower-triangular poll, then concatenate the outputs. These are **heads**, and each head is a different learned sense of "relevant": interpretability work (Elhage et al., further reading) keeps finding heads with legible jobs, like previous-token heads, heads that match closing brackets to opening ones, and "induction heads" that find the last time the current pattern appeared and copy what followed. Several filing-cabinet clerks, each indexing the same envelopes by a different scheme.

Now the readable demo: a five-token sequence where the Q/K projections are engineered so the pronoun attends to the noun. Watch the triangle, and watch row "it":

```python
import numpy as np
np.random.seed(0)

tokens = ["the", "cat", "sat", "on", "it"]
d = 4  # feature slots: [noun-ish, verb-ish, pronoun-ish, filler]
E = {"the": [0, 0, 0, 1], "cat": [1, 0, 0, 0], "sat": [0, 1, 0, 0],
     "on":  [0, 0, 0, 1], "it":  [0, 0, 1, 0]}
X = np.array([E[t] for t in tokens], dtype=float)

Wq = np.zeros((d, d)); Wq[2, 0] = 4.0   # pronoun-ish -> "seeking a noun"
Wk = np.zeros((d, d)); Wk[0, 0] = 4.0   # noun-ish    -> "I am a noun"
Wv = np.eye(d)                          # values: pass the embedding through

Q, K, V = X @ Wq, X @ Wk, X @ Wv
scores = Q @ K.T / np.sqrt(d)
scores[np.triu(np.ones((len(tokens),) * 2, bool), k=1)] = -np.inf  # causal mask
A = np.exp(scores - scores.max(axis=1, keepdims=True))
A /= A.sum(axis=1, keepdims=True)

print("attention weights (each row: where that position looks):")
print("        " + "".join(f"{t:>7}" for t in tokens))
for t, row in zip(tokens, A):
    print(f"{t:>7} " + "".join(f"{w:7.2f}" for w in row))

print("\nmixed outputs (rows of A @ V):")
for t, o in zip(tokens, A @ V):
    print(f"{t:>7} -> {np.round(o, 2)}")
```

Two things to read off the printout. The zeros above the diagonal are the causal mask: no row spends a single percent on its future. And the last row is the payoff: "it" puts ~100% of its poll on "cat" (score `$16/\sqrt{4} = 8$`, and `$e^8$` buries the competition), so its mixed output *is* the cat vector. The context vector at "it" now knows it's about a cat, which is what Part 5's head needs to put probability on "purred" rather than "photosynthesis."

## Attention is a bag, and order gets bolted on

Now the bill. Look again at `$q \cdot k$` and notice what is missing from it: any mention of *where* either token sits. Relevance is computed from content, and content only. That is the feature, the thing a fixed window could never do. It also means the mechanism, by itself, cannot distinguish word order at all.

Not "handles order poorly". Cannot distinguish it. Shuffle the words in front of the final position and the final position's output comes out the same vector:

```python
import numpy as np
np.random.seed(0)

d = 8
Wq, Wk, Wv = (np.random.randn(d, d) / np.sqrt(d) for _ in range(3))
vocab = {t: np.random.randn(d) for t in ["the", "cat", "sat", "on", "it"]}

def last_output(seq, positions=False):
    X = np.array([vocab[t] for t in seq])
    if positions:                                     # inject order into the vectors
        X = X + np.array([[np.sin(i / 2), np.cos(i / 2)] * (d // 2)
                          for i in range(len(seq))])
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    s = Q @ K.T / np.sqrt(d)
    s[np.triu(np.ones((len(seq),) * 2, bool), k=1)] = -np.inf   # causal mask
    A = np.exp(s - s.max(axis=1, keepdims=True)); A /= A.sum(axis=1, keepdims=True)
    return (A @ V)[-1]                                # what "it" ends up holding

a = ["the", "cat", "sat", "on", "it"]
b = ["sat", "on", "the", "cat", "it"]                 # same four words, reshuffled

for label, pos in [("without positional information", False),
                   ("with positional information", True)]:
    oa, ob = last_output(a, pos), last_output(b, pos)
    print(f"{label}:")
    print(f"  {' '.join(a):24s} -> {np.round(oa, 3)}")
    print(f"  {' '.join(b):24s} -> {np.round(ob, 3)}")
    print(f"  same? {np.allclose(oa, ob)}\n")
```

Two different sentences, the same four words ahead of "it", and an output that agrees to every decimal it prints. The causal mask does buy *some* order information, since a position can only see its own prefix and therefore knows how many tokens precede it, but among the tokens it can see, order is invisible: "dog bites man" and "man bites dog" hand position 3 the same bag of envelopes.

So order is injected *before* attention ever runs, by adding position-dependent vectors to the token embeddings, which is what the second half of that demo does. The original recipe was sinusoids at different frequencies (Vaswani et al.); the modern default is **RoPE**, which rotates queries and keys by an angle proportional to position, so that `$q \cdot k$` picks up a term depending on the *distance* between two tokens rather than their absolute slots. Either way the principle is the same, and faintly embarrassing: we built a mechanism with a symmetry nobody wanted, then broke that symmetry on purpose from outside. Position is not something a transformer understands. It is something we hand it in an envelope.

## The transformer block: gather, then think

Attention moves information *between* positions but does almost no processing: its output is a weighted average of value vectors, and averaging is linear. Part 4 taught us what linear-only buys: one voter with extra steps. So the architecture alternates two moves:

1. **Attend** (gather): each position polls the context and pulls in what's relevant.
2. **MLP** (think): Part 4's committee, applied to each position independently, redraws the map with nonlinear processing of whatever attention just fetched.

Wrap both in two pieces of plumbing. The **residual stream**: each sub-layer's output is *added* to its input, `$x \leftarrow x + \text{sublayer}(x)$`, so the vector flowing upward is a running draft that every layer contributes corrections to, rather than a document each layer rewrites from scratch. That also hands the backward pass a gradient freeway (an identity path no `$\phi'$` can strangle; Part 2's vanishing worry, structurally retired). And **layer norm**: it re-standardizes each position's vector so scales stay sane no matter how many corrections have been added. That's a **transformer block**. Stack `$N$` of them, and the whole machine (the entire series) fits in one display:

```math
\text{tokens} \;\to\; \text{embedding table} \;+\; \text{positions} \;\to\; N \times \bigl(\text{attend} + \text{think}\bigr) \;\to\; \underbrace{\text{softmax over } K \approx 50{,}000}_{\text{Part 3, bigger } K} \;\to\; \text{classify, sample, append, repeat}
```

Part 5's black box `$h$` is now open: it's the residual stream after `$N$` rounds of gather-then-think. GPT-2 small is `$N = 12$` blocks, 12 heads each, `$d = 768$`; frontier models are the same drawing with bigger numbers, and there is no other component. You now own the whole pipeline, and every stage of it was built in an earlier part of this series.

## What I skipped

Two omissions worth flagging. **The KV-cache**: at generation time, keys and values for the context don't change as tokens append, so you compute them once and cache. This is why producing token 1,000 doesn't cost 1,000 times token 1, and why serving LLMs is largely a memory-bandwidth business. **FlashAttention and friends**: the `$QK^\top$` matrix is quadratic in sequence length, and a decade of engineering exists to compute the same softmax-weighted average without ever materializing it. Same math, better plumbing, and none of it changes a formula in this post.

## Closing thoughts

Part 5 left `$h$` as a black box and a demand: let every position reach back over everything before it and take what is relevant. The answer was the operation this series has been rehearsing since the vector-space post drew its first angle. Every position publishes a key, emits a query, offers a value; relevance is `$q \cdot k$`, the inner product doing for *what to look at* what it did for *what's similar*. The `$\sqrt{d_k}$` is a temperature set by arithmetic rather than product taste, and the softmax makes Part 1's weighted opinion poll literal: a poll over the context, printed as a lower-triangular matrix you can read. The mask is one `$-\infty$` per future position, keeping a thousand parallel self-grading exams honest, while order had to be handed in from outside, because content-addressing is blind to it by construction. Q, K, V are three linear layers; heads are several trained-in senses of relevant running in parallel; and the transformer block is just *gather, then think*, with attention feeding Part 4's committee and corrections accumulating in a residual stream. It really is dot products all the way down, and softmax + cross-entropy is still the only machine in the building.

So the model is assembled (tokens to embeddings to N blocks to a 50,000-way vote), and it does exactly one thing: predict the next token of text like the text it was trained on. Which is not the same thing as being *helpful*. The gap between "autocomplete for the internet" and the assistant in your chat window is a second act of training, and it explains the strangest behaviors of these systems: why they make things up with a straight face, why the same weights can be a poet or a paralegal, and what that temperature dial is really selling. Next post: how a predictor becomes an assistant.

## Further reading

- **Vaswani, A. et al., "Attention Is All You Need" (NeurIPS, 2017)**: the transformer paper, with the `$\text{softmax}(QK^\top/\sqrt{d_k})V$` display, multi-head attention, and the (then-radical) claim that the gather-then-think block needs no recurrence at all.
- **Bahdanau, D., Cho, K. & Bengio, Y., "Neural Machine Translation by Jointly Learning to Align and Translate" (ICLR, 2015; arXiv 2014)**: attention's debut, three years earlier, with a translation decoder learning to look back at the right source words, and the attention-weight matrices that made everyone believe.
- **Elhage, N. et al., "A Mathematical Framework for Transformer Circuits" (Anthropic, 2021)**: the residual-stream view taken seriously, with heads as read-write operations on a shared channel, and the discovery of induction heads with legible, testable jobs.
