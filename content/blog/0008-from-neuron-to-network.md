+++
title = "From lines to language models: Part 4 - One neuron is a vote, a network is a committee"
date = 2026-08-21
description = "Four points labeled 0,1,1,0 defeat every line in existence, because no half-plane contains exactly two opposite corners of a square. The fix is wiring: a neuron is just Part 3's logistic regression, so feed neurons' outputs to other neurons as features, and the hidden layer redraws the map so XOR becomes linearly separable in (h1, h2) coordinates. Two linear layers collapse into one, so the nonlinearity is load-bearing; backprop turns out to be the chain rule with caching, and Part 3's g = p − y is still the entire signal, now flowing backward through the stack. Plus: why 'can approximate anything' doesn't mean 'will learn anything', and a committee beating a single voter on two moons."

[extra]
linkedin = "Part 4 of From lines to language models: four points labeled 0,1,1,0 defeat every line in existence. The fix is wiring. Hidden layers redraw the map until the unsolvable becomes linearly separable, and backprop is the chain rule with caching."
tags = ["ml", "neural-networks", "backpropagation", "deep-learning", "intuition"]
categories = ["Research Notes"]
+++

*This is Part 4 of "From lines to language models." [Part 1](@/blog/0005-linear-regression.md) built the weighted opinion poll `$\hat{y} = w \cdot x + b$` and the gradient-descent engine, then planted a question: what if features were learned instead of handcrafted? [Part 2](@/blog/0006-classification-vs-regression.md) split quantity from decision and ordered us to ship probabilities; [Part 3](@/blog/0007-logistic-regression.md) squashed the score into one, derived cross-entropy, and closed on a dare: one line cannot carve an XOR. Time to take the dare.*

Four points, four labels:

```math
(0,0) \to 0, \qquad (0,1) \to 1, \qquad (1,0) \to 1, \qquad (1,1) \to 0
```

That's **XOR**: fire when exactly one input is on. Now find a line (any line, any tilt, any offset) that puts the two 1s on one side and the two 0s on the other. Take your time; the search space is every hyperplane in the plane.

There isn't one, and the reason fits in a sentence: the 1s sit at *opposite corners* of the unit square, and no half-plane contains two opposite corners without also swallowing at least one of the corners between them. Every classifier in Parts 1–3, however honestly it votes, draws exactly one hyperplane. **One voter cannot represent a non-linear opinion.** This tiny truth table is the cleanest possible witness, and it famously helped freeze neural-network research for a decade (Minsky & Papert, further reading).

The fix is not a smarter voter. It's a **committee**.

**TL;DR**

- A **neuron** is nothing new: it's Part 3's logistic regression, a weighted opinion poll `$w \cdot x + b$` plus a squash. The new idea is **wiring**: feed neurons' outputs into other neurons *as features*.
- XOR falls to two hidden neurons you can build by hand: `$h_1 = $` OR, `$h_2 = $` AND, output = `$h_1$` AND NOT `$h_2$`. The punchline: **the hidden layer redraws the map**. In `$(h_1, h_2)$` coordinates, XOR is linearly separable.
- The nonlinearity is **load-bearing**: two linear layers collapse into one linear layer by plain algebra. No squash, no committee, just one voter with extra steps.
- **Backprop is bookkeeping.** It's the chain rule organized so the forward pass caches what the backward pass reuses. Gradient descent is still the learner: Part 1's loop, unchanged. Part 3's `$g = p - y$` is still the entire signal; it just flows backward now, reweighted by each layer's weights and gated by each activation's slope.
- Wide-enough one-hidden-layer nets can approximate any continuous function, but "can represent" ≠ "will learn". Depth buys **composition and reuse**, which is why deep beats wide.
- Learned features are the payoff Part 1 promised: nobody handcrafts `$x^2$` anymore. The hidden layer *is* the feature engineer, on gradient-descent payroll.

## A neuron is nothing new

