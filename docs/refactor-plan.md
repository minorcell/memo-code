# Memo CLI 重构方案：参考 Claude Code 优化

## 一、核心问题诊断

### 1.1 当前 Memo 架构的主要问题

| 问题维度         | 现状                                 | 影响                             |
| ---------------- | ------------------------------------ | -------------------------------- |
| **工具调用效率** | 一次只能调用一个工具（串行）         | 10倍效率差距，复杂任务需多次往返 |
| **输出控制**     | 仅提到"简洁"，无硬性字数约束         | CLI 环境输出冗长，淹没关键信息   |
| **格式兼容性**   | 强依赖 JSON 格式，不兼容非结构化输出 | 多数模型不稳定遵循 JSON 格式     |
| **任务管理**     | Todo 工具作为记录而非驱动            | 长路径任务容易迷失，缺乏系统性   |
| **工程质量**     | 无强制 Lint/Typecheck 要求           | 容易提交语法错误                 |

### 1.2 Claude Code 的优势点

1. **并发调用机制**：支持在单个响应中并发调用多个独立工具
2. **严格字数控制**：强制 < 4 行文本输出（不含代码和工具调用）
3. **原生工具集成**：使用 Anthropic 原生 Tool Use API，不依赖自定义 JSON
4. **深度 Todo 集成**：将 Todo 作为"思维导图"驱动复杂任务
5. **简洁拒绝策略**：1-2 句话拒绝，不啰嗦解释

---

## 二、重构方案

### 2.1 架构重构：从 JSON ReAct 迁移到 Tool Use API

#### 当前架构（JSON 方式）

````
User → LLM → JSON 解析 → 工具调用 → 观察 → LLM → ...
         ↓
    parseAssistant(content)  // 从文本中提取 JSON
    - 策略1: 匹配 ```json ... ```
    - 策略2: 裸 JSON 对象
    - 策略3: 整体视为 final
````

**问题**：

- 模型输出不稳定（特别是小模型、非 Claude 模型）
- 无法并发调用工具
- 需要复杂的 JSON 提取逻辑
- 兼容性差

#### 目标架构（Tool Use API 方式）

```
User → LLM → Tool Use Blocks → 并发工具调用 → 观察 → LLM → ...
         ↓
    API 原生返回 tool_use blocks
    - 支持并发调用
    - 格式稳定
    - 所有主流 LLM 支持（Claude, GPT-4, DeepSeek v3 等）
```

**优势**：

- ✅ 原生支持并发调用
- ✅ 格式稳定可靠
- ✅ 跨模型兼容性好
- ✅ 简化解析逻辑

---

### 2.2 提示词重构：融合 Claude Code 精华

#### 对比分析

| 维度          | Claude Code                  | Memo 当前版本  | 推荐方案                          |
| ------------- | ---------------------------- | -------------- | --------------------------------- |
| **字数控制**  | 严格 < 4 行                  | 仅提"简洁"     | **采用 Claude：< 4 行硬性要求**   |
| **工具并发**  | 强制并发独立调用             | 不支持         | **采用 Claude：强制并发说明**     |
| **Todo 定位** | 思维导图驱动                 | 任务记录       | **采用 Claude：深度集成 Todo**    |
| **安全提示**  | 分散在各处                   | 集中在顶部     | **保留 Memo：简洁安全提示**       |
| **示例密度**  | 大量示例（Todo、Commit、PR） | 较少           | **采用 Claude：增加关键场景示例** |
| **拒绝策略**  | 1-2 句话，不解释             | 常规防御性说明 | **采用 Claude：简洁拒绝**         |
| **代码引用**  | `file:line` 格式             | 仅提文件名     | **采用 Claude：精确行号引用**     |

#### 新提示词架构（混合方案）

