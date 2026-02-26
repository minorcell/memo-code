<div align="center">
  <img src="public/logo.svg" width="80" height="80" alt="Memo Logo">
  <h1>Memo Code</h1>
  <p>运行在终端里的轻量级编码代理。</p>
</div>

<p align="center">
  <a href="https://github.com/minorcell/memo-code/actions/workflows/ci.yml">
    <img src="https://github.com/minorcell/memo-code/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI">
  </a>
  <a href="https://codecov.io/gh/minorcell/memo-code">
    <img src="https://codecov.io/gh/minorcell/memo-code/graph/badge.svg" alt="Coverage">
  </a>
  <a href="https://www.npmjs.com/package/@memo-code/memo">
    <img src="https://img.shields.io/npm/v/%40memo-code%2Fmemo" alt="npm version">
  </a>
  <a href="README.md">English</a>
</p>

<p align="center">
  🌐 <strong>官方网站</strong>: <a href="https://memo.mcell.top/">https://memo.mcell.top/</a><br>
  📚 <strong>完整文档</strong>: <a href="https://memo.mcell.top/zh/docs/getting-started/">https://memo.mcell.top/zh/docs/getting-started/</a>
</p>

<img src="public/demo.png" width="100%" alt="Memo Code 演示图">

## 🌱 起源

Memo 诞生于一个简单的想法：**我想验证一个最简单的 Agent 是什么样子**。

25年下半年，我在写下技术博客 [Agent = LLM + TOOL](https://stack.mcell.top/blog/2025/26_agent_is_llm_plus_tools) 时，开始思考 Agent 的本质——无非是 LLM + Tool 的循环。但当我真正开始实现时，发现每一个看似简单的功能背后都有大量的工程细节需要处理：

- 系统提示词的最佳实践
- 工具的设计与安全边界
- 多模型切换与兼容性
- 上下文管理（尤其是长会话的压缩策略）
- TUI 难以处理的交互
- Web 版本的多工作区支持
- npm 包的分发与热更新
- ...

这个项目从一个小 demo 逐渐成长为我现在日常开发中离不开的"效能助手"——它帮我更新文档、管理 GitHub Issues、排查项目问题..., 而我依然使用 Claude Code、Codex CLI 作为主力开发工具，Memo 则是那个默默在后台帮我处理琐事的伙伴。

> 这是一个**个人从 0 构建**的项目，所有架构设计、技术决策都是独立的探索与权衡。如果你对 Agent 的工程实现感兴趣，我希望 Memo 能给你一些参考。

## ✨ 核心特性

| 特性                | 说明                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| **终端 + Web 双端** | 终端 TUI 交互流畅，Web Console 支持多工作区、并发实时会话（最高 20 个） |
| **智能上下文管理**  | 自动压缩长会话上下文，支持配置压缩阈值，毫秒级 token 估算               |
| **Skills 技能系统** | Skills 技能集成，自动发现 `SKILL.md`，支持按场景激活                    |
| **MCP 深度集成**    | 支持本地/远程 MCP 服务器，OAuth 登录，运行时动态切换                    |
| **企业级安全**      | 工具分级审批机制（自动批准/手动批准），支持单次/会话/拒绝三种模式       |
| **OpenAI 兼容**     | 支持任意 OpenAI 兼容 API，灵活配置多 Provider 切换                      |

## 🚀 快速开始

### 1. 安装

```bash
npm install -g @memo-code/memo
# 或 pnpm / yarn / bun
```

### 2. 配置 API Key

```bash
export OPENAI_API_KEY=your_key
# 或配置其他兼容 API
```

### 3. 运行

```bash
memo
```

首次运行会自动引导配置 Provider 和 Model，配置保存至 `~/.memo/config.toml`。

## 📖 使用模式

| 模式       | 命令                                           | 场景                   |
| ---------- | ---------------------------------------------- | ---------------------- |
| 交互模式   | `memo`                                         | 默认，完整 TUI 体验    |
| 单次模式   | `memo --once "prompt"`                         | 执行一次后退出         |
| 继续会话   | `memo --prev`                                  | 加载当前目录的最新会话 |
| Web 控制台 | `memo web --host 127.0.0.1 --port 5494 --open` | 浏览器操作             |

## 🏗️ 架构设计

```
memo-code/
├── packages/
│   ├── core/          # 核心逻辑：Session 状态机、Config 处理
│   ├── tools/         # Tool 路由、MCP Client管理、内置工具实现（exec_command, read_text_file, apply_patch...）
│   ├── tui/           # 终端运行时：CLI 入口、交互式 TUI
│   ├── web-ui/        # Web 前端：React 组件
│   └── web-server/    # Web 后端：会话管理、API 适配器
└── docs/              # 技术文档
```

**技术亮点：**

- **架构**：清晰的 Core / Tools / TUI 分层，状态机驱动会话管理
- **测试**：Core + Tools 覆盖率 > 70%，完整的单元 + 集成测试
- **协议**：原生支持 MCP (Model Context Protocol)，可接入任意 MCP 工具服务器
- **Token 估算**：基于 tiktoken 的实时上下文监控，支持可配置的自动压缩策略
- **分发**：npm 包预构建 Web 资源，热加载无感知

## 🔧 内置工具

- `exec_command` / `write_stdin` - 执行 Shell 命令
- `apply_patch` - 字符串级代码编辑（单文件/批量）
- `read_text_file` / `read_media_file` / `read_files` / `write_file` / `edit_file` / `list_directory` / `search_files` - 文件系统读写与检索
- `webfetch` - 网页抓取
- MCP 资源访问 - `list_mcp_resources`, `read_mcp_resource`
- `update_plan` - 结构化任务进度管理
- `get_memory` - 持久化记忆读取

## ⚙️ 配置示例

```toml
current_provider = "openai_compatible"
auto_compact_threshold_percent = 80

[[providers.openai_compatible]]
name = "openai_compatible"
env_api_key = "OPENAI_API_KEY"
model = "gpt-4.1-mini"
base_url = "https://api.openai.com/v1"

# MCP 服务器
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

# Skills
active_skills = ["./skills/doc-writing/SKILL.md"]
```

---

## 🛠️ 开发指南

```bash
# 安装依赖
pnpm install

# 本地运行
pnpm start

# 构建发布包
pnpm run build

# 测试
pnpm test              # 全部测试
pnpm run test:coverage # 覆盖率报告 (阈值 ≥70%)

# 格式化
pnpm run format        # 写入
pnpm run format:check  # CI 检查
```

## 📄 开源许可

MIT License
