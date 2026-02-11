# Configuration

Memo uses `config.toml` to manage provider selection, context limits, and MCP servers.

## Config File Location

Default:

- `~/.memo/config.toml`

If `MEMO_HOME` is set:

- config path becomes `$MEMO_HOME/config.toml`

## Provider Configuration

### Minimal Example

```toml
current_provider = "deepseek"
max_prompt_tokens = 120000

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"
```

### Multiple Providers Example

```toml
current_provider = "deepseek"
max_prompt_tokens = 120000

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"

[[providers.openai]]
name = "openai"
env_api_key = "OPENAI_API_KEY"
model = "gpt-4.1-mini"
base_url = "https://api.openai.com/v1"
```

### Provider Fields

- `current_provider`: default provider name.
- `max_prompt_tokens`: context limit for sessions.
- `providers.<name>` entries:
    - `name`: provider identifier.
    - `env_api_key`: environment variable used for API key lookup.
    - `model`: model ID.
    - `base_url` (optional): OpenAI-compatible API endpoint.

## Context Limit

`max_prompt_tokens` is also managed by `/context` in TUI.

Supported values in current TUI command flow:

- `80000`
- `120000`
- `150000`
- `200000`

Changing `/context` starts a new session and persists the value to config.

## MCP Server Configuration

### Local Stdio MCP

```toml
[mcp_servers.local_tools]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/your/path"]
# optional
# type = "stdio"
# stderr = "inherit" # or "pipe" / "ignore"
# [mcp_servers.local_tools.env]
# FOO = "bar"
```

### Remote Streamable HTTP MCP

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
# optional custom headers
# http_headers = { "X-Team" = "platform" }
# or headers = { "X-Team" = "platform" }
```

## Manage MCP with CLI

```bash
memo mcp list
memo mcp get <name>
memo mcp add <name> -- <command...>
memo mcp add <name> --url <url> --bearer-token-env-var <ENV_VAR>
memo mcp remove <name>
```

Also available:

```bash
memo mcp help
```

`memo mcp login/logout` commands exist but OAuth login/logout is not implemented yet.

## Runtime Environment Variables

### Required for model calls

- `<provider.env_api_key>`: the env var name configured in provider config, used as first priority for API key lookup.
- `OPENAI_API_KEY`: fallback API key when provider-specific key is missing.
- `DEEPSEEK_API_KEY`: fallback API key when provider-specific key and `OPENAI_API_KEY` are missing.

### Common optional

- `MEMO_HOME`: override Memo home directory.

### Advanced tool/runtime switches

- `MEMO_SHELL_TOOL_TYPE`: `unified_exec` (default) / `shell` / `shell_command` / `disabled`.
- `MEMO_EXPERIMENTAL_TOOLS`: comma-separated subset of `read_file,list_dir,grep_files`.
    - empty value means all three are enabled.
- `MEMO_ENABLE_MEMORY_TOOL=0`: disable `get_memory`.
- `MEMO_ENABLE_COLLAB_TOOLS=0`: disable subagent tools.
- `MEMO_SUBAGENT_COMMAND`: command used to spawn subagents.
- `MEMO_SUBAGENT_MAX_AGENTS`: max concurrently running subagents (default `4`).
- `MEMO_TOOL_RESULT_MAX_CHARS`: max chars kept from a single tool result before omission hint.
- `MEMO_SANDBOX_WRITABLE_ROOTS`: comma-separated absolute paths appended to writable sandbox roots for local write tools.

### MCP auth by configuration

- `<bearer_token_env_var>`: if set in an MCP server config, Memo reads this env var and injects `Authorization: Bearer <token>` for that server.

### Notes

- `SHELL`, `USER`, and `USERNAME` are system env vars read as runtime fallback; they are not Memo-specific feature switches.

## Related

- [MCP Integration](./mcp.md)
- [Built-in Tools](./tools.md)
- [Sessions & History](./sessions-history.md)
