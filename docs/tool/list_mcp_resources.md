# Memo CLI `list_mcp_resources` Tool

Lists resources exposed by MCP servers.

## Basic Info

- Tool name: `list_mcp_resources`
- Description: list MCP resources globally or from one server
- File: `packages/tools/src/tools/mcp_resources.ts`
- Confirmation: no

## Parameters

- `server` (string, optional): target server name.
- `cursor` (string, optional): pagination cursor (only valid when `server` is set).

## Behavior

- Requires active MCP pool (initialized by runtime).
- With `server`:
    - verifies server exists
    - calls server `listResources(cursor?)`
    - returns `{ server, resources, nextCursor }`
- Without `server`:
    - rejects `cursor`
    - aggregates resources from all connected servers
    - returns `{ resources: [{ server, ...resource }] }`
- Returns `isError=true` on missing pool/server or call failure.
