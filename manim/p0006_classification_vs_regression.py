"""Scenes for post 0006, "From lines to language models: Part 2".

Render with (from the repo root):

    manim/render.sh 0006

Three silent, loopable figures for the post's three arguments: least squares
on 0/1 labels fines a model for being confidently right, squashing the score
buys a gradient that dies exactly where the model is most wrong, and one
scorer with a sliding cutoff is a whole shelf of different products.

Every number on screen is computed here, from the same arrays the post's
runnable snippets use. Both fits come out of the normal equations, the
gradient magnitudes are evaluated from the sigmoid drawn on screen, and the
confusion counts are counted from the thousand scored emails the histogram
is drawn from.
"""

from __future__ import annotations

import numpy as np
from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Axes,
    Create,
    DashedLine,
    Dot,
    FadeIn,
    FadeOut,
    Line,
    Rectangle,
    ReplacementTransform,
    VGroup,
    ValueTracker,
    VMobject,
    Write,
    always_redraw,
    smooth,
)

from mfblog.panels import panel
from mfblog.theme import (
    ACCENT,
    BAD,
    DIM,
    GOOD,
    INK,
    L2,
    MUTED,
    BlogScene,
    axis_numbers,
    beat,
    caption,
    label,
    title,
)
from mfblog.typst import tex

# ---------------------------------------------------------------------------
# The crime scene: nine emails, then three more.
#
# Exactly the arrays from the post's runnable snippet. x counts trigger words
# ("FREE", "WINNER", "ACT NOW"), y is 0 for ham and 1 for spam, and the fit is
# Part 1's normal equations with nothing else bolted on.
# ---------------------------------------------------------------------------

X_NINE = np.array([0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 6.0, 7.0, 8.0])
Y_NINE = np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0])
X_EXTRA = np.array([40.0, 50.0, 60.0])  # a caricature of spam
Y_EXTRA = np.array([1.0, 1.0, 1.0])

X_ALL = np.concatenate([X_NINE, X_EXTRA])
Y_ALL = np.concatenate([Y_NINE, Y_EXTRA])

CUT = 0.5  # "call it spam above this score"


