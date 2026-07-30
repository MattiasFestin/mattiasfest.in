+++
title = "Linear Vector Spaces and Metrics: What They Are and Why They Matter"
date = 2025-11-25
description = "Vector spaces are the algebra of combining things; metrics are the geometry of closeness. A guided tour of norms, inner products, unit balls, and the structure ladder, plus a worked example where the choice of distance changes the answer."
authors = ["Mattias Fest"]

[extra]
tags = ["mathematics", "linear-algebra", "metric-space", "intuition"]
categories = ["math"]
+++

Here's a puzzle. Take three points in `$\mathbb{R}^3$`:

```math
a = (3, 0, 0), \qquad b = (2, 2, 0), \qquad c = (1.8,\, 1.8,\, 1.8)
```

Which one is closest to the origin?

The honest answer: **it depends on how you measure**, and not in a hand-wavy way. Under one perfectly standard distance the answer is `$a$`, under another it's `$b$`, and under a third it's `$c$`. Same three points, three different nearest neighbors. We'll compute all of it below.

If that surprises you, this post is for you. If it doesn't, stick around anyway. We'll get to why cosine distance isn't really a distance, what the parallelogram law secretly tests, and why "nearest neighbor" starts to lose meaning in high dimensions.

**TL;DR**

- A *linear vector space* is a set where you can **add** elements and **scale** them by numbers, following familiar algebraic rules. It knows nothing about distance.
- A *metric* is a function measuring distance between two points, satisfying four axioms. It knows nothing about algebra: you can put a metric on strings, graphs, anything.
- The two meet through **norms** and **inner products**, which form a ladder of increasingly rich structure: inner product, then norm, then metric, then topology. Each step down keeps distance but forgets something (angles, then lengths, then distances themselves).
- The distance you pick is a modeling decision. It changes which points count as neighbors, what regularizers do, and whether your algorithm's limits even exist.

**Why this matters**

- Vector spaces give the algebraic machinery for combining and scaling objects: coordinates, signals, polynomials, functions, and the embedding vectors your ML stack lives on.
- Metrics give the geometric notion of closeness, which is essential for convergence, continuity, clustering, nearest-neighbor search, and optimization.
- Knowing which rung of the ladder your "distance" sits on tells you what you're allowed to do with it, and what will silently break.

## Two pillars, one story

There are two independent ideas here, and most confusion comes from blending them too early.

**Algebra: the vector space.** A world where objects can be *combined* (added) and *scaled* (multiplied by numbers). Nothing in the definition mentions distance. You can average two vectors; you cannot yet say how far apart they are.

**Geometry: the metric.** A world where any two objects have a *distance*. Nothing in the definition mentions addition. You can ask how far apart two strings are; you cannot add strings.

The interesting mathematics, and nearly all of applied ML, happens where the pillars meet: distances on vector spaces that *respect* the algebra. But keep the pillars separate in your head. It's the key to never again confusing a metric with a norm.

## Pillar one: what is a linear vector space?

Intuitively: arrows you can add tip-to-tail and stretch. Formally, a set `$V$` with two operations, vector addition and scalar multiplication (scalars from a field, for us `$\mathbb{R}$`), is a **vector space** if the operations behave the way school algebra trained you to expect:

1. Addition is commutative and associative.
2. There's a zero vector, and every vector has an additive inverse.
3. Scalar multiplication distributes over both vector and scalar addition.
4. Scalars compose: `$\alpha(\beta v) = (\alpha\beta)v$`, and `$1 \cdot v = v$`.

The axioms look bureaucratic, but they're doing one job: guaranteeing that **linear combinations** `$\alpha_1 v_1 + \dots + \alpha_k v_k$` make sense and behave predictably. That single guarantee powers everything downstream:

- **Subspace**: a subset closed under addition and scaling (a plane through the origin).
- **Span**: everything reachable by linear combinations of a given set.
- **Linear independence**: no vector in a set is redundant; none is a combination of the others.
- **Basis and dimension**: a minimal spanning set; its size (when finite) is the dimension, and it's the same for every basis. That's why "768-dimensional embedding" is a well-defined phrase.

