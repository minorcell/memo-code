# CLI Package Guide

This file defines local contribution rules for `packages/cli`.

## Scope

- Owns TUI entry, command wiring, and interactive UX flows.
- Keep domain logic in `packages/core` and tool execution logic in `packages/tools`.

## Change Rules

- If CLI behavior, flags, or output format changes, update user-facing docs and examples.
- Keep tests close to changed behavior and cover error/edge cases for interactive and plain modes.
- 需要维护agents.md的更新。
