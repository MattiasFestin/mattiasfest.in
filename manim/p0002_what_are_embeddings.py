"""Scenes for post 0002, "Embedding drift: Part 1 - What is an embedding?".

Render with (from the repo root):

    manim/render.sh 0002

Three silent, loopable figures for the post's three moves: the fold that
turns an input into a point, why cosine and Euclidean rank the same way once
you normalise, and what actually changes when you swap models.

The palette is shared with post 0001 on purpose: L2 blue keeps meaning
"Euclidean" and the red keeps meaning "this is where it breaks".
"""

from __future__ import annotations

import numpy as np
from manim import (
    DEGREES,
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Arc,
    Arrow,
    Circle,
    Create,
    DashedLine,
    Dot,
    FadeIn,
    FadeOut,
    Flash,
    GrowFromCenter,
    Indicate,
    Line,
    Rectangle,
    RoundedRectangle,
    Square,
    VGroup,
    ValueTracker,
    Write,
    always_redraw,
    smooth,
)

from mfblog.panels import CARD, panel
from mfblog.theme import (
    ACCENT,
    BAD,
    DIM,
    GOOD,
    INK,
    L2,
    MUTED,
    BlogScene,
    caption,
    label,
    title,
)
from mfblog.typst import tex


def unit(degrees: float) -> np.ndarray:
    """A unit vector at the given angle, as a Manim point."""
    radians = degrees * DEGREES
    return np.array([np.cos(radians), np.sin(radians), 0.0])



# ---------------------------------------------------------------------------
# Act one of the post: text in, a point out — and the number that doesn't
# survive the trip.
# ---------------------------------------------------------------------------

MAP_SIDE = 4.6
MAP_CENTER = RIGHT * 3.6 + DOWN * 0.35
MAP_RANGE = 2.0  # the map's data coordinates run -MAP_RANGE .. MAP_RANGE

# Where each input lands. The two invoices deliberately share a point: the
# model was never trained to care which number is on the paper. The last
# field is where the caption hangs, so the two invoice captions stay legible
# while sharing a dot.
SNIPPETS = (
    ("sourdough starter", (-1.30, 0.90), ACCENT, DOWN),
    ("oven temperature", (-0.75, 1.35), ACCENT, DOWN),
    ("why stars twinkle", (1.10, 1.10), L2, DOWN),
    ("Andromeda galaxy", (1.25, 0.45), L2, DOWN),
    ("invoice #10482", (0.10, -1.25), BAD, UP),
    ("invoice #99317", (0.10, -1.25), BAD, DOWN),
)

CLUSTERS = (
    ((-1.02, 1.12), 0.62, "baking", ACCENT),
    ((1.18, 0.78), 0.60, "astronomy", L2),
)


def map_point(coords) -> np.ndarray:
    scale = (MAP_SIDE / 2) / MAP_RANGE
    return MAP_CENTER + np.array([coords[0] * scale, coords[1] * scale, 0.0])