The examples are broader than "arrows":

- `$\mathbb{R}^n$` with coordinate-wise operations, the workhorse.
- Polynomials of degree at most `$k$`.
- Continuous functions on an interval: you can add functions and scale them, so *functions are vectors*. (Infinite-dimensional, and the reason functional analysis exists.)
- Solutions of a homogeneous linear ODE: the sum of two solutions is a solution.

And some instructive **non-examples**:

- Strings under concatenation: no inverses (you can't un-concatenate), no scaling. That's why "distance between strings" will need a metric with no algebra behind it.
- Probability distributions: they add fine, but scaling by `$-1$` or `$2$` leaves the set (negative or unnormalized "probabilities"). They form a *convex* set, not a vector space, a weaker but still useful structure.

## Pillar two: what is a metric?

A **metric** on a set `$X$` is a function `$d : X \times X \to [0, \infty)$` satisfying four axioms. Each one is a promise your algorithms rely on:

1. **Non-negativity**: `$d(x, y) \ge 0$`. Distances aren't negative.
2. **Identity of indiscernibles**: `$d(x, y) = 0 \iff x = y$`. Zero distance means *same point*, so "distance zero" is a safe deduplication test.
3. **Symmetry**: `$d(x, y) = d(y, x)$`. The distance doesn't care which end you stand on.
4. **Triangle inequality**: `$d(x, z) \le d(x, y) + d(y, z)$`. No shortcuts through a midpoint. This is the axiom that lets search structures *prune*: "everything in that region is provably too far, skip it."

A set with a metric is a **metric space**. Crucially, `$X$` needs no algebra at all:

- **Edit (Levenshtein) distance** on strings: the minimum number of single-character edits. A genuine metric on a set that isn't remotely a vector space.
- **Shortest-path distance** on a graph's nodes.
- The **discrete metric** (`$d(x,y) = 0$` if `$x = y$`, else `$1$`) on any set whatsoever. Coarse, but legal.

On `$\mathbb{R}^n$`, the classics:

- **Euclidean (L2)**, the straight-line distance:

```math
d_2(x, y) = \sqrt{\sum_{i=1}^n (x_i - y_i)^2}
```

- **Manhattan (L1)**, the grid-taxi distance:

```math
d_1(x, y) = \sum_{i=1}^n |x_i - y_i|
```

- **Chebyshev (L∞)**, the worst single coordinate:

```math
d_\infty(x, y) = \max_i \, |x_i - y_i|
```

### Famous near-misses

Plenty of useful "distances" fail an axiom, and knowing *which* axiom tells you what you can't do with them:

- **Cosine distance** `$1 - \cos(x,y)$`: can violate the triangle inequality, so it's not a metric, and metric-tree pruning arguments don't apply. Fine for ranking neighbors, though, and on unit vectors it's monotonically related to Euclidean distance. ([I use it constantly in the embeddings series](@/blog/0002-what-are-embeddings.md).)
- **KL divergence** between distributions: fails symmetry *and* the triangle inequality. Immensely useful; just don't call it a distance and don't feed it to algorithms that assume one.
- **Quasimetrics**: drop symmetry. Travel *time* in a city with one-way streets is the canonical example.
- **Pseudometrics**: drop identity of indiscernibles, so distinct points may sit at distance zero. This is what you get whenever a representation collapses different inputs to the same vector.

That first claim shouldn't be taken on faith, and we don't have to: an SMT solver can *invent* the counterexample for us. Fix `$u = (1, 0)$` and `$w = (0, 1)$` on the unit circle and ask Z3 (`pip install z3-solver`) for a unit vector `$v$` that breaks the triangle inequality for cosine distance:

```python
from z3 import Reals, Solver

vx, vy = Reals("vx vy")
s = Solver()
s.add(vx * vx + vy * vy == 1)     # v is a unit vector
d_uv = 1 - vx                     # cosine distance to u = (1, 0)
d_vw = 1 - vy                     # cosine distance to w = (0, 1)
d_uw = 1 - 0                      # cosine distance from u to w
s.add(d_uv + d_vw < d_uw)         # demand a triangle violation
print(s.check())
print(s.model())
```

<!-- output -->

`sat` means "such a vector exists," and the model is Z3's exact answer: `$v = (1/2, \sqrt{3}/2)$`, the 60-degree point (the `?` marks a decimal rendering of an exact algebraic number). Check it: `$d(u,v) + d(v,w) = 0.5 + 0.134 = 0.634 < 1 = d(u,w)$`. Going through `$v$` is a shortcut, which a true metric never allows.

## The structure ladder

Here's the map of how the pillars connect. Each level *induces* the one below it, and each step down forgets something:

```
 inner product  ->   norm   ->   metric   ->   topology
 <u, v>              ||v||       d(x, y)       open sets

 angles,             lengths,    distances     convergence,
 orthogonality,      scaling     between       continuity,
 projections                     points        limits
```

Climbing *up* the ladder is the hard direction: most metrics don't come from norms, and most norms don't come from inner products. There are clean tests for both, coming right up.

### Norms: lengths that respect the algebra

A **norm** on a vector space `$V$` is a function `$\|\cdot\| : V \to [0, \infty)$` with:

1. `$\|v\| = 0$` if and only if `$v = 0$` (definiteness).
2. `$\|\alpha v\| = |\alpha| \, \|v\|$` (absolute homogeneity: doubling a vector doubles its length).
3. `$\|u + v\| \le \|u\| + \|v\|$` (triangle inequality).

Every norm induces a metric by `$d(x, y) = \|x - y\|$`, and metrics born this way inherit two superpowers a raw metric lacks: **translation invariance** (`$d(x+w,\, y+w) = d(x,y)$`, so geometry looks the same everywhere) and **homogeneity** (scaling the space scales all distances uniformly). That's what "a distance that respects the linear structure" means, precisely.

The `$L^p$` family unifies the classics: for `$p \ge 1$`,

```math
\|x\|_p = \Big(\sum_{i=1}^n |x_i|^p\Big)^{1/p},
```

with `$p = 1$` (Manhattan), `$p = 2$` (Euclidean), and `$p \to \infty$` (Chebyshev) as the landmarks.

Not every metric climbs the ladder. The discrete metric can't come from a norm: homogeneity would demand `$d(2x, 0) = 2\,d(x, 0)$`, but discrete distances only take values `$0$` and `$1$`. Edit distance can't either; its home has no scaling to respect.

### Unit balls: the norm, drawn

Everything about a norm is encoded in one picture: its **unit ball** `$\{\, v : \|v\| \le 1 \,\}$`.

<figure style="text-align: center;">
<svg viewBox="-1.7 -1.7 3.4 3.4" width="340" height="340" role="img" aria-label="Unit balls of the L1, L2, and L-infinity norms in 2D: a diamond inscribed in a circle inscribed in a square" style="max-width: 100%;">
  <line x1="-1.6" y1="0" x2="1.6" y2="0" stroke="#999" stroke-width="0.02"/>
  <line x1="0" y1="-1.6" x2="0" y2="1.6" stroke="#999" stroke-width="0.02"/>
  <rect x="-1" y="-1" width="2" height="2" fill="none" stroke="#2ecc71" stroke-width="0.045"/>
  <circle cx="0" cy="0" r="1" fill="none" stroke="#3498db" stroke-width="0.045"/>
  <polygon points="1,0 0,1 -1,0 0,-1" fill="none" stroke="#e74c3c" stroke-width="0.045"/>
</svg>
<figcaption>The 2D unit balls: L1 is the red diamond, L2 the blue circle, L∞ the green square. Same "radius one", three different ideas of which points qualify.</figcaption>
</figure>

Reading the picture:

- The **shape tells you which directions are cheap**. The L1 diamond reaches its corners only on the axes: moving along one coordinate at a time is efficient; diagonal moves are expensive. The L∞ square is the opposite: diagonals are free rides.
- **This is why L1 regularization gives sparsity.** Constraining a model's weights to an L1 ball and minimizing a loss means finding where the loss's contours first touch the ball. A diamond gets touched at its *corners*, where coordinates are exactly zero. The smooth L2 circle has no corners, so L2 regularization shrinks weights without zeroing them. A one-picture explanation of lasso vs. ridge.
- **Convexity is the triangle inequality in disguise.** For `$0 < p < 1$` the `$L^p$` "ball" caves inward (non-convex), and correspondingly `$\|\cdot\|_p$` fails the triangle inequality. Not a norm.
- The correspondence runs both ways: *any* convex body that's symmetric about the origin (and bounded, with nonempty interior) defines a norm, via how much you must inflate it to swallow a point. Norms and symmetric convex bodies are the same data. Design a shape, get a geometry.

### Inner products: where angles live

An **inner product** `$\langle \cdot, \cdot \rangle$` on a real vector space is a symmetric, bilinear, positive-definite form; on `$\mathbb{R}^n$` it's the familiar `$\langle u, v \rangle = \sum_i u_i v_i$`. It induces a norm `$\|v\| = \sqrt{\langle v, v \rangle}$` (that's exactly L2), and it's the top of the ladder because it adds the concepts every level below lacks:

