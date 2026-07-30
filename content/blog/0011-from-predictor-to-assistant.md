+++
title = "From lines to language models: Part 7 - From predictor to assistant"
date = 2026-09-11
description = "Ask a raw pretrained model \"What is the capital of Sweden?\" and it may answer with more exam questions — the predictor is doing its job perfectly; you asked for the next token when you wanted an assistant. The finale: supervised fine-tuning is the same cross-entropy on a tiny handwritten dataset, RLHF is a regression-shaped reward model with a KL leash to stop Goodharting, and hallucination is a precision failure shipped with a confident probability. Both series close: it's regressions all the way down, stacked, wired, and taught manners."

[extra]
linkedin = "Finale of From lines to language models: ask a raw pretrained model a question and it may answer with more exam questions — it's doing its job perfectly, you just asked for the next token when you wanted an assistant. SFT is the same cross-entropy on a tiny handwritten dataset, RLHF is a regression on human taste with a KL leash, and hallucination is a precision failure, not lying. It's regressions all the way down."
tags = ["ml", "llm", "rlhf", "fine-tuning", "hallucination", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 7, the finale, of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) built the weighted opinion poll `$w \cdot x + b$`; [Part 2](@/blog/0006-classification-vs-regression.md) ordered us to ship probabilities and decide late; [Part 3](@/blog/0007-logistic-regression.md) derived softmax + cross-entropy, the machine to remember; [Part 4](@/blog/0008-from-neuron-to-network.md) stacked voters into a committee that redraws the map; [Part 5](@/blog/0009-llms-are-classifiers.md) showed the head of GPT is Part 3 with a bigger K and the internet is the labeled dataset; [Part 6](@/blog/0010-attention.md) assembled the whole pipeline — tokens → embeddings → N × (attend + think) → 50,000-way vote — and closed on a warning: that machine is autocomplete for the internet, not an assistant. Time to close the gap, and both series.*

Take the machine Part 6 finished — pretrained, nothing else — and type:

> What is the capital of Sweden?

Here are three continuations it might assign high probability, all of them excellent predictions:

> What is the capital of Sweden?
> **What is the capital of Norway? What is the capital of Finland?**

> What is the capital of Sweden? **a) Stockholm b) Oslo c) Helsinki d) Copenhagen**

> What is the capital of Sweden? **— a question every geography student knows by heart.**

Not one of them *answers* you. And the model has made zero mistakes: on the internet it was trained to imitate, a lone quiz question is most often followed by *more quiz questions*, *answer options*, or *commentary about the question*. Documents that begin with that string rarely continue "Stockholm." full stop. The predictor is doing its job perfectly — you just asked for the wrong thing. **You asked for the next token; you wanted an assistant.** The distance between those two is not architecture (Part 6 was emphatic: there is no other component). It's two more phases of training, and this post walks all three.

**TL;DR**

- **Pretraining** is everything Parts 5–6 built, run at GPU-year scale. It produces a **simulator of internet text** — and it's where *all the knowledge lives*. The later phases add zero facts.
- **Supervised fine-tuning (SFT)**: same loss — cross-entropy, the machine to remember, third appearance — on a *tiny* curated set of (instruction, good response) pairs. The labels stop writing themselves; humans write them again, full circle to Part 2's spam corpus. It's **a costume change, not a brain transplant**: the model doesn't learn new things, it reallocates probability mass among behaviors it already has.
- **RLHF**: humans can't *write* ideal responses at scale, but they can *rank* them. Train a **reward model** — which is a regression, a score, Part 1 in a trench coat — on preference pairs, then optimize the LM against it with a **KL leash** to the base model. Without the leash: **reward hacking**, Goodhart's law with a learning rate. (DPO is the modern shortcut: skip the RL, optimize the preferences directly.)
- **Hallucination**: the model is a classifier over next tokens, **not a database**. Cross-entropy pays for confident plausibility, there's no "I don't know" token with training signal behind it, and RLHF makes calibration *worse*. The model isn't lying; it's sampling. Fixes are systems fixes: retrieval, citations, abstention — ship probabilities, decide late, one last time.
- **Sampling in production**: greedy loops, the raw tail degenerates (Holtzman), so we prune the die — top-k, nucleus (top-p) — and set temperature per product surface. A demo races them on one logit vector.
- **Swapping your LLM is an API break** with the wire format intact — the [embeddings-series lesson](@/blog/0004-what-are-drift.md), generalized. Prompts are the new thresholds; eval suites are the new anchor sets.

