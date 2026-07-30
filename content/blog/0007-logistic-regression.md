+++
title = "From lines to language models: Part 3 - Logistic regression, a line that votes"
date = 2026-08-14
description = "Part 1's linear score was secretly a log-odds all along: solve log(p/(1−p)) = s for p and the sigmoid falls out, nothing decreed. Maximum likelihood on Bernoulli labels hands you cross-entropy, a loss that charges confident wrongness unboundedly and confident correctness nothing, and its gradient collapses to (σ(s)−y)·x, which is Part 1's MSE gradient with the prediction renamed and the vanishing σ′ from Part 2 cancelled clean away. Softmax extends the vote to K classes, sigmoid turns out to be softmax with two, and the whole machine is the InfoNCE loss from the embeddings series under another name."

[extra]
linkedin = "Part 3 of From lines to language models: nobody decreed the sigmoid. Ask for a probability whose log-odds is your linear score and it falls out. Maximum likelihood hands you cross-entropy, and its gradient is linear regression's gradient with the prediction renamed. This loss runs everything later in the series."
tags = ["ml", "logistic-regression", "classification", "cross-entropy", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 3 of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) built the weighted opinion poll `$\hat{y} = w \cdot x + b$` and the gradient-descent engine; [Part 2](@/blog/0006-classification-vs-regression.md) watched squared error fine that poll for being confidently right and left a wish list: squash the score, keep it calibrated, and vanish nowhere. This post pays that off.*

Pick up Part 2's spam filter exactly where we left it. The linear scorer looks at an email and says `$s = 2.3$`. Your boss looks at the dashboard and asks the only reasonable question: **how spam-ish is 2.3?**

You genuinely can't answer. The score is unbounded and unit-free: another email scores 6.0, a third scores −0.4, and nothing about the number 2.3 says whether that's "coin flip" or "bet the house." Worse, the scale is an accident of training: double every weight and every score doubles while every verdict stays identical, so the raw magnitude carries no portable meaning. What *does* survive rescaling is the thing we actually care about: which side of the boundary, and how far. Part 2's marching order was **ship probabilities, decide late**, so we need a canonical translation from signed-distance-to-the-boundary into a probability.

There is exactly one translation with a defensible pedigree, and it turns 2.3 into roughly 10-to-1 odds: about 91% spam. By the end of this post you'll see where that number comes from, and why the loss that trains it hands back the *same gradient* we derived for plain least squares in Part 1.

**TL;DR**

- The **sigmoid** isn't decreed, it's derived: declare that the linear score *is* the **log-odds**, `$\log \frac{p}{1-p} = w \cdot x + b$`, solve for `$p$`, and `$\sigma(s) = 1/(1+e^{-s})$` falls out.
- The model is `$P(y{=}1 \mid x) = \sigma(w \cdot x + b)$`. The decision boundary `$\sigma = 0.5$` is exactly `$w \cdot x + b = 0$`, a hyperplane. The sigmoid changes what the model reports, not where the boundary sits.
- Maximum likelihood on Bernoulli labels produces **cross-entropy**: `$-\log$` of the probability you gave the truth. Honest uncertainty costs little; confident wrongness costs `$-\log p \to \infty$`.
- The punchline: cross-entropy's gradient is `$(\sigma(s) - y)\,x$`, which is **Part 1's `$(\hat{y} - y)\,x$` with the prediction renamed**. The `$\sigma'$` that strangled Part 2's gradient cancels against the log's derivative, so nothing vanishes anywhere.
- The loss is **convex** in `$w$`: one valley, so gradient descent just works. There is no closed form, so Part 1's normal-equations luxury is officially over, and on perfectly separable data the valley has no floor at all.
- **Softmax** is the K-class ending: K score lines, exponentiate-and-normalize, and sigmoid is literally softmax with two classes. Softmax + cross-entropy is the machine to remember; the rest of this series is built out of it.

## The score was a log-odds all along

Gamblers had the right representation centuries before ML did: **odds**. Probability 0.5 is odds of 1:1; probability 0.9 is 9:1; probability 0.99 is 99:1. Odds live on `$(0, \infty)$`, and taking the log stretches them onto the whole real line: log-odds 0 means coin flip, +2.3 means about 10:1 for, −2.3 means about 10:1 against, symmetric and unbounded in both directions.

That is precisely the shape of our linear score: unbounded, symmetric, zero at maximum doubt. So make it official. *Declare* that the opinion poll computes the log-odds:

