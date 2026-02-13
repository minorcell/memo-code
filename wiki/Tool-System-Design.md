# Memo Code 工具系统设计（维护视角）

这篇是我给自己和后续维护者写的“工具系统速查”。
目标不是讲概念，而是回答三个问题：

1. 工具怎么定义、怎么接进来。
2. 风险怎么分级、审批怎么走。
3. 出问题时应该先看哪几层。

## 总览

Memo Code 的工具系统是分层的：

- 工具定义层：声明工具输入、并行能力、是否有副作用。
- 风险与审批层：对工具调用做风险分级和审批拦截。
- 编排层：统一做入参校验、错误归类、结果裁剪。
- MCP 适配层：把外部 MCP server 的资源和工具纳入同一调用面。

## 1) 工具定义：`defineMcpTool`

位置：`packages/tools/src/tools/types.ts`

```typescript
defineMcpTool({
  name: 'apply_patch',
  description: 'Edit a local file by direct string replacement.',
  inputSchema: zod_schema,
  isMutating: true,
  supportsParallelToolCalls: false,
  execute: async (input) => CallToolResult,
})
```

几个关键参数：

- `name`：工具唯一标识。
- `description`：给模型看的能力描述。
- `inputSchema`：Zod 输入校验，编排层会自动执行。
- `isMutating`：是否有写操作，影响审批策略。
- `supportsParallelToolCalls`：是否允许并发。
- `execute`：实际执行逻辑，返回 `CallToolResult`。

## 2) 内置工具现状

| 工具 | 功能 | 风险等级 | 支持并行 |
| --- | --- | --- | --- |
| `read_file` | 读取文件 | read | ✓ |
| `apply_patch` | 编辑文件 | write | ✗ |
| `grep_files` | 搜索内容 | read | ✓ |
| `list_dir` | 列出目录 | read | ✓ |
| `exec_command` | 执行命令 | execute | ✓ |
| `write_stdin` | 写入 stdin | execute | ✓ |
| `webfetch` | HTTP 请求 | write | ✓ |
| `spawn_agent` | 启动子 agent | execute | ✓ |
| `update_plan` | 更新任务计划 | read | ✗ |
| `get_memory` | 获取持久化记忆 | read | ✗ |
| `list_mcp_resources` | 列出 MCP 资源 | read | ✓ |
| `read_mcp_resource` | 读取 MCP 资源 | read | ✓ |

## 3) 风险分级

位置：`packages/tools/src/approval/classifier.ts`

默认分四级：`read < write < execute < critical`。

关键词分类规则：

- `execute`：shell / exec / command / run / spawn
- `write`：patch / write / edit / create / delete
- `read`：read / file / list / grep / fetch / get

这层是“第一道粗过滤”。即便工具描述写得比较模糊，也会被关键词兜底分到可接受的风险桶里。

## 4) 审批策略

位置：`packages/tools/src/approval/manager.ts`

`auto` 模式：

- `read`：自动通过
- `write`：首次审批后可按 `session` / `once` 缓存
- `execute` / `critical`：每次都需要审批

`strict` 模式：

- 只要有风险就审批

审批决策类型：

- `session`：本会话内持续放行
- `once`：仅本次调用放行
- `deny`：拒绝

## 5) 编排器职责

位置：`packages/tools/src/orchestrator/index.ts`

这里是工具系统真正“把关”的入口，主要做这些事：

- 入参校验：基于 Zod schema 自动校验
- 审批钩子：在执行前统一接入审批流程
- 结果裁剪：默认 12KB，可用 `MEMO_TOOL_RESULT_MAX_CHARS` 调整
- 错误归类：比如 `sandbox_denied` / `execution_failed`

## 常见调用示例

### `read_file`

```typescript
await read_file({ file_path: '/path/to/file.ts' })

await read_file({
  file_path: '/path/to/file.ts',
  offset: 10,
  limit: 50,
})

await read_file({
  file_path: '/path/to/file.ts',
  mode: 'indentation',
  indentation: {
    anchor_line: 50,
    max_levels: 2,
    include_siblings: true,
  },
})
```

### `apply_patch`

```typescript
await apply_patch({
  file_path: '/path/to/file.ts',
  old_string: 'const foo = 1',
  new_string: 'const foo = 2',
})

await apply_patch({
  file_path: '/path/to/file.ts',
  edits: [
    { old_string: 'foo', new_string: 'bar' },
    { old_string: 'old', new_string: 'new' },
  ],
})

await apply_patch({
  file_path: '/path/to/file.ts',
  old_string: 'debug',
  new_string: '',
  replace_all: true,
})
```

### `exec_command`

```typescript
await exec_command({ cmd: 'ls -la' })

await exec_command({
  cmd: 'npm test',
  workdir: '/project/path',
})

await exec_command({
  cmd: 'htop',
  tty: true,
})

await exec_command({
  cmd: 'cat large.log',
  max_output_tokens: 1000,
})

await exec_command({
  cmd: 'docker build .',
  sandbox_permissions: 'require_escalated',
})
```

