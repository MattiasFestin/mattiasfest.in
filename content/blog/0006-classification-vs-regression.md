+++
title = "From lines to language models: Part 2 - Classification vs regression"
date = 2026-08-07
description = "Fit a line to 0/1 spam labels and it works, until you add a few blatantly obvious spam emails and the previously-caught ones slip through, because squared error fines the model for being confidently right. The fix starts with an honest distinction: regression predicts a quantity, classification predicts a decision, and almost every classifier is secretly a regressor of scores plus a decision rule. Also: why a 99%-accurate spam filter can be useless, and why a threshold is a product decision, not math."

[extra]
linkedin = "Part 2 of From lines to language models: fit a line to spam labels and it works, until you add blatantly obvious spam and the previously-caught ones slip through. Why squared error fines a model for being confidently right, why a 99%-accurate filter can be useless, and why a threshold is a product decision, not math."
tags = ["ml", "classification", "regression", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 2 of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) covered linear regression: the weighted opinion poll, the loss you choose, and the normal equations. This part is the short conceptual hinge of the series, and Part 1's closing question is the opener: what happens when the thing you predict is a category?*

Here's the setup. You're building a spam filter with the only tool you own so far: linear regression. One feature, `$x$` = count of trigger words ("FREE", "WINNER", "ACT NOW"). Labels are numbers, `$y = 0$` for ham, `$y = 1$` for spam, so why not? Fit `$\hat{y} = wx + b$` by least squares, call it spam when `$\hat{y} > 0.5$`.

Nine training emails: six ham with 0–2 trigger words, three spam with 6–8. The fit comes out `$\hat{y} \approx 0.154x - 0.13$`. Ham scores at most 0.18, spam scores 0.79 and up, the 0.5 threshold sits at `$x \approx 4$`, and every email is classified correctly. Ship it.

Then your boss forwards three more spam emails, and they're the *easiest* ones imaginable: 40, 50, and 60 trigger words each. A caricature of spam. You add them to the training set, expecting the model to get, if anything, more confident. Retrain:

|                       | before      | after       |
|-----------------------|-------------|-------------|
| slope `$w$`           | 0.154       | 0.016       |
| decision boundary     | `$x \approx 4$` | `$x \approx 14.8$` |
| score of spam at `$x=7$` | 0.95     | **0.38**    |

The three original spam emails, the ones the filter used to catch cleanly, now score 0.36–0.39 and sail through as ham. Adding *unambiguous* examples of the positive class made the classifier **worse**.

The autopsy is short. Before the update, extrapolating the old line to `$x = 60$` gives `$\hat{y} \approx 9.1$` on an email labeled 1: a residual of 8.1, which MSE squares into a scream of 65. The model wasn't wrong about that email, it was *emphatically right*, but squared loss doesn't score decisions, it scores distances to the label. So the fit flattens the line to hush the scream, and the borderline spam pays the bill. **MSE fines the model for being confidently right.** That's not a bug in least squares; it's least squares doing exactly its job on a problem that was never a regression.

Before you reach for the obvious fix: this is not a rerun of Part 1's outlier problem, and robustness will not save you. The point that dragged Part 1's line was *corrupted*, and L1 was right to shrug at it. The three points dragging this line are the most unambiguously *correct* data in the set. Swap in L1 and the filter gets worse.

```python
import numpy as np

x = np.array([0., 0, 1, 1, 2, 2, 6, 7, 8, 40, 50, 60])
y = np.array([0., 0, 0, 0, 0, 0, 1, 1, 1,  1,  1,  1])
X = np.column_stack([x, np.ones_like(x)])

def fit(weights):                                # weighted least squares, from Part 1
    Xw = X.T * weights
    return np.linalg.solve(Xw @ X, Xw @ y)

w = fit(np.ones_like(y))                         # plain L2
print(f"L2 : boundary at x = {(0.5 - w[1]) / w[0]:5.2f},  borderline spam at x=7 scores {w[0]*7 + w[1]:.2f}")

for _ in range(200):                             # L1, via Part 1's reweighting loop
    w = fit(1.0 / np.abs(y - X @ w).clip(1e-9))
print(f"L1 : boundary at x = {(0.5 - w[1]) / w[0]:5.2f},  borderline spam at x=7 scores {w[0]*7 + w[1]:.2f}")
```

<!-- output -->

