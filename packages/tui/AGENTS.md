# TUI Package Guide

This file defines local contribution rules for `packages/tui`.

## Scope

- Owns interactive TUI runtime: `App`, chat transcript rendering, bottom pane input, slash commands, setup and approval overlays.
- Owns TUI-side controllers/state modules (`controllers/*`, `state/*`) and user-facing interaction behavior.
- Keep business/session logic in `packages/core`; keep executable bootstrap and argv handling in `src/cli.tsx` within this package.

## Change Rules

- Keep slash command behavior centralized in `src/slash/registry.ts`; avoid duplicate command dispatch paths.
- Keep UI state changes event-driven and testable (prefer pure transforms in `state/*` and parser/controller helpers).
- If shortcuts, slash commands, or approval UX change, sync `README.md` / `README.zh.md`.
- If shortcuts, slash commands, or approval UX change, sync `site/content/docs/cli-tui.md`.
- If shortcuts, slash commands, or approval UX change, sync `docs/tui-rewrite-design.md` (implementation status section).
- Add or update tests next to changed modules (`*.test.ts`) and run `pnpm run test:tui`.
- 需要维护agents.md的更新。