class EmbeddingsAreAMap(BlogScene):
    """An embedding model is a function that folds an input into a point.

    Inputs queue up on the left, pass through the model, and come out as
    coordinates that get pinned to one shared map. Similar inputs land near
    each other — and the detail nobody trained the model to keep (an invoice
    number) is simply gone.
    """

    def construct(self) -> None:
        heading = title("Text goes in. A point comes out.")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.3)

        machine, function = self.build_model()
        frame, frame_note = self.build_map()
        self.play(FadeIn(machine), Write(function), run_time=1.1)
        self.play(Create(frame), FadeIn(frame_note), run_time=0.9)

        cards = self.build_cards()
        self.play(FadeIn(cards, shift=RIGHT * 0.2), run_time=1.0)

        rng = np.random.default_rng(11)
        pins = VGroup()
        for index, (text, coords, color, direction) in enumerate(SNIPPETS):
            # The two invoices are one beat, not two: the second is only
            # interesting because of where it lands relative to the first.
            if index == 4:
                note = caption("Two invoices. Same words, different number.", color=MUTED)
                note.to_edge(DOWN, buff=0.35)
                self.play(FadeIn(note), run_time=0.6)
            coordinates = rng.uniform(-0.9, 0.9, size=3) if index != 5 else last_coordinates
            last_coordinates = coordinates
            pins.add(self.fold(cards[index], machine, text, coords, color, coordinates, direction))

            if index == 3:
                self.reveal_clusters()

        self.play(
            Flash(map_point(SNIPPETS[5][1]), color=BAD, line_length=0.25, num_lines=16, flash_radius=0.3),
            run_time=0.8,
        )
        verdict = VGroup(
            caption("Both land on the same point.", color=BAD),
            caption("The invoice number did not survive the fold.", color=BAD),
        ).arrange(DOWN, buff=0.14)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeOut(note), FadeIn(verdict), run_time=0.7)
        self.wait(2.4)

        closing = label("The fold is lossy. Training picks what survives.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), FadeOut(verdict), run_time=0.5)
        self.play(Write(closing), run_time=1.5)
        self.wait(2.6)
        self.play(
            FadeOut(VGroup(closing, machine, function, frame, frame_note, cards, pins, self.hulls)),
            run_time=1.0,
        )
        self.wait(0.4)

    # -- construction --------------------------------------------------------

    def build_model(self) -> tuple[RoundedRectangle, VGroup]:
        machine = RoundedRectangle(
            corner_radius=0.18,
            width=3.0,
            height=1.5,
            fill_color=CARD,
            fill_opacity=0.95,
            stroke_color=MUTED,
            stroke_width=2,
        ).move_to(LEFT * 1.7 + DOWN * 0.35)
        function = VGroup(
            caption("embedding model", color=MUTED),
            tex(r'f : "input" -> RR^n', font_size=30, color=INK),
        ).arrange(DOWN, buff=0.18)
        function.move_to(machine.get_center())
        return machine, function

    def build_map(self) -> tuple[Square, VGroup]:
        frame = Square(side_length=MAP_SIDE, color=MUTED, stroke_width=2, stroke_opacity=0.5)
        frame.move_to(MAP_CENTER)
        note = VGroup(
            caption("one shared space", color=MUTED),
            caption("no bins — just positions", color=DIM),
        ).arrange(DOWN, buff=0.12)
        note.next_to(frame, UP, buff=0.25)
        return frame, note

    def build_cards(self) -> VGroup:
        cards = VGroup()
        for text, *_ in SNIPPETS:
            body = label(text, size=22, color=INK)
            cards.add(panel(VGroup(body), pad=0.22))
        cards.arrange(DOWN, buff=0.2)
        cards.move_to(LEFT * 5.4 + DOWN * 0.35)
        return cards

    # -- one input -----------------------------------------------------------

    def fold(self, card, machine, text, coords, color, coordinates, direction) -> VGroup:
        """Push one card through the model and pin the result to the map."""
        target = map_point(coords)
        self.play(
            card.animate.move_to(machine.get_center()).scale(0.75).set_opacity(0.0),
            Indicate(machine, color=color, scale_factor=1.04),
            run_time=0.8,
        )

        vector = tex(
            "({}, {}, dots, {})".format(*(f"{v:+.2f}" for v in coordinates)),
            font_size=24,
            color=color,
        )
        vector.next_to(machine, RIGHT, buff=0.35)
        dot = Dot(target, radius=0.085, color=color)
        self.play(FadeIn(vector, shift=RIGHT * 0.15), run_time=0.45)
        self.play(
            vector.animate.move_to(target).scale(0.35).set_opacity(0.0),
            GrowFromCenter(dot),
            run_time=0.75,
        )
        self.remove(vector)

        tag = caption(text, color=color).scale(0.72)
        tag.next_to(dot, direction, buff=0.13)
        self.play(FadeIn(tag), run_time=0.35)
        return VGroup(dot, tag)

    def reveal_clusters(self) -> None:
        self.hulls = VGroup()
        for center, radius, name, color in CLUSTERS:
            scale = (MAP_SIDE / 2) / MAP_RANGE
            hull = Circle(
                radius=radius * scale,
                color=color,
                stroke_width=2,
                stroke_opacity=0.55,
                fill_color=color,
                fill_opacity=0.08,
            ).move_to(map_point(center))
            tag = caption(name, color=color).scale(0.8)
            tag.next_to(hull, UP, buff=0.08)
            self.hulls.add(VGroup(hull, tag))
        story = caption("Nobody drew these circles. The points simply landed there.")
        story.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(self.hulls), FadeIn(story), run_time=1.0)
        self.wait(2.0)
        self.play(FadeOut(story), run_time=0.5)


