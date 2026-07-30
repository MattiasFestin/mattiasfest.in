+++
title = "Python.exe: run code right here on the blog"
date = 2026-07-28
description = "Every Python snippet on this blog now has a Try me button that opens a retro editor and runs the code in your browser. No installs, powered by Pyodide and WebAssembly."
+++

See a Python snippet on this blog, press **▶ Try me**, and it opens in
`Python.exe`, a little Notepad-style editor with an MS-DOS output pane.
Edit the code, press **Run** (or **F5**, like the good old days), and it
executes *in your browser*. No installs, no server, nothing sent anywhere.

Under the hood it's [Pyodide](https://pyodide.org/), real CPython
compiled to WebAssembly. The runtime (~10 MB) is downloaded only when
you open the editor, and cached after that. If you never click, this
page is as light as any other.

## Start small

The classic, but make it 1998:

```python
for greeting in ["Hello, World!", "It is now safe to run some Python."]:
    print(greeting)
```

Change the strings, press F5, live a little.

## Estimate π by throwing darts

Monte Carlo estimation: throw random darts at a square, count how many
land inside the circle. Crank `n` up and watch the estimate improve:

```python
import random

def estimate_pi(n):
    inside = sum(
        1
        for _ in range(n)
        if random.random() ** 2 + random.random() ** 2 <= 1
    )
    return 4 * inside / n

for n in [100, 10_000, 1_000_000]:
    print(f"n = {n:>9,}  ->  pi ~ {estimate_pi(n):.5f}")
```

## Check the math post's homework

In [Math on this blog](@/blog/math-on-this-blog.md) I claimed that
`$\sum_{n=1}^\infty \frac{1}{n^2} = \frac{\pi^2}{6}$`. Don't take my
word for it:

```python
import math

partial = sum(1 / n**2 for n in range(1, 100_001))
print(f"sum of 1/n^2 (100k terms): {partial:.10f}")
print(f"pi^2 / 6:                  {math.pi**2 / 6:.10f}")
```

## Even numpy works

Imports of scientific packages are fetched automatically on first use.
`numpy` is an extra download (a few MB), so the first run takes a
moment. Here's the rotation matrix from the math post, as code:

```python
import numpy as np

theta = np.radians(90)
R = np.array([
    [np.cos(theta), -np.sin(theta)],
    [np.sin(theta),  np.cos(theta)],
])

x = np.array([1.0, 0.0])
print("x rotated 90 degrees:", np.round(R @ x, 3))
```

## The fine print

- Everything runs client-side in a sandbox, so you can't break the blog.
  Go wild.
- The editor shares one Python session per page visit, so variables
  survive between runs until you close the tab.
- File &rarr; Save writes to the virtual C:\ drive (your browser's
  localStorage). No cloud, no sync, no backups, just like a real
  hard drive from 1998.
- It runs on the page's main thread: `while True: pass` will freeze
  the tab, exactly like it froze the family computer in 1998. Some
  traditions are worth keeping.