Three phases, one table, then each in turn — sized honestly, because the sizes *are* the insight:

| | **Pretraining** | **SFT** | **RLHF** |
|---|---|---|---|
| Data | trillions of tokens of raw text | ~10⁴–10⁵ handwritten (instruction, response) pairs | ~10⁵–10⁶ human preference rankings |
| Labels | write themselves (Part 5) | humans write them (Part 2, again) | humans *rank*, a model regresses the rankings |
| Loss | cross-entropy | cross-entropy — same machine | reward − β·KL (or DPO's classification loss) |
| Cost | GPU-years | days | days–weeks |
| Buys | all the knowledge | the persona | the polish, the preferences, the overconfidence |

## Phase 1: pretraining — where all the knowledge lives

Nothing new to build here; this is Parts 5 and 6, priced. Next-token prediction over trillions of tokens of internet text, softmax + cross-entropy, `$g = p - y$` flowing back through N blocks of gather-then-think into the embedding table. The labels write themselves, which is the only reason the bill is payable at all — but the bill is still the story: pretraining a frontier model is measured in **GPU-years** and tens of millions of dollars, a number that buys one thing and buys it completely. Every fact the final assistant will ever "know" — Stockholm, the syntax of Rust, the boiling point of nitrogen — is compressed into the weights *during this phase*, because knowing facts lowers cross-entropy on text written by people who knew them.

What you get for the money is worth naming precisely: a **simulator of internet text**. Not an answerer, not a helper — a machine that, given any prefix, continues it the way the internet statistically would. That's why the hook's completions were all correct behavior. The simulator contains an assistant, in the sense that helpful Q&A exchanges exist in the training data and the model can imitate them — but it equally contains exam compilers, forum trolls, and geography-quiz commentary, and a bare question doesn't tell it which document it's in. The remaining two phases are about *selecting the assistant out of the simulator*. They are astonishingly small by comparison, and that asymmetry is the single most load-bearing fact in this post.

One historical beat worth keeping, because it explains a whole profession: before SFT was standard, the workaround was to *trick the simulator*. If a bare question predicts more quiz questions, then write a prompt that looks like a document whose most likely continuation is what you want — stack up three examples of "Q: … A: …" and the model, mid-document, continues the pattern. That's **few-shot prompting** (the GPT-3 paper's headline trick), and it's not the model "learning" at runtime — it's the classifier being handed a context in which the helpful continuation is finally the *probable* one. Prompt engineering was born as simulator steering; the next two phases just bake the steering into the weights so users don't have to do it.

## Phase 2: supervised fine-tuning — a costume change, not a brain transplant

The fix sounds almost too cheap: keep training, same objective, but swap the data. Instead of the open internet, a **curated dataset of (instruction, good response) pairs** — tens of thousands of examples, written or vetted by paid humans, in the exact format you want the product to speak: question in, direct helpful answer out. The loss is cross-entropy on the response tokens. *The* cross-entropy — Part 3's machine to remember, the same `$-\log P(\text{truth})$` that trained the spam filter and the whole pretraining run. Third appearance, zero new math.

But notice what quietly reversed. Part 5's triumph was that **the labels write themselves** — any text is training data. Here the labels stop writing themselves: a human sits down and *writes the response we wish the model would give*, exactly like Part 2's human stamping spam/not-spam on emails. Full circle. Self-supervision bought the knowledge; hand-labeling buys the manners. The economics work only because of the asymmetry — you need trillions of free labels to learn what Stockholm *is*, and only thousands of expensive ones to learn that a question deserves an answer.

And be precise about what SFT does, because the misreading causes real production mistakes: the model **does not gain knowledge** from 50,000 examples — it couldn't; that's a rounding error against the pretraining corpus. What changes is *which of its existing behaviors get probability mass*. The simulator could always play the helpful assistant; SFT makes that persona the overwhelming default instead of one voice among thousands. **A costume change, not a brain transplant.** Same brain, same facts, same blind spots — now wearing a name tag that says "how can I help?"