```markdown
# 核心定位（保留 Memo 特色）

- Local First 本地优先
- Project Aware 项目感知（AGENTS.md）
- Tool Rich 工具丰富

# 输出控制（采用 Claude 严格标准）

- **严格 < 4 行文本**（不含工具调用、代码块）
- 禁止啰嗦前言、后缀
- 示例：用户问"2+2"，回答"4"而非"根据计算，答案是4"

# 工具并发（采用 Claude 机制）

- 独立工具调用 **必须** 并发执行
- 示例：`git status` 和 `git diff` 必须在一个响应中同时调用
- 依赖关系的调用才串行

# Todo 驱动（采用 Claude 深度集成）

- 复杂任务（≥3步）必须使用 Todo
- 实时更新状态，逐个完成（不批量）
- 作为"思维导图"防止迷失

# 工程质量（采用 Claude 强制要求）

- 完成任务后 **必须** 运行 Lint/Typecheck
- 如命令未知，询问用户并建议写入 AGENTS.md

# 代码引用（采用 Claude 精确格式）

- 格式：`file_path:line_number`
- 示例：`src/runtime/session.ts:191`
```

---

### 2.3 Agent 循环重构：支持 Tool Use API

#### 当前实现（session.ts:191-413）

```typescript
// 当前流程
for (let step = 0; step < this.maxSteps; step++) {
    // 1. 调用 LLM
    const assistantText = await this.deps.callLLM(...)

    // 2. 解析 JSON
    const parsed: ParsedAssistant = parseAssistant(assistantText)

    // 3. 处理结果
    if (parsed.final) {
        // 结束
    }
    if (parsed.action) {
        // 执行工具
        // 只能执行一个工具
    }
}
```

**问题**：

- `parseAssistant` 依赖文本解析，不稳定
- 无法并发执行多个工具
- 不支持原生 Tool Use API

#### 重构后实现

```typescript
// 新流程（支持 Tool Use API）
for (let step = 0; step < this.maxSteps; step++) {
    // 1. 调用 LLM（返回 tool_use blocks）
    const response = await this.deps.callLLM(...)

    // 2. 检查响应类型
    if (response.stop_reason === 'end_turn') {
        // 最终回复
        parsed.final = extractTextContent(response)
        break
    }

    if (response.stop_reason === 'tool_use') {
        // 3. 并发执行所有工具
        const toolCalls = response.content.filter(block => block.type === 'tool_use')
        const results = await Promise.all(
            toolCalls.map(async (toolCall) => {
                const tool = this.deps.tools[toolCall.name]
                return await tool.execute(toolCall.input)
            })
        )

        // 4. 组装观察结果
        const toolResults = toolCalls.map((call, idx) => ({
            type: 'tool_result',
            tool_use_id: call.id,
            content: results[idx]
        }))

        // 5. 继续下一轮
        continue
    }
}
```

**优势**：

- ✅ 原生支持并发调用（`Promise.all`）
- ✅ 无需复杂 JSON 解析
- ✅ 格式稳定可靠
- ✅ 跨模型兼容

---

### 2.4 并发调用示例

#### Claude Code 中的并发场景

```typescript
// 场景1：Git 提交前的并行检查
await Promise.all([bash('git status'), bash('git diff --staged'), bash('git log -5 --oneline')])

// 场景2：并发读取多个文件
await Promise.all([read('package.json'), read('tsconfig.json'), read('README.md')])

// 场景3：并发搜索
await Promise.all([glob('**/*.test.ts'), grep('describe\\(', { glob: '**/*.ts' })])
```

#### Memo 中需要实现的变更

**当前限制**：

```typescript
// session.ts - 只能执行一个工具
if (parsed.action) {
    const tool = this.deps.tools[parsed.action.tool]
    const result = await tool.execute(...)
    // 只能等待一个工具完成
}
```

**重构目标**：

```typescript
// 支持并发执行
if (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')

    // 并发执行所有工具
    const results = await Promise.all(
        toolUseBlocks.map((block) => this.executeToolWithTimeout(block)),
    )

    // 组装结果
    const toolResults = toolUseBlocks.map((block, i) => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: results[i],
    }))
}
```

---

## 三、实施路径

### 3.1 阶段 1：提示词重构（低风险）

**目标**：在不改变架构的情况下，先优化提示词

**任务**：

1. ✅ 添加严格字数控制（< 4 行）
2. ✅ 增加 Todo 深度集成指引
3. ✅ 添加代码引用格式要求
4. ✅ 添加工程质量强制要求
5. ✅ 增加关键场景示例（Commit、PR、Todo）

