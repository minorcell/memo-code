# Memo 用户文档

本目录面向 **Memo CLI 的使用者**，聚焦“如何使用、如何配置、如何排障”，不讨论底层实现细节。

## 推荐阅读顺序

1. [快速开始](./getting-started.md)
2. [CLI / TUI 使用说明](./cli-tui.md)
3. [配置说明](./configuration.md)
4. [工具总览](./tools.md)
5. [Subagent 使用说明](./subagent.md)
6. [审批与安全](./approval-safety.md)

## 文档索引

- [快速开始](./getting-started.md)：安装、首启、基础运行方式。
- [CLI / TUI 使用说明](./cli-tui.md)：交互命令、快捷键、输入增强。
- [配置说明](./configuration.md)：`config.toml`、Provider、MCP、上下文上限。
- [工具总览](./tools.md)：内置工具分组、启用开关、常见使用方式。
- [Subagent 使用说明](./subagent.md)：多 agent 能力启用、生命周期、常见问题。
- [审批与安全](./approval-safety.md)：审批机制、风险分级、`--dangerous` 使用边界。
- [MCP 扩展](./mcp.md)：连接外部 MCP 服务与管理命令。
- [会话与历史](./sessions-history.md)：JSONL 历史、恢复会话、排查辅助。
- [故障排查](./troubleshooting.md)：常见问题与处理步骤。

## 相关参考

- 项目总览：`README.md`
- 工具参数细节：`docs/tool/*`
- 核心架构说明：`docs/core.md`
