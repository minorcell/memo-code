---
title: Tool Module Architecture
description: Detailed explanation of memo's tool system design
---

# Tool Module Architecture

## Overview

The tool system in memo is designed to enable AI assistants (Agents) to safely use various capabilities like executing commands, reading/writing files, making web requests, and more. This document explains the four-layer architecture that makes this possible.

## 1. Core Design Philosophy

**Goal**: Allow AI assistants to safely and effectively use tools to help users with software engineering tasks.

**Key Challenges**:

- How to manage many different tools uniformly?
- How to ensure safety (prevent dangerous operations)?
- How to let AI know what tools are available?
- How to handle both built-in and external (MCP) tools?

## 2. Four-Layer Architecture (Onion Model)

### Layer 1: Tool Implementation Layer (Innermost)

```
packages/tools/src/tools/
├── exec_command.ts      # Execute shell commands
├── read_text_file.ts    # Read text file contents
├── read_media_file.ts   # Read media file as base64 payload
├── read_files.ts        # Read multiple text files
├── write_file.ts        # Atomic file write
├── edit_file.ts         # Structured text edits + diff
├── apply_patch.ts       # Modify files
├── webfetch.ts          # Make HTTP requests
├── list_directory.ts    # List directory contents
├── search_files.ts      # Search files by glob path pattern
├── update_plan.ts       # Update task plans
├── get_memory.ts        # Access persisted memory
└── ...
```

**Characteristics**:

- Each tool is independent and self-contained
- Uses `defineMcpTool()` for consistent interface
- Implements specific functionality without dependencies on other layers
- Includes input validation and error handling

**Example Tool Definition**:

```typescript
export const readTextFileTool = defineMcpTool({
    name: 'read_text_file',
    description: 'Read text with optional head/tail line limits',
    inputSchema: z
        .object({
            path: z.string().min(1),
            head: z.number().int().positive().optional(),
            tail: z.number().int().positive().optional(),
        })
        .strict(),
    execute: async (input) => {
        // validatePath + read
        return textResult('...')
    },
})
```

### Layer 2: Routing Layer (Tool Manager)

```
packages/tools/src/router/
├── index.ts            # ToolRouter - Main coordinator
├── native/index.ts     # Built-in tool registry
├── mcp/index.ts        # External MCP tool registry
└── types.ts            # Unified interface definitions
```

**ToolRouter Responsibilities**:

1. **Registration**: `registerNativeTool()` - Store tools in registry
2. **Discovery**: `getTool("read_text_file")` - Find tools by name
3. **Execution**: `execute("read_text_file", {...})` - Run tools with input
4. **Documentation**: `generateToolDescriptions()` - Create tool list for AI
5. **Unified Interface**: Handle both native and MCP tools transparently

**Key Methods**:

- `getAllTools()`: Returns all available tools
- `generateToolDefinitions()`: Creates API-compatible tool definitions
- `hasTool(name)`: Checks if tool exists
- `dispose()`: Cleans up resources (closes MCP connections)

### Layer 3: Orchestration Layer (Execution Scheduler)

```
packages/tools/src/orchestrator/
├── index.ts            # Execution orchestrator
└── types.ts            # Execution-related types
```

**Orchestrator Responsibilities**:

1. **Request Handling**: Receive tool execution requests from AI
2. **Safety Check**: Call approval layer for risk assessment
3. **Tool Invocation**: Use router to find and execute tools
4. **Result Processing**: Limit output size, format errors, handle timeouts
5. **Parallel Execution**: Manage concurrent tool calls when supported

**Output Size Control**:

- Limits tool results to prevent token overflow
- Configurable via `MEMO_TOOL_RESULT_MAX_CHARS` environment variable
- Provides clear hints when output is truncated

### Layer 4: Approval Layer (Security Guard)

```
packages/tools/src/approval/
├── classifier.ts       # Risk classifier
├── fingerprint.ts      # Request fingerprinting
├── manager.ts          # Approval manager
├── constants.ts        # Risk level constants
└── types.ts            # Security types
```

**Security Mechanisms**:

#### Risk Classification

Tools are automatically classified into risk levels:

- **read**: Low risk (e.g., `read_text_file`, `list_directory`, `webfetch`)
- **write**: Medium risk (e.g., `apply_patch`, file modifications)
- **execute**: High risk (e.g., `exec_command`, shell operations)

#### Approval Modes

- **auto mode**: Only `write` and `execute` tools require approval
- **strict mode**: All tools require approval
- **fingerprinting**: Unique request IDs for audit trails

#### Default Risk Levels