- **Angles.** The **Cauchy-Schwarz inequality**, `$|\langle u, v \rangle| \le \|u\| \|v\|$`, guarantees that

```math
\cos \theta = \frac{\langle u, v \rangle}{\|u\|\,\|v\|} \in [-1, 1],
```

  so the angle between vectors is *well-defined*. Every cosine similarity ever computed is cashing this check.
- **Orthogonality** (`$\langle u, v \rangle = 0$`) and with it **projections**: decomposing a vector into "the part along `$v$`" plus "the rest." Least squares, Fourier series, PCA: all projections.

**How do you know if a norm secretly comes from an inner product?** There's an exact litmus test, the **parallelogram law**:

```math
\|u + v\|^2 + \|u - v\|^2 = 2\|u\|^2 + 2\|v\|^2.
```

A norm satisfies this identity if and only if it's induced by an inner product. Watch L1 flunk it in `$\mathbb{R}^2$`: take `$u = (1, 0)$`, `$v = (0, 1)$`. Then `$\|u+v\|_1 = \|u-v\|_1 = 2$`, so the left side is `$4 + 4 = 8$`; the right side is `$2 \cdot 1 + 2 \cdot 1 = 4$`. No inner product on any vector space, however cleverly chosen, produces Manhattan distance. Angles are a genuinely *extra* piece of structure: L2 has them, L1 and L∞ simply don't.

