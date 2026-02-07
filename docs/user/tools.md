# 工具总览

Memo 内置一组 codex 风格工具，并支持 MCP 外部工具。通常你不需要手动“点名调用工具”，只需明确目标和约束。

## 一、当前内置工具分组

### 1) Shell 执行族

- `exec_command`
- `write_stdin`
- `shell`（兼容模式）
- `shell_command`（兼容模式）

说明：

- 默认 `MEMO_SHELL_TOOL_TYPE=unified_exec`，通常使用 `exec_command + write_stdin`。
- `shell` / `shell_command` 主要用于兼容切换。

### 2) 文件与检索族

- `apply_patch`
- `read_file`
- `list_dir`
- `grep_files`

说明：

- `apply_patch` 为写入工具。
- `read_file` / `list_dir` / `grep_files` 受 `MEMO_EXPERIMENTAL_TOOLS` 控制。
- 当前实现中，`MEMO_EXPERIMENTAL_TOOLS` 为空时默认全部启用这三项。

### 3) MCP 资源族

- `list_mcp_resources`
- `list_mcp_resource_templates`
- `read_mcp_resource`

### 4) 流程与上下文工具

- `update_plan`
- `get_memory`（可开关）
- `webfetch`

### 5) 多 agent（Subagent）工具

- `spawn_agent`
- `send_input`
- `resume_agent`
- `wait`
- `close_agent`

说明：

- 默认启用；可通过 `MEMO_ENABLE_COLLAB_TOOLS=0` 显式关闭。

## 二、审批风险分级（默认）

- 只读：通常自动放行（如 `read_file`、`list_dir`、`grep_files`、`webfetch`、MCP 读取类）
- 写入：需要审批（`apply_patch`）
- 执行：需要审批（Shell 执行族）
- Subagent 工具族默认免审批，按危险语义执行（需自行控制任务边界）

详细机制见：[审批与安全](./approval-safety.md)

## 三、常用运行开关

- `MEMO_SHELL_TOOL_TYPE`：`unified_exec` / `shell` / `shell_command` / `disabled`
- `MEMO_EXPERIMENTAL_TOOLS`：逗号分隔（如 `read_file,list_dir`）
- `MEMO_ENABLE_MEMORY_TOOL`：`0` 时禁用 `get_memory`
- `MEMO_ENABLE_COLLAB_TOOLS=0`：禁用 subagent 工具（默认启用）
- `MEMO_SUBAGENT_COMMAND`：subagent 实际执行命令
- `MEMO_SUBAGENT_MAX_AGENTS`：subagent 并发上限（默认 `4`）

## 四、如何让工具调用更稳定

- 明确作用范围：例如“只改 `packages/tools/src/index.ts`”。
- 先读后写：先让模型读取目标文件，再执行改动。
- 给出约束：例如“禁止执行删除命令，只允许读操作”。
- 输出过长时收敛范围：缩小目录、增加关键词、降低结果上限。

## 五、Subagent 专项说明

如果你要系统使用 `spawn_agent / send_input / wait / close_agent / resume_agent`，建议先阅读：

- [`docs/user/subagent.md`](./subagent.md)

## 六、工具参数细节

各工具参数与示例见 `docs/tool/*`：

- `docs/tool/exec_command.md`
- `docs/tool/write_stdin.md`
- `docs/tool/apply_patch.md`
- `docs/tool/read_file.md`
- `docs/tool/list_dir.md`
- `docs/tool/grep_files.md`
- `docs/tool/webfetch.md`
- `docs/tool/get_memory.md`
- `docs/tool/list_mcp_resources.md`
- `docs/tool/list_mcp_resource_templates.md`
- `docs/tool/read_mcp_resource.md`
- `docs/tool/spawn_agent.md`
- `docs/tool/send_input.md`
- `docs/tool/resume_agent.md`
- `docs/tool/wait.md`
- `docs/tool/close_agent.md`
