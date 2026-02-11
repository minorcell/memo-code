# Built-in Tools

Memo includes a codex-style toolset and can extend capabilities through MCP servers.

## Default Toolset

By default, Memo enables the following categories:

- command execution
- file read/search/edit
- MCP resource browsing
- web fetch
- in-session planning
- optional memory read
- optional subagent collaboration

## Tool Categories

### Command Execution

Default mode (`MEMO_SHELL_TOOL_TYPE=unified_exec`):

- `exec_command`
- `write_stdin`

Compatibility modes:

- `shell` (argv form) when `MEMO_SHELL_TOOL_TYPE=shell`
- `shell_command` (string form) when `MEMO_SHELL_TOOL_TYPE=shell_command`

Disable execution tools:

- `MEMO_SHELL_TOOL_TYPE=disabled`

### File and Search

- `read_file`
- `list_dir`
- `grep_files`
- `apply_patch`

Notes:

- `read_file` and `list_dir` require absolute paths.
- `grep_files` requires `rg` (ripgrep) in PATH.
- `apply_patch` is the structured write tool.

### MCP Resource Tools

- `list_mcp_resources`
- `list_mcp_resource_templates`
- `read_mcp_resource`

These work with MCP servers loaded for the current session.

### Context and Planning

- `webfetch`
- `update_plan`
- `get_memory` (enabled unless `MEMO_ENABLE_MEMORY_TOOL=0`)

`get_memory` reads from `~/.memo/Agents.md` (or `$MEMO_HOME/Agents.md`).

### Subagent Collaboration

- `spawn_agent`
- `send_input`
- `resume_agent`
- `wait`
- `close_agent`

Enabled unless `MEMO_ENABLE_COLLAB_TOOLS=0`.

## Feature Switches

- `MEMO_SHELL_TOOL_TYPE`
- `MEMO_EXPERIMENTAL_TOOLS`
- `MEMO_ENABLE_MEMORY_TOOL`
- `MEMO_ENABLE_COLLAB_TOOLS`
- `MEMO_SUBAGENT_COMMAND`
- `MEMO_SUBAGENT_MAX_AGENTS`

### Experimental Tool Switch Behavior

`MEMO_EXPERIMENTAL_TOOLS` controls:

- `read_file`
- `list_dir`
- `grep_files`

Behavior:

- empty or unset: all three enabled
- non-empty list: only listed tools enabled

Example:

```bash
export MEMO_EXPERIMENTAL_TOOLS=read_file,list_dir
```

## Approval Overview

Default risk model:

- read-only tools: auto-approved
- write tools: require approval
- execute tools: require approval
- subagent tool family: auto-approved

See [Safety & Approvals](./approval-safety.md) for details.

## Practical Usage Tips

- Scope explicitly: say which files/directories are allowed.
- Prefer read-first flow: inspect before mutating.
- Add constraints: disallow destructive commands if needed.
- Keep tool output manageable: narrow path/pattern/limit.
- If output is too long, reduce search range and rerun.

## Detailed Parameter References

For exact schemas and examples, see `docs/tool/*` in this repository.