The flunk test, executable:

```python
import numpy as np

u, v = np.array([1.0, 0.0]), np.array([0.0, 1.0])
for name, norm in [("L2", np.linalg.norm), ("L1", lambda x: np.abs(x).sum())]:
    lhs = norm(u + v)**2 + norm(u - v)**2
    rhs = 2 * norm(u)**2 + 2 * norm(v)**2
    print(f"{name}: lhs = {lhs:.1f}, rhs = {rhs:.1f}, holds = {bool(np.isclose(lhs, rhs))}")
```

<!-- output -->

Notice the asymmetry in what these two lines establish. The L1 line is a *disproof*: one failing example settles it forever. The L2 line is merely one passing example, and no number of examples proves a law that quantifies over all vectors. For that, hand the whole claim to Z3 and let it reason about every pair of vectors in `$\mathbb{R}^2$` at once:

```python
from z3 import Reals, prove

u1, u2, w1, w2 = Reals("u1 u2 w1 w2")
sq = lambda a, b: a * a + b * b   # squared L2 norm
prove(sq(u1 + w1, u2 + w2) + sq(u1 - w1, u2 - w2) == 2 * sq(u1, u2) + 2 * sq(w1, w2))
```

<!-- output -->

One counterexample kills L1's claim to angles; one `proved` settles L2's, for all vectors, not just the ones we tried.

## The puzzle, resolved

Back to `$a = (3,0,0)$`, `$b = (2,2,0)$`, `$c = (1.8, 1.8, 1.8)$`, and their distance to the origin:

