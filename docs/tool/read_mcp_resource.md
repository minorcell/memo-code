# Memo CLI `read_mcp_resource` Tool

Reads one MCP resource by `server` and `uri`.

## Basic Info

- Tool name: `read_mcp_resource`
- Description: read a specific MCP resource
- File: `packages/tools/src/tools/mcp_resources.ts`
- Confirmation: no

## Parameters

- `server` (string, required): MCP server name.
- `uri` (string, required): resource URI returned by MCP listing.

## Behavior

- Requires active MCP pool.
- Verifies server exists.
- Calls server `readResource({ uri })`.
- Returns merged JSON payload: `{ server, uri, ...result }`.
- Returns `isError=true` on missing pool/server or call failure.
