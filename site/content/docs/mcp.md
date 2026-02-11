# MCP Integration

MCP (Model Context Protocol) lets Memo connect to external tool servers and resource systems.

## Manage MCP via CLI

### List and Inspect

```bash
memo mcp list
memo mcp list --json
memo mcp get <name>
memo mcp get <name> --json
```

### Add Servers

Add local stdio server:

```bash
memo mcp add local_tools -- /path/to/mcp-server --flag
```

Add remote streamable HTTP server:

```bash
memo mcp add remote --url https://your-mcp-server.com/mcp --bearer-token-env-var MCP_TOKEN
```

For stdio servers, environment variables can be passed with repeated `--env KEY=VALUE`.

### Remove Server

```bash
memo mcp remove <name>
```

### Help

```bash
memo mcp help
```

### Login / Logout Commands

```bash
memo mcp login <name>
memo mcp logout <name>
```

These commands are currently not implemented for OAuth flow. Prefer bearer-token env variables for remote auth.

## Manual `config.toml` Examples

### Local Stdio MCP

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = ["--flag"]
# optional:
# env = { API_TOKEN = "..." }
# stderr = "inherit"
```

### Remote Streamable HTTP MCP

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
# optional:
# http_headers = { "X-Team" = "platform" }
```

## View MCP in TUI

Use slash command:

```text
/mcp
```

It shows MCP servers configured for the current session.

## When Config Changes Take Effect

MCP servers are loaded when a session is created.

After adding/updating/removing MCP config:

- restart `memo`, or
- start a new session (`/new`)

## Common Issues

- `memo mcp list` has entries but `/mcp` looks stale: recreate session.
- auth failure on remote server: check token env var exists in current shell.
- local server fails to start: verify `command`, `args`, and executable path.
