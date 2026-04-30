#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--republish] <version>"
  echo ""
  echo "  $0 1.2.3              Create a new release and trigger CI build"
  echo "  $0 --republish 1.2.3  Retrigger CI on an existing tag/release (no new tag or version bump)"
  exit 1
}

REPUBLISH=false
if [[ "${1:-}" == "--republish" ]]; then
  REPUBLISH=true
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
fi

version_input="$1"
version="${version_input#v}"
tag="v${version}"

# Accept SemVer core, optional prerelease, optional build metadata.
# Examples: 1.2.3, 1.2.3-republish.1, 1.2.3+build.7, 1.2.3-beta.2+sha.abc123
if ! [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?(\+([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?$ ]]; then
  echo "Error: version must be valid SemVer, e.g. 1.2.3 or 1.2.3-republish.1"
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is not installed"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login"
  exit 1
fi

if [[ "$REPUBLISH" == "true" ]]; then
  # ── Republish mode ──────────────────────────────────────────────────────────
  # Retrigger CI on an existing tag. No version bump, no new commit, no new tag.

  echo "Republish mode: retriggering CI for existing release $tag"

  if ! git ls-remote --tags origin "refs/tags/$tag" | grep -q "$tag"; then
    echo "Error: remote tag $tag does not exist. Use normal publish to create it first."
    exit 1
  fi

  if ! gh release view "$tag" >/dev/null 2>&1; then
    echo "Error: GitHub release $tag does not exist. Use normal publish to create it first."
    exit 1
  fi

  echo "Triggering workflow dispatch on $tag"
  gh workflow run release.yml --ref "$tag" --field release_tag="$tag"

  echo ""
  echo "CI rebuild triggered for $tag."
  echo "New artifacts will overwrite existing release assets once the workflow completes."
  exit 0
fi

# ── Normal publish mode ───────────────────────────────────────────────────────

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Error: local tag $tag already exists"
  exit 1
fi

if git ls-remote --tags origin "refs/tags/$tag" | grep -q "$tag"; then
  echo "Error: remote tag $tag already exists"
  exit 1
fi

echo "Setting package version to $version"
npm version "$version" --no-git-tag-version

if [[ -f package-lock.json ]]; then
  git add package.json package-lock.json
else
  git add package.json
fi

git commit -m "chore(release): $tag"
git tag -a "$tag" -m "Release $tag"

echo "Pushing commit and tag"
git push origin HEAD
git push origin "$tag"

if ! gh release view "$tag" >/dev/null 2>&1; then
  echo "Creating GitHub release $tag"
  gh release create "$tag" \
    --title "DWM Control $tag" \
    --generate-notes
fi

echo "Release process started for $tag"
echo "GitHub Actions workflow will build and upload assets to release $tag"