```typescript
const DEFAULT_TOOL_RISK_LEVELS: Record<string, RiskLevel> = {
    exec_command: 'execute',
    write_stdin: 'execute',
    shell: 'execute',
    shell_command: 'execute',
    apply_patch: 'write',
    write_file: 'write',
    edit_file: 'write',
    read_text_file: 'read',
    read_media_file: 'read',
    read_files: 'read',
    list_directory: 'read',
    search_files: 'read',
    webfetch: 'read',
    update_plan: 'read',
    get_memory: 'read',
}
```

## 3. Unified Tool Interface

All tools implement this common interface:

```typescript
interface Tool {
    name: string // Unique tool identifier
    description: string // Human-readable description
    source: 'native' | 'mcp' // Tool origin
    inputSchema: JSONSchema // Input parameter schema
    supportsParallelToolCalls?: boolean // Can run concurrently
    isMutating?: boolean // Modifies external state
    validateInput?: (input: unknown) => ValidationResult
    execute: (input: unknown) => Promise<CallToolResult>
}
```

**Benefits**:

- Consistent API for all tools
- Easy to add new tools
- Clear separation of concerns
- Type-safe input validation

## 4. Workflow Example

**Scenario**: AI needs to read a file and run a command

```
User: Help me check package.json and run tests
AI: Needs two tools: read_text_file and exec_command

Step 1: AI sends request
→ Orchestrator receives: [read_text_file, exec_command]

Step 2: Safety check
→ Approval manager: read_text_file(low risk) ✓, exec_command(high risk) ⚠️
→ User approves exec_command

Step 3: Tool execution
→ Router finds read_text_file tool
→ Executes: reads package.json successfully
→ Router finds exec_command tool
→ Executes: runs "npm test"

Step 4: Result processing
→ Orchestrator combines both results
→ Limits output size if needed
→ Returns to AI
→ AI analyzes results and responds to user
```

## 5. Design Rationale

### Why Four Layers?

1. **Separation of Concerns**:
    - Implementation layer: What tools do
    - Routing layer: Where tools are and how to find them
    - Orchestration layer: How tools are executed
    - Approval layer: Whether tools should be executed

2. **Safety by Design**:
    - Dangerous operations require explicit approval
    - Sandbox restrictions prevent file system damage
    - Request fingerprinting enables audit trails

3. **Extensibility**:
    - Easy to add new tools without modifying core
    - Support for external MCP tools
    - Configurable security policies

4. **AI-Friendly**:
    - Automatic tool documentation generation
    - Clear error messages
    - Predictable behavior

### Analogy

- **Tool implementations** = Kitchen appliances (blender, oven, microwave)
- **Routing layer** = Appliance manuals + power outlets
- **Orchestration layer** = Smart kitchen controller
- **Approval layer** = Safety switches + child locks

## 6. Configuration and Environment Variables

### Tool Selection

- `MEMO_SHELL_TOOL_TYPE`: Choose shell tool variant (`unified_exec`, `shell`, `shell_command`)
- `MEMO_ENABLE_COLLAB_TOOLS`: Disable collaborative agent tools when set to `0` (enabled by default)
- `MEMO_SUBAGENT_COMMAND`: Command executed for each subagent submission
- `MEMO_SUBAGENT_MAX_AGENTS`: Max concurrent running subagents
- `MEMO_ENABLE_MEMORY_TOOL`: Enable memory access tool
- `MEMO_FS_ALLOWED_ROOTS`: Comma-separated additional allowed filesystem roots (default root is runtime `cwd`)

### Security Settings

- `MEMO_SANDBOX_WRITABLE_ROOTS`: Comma-separated writable directories
- `MEMO_APPROVAL_MODE`: `auto` or `strict` approval mode

### Performance Tuning

- `MEMO_TOOL_RESULT_MAX_CHARS`: Maximum tool output size
- Various timeout and buffer size settings

## 7. Adding a New Tool

1. **Create implementation** in `packages/tools/src/tools/`
2. **Use `defineMcpTool()`** for consistent interface
3. **Add to exports** in `packages/tools/src/index.ts`
4. **Write tests** in `*.test.ts` file
5. **Update risk classification** if needed

Example new tool structure:

```typescript
// packages/tools/src/tools/my_tool.ts
import { defineMcpTool } from './types'

export const myTool = defineMcpTool({
    name: 'my_tool',
    description: 'Description of my tool',
    inputSchema: z.object({
        /* schema */
    }),
    execute: async (input) => {
        // Implementation
    },
})
```

## 8. Related Documentation

- [Tools Overview](../user/tools.md) - User-facing tool documentation
- [Approval & Safety](../user/approval-safety.md) - Security features
- [MCP Integration](../user/mcp.md) - External tool support
- [Tool-specific docs](./) - Individual tool documentation

---

_Last updated: 2026-02-08_