|              | `$a$`   | `$b$`               | `$c$`                     | nearest |
|--------------|---------|---------------------|---------------------------|---------|
| **L1**       | `$3$`   | `$4$`               | `$5.4$`                   | `$a$`   |
| **L2**       | `$3$`   | `$\sqrt{8} \approx 2.83$` | `$1.8\sqrt{3} \approx 3.12$` | `$b$`   |
| **L∞**       | `$3$`   | `$2$`               | `$1.8$`                   | `$c$`   |

Three norms, three different nearest neighbors, from the *same* three points. And each answer is defensible:

- L1 charges for total coordinate-wise change, so it favors `$a$`, which moves in only one coordinate. (Think: total edits across fields.)
- L2 measures straight-line displacement and favors `$b$`.
- L∞ only cares about the *worst* coordinate and favors `$c$`, which spreads its budget thinly everywhere. (Think: worst-case tolerance across specs.)

Don't take the table's word for it. The whole puzzle is ten lines of numpy:

```python
import numpy as np

a, b, c = np.array([3, 0, 0]), np.array([2, 2, 0]), np.array([1.8, 1.8, 1.8])
points = {"a": a, "b": b, "c": c}
norms = {
    "L1":   lambda v: np.abs(v).sum(),
    "L2":   lambda v: np.sqrt((v**2).sum()),
    "Linf": lambda v: np.abs(v).max(),
}
for name, norm in norms.items():
    dists = {label: norm(v) for label, v in points.items()}
    nearest = min(dists, key=dists.get)
    pretty = ", ".join(f"{k}={v:.2f}" for k, v in dists.items())
    print(f"{name}:  {pretty}  ->  nearest: {nearest}")
```

<!-- output -->

"Which point is nearest?" is not a question about the points. It's a question about **what you decide distance should mean**. Every k-NN classifier, every clustering run, every retrieval system has this decision baked in, made deliberately or by default.

## Topology and completeness: what distance is *for*

A metric does more than answer one-off distance queries. It defines **open balls** `$B(x, r) = \{\, y \mid d(x, y) < r \,\}$`, and through them a topology: which sequences converge, which functions are continuous, what "limit" means. This is the bottom rung of the ladder, and it's the rung analysis runs on.

A metric space is **complete** if every Cauchy sequence (one whose points eventually crowd arbitrarily close together) actually converges to a point *in the space*:

- `$\mathbb{R}^n$` with any norm is complete.
- `$\mathbb{Q}$` is not: `$3, 3.1, 3.14, 3.141, \dots$` is Cauchy, but its limit `$\pi$` has left the building.

Why practitioners should care: iterative algorithms produce sequences, and completeness is the guarantee that the thing they're converging *to* exists in your space. The crown jewel is the **Banach fixed-point theorem**: in a complete metric space, any contraction mapping has exactly one fixed point, and iterating from anywhere converges to it. That single theorem underwrites existence of ODE solutions and the convergence of value iteration in reinforcement learning. Complete normed spaces are called **Banach spaces**; complete inner-product spaces are **Hilbert spaces**, the setting of quantum mechanics, Fourier analysis, and kernel methods.

One more expert nugget: in *finite* dimensions, **all norms are equivalent**. For any two norms there are constants `$c, C > 0$` with `$c\,\|x\|_a \le \|x\|_b \le C\,\|x\|_a$` for every `$x$`. So L1, L2, and L∞ agree about topology: the same sequences converge, the same functions are continuous, completeness holds regardless. The puzzle above doesn't contradict this; equivalence protects *limits*, not *rankings*. Which neighbor is nearest can flip; whether the algorithm converges cannot. Knowing which of your conclusions are topological (robust to the choice) and which are geometric (sensitive to it) is half the craft.

## High dimensions are weird

A warning label for anyone doing nearest-neighbor work in hundreds of dimensions: our unit-ball intuition is drawn in 2D, and it lies.

- Almost all of a high-dimensional ball's volume huddles near its surface; the "center" is essentially empty.
- Under broad conditions, pairwise distances **concentrate**: the gap between the nearest and farthest neighbor shrinks *relative to* the distances themselves as dimension grows. "Nearest" becomes a photo finish, and metrics lose contrast. (See Beyer et al., below.)
- The norms drift apart in scale (`$\|x\|_1$` can exceed `$\|x\|_2$` by a factor of `$\sqrt{n}$`), so thresholds tuned under one norm don't transfer to another.

