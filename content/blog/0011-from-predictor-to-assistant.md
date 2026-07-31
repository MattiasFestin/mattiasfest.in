+++
title = "From lines to language models: Part 7 - From predictor to assistant"
date = 2026-09-11
description = "Ask a raw pretrained model \"What is the capital of Sweden?\" and it may answer with more exam questions. The predictor is doing its job perfectly; you asked for the next token when you wanted an assistant. The finale: supervised fine-tuning is the same cross-entropy on a tiny handwritten dataset, RLHF is a regression-shaped reward model with a KL leash to stop Goodharting, and hallucination is a precision failure shipped with a confident probability. Both series close: it's regressions all the way down, stacked, wired, and taught manners."

[extra]
linkedin = "Finale of From lines to language models: ask a raw pretrained model a question and it may answer with more exam questions. It's doing its job perfectly; you just asked for the next token when you wanted an assistant. SFT is the same cross-entropy on a tiny handwritten dataset, RLHF is a regression on human taste with a KL leash, and hallucination is a precision failure, not lying. It's regressions all the way down."
tags = ["ml", "llm", "rlhf", "fine-tuning", "hallucination", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 7, the finale, of "From lines to language models." Parts [1](@/blog/0005-linear-regression.md) through [6](@/blog/0010-attention.md) went from a straight line through five points to a full transformer: tokens → embeddings → N × (attend + think) → a 50,000-way softmax vote. Part 6 signed off on a warning, which is where this post starts: that machine is autocomplete for the internet, not an assistant. The closing thoughts trace the whole line back; the rest of the post closes the gap, and both series.*

Take the machine Part 6 finished (pretrained, nothing else) and type:

> What is the capital of Sweden?

Here are three continuations it might assign high probability, all of them excellent predictions:

> What is the capital of Sweden?
> **What is the capital of Norway? What is the capital of Finland?**

> What is the capital of Sweden? **a) Stockholm b) Oslo c) Helsinki d) Copenhagen**

> What is the capital of Sweden? **— a question every geography student knows by heart.**

Not one of them *answers* you, and the model has made zero mistakes. On the internet it was trained to imitate, a lone quiz question is usually followed by more quiz questions, answer options, or commentary about the question. Documents opening with that string rarely continue "Stockholm." The predictor is doing its job perfectly; you asked for the wrong thing. **You asked for the next token; you wanted an assistant.** Closing that gap takes no new architecture (Part 6 was emphatic: there is no other component), just two more phases of training bolted onto pretraining. This post walks all three, then spends the rest of the finale on what the finished machine gets wrong: why it invents citations, how it's really sampled, and why replacing it breaks your product.

**TL;DR**

- **Pretraining** is Parts 5–6 at GPU-year scale. It buys a **simulator of internet text**, and it's where *all the knowledge lives*: the later phases add zero facts.
- **Supervised fine-tuning (SFT)** is the same cross-entropy on a *tiny* handwritten set of (instruction, response) pairs. The labels stop writing themselves; humans write them again, full circle to Part 2's spam corpus. It moves probability mass between behaviors the model already has, which is why it's the wrong tool for adding facts, and why using it anyway makes hallucination worse.
- **RLHF**: humans can't *write* ideal responses in bulk, but they can *rank* them. A **reward model** regresses the rankings (it outputs a score, so: Part 1 in a trench coat), and the LM optimizes against it on a **KL leash**. Drop the leash and you get **reward hacking**, Goodhart's law with a learning rate. (DPO skips the RL and optimizes the preferences directly.)
- **Hallucination**: the model is a classifier over next tokens, not a database. Cross-entropy pays for confident plausibility, no "I don't know" token has training signal behind it, and RLHF makes calibration *worse*. The fixes are systems fixes: retrieval, citations, abstention. Ship probabilities, decide late, one last time.
- **Sampling in production**: greedy loops and the raw tail degenerates, so we prune the die with top-k or nucleus. A demo races five decoding strategies on one logit vector, then prices the tail.
- **Swapping your LLM is an API break** with the wire format intact: the [embeddings-series lesson](@/blog/0004-what-are-drift.md), generalized. Prompts are the new thresholds; eval suites are the new anchor sets.