Strip the biology-flavored vocabulary and a **neuron** is:

```math
h = \phi(w \cdot x + b)
```

A weighted opinion poll over its inputs, then a nonlinearity `$\phi$` (sigmoid, tanh, ReLU; the catalog comes below). With `$\phi = \sigma$` that is *literally* [Part 3](@/blog/0007-logistic-regression.md)'s logistic regression, character for character. If you followed Part 3, you already know everything a single neuron does, with zero new math.

The new idea is **wiring**. Take several neurons, point them all at the same input `$x$`, and collect their outputs into a vector `$h = (h_1, \dots, h_m)$`. Then treat `$h$` as the *feature vector* for another neuron:

```math
h = \phi(W_1 x + b_1), \qquad p = \sigma(w_2 \cdot h + b_2)
```

That's a **multi-layer perceptron** (MLP) with one hidden layer: `$W_1$` is `$m$` opinion polls stacked into a matrix, and the output neuron polls *the polls*. Part 1 planted the question "what if features were learned instead of designed?" This is the answer's shape. The hidden layer's outputs are features nobody handcrafted, and since `$W_1$` sits inside the loss like any other parameter, gradient descent tunes the features and the classifier *in the same loop*.

## XOR by hand: the hidden layer redraws the map

Before letting gradient descent design features, let's design them ourselves once, to see what a hidden layer even buys. XOR in words: "exactly one input is on" = "at least one is on, AND NOT both are on." That's three linearly-separable sub-problems, and a single neuron can do each:

- `$h_1 = $` **OR**`$(x_1, x_2)$`: weights `$(20, 20)$`, bias `$-10$`. Any input on pushes the score to `$+10$`; both off leaves it at `$-10$`. Saturated sigmoid ≈ clean 0/1.
- `$h_2 = $` **AND**`$(x_1, x_2)$`: weights `$(20, 20)$`, bias `$-30$`. Only both-on clears the bar.
- output = `$h_1$` **AND NOT** `$h_2$`: weights `$(20, -20)$`, bias `$-10$`.

Look at the first two: identical weights, different bias. OR and AND are the same weighted vote read at two different thresholds, which is worth noticing before the units start choosing their own settings.

```python
import numpy as np
sigmoid = lambda s: 1 / (1 + np.exp(-s))

W1 = np.array([[20., 20.],     # rows are the inputs x1, x2
               [20., 20.]])    # columns are the neurons: h1 (OR), h2 (AND)
b1 = np.array([-10., -30.])    # same weights both times, only the bias differs
w2 = np.array([20., -20.])     # output: h1 AND NOT h2
b2 = -10.

print(f"{'x1':>3} {'x2':>3}   {'h1(OR)':>7} {'h2(AND)':>8}   {'p':>6}   target")
for x1, x2, y in [(0,0,0), (0,1,1), (1,0,1), (1,1,0)]:
    h = sigmoid(np.array([x1, x2]) @ W1 + b1)
    p = sigmoid(h @ w2 + b2)
    print(f"{x1:>3} {x2:>3}   {h[0]:7.4f} {h[1]:8.4f}   {p:6.4f}   {y}")

print("\nin (h1, h2) space the four points sit at ~(0,0), (1,0), (1,0), (1,1)")
print("and the line h1 - h2 = 0.5 separates them. XOR is now LINEAR.")
```

<!-- output -->

Read the hidden columns, because that's where the whole post lives. The four inputs land at roughly `$(0,0)$`, `$(1,0)$`, `$(1,0)$`, `$(1,1)$` in `$(h_1, h_2)$` coordinates. The two positive examples got **folded onto the same point**, and the line `$h_1 - h_2 = 0.5$` now separates the classes trivially. The output neuron is a plain Part 3 voter; it just votes in better coordinates.

