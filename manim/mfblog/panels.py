"""Faint cards to sit behind readouts, legends and comparison tables.

Kept apart from `theme.py` on purpose. A post's delivery videos are cached
against the shared modules it actually imports, so growing the toolkit in a
new module leaves every earlier post's cache valid instead of forcing a
re-render of the whole back catalogue.
"""

from manim import Rectangle, VGroup

from mfblog.theme import DIM

# Fill for the small cards that sit behind readouts and legends, so text
# never has to compete with whatever geometry it happens to overlap.
CARD = "#151b25"


def panel(content: VGroup, pad: float = 0.3, stroke: str = DIM) -> VGroup:
    """Put a faint card behind a group of mobjects."""
    background = Rectangle(
        width=content.width + 2 * pad,
        height=content.height + 2 * pad,
        fill_color=CARD,
        fill_opacity=0.95,
        stroke_color=stroke,
        stroke_width=1,
    ).move_to(content.get_center())
    return VGroup(background, content)


__all__ = ["CARD", "panel"]
