"""Animated figures for post 0005, "Linear regression, the atom of ML".

The scenes are deliberately silent, loopable visual arguments for the three
parts of the post where static equations make the central idea too easy to
miss: choosing a loss, projecting onto a column space, and walking down a
loss surface.
"""

from __future__ import annotations

import numpy as np
from manim import (
    DEGREES,
    DOWN,
    LEFT,
    OUT,
    RIGHT,
    UP,
    Axes,
    Circle,
    Create,
    DashedLine,
    Dot,
    Dot3D,
    FadeIn,
    FadeOut,
    Flash,
    GrowArrow,
    GrowFromCenter,
    Indicate,
    Line,
    Line3D,
    MoveAlongPath,
    NumberPlane,
    ORIGIN,
    Polygon,
    Rectangle,
    ReplacementTransform,
    VGroup,
    ValueTracker,
    VMobject,
    Write,
    always_redraw,
    linear,
    smooth,
)

from mfblog.norms import contour_ellipse
from mfblog.theme import (
    ACCENT,
    BAD,
    DIM,
    GOOD,
    INK,
    L1,
    L2,
    MUTED,
    BlogScene,
    BlogScene3D,
    axis_numbers,
    beat,
    caption,
    label,
    title,
)
from mfblog.typst import tex

X = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
Y = np.array([1.0, 3.0, 5.0, 7.0, 14.0])
LINES = {
    "A": (2.0, 1.0, L1, "MAE", 1.00),
    "B": (3.0, 0.0, L2, "MSE", 2.00),
    "C": (3.25, -0.875, GOOD, "worst error", 1.88),
}


class LossChoosesTheLine(BlogScene):
    """The same five data points crown three different lines under three losses."""

    def construct(self) -> None:
        axes = Axes(
            x_range=[-0.2, 4.4, 1],
            y_range=[-1.5, 15.5, 2],
            x_length=6.5,
            y_length=5.8,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_tip": False},
        ).shift(LEFT * 2.7 + DOWN * 0.35)
        ticks = VGroup(axis_numbers(axes, [0, 1, 2, 3, 4]), axis_numbers(axes, [2, 6, 10, 14], axis="y"))
        axis_labels = VGroup(
            tex("x", font_size=28, color=MUTED).next_to(axes.c2p(4.4, 0), UP, buff=0.12),
            tex("y", font_size=28, color=MUTED).next_to(axes.c2p(0, 15.5), RIGHT, buff=0.12),
        )
        heading = title("Which line fits best?")
        heading.to_edge(UP, buff=0.35)
        self.play(FadeIn(axes), FadeIn(ticks), FadeIn(axis_labels), Write(heading), run_time=1.2)

        points = VGroup(*[Dot(axes.c2p(x, y), color=INK, radius=0.09) for x, y in zip(X, Y)])
        outlier = points[-1].copy().set_color(ACCENT)
        self.play(*[GrowFromCenter(point) for point in points], run_time=0.9)
        self.play(ReplacementTransform(points[-1], outlier), run_time=0.4)
        points[-1] = outlier

        cards = VGroup()
        for name, (slope, intercept, color, rule, score) in LINES.items():
            card = self.card(name, slope, intercept, color, rule, score)
            cards.add(card)
        cards.arrange(DOWN, aligned_edge=LEFT, buff=0.25).to_corner(RIGHT + UP, buff=0.45).shift(DOWN * 0.75)
        self.play(FadeIn(cards, shift=LEFT * 0.2), run_time=0.9)

        current = None
        residuals = VGroup()
        winner_rows = VGroup()
        for name, (slope, intercept, color, rule, score) in LINES.items():
            line = axes.plot(lambda x: slope * x + intercept, x_range=[-0.15, 4.2], color=color, stroke_width=5)
            if current is None:
                self.play(Create(line), run_time=0.8)
            else:
                self.play(ReplacementTransform(current, line), run_time=0.8)
            current = line

            residuals = VGroup(
                *[
                    DashedLine(
                        axes.c2p(x, slope * x + intercept),
                        axes.c2p(x, y),
                        color=color,
                        stroke_width=3,
                        dash_length=0.1,
                    )
                    for x, y in zip(X, Y)
                ]
            )
            self.play(Create(residuals), run_time=0.7)
            self.play(Indicate(cards[list(LINES).index(name)], color=color, scale_factor=1.03), run_time=0.55)

            row = VGroup(
                Dot(color=color, radius=0.065),
                label(f"{rule}: line {name} wins", size=24, color=INK),
            ).arrange(RIGHT, buff=0.18)
            winner_rows.add(row)
            winner_rows.arrange(DOWN, aligned_edge=LEFT, buff=0.15).to_corner(RIGHT + DOWN, buff=0.45)
            self.play(FadeIn(row, shift=UP * 0.1), run_time=0.45)
            self.wait(beat(0.8))
            self.play(FadeOut(residuals), run_time=0.35)

        # Give the takeaway its own space: leaving the metric legend in the
        # lower-right made the final sentence compete with the information it
        # was meant to summarise.
        conclusion = label("The data did not choose a winner. The loss did.", color=ACCENT)
        conclusion.to_edge(UP, buff=0.35)
        self.play(FadeOut(cards), FadeOut(winner_rows), FadeOut(heading), run_time=0.55)
        self.play(Write(conclusion), run_time=1.3)
        self.wait(beat(2.3))
        self.play(
            FadeOut(VGroup(axes, ticks, axis_labels, points, current, cards, winner_rows, conclusion, heading)),
            run_time=0.8,
        )
        self.wait(beat(0.4))

    def card(self, name: str, slope: float, intercept: float, color: str, rule: str, score: float) -> VGroup:
        equation = tex(f"{name}: hat(y) = {slope:g}x {intercept:+g}", font_size=28, color=color)
        metric = label(f"{rule} = {score:.2f}", size=23, color=MUTED)
        box = VGroup(equation, metric).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        background = Rectangle(
            width=box.width + 0.35,
            height=box.height + 0.28,
            fill_color="#151b25",
            fill_opacity=0.95,
            stroke_color=DIM,
            stroke_width=1,
        )
        return VGroup(background, box).move_to(ORIGIN)


