<div align="center">
  <img src="public/logo.svg" width="96" height="96" alt="Memo Code logo">
  <h1>Memo Code</h1>
  <p><strong>A lightweight coding agent for terminal and web workflows.</strong></p>
  <p>
    <a href="https://memo.mcell.top/">Website</a>
    ·
    <a href="https://memo.mcell.top/zh/docs/getting-started/">Documentation</a>
    ·
    <a href="README.zh.md">中文文档</a>
  </p>
  <p>
    <a href="https://github.com/minorcell/memo-code/actions/workflows/test.yml">
      <img src="https://github.com/minorcell/memo-code/actions/workflows/test.yml/badge.svg?branch=main" alt="Test">
    </a>
    <a href="https://codecov.io/gh/minorcell/memo-code">
      <img src="https://codecov.io/gh/minorcell/memo-code/graph/badge.svg" alt="Coverage">
    </a>
    <a href="https://www.npmjs.com/package/@memo-code/memo">
      <img src="https://img.shields.io/npm/v/%40memo-code%2Fmemo" alt="npm version">
    </a>
  </p>
</div>

<p align="center">
  <img src="public/demo.png" width="100%" alt="Memo Code demo">
</p>

---

## 🌱 Origin

Memo started with a simple question: **What does the simplest Agent look like?**

In the second half of 2024, while writing my tech blog post [Agent = LLM + TOOL](https://stack.mcell.top/blog/2025/26_agent_is_llm_plus_tools), I began thinking about the essence of Agents — nothing more than LLM + Tool loops. But when I actually started implementing it, I discovered that behind every seemingly simple feature lies a mountain of engineering details:

- Best practices for system prompts
- Tool design and security boundaries
- Multi-model switching and compatibility
- Context management (especially long-session compaction strategies)
- Tricky TUI interactions
- Multi-workspace support for Web version
- npm package distribution and hot-reloading
- ...

This project grew from a small demo into an indispensable "productivity assistant" in my daily development — it helps me update documentation, manage GitHub Issues, debug projects... While I still use Claude Code and Codex CLI as my primary development tools, Memo quietly handles the tedious tasks in the background.

> This is a **personal project built from scratch**. All architectural designs and technical decisions are independent explorations and trade-offs. If you're interested in the engineering implementation of Agents, I hope Memo can give you some reference.

---

## ✨ Features

| Feature                       | Description                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Terminal + Web Dual Mode**  | Smooth TUI in terminal, Web Console with multi-workspace and concurrent real-time sessions (up to 20) |
| **Smart Context Management**  | Auto-compact long session context, configurable threshold, millisecond-level token estimation         |
| **Skills System**             | Skills integration, auto-discover `SKILL.md`, activate by scenario                                    |
| **Deep MCP Integration**      | Local/remote MCP servers, OAuth login, runtime dynamic switching                                      |
| **Enterprise-Grade Security** | Tool approval system (auto-approve/manual-approve), supports once/session/deny modes                  |
| **OpenAI Compatible**         | Works with any OpenAI-compatible API, flexible multi-Provider configuration                           |

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g @memo-code/memo
# or pnpm / yarn / bun
```

### 2. Configure API Key

```bash
export OPENAI_API_KEY=your_key
# or configure other compatible APIs
```

### 3. Run

```bash
memo
```

First run will guide you through Provider/Model setup and save config to `~/.memo/config.toml`.

---

## 📖 Usage Modes

| Mode           | Command                                        | Scenario                                  |
| -------------- | ---------------------------------------------- | ----------------------------------------- |
| Interactive    | `memo`                                         | Default, full TUI experience              |
| One-shot       | `memo --once "prompt"`                         | Run once and exit                         |
| Resume Session | `memo --prev`                                  | Load latest session for current directory |
| Web Console    | `memo web --host 127.0.0.1 --port 5494 --open` | Browser-based operation                   |

`memo web` requires a shared password via `MEMO_SERVER_PASSWORD`.

---

## 🏗️ Architecture

```
memo-code/
├── packages/
│   ├── core/          # Core logic: Session state machine, Config handling, HTTP server API
│   ├── tools/         # Tool routing, MCP Client management, built-in tools (exec_command, read_text_file, apply_patch...)
│   ├── tui/           # Terminal runtime: CLI entry, interactive TUI
│   ├── web-ui/        # Web frontend: React components
└── docs/              # Technical documentation
```

**Technical Highlights:**

- **Architecture**: Clean Core / Tools / TUI separation, state-machine driven session management
- **Testing**: Core + Tools coverage > 70%, complete unit + integration tests
- **Protocol**: Native MCP (Model Context Protocol) support, can integrate any MCP tool server
- **Token Estimation**: Real-time context monitoring based on AI SDK usage + local fallback estimator, configurable auto-compaction strategy
- **Distribution**: npm package with pre-built Web assets, hot-reloading without perception

---

## 🔧 Built-in Tools

- `exec_command` / `write_stdin` - Execute Shell commands
- `apply_patch` - Structured patch editing (`*** Begin Patch`/`*** End Patch`)
- `read_text_file` / `read_media_file` / `read_files` / `write_file` / `edit_file` / `list_directory` / `search_files` - Filesystem read/write/search
- `webfetch` - Paged web fetching with markdown extraction and policy guards
- MCP resource access - `list_mcp_resources`, `read_mcp_resource`
- `update_plan` - Structured task progress management
- `get_memory` - Persistent memory reading

---

## ⚙️ Config Example

```toml
current_provider = "openai_compatible"
auto_compact_threshold_percent = 80

[[providers.openai_compatible]]
name = "openai_compatible"
env_api_key = "OPENAI_API_KEY"
model = "gpt-4.1-mini"
base_url = "https://api.openai.com/v1"

# MCP Server
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]

# Skills
active_skills = ["./skills/doc-writing/SKILL.md"]
```

---

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Run locally
pnpm start

# Build for distribution
pnpm run build

# Test
pnpm test              # all tests
pnpm run test:coverage # coverage report (threshold ≥70%)

# Format
pnpm run format        # write
pnpm run format:check  # CI check
```

---

## 📄 License

MIT License
