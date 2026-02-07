# 配置说明

Memo 使用 `config.toml` 管理 Provider、模型、MCP 服务器与上下文上限。

## 配置文件位置

默认位置：

- `~/.memo/config.toml`

可通过 `MEMO_HOME` 重定向：

- `MEMO_HOME=/path/to/home`
- 配置文件路径变为：`$MEMO_HOME/config.toml`

## 基础配置示例

```toml
current_provider = "deepseek"
stream_output = false
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

字段说明：

- `current_provider`：当前默认 provider 名称
- `stream_output`：是否启用流式输出
- `max_prompt_tokens`：上下文上限（与 `/context` 联动）
- `providers.*`：Provider 列表（可多组）
    - `env_api_key`：读取 API Key 的环境变量名
    - `model`：模型标识
    - `base_url`：OpenAI 兼容 API 地址（可选）

## `stream_output` 注意事项

当前实现下，`stream_output=true` 时会走流式路径，工具调用能力会受限。

如果你希望稳定使用工具（如 `read_file`、`apply_patch`、`exec_command` 等），建议保持：

```toml
stream_output = false
```

## MCP 配置示例

### 本地 stdio MCP

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = ["--flag"]
```

### 远程 streamable HTTP MCP

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
```

也可以使用命令行维护：`memo mcp list/get/add/remove`。

## 其他相关路径

- 会话历史：`~/.memo/sessions/`（可随 `MEMO_HOME` 变化）
- 记忆文件：`~/.memo/Agents.md`（`get_memory` 读取）

## 相关文档

- [MCP 扩展](./mcp.md)
- [会话与历史](./sessions-history.md)
