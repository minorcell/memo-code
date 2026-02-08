# CLI / TUI 使用说明

Memo 主要有两种使用方式：交互式 TUI 与非交互 plain 模式。

## 运行模式

### 1) 交互式 TUI

```bash
memo
```

适合多轮对话、工具审批、会话恢复、模型切换。

### 2) Plain 模式（管道 / 脚本）

```bash
echo "your prompt" | memo
```

适合 CI 或脚本流水线。注意 plain 模式无法弹出交互审批框。

## 输入增强

### `@` 文件引用

输入 `@` + 路径片段可触发文件建议，按 `Tab` 接受。

示例：

- `阅读 @package.json 并解释 scripts`
- `比较 @packages/core/src/runtime/session.ts 与 @packages/tools/src/index.ts`

### `resume` 历史恢复

在输入框中输入：

- `resume`
- `resume 关键词`

会显示历史会话建议，选中后加载历史上下文。

### Slash 命令

常用命令：

- `/help`：查看帮助和快捷键
- `/new`：新建会话并清屏
- `/exit`：退出
- `/models`：查看/切换配置中的模型
- `/context`：设置上下文上限（80k/120k/150k/200k，会新建会话）
- `/mcp`：查看当前加载的 MCP 服务器
- `/init`：触发生成项目 `AGENTS.md`

此外，直接输入 `exit`（不加 `/`）也可退出。

## 快捷键

- `Enter`：发送
- `Shift+Enter`：换行
- `Tab`：接受建议
- `Up/Down`：切换建议或浏览输入历史
- `Esc`：关闭建议面板
- `Esc Esc`：运行中取消；空闲时清空输入
- `Ctrl+L`：新建会话并清屏
- `Ctrl+C`：退出

## 相关文档

- 审批规则： [审批与安全](./approval-safety.md)
- 模型与配置： [配置说明](./configuration.md)
- 历史日志与恢复： [会话与历史](./sessions-history.md)
