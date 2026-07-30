+++
title = "From lines to language models: Part 1 - Linear regression, the atom of ML"
date = 2026-07-31
description = "Fitting a line means choosing a loss, and different losses crown different lines. Least squares turns out to be an orthogonal projection, the normal equations fall out of one perpendicularity condition, and gradient descent reaches the same answer by walking downhill, which is why it scales to everything that comes later."

[extra]
linkedin = "New series: From lines to language models. Part 1 is linear regression, the atom of ML. Fitting a line means choosing a loss, different losses crown different lines, and least squares turns out to be an orthogonal projection. Seven parts, ending inside a language model. Every post has runnable demos in the browser."
tags = ["ml", "linear-regression", "gradient-descent", "intuition"]
categories = ["Research Notes"]
+++

*This post starts a new series, "From lines to language models," continuing the arc from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) and [the embeddings series](@/blog/0002-what-are-embeddings.md): we're going to build up general ML from its smallest working part, and the geometry we already paid for is about to earn rent. Seven parts, starting with a straight line and ending inside a working language model.*

Here's a puzzle. Five points:

```math
(0, 1), \quad (1, 3), \quad (2, 5), \quad (3, 7), \quad (4, 14)
```

Four of them sit exactly on `$y = 2x + 1$`. The fifth is a rebel. Now, three candidate lines:

- **A**: `$y = 2x + 1$` (loyal to the four, ignores the rebel)
- **B**: `$y = 3x$` (a compromise, tilted toward the rebel)
- **C**: `$y = 3.25x - 0.875$` (tilted even harder)

Which line fits best? Score each line by its errors at the five points and you get:

|       | mean squared error | mean absolute error | worst-case error |
|-------|--------------------|---------------------|------------------|
| **A** | 5.00               | **1.00**            | 5.00             |
| **B** | **2.00**           | 1.20                | 2.00             |
| **C** | 2.27               | 1.38                | **1.88**         |

Three scoring rules, three different winners, same five points.

And none of the three is a lucky guess. Each line is the *exact* minimizer of the column it wins. Sweep a fine grid over every slope and every intercept, score all of them, and the grid hands back A, B and C to three decimals.

```python
import numpy as np

x = np.array([0., 1, 2, 3, 4])
y = np.array([1., 3, 5, 7, 14])

for name, m, c in [("A", 2, 1), ("B", 3, 0), ("C", 3.25, -0.875)]:
    r = y - (m * x + c)
    print(f"{name}   MSE {np.mean(r**2):5.2f}   MAE {np.mean(abs(r)):5.2f}   worst {np.max(abs(r)):5.2f}")

# brute force: score every line on a fine grid, keep the winner under each rule
m = np.linspace(1, 4, 601)[:, None, None]
c = np.linspace(-2, 3, 1001)[None, :, None]
r = y - (m * x + c)

for rule, loss in [("MSE", (r**2).mean(-1)), ("MAE", abs(r).mean(-1)), ("worst", abs(r).max(-1))]:
    i, j = np.unravel_index(loss.argmin(), loss.shape)
    print(f"best line under {rule:>5}: y = {m[i,0,0]:.3f}x {c[0,j,0]:+.3f}")
```

So this is not a podium, with A taking gold and B a respectable silver. Under absolute error, A is *the* answer and B is simply wrong. Under squared error, B is *the* answer and A is simply wrong. The five points never moved. If that rhymes with the puzzle that opened [the vector-spaces post](@/blog/0001-linear-vector-spaces.md), where three norms crowned three different nearest neighbors, it should. It's the *same lesson* wearing a regression costume: **"best fit" is not a property of the data. It's a property of how you decide to measure badness.**

**TL;DR**

