+++
title = "From lines to language models: Part 5 - A language model is a classifier"
date = 2026-08-28
description = "\"The cat sat on the ___\" is a multiple-choice exam with roughly 50,000 options, and a language model does nothing else. The head of GPT is literally Part 3's softmax regression with a bigger K, and the labels come free because raw text grades its own next token. Plus: train a character-level language model in your browser and watch it babble."

[extra]
linkedin = "Part 5 of From lines to language models, and the punchline of the whole series: a language model is a classifier. \"The cat sat on the ___\" is a multiple-choice exam with ~50,000 options, the head of GPT is softmax regression with a bigger K, and the labels come free because raw text grades itself. Train a tiny language model in your browser and watch it babble."
tags = ["ml", "llm", "language-models", "softmax", "next-token-prediction", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 5 of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) built the weighted opinion poll and the gradient-descent engine; [Part 2](@/blog/0006-classification-vs-regression.md) split quantity from decision and ordered us to ship probabilities and decide late; [Part 3](@/blog/0007-logistic-regression.md) derived softmax + cross-entropy and told us to remember the machine; [Part 4](@/blog/0008-from-neuron-to-network.md) stacked voters into a committee whose hidden layers redraw the map, and closed on a claim that sounded like marketing: next-word prediction is classification, no metaphor. Time to collect.*

Fill in the blank:

> The cat sat on the ___

You said "mat," or maybe "floor," "couch," "windowsill." Notice what you just did: out of every word you know (call it 50,000), you assigned essentially all of your belief to a handful of candidates and essentially none to "photosynthesis." You took a **multiple-choice exam with 50,000 options** and aced it without feeling the size of the option sheet.

You have seen this exam before, twice. [Part 3](@/blog/0007-logistic-regression.md) built the grading machinery (softmax over K classes, cross-entropy charging `$-\log$` of the probability given to the truth), and [the embeddings series](@/blog/0003-how-are-embeddings-trained.md) ran the same exam under the name InfoNCE, picking the true passage out of a lineup. Here is this post's entire thesis, and the hinge of the series: **a language model is a classifier that takes this exam, and it does nothing else, ever.** Every headline, every code completion: one 50,000-way multiple-choice question after another.

**TL;DR**

