"""Scenes for post 0003, "Embedding drift: Part 2 - How are they trained?".

Render with (from the repo root):

    manim/render.sh 0003

Three silent, loopable figures for the post's three claims: the training
objective is a multiple-choice exam whose temperature decides which mistakes
matter, contrastive training is a tug-of-war between alignment and
uniformity, and the whole objective is blind to the map's orientation.

Everything on screen is computed, not typed: the softmax weights come from
the candidates' actual angles, the tug-of-war is a real gradient descent on
those angles, and the similarity table in the last scene is recomputed from
the rotating coordinates on every single frame.
"""

from __future__ import annotations

import numpy as np
from manim import (
    DEGREES,
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Arrow,
    Circle,
    Create,
    Dot,
    FadeIn,
    FadeOut,
    Flash,
    GrowFromCenter,
    Line,
    Polygon,
    Rectangle,
    VGroup,
    ValueTracker,
    Write,
    always_redraw,
    linear,
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
    beat,
    caption,
    label,
    title,
)
from mfblog.typst import tex


def unit(degrees: float) -> np.ndarray:
    """A unit vector at the given angle, as a Manim point."""
    radians = degrees * DEGREES
    return np.array([np.cos(radians), np.sin(radians), 0.0])


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max()
    weights = np.exp(shifted)
    return weights / weights.sum()


def trajectory_at(trajectory: np.ndarray, step: float) -> np.ndarray:
    """Read a precomputed trajectory at a fractional step, so a tracker can
    scrub through a simulation the way it scrubs through a formula."""
    last = len(trajectory) - 1
    step = float(np.clip(step, 0.0, last))
    low = int(np.floor(step))
    high = min(low + 1, last)
    frac = step - low
    return trajectory[low] * (1 - frac) + trajectory[high] * frac


# ---------------------------------------------------------------------------
# The objective: one query, one true match, five decoys, and a temperature
# that decides how much each wrong answer is allowed to matter.
# ---------------------------------------------------------------------------

EXAM_CENTER = LEFT * 3.7 + DOWN * 0.05
EXAM_RADIUS = 1.9
QUERY_ANGLE = 90.0

# (display name, formula name, starting angle). The first entry is the true
# match; the second is deliberately placed almost as close, because the whole
# point of the scene is what the objective does about near-misses.
CANDIDATES = (
    ("match", "p", 112.0),
    ("decoy 1", "n_1", 66.0),
    ("decoy 2", "n_2", 150.0),
    ("decoy 3", "n_3", 205.0),
    ("decoy 4", "n_4", 262.0),
    ("decoy 5", "n_5", 320.0),
)

DESCENT_TAU = 0.15
DESCENT_STEPS = 60
DESCENT_RATE = 2.5  # degrees of rotation per unit of gradient

BAR_LEFT = 1.95  # where every bar starts, so the rows read as a chart
BAR_WIDTH = 2.45
BAR_TOP = 1.85
BAR_GAP = 0.56

# The legend swatches in act three are drawn as short lines; these are their
# endpoints, in local coordinates.
SWATCH_LEFT = np.array([-0.16, 0.0, 0.0])
SWATCH_RIGHT = np.array([0.16, 0.0, 0.0])


def exam_scores(angles: np.ndarray) -> np.ndarray:
    """Cosine similarity to the query for unit vectors at these angles."""
    return np.cos((angles - QUERY_ANGLE) * DEGREES)


def exam_weights(angles: np.ndarray, tau: float) -> np.ndarray:
    return softmax(exam_scores(angles) / tau)


def exam_descent(angles: np.ndarray, tau: float, steps: int, rate: float) -> np.ndarray:
    """Gradient descent of the InfoNCE loss on the candidates' angles.

    With unit vectors the only free parameter is the angle, and the gradient
    is exactly the post's claim: the derivative for candidate ``i`` carries
    the factor ``w_i - [i is the positive]``, so a decoy is pushed away in
    proportion to its softmax weight and an ignored decoy is barely touched.
    The query is held still; letting it move too is realistic but makes the
    picture much harder to read.
    """
    theta = np.asarray(angles, dtype=float).copy()
    trajectory = [theta.copy()]
    for _ in range(steps):
        delta = (theta - QUERY_ANGLE) * DEGREES
        weights = softmax(np.cos(delta) / tau)
        target = np.zeros_like(theta)
        target[0] = 1.0  # index 0 is the positive
        gradient = (weights - target) * (-np.sin(delta) / tau)
        theta = theta - rate * gradient
        trajectory.append(theta.copy())
    return np.array(trajectory)


