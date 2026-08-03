"""Shared helpers for the blog's Manim scenes.

Deliberately empty of re-exports: scenes import the submodules they need
directly (`from mfblog.theme import ...`). Listing every submodule here would
make this file change whenever the toolkit grows, and since it runs on every
import it would drag every post's video cache down with it.
"""