def least_squares(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Part 1's normal equations, returned as (slope, intercept)."""
    design = np.column_stack([x, np.ones_like(x)])
    slope, intercept = np.linalg.solve(design.T @ design, design.T @ y)
    return float(slope), float(intercept)


def boundary(slope: float, intercept: float) -> float:
    """Where the fitted line crosses the 0.5 cutoff."""
    return (CUT - intercept) / slope


def squared_error(slope: float, intercept: float) -> float:
    return float(np.sum((slope * X_ALL + intercept - Y_ALL) ** 2))


BEFORE = least_squares(X_NINE, Y_NINE)
AFTER = least_squares(X_ALL, Y_ALL)

PLOT_CENTRE = LEFT * 2.5 + DOWN * 0.15
PLOT_WIDTH = 6.4
PLOT_HEIGHT = 4.1
CARD_X = 3.95


class ConfidentlyRightGetsFined(BlogScene):
    """Least squares on 0/1 labels, and the bill it sends for overshoot.

    Both fits are solved from the points on screen, and the live total
    squared error during the refit is evaluated on all twelve of them, so
    the line really is flattening because the loss goes downhill.
    """

    def construct(self) -> None:
        heading = title("Fitting a line to a yes/no label")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        self.axes, self.ticks = self.frame([0, 10.5], [-0.35, 1.35], [2, 4, 6, 8, 10], [0, 0.5, 1])
        tags = self.axis_tags()
        self.play(FadeIn(self.axes), FadeIn(self.ticks), FadeIn(tags), run_time=0.9)

        self.points = [
            [Dot(self.axes.c2p(x, y), radius=0.075, color=ACCENT if y else L2), x, y]
            for x, y in zip(X_NINE, Y_NINE)
        ]
        opening = caption("Nine emails. x counts trigger words, y is 1 for spam and 0 for ham.")
        opening.to_edge(DOWN, buff=0.4)
        self.play(*(FadeIn(dot) for dot, _, _ in self.points), FadeIn(opening), run_time=0.9)
        self.wait(beat(1.4))

        self.act_one_it_works(opening)
        self.act_two_the_bill()
        self.act_three_the_damage()

        closing = label("Squared error scores distances. You wanted it to score decisions.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act one ---------------------------------------------------------------

    def act_one_it_works(self, opening) -> None:
        slope, intercept = BEFORE
        self.line = self.fitted_line(slope, intercept)
        self.cut_line = self.cut_rule()
        self.edge = self.boundary_rule(boundary(slope, intercept))

        note = caption("Least squares, then call it spam above 0.5:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(note), Create(self.line), run_time=1.0)
        self.play(FadeIn(self.cut_line), FadeIn(self.edge), run_time=0.8)

        formula = tex(r"hat(y) = w x + b", font_size=30, color=INK)
        readout = VGroup(
            label(f"w = {slope:.3f}    b = {intercept:.3f}", size=23, color=MUTED),
            label(f"boundary at x = {boundary(slope, intercept):.1f}", size=23, color=MUTED),
            label("9 of 9 correct", size=30, color=GOOD),
        ).arrange(DOWN, buff=0.16)
        self.card = panel(VGroup(formula, readout).arrange(DOWN, buff=0.34), pad=0.26)
        self.card.move_to(RIGHT * CARD_X + UP * 0.5)
        self.play(FadeIn(self.card), run_time=0.8)

        verdict = caption("Every email lands on the right side of the cutoff. Ship it.", color=GOOD)
        verdict.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.6)
        self.wait(beat(2.2))
        self.play(FadeOut(verdict), run_time=0.4)

    # -- act two ---------------------------------------------------------------

    def act_two_the_bill(self) -> None:
        slope, intercept = BEFORE
        wide_axes, wide_ticks = self.frame(
            [0, 65], [-0.8, 10.2], [20, 40, 60], [0, 2, 4, 6, 8, 10]
        )
        wide_line = self.fitted_line(slope, intercept, wide_axes)

        note = caption("Your boss forwards three more. The most obvious spam imaginable.")
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), FadeOut(self.card), FadeOut(self.edge), FadeOut(self.cut_line), run_time=0.6)
        self.play(
            ReplacementTransform(self.axes, wide_axes),
            ReplacementTransform(self.ticks, wide_ticks),
            ReplacementTransform(self.line, wide_line),
            *(dot.animate.move_to(wide_axes.c2p(x, y)) for dot, x, y in self.points),
            run_time=2.0,
            rate_func=smooth,
        )
        self.axes, self.ticks, self.line = wide_axes, wide_ticks, wide_line

        extra = [
            [Dot(self.axes.c2p(x, y), radius=0.075, color=ACCENT), x, y]
            for x, y in zip(X_EXTRA, Y_EXTRA)
        ]
        self.play(*(FadeIn(dot) for dot, _, _ in extra), run_time=0.8)
        self.points.extend(extra)
        self.wait(beat(1.0))

        # The hero image: out here the old line is not wrong, it is emphatically
        # right, and the loss bills it for the difference anyway.
        far_x = float(X_EXTRA[-1])
        predicted = slope * far_x + intercept
        residual = Line(
            self.axes.c2p(far_x, 1.0),
            self.axes.c2p(far_x, predicted),
            color=BAD,
            stroke_width=6,
        )
        bill = VGroup(
            label(f"at x = {far_x:.0f} the line predicts {predicted:.2f}", size=22, color=MUTED),
            label("the label is 1", size=22, color=MUTED),
            label(f"residual {predicted - 1.0:.2f}, squared:", size=23, color=INK),
            label(f"{(predicted - 1.0) ** 2:.1f}", size=44, color=BAD),
        ).arrange(DOWN, buff=0.16)
        bill_card = panel(bill, pad=0.26)
        bill_card.move_to(RIGHT * CARD_X + UP * 0.5)

        blame = caption("This email is not misclassified. It is emphatically right.", color=INK)
        blame.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(blame), Create(residual), run_time=1.0)
        self.play(FadeIn(bill_card), run_time=0.7)
        self.wait(beat(2.6))

        # Sweep the fit from the old coefficients to the new ones, with the loss
        # it is actually minimising read out live over all twelve points.
        self.march = ValueTracker(0.0)
        live_line = always_redraw(self.marching_line)
        live_loss = always_redraw(self.loss_readout)
        loss_card = panel(
            VGroup(label("total squared error", size=22, color=MUTED), live_loss).arrange(DOWN, buff=0.14),
            pad=0.26,
        )
        loss_card.move_to(RIGHT * CARD_X + UP * 0.5)

        refit = caption("So least squares does its job and flattens the line to hush it.", color=BAD)
        refit.to_edge(DOWN, buff=0.4)
        self.remove(self.line)
        self.add(live_line)
        self.play(
            FadeOut(blame), FadeIn(refit), FadeOut(bill_card), FadeOut(residual),
            FadeIn(loss_card), run_time=0.8,
        )
        self.play(self.march.animate.set_value(1.0), run_time=3.0, rate_func=smooth)
        self.wait(beat(1.2))

        live_line.clear_updaters()
        live_loss.clear_updaters()
        loss_card.clear_updaters()
        self.remove(live_line)
        self.line = self.fitted_line(*AFTER, self.axes)
        self.add(self.line)
        self.play(FadeOut(loss_card), FadeOut(refit), run_time=0.6)

    # -- act three -------------------------------------------------------------

    def act_three_the_damage(self) -> None:
        slope, intercept = AFTER
        near_axes, near_ticks = self.frame([0, 65], [-0.35, 1.35], [20, 40, 60], [0, 0.5, 1])
        near_line = self.fitted_line(slope, intercept, near_axes)

        note = caption("Back to the scale a 0/1 label actually lives on:")
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), run_time=0.5)
        self.play(
            ReplacementTransform(self.axes, near_axes),
            ReplacementTransform(self.ticks, near_ticks),
            ReplacementTransform(self.line, near_line),
            *(dot.animate.move_to(near_axes.c2p(x, y)) for dot, x, y in self.points),
            run_time=2.0,
            rate_func=smooth,
        )
        self.axes, self.ticks, self.line = near_axes, near_ticks, near_line

        cut_line = self.cut_rule()
        edge = self.boundary_rule(boundary(slope, intercept))
        self.play(FadeIn(cut_line), FadeIn(edge), run_time=0.8)
        self.wait(beat(0.8))

        # Recolour by verdict, counted rather than asserted.
        wrong = 0
        recolour = []
        for dot, x, y in self.points:
            correct = ((slope * x + intercept) > CUT) == (y > CUT)
            if not correct:
                wrong += 1
                recolour.append(dot.animate.set_color(BAD).scale(1.4))
        scored = caption("The three original spam emails now score below the cutoff.", color=BAD)
        scored.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(scored), *recolour, run_time=1.0)

        readout = VGroup(
            label(f"w = {slope:.3f}    b = {intercept:.3f}", size=23, color=MUTED),
            label(f"boundary at x = {boundary(slope, intercept):.1f}", size=23, color=MUTED),
            label(f"spam at x = 7 scores {slope * 7 + intercept:.2f}", size=23, color=BAD),
            label(f"{wrong} of {len(self.points)} wrong", size=30, color=BAD),
        ).arrange(DOWN, buff=0.16)
        card = panel(readout, pad=0.26)
        card.move_to(RIGHT * CARD_X + UP * 0.5)
        self.play(FadeIn(card), run_time=0.7)
        self.wait(beat(1.6))

        verdict = VGroup(
            caption("Adding unambiguous examples of spam made the filter worse.", color=BAD),
            caption("The borderline spam paid the bill for the overshoot.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(scored), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces ----------------------------------------------------------------

    def frame(self, x_range, y_range, x_ticks, y_ticks) -> tuple[Axes, VGroup]:
        axes = Axes(
            x_range=[x_range[0], x_range[1], (x_range[1] - x_range[0]) / 6],
            y_range=[y_range[0], y_range[1], (y_range[1] - y_range[0]) / 5],
            x_length=PLOT_WIDTH,
            y_length=PLOT_HEIGHT,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(PLOT_CENTRE)
        ticks = VGroup(
            axis_numbers(axes, x_ticks, buff=0.18, size=21),
            axis_numbers(axes, y_ticks, axis="y", buff=0.18, size=21),
        )
        return axes, ticks

    def axis_tags(self) -> VGroup:
        x_tag = caption("trigger words").scale(0.72)
        x_tag.next_to(self.axes, DOWN, buff=0.5)
        y_tag = caption("score").scale(0.72).rotate(np.pi / 2)
        y_tag.next_to(self.axes, LEFT, buff=0.95)
        return VGroup(x_tag, y_tag)

    def fitted_line(self, slope: float, intercept: float, axes: Axes | None = None) -> VMobject:
        axes = axes if axes is not None else self.axes
        x_min, x_max = axes.x_range[0], axes.x_range[1]
        y_min, y_max = axes.y_range[0], axes.y_range[1]
        inside = [
            (x, slope * x + intercept)
            for x in np.linspace(x_min, x_max, 80)
            if y_min <= slope * x + intercept <= y_max
        ]
        if len(inside) < 2:
            inside = [(x_min, y_min), (x_min, y_min)]
        line = VMobject(color=GOOD, stroke_width=5)
        line.set_points_as_corners([axes.c2p(x, y) for x, y in inside])
        return line

    def cut_rule(self) -> DashedLine:
        return DashedLine(
            self.axes.c2p(self.axes.x_range[0], CUT),
            self.axes.c2p(self.axes.x_range[1], CUT),
            color=INK,
            stroke_width=2.5,
            dash_length=0.1,
        )

    def boundary_rule(self, x: float) -> VGroup:
        rule = DashedLine(
            self.axes.c2p(x, self.axes.y_range[0]),
            self.axes.c2p(x, CUT),
            color=MUTED,
            stroke_width=2.5,
            dash_length=0.09,
        )
        tag = label(f"x = {x:.1f}", size=20, color=MUTED)
        tag.next_to(self.axes.c2p(x, self.axes.y_range[0]), RIGHT, buff=0.1)
        return VGroup(rule, tag)

    def marching_coefficients(self) -> tuple[float, float]:
        phase = self.march.get_value()
        return (
            BEFORE[0] + (AFTER[0] - BEFORE[0]) * phase,
            BEFORE[1] + (AFTER[1] - BEFORE[1]) * phase,
        )

    def marching_line(self) -> VMobject:
        slope, intercept = self.marching_coefficients()
        return self.fitted_line(slope, intercept, self.axes)

    def loss_readout(self):
        loss = squared_error(*self.marching_coefficients())
        return label(f"{loss:.1f}", size=44, color=BAD if loss > 10 else GOOD)


# ---------------------------------------------------------------------------
# Scene two: the patch that buys a worse problem.
#
# Squashing the score fixes the overshoot and kills the gradient. Both curves
# are the exact derivatives with respect to the score, evaluated on the
# sigmoid drawn on screen, for a spam email (y = 1).
# ---------------------------------------------------------------------------

SPAN = 8.0
GRID = np.linspace(-SPAN, SPAN, 4001)


def sigmoid(s):
    return 1.0 / (1.0 + np.exp(-s))


def mse_gradient(s):
    """|d/ds (sigma(s) - 1)^2| = |2 (sigma - 1) sigma'|."""
    p = sigmoid(s)
    return float(np.abs(2.0 * (p - 1.0) * p * (1.0 - p)))


def log_gradient(s):
    """|d/ds -log sigma(s)| = |sigma - 1|. The error itself, undamped."""
    return float(np.abs(sigmoid(s) - 1.0))


MSE_PEAK = float(GRID[int(np.argmax([mse_gradient(s) for s in GRID]))])


class TheGradientDiesWhereItHurts(BlogScene):
    """Squash the score and the lesson stops arriving where it is needed.

    The dots on both curves sit at the same score, and every number in the
    readout is one of those curves evaluated at it.
    """

    def construct(self) -> None:
        heading = title("The patch that buys a worse problem")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        self.score = ValueTracker(6.0)
        self.show_log = False
        self.build_left()

        opening = VGroup(
            caption("Squash the score, and a prediction can never overshoot the label again."),
            caption("This email is spam, so the label is 1 and the target is the top of the curve."),
        ).arrange(DOWN, buff=0.14)
        opening.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(opening), run_time=0.7)
        self.wait(beat(2.6))

        self.act_one_the_derivative(opening)
        self.build_right()
        self.act_two_the_sweep()
        self.act_three_the_alternative()

        closing = label("It stops teaching exactly where there is the most to learn.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        for live in (self.marker, self.dots, self.numbers):
            live.clear_updaters()
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- acts ------------------------------------------------------------------

    def act_one_the_derivative(self, opening) -> None:
        formula = tex(
            r"partial/(partial s) (sigma(s) - y)^2 = 2 (sigma(s) - y) sigma prime (s)",
            font_size=26,
            color=INK,
        )
        card = panel(formula, pad=0.26)
        card.move_to(RIGHT * 3.2 + UP * 0.9)
        note = caption("Chain rule on squared error, and there is the trouble:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(card), FadeIn(note), run_time=0.8)
        self.wait(beat(1.6))

        blame = VGroup(
            caption("The second factor is the slope of the squashing function,", color=MUTED),
            caption("and the squashing function is flat at both ends.", color=BAD),
        ).arrange(DOWN, buff=0.14)
        blame.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(blame), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(card), FadeOut(blame), run_time=0.6)

    def act_two_the_sweep(self) -> None:
        note = caption("Slide the score from confidently right to confidently wrong:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), run_time=0.5)
        self.play(self.score.animate.set_value(-6.0), run_time=4.0, rate_func=smooth)
        self.wait(beat(1.2))

        verdict = VGroup(
            caption(
                f"The error is as large as it gets, and the push is down to {mse_gradient(-6.0):.3f}.",
                color=BAD,
            ),
            caption(
                f"It peaked back at s = {MSE_PEAK:.1f}, where the model was barely wrong at all.",
                color=MUTED,
            ),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))
        self.play(FadeOut(verdict), run_time=0.5)

    def act_three_the_alternative(self) -> None:
        curve = self.gradient_curve(log_gradient, GOOD)
        tag = label("cross-entropy", size=20, color=GOOD)
        tag.next_to(self.grad_axes.c2p(-6.4, log_gradient(-6.4)), DOWN, buff=0.16)
        note = caption("The loss Part 3 builds has no such factor to damp it:", color=GOOD)
        note.to_edge(DOWN, buff=0.4)
        self.show_log = True
        self.play(FadeIn(note), Create(curve), FadeIn(tag), run_time=1.4)
        self.wait(beat(1.2))

        ratio = log_gradient(-6.0) / mse_gradient(-6.0)
        verdict = VGroup(
            caption(f"At this score it pushes {ratio:.0f} times harder than squared error,", color=GOOD),
            caption("and it is still at full strength where the model is most wrong.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces ----------------------------------------------------------------

    def build_left(self) -> None:
        self.sig_axes = self.panel_axes([-0.08, 1.16], LEFT * 3.5)
        ticks = VGroup(
            axis_numbers(self.sig_axes, [-8, -4, 4, 8], buff=0.16, size=20),
            axis_numbers(self.sig_axes, [0.5, 1], axis="y", buff=0.16, size=20),
        )
        curve = VMobject(color=L2, stroke_width=5)
        curve.set_points_as_corners(
            [self.sig_axes.c2p(s, sigmoid(s)) for s in np.linspace(-SPAN, SPAN, 240)]
        )
        target = DashedLine(
            self.sig_axes.c2p(-SPAN, 1.0),
            self.sig_axes.c2p(SPAN, 1.0),
            color=ACCENT,
            stroke_width=2.5,
            dash_length=0.1,
        )
        target_tag = label("label y = 1", size=19, color=ACCENT)
        target_tag.next_to(self.sig_axes.c2p(-5.2, 1.0), UP, buff=0.08)
        heading = label("the squashed score", size=21, color=MUTED)
        heading.next_to(self.sig_axes, UP, buff=0.3)

        self.marker = always_redraw(self.sigmoid_marker)
        self.play(
            FadeIn(self.sig_axes), FadeIn(ticks), Create(curve),
            FadeIn(target), FadeIn(target_tag), FadeIn(heading), run_time=1.4,
        )
        self.add(self.marker)

    def build_right(self) -> None:
        self.grad_axes = self.panel_axes([-0.05, 1.12], RIGHT * 2.6)
        ticks = VGroup(
            axis_numbers(self.grad_axes, [-8, -4, 4, 8], buff=0.16, size=20),
            axis_numbers(self.grad_axes, [0.5, 1], axis="y", buff=0.16, size=20),
        )
        curve = self.gradient_curve(mse_gradient, BAD)
        tag = label("squared error", size=20, color=BAD)
        tag.next_to(self.grad_axes.c2p(MSE_PEAK, mse_gradient(MSE_PEAK)), UP + LEFT, buff=0.08)
        heading = label("how hard the loss pushes", size=21, color=MUTED)
        heading.next_to(self.grad_axes, UP, buff=0.3)

        self.dots = always_redraw(self.live_dots)
        self.numbers = always_redraw(self.live_numbers)
        self.play(
            FadeIn(self.grad_axes), FadeIn(ticks), Create(curve),
            FadeIn(tag), FadeIn(heading), run_time=1.4,
        )
        self.add(self.dots, self.numbers)

    def panel_axes(self, y_range, centre) -> Axes:
        axes = Axes(
            x_range=[-SPAN, SPAN, 4],
            y_range=[y_range[0], y_range[1], 0.5],
            x_length=4.9,
            y_length=2.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        return axes.move_to(centre + UP * 1.05)

    def gradient_curve(self, function, colour: str) -> VMobject:
        curve = VMobject(color=colour, stroke_width=5)
        curve.set_points_as_corners(
            [self.grad_axes.c2p(s, function(s)) for s in np.linspace(-SPAN, SPAN, 320)]
        )
        return curve

    def sigmoid_marker(self) -> VGroup:
        s = self.score.get_value()
        point = self.sig_axes.c2p(s, sigmoid(s))
        return VGroup(
            DashedLine(
                self.sig_axes.c2p(s, self.sig_axes.y_range[0]),
                point,
                color=DIM,
                stroke_width=2,
                dash_length=0.08,
            ),
            Dot(point, radius=0.085, color=INK),
        )

    def live_dots(self) -> VGroup:
        s = self.score.get_value()
        group = VGroup(Dot(self.grad_axes.c2p(s, mse_gradient(s)), radius=0.08, color=BAD))
        if self.show_log:
            group.add(Dot(self.grad_axes.c2p(s, log_gradient(s)), radius=0.08, color=GOOD))
        return group

    def live_numbers(self) -> VGroup:
        s = self.score.get_value()
        rows = VGroup(
            label(f"score s = {s:+.2f}", size=23, color=INK),
            label(f"prediction \u03c3(s) = {sigmoid(s):.3f}", size=23, color=L2),
            label(f"how wrong it is = {log_gradient(s):.3f}", size=23, color=MUTED),
            label(f"squared-error push = {mse_gradient(s):.4f}", size=23, color=BAD),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.13)
        block = panel(rows, pad=0.25)
        block.move_to(DOWN * 1.75)
        return block


# ---------------------------------------------------------------------------
# Scene three: one scorer, a shelf of products.
#
# The post's own imbalance simulation, seed and all: 990 ham drawn from
# N(0, 1) and 10 spam from N(2.5, 1). The histogram is those 990 scores, the
# strip under the axis is those 10, and every count is counted from them.
# ---------------------------------------------------------------------------

N_HAM, N_SPAM = 990, 10
_rng = np.random.default_rng(0)
LABELS = np.concatenate([np.zeros(N_HAM), np.ones(N_SPAM)])
SCORES = np.concatenate([_rng.normal(0.0, 1.0, N_HAM), _rng.normal(2.5, 1.0, N_SPAM)])

SPAM_SCORES = SCORES[LABELS == 1]
HAM_SCORES = SCORES[LABELS == 0]
BINS = 34
LOW, HIGH = -4.3, 4.7
FILTER_CUT, SCREEN_CUT = 2.0, 0.5


def confusion(threshold: float) -> tuple[int, int, int]:
    flagged = SCORES > threshold
    return (
        int(np.sum(flagged & (LABELS == 1))),
        int(np.sum(flagged & (LABELS == 0))),
        int(np.sum(~flagged & (LABELS == 1))),
    )


def metrics(threshold: float) -> tuple[float, float, float]:
    hit, false_alarm, miss = confusion(threshold)
    accuracy = float(np.mean((SCORES > threshold) == (LABELS == 1)))
    return accuracy, hit / max(hit + false_alarm, 1), hit / max(hit + miss, 1)


class OneScorerManyProducts(BlogScene):
    """Accuracy is a vanity metric, and the cutoff is the product.

    Every count comes from the thousand scored emails the histogram is drawn
    from; sliding the rule re-counts them rather than re-labelling anything.
    """

    def construct(self) -> None:
        heading = title("One scorer, a shelf of different products")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        self.threshold = ValueTracker(HIGH)
        self.build_plot()

        opening = VGroup(
            caption(f"{N_HAM} ham and {N_SPAM} spam: one percent, like a real mailbox."),
            caption("The bars are the ham scores; the dots below are all ten spam."),
        ).arrange(DOWN, buff=0.14)
        opening.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(opening), run_time=0.7)
        self.wait(beat(2.6))

        self.act_one_vanity(opening)
        self.act_two_sweep()
        self.act_three_products()

        closing = label("The loss trains the scorer. The cutoff is your call, not math's.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        for live in (self.bars, self.spam_dots, self.rule):
            live.clear_updaters()
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- acts ------------------------------------------------------------------

    def act_one_vanity(self, opening) -> None:
        accuracy = float(np.mean(LABELS == 0))
        rows = VGroup(
            label('the "always ham" filter', size=24, color=MUTED),
            label(f"accuracy   {accuracy:.3f}", size=34, color=GOOD),
            label("recall   0.000", size=28, color=BAD),
            label(f"caught 0 of {N_SPAM} spam", size=21, color=MUTED),
        ).arrange(DOWN, buff=0.16)
        card = panel(rows, pad=0.26)
        card.move_to(RIGHT * 4.0 + DOWN * 0.15)

        note = caption("A model that says ham to everything, scored on accuracy:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(note), run_time=0.6)
        self.play(FadeIn(card), run_time=0.8)
        self.wait(beat(2.0))

        verdict = VGroup(
            caption(f"{accuracy * 100:.0f}% accurate, and it has never caught anything.", color=BAD),
            caption("Report accuracy alone and you are telling a 99%-true lie.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(card), FadeOut(verdict), run_time=0.6)

    def act_two_sweep(self) -> None:
        self.live_card = always_redraw(self.metric_card)
        note = caption("Now a real scorer, and one cutoff sliding down through it:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), FadeIn(self.live_card), run_time=0.8)
        self.wait(beat(1.2))
        self.play(self.threshold.animate.set_value(SCREEN_CUT), run_time=5.0, rate_func=smooth)
        self.wait(beat(1.2))

        verdict = VGroup(
            caption("Nothing about the model changed. Only where the line was drawn.", color=MUTED),
            caption("Precision and recall traded places the whole way down.", color=INK),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.4))
        self.play(FadeOut(verdict), run_time=0.5)

    def act_three_products(self) -> None:
        self.live_card.clear_updaters()
        self.play(FadeOut(self.live_card), run_time=0.5)

        axes = Axes(
            x_range=[0, 1.06, 0.25],
            y_range=[0, 1.08, 0.25],
            x_length=3.0,
            y_length=2.4,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(RIGHT * 4.2 + DOWN * 0.2)
        ticks = VGroup(
            axis_numbers(axes, [0, 0.5, 1], buff=0.14, size=19),
            axis_numbers(axes, [0.5, 1], axis="y", buff=0.14, size=19),
        )
        x_tag = caption("recall").scale(0.62)
        x_tag.next_to(ticks[0], DOWN, buff=0.1)
        y_tag = caption("precision").scale(0.62).rotate(np.pi / 2)
        y_tag.next_to(ticks[1], LEFT, buff=0.12)
        curve_heading = label("every cutoff at once", size=20, color=MUTED)
        curve_heading.next_to(axes, UP, buff=0.28)

        trace = []
        for threshold in np.linspace(HIGH, LOW, 400):
            hit, false_alarm, _ = confusion(threshold)
            if hit + false_alarm == 0:
                continue
            _, precision, recall = metrics(threshold)
            trace.append(axes.c2p(recall, precision))
        curve = VMobject(color=L2, stroke_width=4)
        curve.set_points_as_corners(trace)

        note = caption("Sweep every cutoff and the same scorer traces a whole product line:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(
            FadeIn(axes), FadeIn(ticks), FadeIn(x_tag), FadeIn(y_tag),
            FadeIn(curve_heading), FadeIn(note), run_time=0.9,
        )
        self.play(Create(curve), run_time=2.0)
        self.wait(beat(0.8))

        marks = []
        for cut, colour in ((FILTER_CUT, ACCENT), (SCREEN_CUT, GOOD)):
            _, precision, recall = metrics(cut)
            marks.append(Dot(axes.c2p(recall, precision), radius=0.075, color=colour))

        self.play(
            self.threshold.animate.set_value(FILTER_CUT),
            FadeOut(note),
            run_time=1.6,
            rate_func=smooth,
        )
        filter_note = self.posture_note(
            FILTER_CUT, "the spam filter", "burying real mail is the expensive mistake", ACCENT
        )
        self.play(FadeIn(marks[0]), FadeIn(filter_note), run_time=0.7)
        self.wait(beat(2.8))

        screen_note = self.posture_note(
            SCREEN_CUT, "the screening test", "a missed case is the catastrophe, and follow-ups mop up", GOOD
        )
        self.play(
            self.threshold.animate.set_value(SCREEN_CUT),
            FadeOut(filter_note),
            run_time=1.6,
            rate_func=smooth,
        )
        self.play(FadeIn(marks[1]), FadeIn(screen_note), run_time=0.7)
        self.wait(beat(2.8))

        verdict = VGroup(
            caption("Same weights, same scores, opposite souls.", color=INK),
            caption("Nothing in the mathematics chooses between them.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(screen_note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces ----------------------------------------------------------------

    def build_plot(self) -> None:
        self.counts, self.edges = np.histogram(HAM_SCORES, bins=BINS, range=(LOW, HIGH))
        self.axes = Axes(
            x_range=[LOW, HIGH, 1],
            y_range=[0, float(self.counts.max()) * 1.1, 50],
            x_length=6.2,
            y_length=2.0,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        self.axes.move_to(LEFT * 3.2 + UP * 1.15)
        # Only the score axis carries meaning here; a vertical rule at score 0
        # would read as a second cutoff.
        self.axes.get_y_axis().set_opacity(0.0)

        # The ten spam sit on their own strip under the axis, because ten
        # counts beside nine hundred and ninety would be an invisible bar.
        self.strip_y = self.axes.c2p(0, 0)[1] - 0.6
        strip = Line(
            [self.axes.c2p(LOW, 0)[0], self.strip_y, 0],
            [self.axes.c2p(HIGH, 0)[0], self.strip_y, 0],
            color=DIM,
            stroke_width=1.5,
        )
        strip_tag = label("spam", size=19, color=ACCENT)
        strip_tag.next_to([self.axes.c2p(LOW, 0)[0], self.strip_y, 0], LEFT, buff=0.14)

        ticks = axis_numbers(self.axes, [-4, -2, 0, 2, 4], buff=0.98, size=20)
        axis_tag = caption("score").scale(0.68)
        axis_tag.next_to(ticks, DOWN, buff=0.14)

        self.bars = always_redraw(self.histogram)
        self.spam_dots = always_redraw(self.spam_strip)
        self.rule = always_redraw(self.cut_rule)
        self.play(FadeIn(self.axes), FadeIn(ticks), FadeIn(axis_tag), FadeIn(strip), run_time=0.8)
        self.add(self.bars, self.spam_dots, self.rule)
        self.play(FadeIn(strip_tag), run_time=0.5)

    def histogram(self) -> VGroup:
        threshold = self.threshold.get_value()
        bars = VGroup()
        for count, left, right in zip(self.counts, self.edges[:-1], self.edges[1:]):
            corner = self.axes.c2p(left, 0)
            top_right = self.axes.c2p(right, float(count))
            bar = Rectangle(
                # A bar is a false alarm as soon as its scores clear the rule.
                width=top_right[0] - corner[0],
                height=max(top_right[1] - corner[1], 0.001),
                fill_color=BAD if left >= threshold else L2,
                fill_opacity=0.8,
                stroke_width=0,
            )
            bar.move_to((corner + top_right) / 2)
            bars.add(bar)
        return bars

    def spam_strip(self) -> VGroup:
        threshold = self.threshold.get_value()
        return VGroup(
            *(
                Dot(
                    [self.axes.c2p(score, 0)[0], self.strip_y, 0],
                    radius=0.075,
                    # Gold is the class colour from the strip label; green
                    # means this one is actually being caught.
                    color=GOOD if score > threshold else ACCENT,
                )
                for score in SPAM_SCORES
            )
        )

    def cut_rule(self) -> VGroup:
        threshold = self.threshold.get_value()
        top = self.axes.c2p(threshold, self.axes.y_range[1])
        rule = DashedLine(
            [top[0], self.strip_y - 0.28, 0], top, color=INK, stroke_width=3, dash_length=0.1
        )
        tag = label(f"cutoff {threshold:.2f}", size=20, color=INK)
        tag.next_to(top, UP, buff=0.1)
        return VGroup(rule, tag)

    def metric_card(self) -> VGroup:
        threshold = self.threshold.get_value()
        accuracy, precision, recall = metrics(threshold)
        hit, false_alarm, _ = confusion(threshold)
        rows = VGroup(
            label(f"accuracy    {accuracy:.3f}", size=24, color=MUTED),
            label(f"precision   {precision:.3f}", size=24, color=ACCENT),
            label(f"recall      {recall:.3f}", size=24, color=GOOD),
            label(f"caught {hit} of {N_SPAM} spam", size=21, color=MUTED),
            label(f"flagged {false_alarm} real emails", size=21, color=BAD),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        block = panel(rows, pad=0.25)
        block.move_to(RIGHT * 4.0 + DOWN * 0.15)
        return block

    def posture_note(self, cut: float, name: str, why: str, colour: str) -> VGroup:
        _, precision, recall = metrics(cut)
        hit, false_alarm, _ = confusion(cut)
        return VGroup(
            caption(
                f"Cutoff {cut:.1f}, {name}: catches {hit} of {N_SPAM} spam, buries {false_alarm} real emails.",
                color=colour,
            ),
            caption(f"Precision {precision:.2f}, recall {recall:.2f}: {why}.", color=MUTED),
        ).arrange(DOWN, buff=0.14).to_edge(DOWN, buff=0.35)