**The hidden layer redraws the map.** And you have met this machine before: this is exactly what the mail-sorting machine in [the embeddings post](@/blog/0002-what-are-embeddings.md) does. Hidden layers are *learned coordinates in which the problem becomes easy*. An embedding model is a stack of these layers with the classifier head snapped off: you keep the redrawn map and throw away the final vote.

## The nonlinearity is load-bearing

Tempting simplification: skip the squash, stack linear layers, stay differentiable and tidy. Watch what happens:

```math
W_2 (W_1 x + b_1) + b_2 \;=\; (W_2 W_1)\, x + (W_2 b_1 + b_2) \;=\; W' x + b'
```

Two linear layers **collapse into one**. A hundred stacked linear layers are a single opinion poll with extra steps, still one hyperplane, still defeated by four points. The nonlinearity between layers is the only thing standing between "network" and "expensive line."

Which `$\phi$`, then? Sigmoid is the historical default, and for a *single* output neuron it's still right (Part 3 derived it from log-odds). But as a *hidden* activation in deep stacks it has a familiar disease: it **saturates**, and its slope `$\sigma' = \sigma(1-\sigma)$` tops out at 0.25. Part 2 met this villain once: the vanishing `$\sigma'$` that strangled squash-plus-squared-error. Part 3 cancelled it *at the output* by matching the loss to the link. But hidden layers get no such cancellation: as you'll see below, the backward signal picks up one activation-slope factor *per layer*, and `$0.25^{8} \approx 1.5 \times 10^{-5}$`. Deep sigmoid stacks starve their early layers. What was a squashing problem in Part 2 is a *depth* problem here.

