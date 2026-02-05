# MCP 扩展（外部工具/服务）

MCP（Model Context Protocol）允许 Memo 连接外部工具服务器，把更多能力以“工具”的形式提供给模型（例如：内部知识库、工单系统、浏览器自动化等）。

## 配置方式一：使用 CLI 管理（推荐）

列出：

```bash
memo mcp list
memo mcp list --json
```

添加本地 stdio server：

```bash
memo mcp add local_tools -- /path/to/mcp-server --flag
```

添加远程 HTTP server（streamable HTTP）：

```bash
memo mcp add remote --url https://your-mcp-server.com/mcp --bearer-token-env-var MCP_TOKEN
```

查看/删除：

```bash
memo mcp get remote
memo mcp remove remote
```

> `memo mcp login/logout` 当前版本尚未支持 OAuth 流程（会提示改用 bearer token env var）。

## 配置方式二：直接编辑 `config.toml`

本地 stdio：

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = ["--flag"]
```

远程 HTTP：

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
```

## 在 TUI 中查看 MCP servers

在 TUI 输入：

- `/mcp`

会显示当前配置文件里已加载的 MCP server 列表与关键字段。

## 生效时机

MCP servers 在创建 session 时加载。修改配置后，建议重启 `memo` 或开始一个新会话以确保重新加载。
