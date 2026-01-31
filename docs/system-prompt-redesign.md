# 系统提示词重构说明

## 概述

本次重构参考 Kimi CLI 的系统提示词设计，对 Memo Code CLI 的系统提示词进行了全面优化。新版本在结构层次、内容完整性和指导性方面都有显著提升。

## 主要改进

### 1. 结构层次优化

**旧版结构：**

- 角色与目标
- 核心特质
- 输出格式
- 行为准则（AGENTS.md、Planning、Execution、Shell、Final Answer）
- 工具定义（简单列表）

**新版结构：**

- 身份声明
- Prompt and Tool Use
    - Output Format（明确区分 Tool Call vs Final Answer）
    - ReAct Loop Workflow
- Working Environment
    - Operating System
    - Date and Time
    - Working Directory
    - Project Context（AGENTS.md 说明）
- General Guidelines
    - For New Projects
    - For Existing Codebases
    - Task Planning with Todo Tool
    - File Operations
    - Web Operations
    - Security Guidelines
    - Long-Term Memory
- Available Tools（每个工具详细说明）
- Response Style
- Ultimate Reminders

### 2. 内容增强

#### ReAct 循环说明

新增专门的 ReAct Loop Workflow 章节，明确解释 Agent 的工作流程：

- Analyze → Decide → Tool Call → Observation → Final Response

#### 工具说明升级

**旧版：** 简单列出工具名称和参数示例

**新版：** 每个工具包含：

- 功能描述
- 输入参数说明
- 使用建议和最佳实践
- 特殊注意事项

#### 环境信息

新增 Working Environment 章节，说明：

- 操作系统限制
- 时间获取方式
- 工作目录概念
- AGENTS.md 的作用和优先级

#### 安全规范

新增专门的安全指导：

- API 密钥保护
- 路径防御
- 权限控制

### 3. 语言风格改进

- **更专业**：参考业界最佳实践的结构设计
- **更清晰**：使用标题层级和列表提高可读性
- **更一致**：统一术语和格式
- **中文界面**：使用中文撰写，更贴合中文用户习惯

### 4. 保留的原有特性

- 工具调用格式（JSON code block）保持不变
- 最终回答格式（自然语言）保持不变
- 对 AGENTS.md 的支持和优先级规则保持不变
- 对 `save_memory` 长期记忆的支持保持不变

## 技术细节

### 文件位置

```
packages/core/src/runtime/prompt.md
```

### 动态内容注入

当前版本保留了静态提示词设计。未来可考虑通过 `loadPrompt` 函数注入动态变量：

- `${MEMO_NOW}` - 当前时间
- `${MEMO_WORK_DIR}` - 工作目录
- `${MEMO_AGENTS_MD}` - AGENTS.md 内容

### 外部 MCP 工具

外部 MCP 工具的动态注入逻辑在 `defaults.ts` 中保持不变：

```typescript
if (mcpTools.length > 0) {
    basePrompt += `\n\n# External Tools\n${toolDescs}`
}
```

### 长期记忆

长期记忆的注入逻辑保持不变：

```typescript
const memoryPath = getMemoryPath(loaded)
// ... 读取并追加到提示词
```

## 兼容性

- ✅ 与现有工具实现完全兼容
- ✅ 与现有 Session/ReAct 循环逻辑兼容
- ✅ 与现有测试用例兼容
- ✅ 与外部 MCP 工具机制兼容

## 后续建议

1. **动态变量支持**：考虑在 `defaults.ts` 中添加类似 Kimi CLI 的变量替换机制
2. **技能系统**：参考 Kimi CLI 的 Skills 设计，添加可插拔的知识模块
3. **工具文档独立化**：将每个工具的详细说明拆分为独立 Markdown 文件
4. **多语言支持**：考虑根据用户偏好自动切换提示词语言

## 测试验证

```bash
# 构建测试
bun run build

# 单元测试
bun test packages/core/src/runtime

# 完整测试
bun test
```

所有现有测试均已通过。
