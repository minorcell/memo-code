# 快速开始

本文帮助你在几分钟内跑通 Memo：安装、配置 API Key、开始首次对话。

## 1. 安装

要求：Node.js >= 18。

```bash
npm install -g @memo-code/memo
# 或 pnpm / yarn / bun
```

安装后可先验证版本：

```bash
memo --version
```

MCP 子命令帮助：

```bash
memo mcp help
```

## 2. 配置 API Key（环境变量）

Memo 会读取 Provider 配置里的 `env_api_key` 对应环境变量。默认常见值：

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`

示例：

```bash
export DEEPSEEK_API_KEY=your_key
# 或
export OPENAI_API_KEY=your_key
```

## 3. 启动 Memo

### 交互模式（推荐）

```bash
memo
```

首次运行若未发现配置，会进入 TUI 引导并写入 `~/.memo/config.toml`。

### Plain 模式（非 TTY）

```bash
echo "请总结这个仓库结构" | memo
```

当 stdin 非 TTY 时，Memo 会自动进入 plain 模式。

### 危险模式（跳过审批）

```bash
memo --dangerous
# 或
memo -d
```

仅在你明确知道工具执行风险时使用。

## 4. 下一步

- 交互与快捷键：看 [CLI / TUI 使用说明](./cli-tui.md)
- Provider/MCP 细化配置：看 [配置说明](./configuration.md)
- 工具能力与开关：看 [工具总览](./tools.md)