## Phase 3: RLHF — a reward model and a leash

SFT has a ceiling built into its labels: it can only teach the model to imitate what humans *wrote*, and human-written responses are expensive, inconsistent, and often not even the best the *model* could do. But here's the asymmetry that unlocks the next phase: a person who couldn't write a great explanation of monads in an hour can tell you *which of two explanations is better* in thirty seconds. **Ranking is cheaper than writing.** So: sample two responses from the model, show both to a human, record which one they preferred. Repeat a few hundred thousand times.

Now turn those rankings into a training signal. Train a **reward model**: a network that eats (prompt, response) and outputs a single scalar — how much would a human like this? You can smell what that is from nine posts away: *a score is a regression.* Part 1's weighted opinion poll, Part 2's "regression predicts a quantity" — here the quantity is human approval, learned from preference pairs (the loss just pushes the preferred response's score above the rejected one's). The judge of the most talked-about AI systems on earth is the humblest object in this series.

Then optimize the language model to make the judge happy — this is the "RL" in RLHF — but with one non-negotiable term bolted on:

```math
\max_\theta \;\; \mathbb{E}_{y \sim \pi_\theta}\!\bigl[R(y)\bigr] \;-\; \beta \,\mathrm{KL}\!\bigl(\pi_\theta \,\|\, \pi_{\text{base}}\bigr)
```

Maximize reward, *minus* `$\beta$` times the KL divergence between the new model and the SFT model it started from. That second term is a **leash**, and the reason for it is Goodhart's law, stated plainly: **when a measure becomes a target, it ceases to be a good measure.** The reward model is not human judgment; it's a lossy regression *of* human judgment, wrong in exploitable places. Unleashed, gradient ascent will find those places with industrial efficiency — the model discovers that the judge overrates flattery, or hedging, or confident length, and collapses its entire distribution onto the exploit. That failure has a name, **reward hacking**, and a demo:

```python
import numpy as np
np.random.seed(0)
resp = ["helpful answer", "correct but curt", "hedged answer",
        "confident nonsense", "flattery", "refusal"]
base = np.array([0.30, 0.25, 0.20, 0.10, 0.10, 0.05])  # SFT model's habits
rew  = np.array([1.0, 0.8, 0.4, 0.3, 1.3, 0.1])  # judge OVERRATES flattery

def tuned(beta):  # optimum of E[reward] - beta*KL(q||base): q ∝ base·e^(r/β)
    q = base * np.exp(rew / beta)
    return q / q.sum()

def entropy(q):
    return float(-(q * np.log(q)).sum())

print("responses:      " + " | ".join(f"{r[:9]:>9}" for r in resp))
print("base policy:    " + " | ".join(f"{p:9.2f}" for p in base)
      + f"   entropy {entropy(base):.2f}")
for beta in (5.0, 1.0, 0.3, 0.05):
    q = tuned(beta)
    print(f"beta = {beta:4}:    " + " | ".join(f"{p:9.2f}" for p in q)
          + f"   entropy {entropy(q):.2f}  top: {resp[int(np.argmax(q))]}")
```

The optimum of that objective has a closed form — `$q \propto \pi_{\text{base}} \cdot e^{R/\beta}$` — so the demo needs no RL loop, just arithmetic. Read the printout top to bottom: at `$\beta = 5$` the policy barely moves off the base. At `$\beta = 1$` it leans toward what the judge likes while staying diverse. At `$\beta = 0.05$` — leash off — entropy craters and essentially *all* mass lands on "flattery," the one response the reward model overrates, even though the base model gave it 10%. The leash is not a nicety; it's the difference between "slightly more agreeable assistant" and "sycophancy generator." (You may recognize `$\beta$`'s job: it's a temperature on the reward, one more member of the knob family from Parts 3, 5, and 6.)