- **"Best fit" is not a property of the data.** It is a property of the **loss function** you pick, and picking one is a modeling decision. Squared, absolute and worst-case error crown three different lines on the same five points, and each of those lines is exactly optimal under its own rule.
- Linear regression predicts `$\hat{y} = w \cdot x + b$`: a **weighted opinion poll over the features**, one vote weight per feature plus a baseline.
- Least squares has a geometric identity: the optimal prediction is the **orthogonal projection** of `$y$` onto the column space of the design matrix. The normal equations `$X^T X w = X^T y$` are just "residual ⊥ every column" written in matrix clothes.
- **Gradient descent** reaches the same answer by repeatedly stepping downhill, and its **mini-batch** version gets there while only ever looking at a handful of rows at a time. Slower than the closed form here, unkillable everywhere else, and the engine every later post in this series runs on.
- L2 loss chases outliers because squaring amplifies big residuals; L1 shrugs at them. Choosing the loss = choosing what "close" means, again.
- "Linear" means linear in the **weights**, not in `$x$`. Feed the model polynomial features and it fits curves without changing a line of the solver.

## The model: a weighted opinion poll

One feature first. The model is

```math
\hat{y} = w x + b
```

where `$w$` is the slope (how much the prediction moves per unit of `$x$`) and `$b$` is the intercept (the prediction when `$x = 0$`). Two numbers. That's the whole model.

With `$d$` features it barely changes:

```math
\hat{y} = w \cdot x + b = \sum_{j=1}^{d} w_j x_j + b
```

Read it as a **weighted opinion poll over the features**: every feature `$x_j$` casts a vote, weight `$w_j$` says how much that vote counts (and in which direction), and `$b$` is where the tally starts before anyone votes. Predicting apartment price from size, floor, and distance-to-metro? Size votes up with a big positive weight, distance votes down with a negative one, and `$b$` absorbs the baseline. And notice what the formula is: an inner product. The machinery from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) is already load-bearing.

## Residuals, and the loss you choose

For each data point `$i$`, the **residual** is the miss: `$r_i = y_i - \hat{y}_i$`. A loss function collapses all the misses into one number to minimize. The default choice is **mean squared error**:

```math
\mathrm{MSE}(w, b) = \frac{1}{n} \sum_{i=1}^{n} \bigl(y_i - (w x_i + b)\bigr)^2
```

Why *squared*, of all things? Two real reasons and one historical one:

1. **Differentiability.** `$|r|$` has a kink at zero; `$r^2$` is smooth everywhere. Smooth losses hand you gradients, and gradients hand you both closed-form solutions and the downhill-walking algorithm below.
2. **A probabilistic pedigree.** If you assume the data is `$y_i = w x_i + b + \varepsilon_i$` with Gaussian noise `$\varepsilon_i$`, then maximizing the likelihood of the data is *exactly* minimizing MSE. Squared loss isn't arbitrary; it's the maximum-likelihood estimate under the world's most popular noise assumption. (Assume Laplacian noise instead and you get absolute error. The loss encodes your beliefs about the noise.)
3. **It came first.** Legendre and Gauss both claimed it around 1805, tracking comets and planets, and the priority fight got genuinely ugly. See further reading.

But hold the puzzle in mind: MSE is a *choice*. It crowned line B up top. A different defensible choice crowned A.

## The geometry payoff: least squares is a projection

Stack the data into a **design matrix**. For the one-feature case, each row is `$(x_i, 1)$`, the trailing 1 being the intercept's feature that always votes:

```math
X = \begin{pmatrix} x_1 & 1 \\ x_2 & 1 \\ \vdots & \vdots \\ x_n & 1 \end{pmatrix}, \qquad \hat{y} = X w
```

with `$w$` now holding both slope and intercept. Here's the reframe that makes least squares click: as you sweep `$w$` over all possible values, the vector of predictions `$Xw$` sweeps out a plane inside `$\mathbb{R}^n$`, the **column space** of `$X$`. The observed `$y$` is one fixed point in `$\mathbb{R}^n$`, generally *not* on that plane (noise saw to that). Least squares asks: which point on the plane is closest to `$y$` in L2?

And the closest point on a plane is the **orthogonal projection**, the foot of the perpendicular. Which means at the optimum, the residual vector `$r = y - Xw$` must be perpendicular to the entire plane, i.e. to every column of `$X$`:

```math
X^T (y - X w) = 0 \quad \Longleftrightarrow \quad X^T X w = X^T y
```