class TheExamAndItsTemperature(BlogScene):
    """InfoNCE is softmax cross-entropy over candidates, and it shows.

    Act one grades one exam. Act two sweeps the temperature and watches the
    grading go from "everyone is a little wrong" to "this is entirely about
    the near-miss". Act three runs the gradient and lets the near-miss walk
    away while the irrelevant decoys stand still.
    """

    def construct(self) -> None:
        self.tau = ValueTracker(np.log(0.30))
        self.step = ValueTracker(0.0)
        self.trajectory = exam_descent(
            np.array([angle for _, _, angle in CANDIDATES]),
            DESCENT_TAU,
            DESCENT_STEPS,
            DESCENT_RATE,
        )

        heading = title("Training is a multiple-choice exam")
        heading.to_edge(UP, buff=0.35)
        stage = self.build_stage()
        self.play(Write(heading), FadeIn(stage), run_time=1.3)

        query = Arrow(
            EXAM_CENTER,
            EXAM_CENTER + EXAM_RADIUS * unit(QUERY_ANGLE),
            buff=0,
            color=ACCENT,
            stroke_width=5,
            max_tip_length_to_length_ratio=0.13,
        )
        # Parked to the right of the tip: the match ends up almost exactly on
        # the query, and a tag directly above would be sat on by p's.
        query_tag = tex("q", font_size=32, color=ACCENT)
        query_tag.next_to(query.get_end(), RIGHT, buff=0.1)
        self.play(GrowFromCenter(query), FadeIn(query_tag), run_time=0.8)

        dots = always_redraw(self.build_dots)
        tags = always_redraw(self.build_tags)
        self.play(FadeIn(dots), FadeIn(tags), run_time=1.0)
        prompt = caption("One true match. Five decoys. Point to the match.")
        prompt.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(prompt), run_time=0.7)
        self.wait(beat(1.6))

        formula = tex(
            r"cal(L) = -log (exp(q dot p \/ tau)) / (sum_j exp(q dot c_j \/ tau))",
            font_size=26,
            color=INK,
        )
        formula.move_to(RIGHT * 3.35 + DOWN * 1.95)
        bars = always_redraw(self.build_bars)
        self.play(FadeOut(prompt), FadeIn(formula), FadeIn(bars), run_time=1.0)
        explain = caption("Softmax over the candidates. The loss is the match's share.")
        explain.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(explain), run_time=0.7)
        self.wait(beat(2.2))

        self.act_two_temperature(explain)
        self.act_three_gradient(dots)

        closing = label("The near-misses do all the teaching.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.6))
        dots.clear_updaters()
        tags.clear_updaters()
        bars.clear_updaters()
        self.play(
            FadeOut(VGroup(closing, stage, query, query_tag, dots, tags, bars, formula)),
            run_time=1.0,
        )
        self.wait(beat(0.4))

    # -- act two ---------------------------------------------------------------

    def act_two_temperature(self, explain) -> None:
        note = caption("Turn the temperature down and watch where the attention goes.", color=ACCENT)
        note.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(explain), FadeIn(note), run_time=0.7)
        self.play(self.tau.animate.set_value(np.log(0.04)), run_time=3.4, rate_func=smooth)
        sharp = VGroup(
            caption("Small \u03c4: only the hardest confusion is left on the page.", color=ACCENT),
            caption("Every gram of capacity goes to telling p from n\u2081.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        sharp.to_edge(DOWN, buff=0.3)
        self.play(FadeOut(note), FadeIn(sharp), run_time=0.7)
        self.wait(beat(2.4))

        # Retire the caption *before* the sweep, so the words on screen never
        # contradict the τ readout above them.
        self.play(FadeOut(sharp), run_time=0.5)
        self.play(self.tau.animate.set_value(np.log(1.6)), run_time=3.4, rate_func=smooth)
        soft = VGroup(
            caption("Large \u03c4: everyone is a little bit wrong, nobody in particular.", color=MUTED),
            caption("The gradient stops caring which decoy was dangerous.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        soft.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(soft), run_time=0.7)
        self.wait(beat(2.2))

        self.play(
            FadeOut(soft), self.tau.animate.set_value(np.log(DESCENT_TAU)), run_time=1.6
        )

    # -- act three -------------------------------------------------------------

    def act_three_gradient(self, dots) -> None:
        arrows = always_redraw(self.build_forces)
        legend = VGroup(
            VGroup(
                Line(SWATCH_LEFT, SWATCH_RIGHT, color=GOOD, stroke_width=4),
                caption("pull the match in", color=GOOD).scale(0.85),
            ).arrange(RIGHT, buff=0.18),
            VGroup(
                Line(SWATCH_LEFT, SWATCH_RIGHT, color=BAD, stroke_width=4),
                caption("push each decoy away, by its weight", color=BAD).scale(0.85),
            ).arrange(RIGHT, buff=0.18),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        legend.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(arrows), FadeIn(legend), run_time=0.9)
        self.wait(beat(2.2))

        self.play(self.step.animate.set_value(DESCENT_STEPS), run_time=7.0, rate_func=linear)
        self.wait(beat(0.8))

        arrows.clear_updaters()
        verdict = VGroup(
            caption("n\u2081 was shoved across the map; n\u2084 never moved at all.", color=INK),
            caption("The decoys nobody could confuse contributed nothing.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.3)
        self.play(FadeOut(arrows), FadeOut(legend), FadeIn(verdict), run_time=0.8)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces ----------------------------------------------------------------

    def angles(self) -> np.ndarray:
        return trajectory_at(self.trajectory, self.step.get_value())

    def build_stage(self) -> VGroup:
        circle = Circle(radius=EXAM_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        circle.move_to(EXAM_CENTER)
        # Parked above the ring: n₄ sits at the bottom of it, and the corner
        # below is where every caption in this scene lands.
        note = caption("candidates live on the sphere", color=DIM).scale(0.8)
        note.move_to(EXAM_CENTER + UP * (EXAM_RADIUS + 0.85))
        return VGroup(circle, note)

    def build_dots(self) -> VGroup:
        angles = self.angles()
        dots = VGroup()
        for index, angle in enumerate(angles):
            color = GOOD if index == 0 else L2
            dots.add(
                Dot(
                    EXAM_CENTER + EXAM_RADIUS * unit(angle),
                    radius=0.095 if index == 0 else 0.08,
                    color=color,
                )
            )
        return dots

    def build_tags(self) -> VGroup:
        angles = self.angles()
        tags = VGroup()
        for index, angle in enumerate(angles):
            _, symbol, _ = CANDIDATES[index]
            color = GOOD if index == 0 else L2
            tag = tex(symbol, font_size=26, color=color)
            tag.move_to(EXAM_CENTER + (EXAM_RADIUS + 0.38) * unit(angle))
            tags.add(tag)
        return tags

    def build_bars(self) -> VGroup:
        angles = self.angles()
        tau = float(np.exp(self.tau.get_value()))
        weights = exam_weights(angles, tau)
        loss = -float(np.log(max(weights[0], 1e-12)))

        rows = VGroup()
        for index, weight in enumerate(weights):
            name, _, _ = CANDIDATES[index]
            color = GOOD if index == 0 else L2
            y = BAR_TOP - index * BAR_GAP
            track = Rectangle(
                width=BAR_WIDTH, height=0.24, stroke_color=DIM, stroke_width=1, fill_opacity=0
            )
            track.move_to([BAR_LEFT + BAR_WIDTH / 2, y, 0])
            fill = Rectangle(
                width=max(BAR_WIDTH * float(weight), 0.004),
                height=0.24,
                stroke_width=0,
                fill_color=color,
                fill_opacity=0.9,
            )
            fill.move_to([BAR_LEFT + BAR_WIDTH * float(weight) / 2, y, 0])
            tag = label(name, size=22, color=color if index == 0 else MUTED)
            tag.move_to([BAR_LEFT - 0.18 - tag.width / 2, y, 0])
            value = label(f"{weight:.0%}", size=22, color=color)
            value.move_to([BAR_LEFT + BAR_WIDTH + 0.25 + value.width / 2, y, 0])
            rows.add(VGroup(track, fill, tag, value))

        readout = VGroup(
            VGroup(
                label("\u03c4 =", size=26, color=MUTED),
                label(f"{tau:.2f}", size=30, color=ACCENT),
            ).arrange(RIGHT, buff=0.18),
            VGroup(
                label("loss =", size=26, color=MUTED),
                label(f"{loss:.2f}", size=30, color=INK),
            ).arrange(RIGHT, buff=0.18),
        ).arrange(RIGHT, buff=0.75)
        readout.move_to([BAR_LEFT + BAR_WIDTH / 2, BAR_TOP + 0.75, 0])
        return VGroup(rows, readout)

    def build_forces(self) -> VGroup:
        """One tangential arrow per candidate, scaled by its softmax weight."""
        angles = self.angles()
        tau = float(np.exp(self.tau.get_value()))
        weights = exam_weights(angles, tau)

        arrows = VGroup()
        for index, (angle, weight) in enumerate(zip(angles, weights)):
            positive = index == 0
            # The positive is pulled in with strength 1 - w_p; every decoy is
            # pushed out with strength w_i. That is the gradient, not a mood.
            strength = (1 - weight) if positive else weight
            length = 1.35 * float(strength)
            if length < 0.045:
                continue
            delta = (angle - QUERY_ANGLE) * DEGREES
            # Tangent, pointing the way this candidate is actually being moved.
            toward_query = -1.0 if positive else 1.0
            tangent = toward_query * (1.0 if np.sin(delta) >= 0 else -1.0)
            direction = tangent * np.array(
                [-np.sin(angle * DEGREES), np.cos(angle * DEGREES), 0.0]
            )
            start = EXAM_CENTER + (EXAM_RADIUS + 0.16) * unit(angle)
            arrows.add(
                Arrow(
                    start,
                    start + length * direction,
                    buff=0,
                    color=GOOD if positive else BAD,
                    stroke_width=5,
                    max_tip_length_to_length_ratio=0.35,
                )
            )
        return arrows


# ---------------------------------------------------------------------------
# Alignment and uniformity: the two forces every contrastive loss decomposes
# into, run as an actual gradient descent.
# ---------------------------------------------------------------------------

TUG_CENTER = LEFT * 3.5 + DOWN * 0.3
TUG_RADIUS = 2.1
TUG_STEPS = 140
TUG_RATE = 0.09
UNIFORMITY_T = 2.0
# How hard the spreading force pulls relative to the pairing force. Only the
# ratio matters, and it is a modelling choice: this one lets both terms
# visibly get most of what they want inside a few seconds of descent.
UNIFORM_WEIGHT = 3.0

PAIR_COLORS = ("#3f9fe0", "#e74c3c", "#2ecc71", "#f5c542", "#b07be0", "#e08a3f")
START_ANGLES = np.array(
    [18.0, 128.0, 62.0, 204.0, 96.0, 300.0, 152.0, 336.0, 238.0, 44.0, 274.0, 190.0]
)
PAIRS = tuple((2 * k, 2 * k + 1) for k in range(len(PAIR_COLORS)))


def alignment_loss(theta: np.ndarray) -> float:
    """Mean squared distance between the two halves of each positive pair."""
    return float(np.mean([2 - 2 * np.cos(theta[i] - theta[j]) for i, j in PAIRS]))


def uniformity_loss(theta: np.ndarray) -> float:
    """Wang & Isola's log of the mean Gaussian potential over all pairs."""
    squared = 2 - 2 * np.cos(theta[:, None] - theta[None, :])
    potential = np.exp(-UNIFORMITY_T * squared)
    off_diagonal = ~np.eye(len(theta), dtype=bool)
    return float(np.log(potential[off_diagonal].mean()))


def tug_descent(theta0: np.ndarray, align: float, uniform: float) -> np.ndarray:
    """Gradient descent of ``align * alignment + uniform * uniformity``.

    Both gradients are the analytic ones; the shared positive constants are
    folded into the learning rate, since only their ratio changes the picture.
    """
    theta = theta0.copy()
    trajectory = [theta.copy()]
    for _ in range(TUG_STEPS):
        gradient = np.zeros_like(theta)
        if align:
            for i, j in PAIRS:
                pull = np.sin(theta[i] - theta[j])
                gradient[i] += align * pull
                gradient[j] -= align * pull
        if uniform:
            difference = theta[:, None] - theta[None, :]
            weights = np.exp(-UNIFORMITY_T * (2 - 2 * np.cos(difference)))
            np.fill_diagonal(weights, 0.0)
            gradient += uniform * (
                -UNIFORMITY_T * (weights * np.sin(difference)).sum(axis=1) / weights.sum()
            )
        theta = theta - TUG_RATE * gradient
        trajectory.append(theta.copy())
    return np.array(trajectory)


class AlignmentAndUniformity(BlogScene):
    """Every contrastive objective is a tug-of-war, and both ends matter.

    Positives are drawn as coloured couples joined by a chord. Alignment
    alone lets the map fold up; uniformity alone spreads it out and tears the
    couples apart; together they produce the thing you actually wanted.
    """

    def construct(self) -> None:
        self.step = ValueTracker(0.0)
        self.trajectory = tug_descent(np.radians(START_ANGLES), align=0.0, uniform=0.0)

        heading = title("Two forces, one map")
        heading.to_edge(UP, buff=0.35)
        circle = Circle(radius=TUG_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        circle.move_to(TUG_CENTER)
        self.play(Write(heading), FadeIn(circle), run_time=1.2)

        self.dots = always_redraw(self.build_dots)
        self.chords = always_redraw(self.build_chords)
        self.readout = always_redraw(self.build_readout)
        self.play(FadeIn(self.chords), FadeIn(self.dots), run_time=1.0)
        intro = caption("Each colour is a positive pair: two things that should land together.")
        intro.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(intro), FadeIn(self.readout), run_time=0.8)
        self.wait(beat(2.2))
        self.play(FadeOut(intro), run_time=0.5)

        self.run_regime(
            "Alignment only",
            GOOD,
            align=1.0,
            uniform=0.0,
            lesson=(
                "The couples meet. Nothing anywhere is pushing them apart,",
                "so the map may as well fold up completely.",
            ),
        )
        self.show_collapse()
        self.run_regime(
            "Uniformity only",
            L2,
            align=0.0,
            uniform=UNIFORM_WEIGHT,
            lesson=(
                "The sphere is used evenly — and the couples are strangers.",
                "Capacity without meaning.",
            ),
        )
        self.run_regime(
            "Both, together",
            ACCENT,
            align=1.0,
            uniform=UNIFORM_WEIGHT,
            lesson=(
                "Couples meet, and the couples spread out.",
                "The map is the tension between the two.",
            ),
        )

        closing = label("A good space is a truce, not a victory.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.6))
        for mobject in (self.dots, self.chords, self.readout):
            mobject.clear_updaters()
        self.play(
            FadeOut(VGroup(closing, circle, self.dots, self.chords, self.readout)), run_time=1.0
        )
        self.wait(beat(0.4))

    # -- one regime ------------------------------------------------------------

    def run_regime(self, name: str, color: str, align: float, uniform: float, lesson) -> None:
        self.trajectory = tug_descent(np.radians(START_ANGLES), align=align, uniform=uniform)
        self.step.set_value(0.0)

        banner = panel(VGroup(label(name, size=26, color=color)), pad=0.2, stroke=color)
        banner.move_to(RIGHT * 3.5 + UP * 2.5)
        self.play(FadeIn(banner), run_time=0.6)
        self.play(self.step.animate.set_value(TUG_STEPS), run_time=4.6, rate_func=smooth)
        self.wait(beat(0.6))

        verdict = VGroup(*(caption(line, color=INK if i == 0 else MUTED) for i, line in enumerate(lesson)))
        verdict.arrange(DOWN, buff=0.14).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))
        self.play(FadeOut(verdict), FadeOut(banner), run_time=0.6)

    def show_collapse(self) -> None:
        """Alignment alone cannot tell a good map from the constant one."""
        collapsed = np.full(len(START_ANGLES), float(np.radians(70.0)))
        start = self.trajectory[-1]
        self.trajectory = np.array(
            [start * (1 - t) + collapsed * t for t in np.linspace(0, 1, TUG_STEPS + 1)]
        )
        self.step.set_value(0.0)

        warning = panel(
            VGroup(label("and this scores exactly the same", size=24, color=BAD)),
            pad=0.2,
            stroke=BAD,
        )
        warning.move_to(RIGHT * 3.5 + UP * 2.5)
        self.play(FadeIn(warning), run_time=0.6)
        self.play(self.step.animate.set_value(TUG_STEPS), run_time=2.6, rate_func=smooth)
        self.play(
            Flash(TUG_CENTER + TUG_RADIUS * unit(70.0), color=BAD, line_length=0.25, num_lines=16),
            run_time=0.7,
        )
        verdict = VGroup(
            caption("Every pair is together, so alignment is perfectly happy.", color=BAD),
            caption("Everything is similar to everything. The map says nothing.", color=BAD),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(verdict), run_time=0.7)
        self.wait(beat(3.0))
        self.play(FadeOut(verdict), FadeOut(warning), run_time=0.6)

    # -- pieces ----------------------------------------------------------------

    def angles(self) -> np.ndarray:
        return trajectory_at(self.trajectory, self.step.get_value())

    def point(self, angle: float) -> np.ndarray:
        return TUG_CENTER + TUG_RADIUS * np.array([np.cos(angle), np.sin(angle), 0.0])

    def build_dots(self) -> VGroup:
        angles = self.angles()
        dots = VGroup()
        for index, angle in enumerate(angles):
            dots.add(Dot(self.point(angle), radius=0.085, color=PAIR_COLORS[index // 2]))
        return dots

    def build_chords(self) -> VGroup:
        angles = self.angles()
        chords = VGroup()
        for i, j in PAIRS:
            chords.add(
                Line(
                    self.point(angles[i]),
                    self.point(angles[j]),
                    color=PAIR_COLORS[i // 2],
                    stroke_width=2.5,
                    stroke_opacity=0.55,
                )
            )
        return chords

    def build_readout(self) -> VGroup:
        angles = self.angles()
        rows = VGroup(
            VGroup(
                label("alignment", size=24, color=MUTED),
                label(f"{alignment_loss(angles):.2f}", size=28, color=GOOD),
            ).arrange(RIGHT, buff=0.22),
            VGroup(
                label("uniformity", size=24, color=MUTED),
                label(f"{uniformity_loss(angles):+.2f}", size=28, color=L2),
            ).arrange(RIGHT, buff=0.22),
            caption("lower is better, for both", color=DIM).scale(0.8),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        return panel(rows).move_to(RIGHT * 3.5 + DOWN * 0.6)


# ---------------------------------------------------------------------------
# The objective only ever sees dot products, so it cannot see orientation.
# ---------------------------------------------------------------------------

SPIN_RADIUS = 2.0
SPIN_CENTER = LEFT * 3.6 + DOWN * 0.25
SPIN_POINTS = (("a", 22.0), ("b", 78.0), ("c", 156.0), ("d", 262.0))
SPIN_PAIRS = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3))
RUN_B_TURN = 137.0


class RotationIsInvisible(BlogScene):
    """Rotate the whole map and the training loss cannot tell.

    The similarity table on the right is recomputed from the dots' live
    coordinates on every frame, so watching it hold still while the
    coordinate readout scrambles is a demonstration rather than a promise.
    """

    def construct(self) -> None:
        self.turn = ValueTracker(0.0)

        heading = title("The objective only sees dot products")
        heading.to_edge(UP, buff=0.35)
        circle = Circle(radius=SPIN_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        circle.move_to(SPIN_CENTER)
        axes = VGroup(
            Line(
                SPIN_CENTER + LEFT * (SPIN_RADIUS + 0.45),
                SPIN_CENTER + RIGHT * (SPIN_RADIUS + 0.45),
                color=DIM,
                stroke_width=1.5,
                stroke_opacity=0.6,
            ),
            Line(
                SPIN_CENTER + DOWN * (SPIN_RADIUS + 0.45),
                SPIN_CENTER + UP * (SPIN_RADIUS + 0.45),
                color=DIM,
                stroke_width=1.5,
                stroke_opacity=0.6,
            ),
        )
        self.play(Write(heading), FadeIn(circle), FadeIn(axes), run_time=1.3)

        shape = always_redraw(self.build_shape)
        dots = always_redraw(self.build_dots)
        tags = always_redraw(self.build_tags)
        self.play(Create(shape), FadeIn(dots), FadeIn(tags), run_time=1.2)

        table = always_redraw(self.build_table)
        coordinates = always_redraw(self.build_coordinates)
        self.play(FadeIn(table), FadeIn(coordinates), run_time=0.9)
        self.wait(beat(1.8))

        spin = caption("Now turn the whole map. Watch both columns.", color=ACCENT)
        spin.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(spin), run_time=0.6)
        self.play(self.turn.animate.set_value(210.0), run_time=5.0, rate_func=smooth)
        self.wait(beat(0.8))
        self.play(self.turn.animate.set_value(430.0), run_time=4.4, rate_func=smooth)

        verdict = VGroup(
            caption("Every coordinate changed. Not one similarity did.", color=INK),
            tex(r"(Q x) dot (Q y) = x dot y", font_size=30, color=ACCENT),
        ).arrange(DOWN, buff=0.2)
        verdict.to_edge(DOWN, buff=0.3)
        self.play(FadeOut(spin), FadeIn(verdict), run_time=0.8)
        self.wait(beat(2.8))

        for mobject in (shape, dots, tags, table, coordinates):
            mobject.clear_updaters()
        self.play(
            FadeOut(VGroup(shape, dots, tags, table, coordinates, circle, axes, verdict)),
            run_time=0.9,
        )
        self.act_two_two_runs(heading)

    # -- act two ---------------------------------------------------------------

    def act_two_two_runs(self, heading) -> None:
        subtitle = caption("Same recipe, same data, two runs.", color=MUTED)
        subtitle.next_to(heading, DOWN, buff=0.3)
        self.play(FadeIn(subtitle), run_time=0.6)

        left = self.run_panel(LEFT * 3.5 + DOWN * 0.2, 0.0, "run A", L2)
        right = self.run_panel(RIGHT * 3.5 + DOWN * 0.2, RUN_B_TURN, "run B", ACCENT)
        self.play(FadeIn(left), run_time=0.8)
        self.play(FadeIn(right), run_time=0.8)

        # Both columns are read off the same geometry the panels were drawn
        # from, so the agreement and the disagreement are both real.
        a_run_a, a_run_b = unit(SPIN_POINTS[0][1]), unit(SPIN_POINTS[0][1] + RUN_B_TURN)
        b_run_a, b_run_b = unit(SPIN_POINTS[1][1]), unit(SPIN_POINTS[1][1] + RUN_B_TURN)
        same = VGroup(
            label(f"cos(a, b) = {np.dot(a_run_a[:2], b_run_a[:2]):+.3f}", size=24, color=GOOD),
            label("=", size=22, color=MUTED),
            label(f"cos(a, b) = {np.dot(a_run_b[:2], b_run_b[:2]):+.3f}", size=24, color=GOOD),
        ).arrange(RIGHT, buff=0.3)
        differ = VGroup(
            label(f"a = ({a_run_a[0]:+.2f}, {a_run_a[1]:+.2f})", size=24, color=L2),
            label("≠", size=22, color=MUTED),
            label(f"a = ({a_run_b[0]:+.2f}, {a_run_b[1]:+.2f})", size=24, color=ACCENT),
        ).arrange(RIGHT, buff=0.3)
        rows = VGroup(same, differ).arrange(DOWN, buff=0.24)
        block = panel(rows).move_to(DOWN * 2.75)
        self.play(FadeIn(block), run_time=0.8)
        self.wait(beat(2.6))

        closing = label("Nothing in training picks which way is up.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), FadeOut(subtitle), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(1.4))
        warning = caption("So never compare vectors across runs. There is nothing to compare.", color=BAD)
        warning.to_edge(DOWN, buff=0.3)
        self.play(FadeOut(block), FadeIn(warning), run_time=0.8)
        self.wait(beat(2.6))
        self.play(FadeOut(VGroup(closing, left, right, warning)), run_time=1.0)
        self.wait(beat(0.4))

    def run_panel(self, center: np.ndarray, turn: float, name: str, color: str) -> VGroup:
        radius = 1.35
        circle = Circle(radius=radius, color=DIM, stroke_width=2, stroke_opacity=0.6)
        circle.move_to(center)
        points = [center + radius * unit(angle + turn) for _, angle in SPIN_POINTS]
        shape = Polygon(*points, color=color, stroke_width=3, fill_color=color, fill_opacity=0.09)
        dots = VGroup(*[Dot(point, radius=0.075, color=color) for point in points])
        tags = VGroup()
        for (symbol, angle), point in zip(SPIN_POINTS, points):
            tag = tex(symbol, font_size=24, color=color)
            tag.move_to(center + (radius + 0.3) * unit(angle + turn))
            tags.add(tag)
        # Clear of the point labels, which stick out further than the circle.
        heading = label(name, size=26, color=color)
        heading.next_to(circle, UP, buff=0.55)
        return VGroup(circle, shape, dots, tags, heading)

    # -- pieces ----------------------------------------------------------------

    def positions(self) -> list[np.ndarray]:
        turn = self.turn.get_value()
        return [unit(angle + turn) for _, angle in SPIN_POINTS]

    def build_dots(self) -> VGroup:
        return VGroup(
            *[
                Dot(SPIN_CENTER + SPIN_RADIUS * position, radius=0.085, color=L2)
                for position in self.positions()
            ]
        )

    def build_tags(self) -> VGroup:
        tags = VGroup()
        for (symbol, _), position in zip(SPIN_POINTS, self.positions()):
            tag = tex(symbol, font_size=26, color=L2)
            tag.move_to(SPIN_CENTER + (SPIN_RADIUS + 0.36) * position)
            tags.add(tag)
        return tags

    def build_shape(self) -> Polygon:
        points = [SPIN_CENTER + SPIN_RADIUS * position for position in self.positions()]
        return Polygon(*points, color=L2, stroke_width=3, fill_color=L2, fill_opacity=0.08)

    def build_table(self) -> VGroup:
        """Recomputed from the live coordinates every frame, on purpose."""
        positions = self.positions()
        rows = VGroup(caption("similarities", color=MUTED).scale(0.85))
        for i, j in SPIN_PAIRS:
            value = float(np.dot(positions[i][:2], positions[j][:2]))
            rows.add(
                VGroup(
                    label(f"cos({SPIN_POINTS[i][0]}, {SPIN_POINTS[j][0]})", size=24, color=MUTED),
                    label(f"{value:+.3f}", size=24, color=GOOD),
                ).arrange(RIGHT, buff=0.25)
            )
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        return panel(rows).move_to(RIGHT * 3.1 + UP * 0.55)

    def build_coordinates(self) -> VGroup:
        position = self.positions()[0]
        rows = VGroup(
            caption("coordinates of a", color=MUTED).scale(0.85),
            label(f"({position[0]:+.3f}, {position[1]:+.3f})", size=26, color=BAD),
        ).arrange(DOWN, buff=0.16)
        return panel(rows).move_to(RIGHT * 3.1 + DOWN * 1.95)