```math
\log \frac{p}{1-p} = s = w \cdot x + b
```

and solve for `$p$`. Exponentiate: `$\frac{p}{1-p} = e^s$`. Multiply out: `$p = e^s - p\,e^s$`, so `$p\,(1 + e^s) = e^s$`, and

```math
p = \frac{e^s}{1 + e^s} = \frac{1}{1 + e^{-s}} \;=\; \sigma(s)
```

That's the **sigmoid** (also *logistic function*, hence the name of everything here). We didn't pick an S-shaped curve out of a catalog; we picked an *interpretation of the score* and the curve was forced. Its properties are the log-odds facts restated: `$\sigma(0) = 0.5$` (zero log-odds is a coin flip), `$\sigma(-s) = 1 - \sigma(s)$` (evidence against is mirror-image evidence for), and it **saturates**: past `$|s| \approx 6$` the output is pinned within a quarter-percent of 0 or 1, because 400:1 odds and 40,000:1 odds are both, verdict-wise, "sure."

```python
import numpy as np
sigmoid = lambda s: 1 / (1 + np.exp(-s))

print(f"{'score s':>8}   {'sigma(s)':>8}   {'odds':>10}")
for s in [-6.0, -2.3, -1.0, 0.0, 1.0, 2.3, 6.0]:
    p = sigmoid(s)
    print(f"{s:+8.1f}   {p:8.4f}   {p/(1-p):7.3f} : 1")

print(f"\nsigma(2.3) + sigma(-2.3) = {sigmoid(2.3) + sigmoid(-2.3):.6f}   (mirror around 0.5)")
print(f"sigma(40)  = {sigmoid(40):.16f}   (saturated flat)")
```

Read the odds column: it's literally `$e^s$` (check `$s = 1$`: odds of `$e \approx 2.718$` to 1). And there's the boss's answer: a score of 2.3 is `$e^{2.3} \approx 10$` to 1, `$\sigma(2.3) \approx 0.909$`. **91% spam**, by unit conversion rather than vibe.

## The model, and where the line went

The full model is one composition:

```math
P(y{=}1 \mid x) = \sigma(w \cdot x + b)
```

Same weighted opinion poll from [Part 1](@/blog/0005-linear-regression.md), same weights-times-features-plus-baseline, then one squash at the end. And look at what the default verdict rule does: predict spam when `$\sigma(s) \geq 0.5$`, which by the coin-flip property is exactly `$s \geq 0$`, which is exactly `$w \cdot x + b \geq 0$`: a hyperplane, the same flat separating boundary a raw linear scorer draws. **The line didn't go anywhere; it just learned to express doubt.** Near the boundary the model says 0.53, far from it 0.98, and downstream consumers apply their own costs and cutoffs, which Part 2 established is their call, not the model's.

## The loss: maximum likelihood, no improvisation

Part 1 pulled this move for MSE: assume Gaussian noise, maximize likelihood, squared error falls out. Same move here, different noise. A binary label is a **Bernoulli** draw: with `$p = \sigma(w \cdot x + b)$`, the probability the model assigns to an observed label `$y \in \{0, 1\}$` is `$p$` if `$y = 1$` and `$1-p$` if `$y = 0$`, or in one expression, `$p^y (1-p)^{1-y}$`.

The likelihood of the whole dataset is the product over points; logs turn products into sums; and minimizing the *negative* log-likelihood gives the loss:

```math
\mathcal{L} = -\frac{1}{n} \sum_{i=1}^{n} \Bigl[\, y_i \log p_i + (1 - y_i) \log (1 - p_i) \,\Bigr]
```

This is **cross-entropy**, a.k.a. **log-loss**, and it reads cleanly: for each point, look up *the probability the model gave to what actually happened* and charge `$-\log$` of it. That fee schedule is exactly what Part 2 ordered. Truth happened and you'd said 0.9? Pay `$-\log 0.9 \approx 0.105$`, pocket change. You'd said 0.5? Pay `$0.693$`, the price of a shrug. You'd said 0.01, confidently wrong? Pay `$4.6$`. Said `$10^{-6}$`? Pay `$13.8$`, and the meter has no cap: `$-\log p \to \infty$` as your assigned probability of the truth goes to zero. Confident correctness costs nearly nothing (no fine for being right, which fixes Part 2's hook), calibrated doubt costs a little, and confident wrongness is priced without any limit at all.

