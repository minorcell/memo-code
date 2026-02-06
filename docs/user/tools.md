# Tools (Built-in Tool Overview)

Memo has a built-in toolset and also supports external tools via MCP. In most cases, you do not need to call tools manually. Just describe your goal clearly and explicitly specify which files should be read or changed.

## Built-in Tool Groups

### Read-only Tools (Usually no approval needed)

- `read`: read file content (supports offset/limit)
- `glob`: find file paths by pattern (for example `src/**/*.ts`)
- `grep`: search content with `rg` (regex/file list/count)
- `webfetch`: restricted HTTP GET with cleaned text preview
- `todo`: in-process task list (not persisted)

### Write Tools (Approval required)

- `write`: write files
- `edit`: patch file content
- `save_memory`: write long-term memory (store only user preferences/profile, not project details)

### Execution Tools (High risk, approval required)

- `bash`: run shell commands and return stdout/stderr/exit code

## How to Help Memo Use Tools Effectively

- **State goal and scope clearly**: for example, "Only modify `@packages/core/src/config/config.ts`; do not touch other files."
- **Read before write**: for example, "Read `@README.md` first, then add one section based on the current structure."
- **Set constraints**: for example, "Do not run destructive commands; read-only only."

## Detailed Tool Parameter Docs

Use these pages when you need exact parameter/behavior details:

- `read`: `docs/tool/read.md`
- `glob`: `docs/tool/glob.md`
- `grep`: `docs/tool/grep.md`
- `webfetch`: `docs/tool/webfetch.md`
- `write`: `docs/tool/write.md`
- `edit`: `docs/tool/edit.md`
- `bash`: `docs/tool/bash.md`
- `todo`: `docs/tool/todo.md`
- `save_memory`: `docs/tool/save_memory.md`

## Related Docs

- Tool approvals and dangerous mode: [Tool Approval and Safety](./approval-safety.md)
- MCP external tools: [MCP Extensions](./mcp.md)
