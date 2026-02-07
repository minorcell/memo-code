# Tools Package Guide

This file describes the architecture and implementation rules for
`packages/tools`.

## Purpose

`packages/tools` is the single package responsible for:

- Defining native tools.
- Loading and routing MCP tools.
- Executing tool calls via orchestrator.
- Applying approval and policy checks for tool execution.

`packages/core` should call into tools, but should not implement tool runtime
logic.

## Package Structure

- `src/tools/*`
    - Native tool implementations (codex-style tools such as
      `exec_command`, `write_stdin`, `apply_patch`, `read_file`, `list_dir`,
      `grep_files`, `list_mcp_resources`, `read_mcp_resource`, `update_plan`,
      `webfetch`, `get_memory`).
    - `types.ts` provides `defineMcpTool(...)` to build unified tool objects.
    - `mcp.ts` contains common `CallToolResult` helpers.
- `src/router/*`
    - `index.ts`: ToolRouter entry (query/list/dispatch/tool definitions).
    - `native/*`: in-memory native registry.
    - `mcp/*`: MCP registry and connection pool.
    - `types.ts`: shared tool and MCP config types.
- `src/orchestrator/*`
    - Tool execution orchestration.
    - Supports single/multi action execution, failure policy, status/error model.
- `src/approval/*`
    - Risk classification, request fingerprinting, approval cache and decisions.
- `src/index.ts`
    - Public exports for native tools, router, orchestrator, and approval.

## Unified Tool Format

All native tools must use one unified runtime shape (router-compatible):

- `name: string`
- `description: string`
- `source: "native"`
- `inputSchema: JSON Schema`
- `validateInput(input) -> { ok: true, data } | { ok: false, error }`
- `execute(input) -> Promise<CallToolResult>`

Use `defineMcpTool(...)` from `src/tools/types.ts` to define native tools.
Do not add a separate adaptation layer.

## Routing Model

Tool router distinguishes only:

- Native tools (`source: "native"`).
- MCP tools (`source: "mcp"`).

Both are exposed through the same `Tool` interface in `src/router/types.ts`.

## Orchestrator and Approval Boundaries

- Orchestrator owns execution lifecycle and result model.
- Approval module owns risk/decision/fingerprint logic.
- Router owns discovery/registration/dispatch.
- Native tool files should focus on tool-specific behavior only.

## Adding a New Native Tool

1. Add implementation under `src/tools/<name>.ts`.
2. Define tool with `defineMcpTool(...)`.
3. Register export in `src/index.ts` via `TOOLKIT`/`TOOL_LIST`.
4. Add tests next to tool implementation (`*.test.ts`).
5. Verify:
    - `pnpm run test:tools`
    - `pnpm run build`

## Testing Notes

Prefer validating tool contracts through:

- `tool.validateInput(...)` for input validation.
- `tool.execute(...)` for runtime behavior and output.

Avoid relying on internal schema objects from test code.