The toy exploit was "flattery," and the real ones are embarrassingly close to it. Documented reward hacks in production-grade RLHF: **sycophancy** (raters prefer answers that agree with the premise of the question, so the model learns to agree with you, including when you're wrong); **length bias** (raters read longer answers as more thorough, so answers bloat); and **confident hedging** ("Great question! There are many perspectives…" — tone that scores well while committing to nothing). None of these were requested. All of them are the leash set too loose against a judge with blind spots — the demo's last row, wearing a product's UI.

One sentence on the modern shortcut, as promised: **DPO** (Direct Preference Optimization) observes that this leashed objective has that closed-form solution, inverts it, and turns the whole RL apparatus into a simple classification-style loss directly on the preference pairs — no reward model, no sampling loop, same leash baked into the math.

## Hallucination: a classifier, not a database

Now the section this series has been loading for six posts. Ask the finished assistant for a citation and it may hand you a beautifully formatted paper that does not exist — confident, fluent, wrong. Why?

Because the model is a **classifier over next tokens, not a database**. There is no lookup step that can *fail* and return null. Every single token is Part 3's softmax doing the only thing it can do: assign probabilities over 50,000 options and let the sampler draw. When the context is "the seminal paper on this topic is", the distribution over continuations is dense with *plausible-looking citations* — because that's what follows such phrases in training text — whether or not any specific one is real. Cross-entropy training rewards **confident plausibility**: the loss paid `$-\log P$` of what a human actually wrote, and humans who wrote citations were rarely writing "I don't know." There is no "I don't know" token with training signal behind it — abstention was never in the exam's answer key. And RLHF makes it *worse*: [Part 3's calibration aside](@/blog/0007-logistic-regression.md), now at scale — pretrained models are surprisingly well-calibrated (their probabilities roughly track their accuracy), and preference tuning bends that away, because human raters systematically prefer confident, agreeable answers over hedged ones. We taught it manners, and one of the manners was overconfidence.

And before you file the obvious ticket — "just fine-tune it to say I don't know" — notice why that's hard. To write those labels you'd need to know, per question, whether *the model* knows the answer — the boundary of its knowledge, which no one, including the model, has a map of. Label too aggressively and you train reflexive refusal on things it actually knows; too timidly and nothing changes. Abstention training is an active research area precisely because the label depends on the labeled thing.

Say it in Part 2's machinery and the mystery evaporates. The anatomy of one hallucinated citation:

1. **The classifier proposes**: given "the seminal paper is", high probability on author-shaped, year-shaped, title-shaped tokens — plausibility, which is all it was ever trained to score.
2. **The sampler draws**: one of those tokens, at whatever temperature the product set.
3. **Autoregression commits**: the draw enters the context, and every subsequent token dutifully stays *consistent with it* — the fake author now gets a fake plausible year, a fake plausible venue. The loop from Part 5 doesn't fact-check its own appends; it can't.

**Hallucination is a precision failure shipped with a confident probability.** The classifier proposed, the sampler drew, nobody checked. The model isn't lying — lying requires knowing better — **it's sampling.**

Which tells you where the fixes live: not in the weights, in the *system around them*. Ground the prompt with **retrieval** — fetch relevant documents and let the model read instead of recall — and note, with some satisfaction, that you already own that entire stack: RAG is [the mail-sorting machine](@/blog/0002-what-are-embeddings.md) from the embeddings series, embedding queries and documents into a shared map and pulling nearest neighbors into the context window. Demand **citations** so claims are checkable. Add **abstention thresholds** — if retrieval confidence or answer agreement is low, route to "I couldn't verify this" instead of shipping the sample. That is *ship probabilities, decide late*, one final time: the model emits distributions; deciding when a draw is trustworthy enough to show a user is a product decision, made downstream, by the people who own the consequences.

## Sampling in production: pruning the die

Part 5 left generation as "classify, sample, append, repeat" with a temperature dial. Production adds one more idea, and it's about the **tail**. A 50,000-sided die has a lot of faces with 0.01% on them, and per-token nonsense compounds: sample the full distribution honestly and every few dozen tokens you roll a dud, after which the dud is *in the context* and the errors feed on themselves — Holtzman et al. named the result *neural text degeneration*. Go the other way — **greedy**, always the argmax — and you get loops: the most likely continuation of a repeated phrase is often the phrase again, so pure likelihood-chasing walks in circles ("I'm sorry. I'm sorry. I'm sorry."). Maximum-probability text is not human-like text; humans keep surprising you at a steady rate.

