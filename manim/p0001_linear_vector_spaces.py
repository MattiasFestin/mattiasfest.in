"""Scenes for post 0001, "Linear Vector Spaces and Metrics".

Render with (from the repo root):

    manim/render.sh 0001

The scenes are silent and loop cleanly: they are embedded as autoplaying
figures inside the post, not as narrated videos.
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
    Annulus,
    Axes,
    Circle,
    Create,
    Cube,
    DashedLine,
    Dot,
    Dot3D,
    FadeIn,
    FadeOut,
    Flash,
    GrowFromCenter,
    Indicate,
    Line,
    Line3D,
    NumberPlane,
    ORIGIN,
    Rectangle,
    Sphere,
    Square,
    VGroup,
    ValueTracker,
    Write,
    always_redraw,
    linear,
    smooth,
)

from mfblog.norms import (
    contour_ellipse,
    first_touch_radius,
    lp_ball_2d,
    octahedron,
    quadratic_form,
    touch_level,
)
from mfblog.theme import (
    ACCENT,
    BAD,
    DIM,
    GOOD,
    INK,
    L1,
    L2,
    LINF,
    MUTED,
    BlogScene,
    BlogScene3D,
    axis_numbers,
    caption,
    label,
    title,
)
from mfblog.typst import tex

# The post's opening puzzle, verbatim.
POINTS = {
    "a": np.array([3.0, 0.0, 0.0]),
    "b": np.array([2.0, 2.0, 0.0]),
    "c": np.array([1.8, 1.8, 1.8]),
}

U = 1.05  # scene units per data unit
SPEED = 1.4  # seconds per unit of radius — the same growth rate in all three norms

NORMS = (
    ("L1", "norm(x)_1 = abs(x_1) + abs(x_2) + abs(x_3)", 1.0, L1),
    ("L2", "norm(x)_2 = sqrt(x_1^2 + x_2^2 + x_3^2)", 2.0, L2),
    ("L∞", "norm(x)_oo = max_i abs(x_i)", np.inf, LINF),
)


class NearestNeighborIsADecision(BlogScene3D):
    """Three points, three norms, three different nearest neighbours.

    A ball grows out of the origin at the same rate in all three worlds.
    Whichever point it swallows first is "nearest" — and it is a different
    point every time.
    """

    def construct(self) -> None:
        self.set_camera_orientation(phi=68 * DEGREES, theta=-54 * DEGREES, zoom=0.95)

        axes = self.build_axes()
        self.play(FadeIn(axes, run_time=1.2))

        dots, dot_labels = self.build_points()
        legend = self.build_legend()
        self.play(
            *[GrowFromCenter(dots[k]) for k in POINTS],
            *[FadeIn(dot_labels[k]) for k in POINTS],
            FadeIn(legend),
            run_time=1.2,
        )

        question = title("Which point is closest to the origin?")
        question.to_edge(UP, buff=0.4)
        self.add_fixed_in_frame_mobjects(question)
        self.play(Write(question), run_time=1.5)
        self.wait(0.7)

        self.begin_ambient_camera_rotation(rate=0.055)

        verdicts = VGroup()
        for norm_name, formula, p, color in NORMS:
            self.run_norm(norm_name, formula, p, color, dots, verdicts)

        self.stop_ambient_camera_rotation()

        closing = label("Nearness is a decision, not a fact.", color=ACCENT)
        closing.to_edge(UP, buff=0.4)
        self.add_fixed_in_frame_mobjects(closing)
        self.play(FadeOut(question), run_time=0.5)
        self.play(Write(closing), run_time=1.8)
        self.wait(2.6)
        self.play(
            FadeOut(closing),
            FadeOut(verdicts),
            FadeOut(axes),
            FadeOut(legend),
            *[FadeOut(dots[k]) for k in POINTS],
            *[FadeOut(dot_labels[k]) for k in POINTS],
            run_time=1.2,
        )
        self.wait(0.5)

    # -- construction --------------------------------------------------------

    def build_axes(self) -> VGroup:
        reach = 3.4 * U
        axes = VGroup(
            *[
                Line3D(-reach * d, reach * d, color=DIM, thickness=0.008)
                for d in (RIGHT, UP, OUT)
            ]
        )
        for direction, name in ((RIGHT, "x_1"), (UP, "x_2"), (OUT, "x_3")):
            axis_label = tex(name, font_size=22, color=DIM)
            axis_label.move_to(reach * direction + 0.3 * OUT + 0.2 * direction)
            self.add_fixed_orientation_mobjects(axis_label)
            axes.add(axis_label)
        return axes

    def build_points(self) -> tuple[dict, dict]:
        """Dots carry only their letter; the coordinates live in the legend.

        Full coordinate labels floating next to 3D points collide with the
        axes and with the growing balls from most camera angles.
        """
        dots, labels = {}, {}
        for name, coords in POINTS.items():
            position = U * coords
            dots[name] = Dot3D(point=position, radius=0.08, color=INK)
            text = tex(name, font_size=32, color=INK)
            text.move_to(position + 0.42 * OUT + 0.12 * RIGHT)
            self.add_fixed_orientation_mobjects(text)
            labels[name] = text
        return dots, labels

    def build_legend(self) -> VGroup:
        rows = VGroup(
            *[
                tex(
                    f"{name} = ({', '.join(f'{v:g}' for v in coords)})",
                    font_size=26,
                    color=MUTED,
                )
                for name, coords in POINTS.items()
            ]
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.24)
        rows.to_corner(RIGHT + UP, buff=0.5).shift(DOWN * 0.9)
        self.add_fixed_in_frame_mobjects(rows)
        return rows

    # -- one act -------------------------------------------------------------

    def run_norm(self, norm_name, formula, p, color, dots, verdicts) -> None:
        winner, radius = first_touch_radius(POINTS, p)

        heading = label(f"{norm_name}", size=34, color=color)
        equation = tex(formula, font_size=28, color=INK)
        head = VGroup(heading, equation).arrange(RIGHT, buff=0.4)
        head.to_corner(LEFT + UP, buff=0.5).shift(DOWN * 0.9)
        self.add_fixed_in_frame_mobjects(head)
        self.play(FadeIn(head, shift=RIGHT * 0.2), run_time=0.9)

        tracker = ValueTracker(0.02)
        ball = self.make_ball(p, color)
        ball.add_updater(lambda m: m.set(width=2 * U * tracker.get_value()))
        self.add(ball)

        readout = self.add_fixed_redraw(lambda: self.radius_readout(tracker.get_value(), color))

        self.play(
            tracker.animate.set_value(radius),
            run_time=radius * SPEED,
            rate_func=linear,
        )
        ball.clear_updaters()
        readout.clear_updaters()

        target = U * POINTS[winner]
        spoke = Line(ORIGIN, target, color=color, stroke_width=4)
        self.play(
            Flash(target, color=color, line_length=0.22, num_lines=14, flash_radius=0.28),
            Indicate(dots[winner], color=color, scale_factor=2.0),
            FadeIn(spoke),
            run_time=1.0,
        )

        verdict = VGroup(
            Dot(color=color, radius=0.07),
            label(f"{norm_name}  nearest: {winner}", size=26),
            label(f"({radius:.2f})", size=26, color=MUTED),
        ).arrange(RIGHT, buff=0.22)
        verdicts.add(verdict)
        verdicts.arrange(DOWN, aligned_edge=LEFT, buff=0.28).to_corner(LEFT + DOWN, buff=0.5)
        self.add_fixed_in_frame_mobjects(verdict)
        self.play(FadeIn(verdict, shift=UP * 0.15), run_time=0.7)
        self.wait(1.5)

        self.play(FadeOut(ball), FadeOut(spoke), FadeOut(head), FadeOut(readout), run_time=0.7)

    # -- pieces --------------------------------------------------------------

    def make_ball(self, p: float, color: str) -> VGroup:
        """The unit ball of the given norm, ready to be scaled by a tracker."""
        if p == 1.0:
            ball = octahedron(1.0)
        elif np.isinf(p):
            ball = Cube(side_length=2)
        else:
            sphere = Sphere(radius=1, resolution=(24, 24), checkerboard_colors=False)
            sphere.set_fill(color, 0.09).set_stroke(width=0)
            equators = VGroup(
                Circle(radius=1),
                Circle(radius=1).rotate(90 * DEGREES, axis=RIGHT),
                Circle(radius=1).rotate(90 * DEGREES, axis=UP),
            ).set_stroke(color, 2, 0.5)
            return VGroup(sphere, equators)
        return ball.set_fill(color, 0.11).set_stroke(color, 1.8, 0.45)

    def radius_readout(self, radius: float, color: str) -> VGroup:
        readout = VGroup(
            label("radius", size=24, color=MUTED),
            label(f"{radius:.2f}", size=30, color=color),
        ).arrange(RIGHT, buff=0.2)
        return readout.to_corner(RIGHT + DOWN, buff=0.5)


# ---------------------------------------------------------------------------
# Unit balls, convexity, and why the L1 corner is where sparsity comes from.
# ---------------------------------------------------------------------------

SCALE = 2.0  # scene units per data unit

# The loss: Q(w) = (w - BETA)^T A (w - BETA), with A = [[QA, QB], [QB, QC]].
# These numbers are chosen (by search, see git history) so that the
# L1-constrained optimum lands exactly on the diamond's corner (1, 0) while
# the L2 one lands at a thoroughly generic (0.82, 0.57) — so the picture makes
# the lasso/ridge contrast honestly rather than by fudging, and so the touching
# contour still fits on screen.
BETA = np.array([1.6, 0.8, 0.0])
QA, QB, QC = 0.9, 0.5, 0.8


class UnitBallsAndSparsity(BlogScene):
    """The unit ball *is* the norm — and its corners are what zero weights.

    Act one sweeps p through the L^p family, including the non-convex p < 1
    case that fails the triangle inequality. Act two grows the loss contours
    of a regression until they touch the budget, once against the L1 diamond
    (a corner, so a weight is exactly zero) and once against the L2 circle
    (no corners, so nothing is).
    """

    def construct(self) -> None:
        plane = self.build_plane()
        self.play(FadeIn(plane), run_time=1.0)

        self.act_one_morph(plane)
        self.act_two_sparsity(plane)

        self.play(FadeOut(plane), run_time=0.8)
        self.wait(0.4)

    # -- act one -------------------------------------------------------------

    def act_one_morph(self, plane: NumberPlane) -> None:
        heading = title("The unit ball is the norm")
        heading.to_edge(UP, buff=0.35)
        formula = tex(r"norm(x)_p = (sum_i abs(x_i)^p)^(1\/p)", font_size=30, color=INK)
        formula.to_corner(LEFT + UP, buff=0.5).shift(DOWN * 0.95)
        self.play(Write(heading), FadeIn(formula), run_time=1.4)

        log_p = ValueTracker(np.log(2.0))
        ball = always_redraw(
            lambda: lp_ball_2d(
                np.exp(log_p.get_value()),
                radius=SCALE,
                color=self.ball_color(np.exp(log_p.get_value())),
                stroke_width=5,
            ).move_to(plane.c2p(0, 0))
        )
        readout = always_redraw(lambda: self.p_readout(np.exp(log_p.get_value())))
        self.play(Create(ball), FadeIn(readout), run_time=1.2)

        for target_p, name, color in (
            (2.0, "p = 2   Euclidean", L2),
            (1.0, "p = 1   Manhattan", L1),
            (40.0, "p → ∞   Chebyshev", LINF),
        ):
            self.play(log_p.animate.set_value(np.log(target_p)), run_time=1.6)
            tag = caption(name, color=color).next_to(plane.c2p(0, 0), DOWN, buff=SCALE + 0.45)
            self.play(FadeIn(tag, shift=UP * 0.1), run_time=0.5)
            self.wait(0.9)
            self.play(FadeOut(tag), run_time=0.4)

        # Below p = 1 the ball caves in, and the triangle inequality goes with it.
        self.play(log_p.animate.set_value(np.log(0.55)), run_time=2.0)
        warning = VGroup(
            caption("p < 1: the ball caves in", color=BAD),
            caption("not convex ⇒ the triangle inequality fails ⇒ not a norm", color=BAD),
        ).arrange(DOWN, buff=0.15)
        warning.next_to(plane.c2p(0, 0), DOWN, buff=SCALE + 0.35)
        self.play(FadeIn(warning), run_time=0.6)
        self.wait(1.8)
        self.play(FadeOut(warning), log_p.animate.set_value(np.log(1.0)), run_time=1.6)

        ball.clear_updaters()
        readout.clear_updaters()
        self.play(FadeOut(readout), FadeOut(formula), FadeOut(heading), run_time=0.7)
        self.diamond = ball

    def ball_color(self, p: float) -> str:
        if p < 0.999:
            return BAD
        if p < 1.15:
            return L1
        if abs(p - 2.0) < 0.15:
            return L2
        if p > 12:
            return LINF
        return ACCENT

    def p_readout(self, p: float) -> VGroup:
        text = "p = ∞" if p > 39 else f"p = {p:.2f}"
        readout = label(text, size=32, color=self.ball_color(p))
        return readout.to_corner(RIGHT + UP, buff=0.5).shift(DOWN * 0.95)

    # -- act two -------------------------------------------------------------

    def act_two_sparsity(self, plane: NumberPlane) -> None:
        heading = title("Why L1 zeroes weights")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.2)

        axis_labels = VGroup(
            tex("w_1", font_size=28, color=MUTED).next_to(plane.c2p(2.6, 0), UP, buff=0.15),
            tex("w_2", font_size=28, color=MUTED).next_to(plane.c2p(0, 1.4), RIGHT, buff=0.15),
        )
        l1_budget = tex(r"norm(w)_1 <= t", font_size=28, color=L1)
        l1_budget.to_corner(LEFT + DOWN, buff=0.5).shift(UP * 0.45)
        self.play(FadeIn(axis_labels), FadeIn(l1_budget), run_time=0.8)

        beta_dot = Dot(plane.c2p(*BETA[:2]), color=ACCENT, radius=0.09)
        beta_label = tex(r"hat(beta)", font_size=34, color=ACCENT)
        beta_label.next_to(beta_dot, UP + RIGHT, buff=0.1)
        note = caption("the best fit, if weights were free", color=MUTED)
        note.next_to(beta_label, RIGHT, buff=0.25)
        self.play(GrowFromCenter(beta_dot), FadeIn(beta_label), FadeIn(note), run_time=1.0)
        self.wait(1.0)
        self.play(FadeOut(note), run_time=0.5)

        story = caption("Grow the loss contours until they reach the budget.")
        story.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(story), run_time=0.7)

        # --- lasso: the diamond ---
        l1_touch, l1_contours, l1_dot = self.grow_contours(plane, p=1.0, color=L1)
        zero_tag = VGroup(
            tex(r"w_2 = 0", font_size=32, color=L1),
            caption("exactly", color=MUTED),
        ).arrange(DOWN, buff=0.12)
        zero_tag.move_to(plane.c2p(1.85, -0.62))
        leader = Line(
            plane.c2p(*l1_touch[:2]),
            zero_tag.get_corner(UP + LEFT) + UP * 0.05,
            color=L1,
            stroke_width=2,
            stroke_opacity=0.7,
        )
        verdict_l1 = caption("A diamond is touched at a corner. That is the lasso.", color=INK)
        verdict_l1.to_edge(DOWN, buff=0.35)
        self.play(
            FadeOut(story), FadeIn(verdict_l1), FadeIn(zero_tag, shift=UP * 0.1), Create(leader), run_time=1.0
        )
        self.wait(2.4)

        # --- ridge: same loss, same budget size, round ball ---
        self.play(
            FadeOut(verdict_l1),
            FadeOut(zero_tag),
            FadeOut(leader),
            FadeOut(l1_contours),
            self.diamond.animate.set_stroke(opacity=0.3),
            l1_dot.animate.set_opacity(0.35),
            run_time=0.9,
        )
        circle = lp_ball_2d(2.0, radius=SCALE, color=L2, stroke_width=5)
        circle.move_to(plane.c2p(0, 0))
        l2_budget = tex(r"norm(w)_2 <= t", font_size=28, color=L2)
        l2_budget.next_to(l1_budget, DOWN, aligned_edge=LEFT, buff=0.25)
        self.play(Create(circle), FadeIn(l2_budget), run_time=1.1)

        l2_touch, l2_contours, l2_dot = self.grow_contours(plane, p=2.0, color=L2)
        drops = VGroup(
            DashedLine(
                plane.c2p(*l2_touch[:2]), plane.c2p(l2_touch[0], 0), color=L2, stroke_width=3
            ),
            DashedLine(
                plane.c2p(*l2_touch[:2]), plane.c2p(0, l2_touch[1]), color=L2, stroke_width=3
            ),
        )
        verdict_l2 = caption("A circle has no corners. That is ridge.", color=INK)
        verdict_l2.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(verdict_l2), Create(drops), run_time=1.0)
        self.wait(2.4)

        # --- both answers, side by side ---
        self.play(
            FadeOut(verdict_l2),
            FadeOut(l2_contours),
            self.diamond.animate.set_stroke(opacity=1.0),
            l1_dot.animate.set_opacity(1.0),
            FadeOut(drops),
            run_time=1.0,
        )
        legend = VGroup(
            VGroup(Dot(color=L1, radius=0.07), caption("lasso: one weight is exactly 0", color=L1)).arrange(RIGHT, buff=0.2),
            VGroup(Dot(color=L2, radius=0.07), caption("ridge: both shrink, neither vanishes", color=L2)).arrange(RIGHT, buff=0.2),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        legend.to_corner(RIGHT + DOWN, buff=0.45)
        closing = label("Corners make zeros.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), FadeIn(legend), run_time=0.7)
        self.play(Write(closing), run_time=1.3)
        self.wait(2.6)
        self.play(
            FadeOut(closing),
            FadeOut(legend),
            FadeOut(circle),
            FadeOut(self.diamond),
            FadeOut(l1_dot),
            FadeOut(l2_dot),
            FadeOut(beta_dot),
            FadeOut(beta_label),
            FadeOut(l1_budget),
            FadeOut(l2_budget),
            FadeOut(axis_labels),
            run_time=0.9,
        )

    def grow_contours(self, plane: NumberPlane, p: float, color: str):
        """Expand the loss contours from beta until they kiss the L^p ball."""
        touch = touch_level(BETA, QA, QB, QC, p, radius=1.0)
        level = quadratic_form(QA, QB, QC)(touch[:2] - BETA[:2])

        tracker = ValueTracker(0.03)
        contour = always_redraw(
            lambda: self.contour(plane, tracker.get_value(), color=ACCENT, width=4)
        )
        ghosts = VGroup(
            *[
                self.contour(plane, f * level, color=ACCENT, width=2, opacity=0.22)
                for f in (0.25, 0.55)
            ]
        )
        self.add(contour, ghosts)
        self.play(tracker.animate.set_value(level), run_time=3.2, rate_func=smooth)
        contour.clear_updaters()

        touch_dot = Dot(plane.c2p(*touch[:2]), color=color, radius=0.1)
        self.play(
            Flash(plane.c2p(*touch[:2]), color=color, line_length=0.2, num_lines=14),
            GrowFromCenter(touch_dot),
            run_time=0.9,
        )
        return touch, VGroup(contour, ghosts), touch_dot

    def contour(self, plane: NumberPlane, level: float, color: str, width: float, opacity: float = 1.0):
        curve = contour_ellipse(BETA, QA, QB, QC, max(level, 1e-4))
        curve.apply_function(lambda point: plane.c2p(point[0], point[1]))
        return curve.set_stroke(color, width, opacity)

    # -- shared --------------------------------------------------------------

    def build_plane(self) -> NumberPlane:
        plane = NumberPlane(
            x_range=[-2.8, 2.8, 1],
            y_range=[-1.6, 1.6, 1],
            x_length=5.6 * SCALE,
            y_length=3.2 * SCALE,
            background_line_style={
                "stroke_color": DIM,
                "stroke_width": 1,
                "stroke_opacity": 0.35,
            },
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        return plane.shift(DOWN * 0.2)


# ---------------------------------------------------------------------------
# What goes wrong in high dimensions.
# ---------------------------------------------------------------------------

N_SAMPLE = 400  # points in the cloud
MAX_DIM = 1024  # coordinates generated up front; dimension n uses the first n
PANEL_SIDE = 4.2
PANEL_CENTER = LEFT * 3.8 + UP * 0.15


class HighDimensionsAreWeird(BlogScene):
    """The picture you can draw stops telling you the truth.

    One fixed cloud of points in the unit cube. The left panel always plots
    coordinates 1 and 2, so it never changes. The right panel shows the true
    distances from a query point using the first ``n`` coordinates — and as
    ``n`` climbs, every distance collapses onto the same value.
    """

    def construct(self) -> None:
        rng = np.random.default_rng(7)
        self.cloud = rng.random((N_SAMPLE, MAX_DIM))
        self.query = rng.random(MAX_DIM)

        self.act_one_shell()
        self.act_two_concentration()

    # -- act one: almost all of a ball is skin --------------------------------

    def act_one_shell(self) -> None:
        heading = title("How much of a ball is skin?")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.2)

        radius = 1.75
        disk = Circle(radius=radius, color=L2, stroke_width=4, fill_color=L2, fill_opacity=0.18)
        core = Circle(radius=0.9 * radius, color=L2, stroke_width=2, stroke_opacity=0.5)
        shell = Annulus(
            inner_radius=0.9 * radius,
            outer_radius=radius,
            color=ACCENT,
            fill_opacity=0.55,
            stroke_width=0,
        )
        picture = VGroup(disk, shell, core).move_to(LEFT * 4.0 + DOWN * 0.2)
        shell_note = caption("the outer 10% of the radius", color=ACCENT)
        shell_note.next_to(picture, DOWN, buff=0.4)
        self.play(Create(disk), Create(core), run_time=1.0)
        self.play(FadeIn(shell), FadeIn(shell_note), run_time=0.8)

        axes = Axes(
            x_range=[0, 100, 25],
            y_range=[0, 1.08, 0.25],
            x_length=6.0,
            y_length=3.6,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_tip": False},
            y_axis_config={"include_ticks": False},
        )
        axes.move_to(RIGHT * 3.6 + DOWN * 0.4)
        full = DashedLine(
            axes.c2p(0, 1), axes.c2p(100, 1), color=MUTED, stroke_width=2, stroke_opacity=0.5
        )
        axes_labels = VGroup(
            axis_numbers(axes, [25, 50, 75, 100]),
            caption("dimension n", color=MUTED).next_to(axes, DOWN, buff=0.55),
            tex(r"1 - 0.9^n", font_size=30, color=ACCENT).next_to(axes, UP, buff=0.25),
            caption("100%", color=MUTED).next_to(axes.c2p(0, 1), LEFT, buff=0.2),
            full,
        )
        curve = axes.plot(
            lambda n: 1 - 0.9**n, x_range=[0, 100, 0.5], color=ACCENT, stroke_width=4
        )
        self.play(FadeIn(axes), FadeIn(axes_labels), run_time=0.8)

        tracker = ValueTracker(2.0)
        marker = always_redraw(
            lambda: Dot(
                axes.c2p(tracker.get_value(), 1 - 0.9 ** tracker.get_value()),
                color=ACCENT,
                radius=0.08,
            )
        )
        readout = always_redraw(lambda: self.shell_readout(tracker.get_value(), axes))
        self.play(Create(curve), FadeIn(marker), FadeIn(readout), run_time=1.2)
        self.play(tracker.animate.set_value(50), run_time=3.4, rate_func=smooth)
        self.wait(1.4)

        punchline = caption("In 50 dimensions the middle is empty. A ball is all skin.", color=INK)
        punchline.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(punchline), run_time=0.8)
        self.wait(2.2)

        marker.clear_updaters()
        readout.clear_updaters()
        self.play(
            FadeOut(
                VGroup(
                    picture,
                    shell_note,
                    axes,
                    axes_labels,
                    curve,
                    marker,
                    readout,
                    punchline,
                    heading,
                )
            ),
            run_time=0.9,
        )

    def shell_readout(self, n: float, axes: Axes) -> VGroup:
        rows = VGroup(
            label(f"n = {int(round(n))}", size=30, color=INK),
            label(f"{1 - 0.9 ** n:.1%} of the volume", size=27, color=ACCENT),
        ).arrange(DOWN, buff=0.15)
        return rows.move_to(axes.c2p(66, 0.42))

    # -- act two: every distance collapses onto one ---------------------------

    def act_two_concentration(self) -> None:
        heading = title("Then how far apart is everything?")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.3)

        log_n = ValueTracker(np.log(2.0))

        panel, dots = self.build_cloud_panel()
        panel_note = VGroup(
            caption("coordinates 1 and 2", color=MUTED),
            caption("this picture never changes", color=MUTED),
            VGroup(
                Dot(color=GOOD, radius=0.06),
                caption("nearest", color=GOOD),
                Dot(color=BAD, radius=0.06),
                caption("farthest", color=BAD),
            ).arrange(RIGHT, buff=0.18),
        ).arrange(DOWN, buff=0.16)
        panel_note.next_to(panel, DOWN, buff=0.3)
        self.play(FadeIn(panel), FadeIn(dots), FadeIn(panel_note), run_time=1.2)

        rings = always_redraw(lambda: self.extreme_rings(self.dimension(log_n)))
        self.play(FadeIn(rings), run_time=0.6)

        axes = Axes(
            x_range=[0, 0.8, 0.2],
            y_range=[0, 1.15, 1],
            x_length=6.0,
            y_length=2.9,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_tip": False},
            y_axis_config={"stroke_opacity": 0},
        )
        axes.move_to(RIGHT * 3.7 + UP * 0.5)
        axes_note = VGroup(
            axis_numbers(axes, [0.2, 0.4, 0.6, 0.8]),
            caption("distance from the query, divided by √n", color=MUTED).next_to(
                axes, DOWN, buff=1.35
            ),
        )
        self.play(FadeIn(axes), FadeIn(axes_note), run_time=0.8)

        bars = always_redraw(lambda: self.histogram(axes, self.dimension(log_n)))
        spread = always_redraw(lambda: self.spread_bracket(axes, self.dimension(log_n)))
        readout = always_redraw(lambda: self.dimension_readout(self.dimension(log_n)))
        self.play(FadeIn(bars), FadeIn(spread), FadeIn(readout), run_time=0.9)
        self.wait(1.6)

        self.play(log_n.animate.set_value(np.log(1000)), run_time=11.0, rate_func=linear)
        self.wait(1.6)

        closing = label('In high dimensions, "nearest" is a photo finish.', color=ACCENT)
        closing.to_edge(DOWN, buff=0.3)
        self.play(FadeOut(panel_note), FadeIn(closing), run_time=1.0)
        self.wait(2.8)

        for mobject in (rings, bars, spread, readout):
            mobject.clear_updaters()
        self.play(
            FadeOut(
                VGroup(
                    panel, dots, rings, axes, axes_note, bars, spread, readout, closing, heading
                )
            ),
            run_time=1.0,
        )
        self.wait(0.4)

    # -- pieces --------------------------------------------------------------

    def dimension(self, log_n: ValueTracker) -> int:
        return max(2, int(round(np.exp(log_n.get_value()))))

    def distances(self, n: int) -> np.ndarray:
        """Distance from the query to every point, using the first n coordinates.

        Divided by sqrt(n) so one x-axis serves every dimension: what matters
        here is the *relative* spread of the distances, not their scale.
        """
        deltas = self.cloud[:, :n] - self.query[:n]
        return np.sqrt((deltas**2).sum(axis=1)) / np.sqrt(n)

    def panel_point(self, coords) -> np.ndarray:
        return PANEL_CENTER + np.array(
            [(coords[0] - 0.5) * PANEL_SIDE, (coords[1] - 0.5) * PANEL_SIDE, 0.0]
        )

    def build_cloud_panel(self) -> tuple[VGroup, VGroup]:
        frame = Square(side_length=PANEL_SIDE, color=MUTED, stroke_width=2, stroke_opacity=0.45)
        frame.move_to(PANEL_CENTER)
        dots = VGroup(
            *[
                Dot(self.panel_point(point), radius=0.035, color=INK, fill_opacity=0.5)
                for point in self.cloud[:, :2]
            ]
        )
        query_dot = Dot(self.panel_point(self.query[:2]), radius=0.09, color=ACCENT)
        query_label = caption("query", color=ACCENT).next_to(query_dot, UP, buff=0.12)
        return VGroup(frame, query_dot, query_label), dots

    def extreme_rings(self, n: int) -> VGroup:
        d = self.distances(n)
        near, far = int(np.argmin(d)), int(np.argmax(d))
        return VGroup(
            Circle(radius=0.14, color=GOOD, stroke_width=3).move_to(
                self.panel_point(self.cloud[near, :2])
            ),
            Circle(radius=0.14, color=BAD, stroke_width=3).move_to(
                self.panel_point(self.cloud[far, :2])
            ),
        )

    def histogram(self, axes: Axes, n: int) -> VGroup:
        counts, edges = np.histogram(self.distances(n), bins=36, range=(0.0, 0.8))
        peak = max(int(counts.max()), 1)
        bars = VGroup()
        for count, left, right in zip(counts, edges[:-1], edges[1:]):
            if count == 0:
                continue
            height = count / peak
            bar = Rectangle(
                width=axes.c2p(right, 0)[0] - axes.c2p(left, 0)[0],
                height=axes.c2p(0, height)[1] - axes.c2p(0, 0)[1],
                stroke_width=0,
                fill_color=L2,
                fill_opacity=0.85,
            )
            bar.move_to(axes.c2p((left + right) / 2, height / 2))
            bars.add(bar)
        return bars

    def spread_bracket(self, axes: Axes, n: int) -> VGroup:
        d = self.distances(n)
        low, high = float(d.min()), float(d.max())
        y = -0.22
        line = Line(axes.c2p(low, y), axes.c2p(high, y), color=INK, stroke_width=4)
        caps = VGroup(
            Line(axes.c2p(low, y - 0.07), axes.c2p(low, y + 0.07), color=GOOD, stroke_width=5),
            Line(axes.c2p(high, y - 0.07), axes.c2p(high, y + 0.07), color=BAD, stroke_width=5),
        )
        ratio = label(f"farthest / nearest = {high / low:.2f}", size=26, color=INK)
        ratio.next_to(axes.c2p(0.4, y), DOWN, buff=0.3)
        return VGroup(line, caps, ratio)

    def dimension_readout(self, n: int) -> VGroup:
        readout = VGroup(
            label("n =", size=30, color=MUTED),
            label(f"{n}", size=38, color=ACCENT),
        ).arrange(RIGHT, buff=0.2)
        return readout.to_corner(RIGHT + UP, buff=0.5).shift(DOWN * 0.95)
