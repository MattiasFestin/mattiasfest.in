"""Shared look and feel for the blog's Manim scenes.

The palette deliberately reuses the hexes already baked into the posts'
inline SVG figures (the L1/L2/L-infinity unit-ball drawing in post 0001),
so a reader who scrolls from the figure to the video sees the same three
colours meaning the same three things.
"""

from __future__ import annotations

from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Mobject,
    Scene,
    Text,
    ThreeDScene,
    VGroup,
    always_redraw,
    config,
)

# Background: not pure black. A hair of blue keeps the dark figure from
# looking like a hole punched in the (white) page around it.
BG = "#0d1016"

# Norm colours, matching the post's inline SVG.
L1 = "#e74c3c"
L2 = "#3f9fe0"
LINF = "#2ecc71"

ACCENT = "#f5c542"  # "look here"
INK = "#e8ecf1"  # primary text
MUTED = "#8a94a6"  # axes, secondary text
DIM = "#4a5262"  # grid lines
GOOD = "#2ecc71"
BAD = "#e74c3c"

TITLE_SIZE = 40
BODY_SIZE = 30
LABEL_SIZE = 26

# DejaVu Sans is present on GitHub's Ubuntu runners and is widely available
# on Linux, avoiding Pango's nondeterministic fallback for macOS-only fonts.
FONT = "DejaVu Sans"


def label(text: str, size: float = BODY_SIZE, color: str = INK, **kwargs) -> Text:
    """Sans-serif prose label. Formulas should use `typst.tex` instead."""
    return Text(text, font=FONT, font_size=size, color=color, **kwargs)


def title(text: str, color: str = INK) -> Text:
    return label(text, size=TITLE_SIZE, color=color, weight="MEDIUM")


def caption(text: str, color: str = MUTED) -> Text:
    return label(text, size=LABEL_SIZE, color=color)


def corner_note(*lines: str) -> VGroup:
    """A small stack of text pinned to the bottom-left, used for asides."""
    group = VGroup(*(caption(line) for line in lines)).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
    return group.to_corner(LEFT + DOWN)


def axis_numbers(axes, values, *, axis: str = "x", size: float = 22, color: str = MUTED, buff: float = 0.25) -> VGroup:
    """Tick labels for an `Axes`.

    Manim's own `add_coordinates` builds `DecimalNumber`s out of `MathTex`,
    which needs a LaTeX install; these are typeset with Typst like every
    other formula in these scenes.
    """
    from mfblog.typst import tex

    group = VGroup()
    for value in values:
        text = tex(f"{value:g}", font_size=size, color=color)
        anchor = axes.c2p(value, 0) if axis == "x" else axes.c2p(0, value)
        text.next_to(anchor, DOWN if axis == "x" else LEFT, buff=buff)
        group.add(text)
    return group


class BlogScene(Scene):
    """2D scene with the blog's background."""

    def setup(self) -> None:
        super().setup()
        self.camera.background_color = BG


class BlogScene3D(ThreeDScene):
    """3D scene with the blog's background."""

    def setup(self) -> None:
        super().setup()
        self.camera.background_color = BG

    def add_fixed_redraw(self, func) -> Mobject:
        """An `always_redraw` HUD element that stays pinned to the frame.

        `add_fixed_in_frame_mobjects` snapshots the mobject's *family* into
        the camera's fixed set, but `always_redraw` replaces that family on
        every frame — so the freshly built submobjects would be drawn as 3D
        geometry instead. Re-registering after each rebuild keeps them flat.
        """
        mobject = always_redraw(func)
        self.add_fixed_in_frame_mobjects(mobject)
        mobject.add_updater(lambda m: self.camera.add_fixed_in_frame_mobjects(m))
        return mobject


def frame_top(margin: float = 0.45) -> float:
    return config.frame_height / 2 - margin


def frame_bottom(margin: float = 0.45) -> float:
    return -config.frame_height / 2 + margin


__all__ = [
    "ACCENT",
    "BAD",
    "BG",
    "BODY_SIZE",
    "BlogScene",
    "BlogScene3D",
    "DIM",
    "DOWN",
    "GOOD",
    "INK",
    "L1",
    "L2",
    "LABEL_SIZE",
    "LEFT",
    "LINF",
    "MUTED",
    "RIGHT",
    "TITLE_SIZE",
    "UP",
    "axis_numbers",
    "caption",
    "corner_note",
    "frame_bottom",
    "frame_top",
    "label",
    "title",
]