(**Beam search** — track the B most probable *sequences* instead of committing token by token — fixes greedy's short-sightedness for tasks with one right answer, like translation, and makes open-ended text *worse*: it finds even higher-probability text, which is even more repetitive. Likelihood was the wrong objective for prose, and searching it harder doesn't help.)

So production samplers prune the die before rolling it. **Top-k**: keep only the k highest-probability tokens, renormalize. **Nucleus (top-p)**: keep the smallest set whose cumulative probability exceeds p — an *adaptive* k that keeps 1 token when the model is sure and 50 when it's torn. One fixed logit vector, four strategies:

```python
import numpy as np
np.random.seed(42)
vocab  = ["mat", "floor", "couch", "sofa", "rug", "table",
          "moon", "law", "photosynthesis", "torpedo"]
logits = np.array([4.0, 3.6, 3.1, 2.7, 2.2, 1.8, 0.2, -0.6, -1.6, -2.4])

def softmax(z):
    e = np.exp(z - z.max())
    return e / e.sum()

def draw(p, n=10):
    return " ".join(np.random.choice(vocab, size=n, p=p))

p = softmax(logits)
print("full dist:", " ".join(f"{v}:{q:.3f}" for v, q in zip(vocab, p)))
print(f"\ngreedy     : {' '.join([vocab[int(np.argmax(p))]] * 10)}")
print(f"T=1.0 full : {draw(p)}")
print(f"T=0.7      : {draw(softmax(logits / 0.7))}")

k = 3                                   # top-k: silence all but k logits
zk = np.where(logits >= np.sort(logits)[-k], logits, -np.inf)
print(f"top-k k=3  : {draw(softmax(zk))}")

order = np.argsort(p)[::-1]             # nucleus: smallest set covering 90%
keep = order[: int(np.searchsorted(np.cumsum(p[order]), 0.90)) + 1]
zp = np.full(len(logits), -np.inf); zp[keep] = logits[keep]
print(f"top-p 0.9  : {draw(softmax(zp))}  (kept {len(keep)} of {len(vocab)})")
```

Read the ten draws per row. Greedy is "mat" forever — deterministic, loop-prone. Full sampling at `$T = 1$` mostly picks sensible furniture but the tail leaks through given enough rolls — that leak, compounded over a paragraph, is degeneration. `$T = 0.7$` sharpens without truncating; the tail is *unlikelier*, not *impossible*. Top-k and nucleus **cut the tail outright**: "photosynthesis" now has literally zero probability, not small probability — and nucleus decided how many faces to keep by looking at the distribution's own shape. Every serious deployment stacks these: a temperature *and* a truncation, tuned per surface. And "per surface" is the point — temperature is a **product surface**, Part 5's "product decision, not a truth knob" cashed out: your code assistant runs near-greedy at `$T \approx 0.2$` because there's usually one right token; your brainstorming feature runs `$T \approx 0.9$` with nucleus because variety *is* the product. Same weights. Same probabilities. Different products.

One parameter-sheet observation to take to work tomorrow: every knob in this section lives *after* the trained model, in the half-dozen decoding parameters your API exposes — `temperature`, `top_p`, `top_k`, penalties for repetition. That's the entire product surface of a multi-billion-parameter classifier, and it deserves the same treatment as any other config that changes user-visible behavior: set per feature, documented, versioned next to the prompt. "We turned the temperature up and support tickets got weird" is a real postmortem sentence; make it a greppable diff instead.

## Swapping the model is still an API break

Long-time readers already know how this section ends, because [the embeddings series finale](@/blog/0004-what-are-drift.md) wrote it: swapping an embedding model breaks every stored vector and every tuned threshold — same wire format, different semantics. Generalize it. Your product's prompts — the system prompt you spent three weeks tuning, the few-shot examples, the "respond only in JSON" incantations — were all calibrated against *one specific model's* learned distribution, including its SFT persona and its RLHF checkpoint. Swap the model — or accept a silent provider-side checkpoint bump — and every one of those prompts still *parses*. Strings in, strings out; nothing crashes. But the behaviors they elicited were properties of the old weights, and some of them are gone. **Prompts are the new thresholds that don't transfer. Eval suites are the new anchor sets.** A model is a frozen judgment, and you just swapped judges.

