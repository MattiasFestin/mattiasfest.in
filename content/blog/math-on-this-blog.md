+++
title = "Math on this blog"
date = 2026-07-27
description = "Testing compile-time math rendering with Temml and MathML."
+++

This blog now supports math, rendered at build time to native MathML —
no JavaScript, no images, no fonts shipped to you unless a page actually
uses math.

How it works: posts are written with LaTeX in the markdown, and a small
post-build step converts every formula into a native `<math>` element
using [Temml](https://temml.org/). Your browser renders it like any
other text — selectable, accessible, and styled by CSS. Very 1998 in
spirit: the server does the work, the client just displays a document.

Inline math like `$E = mc^2$` sits nicely in a sentence, and so does
something with subscripts like `$x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}$`.

Display math gets its own block:

```math
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
```

Even bigger stuff works, like matrices:

```math
\begin{pmatrix}
  \cos\theta & -\sin\theta \\
  \sin\theta & \cos\theta
\end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
=
\begin{pmatrix} x\cos\theta - y\sin\theta \\ x\sin\theta + y\cos\theta \end{pmatrix}
```

And sums and integrals:

```math
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
\qquad
\sum_{n=1}^\infty \frac{1}{n^2} = \frac{\pi^2}{6}
```

A regular code span like `let x = 42;` is left untouched, and so are
fenced code blocks in other languages.
