# memo-cli

在终端运行的 ReAct Agent，基于 Bun + TypeScript。支持多轮对话（Session/Turn）、JSONL 结构化日志、内置工具调用，默认使用 DeepSeek（OpenAI 兼容接口）。

## ✨ 核心特性

### 🤖 ReAct Agent 架构

- **多轮对话管理**：交互式 REPL 模式，支持 `--once` 单轮退出
- **结构化日志**：自动写入 `history/<sessionId>.jsonl`，包含 token 计数与事件追踪
- **Session/Turn 系统**：完整的对话状态管理，支持会话恢复

### 🛠️ 内置工具集

memo-cli 提供了丰富的内置工具，支持 ReAct 协议调用：

#### 文件系统操作

- **read**：读取文件内容，支持偏移和限制
- **write**：写入文件内容
- **edit**：查找替换文件内容，支持全局替换
- **glob**：文件模式匹配搜索
- **grep**：文本内容搜索，支持上下文显示

#### 系统与代码执行

- **bash**：执行 Shell 命令
- **run_bun**：代码解释器工具，在沙箱中运行 Bun (JS/TS) 代码，支持 top-level await
    - Linux 使用 bubblewrap (`bwrap`) 沙箱
    - macOS 使用 `sandbox-exec` profile
    - 可配置网络访问权限

#### 网络与数据获取

- **webfetch**：网页抓取工具，支持 http/https/data 协议
    - 10秒超时，512KB 大小限制
    - 自动将 HTML 转换为纯文本
    - 剥离 `<script>`/`<style>` 标签，智能格式化

#### 状态管理与辅助

- **save_memory**：保存长期记忆到 `~/.memo/memo.md`
- **todo**：任务管理工具，支持增删改查
- **time**：获取系统时间信息（ISO/UTC/epoch/timezone）

### 🔌 MCP 外部工具集成

- **配置文件**：`~/.memo/config.toml`（可用 `MEMO_HOME` 覆盖）
- **支持类型**：
    - 本地 stdio 服务器（已有可执行文件）
    - 远程 HTTP 服务器（Streamable HTTP，自动回退 SSE）
    - 强制 SSE 模式（旧版 HTTP 传输）
- **自动注入**：保存配置后重启 memo，外部工具会自动注入到系统提示词中
- **工具前缀**：外部工具名前会带 `<server>_` 前缀

### ⚙️ 配置系统

- **配置文件**：TOML 格式，位于 `~/.memo/config.toml`
- **多 Provider 支持**：可配置多个 LLM Provider
- **默认 Provider**：DeepSeek（支持 OpenAI 兼容接口）
- **MCP 服务器配置**：灵活配置外部工具服务器
- **环境变量**：优先 `OPENAI_API_KEY`，回退 `DEEPSEEK_API_KEY`

### 📊 Token 预算管理

- **本地估算**：使用 tiktoken 进行 prompt token 估算
- **LLM 对账**：与实际 LLM usage 进行对账
- **预算预警**：支持提示超限预警和拒绝机制
- **实时统计**：每轮对话显示 token 使用情况

## 🚀 快速开始

### 安装与配置

1. **安装依赖**

    ```bash
    bun install
    ```

2. **配置 API Key**（优先 OPENAI_API_KEY，回退 DEEPSEEK_API_KEY）

    ```bash
    export DEEPSEEK_API_KEY=your_key_here
    ```

3. **首次运行自动配置**
   首次运行时会引导配置 Provider 信息

### 使用方式

#### 一次性对话（单轮）

```bash
bun start "你的问题" --once
```

#### 交互式 REPL（多轮）

```bash
bun start
# 输入问题开始对话
# 输入 /exit 退出
```

#### 构建二进制文件

```bash
bun run build:binary
# 生成可执行文件 ./memo
```

### CLI 参数

- `--once`：单轮对话后退出（默认交互式多轮）

## 🔧 配置详解

### Provider 配置示例

```toml
current_provider = "deepseek"
max_steps = 100
stream_output = false

[[providers]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"
```

### MCP 服务器配置示例

#### 本地 stdio 服务器

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = []
```

#### 远程 HTTP 服务器

```toml
[mcp_servers.bing_cn]
type = "streamable_http"
url = "https://mcp.api-inference.modelscope.net/496703c5b3ff47/mcp"
# 可选：headers = { Authorization = "Bearer xxx" }
# 可选：fallback_to_sse = true   # 默认开启
```

## 📁 项目结构

```
memo-cli/
├── packages/
│   ├── core/           # 核心运行时
│   │   ├── config/     # 配置加载（~/.memo/config.toml）
│   │   ├── runtime/    # Session/Turn 运行时
│   │   ├── llm/        # 模型适配与 tokenizer
│   │   └── utils/      # 解析工具
│   ├── tools/          # 内置工具集合
│   └── ui/             # CLI 入口
├── docs/               # 架构与设计文档
│   └── tool/          # 每个工具的详细使用说明
├── history/            # 会话历史记录（JSONL 格式）
└── dist/              # 构建输出
```

## 🛠️ 开发脚本

- **安装依赖**：`bun install`
- **运行 CLI**：`bun start "问题" --once`
- **格式化代码**：`bun run format` / `bun run format:check`
- **构建项目**：`bun build`
- **构建二进制**：`bun run build:binary`

## 📚 工具文档

每个内置工具都有详细的文档说明，位于 `docs/tool/` 目录下：

- `bash.md` - Shell 命令执行
- `run_bun.md` - Bun 代码解释器（含沙箱说明）
- `webfetch.md` - 网页抓取工具
- `read.md` / `write.md` / `edit.md` - 文件操作
- `glob.md` / `grep.md` - 文件搜索
- `save_memory.md` - 长期记忆保存
- `todo.md` - 任务管理
- `time.md` - 时间信息获取

## 🔒 安全特性

- **代码沙箱**：`run_bun` 工具在隔离环境中执行代码
- **网络限制**：默认禁用网络访问，需显式开启
- **文件权限**：严格控制文件系统访问范围
- **大小限制**：网页抓取和代码输出有大小限制

## 🤝 贡献指南

请参考 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与项目开发。

## 📄 许可证

本项目采用 MIT 许可证。
