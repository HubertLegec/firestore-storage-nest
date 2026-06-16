---
name: release
description: Cut a new release of `@hubert.legec/firestore-storage-nest` by setting the version in `package.json`, pushing to `main`, and pushing a matching `v<version>` tag. CI takes over from there. Use when the user says "release", "publish", "ship a new version", or asks to cut a release of this package.
---

# Release `@hubert.legec/firestore-storage-nest`

All publishing work is handled by `.github/workflows/release.yml`. This skill only
covers the **manual** steps a human (or Claude) must do before CI takes over:

1. Make sure `package.json` has the version you want to ship.
2. Push that to `main`.
3. Create and push the matching `v<version>` tag.

Everything after the tag push — npm publish, GitHub release notes, patch bump on
`main` — is CI's job. Do not duplicate it here.

## Preconditions

Verify all of these before tagging. If any fails, stop and report.

- Current branch is `main`.
- Working tree is clean (`git status --porcelain` empty).
- `main` is in sync with `origin/main` after `git fetch`.
- The tag `v<version>` from `package.json` does **not** already exist locally or on
  the remote (`git tag -l "v$VERSION"` and `git ls-remote --tags origin "v$VERSION"`
  both empty).

## Tag and push

Resolve `VERSION` from `package.json` (`node -p "require('./package.json').version"`).

```bash
git tag "v$VERSION"
git push origin "v$VERSION"
```

State the tag back to the user and stop. CI handles the rest.