## The punchline gradient

Part 2's autopsy of squared-error-plus-squash found `$\frac{\partial}{\partial s}(\sigma(s) - y)^2 = 2(\sigma(s) - y)\,\sigma'(s)$`, with the `$\sigma'$` factor strangling the gradient on the saturated shoulders, exactly where the model is most wrong. Now run the same chain rule on cross-entropy. Two facts in hand: `$\frac{d}{dp} \log p = 1/p$`, and the sigmoid's famously tidy derivative `$\sigma'(s) = \sigma(s)(1 - \sigma(s))$`. Write `$\sigma$` for `$\sigma(s)$`:

```math
\frac{\partial \mathcal{L}}{\partial s}
= -\,y\,\frac{\sigma'}{\sigma} + (1-y)\,\frac{\sigma'}{1-\sigma}
= -\,y\,(1-\sigma) + (1-y)\,\sigma
= \sigma - y
```

Sit with what just happened. The `$\sigma'= \sigma(1-\sigma)$` in the numerator met the `$\sigma$` and `$(1-\sigma)$` that the log's derivative put in the denominators, and **cancelled exactly**. The saturation factor that killed Part 2's gradient is gone: not suppressed, algebraically annihilated. Chain once more through `$s = w \cdot x + b$`:

```math
\frac{\partial \mathcal{L}}{\partial w} = (\sigma(s) - y)\,x, \qquad \frac{\partial \mathcal{L}}{\partial b} = \sigma(s) - y
```

Compare with [Part 1](@/blog/0005-linear-regression.md)'s MSE gradient, `$(\hat{y} - y)\,x$`. **Same shape. Same words: average error, weighted by the feature that caused it.** The only change is what "`$\hat{y}$`" means: a probability now instead of a raw score. That's the tease from Part 2 cashed. And the failure mode is fixed by construction: model says `$\sigma \approx 0$` on a spam email with `$y = 1$`? The gradient factor is `$\approx -1$`, its *maximum* magnitude. The loss pushes hardest exactly where the model is most wrong, which is the entire job description of a loss.

File this pairing away as a design pattern, not a coincidence. Gaussian noise + identity link gives MSE and this gradient; Bernoulli noise + log-odds link gives cross-entropy and this gradient. Match the loss to the output unit and the ugly derivative factors cancel. Statisticians packaged the whole family as **generalized linear models** decades ago (see further reading).

## Convexity: one valley, no shortcut

Cross-entropy composed with sigmoid composed with a linear score is **convex in `$w$` and `$b$`** (the squash-then-square loss from Part 2 was not, which was its other problem). Convex means the loss surface is one valley: no local minima to get trapped in, no bad basin to land in by starting in the wrong place, so downhill is always the right direction. Part 1's unkillable engine, gradient descent with its stride-length `$\eta$`, just works. What we lose is the luxury of a closed form: the optimum no longer satisfies anything as tidy as the normal equations, because `$\sigma$` is not linear, so there is **no closed form** for logistic regression's weights. Part 1 warned that `np.linalg.solve` was a privilege of quadratic losses; this is the moment the privilege expires. (Statisticians iterate Newton's method, rebranded as *iteratively reweighted least squares*; we'll just walk downhill.)

```python
import numpy as np
rng = np.random.default_rng(0)

n = 100
X = np.vstack([rng.normal([-1.5, -1.0], 1.0, (n, 2)),   # class 0: ham cluster
               rng.normal([ 1.5,  1.0], 1.0, (n, 2))])  # class 1: spam cluster
y = np.concatenate([np.zeros(n), np.ones(n)])

sigmoid = lambda s: 1 / (1 + np.exp(-s))
w, b, lr = np.zeros(2), 0.0, 0.5
for step in range(1, 501):
    p = sigmoid(X @ w + b)
    loss = -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()
    g = p - y                                  # THE gradient factor. that's all of it
    w -= lr * (X * g[:, None]).mean(axis=0)
    b -= lr * g.mean()
    if step in (1, 10, 100, 500):
        acc = ((p > 0.5) == y).mean()
        print(f"step {step:4d}   loss = {loss:.4f}   acc = {acc:.3f}   "
              f"w = [{w[0]:+.2f}, {w[1]:+.2f}]   b = {b:+.2f}")

print("\ndecision surface ('.' = P<0.5, '#' = P>=0.5), x1 across, x2 down:")
for x2 in np.linspace(3, -3, 9):
    print("".join("#" if sigmoid(w @ [x1, x2] + b) >= 0.5 else "."
                  for x1 in np.linspace(-3, 3, 31)))
```

