# Tools (Built-in Tool Overview)

Memo has a built-in toolset and also supports external tools via MCP. In most cases, you do not need to call tools manually. Just describe your goal clearly and explicitly specify which files should be read or changed.

## Built-in Tool Groups

### Read-only Tools (Usually no approval needed)

- `read_file`: read local files with offset/limit
- `list_dir`: list directory entries
- `grep_files`: content search (ripgrep-backed)
- `webfetch`: restricted HTTP GET with cleaned text preview
- `get_memory`: read `Agents.md` memory payload
- `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`: inspect MCP-provided resources
- `update_plan`: maintain structured plan state in-session
- `wait`: read status snapshots for collaboration agents (feature-gated)

### Write Tools (Approval required)

- `apply_patch`: patch-based file edits

### Execution Tools (High risk, approval required)

- `exec_command` / `write_stdin`: run and continue shell sessions
- `shell` / `shell_command`: compatibility shell variants (enabled by env/feature flags)
- `spawn_agent` / `send_input` / `resume_agent` / `close_agent`: collaboration-agent controls (feature-gated)

## How to Help Memo Use Tools Effectively

- **State goal and scope clearly**: for example, "Only modify `@packages/core/src/config/config.ts`; do not touch other files."
- **Read before write**: for example, "Read `@README.md` first, then add one section based on the current structure."
- **Set constraints**: for example, "Do not run destructive commands; read-only only."

## Detailed Tool Parameter Docs

Use these pages when you need exact parameter/behavior details:

- `read_file`: `docs/tool/read_file.md`
- `list_dir`: `docs/tool/list_dir.md`
- `grep_files`: `docs/tool/grep_files.md`
- `webfetch`: `docs/tool/webfetch.md`
- `get_memory`: `docs/tool/get_memory.md`
- `apply_patch`: `docs/tool/apply_patch.md`
- `exec_command`: `docs/tool/exec_command.md`
- `write_stdin`: `docs/tool/write_stdin.md`
- `shell`: `docs/tool/shell.md`
- `shell_command`: `docs/tool/shell_command.md`
- `update_plan`: `docs/tool/update_plan.md`
- `list_mcp_resources`: `docs/tool/list_mcp_resources.md`
- `list_mcp_resource_templates`: `docs/tool/list_mcp_resource_templates.md`
- `read_mcp_resource`: `docs/tool/read_mcp_resource.md`
- `spawn_agent`: `docs/tool/spawn_agent.md`
- `send_input`: `docs/tool/send_input.md`
- `resume_agent`: `docs/tool/resume_agent.md`
- `wait`: `docs/tool/wait.md`
- `close_agent`: `docs/tool/close_agent.md`

## Related Docs

- Tool approvals and dangerous mode: [Tool Approval and Safety](./approval-safety.md)
- MCP external tools: [MCP Extensions](./mcp.md)
