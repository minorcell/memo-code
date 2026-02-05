# 排错（Troubleshooting）

## 1) 提示缺少 API Key

现象：启动或运行时提示 `Missing env var ...`。

处理：

- 确认已导出对应环境变量（如 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`）
- 确认 `config.toml` 中 `env_api_key` 指向的变量名与你实际使用的一致（见 [配置](./configuration.md)）

## 2) 单轮模式下工具总被拒绝/直接取消

原因：单轮模式通常无法交互审批，默认会拒绝需要审批的写入/执行工具。

处理：

- 改用 TUI：`memo`
- 或在你确认风险可控的前提下使用：`memo --dangerous --once`
- 或把任务改成纯只读/建议类（不写文件、不执行命令）

## 3) `grep` 工具报错：找不到 `rg`

原因：`grep` 工具依赖系统的 ripgrep（`rg`）。

处理：

- 安装 ripgrep（macOS 可用 `brew install ripgrep`）
- 或换用其他方式（例如让它先用 `glob` 缩小范围，再用 `read` 定点读取）

## 4) 远程请求失败（`webfetch`/LLM 调用）

处理建议：

- 检查网络与代理
- 检查 `base_url` 是否正确（见 [配置](./configuration.md)）
- 重试，并尽量缩小请求/页面体积（`webfetch` 有超时与大小限制）

## 5) MCP server 连接不上/工具不存在

处理：

- 先用 `memo mcp list` 确认配置是否写入成功
- 在 TUI 用 `/mcp` 看看当前 session 实际加载的 servers
- 修改配置后重启 `memo` 或新会话（见 [MCP 扩展](./mcp.md)）

## 6) 上下文超限（Context tokens exceed the limit）

处理：

- 用 `/context` 调低上限或 `/new` 新会话
- 把任务拆小：先让它总结关键点，再逐块处理

