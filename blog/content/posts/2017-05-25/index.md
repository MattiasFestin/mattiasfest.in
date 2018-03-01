---
title: Primes
date: "2017-05-25T22:40:32.169Z"
cover: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Ulam_Spiral_Divisors_100000.png"
category: "tech"
tags:
    - programming
    - stuff
    - other
published: false
---

## 1 to 100
$$S = \\{2, 3, 5, 13, 89, 233, 1597, 28657, 514229, 37, 113, 28657, 514229, \\\\
557, 2417, 73, 149, 2221, 2789, 59369, 433494437, 2971215073, 953, 55945741, \\\\
353, 2710260697, 4513, 555003497, 269, 116849, 1429913, 6673, 46165371073, 9375829, \\\\
86020717, 157, 92180471494753, 99194853094755497, 1069, 1665088321800481, 193, 389, 3084989, 361040209\\}$$

## Questions

* Does this hold?
$$ F_{n} = F_{n-1} + F_{n-2} $$
$$ F_{n} \nmid F_{m} \qquad \forall m < n \hspace{.25cm} \land \hspace{.25cm} n \in \mathbb{P} \hspace{.25cm} \land \hspace{.25cm} m \in \mathbb{N} $$

[Yes](http://www.math.clemson.edu/~jimlb/Teaching/Math573/Math573fibonacci1.pdf) (page 3 theorem 1)

* Is all prime number contained in the sequence?
### No!

$$ Si = \\{7, 17, 11, 29, 61, 47, ...\\} $$


[Link](http://www.maths.surrey.ac.uk/hosted-sites/R.Knott/Fibonacci/fibtable.html#100)