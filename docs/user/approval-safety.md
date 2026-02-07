# Tool Approval and Safety

Memo enables tool approval by default. When the model tries potentially risky actions (file writes, command execution, etc.), Memo asks for permission first.

## What Triggers Approval?

Current default policy:

- **Read-only tools**: usually auto-approved (`read`, `glob`, `grep`, `webfetch`)
- **Write tools**: approval required (`write`, `edit`, `save_memory`)
- **Execution tools**: approval required (`bash`)

> MCP tools use conservative risk inference by name. Unknown tools are treated like write-level risk by default.

## Approval Options

TUI dialog usually offers:

- `Allow once`: allow only this call (cleared after current turn)
- `Allow all session`: auto-allow matching call fingerprint for current session
- `Reject`: deny execution

Fingerprint is based on `tool name + arguments`. Different arguments usually trigger approval again.

## When to Use `--dangerous` (Skip Approvals)

```bash
memo --dangerous
# or memo -d
```

Suitable when:

- You strongly trust the prompt and operations.
- You need fast batch edits in a controlled directory and will review diffs.

Not suitable when:

- You are unsure which commands/files will be touched.
- You are in a critical repository or a directory with sensitive data.

## Plain Mode (Non-TTY) and Approval

Plain mode cannot show interactive approval dialogs, so tool calls requiring approval are denied by default.

If you need write/exec actions in plain mode:

- Option A: use interactive TUI (`memo`)
- Option B: use `--dangerous` (you assume the risk; confirm cwd and targets carefully)

## Safety Practices

- Ask for a dry run first: let Memo list planned files/operations before approving writes.
- For `bash`: prefer read-only commands (`git status`, `rg`, `ls`), avoid high-risk commands like `rm`/`sudo`/`chmod`.
- For writes: constrain changes to explicitly named files and ask for a change summary.