L1 pushes the boundary out to 25 and drops the borderline spam from 0.38 to 0.14. Huber splits the difference, which is exactly what splitting the difference between two wrong answers is worth. Every regression loss bills you for overshoot; they only disagree about the tariff. What this problem needs is a loss that gives overshoot away free, because being *more* right than the label should never cost anything, and no regression loss does that. Reaching for a better loss inside the same family is the tell that you are solving the wrong problem rather than solving it badly.

**TL;DR**

- **Regression predicts a quantity, classification predicts a decision.** Different target, different error accounting, different metrics culture.
- But the two aren't strangers: almost every classifier is secretly a **regressor of scores plus a decision rule**. "Logistic *regression*" being a classifier is not a naming accident, it's the whole design.
- Squared error on 0/1 labels penalizes confident correctness (the hook above), and bolting a squashing function onto it kills the gradient exactly where the model is most wrong.
- When the target is categorical, a miss is a miss: being wrong by "a lot" vs "a little" stops meaning anything until you define costs. The right output object is a **probability**, so downstream consumers can apply their own costs.
- Accuracy is a vanity metric under class imbalance: an "always ham" filter on 1% spam is 99% accurate and 100% useless. Precision and recall price the two ways of being wrong separately.
- The threshold is a **product decision, not math**: the same scorer at 0.5 vs 0.9 is two different products.

## The crime scene, runnable

The hook, via the normal equations from [Part 1](@/blog/0005-linear-regression.md). No randomness needed; the pathology is deterministic.

```python
import numpy as np

def fit(x, y):                                  # least squares via normal equations
    X = np.column_stack([x, np.ones_like(x)])
    return np.linalg.solve(X.T @ X, X.T @ y)

x = np.array([0., 0, 1, 1, 2, 2, 6, 7, 8])      # trigger-word counts
y = np.array([0., 0, 0, 0, 0, 0, 1, 1, 1])      # 0 = ham, 1 = spam

w, b = fit(x, y)
print(f"before: w = {w:.3f}, b = {b:.3f}, boundary at x = {(0.5 - b) / w:.1f}")
for xi in (6, 7, 8):
    print(f"  x = {xi}: score = {w * xi + b:.2f}  ->  {'SPAM' if w * xi + b > 0.5 else 'ham'}")

x2 = np.append(x, [40., 50, 60])                 # three OBVIOUS spam emails
y2 = np.append(y, [1., 1, 1])
w, b = fit(x2, y2)
print(f"after:  w = {w:.3f}, b = {b:.3f}, boundary at x = {(0.5 - b) / w:.1f}")
for xi in (6, 7, 8, 50):
    print(f"  x = {xi}: score = {w * xi + b:.2f}  ->  {'SPAM' if w * xi + b > 0.5 else 'ham'}")
```

<!-- output -->

Watch the boundary jump from 4 to ~15 and the three real spam emails flip to ham, while the email with 50 trigger words scores 1.05: the model gets *charged* for that 0.05 of overshoot on a label it nailed. The loss is minimizing distances; you wanted it to minimize mistakes. Those are different objectives, and the rest of this post is about the gap.

## A quantity vs a decision

