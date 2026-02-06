# Issue Governance

This repository follows a lightweight issue governance workflow for open-source maintenance.

## Goals

- Keep one canonical issue per topic.
- Reduce duplicate reports and fragmented discussions.
- Ensure every open issue has clear type, area, and priority context.

## Labels

- Type: `bug`, `enhancement`, `documentation`, `question`
- Area: `area:tui`, `area:tools`, `area:core`, `area:security`, `area:docs`
- Status: `needs-triage`, `duplicate-candidate`, `status:blocked`
- Priority: `priority:p0`, `priority:p1`

## Triage Flow

1. New issue gets auto-labeled by `.github/workflows/issue-governance.yml`.
2. Maintainer verifies labels and sets priority.
3. If duplicate is confirmed:
    - Keep one canonical issue open.
    - Close duplicates with reason `duplicate` and link canonical issue.
4. For broad roadmap topics, use one tracking issue with checklist/sub-issues.

## Duplicate Detection

The automation posts non-blocking duplicate hints based on title/body token overlap.
Maintainer confirmation is required before closing an issue as duplicate.

## Contributor Expectations

- Use issue forms instead of blank issues.
- Search existing issues before opening a new one.
- Include reproducible steps for bugs and acceptance criteria for features.
