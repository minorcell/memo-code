# MCP 扩展

MCP（Model Context Protocol）允许 Memo 连接外部工具服务，为模型提供额外能力（知识库、工单系统、浏览器自动化等）。

## 一、使用 CLI 管理 MCP（推荐）

### 查看

```bash
memo mcp list
memo mcp list --json
memo mcp get <name>
memo mcp get <name> --json
```

### 添加

添加本地 stdio 服务：

```bash
memo mcp add local_tools -- /path/to/mcp-server --flag
```

添加远程 streamable HTTP 服务：

```bash
memo mcp add remote --url https://your-mcp-server.com/mcp --bearer-token-env-var MCP_TOKEN
```

### 删除

```bash
memo mcp remove <name>
```

### 登录/登出说明

```bash
memo mcp login <name>
memo mcp logout <name>
```

当前版本不支持 OAuth 登录流；建议改用 `--bearer-token-env-var`。

## 二、直接编辑 `config.toml`

### 本地 stdio

```toml
[mcp_servers.local_tools]
command = "/path/to/mcp-server"
args = ["--flag"]
```

### 远程 HTTP

```toml
[mcp_servers.remote]
type = "streamable_http"
url = "https://your-mcp-server.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
```

## 三、在 TUI 内查看当前加载结果

输入：

```text
/mcp
```

会显示当前会话已加载的 MCP 服务器信息。

## 四、配置生效时机

MCP 在“创建会话”时加载。修改配置后请重启 `memo` 或新建会话。

## 五、常见问题

- `mcp list` 有配置但 `/mcp` 看不到：通常是当前会话创建于修改之前，重开会话即可。
- 远程服务鉴权失败：检查 `bearer_token_env_var` 指向的环境变量是否已导出。