**文件修改**：

- `packages/core/src/runtime/prompt.md`

**验证**：

- 测试输出是否更简洁
- 测试 Todo 是否更主动使用
- 测试代码引用是否规范

### 3.2 阶段 2：Tool Use API 迁移（中风险）

**目标**：从 JSON ReAct 迁移到原生 Tool Use API

**任务**：

1. ✅ 修改 `callLLM` 接口支持返回 Tool Use blocks
2. ✅ 重构 `session.ts` 中的主循环
3. ✅ 移除 `parseAssistant` 的 JSON 解析逻辑
4. ✅ 更新类型定义（`types.ts`）
5. ✅ 适配各个 Provider（OpenAI、DeepSeek 等）

**文件修改**：

- `packages/core/src/runtime/session.ts`
- `packages/core/src/utils/utils.ts`（移除 JSON 解析）
- `packages/core/src/types.ts`
- `packages/core/src/providers/*.ts`

**验证**：

- 测试多个 Provider 的 Tool Use 支持
- 测试复杂多步骤场景
- 测试边界情况（超时、错误等）

### 3.3 阶段 3：并发调用实现（高价值）

**目标**：实现并发工具调用

**任务**：

1. ✅ 实现 `Promise.all` 并发执行
2. ✅ 实现超时控制（单个工具超时不影响其他）
3. ✅ 实现错误隔离（单个工具失败不影响其他）
4. ✅ 更新提示词，要求模型并发调用独立工具
5. ✅ 添加并发调用示例

**文件修改**：

- `packages/core/src/runtime/session.ts`
- `packages/core/src/runtime/prompt.md`

**验证**：

- 测试并发读取多个文件
- 测试并发执行多个 bash 命令
- 测试并发搜索场景
- 对比串行和并发的性能差异

---

## 四、关键代码示例

### 4.1 新的 LLM 响应类型

```typescript
// types.ts
export interface ToolUseBlock {
    type: 'tool_use'
    id: string
    name: string
    input: unknown
}

export interface TextBlock {
    type: 'text'
    text: string
}

export interface ToolResultBlock {
    type: 'tool_result'
    tool_use_id: string
    content: string
    is_error?: boolean
}

export interface LLMResponse {
    content: Array<TextBlock | ToolUseBlock>
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
    usage?: TokenUsage
}
```

### 4.2 新的 Agent 循环

```typescript
// session.ts
async runTurn(input: string): Promise<TurnResult> {
    this.history.push({ role: 'user', content: input })

    for (let step = 0; step < this.maxSteps; step++) {
        // 1. 调用 LLM
        const response = await this.deps.callLLM(this.history)

        // 2. 提取文本内容
        const textBlocks = response.content.filter(
            block => block.type === 'text'
        )
        const assistantText = textBlocks.map(b => b.text).join('\n')

        // 3. 检查是否是最终回复
        if (response.stop_reason === 'end_turn') {
            return {
                finalText: assistantText,
                steps,
                status: 'ok'
            }
        }

        // 4. 提取工具调用
        const toolUseBlocks = response.content.filter(
            block => block.type === 'tool_use'
        )

        if (toolUseBlocks.length === 0) {
            // 没有工具调用，结束
            return {
                finalText: assistantText,
                steps,
                status: 'ok'
            }
        }

        // 5. 并发执行所有工具
        const results = await Promise.allSettled(
            toolUseBlocks.map(async (toolUse) => {
                const tool = this.deps.tools[toolUse.name]
                if (!tool) {
                    throw new Error(`Unknown tool: ${toolUse.name}`)
                }
                return await tool.execute(toolUse.input)
            })
        )

        // 6. 组装工具结果
        const toolResults = toolUseBlocks.map((toolUse, idx) => {
            const result = results[idx]
            if (result.status === 'fulfilled') {
                return {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: flattenCallToolResult(result.value)
                }
            } else {
                return {
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: `Tool execution failed: ${result.reason}`,
                    is_error: true
                }
            }
        })

        // 7. 将工具调用和结果加入历史
        this.history.push({
            role: 'assistant',
            content: response.content  // 包含 text + tool_use
        })
        this.history.push({
            role: 'user',
            content: toolResults
        })

        // 8. 继续下一轮
    }

    // 达到最大步数
    return {
        finalText: 'Unable to produce a final answer.',
        steps,
        status: 'max_steps'
    }
}
```