# ---------------------------------------------------------------------------
# Act two: length is noise, and on the unit circle the chord and the angle
# are the same measurement twice.
# ---------------------------------------------------------------------------

CIRCLE_CENTER = LEFT * 3.4 + DOWN * 0.3
CIRCLE_RADIUS = 2.25
QUERY_ANGLE = 70.0
COLUMN = RIGHT * 3.3

# Deliberately chosen so the raw dot product and the cosine disagree: b is
# aimed almost at the query but short, a is badly aimed but long.
DOC_A = (30.0, 1.55)
DOC_B = (88.0, 0.62)

# Three documents for the closing ranking check.
DOCS_2D = (("d_1", 24.0), ("d_2", 118.0), ("d_3", 196.0))


class CosineMeetsEuclidean(BlogScene):
    """Normalise, and the two ways of ranking neighbours become one.

    Act one shows the dot product being fooled by length. Act two puts one
    document on the unit circle and sweeps it: the chord and the cosine move
    in lockstep, because ‖x−q‖² = 2(1−cos). Act three cashes that in as two
    rankings that cannot disagree.
    """

    def construct(self) -> None:
        self.act_one_length()
        self.act_two_sweep()
        self.act_three_rankings()

    # -- shared geometry -----------------------------------------------------

    def tip(self, degrees: float, length: float = 1.0) -> np.ndarray:
        return CIRCLE_CENTER + CIRCLE_RADIUS * length * unit(degrees)

    def arrow(self, degrees: float, length: float, color: str) -> Arrow:
        return Arrow(
            CIRCLE_CENTER,
            self.tip(degrees, length),
            buff=0,
            color=color,
            stroke_width=5,
            max_tip_length_to_length_ratio=0.13,
        )

    def build_stage(self) -> VGroup:
        circle = Circle(radius=CIRCLE_RADIUS, color=DIM, stroke_width=2, stroke_opacity=0.7)
        circle.move_to(CIRCLE_CENTER)
        axes = VGroup(
            Line(
                CIRCLE_CENTER + LEFT * (CIRCLE_RADIUS + 0.5),
                CIRCLE_CENTER + RIGHT * (CIRCLE_RADIUS + 0.5),
                color=DIM,
                stroke_width=1.5,
                stroke_opacity=0.6,
            ),
            Line(
                CIRCLE_CENTER + DOWN * (CIRCLE_RADIUS + 0.5),
                CIRCLE_CENTER + UP * (CIRCLE_RADIUS + 0.5),
                color=DIM,
                stroke_width=1.5,
                stroke_opacity=0.6,
            ),
        )
        note = caption("the unit circle", color=DIM).scale(0.85)
        note.next_to(circle, DOWN, buff=0.25)
        return VGroup(axes, circle, note)

    # -- act one -------------------------------------------------------------

    def act_one_length(self) -> None:
        heading = title("Length is a distraction")
        heading.to_edge(UP, buff=0.35)
        stage = self.build_stage()
        self.play(Write(heading), FadeIn(stage), run_time=1.3)

        query = self.arrow(QUERY_ANGLE, 1.0, ACCENT)
        query_tag = tex("q", font_size=32, color=ACCENT).next_to(query.get_end(), UP, buff=0.12)
        self.play(GrowFromCenter(query), FadeIn(query_tag), run_time=0.8)

        arrows, tags = {}, {}
        for name, (angle, length), color in (("a", DOC_A, L2), ("b", DOC_B, GOOD)):
            arrows[name] = self.arrow(angle, length, color)
            tags[name] = tex(name, font_size=32, color=color)
            tags[name].next_to(arrows[name].get_end(), RIGHT if name == "a" else UP, buff=0.14)
        self.play(
            *[GrowFromCenter(a) for a in arrows.values()],
            *[FadeIn(t) for t in tags.values()],
            run_time=1.0,
        )

        raw = self.scores(
            "raw dot product",
            [
                ("a", DOC_A[1] * np.cos((DOC_A[0] - QUERY_ANGLE) * DEGREES), L2),
                ("b", DOC_B[1] * np.cos((DOC_B[0] - QUERY_ANGLE) * DEGREES), GOOD),
            ],
            winner="a",
        )
        self.play(FadeIn(raw, shift=LEFT * 0.2), run_time=0.8)
        complaint = caption("a wins — only because a is longer.", color=MUTED)
        complaint.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(complaint), run_time=0.6)
        self.wait(2.0)

        rule = tex(r"hat(x) = x \/ norm(x)_2", font_size=30, color=INK)
        rule.next_to(heading, DOWN, buff=0.35).shift(RIGHT * 3.3)
        self.play(FadeOut(complaint), FadeIn(rule), run_time=0.6)
        self.play(
            *[
                arrows[name].animate.put_start_and_end_on(CIRCLE_CENTER, self.tip(angle, 1.0))
                for name, (angle, _) in (("a", DOC_A), ("b", DOC_B))
            ],
            tags["a"].animate.next_to(self.tip(DOC_A[0], 1.0), RIGHT, buff=0.14),
            tags["b"].animate.next_to(self.tip(DOC_B[0], 1.0), UP, buff=0.14),
            run_time=1.4,
        )

        normalised = self.scores(
            "after L2 normalisation",
            [
                ("a", np.cos((DOC_A[0] - QUERY_ANGLE) * DEGREES), L2),
                ("b", np.cos((DOC_B[0] - QUERY_ANGLE) * DEGREES), GOOD),
            ],
            winner="b",
        )
        self.play(FadeOut(raw), FadeIn(normalised, shift=LEFT * 0.2), run_time=0.8)
        verdict = caption("The ranking flips. Now only the angle is left.", color=ACCENT)
        verdict.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(verdict), run_time=0.6)
        self.wait(2.4)

        self.play(
            FadeOut(VGroup(normalised, verdict, rule, heading, arrows["a"], arrows["b"], tags["a"], tags["b"])),
            run_time=0.8,
        )
        self.stage = stage
        self.query = query
        self.query_tag = query_tag

    def scores(self, header: str, rows, winner: str) -> VGroup:
        entries = VGroup(caption(header, color=MUTED))
        for name, value, color in rows:
            row = VGroup(
                Dot(color=color, radius=0.06),
                tex(f"q dot {name} = {value:.2f}", font_size=28, color=color),
                label("  ← best" if name == winner else "", size=22, color=ACCENT),
            ).arrange(RIGHT, buff=0.18)
            entries.add(row)
        entries.arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        block = panel(entries)
        return block.move_to(COLUMN + UP * 0.9)

    # -- act two -------------------------------------------------------------

    def act_two_sweep(self) -> None:
        heading = title("One angle, two readings")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.1)

        angle = ValueTracker(QUERY_ANGLE + 12.0)
        moving = always_redraw(lambda: self.arrow(angle.get_value(), 1.0, L2))
        chord = always_redraw(
            lambda: DashedLine(
                self.tip(QUERY_ANGLE, 1.0),
                self.tip(angle.get_value(), 1.0),
                color=L2,
                stroke_width=4,
                dash_length=0.12,
            )
        )
        wedge = always_redraw(
            lambda: Arc(
                radius=0.62,
                start_angle=QUERY_ANGLE * DEGREES,
                angle=(angle.get_value() - QUERY_ANGLE) * DEGREES,
                arc_center=CIRCLE_CENTER,
                color=ACCENT,
                stroke_width=4,
            )
        )
        readout = always_redraw(lambda: self.readout(angle.get_value()))
        identity = tex(r"norm(x - q)_2^2 = 2 (1 - cos(x, q))", font_size=28, color=INK)
        identity.move_to(COLUMN + DOWN * 1.75)
        equality = always_redraw(lambda: self.equality(angle.get_value(), identity))

        self.play(FadeIn(moving), Create(chord), Create(wedge), run_time=0.9)
        self.play(FadeIn(readout), FadeIn(identity), FadeIn(equality), run_time=0.8)
        self.wait(1.0)

        self.play(angle.animate.set_value(QUERY_ANGLE + 180.0), run_time=6.0, rate_func=smooth)
        self.wait(1.0)
        self.play(angle.animate.set_value(QUERY_ANGLE + 40.0), run_time=3.4, rate_func=smooth)
        self.wait(0.8)

        punchline = caption("Cosine falls exactly as distance rises. Never independently.", color=ACCENT)
        punchline.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(punchline), run_time=0.7)
        self.wait(2.4)

        for mobject in (moving, chord, wedge, readout, equality):
            mobject.clear_updaters()
        self.play(
            FadeOut(VGroup(moving, chord, wedge, readout, equality, identity, punchline, heading)),
            run_time=0.8,
        )

    def readout(self, degrees: float) -> VGroup:
        theta = (degrees - QUERY_ANGLE) * DEGREES
        cosine = float(np.cos(theta))
        distance = float(2 * np.sin(theta / 2))
        rows = VGroup(
            VGroup(
                label("angle", size=24, color=MUTED),
                label(f"{degrees - QUERY_ANGLE:.0f}°", size=30, color=ACCENT),
            ).arrange(RIGHT, buff=0.22),
            self.bar("cosine similarity", cosine, (cosine + 1) / 2, GOOD),
            self.bar("Euclidean distance", distance, distance / 2, L2),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.32)
        return rows.move_to(COLUMN + UP * 1.15)

    def bar(self, name: str, value: float, fraction: float, color: str) -> VGroup:
        track = Rectangle(width=3.4, height=0.22, stroke_color=DIM, stroke_width=1, fill_opacity=0)
        fill = Rectangle(
            width=max(3.4 * float(np.clip(fraction, 0.001, 1.0)), 0.001),
            height=0.22,
            stroke_width=0,
            fill_color=color,
            fill_opacity=0.9,
        )
        fill.align_to(track, LEFT).set_y(track.get_y())
        head = VGroup(
            label(name, size=22, color=MUTED),
            label(f"{value:+.2f}", size=24, color=color),
        ).arrange(RIGHT, buff=0.22)
        return VGroup(head, VGroup(track, fill)).arrange(DOWN, aligned_edge=LEFT, buff=0.12)

    def equality(self, degrees: float, anchor) -> VGroup:
        theta = (degrees - QUERY_ANGLE) * DEGREES
        distance = float(2 * np.sin(theta / 2))
        rows = VGroup(
            label(f"{distance ** 2:.3f}", size=26, color=L2),
            label("=", size=26, color=MUTED),
            label(f"{2 * (1 - np.cos(theta)):.3f}", size=26, color=GOOD),
        ).arrange(RIGHT, buff=0.25)
        return rows.next_to(anchor, DOWN, buff=0.25)

    # -- act three -----------------------------------------------------------

    def act_three_rankings(self) -> None:
        heading = title("So the two rankings are one ranking")
        heading.to_edge(UP, buff=0.35)
        self.play(Write(heading), run_time=1.2)

        dots, tags = VGroup(), VGroup()
        scored = []
        for name, degrees in DOCS_2D:
            point = self.tip(degrees, 1.0)
            dots.add(Dot(point, radius=0.09, color=L2))
            tag = tex(name, font_size=28, color=L2)
            tag.next_to(point, (point - CIRCLE_CENTER) / np.linalg.norm(point - CIRCLE_CENTER), buff=0.18)
            tags.add(tag)
            theta = (degrees - QUERY_ANGLE) * DEGREES
            scored.append((name, float(np.cos(theta)), float(2 * abs(np.sin(theta / 2)))))
        self.play(*[GrowFromCenter(d) for d in dots], FadeIn(tags), run_time=1.0)

        by_cosine = sorted(scored, key=lambda row: -row[1])
        by_distance = sorted(scored, key=lambda row: row[2])
        left = self.ranking("by cosine, high first", [(n, f"{c:+.2f}") for n, c, _ in by_cosine], GOOD)
        right = self.ranking("by distance, low first", [(n, f"{d:.2f}") for n, _, d in by_distance], L2)
        lists = VGroup(left, right).arrange(RIGHT, buff=0.5, aligned_edge=UP)
        lists.move_to(COLUMN + UP * 0.7)
        self.play(FadeIn(left, shift=UP * 0.15), run_time=0.7)
        self.play(FadeIn(right, shift=UP * 0.15), run_time=0.7)

        assert [row[0] for row in by_cosine] == [row[0] for row in by_distance]
        seal = VGroup(
            label("✓", size=34, color=GOOD),
            label("same order, every position", size=26, color=GOOD),
        ).arrange(RIGHT, buff=0.2)
        seal.next_to(lists, DOWN, buff=0.45)
        self.play(FadeIn(seal), run_time=0.7)
        self.wait(2.2)

        closing = label("Normalise first, and the choice stops mattering.", color=ACCENT)
        closing.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(closing), run_time=0.9)
        self.wait(2.6)
        self.play(
            FadeOut(
                VGroup(
                    heading, closing, seal, lists, dots, tags, self.stage, self.query, self.query_tag
                )
            ),
            run_time=1.0,
        )
        self.wait(0.4)

    def ranking(self, header: str, rows, color: str) -> VGroup:
        entries = VGroup(caption(header, color=MUTED).scale(0.85))
        for position, (name, value) in enumerate(rows, start=1):
            entries.add(
                VGroup(
                    label(f"{position}.", size=24, color=MUTED),
                    tex(name, font_size=26, color=color),
                    label(value, size=24, color=INK),
                ).arrange(RIGHT, buff=0.2)
            )
        entries.arrange(DOWN, aligned_edge=LEFT, buff=0.18)
        return panel(entries, pad=0.25)


