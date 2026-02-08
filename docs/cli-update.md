# Historical Note: CLI Adaptation for Tool Use and Concurrency

This document is a historical implementation note for the CLI adaptation completed on **February 1, 2026**.

## Scope of That Update

The update covered:

- CLI-side compatibility for concurrent tool calls.
- Hook-level behavior compatibility between single-tool and multi-tool execution.
- TUI display compatibility without requiring immediate UI rewrites.

## Current Relevance

- This page is retained as migration history.
- For current architecture and behavior, use:
    - `docs/core.md`
    - `web/content/docs/README.md`
    - `README.md`

## Historical Summary

At the time of the migration, the main compatibility strategy was:

- Keep existing hook interfaces stable.
- Merge concurrent observations into a unified output payload.
- Preserve single-tool behavior to avoid regressions.

## Status

- Document type: historical
- Last reviewed date: February 6, 2026
- Breaking changes introduced by this historical update: none
