# 快速开始

本页覆盖：安装 → 配置 API Key → 启动使用（TUI / 单轮）→ 下一步阅读建议。

## 1) 安装

全局安装：

```bash
npm install -g @memo-code/memo
# 或 pnpm / yarn / bun 任选其一
```

验证安装（当前版本不提供 `memo --help`，帮助在 TUI 的 `/help` 里；`mcp` 子命令有独立帮助）：

```bash
memo mcp help
```

## 2) 配置 API Key（环境变量）

Memo 默认会从 Provider 配置指定的环境变量读取 key（例如 `DEEPSEEK_API_KEY`），也兼容 `OPENAI_API_KEY`。

示例（二选一即可）：

```bash
export DEEPSEEK_API_KEY=your_key
# 或
export OPENAI_API_KEY=your_key
```

## 3) 启动使用

### 交互式（推荐）

```bash
memo
```

首次运行若未找到配置文件，会进入 TUI 配置向导，生成 `~/.memo/config.toml`（可用 `MEMO_HOME` 改位置，见“配置”文档）。

### 单轮模式（适合脚本/管道）

```bash
memo "解释这个报错怎么修" --once
```

也可以从 stdin 读取（非 TTY 时自动走单轮模式）：

```bash
echo "总结一下这个仓库的结构" | memo --once
```

### 危险模式（跳过工具审批，谨慎）

```bash
memo --dangerous
# 或
memo -d
```

## 下一步

- 想熟悉快捷键与命令：读 [CLI / TUI 使用](./cli-tui.md)
- 想自定义 provider / base_url / 多模型：读 [配置](./configuration.md)
- 想了解工具能力与边界：读 [工具](./tools.md)