# ---------------------------------------------------------------------------
# Act three: the drift itself. One corpus, two models, two failure modes.
# ---------------------------------------------------------------------------

DRIFT_SIDE = 5.2
DRIFT_CENTER = LEFT * 3.0 + DOWN * 0.25
DRIFT_RANGE = 2.0
DRIFT_COLUMN = RIGHT * 4.0

# Model A's map: two topical neighbourhoods and an unrelated billing corner.
MODEL_A = {
    "oven": (-1.15, 1.35),
    "yeast": (-0.55, 1.05),
    "sourdough": (-1.45, 0.55),
    "pizza": (-0.30, 0.30),
    "galaxy": (1.15, 1.20),
    "telescope": (1.45, 0.55),
    "invoice": (0.55, -1.35),
    "refund": (1.55, -0.65),
}
QUERY_A = np.array([-0.95, 0.95])
QUERY_TEXT = '"how hot should my oven be?"'

# Which side of its dot each caption hangs on, chosen so the labels stay
# readable in *both* layouts.
LABEL_SIDE = {
    "oven": UP,
    "yeast": UP,
    "sourdough": UP,
    "pizza": DOWN,
    "galaxy": UP,
    "telescope": UP,
    "invoice": DOWN,
    "refund": DOWN,
}

# Model B lays the same corpus out differently. The rotation alone would be a
# relabelling — it preserves every distance, so it could not change a single
# neighbour — and is here only to make the two coordinate systems visibly
# incomparable. The per-document nudges are the actual drift: they are what
# reshuffles who is nearest.
DRIFT_ROTATION = np.pi
DRIFT_NUDGE = {
    "oven": (0.35, 1.60),
    "yeast": (-0.15, -0.10),
    "pizza": (0.85, -0.80),
    "sourdough": (-0.30, 0.45),
    "galaxy": (0.10, -0.05),
    "telescope": (-0.10, 0.10),
}
THRESHOLD = 0.70  # the "close enough" radius somebody tuned once, against model A


