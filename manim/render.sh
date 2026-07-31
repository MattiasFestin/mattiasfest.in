#!/bin/sh
# Render the Manim figures for one post, then make web delivery copies.
#
# Requirements (macOS):
#   brew install cairo typst ffmpeg
#   python3.11 -m venv .venv-manim
#   .venv-manim/bin/pip install -r requirements-manim.txt
#
# Usage from the repository root:
#   manim/render.sh 0001                       # 720p/30fps review render
#   manim/render.sh 0005 --final               # 1080p/60fps delivery render
#   manim/render.sh 0001 --final --if-missing  # render only absent delivery pairs
#   manim/render.sh 0005 --final SceneName     # one scene only
#
# `static/videos/` is intentionally gitignored. CI runs `render:manim` before
# Zola builds public/, so generated delivery files are deploy artifacts rather
# than workstation-specific repository content.

set -eu

post=${1:-}
shift || true
quality=""
skip_existing=false

case "$post" in
  0001)
    source="manim/p0001_linear_vector_spaces.py"
    default_scenes="NearestNeighborIsADecision UnitBallsAndSparsity HighDimensionsAreWeird"
    ;;
  0005)
    source="manim/p0005_linear_regression.py"
    default_scenes="LossChoosesTheLine LeastSquaresIsAProjection GradientDescentFindsTheLine"
    ;;
  *)
    echo "Usage: manim/render.sh {0001|0005} [--final] [--if-missing] [scene ...]" >&2
    exit 2
    ;;
esac

while [ "$#" -gt 0 ]; do
  case "$1" in
    --final)
      quality="--final"
      shift
      ;;
    --if-missing)
      skip_existing=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -eq 0 ]; then
  # Intentional word splitting: this turns the selected post's scene list into
  # positional arguments without requiring Bash arrays.
  set -- $default_scenes
fi

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python="$root/.venv-manim/bin/manim"
source="$root/$source"
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

for scene do
  case "$post:$scene" in
    0001:NearestNeighborIsADecision) stem="nearest-neighbor-is-a-decision" ;;
    0001:UnitBallsAndSparsity) stem="unit-balls-and-sparsity" ;;
    0001:HighDimensionsAreWeird) stem="high-dimensions-are-weird" ;;
    0005:LossChoosesTheLine) stem="loss-chooses-the-line" ;;
    0005:LeastSquaresIsAProjection) stem="least-squares-is-a-projection" ;;
    0005:GradientDescentFindsTheLine) stem="gradient-descent-finds-the-line" ;;
    *)
      echo "Unknown scene for post $post: $scene" >&2
      exit 2
      ;;
  esac

  destination="$output/$post-$stem"
  if [ "$skip_existing" = true ] && [ -s "$destination.mp4" ] && [ -s "$destination.webm" ]; then
    echo "Using cached delivery video: $destination"
    continue
  fi

  "$python" $render_args --disable_caching --media_dir "$media" "$source" "$scene"
  input="$media/videos/$(basename "$source" .py)/$folder/$scene.mp4"
  cp "$input" "$destination.mp4"
  ffmpeg -y -i "$input" \
    -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -tile-columns 2 -an \
    "$destination.webm"
done

echo "Wrote delivery videos to $output"
