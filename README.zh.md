<div align="center">
  <img src="public/logo.svg" width="80" height="80" alt="Memo Logo">
  <h1>Memo Code</h1>
  <p>运行在终端里的轻量级编码代理。</p>
</div>

<p align="center">
  <a href="public/memo-code-cli-show-01.mp4">
    <img src="https://img.shields.io/badge/📹-观看演示视频-1a1a1a?style=for-the-badge" alt="Demo Video">
  </a>
</p>

---

<video src="public/memo-code-cli-show-01.mp4" width="100%"></video>

基于 Node.js + TypeScript，默认对接 DeepSeek，兼容 OpenAI API。

Memo Code 是一个开源的终端编码代理，能够理解项目上下文，并通过自然语言协助你更快完成编码、排障和日常开发任务。

## 快速开始

### 1. 安装

```bash
npm install -g @memo-code/memo
# 或
pnpm add -g @memo-code/memo
# 或
yarn global add @memo-code/memo
# 或
bun add -g @memo-code/memo
```

### 2. 配置 API Key

```bash
export DEEPSEEK_API_KEY=your_key  # 或 OPENAI_API_KEY
```

### 3. 启动使用

```bash
memo
# 首次运行会引导配置 provider/model，并（保存到 ~/.memo/config.toml）
```

## 使用方式

- 交互式：`memo`（默认 TUI，支持多轮、工具可视化、快捷键）。
- 非交互纯文本模式（非 TTY）：`echo "你的问题" | memo`（适合脚本）。
- 危险模式：`memo --dangerous` 或 `memo -d`（跳过工具审批，谨慎使用）。
- 查看版本：`memo --version` 或 `memo -v`。

## 配置文件

位置：`~/.memo/config.toml`（可通过 `MEMO_HOME` 环境变量修改）

### Provider 配置

```toml
current_provider = "deepseek"

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"
```

支持配置多个 Provider，通过 `current_provider` 切换。

### MCP 工具配置

支持本地和远程 MCP 服务器：

```toml
# 本地 MCP 服务器
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = []

# 远程 HTTP MCP 服务器
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
# headers = { Authorization = "Bearer xxx" }
```

也可以通过 CLI 管理 MCP 配置（对齐 Codex CLI 风格）：

```bash
# 列出 MCP servers
memo mcp list

# 添加本地 MCP server（stdio）
memo mcp add local_tools -- /path/to/mcp-server --flag

# 添加远程 MCP server（streamable HTTP）
memo mcp add remote --url https://your-mcp-server.com/mcp --bearer-token-env-var MCP_TOKEN

# 查看/删除
memo mcp get remote
memo mcp remove remote
```

## 内置工具

- `exec_command` / `write_stdin`：执行命令（默认执行工具族）
- `shell` / `shell_command`：兼容执行工具（按环境开关切换）
- `apply_patch`：结构化文件改动
- `read_file` / `list_dir` / `grep_files`：文件读取与检索
- `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`：MCP 资源访问
- `webfetch`：获取网页
- `update_plan`：更新当前会话内的计划状态
- `get_memory`：读取 `~/.memo/Agents.md`（或 `MEMO_HOME` 下）记忆内容

通过 MCP 协议可扩展更多工具。

## 工具审批系统

新增工具审批机制，保护用户免受危险操作影响：

- **自动审批**：读类工具（如 `read_file`、`list_dir`、`grep_files`、`webfetch` 等）
- **手动审批**：高风险工具（如 `apply_patch`、`exec_command`、`write_stdin`）
- **审批选项**：
    - `once`：仅批准当前操作
    - `session`：批准本次会话中的所有同类操作
    - `deny`：拒绝操作
- **危险模式**：`--dangerous` 参数跳过所有审批（仅限信任场景）

## 会话历史

所有会话自动保存到 `~/.memo/sessions/`，按日期分层组织：

```
~/.memo/sessions/
  └── 2026/
      └── 02/
          └── 08/
              ├── rollout-2026-02-08T02-21-18-abc123.jsonl
              └── rollout-2026-02-08T02-42-09-def456.jsonl
```

JSONL 格式便于分析和调试。

## 开发

### 本地运行

```bash
pnpm install
pnpm start
```

### 构建

```bash
pnpm run build  # 生成 dist/index.js
```

### 测试

```bash
pnpm test              # 全量测试
pnpm test packages/core     # 测试 core 包
pnpm test packages/tools    # 测试 tools 包
```

### 代码格式化

```bash
npm run format        # 格式化所有文件
npm run format:check  # 检查格式（CI）
```

## 项目结构

```
memo-cli/
├── packages/
│   ├── core/       # 核心逻辑：Session、工具路由、配置
│   ├── tools/      # 内置工具实现
│   └── cli/        # TUI 界面
├── docs/           # 技术文档
└── dist/           # 构建输出
```

## CLI 快捷键与命令

- `/help`：显示帮助与快捷键说明。
- `/models`：列出现有 Provider/Model，回车切换；支持直接 `/models deepseek` 精确选择。
- `/context`：弹出 80k/120k/150k/200k 选项并立即设置上限。
- `/mcp`：查看当前会话加载的 MCP 服务器配置。
- `resume` 历史：输入 `resume` 查看并加载本目录的历史会话。
- 退出与清屏：`exit` / `/exit`，`Ctrl+L` 新会话，`Esc Esc` 取消运行或清空输入。
- **工具审批**：危险操作会弹出审批对话框，可选择 `once`/`session`/`deny`。

> 仅当会话包含用户消息时才写入 `sessions/` JSONL 日志，避免空会话文件。

## 技术栈

- **Runtime**: Node.js 18+
- **语言**: TypeScript
- **UI**: React + Ink
- **Protocol**: MCP (Model Context Protocol)
- **Token 计数**: tiktoken

## 相关文档

- [用户指南](./web/content/docs/README.md) - 面向使用者的分模块说明
- [Core 架构](./docs/core.md) - 核心实现详解
- [CLI 适配更新](./docs/cli-update.md) - Tool Use API 迁移说明
- [开发指南](./CONTRIBUTING.md) - 贡献指南
- [项目约定](./AGENTS.md) - 代码规范和开发流程

## License

MIT
