"""LaTeX-free math typesetting for Manim, via Typst.

Manim's ``Tex``/``MathTex`` shell out to a LaTeX installation. Rather than
pull a multi-gigabyte TeX distribution into the toolchain for a handful of
formulas, these helpers hand the markup to ``typst`` (which bundles New
Computer Modern, the same face TeX uses) and load the resulting SVG with
``SVGMobject``.

The practical differences from ``MathTex``:

* Markup is Typst's, not LaTeX's: ``norm(x)_2 = sqrt(sum_(i=1)^n x_i^2)``.
* Colour is applied *inside* the markup with :func:`hl`, which reads better
  than counting glyph indices the way ``MathTex(...)[3]`` forces you to.
* Rendered SVGs are cached in ``manim/.cache/typst`` keyed by content hash,
  so re-rendering a scene never re-typesets anything.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
from pathlib import Path

from manim import RIGHT, SVGMobject, VGroup

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "typst"

# Typst always renders at _REFERENCE_PT and the result is scaled down here,
# so that `font_size` means the same thing it does for Manim's own `Text`
# (calibrated by matching cap heights). That lets Typst formulas and Text
# labels share a frame without one of them looking off.
_REFERENCE_PT = 100.0
_UNITS_PER_FONT_SIZE = 1.3455e-4

_TEMPLATE = """\
#set page(width: auto, height: auto, margin: 0pt, fill: none)
#set text(size: {size}pt, fill: rgb("{color}"))
{preamble}
{body}
"""


def _typst_binary() -> str:
    binary = shutil.which("typst")
    if binary is None:
        raise RuntimeError(
            "typst not found on PATH. Install it with `brew install typst`; "
            "it stands in for LaTeX in the blog's Manim scenes."
        )
    return binary


def _compile(source: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    svg_path = CACHE_DIR / f"{digest}.svg"
    if svg_path.exists():
        return svg_path

    typ_path = CACHE_DIR / f"{digest}.typ"
    typ_path.write_text(source, encoding="utf-8")
    try:
        subprocess.run(
            [_typst_binary(), "compile", "--format", "svg", str(typ_path), str(svg_path)],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:  # pragma: no cover - dev aid
        raise RuntimeError(f"typst failed on:\n{source}\n\n{exc.stderr}") from exc
    finally:
        typ_path.unlink(missing_ok=True)
    return svg_path


def hl(markup: str, color: str) -> str:
    """Colour a fragment of Typst *math* markup: ``hl("norm(x)_1", L1)``."""
    return f'#text(fill: rgb("{color}"))[${markup}$]'


def tex(
    body: str,
    *,
    font_size: float = 44,
    color: str = "#ffffff",
    preamble: str = "",
    math: bool = True,
) -> SVGMobject:
    """Typeset ``body`` (Typst markup) and return it as an ``SVGMobject``.

    With ``math=True`` the body is wrapped in ``$ ... $``, so callers can
    write bare formulas.
    """
    source = _TEMPLATE.format(
        size=_REFERENCE_PT,
        color=color,
        preamble=preamble,
        body=f"$ {body} $" if math else body,
    )
    mobject = SVGMobject(
        _compile(source),
        height=None,
        width=None,
        should_center=True,
        stroke_width=0,
        use_svg_cache=False,
    )
    return mobject.scale(font_size * _UNITS_PER_FONT_SIZE)


def texs(*bodies: str, buff: float = 0.25, **kwargs) -> VGroup:
    """Several formulas laid out left to right."""
    return VGroup(*(tex(b, **kwargs) for b in bodies)).arrange(RIGHT, buff=buff)
