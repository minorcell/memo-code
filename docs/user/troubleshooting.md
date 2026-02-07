# 故障排查

## 1) 启动报错：缺少 API Key

症状：提示 `Missing env var ...`。

处理：

1. 确认已导出环境变量（如 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`）。
2. 检查 `config.toml` 中 provider 的 `env_api_key` 是否与环境变量一致。
3. 重新启动 `memo`。

## 2) Plain 模式下工具频繁被拒绝

症状：管道调用时写入/执行类工具无法执行。

原因：plain 模式无交互审批，需审批工具默认拒绝。

处理：

1. 改用交互模式：`memo`
2. 或在可控场景使用：`memo --dangerous`
3. 或把任务改为只读分析

## 3) `grep_files` 报错：找不到 `rg`

原因：`grep_files` 依赖系统 `ripgrep`。

处理：

- macOS：`brew install ripgrep`
- Linux：使用发行版包管理器安装 `ripgrep`

## 4) 工具“消失”或不可用

请检查以下开关：

- `MEMO_SHELL_TOOL_TYPE=disabled` 会禁用 shell 工具族
- `MEMO_ENABLE_MEMORY_TOOL=0` 会禁用 `get_memory`
- 设置了 `MEMO_ENABLE_COLLAB_TOOLS=0` 会禁用 subagent 工具
- `MEMO_EXPERIMENTAL_TOOLS` 非空时，仅启用你列出的实验工具

## 5) `wait` / subagent 相关行为异常

处理：

1. 确认未禁用：`MEMO_ENABLE_COLLAB_TOOLS` 不是 `0`
2. 检查 `MEMO_SUBAGENT_COMMAND` 是否可在当前环境执行
3. 检查 `MEMO_SUBAGENT_MAX_AGENTS` 是否过小导致并发受限

## 6) `webfetch` 或模型请求失败

处理：

1. 检查网络和代理设置
2. 检查 provider 的 `base_url`
3. 缩小请求规模后重试

## 7) MCP 无法连接或工具未加载

处理：

1. `memo mcp list` 确认配置已写入
2. TUI 执行 `/mcp` 查看当前会话加载结果
3. 修改配置后重启或新建会话（MCP 在会话创建时加载）

## 8) 上下文超限

症状：`Context tokens exceed the limit`。

处理：

1. `/context` 选择更小上限或 `/new` 新开会话
2. 把大任务拆成多个阶段
3. 先让模型总结，再继续下一步

## 9) 工具结果被替换为 `<system_hint ...>`

症状：看到 XML 提示“工具返回过长，已省略”。

原因：工具输出超过结果上限，被保护性截断。

处理：

1. 缩小检索范围（目录、关键词、glob）
2. 给工具增加 limit/offset 等约束参数
3. 分批次执行查询