**tanh** is that same S-curve recentred: it runs from `$-1$` to `$1$`, sits at zero for zero input (so a layer's outputs don't all shove the next layer's weights the same way), and its slope tops out at 1 instead of 0.25, which is four times more signal surviving each layer. Its derivative is `$1 - \tanh^2$`, computable from the cached output alone, which is why it appears as `(1 - h**2)` in the demos below.

The modern default is **ReLU**, `$\mathrm{ReLU}(s) = \max(0, s)$`: costs one comparison, and its slope is exactly 1 for every `$s > 0$`, with no saturation and no shrinking factors. (The price: units stuck at `$s < 0$` pass nothing, the "dead ReLU"; with sane init, enough units stay alive.) One sentence worth keeping: since ReLU is piecewise-linear and compositions of piecewise-linear maps are piecewise-linear, **a ReLU network is a machine for assembling many linear pieces into one function** (a committee of lines impersonating a curve, with more pieces than you'd ever handcraft).

## Backprop is bookkeeping, not learning

Now the part with the scary reputation. Gradient descent needs `$\partial \mathcal{L} / \partial \theta$` for every parameter `$\theta$` in every layer, and the network is a composition of functions, so the tool is the **chain rule** (the same one Part 1 used, applied more than once). **Backpropagation** is nothing but the chain rule *organized*: run the network forward and **cache** every intermediate value, then walk backward reusing the caches, so no derivative is computed twice.

Take our one-hidden-layer network with cross-entropy loss, and start from what [Part 3](@/blog/0007-logistic-regression.md) already proved: the gradient of the loss with respect to the output score is

```math
g = p - y
```

three characters wide, the entire learning signal. For the output layer's weights, chain through `$s_2 = w_2 \cdot h + b_2$`: the gradient is `$g \, h$`. That is *error times the feature that caused it*, Part 1's sentence verbatim, except the "features" are now the hidden activations. Then keep chaining, one hop per arrow, back into the hidden layer:

```math
\frac{\partial \mathcal{L}}{\partial h} = g \, w_2,
\qquad
\frac{\partial \mathcal{L}}{\partial s_1} = \underbrace{g \, w_2}_{\text{reweighted}} \odot \underbrace{\phi'(s_1)}_{\text{gated}},
\qquad
\frac{\partial \mathcal{L}}{\partial W_1} = \bigl(g \, w_2 \odot \phi'(s_1)\bigr)\, x^{\top}
```

Read the middle expression as a story: the output error `$g$` flows backward, gets **reweighted** by the output layer's weights (`$w_2$` says how much each hidden unit's opinion mattered, so it also says how much blame each one gets), and gets **gated** by the activation's slope `$\phi'$` (a saturated unit wasn't listening on the way forward, so it takes no blame on the way backward; there's the `$0.25$`-per-layer tax on sigmoid, and ReLU's slope-1 exemption). Deeper networks just repeat the reweight-and-gate step once per layer.

Which turns the activation question from a moment ago into something measurable. Stack eight layers, run exactly this backward pass, and print how much gradient survives to each one:

```python
import numpy as np
np.random.seed(0)
sigmoid = lambda s: 1 / (1 + np.exp(-s))

L, width = 8, 16
x = np.random.randn(64, width)
y = (np.random.rand(64) > 0.5).astype(float)

activations = {"sigmoid": (sigmoid,                    lambda h: h * (1 - h)),
               "tanh":    (np.tanh,                    lambda h: 1 - h**2),
               "ReLU":    (lambda s: np.maximum(0, s), lambda h: (h > 0) * 1.0)}

print("norm of the gradient arriving at each layer, after one backward pass")
print("           " + "".join(f"{'layer ' + str(i):>11}" for i in (1, 4, 8)))
for name, (phi, dphi) in activations.items():
    np.random.seed(1)
    Ws = [np.random.randn(width, width) * 0.5 for _ in range(L)]
    hs = [x]
    for W in Ws:                                     # forward, caching every layer
        hs.append(phi(hs[-1] @ W))
    w_out = np.random.randn(width) * 0.5
    d = np.outer(sigmoid(hs[-1] @ w_out) - y, w_out) * dphi(hs[-1])
    norms = {}
    for i in range(L - 1, -1, -1):                   # backward, reweight and gate
        norms[i + 1] = np.linalg.norm(hs[i].T @ d)
        d = (d @ Ws[i].T) * dphi(hs[i])
    print(f"{name:>9}:  " + "".join(f"{norms[i]:>11.2e}" for i in (1, 4, 8))
          + f"     layer 8 / layer 1 = {norms[8] / norms[1]:8.1f}x")
```

<!-- output -->

Read the sigmoid row. The gradient arriving at layer 8 is over a thousand times larger than the gradient arriving at layer 1, because eight `$\sigma'$` factors have gated it on the way down. The early layers, the ones meant to be building the primitive features everything above them reuses, are close to frozen. tanh and ReLU keep the signal roughly the same size the whole way. That is the entire case for the modern default, and note that it is a *depth* argument: at the two-layer scale of this post's demos any of the three works fine, which is why the code here uses tanh and doesn't apologize for it.

And note what backprop is *not*: it is not a learning rule. It never decides how to change a weight; it only delivers gradients, efficiently, by caching forward and reusing backward. The learner is still gradient descent: Part 1's loop with its stride length `$\eta$`, character for character unchanged. Backprop is the accountant; gradient descent is still the one walking downhill.

## XOR learned from scratch

Enough hand-construction. Random init, forward, backward, update: the same loop from Part 1, now with a hidden layer to walk back through:

```python
import numpy as np
np.random.seed(0)
sigmoid = lambda s: 1 / (1 + np.exp(-s))

X = np.array([[0.,0], [0,1], [1,0], [1,1]])
y = np.array([0., 1, 1, 0])

W1 = np.random.randn(2, 4) * 0.5; b1 = np.zeros(4)   # 4 hidden tanh units
w2 = np.random.randn(4) * 0.5;    b2 = 0.0
lr = 1.0

for step in range(1, 3001):
    h = np.tanh(X @ W1 + b1)                  # forward, caching h
    p = sigmoid(h @ w2 + b2)
    g = p - y                                 # Part 3's signal, unchanged
    dh = np.outer(g, w2) * (1 - h**2)         # reweighted by w2, gated by tanh'
    w2 -= lr * h.T @ g / 4;  b2 -= lr * g.mean()
    W1 -= lr * X.T @ dh / 4; b1 -= lr * dh.mean(axis=0)
    if step in (1, 100, 500, 3000):
        loss = -(y*np.log(p) + (1-y)*np.log(1-p)).mean()
        print(f"step {step:4d}   loss = {loss:.4f}   p = {np.round(p, 3)}")

print(f"\ntargets       = {y}")
print(f"final verdict = {(p > 0.5).astype(int)}")
```

<!-- output -->

Ten lines of learning. The backward pass is two lines (`g`, `dh`), and `g = p - y` is still doing all the moral philosophy. Everything after it is reweighting and gating. Try shrinking to 2 hidden units and rerunning with different seeds: seeds 0, 1 and 2 stall at loss `$\approx 0.347$` forever, while 3 through 7 solve it cleanly. That's your first meeting with **non-convexity**. Part 3's one-valley guarantee is officially gone, the landscape has plateaus and bad basins, and the practical remedy is unglamorous: more units than strictly necessary, so *some* random subset starts pointed the right way. Overparameterization is insurance.

## The committee beats the single voter

XOR is four points. Here's the same lesson at two hundred: two interleaved crescent moons, a shape no hyperplane can split, and a head-to-head between Part 3's logistic regression and a small MLP. We train on 140 of the points and keep 60 back, because accuracy on data a model has already seen is a number about memory, not about learning.

```python
import numpy as np
np.random.seed(0)
sigmoid = lambda s: 1 / (1 + np.exp(-s))

t = np.linspace(0, np.pi, 100)                       # two interleaved moons
X = np.vstack([np.c_[np.cos(t), np.sin(t)],
               np.c_[1 - np.cos(t), 0.5 - np.sin(t)]])
X += np.random.normal(0, 0.15, X.shape)
y = np.r_[np.zeros(100), np.ones(100)]

idx = np.random.permutation(200)                     # 140 to train on, 60 held back
tr, te = idx[:140], idx[140:]

w, b = np.zeros(2), 0.0                              # single voter (Part 3)
for _ in range(2000):
    g = sigmoid(X[tr] @ w + b) - y[tr]
    w -= 0.5 * X[tr].T @ g / 140;  b -= 0.5 * g.mean()
score_lr = lambda Z: sigmoid(Z @ w + b)

W1 = np.random.randn(2, 8) * 0.5; b1 = np.zeros(8)   # committee: 8 tanh units
w2 = np.random.randn(8) * 0.5;    b2 = 0.0
for _ in range(4000):
    h = np.tanh(X[tr] @ W1 + b1)
    g = sigmoid(h @ w2 + b2) - y[tr]
    dh = np.outer(g, w2) * (1 - h**2)
    w2 -= 0.5 * h.T @ g / 140;   b2 -= 0.5 * g.mean()
    W1 -= 0.5 * X[tr].T @ dh / 140;  b1 -= 0.5 * dh.mean(axis=0)
score_mlp = lambda Z: sigmoid(np.tanh(Z @ W1 + b1) @ w2 + b2)

for name, f in [("one voter", score_lr), ("committee of 8", score_mlp)]:
    print(f"{name:16s}  train = {((f(X[tr]) > 0.5) == y[tr]).mean():.3f}   "
          f"held out = {((f(X[te]) > 0.5) == y[te]).mean():.3f}")
```

<!-- output -->

The single voter does what a hyperplane can (respectably, on the parts of the moons that don't interleave) and then hits its representational ceiling. The committee bends. Same engine, same loss, same `$g = p - y$`; the only difference is eight learned features between the input and the vote.

Now read the two columns against each other, because that gap is the whole reason this post ends on a warning. The committee scores a perfect 1.000 on the points it trained on and 0.983 on the sixty it never saw. The single voter barely distinguishes the two (0.871 against 0.850), because a hyperplane has too few degrees of freedom to memorize anything even if it wanted to. Expressive power is exactly what makes those two numbers come apart.

## Universal approximation, honestly

A one-hidden-layer network with enough units can approximate **any continuous function** on a bounded region to any accuracy you name (Cybenko 1989, Hornik 1991, further reading). The proof sketch is even intuitive after the ReLU sentence above: enough little bumps and pieces, placed well, can trace any curve. So why stack layers at all?

Because "**can represent**" and "**will learn**" are different claims. The theorem says a good wide network *exists*; it says nothing about finding it by gradient descent from random init, with finite data, in finite time. And the width required can grow absurdly (exponentially, for some functions) as the target gets more compositional. Depth attacks that directly: a deep network computes *features of features*, so a sub-pattern learned once in layer 1 gets **reused** by everything above it, instead of being re-derived by a thousand parallel units. Composition is a compression scheme, and that's why deep beats wide. It's also why the embeddings series was running a stack of these layers the whole time.

One production aside before closing, because more expressive power means more rope. A committee that can bend around two moons can also bend around noise: every mislabeled point in your training set is a shape an MLP will learn to carve. The classical instruments all still work. Ridge's weight penalty from [Part 1](@/blog/0005-linear-regression.md) reappears verbatim as **weight decay**, and **early stopping** quits training while the model still generalizes (watch a held-out set, stop when *its* loss turns upward). The unfashionable truth is that the strongest regularizer is **more data**. Rope is only dangerous in a small room.

## Closing thoughts

Part 3's dare, settled: one line cannot carve XOR, and the fix was wiring. A neuron is Part 3's voter unchanged; the invention is wiring voters into a committee, where the hidden layer redraws the map until the problem is linear. That's the mail-sorting machine from the embeddings series, revealed as layers all the way down. The nonlinearity is load-bearing (linear stacks collapse by one line of algebra), and backprop is the chain rule with a caching discipline. The learner is still Part 1's downhill walk, fed by Part 3's three-character signal `$g = p - y$`, reweighted and gated backward through the stack. What we paid for the power: convexity. One valley became a mountain range, and overparameterization became insurance rather than sin. And Part 1's oldest question is answered: the features nobody handcrafted are the hidden activations, designed by gradient descent on the job.

So we now own a machine that learns its own features and ends in the softmax vote Part 3 told us to remember. Next up: pointing that machine at language. Predicting the next word is (no metaphor) a classification problem over a vocabulary: tens of thousands of classes, softmax + cross-entropy, `$g = p - y$` and all, and taking that framing seriously is where language models begin.

## Further reading

### Visual guides

- **3Blue1Brown, ["But what is a Neural Network?"](https://www.3blue1brown.com/lessons/neural-networks) (2017)**: a visual introduction to weighted layers, nonlinear activations, and why stacking them creates more expressive functions.
- **3Blue1Brown, ["Gradient descent, how neural networks learn"](https://www.3blue1brown.com/lessons/gradient-descent) (2017)**: an intuitive explanation of the loss landscape and the iterative optimization process behind training.
- **3Blue1Brown, ["What is backpropagation really doing?"](https://www.3blue1brown.com/lessons/backpropagation) (2017)**: a visual explanation of how a training example's desired output changes flow backward through a network to update its weights.

### Technical references

- **Minsky, M. & Papert, S., *Perceptrons* (1969)**. The book that made XOR famous: a rigorous map of what single-layer machines cannot represent, widely (if unfairly) blamed for the first neural-network winter.
- **Cybenko, G., "Approximation by superpositions of a sigmoidal function" (1989)** and **Hornik, K., "Approximation capabilities of multilayer feedforward networks" (1991)**. The universal approximation theorems: existence proofs with all the fine print this post's honest paragraph flagged.
