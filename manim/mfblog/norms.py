"""Geometry helpers shared by the norm/metric scenes."""

from __future__ import annotations

import numpy as np
from manim import Polygon, ParametricFunction, VGroup

# Manim's `Sphere` etc. take radii in scene units; these helpers all work in
# *data* units and expect the caller to apply the axes' coordinate mapping.


def lp_norm(v: np.ndarray, p: float) -> float:
    """The L^p norm, with `p = inf` spelled `float("inf")`."""
    v = np.asarray(v, dtype=float)
    if np.isinf(p):
        return float(np.max(np.abs(v)))
    return float(np.sum(np.abs(v) ** p) ** (1.0 / p))


def lp_unit_point(t: float, p: float) -> np.ndarray:
    """A point at angle-parameter ``t`` on the 2D L^p unit circle.

    The superellipse parametrisation: ``x = sgn(cos t)|cos t|^(2/p)``. It
    traces the whole ball boundary for every ``p > 0``, including the
    non-convex ``p < 1`` case, which is exactly the range this scene wants
    to morph through.
    """
    if np.isinf(p):
        # The L-infinity square, traced with the same period as the others.
        c, s = np.cos(t), np.sin(t)
        m = max(abs(c), abs(s))
        return np.array([c / m, s / m, 0.0])
    e = 2.0 / p
    c, s = np.cos(t), np.sin(t)
    return np.array([np.sign(c) * abs(c) ** e, np.sign(s) * abs(s) ** e, 0.0])


def lp_ball_2d(p: float, radius: float = 1.0, **kwargs) -> ParametricFunction:
    """The boundary of the 2D L^p ball of the given radius."""
    curve = ParametricFunction(
        lambda t: radius * lp_unit_point(t, p),
        t_range=[0, 2 * np.pi, 0.005],
        **kwargs,
    )
    return curve


def octahedron(radius: float = 1.0, **kwargs) -> VGroup:
    """The L1 ball in 3D, as eight triangular faces.

    Built by hand rather than with Manim's ``Polyhedron`` so that the faces
    are plain ``Polygon``s: they take fill/stroke styling directly and the
    painter's-algorithm renderer sorts them sensibly.
    """
    axis = [np.array(v, dtype=float) * radius for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    faces = VGroup()
    for sx in (1, -1):
        for sy in (1, -1):
            for sz in (1, -1):
                faces.add(Polygon(sx * axis[0], sy * axis[1], sz * axis[2], **kwargs))
    return faces


def first_touch_radius(points: dict[str, np.ndarray], p: float) -> tuple[str, float]:
    """Which point an L^p ball growing from the origin swallows first."""
    distances = {name: lp_norm(v, p) for name, v in points.items()}
    winner = min(distances, key=distances.get)
    return winner, distances[winner]


def quadratic_form(a: float, b: float, c: float):
    """``Q(w) = a w1^2 + 2b w1 w2 + c w2^2`` as a callable on 2-vectors."""

    def q(w: np.ndarray) -> float:
        w1, w2 = w[0], w[1]
        return a * w1 * w1 + 2 * b * w1 * w2 + c * w2 * w2

    return q


def contour_ellipse(center: np.ndarray, a: float, b: float, c: float, level: float, **kwargs) -> ParametricFunction:
    """The level set ``Q(w - center) = level`` of a positive-definite form."""
    matrix = np.array([[a, b], [b, c]], dtype=float)
    eigenvalues, eigenvectors = np.linalg.eigh(matrix)
    axes = np.sqrt(level / eigenvalues)

    def param(t: float) -> np.ndarray:
        local = np.array([axes[0] * np.cos(t), axes[1] * np.sin(t)])
        world = eigenvectors @ local
        return np.array([center[0] + world[0], center[1] + world[1], 0.0])

    return ParametricFunction(param, t_range=[0, 2 * np.pi, 0.01], **kwargs)


def touch_level(center: np.ndarray, a: float, b: float, c: float, p: float, radius: float = 1.0) -> np.ndarray:
    """Where a growing ``Q``-contour first touches the L^p ball of ``radius``.

    Found by minimising ``Q`` over a fine sampling of the ball's boundary,
    which is exactly the constrained optimum a lasso/ridge fit reports.
    """
    q = quadratic_form(a, b, c)
    ts = np.linspace(0, 2 * np.pi, 20001)
    boundary = np.array([radius * lp_unit_point(t, p) for t in ts])
    values = np.array([q(pt[:2] - center[:2]) for pt in boundary])
    return boundary[int(np.argmin(values))]
