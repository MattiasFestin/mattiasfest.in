#!/bin/sh
# Render the Manim figures for one post, then make web delivery copies.
#
# Requirements (macOS):
#   brew install cairo typst ffmpeg
#   python3.11 -m venv .venv-manim
#   .venv-manim/bin/pip install manim
#
# Usage from the repository root:
#   manim/render.sh 0001          # fast, 854×480 review render
#   manim/render.sh 0001 --final  # 1920×1080 delivery render
#
# The source MP4s are copied to static/videos/ alongside WebM (VP9), so
# browsers select the smaller format first and Safari still has a native
# fallback. Both delivery files are ignored by no build step and are served
# directly by Zola.

set -eu

post=${1:-}
quality=${2:-}
if [ "$post" != "0001" ]; then
  echo "Usage: manim/render.sh 0001 [--final]" >&2
  exit 2
fi
if [ "$quality" != "" ] && [ "$quality" != "--final" ]; then
  echo "Unknown option: $quality" >&2
  exit 2
fi

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python="$root/.venv-manim/bin/manim"
source="$root/manim/p0001_linear_vector_spaces.py"
media="$root/.cache/manim-delivery"
output="$root/static/videos"

if [ ! -x "$python" ]; then
  echo "Missing .venv-manim. See the requirements at the top of this script." >&2
  exit 1
fi

mkdir -p "$media" "$output"

if [ "$quality" = "--final" ]; then
  render_args="-qh"
  folder="1080p60"
else
  render_args="-qm"
  folder="720p30"
fi

for scene in NearestNeighborIsADecision UnitBallsAndSparsity HighDimensionsAreWeird; do
  "$python" $render_args --disable_caching --media_dir "$media" "$source" "$scene"
  input="$media/videos/p0001_linear_vector_spaces/$folder/$scene.mp4"
  case "$scene" in
    NearestNeighborIsADecision) stem="nearest-neighbor-is-a-decision" ;;
    UnitBallsAndSparsity) stem="unit-balls-and-sparsity" ;;
    HighDimensionsAreWeird) stem="high-dimensions-are-weird" ;;
  esac
  destination="$output/0001-$stem"
  cp "$input" "$destination.mp4"
  ffmpeg -y -i "$input" \
    -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -tile-columns 2 -an \
    "$destination.webm"
done

echo "Wrote delivery videos to $output"
