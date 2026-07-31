#!/bin/sh
# Validate a restored all-video cache and retain only delivery pairs whose
# rendering inputs still match. actions/cache entries are immutable, so this
# prepares a partial update that the cache action saves as a new full entry.

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

output="static/videos"
manifest="$output/.manim-cache-manifest"
tmp_manifest="$manifest.$$"

mkdir -p "$output"
trap 'rm -f "$tmp_manifest"' 0 HUP INT TERM

fingerprint() {
  shasum -a 256 \
    requirements.txt \
    requirements-manim.txt \
    manim/render.sh \
    manim/prepare-video-cache.sh \
    "$1" \
    manim/mfblog/*.py \
    | shasum -a 256 \
    | awk '{ print $1 }'
}

prepare_post() {
  post="$1"
  source="$2"
  expected=$(fingerprint "$source")
  cached=""

  if [ -f "$manifest" ]; then
    cached=$(awk -v post="$post" '$1 == post { print $2; exit }' "$manifest")
  fi

  if [ "$cached" = "$expected" ]; then
    echo "Video cache is valid for post $post."
  else
    echo "Video cache is stale or absent for post $post; removing its delivery pairs."
    rm -f "$output/$post-"*.mp4 "$output/$post-"*.webm
  fi

  printf '%s %s\n' "$post" "$expected" >> "$tmp_manifest"
}

prepare_post 0001 manim/p0001_linear_vector_spaces.py
prepare_post 0005 manim/p0005_linear_regression.py
mv "$tmp_manifest" "$manifest"
