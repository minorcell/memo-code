# CLI & TUI Guide

Memo has two run modes: interactive TUI for daily development, and plain mode for non-interactive pipelines.

## Run Modes

### Interactive TUI

```bash
memo
```

Best for:

- multi-turn coding conversations
- tool approval prompts
- session resume and model switching

### Plain Mode

```bash
echo "your prompt" | memo
```

Plain mode is automatically used when stdin or stdout is not a TTY.

Best for:

- scripts and CI
- one-shot automation

Important limitation:

- plain mode cannot display interactive approval UI; approval-required tools are denied unless you use `--dangerous`.

## Input Enhancements

### File Reference with `@`

Type `@` followed by a path fragment, then press `Tab` to accept suggestions.

Examples:

- `Review @package.json and explain scripts`
- `Compare @packages/core/src/runtime/session.ts with @packages/tools/src/index.ts`

### Session Resume (`resume`)

Type in the input box:

- `resume`
- `resume keyword`
- `/resume` (same trigger)

Then select a session suggestion to load historical context.

## Slash Commands

Use `/` to open command suggestions.

- `/help`: show help and shortcuts
- `/new`: start a new session and clear the screen
- `/exit`: exit Memo
- `/resume`: show guidance for history loading
- `/models`: list/switch configured providers and models
- `/context`: set context limit (`80k/120k/150k/200k`), starts a new session
- `/mcp`: show configured MCP servers
- `/init`: ask Memo to generate `AGENTS.md` in current project

Notes:

- Typing `exit` (without slash) also exits.
- `/models <provider-or-model>` also works (for direct switch).

## Shortcuts

- `Enter`: send message
- `Shift+Enter`: insert newline
- `Tab`: accept current suggestion
- `Up/Down`: move in suggestion list, or browse input history
- `Esc`: close suggestion panel
- `Esc Esc`:
    - while running: cancel current turn
    - while idle: clear current input
- `Ctrl+L`: clear screen and start a new session
- `Ctrl+C`: exit

## Approvals in TUI

When a tool needs approval, a modal appears with:

- `Allow once`
- `Allow all session`
- `Reject this time`

See [Safety & Approvals](./approval-safety.md) for policy details.