def rotate(point, radians: float) -> np.ndarray:
    c, s = np.cos(radians), np.sin(radians)
    x, y = float(point[0]), float(point[1])
    return np.array([x * c - y * s, x * s + y * c])


QUERY_B = rotate(QUERY_A, DRIFT_ROTATION)
MODEL_B = {
    name: rotate(coords, DRIFT_ROTATION) + np.array(DRIFT_NUDGE.get(name, (0.0, 0.0)))
    for name, coords in MODEL_A.items()
}


def drift_point(coords) -> np.ndarray:
    scale = (DRIFT_SIDE / 2) / DRIFT_RANGE
    return DRIFT_CENTER + np.array([coords[0] * scale, coords[1] * scale, 0.0])


def neighbours(positions: dict, query) -> list[tuple[str, float]]:
    """Every document ranked by Euclidean distance from the query."""
    scored = [
        (name, float(np.linalg.norm(np.array(point) - np.array(query))))
        for name, point in positions.items()
    ]
    return sorted(scored, key=lambda row: row[1])


class DriftRedrawsTheMap(BlogScene):
    """Two ways a model swap breaks retrieval, and only one of them looks broken.

    Act one keeps the old document vectors and re-embeds only the query: the
    arithmetic still runs, the scores still look confident, and the answers
    are nonsense. Act two re-embeds everything: the answers are legitimate
    again, and they are different answers.
    """

    def construct(self) -> None:
        heading = title("Same corpus, new model")
        heading.to_edge(UP, buff=0.35)
        frame = Square(side_length=DRIFT_SIDE, color=MUTED, stroke_width=2, stroke_opacity=0.5)
        frame.move_to(DRIFT_CENTER)
        self.play(Write(heading), Create(frame), run_time=1.3)

        self.dots, self.tags = {}, {}
        for name, coords in MODEL_A.items():
            point = drift_point(coords)
            self.dots[name] = Dot(point, radius=0.08, color=INK)
            self.tags[name] = caption(name, color=MUTED).scale(0.7)
            self.tags[name].next_to(point, LABEL_SIDE[name], buff=0.11)
        self.play(
            *[GrowFromCenter(dot) for dot in self.dots.values()],
            *[FadeIn(tag) for tag in self.tags.values()],
            run_time=1.2,
        )

        # The query is the only accent-coloured thing on the map, so it needs
        # no floating label of its own to fight the document captions for room.
        self.query_dot = Dot(drift_point(QUERY_A), radius=0.11, color=ACCENT)
        self.ring = Circle(
            radius=THRESHOLD * (DRIFT_SIDE / 2) / DRIFT_RANGE,
            color=ACCENT,
            stroke_width=2,
            stroke_opacity=0.55,
        ).move_to(self.query_dot.get_center())
        header = caption(QUERY_TEXT, color=ACCENT).scale(0.9)
        header.move_to(DRIFT_COLUMN + UP * 2.75)
        legend = VGroup(
            VGroup(
                Dot(color=ACCENT, radius=0.075),
                caption("query", color=MUTED).scale(0.78),
            ).arrange(RIGHT, buff=0.14),
            VGroup(
                Circle(radius=0.12, color=ACCENT, stroke_width=2, stroke_opacity=0.6),
                caption(f"threshold {THRESHOLD:.2f}", color=MUTED).scale(0.78),
            ).arrange(RIGHT, buff=0.14),
        ).arrange(RIGHT, buff=0.5)
        legend.move_to(DRIFT_COLUMN + UP * 2.2)
        self.play(
            GrowFromCenter(self.query_dot), Create(self.ring), FadeIn(header), FadeIn(legend), run_time=1.0
        )

        board = self.board("model A query → model A vectors", MODEL_A, QUERY_A, GOOD)
        self.play(FadeIn(board, shift=LEFT * 0.2), run_time=0.9)
        self.wait(2.2)

        board = self.act_one_mixing(board)
        board = self.act_two_reembed(board)

        closing = label("The documents never moved. “Similar” did.", color=ACCENT)
        closing.to_edge(UP, buff=0.35)
        self.play(FadeOut(heading), run_time=0.4)
        self.play(Write(closing), run_time=1.5)
        self.wait(2.6)
        self.play(
            FadeOut(
                VGroup(
                    closing,
                    frame,
                    header,
                    legend,
                    self.ring,
                    self.query_dot,
                    board,
                    *self.dots.values(),
                    *self.tags.values(),
                )
            ),
            run_time=1.0,
        )
        self.wait(0.4)

    # -- act one: two maps at once -------------------------------------------

    def act_one_mixing(self, board: VGroup) -> VGroup:
        banner = self.banner("Re-embed the query only", BAD)
        self.play(FadeIn(banner), run_time=0.6)

        target = drift_point(QUERY_B)
        self.play(
            self.query_dot.animate.move_to(target),
            self.ring.animate.move_to(target),
            run_time=1.6,
        )
        self.play(
            Flash(target, color=BAD, line_length=0.22, num_lines=14, flash_radius=0.32),
            run_time=0.7,
        )

        replacement = self.board("model B query → model A vectors", MODEL_A, QUERY_B, BAD)
        self.play(FadeOut(board), FadeIn(replacement, shift=LEFT * 0.2), run_time=0.8)
        note = VGroup(
            caption("Every number still computes, and every score looks confident.", color=BAD),
            caption("A question about bread just retrieved the billing corner.", color=BAD),
        ).arrange(DOWN, buff=0.14)
        note.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(note), run_time=0.7)
        self.wait(3.0)
        self.play(FadeOut(note), FadeOut(banner), run_time=0.6)
        return replacement

    # -- act two: one map again, drawn differently ---------------------------

    def act_two_reembed(self, board: VGroup) -> VGroup:
        banner = self.banner("Re-embed the whole corpus", ACCENT)
        self.play(FadeIn(banner), run_time=0.6)

        moves = []
        for name, coords in MODEL_B.items():
            point = drift_point(coords)
            moves.append(self.dots[name].animate.move_to(point))
            moves.append(self.tags[name].animate.next_to(point, LABEL_SIDE[name], buff=0.11))
        self.play(*moves, run_time=2.8, rate_func=smooth)

        replacement = self.board("model B query → model B vectors", MODEL_B, QUERY_B, GOOD)
        self.play(FadeOut(board), FadeIn(replacement, shift=LEFT * 0.2), run_time=0.8)
        note = VGroup(
            caption("Comparable again — and answering with different documents.", color=INK),
            caption(f"“oven” fell out of the {THRESHOLD:.2f} threshold nobody re-tuned.", color=MUTED),
        ).arrange(DOWN, buff=0.14)
        note.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(note), run_time=0.7)
        self.wait(3.2)
        self.play(FadeOut(note), FadeOut(banner), run_time=0.6)
        return replacement

    # -- pieces --------------------------------------------------------------

    def banner(self, text: str, color: str) -> VGroup:
        block = panel(VGroup(label(text, size=24, color=color)), pad=0.2, stroke=color)
        return block.move_to(DRIFT_COLUMN + UP * 1.5)

    def board(self, header: str, positions: dict, query, color: str) -> VGroup:
        ranked = neighbours(positions, query)
        inside = [name for name, distance in ranked if distance <= THRESHOLD]

        rows = VGroup(caption(header, color=color).scale(0.85))
        for position, (name, distance) in enumerate(ranked[:3], start=1):
            rows.add(
                VGroup(
                    label(f"{position}.", size=24, color=MUTED),
                    label(name, size=27, color=INK),
                    label(f"{distance:.2f}", size=24, color=color),
                ).arrange(RIGHT, buff=0.2)
            )
        rows.add(
            VGroup(
                label("within threshold:", size=22, color=MUTED),
                label(", ".join(inside) if inside else "nothing", size=22, color=color),
            ).arrange(RIGHT, buff=0.15)
        )
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        return panel(rows).move_to(DRIFT_COLUMN + DOWN * 0.55)