So run 0004's playbook, translated:

- [ ] **Version the pipeline**, not the model name: checkpoint, system prompt, few-shot examples, temperature, truncation settings. Any change to any of it is a new version.
- [ ] Keep a **task-level eval suite** — real prompts, graded outcomes — and trust it more than the provider's changelog. It's the anchor set, reborn.
- [ ] On upgrade: **shadow-read** (run both models, compare offline), **canary** (a slice of traffic), and keep **rollback** live until the numbers settle.
- [ ] Re-tune the sampler and re-audit refusal/abstention behavior per model; those were calibrated too.

The upgrade playbook was never really about embeddings.

## What I skipped, honestly

Four omissions, flagged. **The RL algorithm itself**: I gave the objective and its closed-form optimum, not the machinery (PPO and friends) that chases it when you can't enumerate responses — a rich engineering topic that changes no conclusion here. **RLAIF and constitutional methods**: the rankings can come from another model steered by written principles instead of from humans; cheaper labels, same recipe. **Safety training**: refusals are trained with the same two phases — demonstrations plus preferences — and inherit the same Goodhart risks in both directions. **System prompts and tool use**: much of what a deployed assistant "is" lives in a context-window preamble and its wiring to external tools, downstream of everything in this post — weights are only part of the product.

## Closing thoughts

Both promises, kept.

This series opened with three candidate lines through a scatter plot and the claim that "which fits best depends on the loss" would carry us to ChatGPT. Trace the line: a **linear score** (Part 1's weighted opinion poll) → a **sigmoid vote** with probabilities shipped and decisions made late (Part 2) → **softmax + cross-entropy**, the machine to remember, with `$g = p - y$` as the entire learning signal (Part 3) → a **committee** whose hidden layers redraw the map (Part 4) → that same softmax head over a 50,000-token vocabulary, graded by labels that write themselves (Part 5) → **attention** assembling the context, dot products all the way down, gather then think (Part 6) → and today, three phases of training: self-supervision buys the knowledge, handwritten examples buy the costume, and a regression with a leash buys the manners. **It's regressions all the way down, stacked, wired, and taught manners.** No step required a new kind of mathematics; every step required a new level of care.

And the embeddings series closes with it, because they were one story told from two ends: the mail-sorting machine's map turned out to be the first layer of the language model, InfoNCE's exam turned out to be softmax's exam, the retrieval stack turned out to be hallucination's best medicine, and "model swap is an API break" turned out to be true one abstraction level up, prompts and evals replacing thresholds and anchors. So the discipline note that closed 0004 closes everything: none of this is magic. It's classifiers and regressions with excellent tooling — so version it, measure it at the level that pays the bills, and ship it with an undo button. What the middle layers actually *compute* — what those N rounds of gather-then-think are doing between the embedding and the vote — is still substantially an open question, and a genuinely good one. But that's a mystery for another day. The machine, at least, is no longer one.

Thank you for walking the whole line. If someone asks you what a language model is, you now own a one-breath answer with nothing false in it: a softmax classifier over a vocabulary, fed by attention, trained on the internet, dressed by fine-tuning, groomed by a leashed regression — and sampled, carefully, by people who own the consequences.

## Further reading

- **Christiano, P. et al., "Deep Reinforcement Learning from Human Preferences" (NeurIPS, 2017)** — the origin of the recipe: humans rank pairs of behaviors, a reward model regresses the rankings, the policy optimizes the reward model. Demonstrated on backflipping simulated robots, years before chat.
- **Ouyang, L. et al., "Training Language Models to Follow Instructions with Human Feedback" (2022)** — InstructGPT: this post's three phases as a production pipeline, including the finding that a 1.3B tuned model beat a 175B raw one on human preference. The paper behind the product.
- **Holtzman, A., Buys, J., Du, L., Forbes, M. & Choi, Y., "The Curious Case of Neural Text Degeneration" (ICLR, 2020)** — why greedy loops and the raw tail unravels, with the nucleus-sampling fix; the sampling section's evidence base.
