# MCP Extensions (External Tools/Services)

MCP (Model Context Protocol) lets Memo connect external tool servers and expose additional capabilities to the model (for example internal knowledge base, ticket systems, browser automation).

## Option 1: Manage via CLI (Recommended)

List servers:

```bash
memo mcp list
memo mcp list --json
```

Add local stdio server:

```bash
memo mcp add local_tools -- /path/to/mcp-server --flag
```

Add remote HTTP server (streamable HTTP):

```bash
memo mcp add remote --url https://your-mcp-server.com/mcp --bearer-token-env-var MCP_TOKEN
```

View/remove:

```bash
memo mcp get remote
memo mcp remove remote
```

> `memo mcp login/logout` does not support OAuth flow in current version; use bearer-token env var instead.

## Option 2: Edit `config.toml` Directly

Local stdio:

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = ["--flag"]
```

Remote HTTP:

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
```

## View MCP Servers in TUI

Type in TUI:

- `/mcp`

This shows loaded MCP servers from current config and key fields.

## When Changes Take Effect

MCP servers are loaded when a session is created. After changing config, restart `memo` or start a new session to ensure reload.
