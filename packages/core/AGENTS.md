# Core Package Guide

This file defines local contribution rules for `packages/core`.

## Scope

- Owns session state machine, provider/config flows, and shared core types.
- Keep core logic deterministic and side-effect-light when possible.

## Change Rules

- Changes to config/provider contracts must include regression coverage for serialization and CLI argument flows.
- Keep public behavior changes synchronized with root docs and package docs.
- 需要维护agents.md的更新。
