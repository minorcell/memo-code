# Configuration (Provider / Config)

Memo uses `config.toml` to manage providers, models, MCP servers, and other runtime settings.

## Config File Location

Default location:

- `~/.memo/config.toml`

Override via environment variable:

- `MEMO_HOME=/path/to/dir` -> config file becomes `$MEMO_HOME/config.toml`

> You can also use multiple `MEMO_HOME` directories for separate setups (for example work/personal, different base URLs).

## Provider Configuration (Multi-model / Multi-endpoint)

Minimal example (DeepSeek):

```toml
current_provider = "deepseek"
stream_output = false

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"
```

Field descriptions:

- `current_provider`: current default provider (used by `/models` and startup selection)
- `stream_output`: whether streaming output is enabled
- `providers.<name>`: provider list (multiple entries supported)
    - `env_api_key`: env var to read API key from
    - `model`: model ID
    - `base_url`: OpenAI-compatible endpoint (optional)

### Multi-provider Example

```toml
current_provider = "deepseek"
stream_output = false

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

## Important Note About `stream_output`

When `stream_output=true`, Memo prefers a streaming response path. In the current implementation, tool definitions are not sent in that path, so tool calling can be limited (better for plain Q&A/summarization).

If you need stable tool usage (`read`/`write`/`edit`/`bash`, etc.), keep:

```toml
stream_output = false
```

## MCP Server Configuration

You can define MCP servers in `config.toml` under `[mcp_servers.<name>]` or manage them with `memo mcp add/remove`.

- [MCP Extensions](./mcp.md)

## Related Paths

- Session logs: `~/.memo/sessions/` by default (see [Sessions and Logs](./sessions-history.md))
- Long-term memory: `~/.memo/Agents.md` by default (see [Long-term Memory](./memory.md))