class LeastSquaresIsAProjection(BlogScene3D):
    """The fitted prediction is the perpendicular foot on the column space."""

    def construct(self) -> None:
        self.set_camera_orientation(phi=68 * DEGREES, theta=-48 * DEGREES, zoom=1.28)

        # Two columns of X span the plane. The observed y is deliberately
        # outside it; p + r is constructed with r normal to both columns.
        u = np.array([2.15, 0.25, 0.65])
        v = np.array([-0.65, 1.75, 0.35])
        normal = np.cross(u, v)
        normal /= np.linalg.norm(normal)
        prediction = 0.75 * u + 0.65 * v
        observed = prediction + 1.25 * normal

        heading = title("Least squares is a projection")
        heading.to_edge(UP, buff=0.35)
        self.add_fixed_in_frame_mobjects(heading)
        self.play(Write(heading), run_time=1.2)

        plane = self.column_plane(u, v)
        plane_label = label("col(X)", size=30, color=L2)
        plane_label.move_to(1.6 * u - 0.5 * v)
        self.add_fixed_orientation_mobjects(plane_label)
        self.play(FadeIn(plane), FadeIn(plane_label), run_time=1.1)

        u_arrow = Line3D(ORIGIN, u, color=MUTED, thickness=0.018)
        v_arrow = Line3D(ORIGIN, v, color=MUTED, thickness=0.018)
        u_label = tex(r"x", font_size=26, color=MUTED)
        v_label = tex(r"1", font_size=26, color=MUTED)
        u_label.move_to(u * 1.08)
        v_label.move_to(v * 1.12)
        self.add_fixed_orientation_mobjects(u_label, v_label)
        self.play(Create(u_arrow), Create(v_arrow), FadeIn(u_label), FadeIn(v_label), run_time=0.9)

        y_arrow = Line3D(ORIGIN, observed, color=ACCENT, thickness=0.026)
        y_dot = Dot3D(observed, radius=0.08, color=ACCENT)
        y_label = tex(r"y", font_size=34, color=ACCENT)
        y_label.move_to(observed * 1.08)
        self.add_fixed_orientation_mobjects(y_label)
        self.play(Create(y_arrow), GrowFromCenter(y_dot), FadeIn(y_label), run_time=1.1)

        note = caption("Observed data is usually not in the column space.", color=ACCENT)
        note.to_corner(LEFT + DOWN, buff=0.45)
        self.add_fixed_in_frame_mobjects(note)
        self.play(FadeIn(note), run_time=0.6)
        self.wait(beat(0.8))

        p_arrow = Line3D(ORIGIN, prediction, color=L2, thickness=0.026)
        p_dot = Dot3D(prediction, radius=0.08, color=L2)
        p_label = tex(r"hat(y) = X w", font_size=30, color=L2)
        p_label.move_to(prediction * 1.15 + OUT * 0.15)
        self.add_fixed_orientation_mobjects(p_label)
        residual = Line3D(prediction, observed, color=BAD, thickness=0.026)
        residual_label = tex(r"r = y - X w", font_size=28, color=BAD)
        residual_label.move_to((prediction + observed) / 2 + RIGHT * 0.35)
        self.add_fixed_orientation_mobjects(residual_label)

        self.play(
            Create(p_arrow),
            GrowFromCenter(p_dot),
            FadeIn(p_label),
            Create(residual),
            FadeIn(residual_label),
            run_time=1.5,
        )
        self.play(Flash(prediction, color=L2, line_length=0.22, num_lines=12), run_time=0.7)

        equation = tex(r"X^T (y - X w) = 0", font_size=38, color=INK)
        equation.to_corner(RIGHT + DOWN, buff=0.45)
        interpretation = caption("residual ⟂ every column of X", color=BAD)
        interpretation.next_to(equation, UP, aligned_edge=RIGHT, buff=0.2)
        self.add_fixed_in_frame_mobjects(equation, interpretation)
        self.play(FadeOut(note), FadeIn(interpretation), Write(equation), run_time=1.2)
        self.begin_ambient_camera_rotation(rate=0.06)
        self.wait(beat(3.0))
        self.stop_ambient_camera_rotation()
        self.play(
            FadeOut(
                VGroup(
                    plane,
                    plane_label,
                    u_arrow,
                    v_arrow,
                    u_label,
                    v_label,
                    y_arrow,
                    y_dot,
                    y_label,
                    p_arrow,
                    p_dot,
                    p_label,
                    residual,
                    residual_label,
                    equation,
                    interpretation,
                    heading,
                )
            ),
            run_time=1.0,
        )
        self.wait(beat(0.4))

    def column_plane(self, u: np.ndarray, v: np.ndarray) -> VGroup:
        corners = [
            -1.1 * u - 1.1 * v,
            1.45 * u - 1.1 * v,
            1.45 * u + 1.15 * v,
            -1.1 * u + 1.15 * v,
        ]
        face = Polygon(*corners, fill_color=L2, fill_opacity=0.16, stroke_color=L2, stroke_width=2)
        grid = VGroup()
        for alpha in np.linspace(-0.8, 1.15, 5):
            grid.add(Line3D(alpha * u - 1.05 * v, alpha * u + 1.1 * v, color=L2, thickness=0.006))
        for beta in np.linspace(-0.8, 1.1, 5):
            grid.add(Line3D(-1.05 * u + beta * v, 1.35 * u + beta * v, color=L2, thickness=0.006))
        return VGroup(face, grid)


