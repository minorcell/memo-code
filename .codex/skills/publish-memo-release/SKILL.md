---
name: publish-memo-release
description: 'End-to-end workflow for publishing a new memo-cli version through the dev-to-main path: bump package.json version on dev, commit and push dev, open and merge a dev-to-main pull request, sync main, create and push git tag, verify tag-triggered GitHub Actions CI, and publish a detailed English GitHub Release note. Use when users ask to release, publish, cut, or ship a new memo version.'
---

# Publish Memo Release

Execute the following release workflow exactly in order.

## Inputs

Collect these values before making changes:

- Target version (for example `0.8.3`).
- Release scope (features/fixes/docs/chore highlights).
- Confirm push/merge permission for `dev` and `main`.

## Workflow

1. Ensure clean git context and branch

- Run `git status --short` and stop if unrelated uncommitted changes could pollute the release commit.
- Run `git checkout dev`.
- Run `git pull origin dev`.

2. Bump version on `dev`

- Edit root `package.json` `version` field to the target version.
- If lockfile or other generated files change due to version policy, include them in the same commit.

3. Commit and push `dev`

- Use commit message: `chore: release v<version>`.
- Run:
    - `git add package.json`
    - `git commit -m "chore: release v<version>"`
    - `git push origin dev`

4. Open PR from `dev` to `main`

- Create PR title: `chore: release v<version>`.
- Create PR body with:
    - Release goal
    - Summary of notable changes
    - Validation status

5. Merge PR

- Merge only after required checks pass.
- Prefer merge strategy consistent with repository policy.

6. Sync local `main`

- Run:
    - `git checkout main`
    - `git pull origin main`

7. Create and push tag

- Create annotated tag: `v<version>`.
- Run:
    - `git tag -a v<version> -m "release v<version>"`
    - `git push origin v<version>`

8. Verify CI trigger from tag

- Confirm GitHub Actions detects the new tag.
- Confirm publish workflow reaches successful npm publish state.
- If workflow fails, capture failing job name and first actionable error, then stop and report.

9. Publish GitHub Release in English

- Create release for tag `v<version>`.
- Write detailed release notes in English.
- Follow `/Users/mcell/Desktop/workspace/memo-cli/skills/publish-memo-release/references/release-notes-template.md`.

## Output Requirements

- Report final artifacts:
    - PR URL and merge commit SHA
    - Tag name and tag commit SHA
    - GitHub Actions run URL
    - GitHub Release URL
- If any step is blocked by permission, missing credentials, or branch protection, stop immediately and report the exact blocker.