### `grep_files`

```typescript
await grep_files({ pattern: 'function test' })

await grep_files({
  pattern: 'TODO',
  limit: 20,
})

await grep_files({
  pattern: 'console.log',
  include: '*.ts',
})
```

### `webfetch`

```typescript
await webfetch({ url: 'https://api.github.com/repos' })

await webfetch({
  url: 'https://example.com/large-doc',
  max_chars: 5000,
})
```

### `collab` 子 agent

```typescript
await spawn_agent({
  message: '请帮我重构这个函数',
  agent_type: 'general',
})

await send_input({
  id: 'agent-123',
  message: '还有其他需要修改的吗？',
})

await wait({
  ids: ['agent-123'],
  timeout_ms: 60000,
})

await close_agent({ id: 'agent-123' })
```

## 自定义工具开发（最短路径）

### 1) 新建工具文件

```typescript
// packages/tools/src/tools/my_custom_tool.ts
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const MY_TOOL_INPUT_SCHEMA = z.object({
  param1: z.string().min(1),
  param2: z.number().optional(),
})

type MyToolInput = z.infer<typeof MY_TOOL_INPUT_SCHEMA>

export const myCustomTool = defineMcpTool<MyToolInput>({
  name: 'my_custom_tool',
  description: 'Description of what this tool does for the LLM',
  inputSchema: MY_TOOL_INPUT_SCHEMA,
  isMutating: false,
  supportsParallelToolCalls: true,
  execute: async (input) => {
    try {
      const result = await doSomething(input)
      return textResult(`Success: ${result}`)
    } catch (err) {
      return textResult(`Failed: ${(err as Error).message}`, true)
    }
  },
})
```

### 2) 在入口注册

```typescript
import { myCustomTool } from '@memo/tools/tools/my_custom_tool'

function buildCodexTools(): McpTool[] {
  const tools: McpTool[] = []
  tools.push(myCustomTool)
  return tools
}
```

### 3) 实战里我最看重的几条

- 入参一定用 Zod，别跳过。
- 路径先 `normalizePath()`，写路径先做 deny 检查。
- 错误要可读，用 `textResult(error, true)` 返回。
- `isMutating` 标对，不然后续审批行为会和预期不一致。

常用辅助函数：

```typescript
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'

textResult('message')
textResult('error message', true)

const safePath = normalizePath(userPath)

const denyReason = writePathDenyReason(absPath)
if (denyReason) throw new Error(denyReason)
```

## MCP 集成

### MCP 资源访问

```typescript
await list_mcp_resources({ server: 'github' })

await list_mcp_resource_templates({ server: 'github' })

await read_mcp_resource({
  server: 'github',
  uri: 'https://github.com/user/repo',
})
```

### MCP 工具转发

```toml
# ~/.memo/config.toml
active_mcp_servers = ["github", "filesystem"]
```

### MCP 上下文池

```typescript
import { getActiveMcpPool } from '@memo/tools/router/mcp/context'

function getPoolOrThrow() {
  const pool = getActiveMcpPool()
  if (!pool) {
    throw new Error('MCP pool is not initialized')
  }
  return pool
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `MEMO_TOOL_RESULT_MAX_CHARS` | 工具结果最大字符数 | 12000 |
| `MEMO_EXPERIMENTAL_TOOLS` | 启用的实验性工具（逗号分隔） | - |
| `MEMO_SHELL_TOOL_TYPE` | shell 工具模式 | unified_exec |
| `MEMO_ENABLE_COLLAB_TOOLS` | 启用协作工具 | 1 |
| `MEMO_ENABLE_MEMORY_TOOL` | 启用记忆工具 | 1 |
| `MEMO_SUBAGENT_MAX_AGENTS` | 最大子 agent 数量 | 4 |

## 目录速览

```text
packages/tools/src/
├── tools/
│   ├── apply_patch.ts
│   ├── read_file.ts
│   ├── grep_files.ts
│   ├── list_dir.ts
│   ├── exec_command.ts
│   ├── write_stdin.ts
│   ├── webfetch.ts
│   ├── mcp_resources.ts
│   ├── update_plan.ts
│   ├── get_memory.ts
│   ├── collab.ts
│   └── types.ts
├── approval/
│   ├── manager.ts
│   ├── classifier.ts
│   ├── fingerprint.ts
│   └── constants.ts
├── orchestrator/
│   └── index.ts
├── router/
│   ├── index.ts
│   └── mcp/
└── index.ts
```

## 收尾

如果只记一句话：

- 工具定义保证“能调”。
- 风险审批保证“可控”。
- 编排层保证“稳定输出”。

这三层各司其职，工具系统就不会随着工具数量增长而失控。