Step 1 starts at loss `$\log 2 \approx 0.693$` (the price of a shrug, which is what all-zero weights are) and slides monotonically down one valley. The training loop's entire learning signal is the line `g = p - y`: the gradient we derived, three characters wide. And the ASCII sketch shows the boundary for what it is: a straight line through feature space, tilted to put the clusters on opposite sides. A hyperplane that votes.

One valley, though, does not guarantee that valley has a floor. If the data is **linearly separable**, meaning some hyperplane classifies every training point correctly, logistic regression has no finite optimum. Scaling the weights up makes every prediction more confident, and when you are right about everything, more confidence is always cheaper. So the loss slides toward zero while the weights walk toward infinity, never arriving.

```python
import numpy as np
sigmoid = lambda s: 1 / (1 + np.exp(-s))

X = np.array([[-2.], [-1.], [1.], [2.]])       # separable: 0s on the left, 1s on the right
y = np.array([0., 0, 1, 1])

for lam in (0.0, 0.01):                        # lam = 0 is plain logistic regression
    w, b = np.zeros(1), 0.0
    for step in range(1, 20001):
        p = sigmoid(X @ w + b)
        g = p - y
        w -= 0.5 * ((X * g[:, None]).mean(axis=0) + lam * w)   # ridge, from Part 1
        b -= 0.5 * g.mean()
        if step in (100, 1000, 20000):
            loss = -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()
            print(f"lambda = {lam:<5}  step {step:6d}   loss = {loss:.6f}   |w| = {np.linalg.norm(w):7.4f}")
```

Twenty thousand steps in and the weights are still growing, the loss still falling, and both would continue for as long as you were willing to pay the electricity bill. Convexity promised there was nowhere bad to end up. It never promised there was somewhere to end up. The fix is Part 1's ridge penalty, which charges for large weights and puts a floor back in the valley: with `$\lambda = 0.01$` the same run settles at `$\|w\| = 2.90$` by step 1000 and never moves again. This is why every logistic regression implementation you are likely to use regularizes by default, scikit-learn included, and why "my weights exploded" is more often a story about separable data than a bug in the code.

## Softmax: the vote goes multiclass

Spam/ham is two classes. Route the email to *promotions, social, updates, forums* and you need K verdicts. The generalization is mechanical: give **every class its own line**, `$s_k = w_k \cdot x + b_k$`, so K opinion polls run in parallel, then convert K unbounded scores into K probabilities that are positive and sum to 1. Exponentiate (positivity) and normalize (sum to one):

```math
P(y{=}k \mid x) = \frac{e^{s_k}}{\sum_{j=1}^{K} e^{s_j}}
```

That's **softmax**, and the sigmoid was softmax in disguise all along. Take two classes, pin the second score to 0 (only score *differences* matter: add a constant to every `$s_j$` and it cancels in the ratio):

```math
\frac{e^{s}}{e^{s} + e^{0}} = \frac{1}{1 + e^{-s}} = \sigma(s)
```

Sigmoid is softmax with two classes, one of them held at zero. The loss generalizes just as cleanly: cross-entropy was always "charge `$-\log$` of the probability assigned to the truth," and that sentence doesn't care whether the truth had one rival or a thousand: `$\mathcal{L} = -\log P(y{=}\text{true class} \mid x)$`. Even the punchline gradient survives: for each class's score, it's `$p_k - y_k$` with `$y$` one-hot. Error times feature, K times over.

```python
import numpy as np
softmax = lambda s: np.exp(s - s.max()) / np.exp(s - s.max()).sum()
sigmoid = lambda s: 1 / (1 + np.exp(-s))

scores = np.array([2.0, 1.0, 0.1, -1.0])       # 4 classes, 4 score lines
probs = softmax(scores)
for k, (s, p) in enumerate(zip(scores, probs)):
    print(f"class {k}: score = {s:+.1f}   P = {p:.4f}")
print(f"sum = {probs.sum():.6f}   cross-entropy if class 0 is true = {-np.log(probs[0]):.4f}")

print("\nsigmoid IS 2-class softmax:")
for s in (-3.0, 0.0, 2.3):
    print(f"  sigmoid({s:+.1f}) = {sigmoid(s):.10f}   "
          f"softmax([s, 0])[0] = {softmax(np.array([s, 0.0]))[0]:.10f}")
```