The distinction, stated plainly: **regression predicts a quantity** (a price, a temperature, a delay: outputs that live on a continuum, where residuals have magnitudes and "off by 2" is twice as bad as "off by 1") and **classification predicts a decision** (spam or ham, cat or dog: outputs that live in a finite set, where the arithmetic of "off by 2" doesn't even parse).

The distinction earns its keep, because almost every classifier you will ever meet is a **regressor of scores wearing a decision rule**. Underneath, there's a continuous function of the inputs, our familiar weighted opinion poll `$s = w \cdot x + b$` or something far deeper, and on top, a rule that converts the score into a verdict: *threshold it, or take the argmax*. The linear machinery from Part 1 doesn't get discarded; it gets a new job title. This is why "logistic regression" is a classification algorithm and nobody considers the name a mistake: it *is* a regression, of a score, with a decision rule bolted on. The design question is what the score should *mean* and which loss teaches it that meaning.

## What actually changes when the target is a category

Two things, and they cascade into everything else.

**Error is counted differently.** In regression, residuals have sizes. In classification, a miss is a miss: predicting "ham" for spam is one unit of wrong whether the score was 0.49 or 0.01. Magnitude of wrongness only re-enters when *you* define it, as costs: a spam email in the inbox is mildly annoying; a job offer in the spam folder is a small catastrophe. Nothing in the labels encodes that asymmetry. You have to put it in.

**The right output object is a probability.** If a miss is a miss but misses have different prices, the most useful thing a model can hand downstream is not a verdict but a **calibrated probability**: "this is spam with probability 0.93." "Calibrated" is doing real work in that sentence: the number has to mean what it says, so that the mail scored 0.9 really does turn out to be about nine-tenths spam. That property has to be earned and audited, never assumed, and Part 3 builds the loss that teaches a model to mean it. A probability lets every consumer apply their *own* costs and choose their own cutoff; a hard verdict bakes one particular cost assumption into the model forever. This is the same interface discipline as returning data instead of formatted strings. Verdicts are for the last possible moment.

Which raises the obvious follow-up: our linear score `$wx + b$` outputs 9.1 and −0.13. It has the right shape (bigger score, spammier email) and the wrong range. We'll need to squash it into `$[0, 1]$`, and, crucially, pick a loss that treats the squashed value *as* a probability. Squared error is not that loss, and here's the intuition for why.

## Why squared error keeps being the wrong tool

The hook showed failure mode one: on raw scores, MSE punishes confident correctness, because overshooting a label of 1 is charged the same as undershooting it. The obvious patch, squash the score through some S-shaped `$\sigma$` so predictions can't exceed 1, fixes that and buys failure mode two. Chain rule on the squared loss:

```math
\frac{\partial}{\partial s} \bigl(\sigma(s) - y\bigr)^2 \;=\; 2\,\bigl(\sigma(s) - y\bigr)\; \sigma'(s)
```

That `$\sigma'(s)$` factor is the slope of the squashing function, and it's near zero on both flat ends. So picture the worst case: the model says "definitely ham," `$\sigma(s) \approx 0$`, and the email is spam, `$y = 1$`. The error factor is maximal, but `$\sigma'(s) \approx 0$` strangles the product. **The gradient vanishes exactly where the model is most wrong**, gradient descent (our unkillable engine from Part 1) takes its stride-length steps on flat ground and barely moves, and the composed loss isn't convex anymore, so there are bad plateaus to get stuck on. Squared error plus squashing is a loss that stops teaching precisely when there's the most to learn. What we want instead is a loss that bills confident wrongness without any upper limit, and whose gradient stays at full strength while it does. It exists, and building it is Part 3's job.

## Two metrics cultures

Regression and classification don't just train differently, they *report* differently, and the two dashboards share no gauges:

| regression asks             | classification asks                            |
|-----------------------------|------------------------------------------------|
| MSE, MAE: how far off, on average? | **accuracy**: what fraction of verdicts were right? |
| R²: how much variance did I explain? | **precision**: of everything I flagged, how much was real? |
| worst-case error: how bad is my worst miss? | **recall**: of everything real, how much did I flag? |
|                             | **confusion matrix**: the full 2×2 ledger of hits and both kinds of misses |

Accuracy is the metric everyone reaches for first, and it has a famous failure: **class imbalance**. Spam is maybe 1% of a well-filtered mailbox. A "classifier" that unconditionally says ham is 99% accurate and catches zero spam. The numbers:

```python
import numpy as np
rng = np.random.default_rng(0)

n_ham, n_spam = 990, 10                          # 1% spam, like real life
y = np.concatenate([np.zeros(n_ham), np.ones(n_spam)])
scores = np.concatenate([rng.normal(0.0, 1.0, n_ham),    # ham scores low
                         rng.normal(2.5, 1.0, n_spam)])  # spam scores high

def report(name, pred):
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    acc  = (pred == y).mean()
    prec = tp / max(tp + fp, 1)
    rec  = tp / max(tp + fn, 1)
    print(f"{name:16s} accuracy={acc:.3f}  precision={prec:.3f}  "
          f"recall={rec:.3f}  (caught {tp}/{n_spam} spam, flagged {fp} ham)")

report("always-ham", np.zeros_like(y))
report("threshold 2.0", (scores > 2.0).astype(float))
report("threshold 0.5", (scores > 0.5).astype(float))
```

<!-- output -->

The always-ham "model" posts the *best accuracy of the three* while doing literally nothing. The genuinely useful scorer looks worse on accuracy because it dares to flag things and pays for its false positives. This is why classification people talk in precision and recall: **precision** prices the cost of crying wolf, **recall** prices the cost of sleeping through one, and the confusion matrix keeps the receipts. On imbalanced problems, accuracy is a vanity metric; report it alone and you're telling a 99%-true lie.

## The threshold is a product decision

Notice what the imbalance demo also shows: the *same* scorer at threshold 2.0 versus 0.5 is two different products. High threshold: high precision, modest recall, the spam-filter posture, where a false positive (real mail buried) is the expensive mistake. Low threshold: high recall, poor precision, the medical-screening posture, where a false negative (a missed case) is the catastrophe and follow-up tests exist to mop up the false alarms. Same weights, same scores, opposite souls. Sweep the cutoff and you can watch the same scorer become every product in between:

```python
import numpy as np
rng = np.random.default_rng(0)

y = np.concatenate([np.zeros(990), np.ones(10)])          # 1% spam
s = np.concatenate([rng.normal(0.0, 1.0, 990),            # one scorer, fixed
                    rng.normal(2.5, 1.0, 10)])            # for the whole sweep

print(" cutoff  accuracy  precision  recall")
for t in np.arange(0.5, 4.0, 0.5):
    pred = s > t
    tp = (pred & (y == 1)).sum()
    fp = (pred & (y == 0)).sum()
    print(f"   {t:.1f}     {(pred == y).mean():.3f}      {tp / max(tp + fp, 1):.3f}     {tp / 10:.3f}")
```

<!-- output -->

One scorer, seven products. Precision climbs from 0.03 to 1.00 while recall falls from 1.00 to 0.20, and choosing where on that trade to live is the actual job. Watch the accuracy column do nothing useful the whole way down: it is *highest* at the far end, where the filter has all but given up and is catching two spam emails in ten. A sweep like this traces the ROC and precision-recall curves that classification people use to compare models, which is how you argue about scorers without first having to agree on a cutoff.

Nothing in the mathematics chooses between them. The loss trains the scorer; the threshold encodes *your* costs, and those come from the business, the regulator, or the oncologist, not from `argmin`. This is also a production landmine with a familiar shape: [the drift post](@/blog/0004-what-are-drift.md) learned that hardcoded similarity thresholds don't survive a model swap, and classification thresholds are the same species. Retrain the scorer, and yesterday's 0.5 is not today's 0.5: the score distribution moved under the cutoff. A threshold is calibrated *against a specific model's scores*; version them together, and recalibrate on every retrain, or your precision/recall trade drifts while the accuracy dashboard stays green.

## The bridge

Assemble the wish list this post has been writing. We want a model that: keeps the linear score `$w \cdot x + b$` (the opinion poll earned its keep), squashes it into `$[0, 1]$` so it can honestly be called a probability, and trains against a loss that rewards **calibrated honesty about uncertainty**, punishing confident wrongness harshly, confident correctness not at all, and vanishing nowhere we need it. That model exists, it's the workhorse classifier of the last century and this one, and true to this post's central claim it wears its construction in its name: *logistic regression*. A regression of scores, a decision rule on top, and one carefully chosen loss doing all the hard work.

## Closing thoughts

The hinge of the series, restated: regression predicts a quantity, classification predicts a decision, and the bridge between them is a score plus a rule. Fitting a line straight to the labels fails not because lines are weak but because squared error answers "how far?" when the question is "which side?", to the point of punishing the model for being confidently right. Categories change the accounting (a miss is a miss, until you price it), change the dashboard (precision and recall, not residuals), and change the interface (ship probabilities, decide late). And the threshold that turns scores into verdicts was never math's call to make.

Next up: the line that votes. We squash the linear score into a probability, meet the loss that makes it honest, and find out why that loss's gradient turns out to be Part 1's gradient wearing a new label.

## Further reading

- **Hastie, Tibshirani & Friedman, *The Elements of Statistical Learning*, Chapter 4**. Linear methods for classification, including exactly why regression on indicator labels misbehaves (and the "masking" problem it grows in the multi-class case). Free PDF from the authors.
- **Fawcett, T., "An Introduction to ROC Analysis" (Pattern Recognition Letters, 2006)**. The standard treatment of scorers vs thresholds: how one score function generates a whole curve of classifiers, and how to compare them without committing to a cutoff.
- **Saito, T. & Rehmsmeier, M., "The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets" (PLOS ONE, 2015)**. The class-imbalance section of this post, with teeth and experiments.
