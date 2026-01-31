# Memo Code

本地运行的 AI 编程助手，支持多轮对话、工具调用、并发执行。基于 Bun + TypeScript，默认对接 DeepSeek，兼容 OpenAI API。

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置 API Key

```bash
export DEEPSEEK_API_KEY=your_key  # 或 OPENAI_API_KEY
```

### 3. 启动使用

```bash
bun start
# 首次运行会引导配置 provider/model，并保存到 ~/.memo/config.toml
```

## 使用方式

### 交互式模式（默认）

在终端中启动 TUI 界面：

```bash
bun start
```

**支持功能**：

- 多轮对话，保持上下文
- 实时流式输出
- 工具调用可视化
- Token 使用统计
- 快捷键和命令

### 单轮模式

适合脚本集成：

```bash
bun start "你的问题" --once
```

输出纯文本结果，便于日志记录和后续处理。

## TUI 快捷键

- **Enter**：提交输入
- **Shift+Enter**：换行
- **Up/Down**：浏览历史
- **Ctrl+C**：中断或退出
- **Ctrl+L**：清屏

## Slash 命令

- `/help`：显示帮助
- `/exit`：退出会话
- `/clear`：清屏
- `/tools`：列出所有工具
- `/config`：显示配置
- `/memory`：显示记忆位置

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

## 性能特性

### 并发工具调用

模型可同时调用多个独立工具，显著提升效率：

```
场景：读取 3 个文件
传统：read → wait → read → wait → read → wait (3次往返)
并发：read + read + read → wait (1次往返，快5倍)
```

### Tool Use API

使用原生 Tool Use API（OpenAI/DeepSeek/Claude），避免 JSON 解析问题，95%格式稳定性。

不支持 Tool Use 的模型自动降级到 JSON 解析模式。

## 开发

### 本地运行

```bash
bun start
# 或
bun start "prompt" --once
```

### 构建

```bash
bun run build         # 生成 dist/index.js
bun run build:binary  # 生成可执行文件 memo
```

### 测试

```bash
bun test              # 全量测试
bun run test:core     # 测试 core 包
bun run test:tools    # 测试 tools 包
```

### 代码格式化

```bash
bun run format        # 格式化所有文件
bun run format:check  # 检查格式（CI）
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

## 技术栈

- **Runtime**: Bun 1.1+
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
