"""Scenes for post 0007, "From lines to language models: Part 3".

Render with (from the repo root):

    manim/render.sh 0007

Three silent, loopable figures for the post's three big moves: the sigmoid
falling out of a *declaration* about what the score means rather than being
picked from a catalogue, cross-entropy's gradient collapsing to Part 1's
gradient with the prediction renamed, and softmax generalising the vote to
K classes with sigmoid as the two-class special case.

Every number on screen is computed here. The sigmoid readouts are the exact
function evaluated at the score on screen, the classification run is real
gradient descent on the same two Gaussian clusters as the post's convexity
snippet, the separable-data run is the post's four-point example verbatim,
and the softmax numbers are the post's own demo scores.
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
    L1,
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


def sigmoid(s):
    return 1.0 / (1.0 + np.exp(-s))


def odds(s):
    return np.exp(s)


# ---------------------------------------------------------------------------
# Scene one: the sigmoid, derived rather than chosen.
#
# Declare that the score IS the log-odds, solve for p, and the curve on
# screen is the direct consequence: every readout is sigma(s) at the score
# the tracker is sitting on.
# ---------------------------------------------------------------------------

SPAN = 8.0
PLOT_CENTRE = LEFT * 2.6 + UP * 0.25
PLOT_WIDTH = 6.4
PLOT_HEIGHT = 3.8
CARD_X = 4.0


class SigmoidFromLogOdds(BlogScene):
    """Declare the score is a log-odds, and the sigmoid falls out.

    The marker and its readout are one `ValueTracker` apart: every number in
    the card is `sigmoid` (or its odds) evaluated at the score the dot sits
    on, read live off the curve underneath it.
    """

    def construct(self) -> None:
        heading = title("The score was a log-odds all along")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        self.axes, ticks = self.build_axes()
        tags = self.axis_tags()
        self.play(FadeIn(self.axes), FadeIn(ticks), FadeIn(tags), run_time=0.9)

        opening = caption('Your boss: "the model says s = 2.3. How spam-ish is that?"')
        opening.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(opening), run_time=0.8)
        self.wait(beat(1.8))

        self.act_one_declare(opening)
        self.act_two_the_boss_question()
        self.act_three_mirror_and_saturation()

        closing = label("Nobody picked an S-shaped curve. An interpretation forced it.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        self.marker.clear_updaters()
        self.readout.clear_updaters()
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- acts --------------------------------------------------------------

    def act_one_declare(self, opening) -> None:
        declare = tex(r"log(p / (1-p)) = s = w dot x + b", font_size=27, color=INK)
        card = panel(declare, pad=0.26)
        card.move_to(RIGHT * CARD_X + UP * 1.5)
        note = caption("Declare that the score IS the log-odds:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(note), FadeIn(card), run_time=0.9)
        self.wait(beat(1.8))

        solved = tex(r"p = e^s / (1+e^s) = 1 / (1+e^(-s)) = sigma(s)", font_size=26, color=GOOD)
        card2 = panel(solved, pad=0.26)
        card2.move_to(RIGHT * CARD_X + UP * 1.5)
        note2 = caption("Solve for p, and the sigmoid falls out. Nobody chose the curve.", color=GOOD)
        note2.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(note2), ReplacementTransform(card, card2), run_time=1.1)
        self.wait(beat(1.6))

        curve = self.sigmoid_curve()
        coin_flip = DashedLine(
            self.axes.c2p(-SPAN, 0.5), self.axes.c2p(SPAN, 0.5), color=DIM, stroke_width=2, dash_length=0.1
        )
        self.play(Create(curve), FadeIn(coin_flip), run_time=1.6)
        self.wait(beat(1.2))
        self.play(FadeOut(note2), FadeOut(card2), run_time=0.6)

    def act_two_the_boss_question(self) -> None:
        self.score = ValueTracker(0.0)
        self.marker = always_redraw(self.score_marker)
        self.readout = always_redraw(self.readout_card)

        note = caption("Slide the score up to the boss's 2.3:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), FadeIn(self.marker), FadeIn(self.readout), run_time=0.8)
        self.play(self.score.animate.set_value(2.3), run_time=3.0, rate_func=smooth)
        self.wait(beat(1.4))

        verdict = VGroup(
            caption(f"Odds e^2.3 ≈ {odds(2.3):.1f} to 1 → σ(2.3) = {sigmoid(2.3):.3f}.", color=GOOD),
            caption("91% spam, by unit conversion rather than vibe.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), run_time=0.5)

    def act_three_mirror_and_saturation(self) -> None:
        note = caption("Flip the sign: evidence for becomes evidence against.", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note), run_time=0.6)
        self.play(self.score.animate.set_value(-2.3), run_time=2.6, rate_func=smooth)
        self.wait(beat(1.0))

        mirror = VGroup(
            caption(f"σ(2.3) + σ(-2.3) = {sigmoid(2.3) + sigmoid(-2.3):.6f}", color=GOOD),
            caption("mirror image around the coin flip at 0.5", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        mirror.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(mirror), run_time=0.7)
        self.wait(beat(2.2))
        self.play(FadeOut(mirror), run_time=0.5)

        note2 = caption("Push the score out to ±6 and watch it saturate:", color=INK)
        note2.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note2), run_time=0.6)
        self.play(self.score.animate.set_value(6.0), run_time=2.2, rate_func=smooth)
        self.wait(beat(0.8))
        self.play(self.score.animate.set_value(-6.0), run_time=2.6, rate_func=smooth)
        self.wait(beat(1.0))

        verdict = VGroup(
            caption(f"σ(6) = {sigmoid(6.0):.4f}     σ(-6) = {sigmoid(-6.0):.4f}", color=INK),
            caption("400-to-1 odds and 40,000-to-1 odds are both just 'sure'.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note2), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces --------------------------------------------------------------

    def build_axes(self) -> tuple[Axes, VGroup]:
        axes = Axes(
            x_range=[-SPAN, SPAN, 4],
            y_range=[-0.08, 1.12, 0.5],
            x_length=PLOT_WIDTH,
            y_length=PLOT_HEIGHT,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(PLOT_CENTRE)
        ticks = VGroup(
            axis_numbers(axes, [-6, -3, 3, 6], buff=0.18, size=20),
            axis_numbers(axes, [0.5, 1], axis="y", buff=0.18, size=20),
        )
        return axes, ticks

    def axis_tags(self) -> VGroup:
        x_tag = caption("score s").scale(0.72)
        x_tag.next_to(self.axes, DOWN, buff=0.3)
        y_tag = caption("P(spam)").scale(0.72).rotate(np.pi / 2)
        y_tag.next_to(self.axes, LEFT, buff=0.75)
        return VGroup(x_tag, y_tag)

    def sigmoid_curve(self) -> VMobject:
        curve = VMobject(color=L2, stroke_width=5)
        curve.set_points_as_corners([self.axes.c2p(s, sigmoid(s)) for s in np.linspace(-SPAN, SPAN, 240)])
        return curve

    def score_marker(self) -> VGroup:
        s = self.score.get_value()
        point = self.axes.c2p(s, sigmoid(s))
        return VGroup(
            DashedLine(self.axes.c2p(s, self.axes.y_range[0]), point, color=DIM, stroke_width=2, dash_length=0.08),
            DashedLine(
                self.axes.c2p(self.axes.x_range[0], sigmoid(s)), point, color=DIM, stroke_width=2, dash_length=0.08
            ),
            Dot(point, radius=0.09, color=ACCENT),
        )

    def readout_card(self) -> VGroup:
        s = self.score.get_value()
        rows = VGroup(
            label(f"score s = {s:+.2f}", size=23, color=INK),
            label(f"odds = {odds(s):.3g} : 1", size=23, color=MUTED),
            label(f"\u03c3(s) = {sigmoid(s):.3f}", size=27, color=ACCENT),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        block = panel(rows, pad=0.26)
        block.move_to(RIGHT * CARD_X + UP * 0.7)
        return block


# ---------------------------------------------------------------------------
# Scene two: the punchline gradient.
#
# The derivation panels are the post's algebra verbatim. The classification
# run is real gradient descent on the post's two Gaussian clusters
# (rng.default_rng(0), n=100 per class, lr=0.5), and the separable-data run
# is the post's own four-point example, both trained here rather than typed
# in as constants.
# ---------------------------------------------------------------------------


def train_logistic(x, y, steps, lr, l2=0.0):
    """Plain gradient descent on cross-entropy: the post's training loop.

    Returns the full history of weights, biases and loss so scenes can
    scrub through real training rather than faking a sweep between two
    endpoints.
    """
    w = np.zeros(x.shape[1])
    b = 0.0
    w_hist, b_hist, loss_hist = [], [], []
    for _ in range(steps):
        p = sigmoid(x @ w + b)
        loss = float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())
        g = p - y
        w = w - lr * ((x * g[:, None]).mean(axis=0) + l2 * w)
        b = b - lr * g.mean()
        w_hist.append(w.copy())
        b_hist.append(b)
        loss_hist.append(loss)
    return np.array(w_hist), np.array(b_hist), np.array(loss_hist)


_RNG = np.random.default_rng(0)
_N_CLUSTER = 100
X_CLUSTER = np.vstack(
    [_RNG.normal([-1.5, -1.0], 1.0, (_N_CLUSTER, 2)), _RNG.normal([1.5, 1.0], 1.0, (_N_CLUSTER, 2))]
)
Y_CLUSTER = np.concatenate([np.zeros(_N_CLUSTER), np.ones(_N_CLUSTER)])
CLUSTER_W, CLUSTER_B, CLUSTER_LOSS = train_logistic(X_CLUSTER, Y_CLUSTER, 500, 0.5)

X_SEP = np.array([[-2.0], [-1.0], [1.0], [2.0]])
Y_SEP = np.array([0.0, 0.0, 1.0, 1.0])
SEP_STEPS = 20000
SEP_W0, SEP_B0, SEP_LOSS0 = train_logistic(X_SEP, Y_SEP, SEP_STEPS, 0.5, l2=0.0)
SEP_W1, SEP_B1, SEP_LOSS1 = train_logistic(X_SEP, Y_SEP, SEP_STEPS, 0.5, l2=0.01)

CHECKPOINT_STEPS = [1, 100, 1000, 20000]
CHECKPOINT_INDEX = [0, 99, 999, 19999]
CHECKPOINT_W0 = SEP_W0[CHECKPOINT_INDEX, 0]
CHECKPOINT_W1 = SEP_W1[CHECKPOINT_INDEX, 0]


class ThePunchlineGradient(BlogScene):
    """Cross-entropy's gradient collapses to Part 1's, and the valley just works.

    Act one's algebra is the post's derivation, panel for panel. Act two is
    a real training run on the two clusters (the loss and boundary read off
    the same history array driving the animation). Act three trains the
    post's separable four points with and without ridge, so the "weights
    walk to infinity" claim is a measured fact rather than an assertion.
    """

    def construct(self) -> None:
        heading = title("The gradient that refuses to die")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        opening = caption("Part 2 left a wish: a loss that pushes hardest where it's most wrong.")
        opening.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(opening), run_time=0.8)
        self.wait(beat(1.8))

        self.act_one_the_cancellation(opening)
        self.act_two_one_valley()
        self.act_three_no_floor()

        closing = label("Same gradient as Part 1. Just a probability instead of a raw score.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act one -------------------------------------------------------------

    def act_one_the_cancellation(self, opening) -> None:
        old = tex(
            r"partial/(partial s) (sigma(s) - y)^2 = 2 (sigma(s) - y) sigma prime (s)",
            font_size=25,
            color=BAD,
        )
        card = panel(old, pad=0.26)
        card.move_to(RIGHT * 3.3 + UP * 1.5)
        note = caption("Part 2's gradient carried a sigma-prime factor that strangled it.", color=BAD)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(card), FadeIn(note), run_time=0.9)
        self.wait(beat(1.8))

        step1 = tex(
            r"(partial cal(L))/(partial s) = -y (sigma prime)/sigma + (1-y) (sigma prime)/(1-sigma)",
            font_size=22,
            color=INK,
        )
        card1 = panel(step1, pad=0.26)
        card1.move_to(RIGHT * 3.3 + UP * 1.5)
        note2 = caption("Cross-entropy's chain rule picks up the same sigma-prime. Watch it:", color=INK)
        note2.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(note2), ReplacementTransform(card, card1), run_time=1.1)
        self.wait(beat(2.0))

        step2 = tex(r"= -y(1-sigma) + (1-y) sigma", font_size=27, color=INK)
        card2 = panel(step2, pad=0.26)
        card2.move_to(RIGHT * 3.3 + UP * 1.5)
        note3 = caption("sigma-prime = sigma(1-sigma) cancels clean against the log's denominators.", color=GOOD)
        note3.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note2), FadeIn(note3), ReplacementTransform(card1, card2), run_time=1.1)
        self.wait(beat(2.0))

        final = tex(r"= sigma(s) - y", font_size=36, color=GOOD)
        card3 = panel(final, pad=0.3)
        card3.move_to(RIGHT * 3.3 + UP * 1.5)
        note4 = VGroup(
            caption("Not suppressed. Algebraically annihilated.", color=GOOD),
            caption("Part 1's gradient, with the prediction renamed.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        note4.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note3), FadeIn(note4), ReplacementTransform(card2, card3), run_time=1.1)
        self.wait(beat(2.6))
        self.play(FadeOut(card3), FadeOut(note4), run_time=0.6)

    # -- act two ---------------------------------------------------------------

    def act_two_one_valley(self) -> None:
        self.cluster_axes = Axes(
            x_range=[-4.5, 4.5, 1.5],
            y_range=[-4.5, 4.5, 1.5],
            x_length=4.6,
            y_length=4.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        self.cluster_axes.move_to(LEFT * 3.4 + DOWN * 0.35)
        self.cluster_dots = VGroup(
            *(
                Dot(self.cluster_axes.c2p(x1, x2), radius=0.055, color=ACCENT if y else L2)
                for (x1, x2), y in zip(X_CLUSTER, Y_CLUSTER)
            )
        )
        heading2 = label("ham vs spam, two features", size=20, color=MUTED)
        heading2.next_to(self.cluster_axes, UP, buff=0.25)

        note = caption("Real gradient descent, same two clusters as the convexity snippet:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(
            FadeIn(self.cluster_axes), FadeIn(self.cluster_dots), FadeIn(heading2), FadeIn(note), run_time=1.0
        )
        self.wait(beat(1.0))

        self.step_idx = ValueTracker(0.0)
        boundary = always_redraw(self.cluster_boundary)
        readout = always_redraw(self.cluster_readout)
        self.play(FadeOut(note), Create(boundary), FadeIn(readout), run_time=0.8)
        self.add(boundary, readout)

        train_note = caption("The entire update, every step: g = p - y.", color=INK)
        train_note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(train_note), run_time=0.5)
        self.play(self.step_idx.animate.set_value(len(CLUSTER_LOSS) - 1), run_time=4.0, rate_func=smooth)
        self.wait(beat(1.0))

        verdict = VGroup(
            caption(f"Loss slides from {CLUSTER_LOSS[0]:.3f} to {CLUSTER_LOSS[-1]:.4f}, monotonically.", color=GOOD),
            caption("One valley: downhill is always the right direction.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(train_note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))

        boundary.clear_updaters()
        readout.clear_updaters()
        self.play(
            FadeOut(verdict),
            FadeOut(self.cluster_axes),
            FadeOut(self.cluster_dots),
            FadeOut(heading2),
            FadeOut(boundary),
            FadeOut(readout),
            run_time=0.8,
        )

    def cluster_boundary(self) -> VMobject:
        idx = int(round(self.step_idx.get_value()))
        w, b = CLUSTER_W[idx], CLUSTER_B[idx]
        x_min, x_max = -4.5, 4.5
        if abs(w[1]) < 1e-6:
            points = [(x_min, -4.5), (x_min, 4.5)]
        else:
            points = [(x_min, -(w[0] * x_min + b) / w[1]), (x_max, -(w[0] * x_max + b) / w[1])]
        line = VMobject(color=GOOD, stroke_width=5)
        line.set_points_as_corners([self.cluster_axes.c2p(x, y) for x, y in points])
        return line

    def cluster_readout(self) -> VGroup:
        idx = int(round(self.step_idx.get_value()))
        rows = VGroup(
            label(f"step {idx + 1}", size=21, color=MUTED),
            label(f"loss = {CLUSTER_LOSS[idx]:.4f}", size=26, color=ACCENT),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.13)
        block = panel(rows, pad=0.24)
        block.move_to(RIGHT * 3.6 + UP * 2.0)
        return block

    # -- act three -------------------------------------------------------------

    def act_three_no_floor(self) -> None:
        axes = Axes(
            x_range=[-3, 3, 1],
            y_range=[-0.08, 1.15, 0.5],
            x_length=6.0,
            y_length=3.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(LEFT * 0.2 + DOWN * 0.5)
        ticks = axis_numbers(axes, [-2, -1, 1, 2], buff=0.18, size=20)

        dots = VGroup(
            *(Dot(axes.c2p(x[0], y), radius=0.09, color=ACCENT if y else L2) for x, y in zip(X_SEP, Y_SEP))
        )
        targets = VGroup(
            DashedLine(axes.c2p(-3, 1), axes.c2p(3, 1), color=DIM, stroke_width=2, dash_length=0.1),
            DashedLine(axes.c2p(-3, 0), axes.c2p(3, 0), color=DIM, stroke_width=2, dash_length=0.1),
        )

        note = caption("Four points, perfectly separable. Plain logistic regression:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(axes), FadeIn(ticks), FadeIn(targets), FadeIn(dots), FadeIn(note), run_time=1.0)

        self.axes3 = axes
        self.checkpoints_w = CHECKPOINT_W0
        self.phase = ValueTracker(0.0)
        curve = always_redraw(self.phase_curve)
        readout = always_redraw(self.phase_readout)
        self.play(Create(curve), FadeOut(note), run_time=0.8)
        self.play(FadeIn(readout), run_time=0.5)
        self.add(curve, readout)

        self.play(self.phase.animate.set_value(3.0), run_time=4.0, rate_func=smooth)
        self.wait(beat(1.0))

        verdict = VGroup(
            caption(
                f"w climbs from {CHECKPOINT_W0[0]:.2f} to {CHECKPOINT_W0[-1]:.2f} by step 20000,", color=BAD
            ),
            caption(f"loss keeps falling toward {SEP_LOSS0[-1]:.5f}, and never arrives.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), run_time=0.5)

        curve.clear_updaters()
        readout.clear_updaters()
        self.play(FadeOut(curve), FadeOut(readout), run_time=0.5)

        self.checkpoints_w = CHECKPOINT_W1
        self.phase.set_value(0.0)
        curve2 = always_redraw(self.phase_curve)
        readout2 = always_redraw(self.phase_readout)
        note2 = caption("Add ridge (lambda = 0.01), and the valley gets a floor:", color=GOOD)
        note2.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(note2), Create(curve2), FadeIn(readout2), run_time=0.9)
        self.add(curve2, readout2)
        self.play(self.phase.animate.set_value(3.0), run_time=3.0, rate_func=smooth)
        self.wait(beat(1.0))

        verdict2 = VGroup(
            caption(f"w settles at {CHECKPOINT_W1[-1]:.2f} and stops moving.", color=GOOD),
            caption("Every logistic regression you'll actually use regularizes by default.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict2.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note2), FadeIn(verdict2), run_time=0.7)
        self.wait(beat(2.6))

        curve2.clear_updaters()
        readout2.clear_updaters()
        self.play(
            FadeOut(verdict2), FadeOut(axes), FadeOut(ticks), FadeOut(targets), FadeOut(dots),
            FadeOut(curve2), FadeOut(readout2), run_time=0.8,
        )

    def phase_curve(self) -> VMobject:
        phase = self.phase.get_value()
        w = float(np.interp(phase, [0, 1, 2, 3], self.checkpoints_w))
        curve = VMobject(color=L2, stroke_width=5)
        curve.set_points_as_corners([self.axes3.c2p(x, sigmoid(w * x)) for x in np.linspace(-3, 3, 200)])
        return curve

    def phase_readout(self) -> VGroup:
        phase = self.phase.get_value()
        w = float(np.interp(phase, [0, 1, 2, 3], self.checkpoints_w))
        step = CHECKPOINT_STEPS[int(round(np.clip(phase, 0, 3)))]
        rows = VGroup(
            label(f"step {step}", size=20, color=MUTED),
            label(f"w = {w:.2f}", size=25, color=INK),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        block = panel(rows, pad=0.22)
        block.move_to(RIGHT * 4.7 + UP * 2.4)
        return block


# ---------------------------------------------------------------------------
# Scene three: softmax, the vote goes multiclass.
#
# SCORES4 is the post's own four-class demo, and sigmoid is verified against
# 2-class softmax at the exact scores the post's comparison table checks.
# ---------------------------------------------------------------------------


def softmax(s):
    e = np.exp(s - s.max())
    return e / e.sum()


CLASSES = ["promo", "social", "updates", "forums"]
CLASS_COLORS = [L2, GOOD, ACCENT, L1]
SCORES4 = np.array([2.0, 1.0, 0.1, -1.0])
PROBS4 = softmax(SCORES4)


class SoftmaxGoesMulticlass(BlogScene):
    """Every class gets its own line, and sigmoid turns out to be a special case.

    The bar heights are `SCORES4` and its softmax, computed once at import
    time from the post's own demo numbers. The closing sweep evaluates
    `sigmoid` and 2-class `softmax` at the same score and shows the digits
    agreeing rather than asserting it.
    """

    def construct(self) -> None:
        heading = title("The vote goes multiclass")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.0)

        opening = caption("Route the email: promotions, social, updates, forums. Four verdicts, not one.")
        opening.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(opening), run_time=0.8)
        self.wait(beat(1.8))

        self.act_one_the_vote(opening)
        self.act_two_pin_one_class()
        self.act_three_the_sweep()

        closing = label("Softmax + cross-entropy: the machine the rest of the series is built from.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.6))
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act one ---------------------------------------------------------------

    def act_one_the_vote(self, opening) -> None:
        score_axes = Axes(
            x_range=[-0.5, 3.5, 1],
            y_range=[-1.6, 2.6, 1],
            x_length=6.0,
            y_length=3.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        score_axes.move_to(LEFT * 0.2 + UP * 0.2)
        self.score_axes = score_axes
        zero_line = DashedLine(
            score_axes.c2p(-0.5, 0), score_axes.c2p(3.5, 0), color=DIM, stroke_width=2, dash_length=0.1
        )
        score_bars = self.bars(score_axes, SCORES4, baseline=0.0)
        score_labels = self.value_labels(score_axes, SCORES4, "{:+.1f}")
        class_labels = self.class_labels(score_axes)

        note = caption("Every class gets its own line, K opinion polls run in parallel:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(opening), FadeIn(note), run_time=0.6)
        self.play(
            FadeIn(score_axes), FadeIn(zero_line), FadeIn(class_labels),
            *(Create(bar) for bar in score_bars), FadeIn(score_labels), run_time=1.2,
        )
        self.wait(beat(1.4))

        formula = tex(
            r'P("class" k) = e^(s_k) / (sum_(j=1)^K e^(s_j))', font_size=27, color=INK
        )
        card = panel(formula, pad=0.26)
        card.move_to(RIGHT * 3.9 + UP * 2.1)
        note2 = caption("Exponentiate for positivity, normalize so the vote sums to one:", color=INK)
        note2.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(note2), FadeIn(card), run_time=0.9)
        self.wait(beat(1.6))

        prob_axes = Axes(
            x_range=[-0.5, 3.5, 1],
            y_range=[0, 0.85, 0.25],
            x_length=6.0,
            y_length=3.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        prob_axes.move_to(LEFT * 0.2 + UP * 0.2)
        prob_bars = self.bars(prob_axes, PROBS4, baseline=0.0)
        prob_labels = self.value_labels(prob_axes, PROBS4, "{:.3f}")

        note3 = caption("Four unbounded scores become four probabilities that sum to one:", color=GOOD)
        note3.to_edge(DOWN, buff=0.4)
        self.play(
            FadeOut(note2), FadeIn(note3), FadeOut(card),
            ReplacementTransform(score_axes, prob_axes),
            ReplacementTransform(score_bars, prob_bars),
            ReplacementTransform(score_labels, prob_labels),
            FadeOut(zero_line),
            run_time=1.8,
        )
        self.wait(beat(1.2))

        verdict = VGroup(
            caption(f"sum = {PROBS4.sum():.6f}", color=GOOD),
            caption(f"cross-entropy if 'promo' is true = {-np.log(PROBS4[0]):.3f}", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note3), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.4))

        self.play(
            FadeOut(verdict), FadeOut(prob_axes), FadeOut(prob_bars), FadeOut(prob_labels),
            FadeOut(class_labels), run_time=0.8,
        )

    # -- act two ---------------------------------------------------------------

    def act_two_pin_one_class(self) -> None:
        steps = [
            (r'P("spam") = e^s / (e^s + e^0)', INK, "Pin the second class's score at zero:"),
            (r"= e^s / (e^s + 1)", INK, "e^0 = 1, and only score *differences* matter anyway:"),
            (r"= 1 / (1+e^(-s)) = sigma(s)", GOOD, "Divide through by e^s, and there is the sigmoid:"),
        ]
        card = None
        note = None
        for formula, color, caption_text in steps:
            new_card = panel(tex(formula, font_size=30, color=color), pad=0.28)
            new_card.move_to(UP * 0.5)
            new_note = caption(caption_text, color=color if color != INK else INK)
            new_note.to_edge(DOWN, buff=0.4)
            if card is None:
                self.play(FadeIn(new_note), FadeIn(new_card), run_time=0.9)
            else:
                self.play(FadeOut(note), FadeIn(new_note), ReplacementTransform(card, new_card), run_time=1.0)
            self.wait(beat(1.8))
            card, note = new_card, new_note

        tagline = caption("Sigmoid isn't a special function. It's softmax with two classes.", color=GOOD)
        tagline.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(tagline), run_time=0.7)
        self.wait(beat(2.4))
        self.play(FadeOut(card), FadeOut(tagline), run_time=0.6)

    # -- act three ---------------------------------------------------------------

    def act_three_the_sweep(self) -> None:
        axes = Axes(
            x_range=[-3.5, 3.5, 1],
            y_range=[-0.08, 1.15, 0.5],
            x_length=6.4,
            y_length=3.6,
            tips=False,
            axis_config={"stroke_color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(LEFT * 0.2 + DOWN * 0.3)
        ticks = axis_numbers(axes, [-3, -2.3, 2.3, 3], buff=0.18, size=18)
        curve = VMobject(color=L2, stroke_width=5)
        curve.set_points_as_corners([axes.c2p(s, sigmoid(s)) for s in np.linspace(-3.5, 3.5, 200)])

        note = caption("Sweep the score and compare sigma(s) against 2-class softmax at [s, 0]:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(axes), FadeIn(ticks), Create(curve), FadeIn(note), run_time=1.2)

        self.axes_sweep = axes
        self.score = ValueTracker(-3.0)
        marker = always_redraw(self.sweep_marker)
        readout = always_redraw(self.sweep_readout)
        self.play(FadeIn(marker), FadeIn(readout), run_time=0.6)
        self.add(marker, readout)

        for target in (0.0, 2.3, -3.0):
            self.play(self.score.animate.set_value(target), run_time=2.0, rate_func=smooth)
            self.wait(beat(1.0))

        marker.clear_updaters()
        readout.clear_updaters()
        verdict = VGroup(
            caption("Every digit agrees, at every score.", color=GOOD),
            caption("Softmax with two classes IS the sigmoid, not merely similar to it.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))
        self.play(
            FadeOut(verdict), FadeOut(axes), FadeOut(ticks), FadeOut(curve),
            FadeOut(marker), FadeOut(readout), run_time=0.8,
        )

    def sweep_marker(self) -> VGroup:
        s = self.score.get_value()
        point = self.axes_sweep.c2p(s, sigmoid(s))
        return VGroup(
            DashedLine(
                self.axes_sweep.c2p(s, self.axes_sweep.y_range[0]), point, color=DIM, stroke_width=2, dash_length=0.08
            ),
            Dot(point, radius=0.09, color=ACCENT),
        )

    def sweep_readout(self) -> VGroup:
        s = self.score.get_value()
        two_class = softmax(np.array([s, 0.0]))[0]
        rows = VGroup(
            label(f"s = {s:+.2f}", size=22, color=INK),
            label(f"sigma(s)          = {sigmoid(s):.8f}", size=21, color=L2),
            label(f"softmax([s,0])[0] = {two_class:.8f}", size=21, color=ACCENT),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        block = panel(rows, pad=0.24)
        block.move_to(RIGHT * 4.0 + UP * 2.4)
        return block

    # -- shared pieces ---------------------------------------------------------

    def bars(self, axes: Axes, values: np.ndarray, baseline: float) -> VGroup:
        bars = VGroup()
        for k, (value, color) in enumerate(zip(values, CLASS_COLORS)):
            corner = axes.c2p(k, baseline)
            top = axes.c2p(k, value)
            rect = Rectangle(
                width=0.7,
                height=max(abs(top[1] - corner[1]), 0.02),
                fill_color=color,
                fill_opacity=0.85,
                stroke_width=0,
            )
            rect.move_to([corner[0], (top[1] + corner[1]) / 2, 0])
            bars.add(rect)
        return bars

    def value_labels(self, axes: Axes, values: np.ndarray, fmt: str) -> VGroup:
        labels = VGroup()
        for k, value in enumerate(values):
            top = axes.c2p(k, max(value, 0.0))
            text = label(fmt.format(value), size=20, color=CLASS_COLORS[k])
            text.next_to(top, UP, buff=0.12)
            labels.add(text)
        return labels

    def class_labels(self, axes: Axes) -> VGroup:
        labels = VGroup()
        bottom = axes.y_range[0]
        for k, name in enumerate(CLASSES):
            text = caption(name, color=MUTED).scale(0.68)
            text.next_to(axes.c2p(k, bottom), DOWN, buff=0.25)
            labels.add(text)
        return labels
