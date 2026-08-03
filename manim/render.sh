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
#
# Changing the quality flags or the WebM encoder settings below changes every
# post's output without changing any post's sources, which the delivery cache
# cannot detect on its own: bump RECIPE in manim/prepare-video-cache.sh in the
# same commit. Adding a post here needs no bump.

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
  0002)
    source="manim/p0002_what_are_embeddings.py"
    default_scenes="EmbeddingsAreAMap CosineMeetsEuclidean DriftRedrawsTheMap"
    ;;
  0003)
    source="manim/p0003_how_are_embeddings_trained.py"
    default_scenes="TheExamAndItsTemperature AlignmentAndUniformity RotationIsInvisible"
    ;;
  0004)
    source="manim/p0004_what_are_drift.py"
    default_scenes="AnchorCosineLies NeighborsAreTheAPI TheProcrustesBridge"
    ;;
  0005)
    source="manim/p0005_linear_regression.py"
    default_scenes="LossChoosesTheLine LeastSquaresIsAProjection GradientDescentFindsTheLine"
    ;;
  0006)
    source="manim/p0006_classification_vs_regression.py"
    default_scenes="ConfidentlyRightGetsFined TheGradientDiesWhereItHurts OneScorerManyProducts"
    ;;
  *)
    echo "Usage: manim/render.sh {0001|0002|0003|0004|0005|0006} [--final] [--if-missing] [scene ...]" >&2
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

stem_for_scene() {
  case "$post:$1" in
    0001:NearestNeighborIsADecision) echo "nearest-neighbor-is-a-decision" ;;
    0001:UnitBallsAndSparsity) echo "unit-balls-and-sparsity" ;;
    0001:HighDimensionsAreWeird) echo "high-dimensions-are-weird" ;;
    0002:EmbeddingsAreAMap) echo "embeddings-are-a-map" ;;
    0002:CosineMeetsEuclidean) echo "cosine-meets-euclidean" ;;
    0002:DriftRedrawsTheMap) echo "drift-redraws-the-map" ;;
    0003:TheExamAndItsTemperature) echo "the-exam-and-its-temperature" ;;
    0003:AlignmentAndUniformity) echo "alignment-and-uniformity" ;;
    0003:RotationIsInvisible) echo "rotation-is-invisible" ;;
    0004:AnchorCosineLies) echo "anchor-cosine-lies" ;;
    0004:NeighborsAreTheAPI) echo "neighbors-are-the-api" ;;
    0004:TheProcrustesBridge) echo "the-procrustes-bridge" ;;
    0005:LossChoosesTheLine) echo "loss-chooses-the-line" ;;
    0005:LeastSquaresIsAProjection) echo "least-squares-is-a-projection" ;;
    0005:GradientDescentFindsTheLine) echo "gradient-descent-finds-the-line" ;;
    0006:ConfidentlyRightGetsFined) echo "confidently-right-gets-fined" ;;
    0006:TheGradientDiesWhereItHurts) echo "the-gradient-dies-where-it-hurts" ;;
    0006:OneScorerManyProducts) echo "one-scorer-many-products" ;;
    *)
      echo "Unknown scene for post $post: $1" >&2
      exit 2
      ;;
  esac
}

# Keep cached delivery pairs, but batch every missing scene from a post into
# one Manim process. A post's scenes share a source module, so CI either
# restores the complete post cache or renders the complete post in one pass.
targets=""
for scene do
  stem=$(stem_for_scene "$scene")
  destination="$output/$post-$stem"
  if [ "$skip_existing" = true ] && [ -s "$destination.mp4" ] && [ -s "$destination.webm" ]; then
    echo "Using cached delivery video: $destination"
  else
    targets="$targets $scene"
  fi
done

if [ -z "$targets" ]; then
  echo "All delivery videos are available."
  exit 0
fi

# Intentional word splitting: scene names cannot contain whitespace and the
# Manim CLI accepts all requested scene names after the source file.
# shellcheck disable=SC2086
"$python" $render_args --disable_caching --media_dir "$media" "$source" $targets

for scene in $targets; do
  stem=$(stem_for_scene "$scene")
  destination="$output/$post-$stem"
  input="$media/videos/$(basename "$source" .py)/$folder/$scene.mp4"
  cp "$input" "$destination.mp4"
  ffmpeg -y -i "$input" \
    -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -tile-columns 2 -an \
    "$destination.webm"
done


echo "Wrote delivery videos to $output"
