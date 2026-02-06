# Troubleshooting

## 1) Missing API Key Error

Symptom: startup/runtime reports `Missing env var ...`.

Fix:

- Ensure required env var is exported (`DEEPSEEK_API_KEY` / `OPENAI_API_KEY`).
- Ensure `env_api_key` in `config.toml` matches the actual env var you use (see [Configuration](./configuration.md)).

## 2) Tools Keep Getting Rejected/Canceled in One-shot Mode

Cause: one-shot mode usually cannot run interactive approvals, so write/exec tools are denied by default.

Fix:

- Use TUI mode: `memo`
- Or, if risk is controlled, use: `memo --dangerous --once`
- Or convert task to read-only/advisory mode (no file writes, no command execution)

## 3) `grep` Tool Error: `rg` Not Found

Cause: `grep` tool depends on system ripgrep (`rg`).

Fix:

- Install ripgrep (macOS: `brew install ripgrep`)
- Or use alternatives (for example, narrow with `glob` first, then read targeted files)

## 4) Remote Request Failure (`webfetch` / LLM calls)

Suggestions:

- Check network and proxy settings
- Verify `base_url` is correct (see [Configuration](./configuration.md))
- Retry and reduce request/page size (`webfetch` has timeout and size limits)

## 5) MCP Server Cannot Connect / Tool Missing

Fix:

- Run `memo mcp list` to verify config is saved
- Use `/mcp` in TUI to verify what the current session actually loaded
- After config changes, restart `memo` or start a new session (see [MCP Extensions](./mcp.md))

## 6) Context Limit Exceeded (`Context tokens exceed the limit`)

Fix:

- Lower limit with `/context` or start a new session with `/new`
- Split the task: summarize key points first, then process in chunks
