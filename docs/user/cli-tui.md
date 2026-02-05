# CLI / TUI 使用

Memo 有两种主要使用方式：交互式 TUI（默认）与单轮模式（`--once`）。

## 运行模式

### 交互式 TUI（默认）

```bash
memo
```

适合：多轮对话、工具调用可视化、审批弹窗、会话历史恢复。

### 单轮模式（`--once`）

```bash
memo "你的问题" --once
```

适合：脚本、CI、管道。注意：单轮模式通常无法进行交互式审批（见“工具审批与安全”）。

## 输入增强与常用工作流

### 1) 文件引用（`@`）

在输入中键入 `@` 后跟路径片段可触发文件建议（Tab 接受建议），常用于提示模型“重点看哪个文件”。

例：

- `请阅读 @package.json 并解释 scripts`
- `对比 @packages/core/src/runtime/session.ts 的审批逻辑`

### 2) 会话恢复（`resume`）

在输入框键入 `resume`（可加关键字）会触发历史会话建议，选中后加载会话上下文继续聊。

例：

- `resume`（列出最近会话）
- `resume approval`（按关键字过滤）

### 3) Slash 命令（`/`）

输入 `/` 可查看命令建议；直接输入并回车也可执行。常用命令：

- `/help`：帮助与快捷键提示
- `/new`：新会话（并清屏）
- `/exit` 或在输入里直接键入 `exit`：退出
- `/models`：查看/切换模型（从配置读取 provider 列表）
- `/context`：设置上下文上限（80k/120k/150k/200k）
- `/mcp`：查看当前已配置 MCP servers

### 4) 本地执行 shell（`$ <cmd>`）

在 TUI 里输入以 `$` 开头的命令，会直接在本机 `cwd` 执行，并把结果以系统消息显示（不会走模型工具审批，因为这是你手动输入的本地命令）。

例：

- `$ git status`
- `$ rg \"createAgentSession\" -n`

## 快捷键（TUI）

以当前版本实现为准：

- `Enter`：发送
- `Shift+Enter`：换行
- `Tab`：接受当前建议项（文件/命令/历史/模型/上下文）
- `↑/↓`：在建议列表中移动；或浏览输入历史
- `Esc`：关闭建议列表
- `Esc Esc`：取消当前运行（busy 时）或清空输入（空闲时）
- `Ctrl+L`：新会话并清屏
- `Ctrl+C`：退出

## 相关文档

- 审批弹窗与 `--dangerous`：见 [工具审批与安全](./approval-safety.md)
- `/models` 与 provider 配置：见 [配置](./configuration.md)
- 历史文件落盘与 `resume`：见 [会话与日志](./sessions-history.md)
