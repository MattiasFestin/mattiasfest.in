"""Scenes for post 0004, "Embedding drift: Part 3 - What is drift?".

Render with (from the repo root):

    manim/render.sh 0004

Three silent, loopable figures for the post's three claims: the obvious
geometry metric lies about drift, the neighbour list is the API your product
actually consumes, and one SVD buys back most of the compatibility a model
swap destroys.

Everything on screen is computed, not typed. One corpus of unit vectors is
built once and shared by all three scenes; the anchor cosine, the
second-order correlation, every stability@k, the histogram counts and the
Procrustes bridge are all measured from those same points. The scenes work
in two dimensions, where an L2-normalised embedding lives on the circle, so
the geometry on screen *is* the data the numbers come from.
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
    Axes,
    Circle,
    Create,
    DashedLine,
    Dot,
    FadeIn,
    FadeOut,
    Line,
    Rectangle,
    Transform,
    VGroup,
    ValueTracker,
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
    beat,
    caption,
    label,
    title,
)
from mfblog.typst import tex

# ---------------------------------------------------------------------------
# One corpus, three scenes.
#
# The corpus is a set of unit vectors in the plane, which is what an
# L2-normalised embedding space looks like in two dimensions: similarity is
# cosine, so it depends only on the angle between two items. "Model v+1" is
# the post's own simulation - the same map turned by a quarter turn, plus a
# little genuine disagreement - which is exactly the situation Part 2 says a
# retrain lands you in.
# ---------------------------------------------------------------------------

CORPUS_N = 60
TURN = 90.0  # degrees; the orientation training never pinned down
JITTER = 14.0  # degrees, per item: the part that is real disagreement
K = 10  # the k in stability@k

# Cluster centres and widths, so the corpus has topics rather than being a
# uniform smear. Neighbourhoods only mean something if there are neighbours.
CLUSTERS = ((25.0, 60.0), (140.0, 45.0), (250.0, 70.0), (330.0, 35.0))


def unit(degrees: float) -> np.ndarray:
    """A unit vector at the given angle, as a Manim point."""
    radians = degrees * DEGREES
    return np.array([np.cos(radians), np.sin(radians), 0.0])


def build_corpus(n: int = CORPUS_N, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    angles: list[float] = []
    per_cluster = n // len(CLUSTERS)
    for centre, width in CLUSTERS:
        angles.extend(centre + width * (rng.random(per_cluster) - 0.5))
    while len(angles) < n:
        angles.append(rng.random() * 360.0)
    return np.sort(np.asarray(angles) % 360.0)


def drift(angles: np.ndarray, turn: float = TURN, jitter: float = JITTER, seed: int = 11) -> np.ndarray:
    """Model v+1: the same map, turned, plus per-item disagreement."""
    rng = np.random.default_rng(seed)
    return (angles + turn + jitter * rng.normal(size=len(angles))) % 360.0


def vectors(angles: np.ndarray) -> np.ndarray:
    radians = np.radians(angles)
    return np.stack([np.cos(radians), np.sin(radians)], axis=1)


V = build_corpus()
V1 = drift(V)


def neighbours(angles: np.ndarray, index: int, k: int = K) -> list[int]:
    """Top-k by cosine similarity, within one map. Never across two."""
    sims = np.cos(np.radians(angles - angles[index]))
    return [j for j in np.argsort(-sims) if j != index][:k]


def stability_at_k(a: np.ndarray, b: np.ndarray, k: int = K) -> float:
    scores = [len(set(neighbours(a, i, k)) & set(neighbours(b, i, k))) / k for i in range(len(a))]
    return float(np.mean(scores))


def anchor_cosine(a: np.ndarray, b: np.ndarray) -> float:
    """The trap: it compares coordinates across two different maps."""
    return float(np.mean(np.cos(np.radians(b - a))))


def second_order(a: np.ndarray, b: np.ndarray, samples: int = 260, seed: int = 3):
    """Each cosine is computed inside one map, so no map is ever crossed."""
    rng = np.random.default_rng(seed)
    pairs = rng.choice(len(a), size=(samples, 2))
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    sims_a = np.cos(np.radians(a[pairs[:, 0]] - a[pairs[:, 1]]))
    sims_b = np.cos(np.radians(b[pairs[:, 0]] - b[pairs[:, 1]]))
    return pairs, sims_a, sims_b, float(np.corrcoef(sims_a, sims_b)[0, 1])


# ---------------------------------------------------------------------------
# Scene one: the metric that lies
# ---------------------------------------------------------------------------

RING_CENTRE = LEFT * 3.55
RING_RADIUS = 2.0
ANCHOR_STRIDE = 7  # which items get a visible before/after arc


class AnchorCosineLies(BlogScene):
    """Anchor cosine says the models are strangers. It is wrong.

    Both numbers on screen are measured from the same two sets of points:
    one compares each item's coordinates across the two maps, the other
    compares each map's own opinion of the same pairs.
    """

    def construct(self) -> None:
        self.pairs, self.sims_v, self.sims_v1, self.corr = second_order(V, V1)
        self.anchor = anchor_cosine(V, V1)

        heading = title("The obvious drift metric lies")
        heading.to_edge(UP, buff=0.35)
        ring = Circle(radius=RING_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        ring.move_to(RING_CENTRE)
        self.play(Write(heading), Create(ring), run_time=1.2)

        dots_v = self.dots(V, L2)
        legend_v = self.tag("model v", L2, RING_CENTRE + UP * (RING_RADIUS + 0.42) + LEFT * 1.05)
        self.play(FadeIn(dots_v), FadeIn(legend_v), run_time=1.0)
        first = caption("One corpus, embedded by model v. Similarity is the angle.")
        first.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(first), run_time=0.6)
        self.wait(beat(1.6))

        dots_v1 = self.dots(V1, ACCENT)
        legend_v1 = self.tag("model v+1", ACCENT, RING_CENTRE + UP * (RING_RADIUS + 0.42) + RIGHT * 1.05)
        second = caption("Retrain. Same corpus, same recipe, a new map.")
        second.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(first), FadeIn(dots_v1), FadeIn(legend_v1), FadeIn(second), run_time=1.2)
        self.wait(beat(1.4))

        self.act_two_anchor(second)
        self.act_three_second_order()

        closing = label("Same drift. Two numbers. One of them is lying.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.3)
        self.wait(beat(2.4))
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act two ---------------------------------------------------------------

    def act_two_anchor(self, previous) -> None:
        arcs = VGroup()
        for index in range(0, CORPUS_N, ANCHOR_STRIDE):
            arcs.add(
                Line(
                    RING_CENTRE + RING_RADIUS * unit(V[index]),
                    RING_CENTRE + RING_RADIUS * unit(V1[index]),
                    color=BAD,
                    stroke_width=2.5,
                    stroke_opacity=0.8,
                )
            )
        note = caption("Each item moved. Measure how far, item by item:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(previous), FadeIn(arcs), FadeIn(note), run_time=1.1)
        self.wait(beat(1.2))

        formula = tex(
            r'"anchor cosine" = 1/(|A|) sum_(x in A) cos(z_v (x), z_(v+1) (x))',
            font_size=26,
            color=INK,
        )
        readout = VGroup(
            label("anchor cosine", size=24, color=MUTED),
            label(f"{self.anchor:+.3f}", size=46, color=BAD),
        ).arrange(DOWN, buff=0.18)
        block = panel(VGroup(formula, readout).arrange(DOWN, buff=0.4))
        block.move_to(RIGHT * 3.5 + UP * 0.35)
        self.play(FadeIn(block), run_time=0.9)
        self.wait(beat(1.0))

        verdict = VGroup(
            caption("Near zero: by this number the two models are strangers.", color=BAD),
            caption("It compares coordinates across two different maps.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))

        self.anchor_block = block
        self.arcs = arcs
        self.verdict = verdict

    # -- act three -------------------------------------------------------------

    def act_three_second_order(self) -> None:
        axes = Axes(
            x_range=[-1.1, 1.1, 0.5],
            y_range=[-1.1, 1.1, 0.5],
            x_length=3.5,
            y_length=3.5,
            tips=False,
            axis_config={"color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(RIGHT * 3.4 + DOWN * 0.35)
        x_label = caption("cos(a, b) under v", color=L2).scale(0.72)
        x_label.next_to(axes, DOWN, buff=0.22)
        y_label = caption("under v+1", color=ACCENT).scale(0.72)
        y_label.rotate(90 * DEGREES).next_to(axes, LEFT, buff=0.22)

        ask = caption("Ask each map the same question instead:", color=INK)
        ask.to_edge(DOWN, buff=0.4)
        self.play(
            FadeOut(self.anchor_block),
            FadeOut(self.arcs),
            FadeOut(self.verdict),
            FadeIn(ask),
            Create(axes),
            FadeIn(x_label),
            FadeIn(y_label),
            run_time=1.2,
        )

        # One worked pair first, so the scatter is not a magic trick.
        a, b = self.pairs[0]
        chord_v = Line(
            RING_CENTRE + RING_RADIUS * unit(V[a]),
            RING_CENTRE + RING_RADIUS * unit(V[b]),
            color=L2,
            stroke_width=3,
        )
        chord_v1 = Line(
            RING_CENTRE + RING_RADIUS * unit(V1[a]),
            RING_CENTRE + RING_RADIUS * unit(V1[b]),
            color=ACCENT,
            stroke_width=3,
        )
        sample = Dot(axes.c2p(self.sims_v[0], self.sims_v1[0]), radius=0.07, color=GOOD)
        self.play(Create(chord_v), Create(chord_v1), run_time=0.8)
        self.play(FadeIn(sample), run_time=0.5)
        self.wait(beat(1.2))

        cloud = VGroup(
            *(
                Dot(axes.c2p(x, y), radius=0.035, color=GOOD, fill_opacity=0.75)
                for x, y in zip(self.sims_v[1:], self.sims_v1[1:])
            )
        )
        self.play(FadeOut(chord_v), FadeOut(chord_v1), FadeIn(cloud), run_time=1.6)

        readout = VGroup(
            label("second-order drift", size=24, color=MUTED),
            label(f"corr = {self.corr:.3f}", size=38, color=GOOD),
        ).arrange(DOWN, buff=0.16)
        block = panel(readout, pad=0.25)
        block.next_to(axes, UP, buff=0.3)
        self.play(FadeIn(block), run_time=0.7)

        verdict = VGroup(
            caption("The two maps agree about which things are similar.", color=GOOD),
            caption("No cosine here ever crossed from one map to the other.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(ask), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))
        self.play(FadeOut(verdict), run_time=0.5)

    # -- pieces ----------------------------------------------------------------

    def dots(self, angles: np.ndarray, color: str) -> VGroup:
        return VGroup(
            *(
                Dot(RING_CENTRE + RING_RADIUS * unit(angle), radius=0.062, color=color)
                for angle in angles
            )
        )

    def tag(self, text: str, color: str, position: np.ndarray):
        return label(text, size=24, color=color).move_to(position)


# ---------------------------------------------------------------------------
# Scene two: the neighbour list is the API
# ---------------------------------------------------------------------------

QUERY = 20  # an item whose stability@10 lands on the corpus average
COMPRESS = 0.16  # how tightly the second model family packs the same corpus
THRESHOLD = 0.90  # the hardcoded "this is a duplicate" constant
LIST_LEFT = 1.6
LIST_RIGHT = 4.4


def concentrated(angles: np.ndarray, factor: float = COMPRESS) -> np.ndarray:
    """Another model family: same corpus, a much narrower slice of the range."""
    centre = angles.mean()
    return (centre + factor * ((angles - centre + 180.0) % 360.0 - 180.0)) % 360.0


def pair_cosines(angles: np.ndarray) -> np.ndarray:
    upper = np.triu_indices(len(angles), 1)
    return np.cos(np.radians(angles[:, None] - angles[None, :]))[upper]


class NeighborsAreTheAPI(BlogScene):
    """stability@k, and the constant nobody recalibrated.

    The ranked lists are read off the corpus, the overlap is counted from
    those lists, and the histogram bars are the actual pair cosines.
    """

    def construct(self) -> None:
        self.before = neighbours(V, QUERY)
        self.after = neighbours(V1, QUERY)
        self.kept = set(self.before) & set(self.after)
        self.query_stability = len(self.kept) / K
        self.corpus_stability = stability_at_k(V, V1)

        heading = title("The neighbours are the API")
        heading.to_edge(UP, buff=0.35)
        ring = Circle(radius=RING_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        ring.move_to(RING_CENTRE)
        self.play(Write(heading), Create(ring), run_time=1.2)

        self.angles = ValueTracker(0.0)  # 0 = map v, 1 = map v+1
        dots = always_redraw(self.build_dots)
        query_tag = always_redraw(self.build_query_tag)
        self.play(FadeIn(dots), FadeIn(query_tag), run_time=1.0)

        opening = caption("One query. Its ten nearest neighbours under model v.")
        opening.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(opening), run_time=0.6)
        self.wait(beat(1.8))

        column_v = self.ranked_column("under v", self.before, LIST_LEFT, L2, highlight=False)
        self.play(FadeIn(column_v), run_time=0.8)
        self.wait(beat(1.6))

        self.act_two_stability(opening, column_v)
        self.act_three_threshold(dots, query_tag)

        closing = label("Version the interface, or ship the break silently.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.3)
        self.wait(beat(2.3))
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act two ---------------------------------------------------------------

    def act_two_stability(self, previous, column_v) -> None:
        turning = caption("Upgrade the model. The map turns, and some items really move.")
        turning.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(previous), FadeIn(turning), run_time=0.6)
        self.play(self.angles.animate.set_value(1.0), run_time=3.0, rate_func=smooth)
        self.wait(beat(0.6))

        column_v1 = self.ranked_column("under v+1", self.after, LIST_RIGHT, ACCENT, highlight=True)
        self.play(FadeIn(column_v1), run_time=0.9)
        self.wait(beat(1.4))

        readout = VGroup(
            label(f"stability@{K} = {self.query_stability:.2f}", size=30, color=INK),
            label(f"whole corpus: {self.corpus_stability:.3f}", size=22, color=MUTED),
        ).arrange(DOWN, buff=0.16)
        block = panel(readout, pad=0.22)
        block.move_to(RIGHT * 3.0 + DOWN * 1.95)
        self.play(FadeIn(block), run_time=0.7)

        verdict = VGroup(
            caption("Green survived the upgrade; red is new to the list.", color=MUTED),
            caption("This is what your RAG context and your dedup actually consume.", color=INK),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(turning), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))

        self.play(
            FadeOut(VGroup(column_v, column_v1, block, verdict)),
            run_time=0.8,
        )

    # -- act three -------------------------------------------------------------

    def act_three_threshold(self, dots, query_tag) -> None:
        spread = pair_cosines(V)
        packed = pair_cosines(concentrated(V))
        above_spread = float(np.mean(spread > THRESHOLD))
        above_packed = float(np.mean(packed > THRESHOLD))

        axes = Axes(
            x_range=[-1.05, 1.05, 0.5],
            y_range=[0, 0.36, 0.1],
            x_length=4.6,
            y_length=2.5,
            tips=False,
            axis_config={"color": MUTED, "stroke_width": 2, "include_ticks": False},
        )
        axes.move_to(RIGHT * 3.3 + UP * 0.15)
        ticks = VGroup()
        for value, text in ((-1.0, "-1"), (0.0, "0"), (1.0, "+1")):
            mark = caption(text).scale(0.62)
            mark.next_to(axes.c2p(value, 0), DOWN, buff=0.12)
            ticks.add(mark)
        axis_label = caption("cosine similarity, every pair in the corpus").scale(0.66)
        axis_label.next_to(ticks, DOWN, buff=0.14)
        axis_label.set_x(axes.get_x())
        axis_label = VGroup(ticks, axis_label)

        rule = DashedLine(
            axes.c2p(THRESHOLD, 0),
            axes.c2p(THRESHOLD, 0.36),
            color=BAD,
            stroke_width=3,
            dash_length=0.09,
        )
        rule_tag = label(f'"above {THRESHOLD:.2f} is a duplicate"', size=20, color=BAD)
        rule_tag.next_to(rule, UP, buff=0.12).shift(LEFT * 0.75)

        bars_v = self.histogram(spread, axes, L2)
        counter = label(f"{above_spread * 100:.0f}% of pairs flagged", size=26, color=L2)
        counter.next_to(axes, UP, buff=0.75)

        intro = caption("And every hardcoded threshold was calibrated on v's scores.")
        intro.to_edge(DOWN, buff=0.4)
        self.play(
            FadeIn(axes),
            FadeIn(axis_label),
            FadeIn(bars_v),
            FadeIn(rule),
            FadeIn(rule_tag),
            FadeIn(counter),
            FadeIn(intro),
            run_time=1.2,
        )
        self.wait(beat(2.2))

        swap = caption("Another model family. Same corpus, a much narrower range.", color=ACCENT)
        swap.to_edge(DOWN, buff=0.4)
        bars_b = self.histogram(packed, axes, ACCENT)
        packed_counter = label(f"{above_packed * 100:.0f}% of pairs flagged", size=26, color=BAD)
        packed_counter.move_to(counter)

        self.play(FadeOut(intro), FadeIn(swap), run_time=0.6)
        self.play(
            self.angles.animate.set_value(2.0),
            Transform(bars_v, bars_b),
            Transform(counter, packed_counter),
            run_time=2.6,
            rate_func=smooth,
        )
        self.wait(beat(1.0))

        verdict = VGroup(
            caption("The threshold never moved. The distribution underneath it did.", color=BAD),
            caption("Recalibrate every constant, or watch good retrieval get vetoed.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(swap), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.8))

        dots.clear_updaters()
        query_tag.clear_updaters()
        self.play(
            FadeOut(VGroup(axes, axis_label, bars_v, rule, rule_tag, counter, verdict)),
            run_time=0.8,
        )

    # -- pieces ----------------------------------------------------------------

    def current_angles(self) -> np.ndarray:
        """0 -> model v, 1 -> model v+1, 2 -> the concentrated model."""
        phase = self.angles.get_value()
        if phase <= 1.0:
            return V + (V1 - V) * phase
        target = concentrated(V)
        return V1 + (target - V1) * (phase - 1.0)

    def build_dots(self) -> VGroup:
        angles = self.current_angles()
        phase = self.angles.get_value()
        base = L2 if phase < 0.5 else ACCENT
        group = VGroup()
        for index, angle in enumerate(angles):
            if index == QUERY:
                continue
            colour, radius = base, 0.062
            if phase >= 0.5 and phase <= 1.0:
                if index in self.kept:
                    colour, radius = GOOD, 0.075
                elif index in set(self.after):
                    colour, radius = BAD, 0.075
            elif phase < 0.5 and index in set(self.before):
                colour, radius = GOOD, 0.075
            group.add(Dot(RING_CENTRE + RING_RADIUS * unit(angle), radius=radius, color=colour))
        return group

    def build_query_tag(self) -> VGroup:
        angle = self.current_angles()[QUERY]
        point = RING_CENTRE + RING_RADIUS * unit(angle)
        dot = Dot(point, radius=0.1, color=ACCENT)
        arrow = Arrow(RING_CENTRE, point, buff=0.12, color=ACCENT, stroke_width=4,
                      max_tip_length_to_length_ratio=0.12)
        tag = label("query", size=22, color=ACCENT)
        tag.move_to(RING_CENTRE + (RING_RADIUS + 0.45) * unit(angle))
        return VGroup(arrow, dot, tag)

    def ranked_column(self, heading: str, ranking: list[int], x: float, colour: str, *, highlight: bool) -> VGroup:
        rows = VGroup(label(heading, size=22, color=colour))
        for rank, item in enumerate(ranking, start=1):
            if highlight:
                row_colour = GOOD if item in self.kept else BAD
            else:
                row_colour = INK if item in self.kept else MUTED
            rows.add(label(f"{rank:>2}.  item {item:02d}", size=20, color=row_colour))
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.11)
        block = panel(rows, pad=0.22)
        block.move_to(RIGHT * x + UP * 0.55)
        return block

    def histogram(self, values: np.ndarray, axes: Axes, colour: str, bins: int = 22) -> VGroup:
        counts, edges = np.histogram(values, bins=bins, range=(-1.0, 1.0))
        fractions = counts / counts.sum()
        bars = VGroup()
        # Every bin gets a bar, including the empty ones, so that two
        # histograms always have the same number of pieces and can morph
        # into one another.
        for fraction, left, right in zip(fractions, edges[:-1], edges[1:]):
            corner = axes.c2p(left, 0)
            top_right = axes.c2p(right, min(fraction, 0.36))
            bar = Rectangle(
                width=top_right[0] - corner[0],
                height=max(top_right[1] - corner[1], 0.001),
                fill_color=colour,
                fill_opacity=0.75,
                stroke_width=0,
            )
            bar.move_to((corner + top_right) / 2)
            bars.add(bar)
        return bars


# ---------------------------------------------------------------------------
# Scene three: the compatibility bridge
# ---------------------------------------------------------------------------

BRIDGE_ANCHORS = np.arange(0, CORPUS_N, 3)
BRIDGE_QUERY = 20
RESIDUAL_MIN = 18.0  # degrees; below this the leftover is not worth drawing


def procrustes(a: np.ndarray, b: np.ndarray, anchors: np.ndarray) -> np.ndarray:
    """The closed-form bridge: one SVD on the anchor set."""
    left, right = vectors(a)[anchors], vectors(b)[anchors]
    u, _, vt = np.linalg.svd(left.T @ right)
    return u @ vt


def recovered_turn(matrix: np.ndarray) -> float:
    return float(np.degrees(np.arctan2(matrix[0, 1], matrix[0, 0])))


def cross_space_neighbours(query_vector: np.ndarray, index: int, k: int = K) -> list[int]:
    sims = vectors(V1) @ query_vector
    return [j for j in np.argsort(-sims) if j != index][:k]


class TheProcrustesBridge(BlogScene):
    """One SVD recovers the orientation, and nothing more than that.

    The bridge is computed from the anchors on screen, the recovered angle is
    read back out of the matrix, and both stability numbers are counted from
    the retrieved lists.
    """

    def construct(self) -> None:
        self.bridge = procrustes(V, V1, BRIDGE_ANCHORS)
        self.turn_back = recovered_turn(self.bridge)
        self.bridged_angles = (V + self.turn_back) % 360.0

        self.raw_cosine = float(np.mean(np.cos(np.radians(V1 - V))))
        self.bridged_cosine = float(np.mean(np.cos(np.radians(V1 - self.bridged_angles))))

        truth = {i: set(neighbours(V1, i)) for i in range(CORPUS_N)}
        self.naive_stability = float(
            np.mean([len(set(cross_space_neighbours(vectors(V)[i], i)) & truth[i]) / K for i in range(CORPUS_N)])
        )
        self.bridged_stability = float(
            np.mean(
                [
                    len(set(cross_space_neighbours(vectors(V)[i] @ self.bridge, i)) & truth[i]) / K
                    for i in range(CORPUS_N)
                ]
            )
        )

        heading = title("One SVD buys the orientation back")
        heading.to_edge(UP, buff=0.35)
        ring = Circle(radius=RING_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        ring.move_to(RING_CENTRE)
        self.play(Write(heading), Create(ring), run_time=1.2)

        self.turn = ValueTracker(0.0)
        old_dots = always_redraw(self.build_old_dots)
        new_dots = VGroup(
            *(Dot(RING_CENTRE + RING_RADIUS * unit(a), radius=0.062, color=ACCENT) for a in V1)
        )
        legend = VGroup(
            self.swatch("model v", L2),
            self.swatch("model v+1", ACCENT),
        ).arrange(RIGHT, buff=0.55)
        legend.move_to(RING_CENTRE + UP * (RING_RADIUS + 0.45))

        self.play(FadeIn(new_dots), FadeIn(old_dots), FadeIn(legend), run_time=1.2)
        self.wait(beat(1.2))

        self.act_one_naive()
        self.act_two_bridge()

        closing = label("It recovers the turn. It cannot recover the disagreement.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.4)
        self.wait(beat(2.4))
        old_dots.clear_updaters()
        self.play(*(FadeOut(m) for m in list(self.mobjects)), run_time=1.0)
        self.wait(beat(0.4))

    # -- act one ---------------------------------------------------------------

    def act_one_naive(self) -> None:
        note = caption("Search the new index with an old vector, unchanged:")
        note.to_edge(DOWN, buff=0.4)
        retrieved = cross_space_neighbours(vectors(V)[BRIDGE_QUERY], BRIDGE_QUERY)
        marks = VGroup(
            *(
                Dot(RING_CENTRE + RING_RADIUS * unit(V1[j]), radius=0.09, color=BAD)
                for j in retrieved
            )
        )
        query = Arrow(
            RING_CENTRE,
            RING_CENTRE + RING_RADIUS * unit(V[BRIDGE_QUERY]),
            buff=0.12,
            color=L2,
            stroke_width=4,
            max_tip_length_to_length_ratio=0.12,
        )
        self.play(FadeIn(note), FadeIn(query), run_time=0.7)
        self.play(FadeIn(marks), run_time=0.8)

        readout = VGroup(
            label(f"stability@{K}", size=24, color=MUTED),
            label(f"{self.naive_stability:.3f}", size=44, color=BAD),
        ).arrange(DOWN, buff=0.16)
        block = panel(readout, pad=0.28)
        block.move_to(RIGHT * 3.5 + UP * 0.6)
        self.play(FadeIn(block), run_time=0.7)

        verdict = VGroup(
            caption("Confident nonsense: it retrieves whatever happens to sit", color=BAD),
            caption("where the old coordinates point in the new map.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(beat(2.6))

        self.naive_bits = VGroup(marks, query, block, verdict)

    # -- act two ---------------------------------------------------------------

    def act_two_bridge(self) -> None:
        anchors = VGroup(
            *(
                Circle(radius=0.15, color=GOOD, stroke_width=3).move_to(
                    RING_CENTRE + RING_RADIUS * unit(V[i])
                )
                for i in BRIDGE_ANCHORS
            )
        )
        note = caption(f"Take {len(BRIDGE_ANCHORS)} anchors you can embed with both models:", color=INK)
        note.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(self.naive_bits), FadeIn(anchors), FadeIn(note), run_time=1.0)
        self.wait(beat(1.2))

        formula = tex(
            r"Z_v^top Z_(v+1) = U Sigma V^top, quad W = U V^top",
            font_size=28,
            color=INK,
        )
        # Lay the card out around a static copy of the readout first, so the
        # redrawn version has somewhere to sit; a freshly arranged group would
        # otherwise land at the origin on every frame.
        seed = self.cosine_readout()
        layout = VGroup(formula, seed).arrange(DOWN, buff=0.35)
        card = panel(layout, pad=0.28)
        card.move_to(RIGHT * 3.5 + UP * 0.6)
        self.readout_anchor = seed.get_center()
        card.remove(layout)
        card.add(formula)

        cosine_readout = always_redraw(self.cosine_readout)
        block = VGroup(card, cosine_readout)
        self.play(FadeIn(card), FadeIn(cosine_readout), run_time=0.8)
        self.wait(beat(1.0))

        spin = caption("One linear-algebra call, and the old map turns into place.", color=GOOD)
        spin.to_edge(DOWN, buff=0.4)
        self.play(FadeOut(note), FadeIn(spin), run_time=0.6)
        self.play(FadeOut(anchors), run_time=0.4)
        self.play(self.turn.animate.set_value(1.0), run_time=3.2, rate_func=smooth)
        self.wait(beat(0.8))

        recovered = label(
            f"recovered turn {self.turn_back:+.1f}\u00b0  (actual {TURN:.0f}\u00b0)",
            size=22,
            color=MUTED,
        )
        recovered.next_to(block, DOWN, buff=0.3)
        self.play(FadeIn(recovered), run_time=0.6)
        self.wait(beat(1.4))

        stability = VGroup(
            label(f"stability@{K}, bridged", size=24, color=MUTED),
            label(f"{self.bridged_stability:.3f}", size=44, color=GOOD),
        ).arrange(DOWN, buff=0.16)
        stability_block = panel(stability, pad=0.28)
        stability_block.move_to(RIGHT * 3.5 + DOWN * 1.95)
        self.play(FadeIn(stability_block), run_time=0.7)
        self.wait(beat(1.6))

        residual = VGroup(
            *(
                Line(
                    RING_CENTRE + RING_RADIUS * unit(self.bridged_angles[i]),
                    RING_CENTRE + RING_RADIUS * unit(V1[i]),
                    color=BAD,
                    stroke_width=4,
                )
                for i in range(CORPUS_N)
                if abs(((V1[i] - self.bridged_angles[i] + 180) % 360) - 180) > RESIDUAL_MIN
            )
        )
        limit = VGroup(
            caption(
                f"{len(residual)} of {CORPUS_N} items still disagree by more than {RESIDUAL_MIN:.0f}\u00b0:",
                color=MUTED,
            ),
            caption("places the new model changed its mind. No rotation undoes that.", color=INK),
        ).arrange(DOWN, buff=0.14)
        limit.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(spin), FadeIn(residual), FadeIn(limit), run_time=1.0)
        self.wait(beat(3.0))
        block.clear_updaters()
        for part in block:
            part.clear_updaters()
        self.play(FadeOut(VGroup(residual, limit, block, recovered, stability_block)), run_time=0.8)

    # -- pieces ----------------------------------------------------------------

    def build_old_dots(self) -> VGroup:
        phase = self.turn.get_value()
        angles = V + (self.bridged_angles - V) * phase
        return VGroup(
            *(Dot(RING_CENTRE + RING_RADIUS * unit(a), radius=0.062, color=L2) for a in angles)
        )

    def cosine_readout(self) -> VGroup:
        phase = getattr(self, "turn", None)
        phase = 0.0 if phase is None else phase.get_value()
        value = self.raw_cosine + (self.bridged_cosine - self.raw_cosine) * phase
        group = VGroup(
            label("mean cosine to the new vectors", size=20, color=MUTED),
            label(f"{value:+.3f}", size=40, color=GOOD if value > 0.5 else BAD),
        ).arrange(DOWN, buff=0.14)
        anchor = getattr(self, "readout_anchor", None)
        if anchor is not None:
            group.move_to(anchor)
        return group

    def swatch(self, text: str, colour: str) -> VGroup:
        return VGroup(
            Dot(radius=0.08, color=colour),
            caption(text, color=colour).scale(0.8),
        ).arrange(RIGHT, buff=0.18)