Those are the **normal equations** ("normal" as in perpendicular, not as in ordinary), and we didn't take a single derivative to get them: one perpendicularity condition, straight from the geometry. The inner product you met in [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) is what decides what "perpendicular" means here; change the inner product and you change which projection is "the" answer. Weight each point by how much you trust it, for instance, and you get **weighted least squares**: the same projection, taken in a stretched geometry. We cash that in before the post is over.

Two lines of numpy, and note the orthogonality check at the end, it's the whole theorem in one print:

```python
import numpy as np
rng = np.random.default_rng(0)

true_w, true_b = 2.0, 1.0
x = rng.uniform(0, 10, size=50)
y = true_w * x + true_b + rng.normal(0, 1.0, size=50)

X = np.column_stack([x, np.ones_like(x)])   # design matrix: [x | 1]
w, b = np.linalg.solve(X.T @ X, X.T @ y)    # normal equations
r = y - (w * x + b)                          # residual vector

print(f"true:      w = {true_w:.3f}, b = {true_b:.3f}")
print(f"recovered: w = {w:.3f}, b = {b:.3f}")
print(f"residual . x-column = {r @ x:.2e}   (perpendicular, as promised)")
print(f"residual . 1-column = {r.sum():.2e}   (residuals sum to ~zero)")
```

Fifty noisy points, and the recovered `$w, b$` land within a hair of the truth. The two dot products at the end are the normal equations, verified numerically: the residual really is orthogonal to every column.

One caveat to carry out of here, because it is the difference between the blackboard and production: forming `$X^T X$` squares the condition number of `$X$`. Fit a degree-7 polynomial on `$[0, 1]$` and `$X$` comes in around `$10^5$`, which is survivable, while `$X^T X$` comes in around `$10^{10}$`, which eats half your double-precision digits before the solver has done any work. Serious libraries never form it. They factor `$X$` directly with QR or SVD, which in numpy is `np.linalg.lstsq`. Use the normal equations to *understand* least squares, and `lstsq` to *compute* it.

## The other road: walk downhill

The closed form is a luxury. It exists because MSE is quadratic in `$w$`; the moment the model or loss gets more interesting, `np.linalg.solve` stops being an option. The workhorse alternative never stops being an option: **gradient descent**.

Differentiate the MSE with respect to each parameter (chain rule, nothing fancier):

```math
\frac{\partial\,\mathrm{MSE}}{\partial w} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)\, x_i, \qquad \frac{\partial\,\mathrm{MSE}}{\partial b} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)
```

Read them aloud: the gradient for `$w$` is "average error, weighted by the feature that caused it," and for `$b$` it's just the average error. The update rule steps *against* the gradient with a **learning rate** `$\eta$`:

```math
w \leftarrow w - \eta \frac{\partial\,\mathrm{MSE}}{\partial w}, \qquad b \leftarrow b - \eta \frac{\partial\,\mathrm{MSE}}{\partial b}
```

The learning rate is a stride length, and it has two failure modes with very different personalities: too large and each step overshoots the valley, bouncing to ever-higher ground until the arithmetic gives up (try `lr = 0.07` below: the loss clears `$10^{125}$` by step 100 and is `nan` by step 500); too small and you converge in geological time (try `lr = 0.0001`, which after a thousand steps is still creeping up on the answer). Production aside: when a training run diverges, the learning rate is the first suspect you interrogate, not the last.

```python
import numpy as np
rng = np.random.default_rng(0)

x = rng.uniform(0, 10, size=50)
y = 2.0 * x + 1.0 + rng.normal(0, 1.0, size=50)

w, b, lr = 0.0, 0.0, 0.02
for step in range(1, 1001):
    err = (w * x + b) - y                 # signed residuals, flipped
    w -= lr * 2 * (err * x).mean()        # the two gradients we derived
    b -= lr * 2 * err.mean()
    if step in (1, 10, 100, 500, 1000):
        print(f"step {step:5d}   loss = {(err**2).mean():9.4f}   w = {w:.3f}   b = {b:.3f}")
```

