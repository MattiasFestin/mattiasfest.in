#!/bin/sh
# Validate a restored all-video cache and retain only delivery pairs whose
# rendering inputs still match. actions/cache entries are immutable, so this
# prepares a partial update that the cache action saves as a new full entry.
#
# The fingerprint is deliberately narrow: a post is re-rendered when the
# toolchain, its own scene module, or a shared helper it actually imports
# changes. Adding a post, or a helper only newer posts use, leaves the back
# catalogue's videos alone — a full re-render is roughly an hour of CI.

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

output="static/videos"
manifest="$output/.manim-cache-manifest"
tmp_manifest="$manifest.$$"

# Bumped when the meaning of a manifest entry changes. Entries written under
# an older scheme are adopted once rather than thrown away; see prepare_post.
SCHEME=2

# The rendering recipe: the resolution, frame rate and WebM encoder settings
# in manim/render.sh. Bump this when any of those change. The script itself is
# not fingerprinted, because the fact that it learned about a new post says
# nothing about how the existing posts were rendered.
RECIPE=1

mkdir -p "$output"
trap 'rm -f "$tmp_manifest"' 0 HUP INT TERM

# The `from mfblog.<module> import ...` lines in a source file. Every scene
# module and helper states its dependencies that way, one module per line, so
# a grep is an honest substitute for an import graph.
imports_of() {
  sed -n 's/^from mfblog\.\([A-Za-z_][A-Za-z_0-9]*\).*/\1/p' "$1" | sort -u
}

# Those imports followed transitively, so a helper that leans on another
# helper still drags the right files into the fingerprint.
shared_modules() {
  pending=$(imports_of "$1")
  found=""

  while [ -n "$pending" ]; do
    next=""
    for module in $pending; do
      case " $found " in
        *" $module "*) continue ;;
      esac
      found="$found $module"
      next="$next $(imports_of "manim/mfblog/$module.py")"
    done
    pending=$next
  done

  # __init__.py runs on any mfblog import, so it is always an input.
  {
    echo "manim/mfblog/__init__.py"
    for module in $found; do
      echo "manim/mfblog/$module.py"
    done
  } | sort -u
}

fingerprint() {
  {
    printf 'recipe %s\n' "$RECIPE"
    # Intentional word splitting: shared_modules emits one path per line and
    # none of them can contain whitespace.
    # shellcheck disable=SC2046
    shasum -a 256 \
      requirements.txt \
      requirements-manim.txt \
      "$1" \
      $(shared_modules "$1")
  } | shasum -a 256 | awk '{ print $1 }'
}

has_delivery_pairs() {
  for file in "$output/$1-"*.mp4; do
    if [ -s "$file" ]; then
      return 0
    fi
  done
  return 1
}

scheme=""
if [ -f "$manifest" ]; then
  scheme=$(awk '$1 == "#scheme" { print $2; exit }' "$manifest")
fi
printf '#scheme %s\n' "$SCHEME" > "$tmp_manifest"

prepare_post() {
  post="$1"
  content="$2"
  source="$3"

  if [ ! -f "$content" ]; then
    echo "Post $post is not published in this build; removing its delivery pairs."
    rm -f "$output/$post-"*.mp4 "$output/$post-"*.webm
    return
  fi

  expected=$(fingerprint "$source")
  cached=""

  if [ -f "$manifest" ]; then
    cached=$(awk -v post="$post" '$1 == post { print $2; exit }' "$manifest")
  fi

  if [ "$cached" = "$expected" ]; then
    echo "Video cache is valid for post $post."
  elif [ "$scheme" != "$SCHEME" ] && [ -n "$cached" ] && has_delivery_pairs "$post"; then
    # One-time migration. The entry was written by an older scheme that
    # validated these same files against these same sources under a coarser
    # rule, so re-fingerprinting them is bookkeeping rather than a licence to
    # keep something stale.
    echo "Adopting pre-scheme-$SCHEME delivery pairs for post $post."
  else
    echo "Video cache is stale or absent for post $post; removing its delivery pairs."
    rm -f "$output/$post-"*.mp4 "$output/$post-"*.webm
  fi

  printf '%s %s\n' "$post" "$expected" >> "$tmp_manifest"
}

prepare_post 0001 content/blog/0001-linear-vector-spaces.md manim/p0001_linear_vector_spaces.py
prepare_post 0002 content/blog/0002-what-are-embeddings.md manim/p0002_what_are_embeddings.py
prepare_post 0003 content/blog/0003-how-are-embeddings-trained.md manim/p0003_how_are_embeddings_trained.py
prepare_post 0004 content/blog/0004-what-are-drift.md manim/p0004_what_are_drift.py
prepare_post 0005 content/blog/0005-linear-regression.md manim/p0005_linear_regression.py
prepare_post 0006 content/blog/0006-classification-vs-regression.md manim/p0006_classification_vs_regression.py
prepare_post 0007 content/blog/0007-logistic-regression.md manim/p0007_logistic_regression.py
mv "$tmp_manifest" "$manifest"