Three phases, one table, then each in turn. The sizes *are* the insight:

| | **Pretraining** | **SFT** | **RLHF** |
|---|---|---|---|
| Data | trillions of tokens of raw text | ~10⁴–10⁵ handwritten (instruction, response) pairs | ~10⁵–10⁶ human preference rankings |
| Labels | write themselves (Part 5) | humans write them (Part 2, again) | humans *rank*, a model regresses the rankings |
| Loss | cross-entropy | cross-entropy, same machine | reward − β·KL (or DPO's classification loss) |
| Cost | GPU-years | days | days–weeks |
| Buys | all the knowledge | the persona | the preferences, the overconfidence |

## Phase 1: pretraining, where all the knowledge lives

Nothing new to build here; this is Parts 5 and 6, priced. Next-token prediction over trillions of tokens, softmax + cross-entropy, `$g = p - y$` flowing back through N blocks of gather-then-think into the embedding table. The labels write themselves, which is the only reason the bill is payable at all, and the bill is the story: **GPU-years** and tens of millions of dollars, buying one thing completely. Every fact the finished assistant will ever "know" (Stockholm, the syntax of Rust, the boiling point of nitrogen) is compressed into the weights *during this phase*, because knowing facts lowers cross-entropy on text written by people who knew them.

What you get for the money is worth naming precisely: a **simulator of internet text**, a machine that, given any prefix, continues it the way the internet statistically would. That's why the hook's completions were all correct behavior. It contains an assistant, because helpful Q&A exists in the training data. It equally contains exam compilers and forum trolls, and a bare question doesn't say which document you're in. The remaining two phases are about *selecting the assistant out of the simulator*. They are astonishingly small by comparison, and that asymmetry is the single most load-bearing fact in this post.

One historical beat, because it explains a whole profession: before SFT was standard, the workaround was to *trick the simulator*. If a bare question predicts more quiz questions, write a prompt that looks like a document whose likeliest continuation is what you want. Stack three examples of "Q: … A: …" and the model, mid-document, continues the pattern. That's **few-shot prompting**, the GPT-3 paper's headline trick, and nothing is "learned" at runtime: the classifier is handed a context in which the helpful continuation is finally the *probable* one. Prompt engineering was born as simulator steering. The next two phases bake the steering into the weights.

## Phase 2: supervised fine-tuning, a costume change rather than a brain transplant

The fix sounds almost too cheap: keep training, same objective, but swap the data. Instead of the open internet, a **curated dataset of (instruction, good response) pairs**: tens of thousands of examples, written or vetted by paid humans, in the exact format you want the product to speak (question in, direct helpful answer out). The loss is cross-entropy on the response tokens. That is Part 3's machine to remember, the same `$-\log P(\text{truth})$` that trained the spam filter and the whole pretraining run, on its third appearance with no new math.

But notice what reversed. Part 5's triumph was that **the labels write themselves**: any text is training data. Here a human sits down and *writes the response we wish the model would give*, exactly like Part 2's human stamping spam/not-spam on emails. Self-supervision bought the knowledge; hand-labeling buys the behavior, and the economics survive only because of the asymmetry: trillions of free labels to learn what Stockholm *is*, thousands of expensive ones to learn that a question deserves an answer.

And be precise about what SFT does, because the misreading causes real production mistakes: the model **does not gain knowledge** from 50,000 examples. It couldn't; that's a rounding error against the pretraining corpus. What changes is *which of its existing behaviors get probability mass*. The simulator could always play the helpful assistant. It could also always play the poet and the paralegal, having learned all three from people who were being all three, and nothing in the weights ever picked. SFT doesn't install a persona; it promotes one out of a crowd that was already in there. Same facts, same blind spots, now wearing a name tag that says "how can I help?" (A system prompt is that same promotion done at runtime, cheaply and reversibly, which is the whole reason "you are a meticulous paralegal" does anything at all.)

Which makes the expensive version of the misreading worth naming: teams reach for fine-tuning to *add* facts (our product docs, our ticket history) and ship a model that is wrong more often and surer about it. The mechanism is Part 3's, unchanged. `$g = p - y$` can raise the probability of the token you labeled; it cannot build the thing that would make that token *right*. Train hard on answers the model has no way to derive and what generalizes isn't the answers, it's the posture: questions of this shape get answered without hesitating. Gekhman et al. measured exactly that, finding new-knowledge examples are learned slowly and that the model's tendency to hallucinate on what it *did* know climbs roughly linearly as it fits them. The tool for new facts is retrieval, which is the next section's punchline arriving early.

## Phase 3: RLHF, a reward model and a leash

SFT has a ceiling built into its labels: it can only teach the model to imitate what humans *wrote*, and human writing is expensive, inconsistent, and often not even the best the *model* could do. The asymmetry that unlocks the next phase: a person who couldn't write a great explanation of monads in an hour can tell you *which of two explanations is better* in thirty seconds. **Ranking is cheaper than writing.** So: sample two responses from the model, show both to a human, record which one they preferred. Repeat a few hundred thousand times.

Now turn those rankings into a training signal. Train a **reward model**: a network that eats (prompt, response) and outputs a single scalar, how much would a human like this? You can smell what that is from nine posts away: *a score is a regression.* Part 1's weighted opinion poll, Part 2's "regression predicts a quantity"; here the quantity is human approval, learned from preference pairs (the loss just pushes the preferred response's score above the rejected one's). The judge of the most talked-about AI systems on earth is the humblest object in this series.

Then optimize the language model to score well against that reward model (this is the "RL" in RLHF), with one non-negotiable term bolted on:

```math
\max_\theta \;\; \mathbb{E}_{y \sim \pi_\theta}\!\bigl[R(y)\bigr] \;-\; \beta \,\mathrm{KL}\!\bigl(\pi_\theta \,\|\, \pi_{\text{base}}\bigr)
```

Maximize reward, *minus* `$\beta$` times the KL divergence between the new model and the SFT model it started from. That second term is a **leash**, and the reason for it is Goodhart's law, stated plainly: **when a measure becomes a target, it ceases to be a good measure.** The reward model is a lossy regression *of* human judgment, wrong in exploitable places. Unleashed, gradient ascent will find those places with industrial efficiency: the model discovers that the reward model overrates flattery, or hedging, or confident length, and collapses its entire distribution onto the exploit. That failure has a name, **reward hacking**, and a demo:

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

<!-- output -->

The optimum of that objective has a closed form, `$q \propto \pi_{\text{base}} \cdot e^{R/\beta}$`, so the demo needs no RL loop, just arithmetic. Read the printout top to bottom: at `$\beta = 5$` the policy barely moves off the base, and at `$\beta = 1$` it leans toward what the reward model likes while staying diverse. At `$\beta = 0.05$`, leash off, entropy craters and essentially *all* mass lands on "flattery," the one response the reward model overrates, from a base that gave it 10%. The leash is what stands between "slightly more agreeable assistant" and "sycophancy generator." (`$\beta$`'s job may look familiar: it's a temperature on the reward, one more member of the knob family from Parts 3, 5 and 6.)

The toy exploit was "flattery," and the real ones are embarrassingly close to it. Documented reward hacks in production RLHF: **sycophancy** (raters prefer answers that agree with the question's premise, so the model agrees with you, including when you're wrong); **length bias** (raters read long as thorough, so answers bloat); **confident hedging** ("Great question! There are many perspectives…", tone that scores well while committing to nothing). None were requested. All are the leash set too loose against a reward model with blind spots: the demo's last row, wearing a product's UI.

The modern shortcut in one sentence: **DPO** (Direct Preference Optimization) observes that this leashed objective has that closed-form solution, inverts it, and turns the whole RL apparatus into a simple classification-style loss directly on the preference pairs, with no reward model, no sampling loop, and the same leash baked into the math.

## Hallucination: a classifier, not a database

Now the section this series has been loading for six posts. Ask the finished assistant for a citation and it may hand you a beautifully formatted paper that does not exist: fluent, confident, and wrong. Why?

Because the model is a **classifier over next tokens, not a database**. There is no lookup step that can *fail* and return null. Every single token is Part 3's softmax doing the only thing it can do: assign probabilities over 50,000 options and let the sampler draw. Cross-entropy training rewards **confident plausibility**: the loss paid `$-\log P$` of what a human actually wrote, and humans who wrote citations were rarely writing "I don't know." There is no "I don't know" token with training signal behind it; abstention was never in the exam's answer key. And RLHF makes it *worse*. This is [Part 3's calibration aside](@/blog/0007-logistic-regression.md) at scale: pretrained models are surprisingly well-calibrated, their probabilities roughly tracking their accuracy, and preference tuning bends that away, because raters systematically prefer confident, agreeable answers to hedged ones. We taught it manners, and one of the manners was overconfidence.

And before you file the obvious ticket ("just fine-tune it to say I don't know"), notice why that's hard: to write those labels you'd need to know, per question, whether *the model* knows the answer. That's the boundary of its knowledge, which nobody, including the model, has a map of. Label too aggressively and you train reflexive refusal on things it does know; too timidly and nothing changes. Abstention training is an open research area because the label depends on the labeled thing.

Say it in Part 2's machinery and the mystery evaporates. The anatomy of one hallucinated citation:

1. **The classifier proposes**: given "the seminal paper is", high probability on author-shaped, year-shaped, title-shaped tokens: plausibility, which is all it was ever trained to score.
2. **The sampler draws**: one of those tokens, at whatever temperature the product set.
3. **Autoregression commits**: the draw enters the context, and every subsequent token stays *consistent with it*, so the fake author now gets a fake plausible year and a fake plausible venue. The loop from Part 5 doesn't fact-check its own appends; it can't.

**Hallucination is a precision failure shipped with a confident probability.** The classifier proposed, the sampler drew, nobody checked. The model isn't lying (lying requires knowing better), **it's sampling.**

Which tells you where the fixes live: in the *system around the weights*. Ground the prompt with **retrieval** (fetch documents and let the model read instead of recall), and note, with some satisfaction, that you already own that stack: RAG is [the mail-sorting machine](@/blog/0002-what-are-embeddings.md) from the embeddings series, embedding queries and documents into one map and pulling nearest neighbors into the context window. Demand **citations**, so claims are checkable. Add **abstention thresholds**: when retrieval confidence or answer agreement is low, route to "I couldn't verify this" instead of shipping the sample. That is *ship probabilities, decide late*, one final time: the model emits distributions; deciding when a draw is trustworthy enough to show a user is a product decision, made downstream, by the people who own the consequences.

## Sampling in production: pruning the die

Part 5 left generation as "classify, sample, append, repeat" with a temperature dial. Production adds one more idea, and it's about the **tail**. A 50,000-sided die has a lot of faces carrying 0.01%, and sampling honestly means rolling them. Go the other way, to **greedy** decoding that always takes the argmax, and you get loops: the most likely continuation of a repeated phrase is often the phrase again, so pure likelihood-chasing walks in circles ("I'm sorry. I'm sorry. I'm sorry."). Maximum-probability text is not human-like text; humans keep surprising you at a steady rate.

(**Beam search**, which tracks the B most probable *sequences* instead of committing token by token, fixes greedy's short-sightedness for tasks with one right answer, like translation, and makes open-ended text *worse*: it finds even higher-probability text, which is even more repetitive. Likelihood was the wrong objective for prose, and searching it harder doesn't help.)

So production samplers prune the die before rolling it. **Top-k**: keep only the k highest-probability tokens, renormalize. **Nucleus (top-p)**: keep the smallest set whose cumulative probability exceeds p, an *adaptive* k that keeps 1 token when the model is sure and 50 when it's torn. One fixed logit vector, five strategies, and then a measurement that actually separates them:

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

# ten draws is far too few to see the tail. Score 2,000 paragraphs of 200 tokens:
tail = set(vocab[6:])                   # words no sane sentence wants here
print()
for name, q in [("T=1.0 full", p), ("T=0.7", softmax(logits / 0.7)),
                ("top-k k=3", softmax(zk)), ("top-p 0.9", softmax(zp))]:
    spoiled = sum(any(w in tail for w in np.random.choice(vocab, 200, p=q))
                  for _ in range(2000))
    print(f"{name:10} : tail mass {q[6:].sum():.4f}"
          f" -> {spoiled / 20:5.1f}% of 200-token paragraphs contain a dud")
```

<!-- output -->

Greedy is "mat" forever: deterministic and loop-prone, exactly as advertised. Then read the four sampled rows and notice that nothing bad happens in any of them, which is the actual lesson. The tail is 1.4% of this die. Ten draws is nowhere near enough evidence to convict it, and neither is the paragraph of output you eyeballed before shipping.

So the demo scores paragraphs instead, and there the strategies separate. Sample the model's honest verdict and **94.5%** of 200-token paragraphs contain at least one word with no business being there. Worse than the number looks, too, because a dud doesn't stay a dud: it lands in the context, and every token after it is conditioned on a sentence that already went wrong. Holtzman et al. named the spiral *neural text degeneration*. `$T = 0.7$` thins the tail without cutting it, which is all a temperature can do and exactly why it isn't enough alone: still **45.0%** of paragraphs spoiled. Top-k and nucleus **cut the tail outright**, from small probability to zero, and **0.0%** isn't a better number than 45%, it's a different kind of number. Nucleus also worked out *how many* faces to keep by reading the distribution's own shape: five here, one if the model had been sure.

Which is why every serious deployment stacks both, a temperature *and* a truncation, tuned per surface. And notice where all of it lives: *after* the trained model, in the half-dozen decoding parameters your API exposes (`temperature`, `top_p`, `top_k`, penalties for repetition). That is the entire product surface of a multi-billion-parameter classifier, and it deserves what any other behavior-changing config gets: documented and versioned next to the prompt. "We turned the temperature up and support tickets got weird" is a real postmortem sentence. Make it a greppable diff instead.

## Swapping the model is still an API break

Long-time readers know how this section ends, because [the embeddings series finale](@/blog/0004-what-are-drift.md) wrote it: swapping an embedding model breaks every stored vector and every tuned threshold, same wire format, different semantics. Generalize it. Your prompts (the system prompt you spent three weeks tuning, the few-shot examples, the "respond only in JSON" incantations) were calibrated against *one specific model's* learned distribution, SFT persona and RLHF checkpoint included. Swap the model, or accept an unannounced provider-side checkpoint bump, and every one of them still *parses*. Strings in, strings out, nothing crashes. But the behaviors they elicited were properties of the old weights, and some are gone. **Prompts are the new thresholds that don't transfer. Eval suites are the new anchor sets.** A model is a frozen judgment, and you just swapped judges.

So run that playbook, translated:

- [ ] **Version the pipeline**, not the model name: checkpoint, system prompt, few-shot examples, temperature, truncation settings. Any change to any of it is a new version.
- [ ] Keep a **task-level eval suite** (real prompts, graded outcomes) and trust it more than the provider's changelog. It's the anchor set, reborn.
- [ ] On upgrade: **shadow-read** (run both models, compare offline), **canary** (a slice of traffic), and keep **rollback** live until the numbers settle.
- [ ] Re-tune the sampler and re-audit refusal/abstention behavior per model; those were calibrated too.

The upgrade playbook was never really about embeddings.

## What I skipped

Four omissions, flagged. **The RL algorithm itself**: I gave the objective and its closed-form optimum, not the machinery (PPO and friends) that chases it when you can't enumerate responses. Rich engineering, no change to any conclusion here. **RLAIF and constitutional methods**: the rankings can come from another model steered by written principles, which buys cheaper labels on the same recipe. **Safety training**: refusals use the same two phases, demonstrations plus preferences, and inherit the same Goodhart risks in both directions. **System prompts and tool use**: much of what a deployed assistant "is" lives in a context-window preamble and its wiring to external tools, downstream of everything here, so the weights are only part of the product.

## Closing thoughts

Two series end here, so let's check the receipts.

Part 1 opened on five points, three candidate lines, and three scoring rules that crowned three different winners. It closed on a sentence I have been waiting seven weeks to collect: *somewhere inside every training run, a person decided what counts as wrong.* Back there it sounded like philosophy, the sort of thing you nod at and move past. It isn't philosophy. It's a job description. Phase 3 is that sentence with a budget attached: several hundred thousand pairwise rankings, bought from paid humans, regressed into one scalar, then installed as the definition of *wrong* for some of the most-used software on earth. The sycophancy is not a defect in the mathematics. It's what those raters preferred, learned faithfully, at scale.

So trace the line: a **linear score** (Part 1's weighted opinion poll) → a **sigmoid vote**, probabilities shipped and decisions made late (Part 2) → **softmax + cross-entropy**, the machine to remember, with `$g = p - y$` as the entire learning signal (Part 3) → a **committee** whose hidden layers redraw the map (Part 4) → that same softmax head over 50,000 tokens, graded by labels that write themselves (Part 5) → **attention** assembling the context, gather then think (Part 6) → and today, three phases: self-supervision buys the knowledge, handwritten examples buy the costume, a leashed regression buys the manners. **It's regressions all the way down, stacked, wired, and taught manners.** No step required a new kind of mathematics; every step required a new level of care.

And the embeddings series closes with it, because they were one story told from two ends: the mail-sorting machine's map turned out to be the language model's first layer, and InfoNCE's exam turned out to be softmax's exam. The retrieval stack is hallucination's best medicine, and "model swap is an API break" holds one abstraction level up too, with prompts and evals replacing thresholds and anchors. So the discipline note that closed the embeddings series closes everything: this is classifiers and regressions with excellent tooling. Version it, measure it at the level that pays the bills, and ship it with an undo button. What the middle layers actually *compute*, what those N rounds of gather-then-think are doing between the embedding and the vote, is still substantially open, and a genuinely good question. But that's a mystery for another day. The machine, at least, is no longer one.

Thank you for walking the whole line. If someone asks you what a language model is, you now own a one-breath answer with nothing false in it: a softmax classifier over a vocabulary, fed by attention, trained on the internet, dressed by fine-tuning, groomed by a leashed regression, and sampled, carefully, by people who own the consequences.

## Further reading

- **Christiano, P. et al., "Deep Reinforcement Learning from Human Preferences" (NeurIPS, 2017)**: the origin of the recipe. Humans rank pairs of behaviors, a reward model regresses the rankings, the policy optimizes the reward model. Demonstrated on backflipping simulated robots, years before chat.
- **Ouyang, L. et al., "Training Language Models to Follow Instructions with Human Feedback" (2022)**: InstructGPT, this post's three phases as a production pipeline, including the finding that a 1.3B tuned model beat a 175B raw one on human preference. The paper behind the product.
- **Gekhman, Z. et al., "Does Fine-Tuning LLMs on New Knowledge Encourage Hallucinations?" (EMNLP, 2024)**: the measurement behind Phase 2's warning. Examples carrying knowledge the base model lacks are fit slowly, and as it finally fits them, its tendency to hallucinate on knowledge it already had climbs roughly linearly. Evidence that SFT elicits what's there rather than installing what isn't.
- **Holtzman, A., Buys, J., Du, L., Forbes, M. & Choi, Y., "The Curious Case of Neural Text Degeneration" (ICLR, 2020)**: why greedy loops and the raw tail unravels, with the nucleus-sampling fix; the sampling section's evidence base.

### Visual guide

- **3Blue1Brown, ["Large Language Models explained briefly"](https://www.3blue1brown.com/lessons/mini-llm) (2024)**: a visual overview of the post's arc from next-token pretraining to RLHF-tuned chatbots.