One line in that demo deserves an explanation rather than a shrug: `s - s.max()`. Exponentiating raw scores overflows, `np.exp(1000)` is `inf`, and `inf/inf` is `nan`. Subtracting the largest score changes nothing mathematically, since it is the same constant-cancels-in-the-ratio fact we just used to turn softmax into sigmoid, and it changes everything numerically. The sigmoid has the matching trap: `$\sigma(50)$` rounds to exactly 1.0 in float64, so the `$\log(1 - p)$` in the loss becomes `$\log 0$`, and the run dies at the precise moment the model got confident. This is why frameworks hand you a `cross_entropy` that consumes **scores** rather than probabilities: it folds the squash and the log into one expression that never builds the dangerous intermediate. Compute the probability and then take its log, and you have already lost.

And now the callback this series has been saving. You have seen this machine before: **InfoNCE in [the embeddings series](@/blog/0003-how-are-embeddings-trained.md) is softmax cross-entropy with a temperature knob**, where the "classes" are candidate passages and the "score lines" are similarity scores. Training an embedding model is running a K-way logistic regression whose exam changes every batch. Back then it was already this exact formula. Plant the flag here: **softmax + cross-entropy is the machine to remember. The rest of this series is built out of it.** The same exponentiate-and-normalize vote keeps reappearing with grander inputs.

## A number between 0 and 1 is not automatically a probability

One last piece of discipline before closing. The sigmoid guarantees the output lives in `$(0, 1)$`; it does *not* guarantee the output is **calibrated**: among everything scored 0.9, about 90% is actually positive. Plain logistic regression is usually well-calibrated (the maximum-likelihood fit even forces average predicted probability to equal the base rate), but regularization, class rebalancing, and the bigger models coming later in this series all bend outputs away from honesty, famously toward overconfidence (Guo et al. 2017, further reading). Check it the boring way: bucket predictions by score, compare each bucket's mean prediction to its actual positive rate, and if they disagree, fix it with a post-hoc recalibration step rather than by trusting the pretty decimals. This is Part 2's threshold discipline extended one level: the threshold was a product decision calibrated against a specific model's scores, and the probabilities feeding it deserve the same paranoia. Retrain the model, re-audit the calibration, and version them together.

## Closing thoughts

The wish list from Part 2, item by item: keep the linear score (kept: it's the log-odds now, and the decision boundary is still a hyperplane), squash it into a probability (the sigmoid, *derived* from the log-odds reading rather than picked from a catalog), and train against a loss that prices honesty (cross-entropy from maximum likelihood, charging `$-\log$` of the probability given to the truth, unbounded for confident wrongness, nearly free for confident correctness). And the reward for choosing the matched loss: the gradient collapses to `$(\sigma(s) - y)\,x$`, Part 1's gradient with the prediction renamed, pushing hardest exactly where Part 2's patched-up loss went numb. That leaves one convex valley, no closed form, and a floor that regularization has to supply. The K-class generalization, softmax, turns out to be a machine we'd already met grading embeddings.

But every classifier in this post draws a *flat* boundary. One line, however well it votes, cannot carve a spiral, an XOR, or "spam unless it's from my bank, unless the bank email is forwarded." Part 1 planted the question: what if the features themselves were learned instead of designed? Next up: what happens when one line isn't enough. We stack these voters on top of each other, feed each layer's opinions to the next as features, and let gradient descent design the features nobody handcrafted.

## Further reading

- **Cox, D. R., "The Regression Analysis of Binary Sequences" (JRSS B, 1958)**. The paper that made logistic regression a first-class statistical citizen: binary outcomes, the logistic link, and maximum likelihood, all in one place.
- **McCullagh, P. & Nelder, J. A., *Generalized Linear Models* (2nd ed., 1989)**. The grand unification this post gestured at: pick a noise distribution and a link function, and MSE-with-identity and cross-entropy-with-logit fall out as siblings, gradients matching.
- **Guo, C., Pleiss, G., Sun, Y. & Weinberger, K. Q., "On Calibration of Modern Neural Networks" (ICML 2017)**. The calibration aside with experiments: modern networks are systematically overconfident, reliability diagrams expose it, and temperature scaling (one scalar!) largely fixes it.
