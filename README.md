# Memo Code

本地运行的 AI 编程助手，支持多轮对话、工具调用、并发。基于 Node.js + TypeScript，默认对接 DeepSeek，兼容 OpenAI API。

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

- 交互式：`memo`（默认 TUI，支持多轮、流式、工具可视化、快捷键）。
- 单轮：`memo "你的问题" --once`（纯文本输出，适合脚本）。
- 危险模式：`memo --dangerous` 或 `memo -d`（跳过工具审批，谨慎使用）。

## 配置文件

位置：`~/.memo/config.toml`（可通过 `MEMO_HOME` 环境变量修改）

### Provider 配置

```toml
current_provider = "deepseek"
stream_output = false

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

## 内置工具

- `bash`：执行 shell 命令
- `read`：读取文件
- `write`：写入文件
- `edit`：编辑文件
- `glob`：搜索文件（模式匹配）
- `grep`：搜索内容（正则匹配）
- `webfetch`：获取网页
- `save_memory`：保存长期记忆
- `todo`：管理任务列表

通过 MCP 协议可扩展更多工具。

## 工具审批系统

新增工具审批机制，保护用户免受危险操作影响：

- **自动审批**：安全工具（read、glob、grep等）自动通过
- **手动审批**：危险工具（bash、write、edit等）需要用户确认
- **审批选项**：
    - `once`：仅批准当前操作
    - `session`：批准本次会话中的所有同类操作
    - `deny`：拒绝操作
- **危险模式**：`--dangerous` 参数跳过所有审批（仅限信任场景）

## 会话历史

所有会话自动保存到 `~/.memo/sessions/`，按工作目录和日期组织：

```
~/.memo/sessions/
  ├── workspace-name/
  │   ├── 2026-02-01_143020_abc123.jsonl
  │   └── 2026-02-01_150315_def456.jsonl
  └── another-project/
      └── 2026-02-01_160000_xyz789.jsonl
```

JSONL 格式便于分析和调试。

## 开发

### 本地运行

```bash
pnpm install
pnpm start
# 或
pnpm start "prompt" --once
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
- `$ <cmd>`：在当前工作目录本地执行 shell 命令，直接显示输出（`Shell Result`）。
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

- [Core 架构](./docs/core.md) - 核心实现详解
- [重构报告](./docs/refactor-complete.md) - Tool Use API 迁移说明
- [开发指南](./CONTRIBUTING.md) - 贡献指南
- [项目约定](./AGENTS.md) - 代码规范和开发流程

## License

MIT
