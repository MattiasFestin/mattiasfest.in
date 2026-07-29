+++
title = "From lines to language models: Part 1 - Linear regression, the atom of ML"
date = 2026-08-04
description = "Fitting a line means choosing a loss, and different losses crown different lines. Least squares turns out to be an orthogonal projection, the normal equations fall out of one perpendicularity condition, and gradient descent reaches the same answer by walking downhill, which is why it scales to everything that comes later."

[extra]
tags = ["ml", "linear-regression", "gradient-descent", "intuition"]
categories = ["Research Notes"]
+++

*This post starts a new series, "From lines to language models," continuing the arc from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) and [the embeddings series](@/blog/0002-what-are-embeddings.md): we're going to build up general ML from its smallest working part, and the geometry we already paid for is about to earn rent.*

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

Three scoring rules, three different winners, same five points. If that rhymes with the puzzle that opened [the vector-spaces post](@/blog/0001-linear-vector-spaces.md), where three norms crowned three different nearest neighbors, it should. It's the *same lesson* wearing a regression costume: **"best fit" is not a property of the data. It's a property of how you decide to measure badness.**

**TL;DR**

- Linear regression predicts `$\hat{y} = w \cdot x + b$`: a **weighted opinion poll over the features**, one vote weight per feature plus a baseline.
- "Best fit" requires a **loss function**, and the choice is a modeling decision. Squared error, absolute error, and worst-case error crown different lines on the same data.
- Least squares has a geometric identity: the optimal prediction is the **orthogonal projection** of `$y$` onto the column space of the design matrix. The normal equations `$X^T X w = X^T y$` are just "residual ⊥ every column" written in matrix clothes.
- **Gradient descent** reaches the same answer by repeatedly stepping downhill. It's slower here, but it's the method that survives when closed forms die, which is the rest of this series.
- L2 loss chases outliers because squaring amplifies big residuals; L1 shrugs at them. Choosing the loss = choosing what "close" means. Again.
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

Why *squared*, of all things? Two honest reasons and one historical one:

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

Those are the **normal equations** ("normal" as in perpendicular, not as in ordinary), and we didn't take a single derivative to get them: one perpendicularity condition, straight from the geometry. The inner product you met in [the vector-spaces post](@/blog/0001-linear-vector-spaces.md) is what decides what "perpendicular" means here; change the inner product and you change which projection is "the" answer (that's weighted least squares, but another day).

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

## The other road: walk downhill

The closed form is a luxury. It exists because MSE is quadratic in `$w$`; the moment the model or loss gets more interesting, `np.linalg.solve` stops being an option. So here's the workhorse that never stops being an option: **gradient descent**.

Differentiate the MSE with respect to each parameter (chain rule, nothing fancier):

```math
\frac{\partial\,\mathrm{MSE}}{\partial w} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)\, x_i, \qquad \frac{\partial\,\mathrm{MSE}}{\partial b} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)
```

Read them aloud: the gradient for `$w$` is "average error, weighted by the feature that caused it," and for `$b$` it's just the average error. The update rule steps *against* the gradient with a **learning rate** `$\eta$`:

```math
w \leftarrow w - \eta \frac{\partial\,\mathrm{MSE}}{\partial w}, \qquad b \leftarrow b - \eta \frac{\partial\,\mathrm{MSE}}{\partial b}
```

The learning rate is a stride length, and it has two failure modes with very different personalities: too large and each step overshoots the valley, bouncing to ever-higher ground until the loss reads `inf` (try `lr = 0.07` below); too small and you converge in geological time (try `lr = 0.0001`). Production aside: when a training run diverges, the learning rate is the first suspect you interrogate, not the last.

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

Watch the loss collapse and `$w, b$` crawl to the *same* values the normal equations produced instantly. So why bother? Because gradient descent never asked whether the loss was quadratic, whether a closed form existed, or whether `$X^T X$` fits in memory. It only asked for a gradient. That humility is exactly why it scales to every model in the rest of this series, where closed forms are a distant memory.

## L1 vs L2: who flinches at an outlier

Squaring residuals has a temperament: a residual of 10 costs 100, so one wild point screams a hundred times louder than a well-behaved one, and the L2 fit *will* bend toward it to hush the scream. Absolute error charges that same point just 10, and the L1 fit barely turns its head.

Neither is "correct." An outlier might be a sensor glitch (you want L1's stoicism) or the most important data point you own, a fraud case, a spike, a black swan (you may want L2's vigilance, or at least an alert). Choosing the loss is choosing what "close to the data" *means*, the same modeling decision as choosing a norm in [the vector-spaces post](@/blog/0001-linear-vector-spaces.md), now with money on the table.

L1 has no closed form, but a short **iteratively reweighted least squares** loop fakes it beautifully: solve a weighted L2 problem where each point's weight is one over its current absolute residual, so big misses get discounted, then repeat.

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

Which begs a question worth sitting with: if handcrafted features like `$x^2$` buy this much, what would it mean for the features themselves to be *learned* from data instead of designed by us? Hold that thought. This series is heading straight at it.

## Closing thoughts

Linear regression is the atom of ML: a weighted poll over features, a loss that defines "close," and two ways to find the minimum, one exact and fragile, one iterative and unkillable. Every idea in it recurs at every scale above it. The loss-is-a-choice lesson came from [the vector-spaces post](@/blog/0001-linear-vector-spaces.md); the projection picture is the same inner-product geometry that embeddings live on in [the embeddings series](@/blog/0002-what-are-embeddings.md); and gradient descent is the engine we'll never turn off again.

But regression predicts a *quantity*. Next up: what happens when the thing you predict is a category, not a quantity, and why "just fit a line to the labels" fails in an instructive way.

## Further reading

- **Stigler, S. M., "Gauss and the Invention of Least Squares" (The Annals of Statistics, 1981)** — the definitive account of the Legendre-Gauss priority dispute: Legendre published first (1805), Gauss claimed he'd been using it since 1795, and historians have been adjudicating ever since.
- **Hastie, Tibshirani & Friedman, *The Elements of Statistical Learning*, Chapter 3** — linear methods for regression done properly: least squares, ridge, lasso, and the subset-selection zoo. Free PDF from the authors.
- **Boyd & Vandenberghe, *Introduction to Applied Linear Algebra* (VMLS), Chapters 12-13** — the cleanest treatment of least squares as projection and the normal equations, with the QR-factorization route you should actually use instead of forming `$X^T X$`.
- **Strang, G., *Linear Algebra and Its Applications*, the "four fundamental subspaces" chapters** — where the column-space picture in this post comes from.
