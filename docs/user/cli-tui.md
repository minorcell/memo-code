# CLI / TUI Usage

Memo has two primary usage modes: interactive TUI (default) and plain mode for non-TTY input.

## Run Modes

### Interactive TUI (Default)

```bash
memo
```

Best for multi-turn chat, visualized tool calls, approval dialogs, and session resume.

### Plain Mode (Non-TTY)

```bash
echo "your prompt" | memo
```

Best for scripts, CI, and pipelines. Note: plain mode cannot run interactive approvals (see Tool Approval and Safety).

### Version (`--version`)

```bash
memo --version
```

## Input Enhancements and Common Workflows

### 1) File Reference (`@`)

Type `@` followed by a path fragment to trigger file suggestions (Tab accepts). Useful when telling the model exactly which files to inspect.

Examples:

- `Read @package.json and explain scripts`
- `Compare approval logic in @packages/core/src/runtime/session.ts`

### 2) Session Resume (`resume`)

Type `resume` (optionally with keywords) in the input box to show historical sessions. Selecting one loads the previous context into the current session.

Examples:

- `resume` (list recent sessions)
- `resume approval` (filter by keyword)

### 3) Slash Commands (`/`)

Type `/` to see command suggestions; you can also type commands directly and press Enter.

Common commands:

- `/help`: help and shortcut hints
- `/new`: start a new session (and clear screen)
- `/exit` or typing `exit`: exit
- `/models`: view/switch models (loaded from provider config)
- `/context`: set context cap (80k/120k/150k/200k)
- `/mcp`: view configured MCP servers

### 4) Local Shell Execution (`$ <cmd>`)

Commands starting with `$` run directly in local `cwd` and show output as system messages. This is user-initiated local execution, not model tool approval flow.

Examples:

- `$ git status`
- `$ rg "createAgentSession" -n`

## TUI Shortcuts

Current implementation:

- `Enter`: send
- `Shift+Enter`: newline
- `Tab`: accept current suggestion (file/command/history/model/context)
- `Up/Down`: move in suggestions or browse input history
- `Esc`: close suggestion list
- `Esc Esc`: cancel running task (busy) or clear input (idle)
- `Ctrl+L`: new session + clear screen
- `Ctrl+C`: exit

## Related Docs

- Approval dialog and `--dangerous`: [Tool Approval and Safety](./approval-safety.md)
- `/models` and provider config: [Configuration](./configuration.md)
- History files and `resume`: [Sessions and Logs](./sessions-history.md)