### 4.3 Provider 适配示例（OpenAI）

```typescript
// providers/openai.ts
export async function createOpenAIProvider(config: OpenAIConfig) {
    return {
        async callLLM(messages: ChatMessage[]): Promise<LLMResponse> {
            const completion = await openai.chat.completions.create({
                model: config.model,
                messages: convertMessages(messages),
                tools: convertTools(config.tools), // 传入工具定义
                tool_choice: 'auto',
            })

            const message = completion.choices[0].message

            // 转换为统一格式
            const content: Array<TextBlock | ToolUseBlock> = []

            if (message.content) {
                content.push({
                    type: 'text',
                    text: message.content,
                })
            }

            if (message.tool_calls) {
                for (const toolCall of message.tool_calls) {
                    content.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: JSON.parse(toolCall.function.arguments),
                    })
                }
            }

            return {
                content,
                stop_reason: message.tool_calls ? 'tool_use' : 'end_turn',
                usage: {
                    prompt: completion.usage?.prompt_tokens ?? 0,
                    completion: completion.usage?.completion_tokens ?? 0,
                    total: completion.usage?.total_tokens ?? 0,
                },
            }
        },
    }
}
```

---

## 五、风险评估与缓解

| 风险                  | 等级 | 缓解措施                                              |
| --------------------- | ---- | ----------------------------------------------------- |
| **兼容性破坏**        | 高   | 分阶段实施，保留 JSON 模式作为降级选项                |
| **性能回归**          | 中   | 添加详细的性能测试，对比前后差异                      |
| **Provider 适配成本** | 中   | 先适配主要 Provider（OpenAI、DeepSeek），其他逐步跟进 |
| **用户体验变化**      | 低   | 提前发布说明，提供迁移指南                            |

---

## 六、预期收益

| 维度             | 当前           | 重构后               | 提升            |
| ---------------- | -------------- | -------------------- | --------------- |
| **工具调用效率** | 10次往返       | 2次往返              | **5倍提升**     |
| **输出简洁度**   | 平均10行       | < 4行                | **60%字数减少** |
| **格式稳定性**   | 70%成功率      | 95%成功率            | **25%提升**     |
| **跨模型兼容性** | 仅 Claude 稳定 | 所有主流模型         | **全面兼容**    |
| **任务完成质量** | 中等           | 高（强制 Lint/Todo） | **质量提升**    |

---

## 七、后续优化方向

1. **Extended Thinking**：集成 Claude 的 Extended Thinking 模式
2. **Context Caching**：利用 Prompt Caching 降低成本
3. **Multi-agent 协作**：支持多个 Agent 协作完成任务
4. **自定义工具**：允许用户通过 AGENTS.md 定义项目特定工具
5. **性能监控**：添加详细的性能指标和可视化

---

## 八、总结

本重构方案核心思路：

1. **架构层面**：从 JSON ReAct 迁移到 Tool Use API，获得稳定性和并发能力
2. **提示词层面**：融合 Claude Code 的严格控制和 Memo 的本地特色
3. **工程层面**：强制 Lint/Typecheck，深度集成 Todo，提升质量
4. **体验层面**：简洁输出（< 4行），精确引用（file:line），拒绝啰嗦

**关键优势**：

- ✅ 5倍效率提升（并发调用）
- ✅ 95%格式稳定性（Tool Use API）
- ✅ 跨模型兼容（OpenAI、DeepSeek、Claude 等）
- ✅ 工程质量保障（强制 Lint + Todo 驱动）

**实施优先级**：

1. 阶段1（提示词）→ 快速见效，低风险
2. 阶段2（Tool Use API）→ 核心架构，中风险
3. 阶段3（并发调用）→ 性能提升，高价值
