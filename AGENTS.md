# Repository Guidelines

## Project Structure and Modules

- `packages/cli/`: TUI entry and command orchestration (`src/index.tsx`), build output goes to `dist/`.
- `packages/core/`: Session state machine, provider/config handling, shared types.
- `packages/tools/`: Built-in MCP-like tools; tests live next to implementations and use `*.test.ts`.
- `docs/`: Development docs and design direction; `public/`: static TUI assets.
- Root scripts are managed by `package.json`; requires Node.js >=18 and pnpm. Install `rg` for faster search. Type/path aliases are in `tsconfig.json`.
- Runtime config and logs are stored in `~/.memo/` by default, and can be redirected with `MEMO_HOME`.

## Build, Test, and Development

- Install dependencies: `pnpm install`.
- Run locally (auto-selects TUI/one-shot mode): `pnpm start` or `pnpm start "prompt" --once`.
- Build distributable package: `pnpm run build` (outputs `dist/index.js` and `dist/prompt.md` for npm publish).
- Format: `pnpm run format` (write) / `pnpm run format:check` (CI check only).
- Test: `pnpm test` for all; per package: `pnpm run test:core`, `pnpm run test:tools`, `pnpm run test:cli`. CI runs `pnpm run ci` for format check, core/tools tests, and build.
- Common local issues: missing `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` triggers interactive prompt; non-TTY environments automatically fall back to one-shot mode.
- For faster dev loops: `pnpm test -- --watch path/to/file.test.ts`.

## Code Style and Naming

- Language: TypeScript + ESM. Keep boundaries clear: Core (logic), Tools (capabilities), CLI (UI/wiring).
- Use Prettier for formatting with 2-space indentation. Follow `pnpm run format`; do not manually change style rules.
- Keep existing naming conventions (e.g., `config.ts`, `webfetch.test.ts`) and prefer explicit exports.
- Prefer pure functions. Keep side effects in CLI entry or tool adapters. Add brief comments for non-obvious behavior.
- Keep docs in sync: update `README.md` and relevant `docs/` sections/examples when public behavior, params, or outputs change.

## Testing Guidelines

- Place tests next to source files with `*.test.ts` naming; follow existing examples (`bash.test.ts`, `glob_grep.test.ts`).
- Run focused tests with `pnpm test path/to/file.test.ts`; new features must cover error branches and config boundaries.
- When changing provider/config flows, add fixtures in the related package to prevent serialization and CLI-arg regressions.
- For TUI interaction changes, include screenshots/recordings when possible and cover core shortcuts and primary output format in tests.

## Commit and PR Conventions

- Keep lowercase commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `ci:`, `docs:` with a short scope.
- Recommended branch names: `feature/<topic>`, `fix/<topic>`, `docs/<topic>`.
- PRs should include: change summary, linked issue (if any), risk/rollback notes, and validation steps (e.g., `pnpm test`, `pnpm run format:check`). Add TUI screenshots for UI-output-only changes.
- If CI fails, reproduce and fix locally before requesting review. Keep branch fast-forwardable before merge (rebase recommended).

## Security and Config Notes

- Never commit secrets. Runtime keys are read from env vars (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`) or `~/.memo/config.toml` written by CLI.
- Tool code should defensively validate paths and network calls. Prefer explicit filesystem allowlists, especially in `packages/tools/`.
- Watch license compatibility and bundle size when upgrading dependencies. Add reasonable timeouts and clear errors for network requests.