class GradientDescentFindsTheLine(BlogScene):
    """A parameter point walks down MSE contours while its fitted line changes."""

    def construct(self) -> None:
        heading = title("Gradient descent walks downhill")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.1)

        # Center x before fitting. This does not change the fitted line;
        # it only turns the slanted (w, intercept) valley into a legible
        # bowl by making the two parameter directions orthogonal.
        weight_axes = Axes(
            x_range=[-0.2, 4.2, 1],
            y_range=[-0.2, 7.2, 1],
            x_length=6.0,
            y_length=4.5,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_tip": False},
        ).shift(LEFT * 3.5 + DOWN * 0.55)
        data_axes = Axes(
            x_range=[-0.2, 4.3, 1],
            y_range=[-1, 15.5, 4],
            x_length=5.0,
            y_length=4.5,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_tip": False},
        ).shift(RIGHT * 3.7 + DOWN * 0.55)
        labels = VGroup(
            tex("w", font_size=28, color=MUTED).next_to(weight_axes.c2p(4.2, 0), UP, buff=0.1),
            tex("b", font_size=28, color=MUTED).next_to(weight_axes.c2p(0, 7.2), RIGHT, buff=0.1),
            caption("parameter space (x centered)", color=MUTED).next_to(weight_axes, DOWN, buff=0.32),
            caption("the fitted line", color=MUTED).next_to(data_axes, DOWN, buff=0.32),
        )
        self.play(FadeIn(weight_axes), FadeIn(data_axes), FadeIn(labels), run_time=1.0)

        centered_x = X - X.mean()
        optimum = np.linalg.lstsq(np.c_[centered_x, np.ones_like(X)], Y, rcond=None)[0]
        a, cross, c = np.mean(centered_x**2), np.mean(centered_x), 1.0
        levels = [0.2, 0.7, 2.0, 5.0, 12.0]
        contours = VGroup(
            *[
                self.weight_contour(weight_axes, optimum, a, cross, c, level, opacity=0.4)
                for level in levels
            ]
        )
        best = Dot(weight_axes.c2p(*optimum), radius=0.09, color=GOOD)
        best_label = caption("least-squares answer", color=GOOD).next_to(best, DOWN + RIGHT, buff=0.12)
        self.play(Create(contours), GrowFromCenter(best), FadeIn(best_label), run_time=1.2)

        points = VGroup(*[Dot(data_axes.c2p(x, y), radius=0.075, color=INK) for x, y in zip(X, Y)])
        points[-1].set_color(ACCENT)
        self.play(*[GrowFromCenter(point) for point in points], run_time=0.8)

        path_values = self.descent_path(centered_x)
        route = VMobject(color=ACCENT, stroke_width=3, stroke_opacity=0.65)
        route.set_points_as_corners([weight_axes.c2p(w, b) for w, b in path_values])
        self.play(Create(route), run_time=0.9)

        tracker = ValueTracker(0.0)
        walker = always_redraw(lambda: self.walker(weight_axes, path_values, tracker.get_value()))
        fit = always_redraw(lambda: self.fit_line(data_axes, path_values, tracker.get_value()))
        status = always_redraw(lambda: self.status(path_values, tracker.get_value()))
        self.add(walker, fit, status)
        self.play(tracker.animate.set_value(1.0), run_time=9.0, rate_func=linear)
        walker.clear_updaters()
        fit.clear_updaters()
        status.clear_updaters()

        # The panel captions occupy the lower third, so replace the heading
        # instead of squeezing a second line into that already busy region.
        conclusion = label("A gradient is enough to find the same answer.", color=ACCENT)
        conclusion.to_edge(UP, buff=0.35)
        self.play(FadeOut(labels), FadeOut(heading), FadeIn(conclusion), run_time=0.8)
        self.wait(beat(2.5))
        self.play(
            FadeOut(
                VGroup(
                    heading,
                    weight_axes,
                    data_axes,
                    labels,
                    contours,
                    best,
                    best_label,
                    points,
                    route,
                    walker,
                    fit,
                    status,
                    conclusion,
                )
            ),
            run_time=0.9,
        )
        self.wait(beat(0.4))

    def weight_contour(self, axes: Axes, center: np.ndarray, a: float, cross: float, c: float, level: float, opacity: float):
        curve = contour_ellipse(np.array([center[0], center[1], 0.0]), a, cross, c, level)
        curve.apply_function(lambda point: axes.c2p(point[0], point[1]))
        return curve.set_stroke(L2, 2.5, opacity)

    def descent_path(self, centered_x: np.ndarray) -> list[tuple[float, float]]:
        w, b, rate = 0.0, 0.0, 0.2
        path = [(w, b)]
        for _ in range(18):
            err = w * centered_x + b - Y
            w -= rate * 2 * np.mean(err * centered_x)
            b -= rate * 2 * np.mean(err)
            path.append((w, b))
        return path

    def state(self, path: list[tuple[float, float]], alpha: float) -> tuple[float, float, int]:
        position = alpha * (len(path) - 1)
        lower = min(int(position), len(path) - 2)
        t = position - lower
        start, end = path[lower], path[lower + 1]
        return (start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1]), lower + 1)

    def walker(self, axes: Axes, path: list[tuple[float, float]], alpha: float) -> Dot:
        w, b, _ = self.state(path, alpha)
        return Dot(axes.c2p(w, b), color=ACCENT, radius=0.1)

    def fit_line(self, axes: Axes, path: list[tuple[float, float]], alpha: float) -> VGroup:
        w, b, _ = self.state(path, alpha)
        line = axes.plot(lambda x: w * (x - 2) + b, x_range=[-0.15, 4.2], color=ACCENT, stroke_width=4)
        return VGroup(line)

    def status(self, path: list[tuple[float, float]], alpha: float) -> VGroup:
        w, b, step = self.state(path, alpha)
        loss = float(np.mean((w * (X - 2) + b - Y) ** 2))
        text = VGroup(
            label(f"step {step:02d}", size=25, color=MUTED),
            label(f"MSE {loss:.2f}", size=30, color=ACCENT),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        return text.to_corner(RIGHT + UP, buff=0.45).shift(DOWN * 0.85)