- **Tokens**: text becomes a sequence of integer IDs from a fixed vocabulary of subword pieces. Each ID indexes a row of a learned **embedding table**: the mail-sorting machine's coordinates from [the embeddings post](@/blog/0002-what-are-embeddings.md), now the model's *first layer*, trained jointly with everything else.
- The network digests the context into a feature vector `$h$` (Part 4's redrawn map), and then the final layer is *literally* Part 3's softmax regression: `$\text{logits} = W h + b$`, one score line per vocabulary entry, `$K \approx 50{,}000$`. **The head of GPT is Part 3 with a bigger K.**
- The loss is cross-entropy `$= -\log P(\text{true next token})$`, the gradient at the head is `$g = p - y$`, and it flows backward exactly as in Part 4, with zero new math.
- **The labels write themselves**: every position in every sentence of raw text is a labeled example. Nobody hand-labels anything (contrast Part 2's spam corpus), which is why the internet is the labeled dataset, and why scale was even possible.
- **Perplexity** is `$e^{\text{cross-entropy}}$`: how many-sided is the die the model is effectively rolling. Shannon was measuring it on humans in 1951.
- Generation is a loop: **classify, sample, append, repeat.** Temperature rescales logits before softmax (the same `$\tau$` from InfoNCE, moved to decoding time), and it's a product decision.

## Text becomes integers

A classifier eats feature vectors, not prose, so the first job is bookkeeping: chop text into pieces from a fixed **vocabulary** and replace each piece with its integer ID. The pieces are **tokens**, usually *subwords*, learned by greedily merging frequent character sequences so that common words get one token and rare words get spelled out from parts. Something like "tokenizers" might become `token` + `izers`, two IDs; "the" is almost certainly one ID; a typo or a rare surname gets shredded into several. (The exact splits vary by tokenizer; BPE is a compression scheme promoted to a preprocessing step, and we'll leave it there.) GPT-2's vocabulary has exactly 50,257 entries, the concrete K behind this post's "roughly 50,000."

What happens to an ID inside the model is the part you already know. Token ID `$k$` selects **row `$k$` of an embedding table** `$E$`: a matrix with one learned vector per vocabulary entry. The first layer of a language model is a lookup. And you know exactly what those rows are: [the embeddings series](@/blog/0002-what-are-embeddings.md) established that an embedding is a *learned coordinate*, a point on a map where similarity means proximity. Here the map isn't trained separately and bolted on: `$E$` sits inside the loss like any other parameter, so gradient descent tunes the coordinates of "cat" in the same loop that tunes the classifier that consumes them. Learned features, all the way down to the dictionary.

## The head of GPT is Part 3 with a bigger K

Now the model itself, stated in series vocabulary. Given the context tokens so far ("the cat sat on the"), the network computes a **context vector** `$h$`: a feature vector summarizing everything about the context that matters for guessing what comes next. This is [Part 4](@/blog/0008-from-neuron-to-network.md)'s move verbatim: hidden layers redrawing the map until the problem becomes linear. *How* `$h$` gets computed is the next post's business; today, it's a black box that emits features.

And then the final layer. Deep breath:

```math
\text{logits} = W h + b, \qquad P(\text{next} = k \mid \text{context}) = \frac{e^{\text{logit}_k}}{\sum_{j=1}^{K} e^{\text{logit}_j}}
```

That is [Part 3](@/blog/0007-logistic-regression.md)'s softmax regression, character for character. `$W$` has one row per vocabulary entry, and **every word in the dictionary gets its own score line**, Part 3's "every class gets its own line" scaled from 4 email folders to 50,257 tokens. The loss is the one you know: cross-entropy, `$-\log$` of the probability assigned to the token that actually came next. The gradient at the head is the one you know: `$g = p - y$`, the entire learning signal, three characters wide, with `$y$` a one-hot vector 50,257 entries long. It flows backward through the stack exactly as Part 4's bookkeeping prescribed, all the way down into the embedding table's rows. **The head of GPT is Part 3 with a bigger K.** Nothing in the training objective of a frontier language model requires math this series hasn't already derived.

One production-flavored note on that head, because K ≈ 50,000 is not free. `$W$` is `$K \times d$`, so at GPT-2's `$d = 768$` a dedicated head would be `$50{,}257 \times 768 \approx$` **38.6 million parameters**, more than five of the model's twelve transformer blocks put together. Nobody pays that twice. Notice that `$W$` (one vector per token, for scoring) and the embedding table `$E$` (one vector per token, for reading) have the same shape transposed, so GPT-2 **ties** them and uses `$E^\top$` as the head. That single matrix is then 38.6M of GPT-2's 124.4M parameters, close to a third of the model, working two jobs: it is the dictionary tokens are read through *and* the set of score lines they are ranked against. Untie them and the same model would carry 163M parameters instead of 124M. The map you read tokens off of and the map you score tokens against become the same map.

## The labels write themselves

Part 2's spam filter needed something expensive: a human reading emails and stamping 0 or 1 on each. Every classifier so far has had that hidden invoice: someone, somewhere, wrote the labels.

Next-token prediction tears up the invoice. Take any sentence of raw text: "the cat sat on the mat." Slide a cursor along it. At every position, the context is the prefix and **the label is simply the next token**, a token some human already typed, for free, years ago, for their own reasons. One 1,000-word document is ~1,000 labeled exam questions. Nobody annotates anything; **the sentence grades itself.** The polite term is *self-supervision*, and it's the reason scale happened: the moment "labeled data" means "any text at all," **the internet is the labeled dataset**, and the only remaining limits are compute and how much of the internet you can stomach.

Written out, the training loss over a corpus of `$N$` tokens is nothing but Part 3's cross-entropy averaged over every free exam question:

```math
\mathcal{L} \;=\; -\frac{1}{N} \sum_{t=1}^{N} \log P\bigl(x_{t+1} \mid x_1, \dots, x_t\bigr)
```

Every term is one blank to fill, one `$-\log$` fee for the probability given to what the human actually wrote next. Pretraining a language model is minimizing this sum, and that is the entire objective. There is no second loss where the magic lives.

## Perplexity: how many-sided is the die

One paragraph for the metric everyone reports. **Perplexity** is `$e^{\text{average cross-entropy}}$`, and it has a physical reading: it's the number of sides on the fair die the model is *effectively* rolling at each position. A model that knows nothing about a K-token vocabulary assigns `$1/K$` everywhere, pays `$\log K$` per token, perplexity `$K$`, rolling the full 50,000-sided die. A model that's genuinely torn between "mat" and "floor" and nothing else pays about `$\log 2$`, perplexity 2, a coin. The historical anchor predates every neural network in this series: in 1951 Claude Shannon sat people down, showed them English text one letter at a time, and made them guess the next letter, using their error rate to estimate the entropy of English at roughly one bit per character. **Next-token prediction as a measurable game is older than the transistor radio.** Language models didn't invent the exam; they're just the first students to study for it with gradient descent.

## Generation: classify, sample, append, repeat

Here's where the classifier framing pays out something that *feels* like magic and isn't. A classifier maps context → probability distribution over next tokens. To make it **write**:

1. **Classify**: run the context through the model, get `$K$` probabilities.
2. **Sample**: draw one token from that distribution.
3. **Append**: stick it onto the context.
4. **Repeat.**

That loop is the whole magic. There is no separate "generation module": an LLM writes by taking the exam, appending its own answer to the question, and taking the exam again. The polite term is **autoregression**: the model's output becomes its next input, and a thing trained only to *predict* text turns out to *produce* text, one multiple-choice answer at a time. Everything you've ever watched stream out of a chat window is step 2 of this loop, executed a few hundred times.

Enough claims. Train one.

## Train your own (garbled) language model

The demo below is a complete language model, the smallest one worth the name. The vocabulary is characters instead of subwords (about 19 classes instead of 50,257) and the "network" computing `$h$` is as shallow as possible: the context is just the *previous character*, so the context vector is a one-hot and the model is one softmax regression per character, a **bigram model**. But every part of this post is in there: tokens as integer IDs, one score line per class, cross-entropy, `$g = p - y$`, gradient descent, and the classify-sample-append-repeat loop at the end. You are about to train a language model in your browser and watch it write.

```python
import numpy as np
np.random.seed(0)

corpus = ("the cat sat on the mat and the dog sat on the log "
          "the cat saw the dog and the dog saw the cat and they sat in the sun "
          "a cat can sing a sad song and a dog can sing a long song "
          "the sun was warm and the sand was soft and the cat was glad")

vocab = sorted(set(corpus))                     # space + the letters used
V = len(vocab)
stoi = {c: i for i, c in enumerate(vocab)}
ids = np.array([stoi[c] for c in corpus])       # text -> integer token IDs
X, Y = ids[:-1], ids[1:]                        # every position labels itself
print(f"vocab size K = {V}, training examples = {len(Y)} (all free)")

W = np.zeros((V, V))                            # one score line per class, per context
I = np.eye(V)
for step in range(1, 401):
    z = W[X] - W[X].max(axis=1, keepdims=True)  # logits for each position
    p = np.exp(z); p /= p.sum(axis=1, keepdims=True)
    if step == 1 or step % 100 == 0:
        loss = -np.log(p[np.arange(len(Y)), Y]).mean()
        print(f"step {step:3d}   cross-entropy {loss:.3f}   perplexity {np.exp(loss):5.2f}")
    g = p - I[Y]                                # the entire learning signal
    np.add.at(W, X, -20.0 * g / len(Y))         # Part 1's downhill walk

for ctx in " tha":                              # the classifier's verdicts, one context at a time
    z = W[stoi[ctx]]; p = np.exp(z - z.max()); p /= p.sum()
    top = np.argsort(p)[::-1][:3]
    print(f"after {ctx!r}: " + "   ".join(f"{vocab[i]!r} {p[i]:.2f}" for i in top))

cur, out = stoi[" "], []                        # classify, sample, append, repeat
for _ in range(200):
    z = W[cur] - W[cur].max()
    p = np.exp(z); p /= p.sum()
    cur = np.random.choice(V, p=p)              # sample from the classifier's verdict
    out.append(vocab[cur])
print("\ngenerated:\n" + "".join(out))
```

Watch three things. First, the loss: it starts at `$\log 19 \approx 2.94$` (perplexity 19, the full-vocabulary die, a model that knows nothing) and falls as gradient descent carves the score lines, the die shrinking to about three effective sides (this tiny corpus really is that predictable). Second, the verdicts, which are this post's thesis made visible: after `'h'` the model is certain (`'e'` at 1.00), after `'a'` it is torn three ways, and after `'t'` it is almost exactly a coin, `'h'` at 0.56 against `' '` at 0.43. That last row is the perplexity-2 case from two sections ago, printed. Every row is one multiple-choice question with 19 options and an opinion about all of them. Third, the generated text. It's garbled, of course, but it is *not* noise. Words are word-shaped. Vowels follow consonants. Spaces arrive at plausible intervals, and fragments like "the" and "sat" surface whole, because those transitions dominate the training bill. That structure is everything one character of context can buy, purchased entirely by softmax + cross-entropy + `$g = p - y$`. The distance from this to GPT is not a different kind of machine; it's a better `$h$` and a bigger K.

## Temperature: the same knob, moved to decoding time

Step 2 of the loop said "sample," but there's a dial on the sampler. Divide the logits by a **temperature** `$T$` before the softmax:

```math
P(\text{next} = k) = \frac{e^{\,\text{logit}_k / T}}{\sum_j e^{\,\text{logit}_j / T}}
```

As `$T \to 0$` the largest logit wins everything: **greedy decoding**, always the single most likely token, deterministic and prone to loops. At `$T = 1$` you sample from the model's honest verdict. As `$T \to \infty$` the distribution flattens toward uniform and the model babbles from the full die. You have met this knob: it is *the same* `$\tau$` that InfoNCE used in [the embeddings series](@/blog/0003-how-are-embeddings-trained.md) to sharpen or smooth the multiple-choice exam. There it shaped training pressure; here it shapes sampling at decoding time. Same formula, same knob.

```python
import numpy as np
np.random.seed(0)
corpus = ("the cat sat on the mat and the dog sat on the log "
          "the cat saw the dog and the dog saw the cat and they sat in the sun "
          "a cat can sing a sad song and a dog can sing a long song "
          "the sun was warm and the sand was soft and the cat was glad")
vocab = sorted(set(corpus)); V = len(vocab)
stoi = {c: i for i, c in enumerate(vocab)}
ids = np.array([stoi[c] for c in corpus]); X, Y = ids[:-1], ids[1:]
W, I = np.zeros((V, V)), np.eye(V)
for _ in range(400):                            # same training as the hero demo
    z = W[X] - W[X].max(axis=1, keepdims=True)
    p = np.exp(z); p /= p.sum(axis=1, keepdims=True)
    np.add.at(W, X, -20.0 * (p - I[Y]) / len(Y))

def generate(T, n=150):
    cur, out = stoi[" "], []
    for _ in range(n):
        z = W[cur] / T
        p = np.exp(z - z.max()); p /= p.sum()
        cur = np.random.choice(V, p=p)
        out.append(vocab[cur])
    return "".join(out)

for T in (0.2, 1.0, 2.0):
    print(f"T = {T}:\n  {generate(T)}\n")
```

At `$T = 0.2$` the model plays it safe and loops through its favorite transitions: coherent-ish and repetitive. At `$T = 1.0$` you get the full distribution, structured babble with variety. At `$T = 2.0$` the die flattens and the letters approach soup. And notice that **nothing about the model changed between those three outputs.** The trained weights are identical; so are the probabilities. Temperature is applied at decoding time, downstream of the classifier, which makes it [Part 2](@/blog/0006-classification-vs-regression.md)'s lesson wearing new clothes: the model ships probabilities; how boldly to sample from them is a **product decision, not a truth knob.** Low temperature for code completion, higher for brainstorming. That's the same conversation as choosing a spam threshold, and it belongs to the same people: the ones who own the consequences.

## What one token of context cannot see

Now the ceiling, and it's low. The bigram model conditions on exactly **one token**. Ask it to continue "the cat sat on the" and it sees only "e". The cat, the sitting, the entire clause are gone. That's why its output is word-*shaped* but never sentence-shaped: no context vector built from one token can hold a sentence's worth of information, any more than [Part 4](@/blog/0008-from-neuron-to-network.md)'s single voter could hold a non-linear opinion.

You could widen the window, conditioning on the last 2, 5, 20 tokens by concatenating their embeddings, and people did, for decades, with respectable results (Bengio et al. 2003, further reading). But a fixed window is a fixed blindness: whatever decides the next token (the subject twelve tokens back, the opening quote two paragraphs up) is invisible the moment it slides out of frame. What's actually missing is a mechanism inside the network that lets the context vector `$h$` **gather information from *all* previous tokens, weighted by how relevant each one is to the prediction at hand**, so that `$h$` at "the ___" can reach back, fish out *cat* and *sat on*, and mostly ignore the rest. Relevance-weighted gathering, learned by gradient descent like everything else in this series. That mechanism exists, it's the one genuinely new idea left between here and GPT, and it's the next post.

## Closing thoughts

Part 4's closing claim, cashed in full: predicting the next token is a classification problem over a vocabulary, no metaphor anywhere in the sentence. Text becomes integer IDs; each ID looks up a learned coordinate in an embedding table that is just the mail-sorting machine's map, promoted to first layer; a network redraws that map into a context vector. The head is Part 3's softmax regression with K pushed to 50,257: cross-entropy charging `$-\log$` of the truth, `$g = p - y$` flowing backward exactly as Part 4 bookkept. The labels write themselves, which is why the internet is the training set. The loss exponentiates into a die-size called perplexity, a game Shannon was already scoring humans on in 1951. And generation is the classifier eating its own answers (classify, sample, append, repeat), with temperature as the InfoNCE knob relocated to decoding time, priced and chosen like Part 2's thresholds: downstream, by product owners, late.

The bigram demo drew the ceiling in crayon: one token of context makes word-shaped noise, and no fixed window fixes it. What's missing is the machinery that builds `$h$` by letting every position reach back over everything before it and take what's relevant. Next up: how the context vector actually gets built. This deep into a series about dot products, you can probably guess the answer.

## Further reading

- **Shannon, C. E., "A Mathematical Theory of Communication" (1948)** and **"Prediction and Entropy of Printed English" (1951)**. The origin of everything in the perplexity section: entropy as die-size, and humans playing the next-letter game to bound the entropy of English at about one bit per character.
- **Bengio, Y., Ducharme, R., Vincent, P. & Jauvin, C., "A Neural Probabilistic Language Model" (JMLR, 2003)**. The paper that assembled this post's exact recipe first: a learned embedding table, a hidden layer, and a softmax over the vocabulary, trained end to end by gradient descent.
- **Radford, A., Wu, J., Child, R., Luan, D., Amodei, D. & Sutskever, I., "Language Models are Unsupervised Multitask Learners" (2019)**. The GPT-2 paper: next-token prediction at scale, the 50,257-token vocabulary this post kept quoting, and the discovery that one classifier, trained hard enough, learns to do everything else.
