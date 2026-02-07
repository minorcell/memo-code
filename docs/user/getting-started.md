# Getting Started

Memo Code is a lightweight coding agent that runs in your terminal and assists coding workflows through natural language.

## 1) Install

Global installation:

```bash
npm install -g @memo-code/memo
# or use pnpm / yarn / bun
```

Verify installation (current version does not provide `memo --help`; help is available in TUI `/help`; `mcp` subcommand has standalone help):

```bash
memo mcp help
```

## 2) Configure API Key (Environment Variable)

Memo reads API keys from the environment variable defined by provider config (for example `DEEPSEEK_API_KEY`) and also supports `OPENAI_API_KEY`.

Examples (choose one):

```bash
export DEEPSEEK_API_KEY=your_key
# or
export OPENAI_API_KEY=your_key
```

## 3) Start Using Memo

### Interactive Mode (Recommended)

```bash
memo
```

On first run, if no config file is found, Memo enters the TUI setup flow and creates `~/.memo/config.toml` (you can relocate it with `MEMO_HOME`; see the Configuration doc).

### Plain Mode (non-TTY, good for scripts/pipelines)

```bash
echo "Explain how to fix this error" | memo
```

When stdin is non-TTY, Memo automatically uses plain mode:

```bash
echo "Summarize this repository structure" | memo
```

### Dangerous Mode (Skip tool approval, use carefully)

```bash
memo --dangerous
# or
memo -d
```

## Next

- Want shortcuts and commands: read [CLI / TUI Usage](./cli-tui.md)
- Want custom provider/base_url/multi-model setup: read [Configuration](./configuration.md)
- Want tool capability boundaries: read [Tools](./tools.md)