Watch the loss collapse and `$w, b$` crawl to the *same* values the normal equations produced instantly. So why bother? Because gradient descent never asked whether the loss was quadratic, whether a closed form existed, or whether `$X^T X$` fit in memory. It only asked for a gradient. That humility is why it scales to every model in the rest of this series, where closed forms are a distant memory.

## Mini-batches: the loop that survives real data

Both gradients above sum over *every* row before taking a single step. With fifty points that is free. With fifty billion tokens you would take one step, go to lunch, come back, and take another. You need millions of them.

So stop summing over everything. Estimate the gradient from a random handful of rows, step, grab a fresh handful, step again. The handful is a **mini-batch**, and one full sweep through the shuffled data is an **epoch**. The estimate is noisy, and the noise is affordable: each mini-batch gradient is an unbiased sample of the real one, so the errors cancel across many cheap steps instead of compounding. The wobble even turns useful later, once the loss surface stops being a bowl. One habit comes attached, though: shrink the stride as training goes on, or you will circle the answer forever instead of settling onto it.

```python
import numpy as np
rng = np.random.default_rng(0)

x = rng.uniform(0, 10, size=50)
y = 2.0 * x + 1.0 + rng.normal(0, 1.0, size=50)

w, b = 0.0, 0.0
for epoch in range(1, 101):
    lr = 0.02 / (1 + epoch / 20)                       # shrink the stride as we go
    for s in np.array_split(rng.permutation(50), 10):  # 10 mini-batches of 5 rows
        err = (w * x[s] + b) - y[s]                    # gradient from 5 rows, not 50
        w -= lr * 2 * (err * x[s]).mean()
        b -= lr * 2 * err.mean()
    if epoch in (1, 5, 20, 100):
        loss = (((w * x + b) - y) ** 2).mean()
        print(f"epoch {epoch:4d}   loss = {loss:7.4f}   w = {w:.3f}   b = {b:.3f}")

print("all 50 rows at once:  loss =  0.9934   w = 2.052   b = 0.757")
```

A hundred epochs, five rows per step, and it arrives at the `$w, b$` the normal equations computed from all fifty at once. Now look at the loss between epoch 5 and epoch 20: it goes *up*. That is a mini-batch that happened to disagree, and that texture, a downward trend assembled from noisy steps that sometimes climb, is what every real training curve looks like.

This is the loop. Everything after this post makes the model bigger, the loss stranger and the step rule cleverer, but those four lines in the inner block barely change. Only the thing being differentiated does.

## L1 vs L2: who flinches at an outlier

Squaring residuals has a temperament: a residual of 10 costs 100, so one wild point screams a hundred times louder than a well-behaved one, and the L2 fit *will* bend toward it to hush the scream. Absolute error charges that same point just 10, and the L1 fit barely turns its head.