None of this makes high-dimensional retrieval hopeless. Real data lives near much lower-dimensional structure, which is why [embeddings](@/blog/0002-what-are-embeddings.md) work at all. But it explains why distance choices, normalization, and evaluation matter *more* up there, not less.

## Where you'll meet these ideas

- **Machine learning**: k-NN and clustering inherit their behavior from the metric; embedding retrieval is applied inner-product geometry; L1 vs. L2 regularization is unit-ball geometry.
- **Optimization**: the norm shapes the landscape. Proximal methods, trust regions, and gradient descent's very convergence statements are metric statements.
- **Functional analysis**: Banach and Hilbert spaces are "vector spaces + completeness," the foundation for PDEs and signal processing.
- **Signal processing and statistics**: L2 measures energy; L1 promotes sparsity (compressed sensing recovers signals from few measurements by exploiting exactly the diamond's corners).

## Common confusions, sorted

- **Metric vs. norm vs. inner product**: three rungs, not synonyms. A metric measures distance between points of *any* set. A norm measures length of vectors and needs the algebra. An inner product adds angles and needs even more. Each induces the previous; none of the reverse directions is automatic.
- **"Distance function" does not mean metric.** Cosine distance and KL divergence are respectable dissimilarities that fail the axioms. Check before feeding them to anything that assumes the triangle inequality.
- **Norm equivalence is not interchangeability.** In finite dimensions all norms give the same notion of convergence, and can still disagree about every single nearest neighbor.
- **The parallelogram law is the boundary** between "has angles" and "doesn't." If your norm fails it, stop looking for the inner product; there isn't one.

## Proof sketches, for the curious

**Norm implies metric.** Set `$d(x,y) = \|x - y\|$`. Definiteness gives axioms 1 and 2; symmetry follows from `$\|x-y\| = \|(-1)(y-x)\| = \|y-x\|$` by homogeneity; and the triangle inequality is one telescoping step:

```math
d(x,z) = \|(x - y) + (y - z)\| \le \|x-y\| + \|y-z\| = d(x,y) + d(y,z).
```

**The discrete metric is not norm-induced.** If it were, homogeneity would force `$d(2x, 0) = \|2x\| = 2\|x\| = 2\,d(x, 0)$`, giving a distance of `$2$`, but the discrete metric never exceeds `$1$`. Contradiction.

**Cauchy-Schwarz in four lines.** For any `$t \in \mathbb{R}$`, positive-definiteness gives

```math
0 \le \|u - t v\|^2 = \|u\|^2 - 2t\,\langle u, v\rangle + t^2 \|v\|^2.
```

A quadratic in `$t$` that never goes negative has non-positive discriminant: `$4\langle u,v\rangle^2 - 4\|u\|^2\|v\|^2 \le 0$`, i.e. `$|\langle u, v \rangle| \le \|u\| \|v\|$`. Angles, and every cosine similarity with them, are downstream of this one inequality.

## Further reading

- Sheldon Axler, *Linear Algebra Done Right*: the vector-space pillar, done properly.
- Walter Rudin, *Principles of Mathematical Analysis*: metric spaces, completeness, topology.
- Beyer, Goldstein, Ramakrishnan, Shaft, *When Is "Nearest Neighbor" Meaningful?* (ICDT 1999): the distance-concentration result behind the high-dimensions section.

## Closing thoughts

Vector spaces let you combine; metrics let you compare. Norms and inner products are the bridge: distances that respect the algebra, with the parallelogram law marking exactly where angles begin. Keep the ladder in mind and every definition in this post has a place: each rung adds structure, each induces the rung below, and each "distance" you meet in the wild sits on some rung (or, like cosine distance, just off it).

And the puzzle is the takeaway: nearness is a decision, not a fact. If you'd like to see that decision playing out in a production-shaped setting, where a learned model chooses what "close" means and changing the model reshuffles every neighborhood, that's my series on embeddings, starting with [What is an embedding?](@/blog/0002-what-are-embeddings.md)
