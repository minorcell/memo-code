# 配置（Provider / Config）

Memo 使用 `config.toml` 管理 provider、模型、MCP servers 等运行时配置。

## 配置文件位置

默认位置：

- `~/.memo/config.toml`

可通过环境变量重定向：

- `MEMO_HOME=/path/to/dir` → 配置为 `$MEMO_HOME/config.toml`

> 你也可以用 `MEMO_HOME` 做多套配置（例如：工作/个人、不同 base_url）。

## Provider 配置（多模型/多 endpoint）

最小示例（DeepSeek）：

```toml
current_provider = "deepseek"
stream_output = false

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"
```

字段说明：

- `current_provider`：当前默认 provider（用于 `/models` 与启动选择）
- `stream_output`：是否启用流式输出
- `providers.<name>`：provider 列表（可配置多个）
  - `env_api_key`：从哪个环境变量读取 API Key
  - `model`：模型 ID
  - `base_url`：OpenAI-compatible endpoint（可选）

### 多 provider 示例

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

## 关于 `stream_output` 的重要说明

当 `stream_output=true` 时，Memo 会优先走流式输出路径；在该路径下当前版本不会把工具定义传给模型，因此**工具调用能力会受限**（更适合纯问答/总结类任务）。

如果你希望稳定使用工具（read/write/edit/bash 等），建议保持：

```toml
stream_output = false
```

## MCP servers 配置入口

MCP 支持写在 `config.toml` 的 `[mcp_servers.<name>]` 下，也可以用 `memo mcp add/remove` 来管理。详见：

- [MCP 扩展](./mcp.md)

## 相关路径（顺带了解）

- 会话日志：默认 `~/.memo/sessions/`（见 [会话与日志](./sessions-history.md)）
- 长期记忆：默认 `~/.memo/Agents.md`（见 [长期记忆](./memory.md)）