Neither is "correct." An outlier might be a sensor glitch (you want L1's stoicism) or the most important data point you own: a fraud case, a demand spike, a black swan. Then you want L2's vigilance, or at least an alert. Choosing the loss is choosing what "close to the data" *means*, the same modeling decision as choosing a norm in [the vector-spaces post](@/blog/0001-linear-vector-spaces.md), now with money on the table.

L1 has no closed form, but a short **iteratively reweighted least squares** loop fakes it beautifully, and it is the weighted least squares from earlier collecting its debt. Solve a weighted L2 problem where each point's weight is one over its current absolute residual (so big misses get discounted), then repeat until the weights stop moving. The "how much do I trust this point" knob is set by the data itself: whatever missed badly last round gets a quieter vote this round.

```python
import numpy as np
rng = np.random.default_rng(0)

x = np.arange(10, dtype=float)
y = 2.0 * x + 1.0 + rng.normal(0, 0.3, size=10)
y[-1] += 25.0                                  # one corrupted point

X = np.column_stack([x, np.ones_like(x)])
w_l2 = np.linalg.solve(X.T @ X, X.T @ y)       # ordinary least squares

w_l1 = w_l2.copy()                             # L1 via reweighting
for _ in range(50):
    inv_r = 1.0 / np.abs(y - X @ w_l1).clip(1e-8)
    Xw = X.T * inv_r                           # downweight big residuals
    w_l1 = np.linalg.solve(Xw @ X, Xw @ y)

print(f"true : slope = 2.00, intercept = 1.00")
print(f"L2   : slope = {w_l2[0]:.2f}, intercept = {w_l2[1]:.2f}   <- dragged by one point")
print(f"L1   : slope = {w_l1[0]:.2f}, intercept = {w_l1[1]:.2f}   <- barely notices")
```

Ten points, one corrupted. The L2 slope gets yanked well past 3; the L1 slope stays glued near the true 2. One bad row, ten percent of the dataset, and the two losses tell you two different stories about the same data.

## Ridge, in one paragraph

Add a penalty to the loss: `$\mathrm{MSE}(w, b) + \lambda \|w\|_2^2$`. That's **ridge regression**, and the penalty is literally the L2 norm from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) deployed as a modeling decision: among all lines that fit about equally well, prefer the one with smaller weights. It tames overfitting because huge weights are how a model contorts itself to chase noise, and the penalty makes contortion expensive. (Bonus: the normal equations become `$(X^T X + \lambda I) w = X^T y$`, and that `$+\,\lambda I$` makes the system solvable even when features are redundant and plain `$X^T X$` is singular. One knob, two favors.)

## "Linear" is about the weights, not the world

Here's the escape hatch people miss. The model is linear *in `$w$`*, and nothing forces the features themselves to be raw measurements. Manufacture new ones: feed in `$(x, x^2, x^3)$` and the "line"

```math
\hat{y} = w_1 x + w_2 x^2 + w_3 x^3 + b
```

is a cubic curve in `$x$`, yet still a plain inner product in `$w$`, so the normal equations, the projection picture, and gradient descent all work *unchanged*. Same solver, curvier worlds. The entire trick of classical feature engineering is this: keep the machine linear, make the inputs clever.

Two bills come attached. Raise the degree and the design matrix goes ill-conditioned fast, which is where the `$X^T X$` warning above stops being pedantry and starts being wrong answers. Raise it further and the curve stops fitting the world and starts fitting the noise, which is what ridge was for. Clever inputs are powerful, and they are never free.

Which raises a question worth sitting with: if handcrafted features like `$x^2$` buy this much, what would it mean for the features themselves to be *learned* from data instead of designed by us? Hold that thought. This series is heading straight at it.

## Closing thoughts

Linear regression is the atom of ML: a weighted poll over features, a loss that defines "close," and two ways to find the minimum, one exact and fragile, one iterative and unkillable. Every idea in it recurs at every scale above it. The loss-is-a-choice lesson came from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md); the projection picture is the same inner-product geometry that embeddings live on in [the embeddings series](@/blog/0002-what-are-embeddings.md); and gradient descent is the engine we'll never turn off again.

If you keep one thing from this post, keep the five points at the top. "Best fit" was never a fact about them, waiting to be found. Three reasonable rules, three different winners, and the data abstained. Every model in this series is larger than that line, and not one of them escapes it: somewhere inside every training run, a person decided what counts as wrong.

But regression predicts a *quantity*. Next up: what happens when the thing you predict is a category instead, and why "just fit a line to the labels" fails in an instructive way.

## Further reading

- **Stigler, S. M., "Gauss and the Invention of Least Squares" (The Annals of Statistics, 1981)**. The definitive account of the Legendre-Gauss priority dispute: Legendre published first (1805), Gauss claimed he'd been using it since 1795, and historians have been adjudicating ever since.
- **Hastie, Tibshirani & Friedman, *The Elements of Statistical Learning*, Chapter 3**. Linear methods for regression done properly: least squares, ridge, lasso, and the subset-selection zoo. Free PDF from the authors.
- **Boyd & Vandenberghe, *Introduction to Applied Linear Algebra* (VMLS), Chapters 12-13**. The cleanest treatment of least squares as projection and the normal equations, with the QR-factorization route you should actually use instead of forming `$X^T X$`.
