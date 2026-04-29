#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <version>"
  echo "Example: $0 1.2.3"
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

version_input="$1"
version="${version_input#v}"
tag="v${version}"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semantic format like 1.2.3"
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
