# 工具（内置工具总览）

Memo 内置一组常用工具，并支持通过 MCP 扩展外部工具。大多数时候你不需要“手动调用工具”，只要把意图说清楚，并在需要时点名让它读取/修改哪些文件即可。

## 内置工具分组

### 只读类（通常无需审批）

- `read`：读取文件内容（支持 offset/limit）
- `glob`：按模式查找文件路径（如 `src/**/*.ts`）
- `grep`：基于 `rg` 搜索内容（正则/文件列表/计数）
- `webfetch`：受限 HTTP GET，返回剥离后的正文预览
- `todo`：进程内待办（不持久化）

### 写入类（需要审批）

- `write`：写文件
- `edit`：按 patch 编辑文件
- `save_memory`：写入长期记忆（仅存用户偏好/身份信息，不要存项目细节）

### 执行类（高风险，需要审批）

- `bash`：执行 shell 命令并返回 stdout/stderr/exit code

## 如何更有效地让 Memo 使用工具

- **明确目标与范围**：例如“只修改 @packages/core/src/config/config.ts，不要动其他文件”
- **先读后写**：例如“先读取 @README.md，再基于现有结构补一节”
- **给出约束**：例如“不要运行破坏性命令；只读不写”

## 工具详细参数文档（逐个工具）

这些页面更偏“参数/行为定义”，需要时再查：

- `read`：`docs/tool/read.md`
- `glob`：`docs/tool/glob.md`
- `grep`：`docs/tool/grep.md`
- `webfetch`：`docs/tool/webfetch.md`
- `write`：`docs/tool/write.md`
- `edit`：`docs/tool/edit.md`
- `bash`：`docs/tool/bash.md`
- `todo`：`docs/tool/todo.md`
- `save_memory`：`docs/tool/save_memory.md`

## 相关文档

- 工具审批与危险模式：见 [工具审批与安全](./approval-safety.md)
- MCP 外部工具：见 [MCP 扩展](./mcp.md)
