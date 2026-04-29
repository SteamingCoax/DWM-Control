# DWM Control Internal Release Reference

This is an internal reference for repeatable local builds and publishing.

## 1) Quick Local Build Commands

From repo root:

- Install dependencies:
  npm install

- Run app locally:
  npm start

- Build current platform only:
  npm run build

- Build macOS artifacts:
  npm run build:mac

- Build unsigned macOS (local testing):
  npm run build:mac:unsigned

- Build Windows artifacts:
  npm run build:win

- Build Linux artifacts:
  npm run build:linux

- Build all targets:
  npm run build:all

Artifacts are written to:
- dist/

## 2) Publish a New Version (Recommended)

Use the publish helper script:

- Command:
  npm run release:publish -- 1.1.2

What this does:
- Validates clean git working tree
- Sets package version in package.json
- Commits release bump
- Creates annotated git tag (vX.Y.Z)
- Pushes commit and tag to origin
- Creates GitHub release if missing
- Triggers GitHub Actions release workflow to build and upload assets

## 3) One-Time Prerequisites for Publishing

- Git remote origin configured and push access available
- GitHub CLI installed (gh)
- GitHub CLI authenticated:
  gh auth login
- Self-hosted runners online:
  - macOS runner
  - Linux runner (also used for Windows cross-build)
- GitHub secrets configured for mac signing:
  - MAC_CERT_P12
  - MAC_CERT_PASSWORD

## 4) Manual Publish Alternative (If Needed)

If script is not used, run steps manually:

1. Ensure clean branch and pull latest:
   git status
   git pull

2. Set version without auto tag:
   npm version 1.1.2 --no-git-tag-version

3. Commit:
   git add package.json package-lock.json
   git commit -m "chore(release): v1.1.2"

4. Tag and push:
   git tag -a v1.1.2 -m "Release v1.1.2"
   git push origin HEAD
   git push origin v1.1.2

5. Optionally create release entry if needed:
   gh release create v1.1.2 --title "DWM Control v1.1.2" --generate-notes

## 5) Trigger Workflow Manually

The release workflow supports manual dispatch with input:
- release_tag (example: v1.1.2)

Use this when re-running uploads for an existing tag/release.

## 6) Post-Publish Verification Checklist

- GitHub Actions workflow completed successfully for:
  - Publish macOS
  - Publish Windows
  - Publish Linux
- GitHub release contains expected assets:
  - macOS Intel DMG
  - macOS Apple Silicon ZIP
  - Windows Setup EXE
  - Linux AppImage
  - Linux DEB
  - latest*.yml metadata files
- In-app updater test:
  - Check updates
  - Download update
  - Install and restart flow

## 7) Common Failure Causes

- Dirty working tree prevents script execution
- Existing local or remote tag with same version
- gh not authenticated
- Missing runner dependencies (wine, Xvfb, makensis)
- Missing mac signing secrets
