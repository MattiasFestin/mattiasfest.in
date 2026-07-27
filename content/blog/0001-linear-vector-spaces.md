+++
title = "Linear Vector Spaces and Metrics: What They Are and Why They Matter"
date = 2025-11-28
description = "A tour of vector spaces, norms, inner products, and metrics — the algebra of combining things and the geometry of closeness, and why the distance you pick changes how your algorithms behave."
authors = ["Mattias Fest"]

[extra]
tags = ["mathematics", "linear-algebra", "metric-space", "intuition"]
categories = ["math"]
+++

**TL;DR**

- A *linear vector space* (or just *vector space*) is a set where you can add elements and scale them by numbers while following familiar algebraic rules.
- A *metric* is a function that measures distance between two points and satisfies non-negativity, identity of indiscernibles, symmetry, and the triangle inequality.
- On vector spaces we commonly use *norms* (and inner products) to produce metrics that respect the linear structure — but metrics can exist without any linear algebra behind them.

**Why this matters**

- Vector spaces give the algebraic machinery for combining and scaling objects: coordinates, signals, polynomials, functions, and feature vectors in machine learning.
- Metrics give the geometric notion of closeness, which is essential for convergence, continuity, clustering, nearest-neighbor search, and optimization.
- Understanding how these two families of ideas interact explains why some distances behave nicely in algorithms and analysis while others don't.

## What is a linear vector space?

Intuitively: think of arrows that you can add and stretch. Formally, a set `$V$` with two operations — vector addition and scalar multiplication (scalars from a field like the real numbers `$\mathbb{R}$`) — is a vector space if it satisfies the usual axioms: commutativity and associativity of addition, additive identity and inverse, distributivity of scalar multiplication, compatibility of scalars, and `$1 \cdot v = v$`.

Key concepts:

- **Subspace**: a subset closed under addition and scalar multiplication.
- **Span**: all linear combinations of a given set of vectors.
- **Linear independence**: no vector in a set is a linear combination of the others.
- **Basis and dimension**: a basis is a linearly independent set whose span is the whole space; the number of basis vectors (if finite) is the dimension.

Common examples:

- `$\mathbb{R}^n$` with coordinate-wise operations.
- Polynomials of degree at most `$k$`.
- Continuous functions on an interval (infinite-dimensional).
- Solution spaces of homogeneous linear differential equations.

## What is a metric?

A metric on a set `$X$` is a function `$d : X \times X \to [0, \infty)$` satisfying:

1. `$d(x, y) \ge 0$` (non-negativity).
2. `$d(x, y) = 0$` if and only if `$x = y$` (identity of indiscernibles).
3. `$d(x, y) = d(y, x)$` (symmetry).
4. `$d(x, z) \le d(x, y) + d(y, z)$` (triangle inequality).

A set equipped with a metric is a *metric space*. The metric defines open balls `$B(x, r) = \{\, y \mid d(x, y) < r \,\}$` and thus a topology — notions of continuity, limits, and convergence.

Typical metrics on `$\mathbb{R}^n$`:

- **Euclidean (L2)** — straight-line distance:

```math
d_2(x, y) = \sqrt{\sum_{i=1}^n (x_i - y_i)^2}
```

- **Manhattan (L1)** — grid-like distance:

```math
d_1(x, y) = \sum_{i=1}^n |x_i - y_i|
```

- **Chebyshev (L∞)** — maximum coordinate difference:

```math
d_\infty(x, y) = \max_i \, |x_i - y_i|
```

- **Discrete metric** — `$d(x, y) = 0$` if `$x = y$`, else `$1$`. Very coarse topology.

## How norms and inner products tie things together

**Norm.** A norm is a function `$\|\cdot\| : V \to [0, \infty)$` on a vector space `$V$` satisfying:

1. `$\|v\| \ge 0$`, and `$\|v\| = 0$` if and only if `$v = 0$`.
2. `$\|\alpha v\| = |\alpha| \, \|v\|$` for scalar `$\alpha$`.
3. `$\|u + v\| \le \|u\| + \|v\|$` (triangle inequality).

Any norm gives a metric by `$d(x, y) = \|x - y\|$`. Metrics from norms are translation-invariant and homogeneous: they respect the linear structure.

**Inner product.** An inner product `$\langle \cdot, \cdot \rangle$` is a bilinear (or sesquilinear) positive-definite form. It induces the norm `$\|v\| = \sqrt{\langle v, v \rangle}$`. Inner products allow geometric notions of angle and orthogonality; norms induced by inner products are called Euclidean (or Hilbertian) norms.

Not all metrics come from norms: the discrete metric on `$\mathbb{R}^n$` cannot, because it fails homogeneity — scaling a vector doesn't scale distances continuously.

## A concrete numeric example

Let `$x = (1, 2)$` and `$y = (4, 6)$`:

- **L2 (Euclidean)**: `$d_2 = \sqrt{(1-4)^2 + (2-6)^2} = 5$`
- **L1 (Manhattan)**: `$d_1 = |1-4| + |2-6| = 7$`
- **L∞ (Chebyshev)**: `$d_\infty = \max(|1-4|, |2-6|) = 4$`

Each distance emphasizes different aspects; choosing one over another changes algorithmic behavior (e.g. which points count as nearest neighbors).

## Geometry: unit balls and intuition

The unit ball `$\{\, v : \|v\| \le 1 \,\}$` visualizes the geometry of the norm. In 2D:

- L2 → circle
- L1 → diamond
- L∞ → square

The shape of the unit ball determines which directions are "cheap" or "expensive" in terms of distance, which in turn affects optimization landscapes and regularization behavior.

## Topology and completeness

The metric-induced topology determines convergence and continuity. A metric space is **complete** if every Cauchy sequence converges in the space:

- `$\mathbb{R}^n$` with Euclidean distance is complete.
- The rationals `$\mathbb{Q}$` are not complete with the standard metric — limits can be irrational.

## Where you'll see these ideas in practice

- **Machine learning**: k-NN, clustering, embedding quality, and loss landscapes depend on the chosen distance.
- **Optimization**: the choice of norm changes convexity geometry and sparsity (L1 vs L2 regularization).
- **Functional analysis**: Banach spaces (complete normed vector spaces) and Hilbert spaces (complete inner-product spaces) are foundational in PDEs and signal processing.
- **Signal processing and statistics**: L2 measures energy, L1 promotes sparsity (compressed sensing).

## Common confusions clarified

- **Metric vs norm vs inner product**:
  - Metric: any distance function with the four axioms.
  - Norm: a special function on vector spaces that yields a metric via differences.
  - Inner product: gives angles and lengths; induces a norm and thus a metric.
- A metric need not respect linear structure; a norm-induced metric does.
- Many useful properties (scaling behavior, translation invariance, the parallelogram law) require norms or inner products.

## Proof sketches

- **Norm ⇒ metric**: if `$\|\cdot\|$` satisfies the norm axioms, then `$d(x, y) = \|x - y\|$` satisfies the metric axioms by straightforward verification — positivity is inherited, symmetry follows from `$\|x - y\| = \|y - x\|$`, and the triangle inequality follows from the norm's.
- **Not every metric is norm-induced**: the discrete metric fails homogeneity.

## Further reading

- Sheldon Axler — *Linear Algebra Done Right* (linear algebra foundations).
- Walter Rudin — *Principles of Mathematical Analysis* (metric spaces and topology).
- Gilbert Strang's linear algebra lectures; standard introductions to metric spaces, Banach and Hilbert spaces.
