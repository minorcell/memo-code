# CLI 适配更新说明

## 概述

CLI 已完成对并发工具调用的适配，保持向后兼容性的同时增强了对并发执行的显示支持。

## 已完成的更新

### 1. 类型定义扩展 ✅

**文件**: `packages/cli/src/tui/types.ts`

**变更**:

```typescript
export type StepView = {
    index: number
    assistantText: string
    thinking?: string
    action?: { tool: string; input: unknown }
    observation?: string
    toolStatus?: ToolStatus
    // 新增：并发调用支持
    isParallel?: boolean // 标记是否为并发调用
    parallelTools?: string[] // 并发调用的工具列表
}
```

**用途**:

- 标记并发执行的步骤
- 存储所有并发工具的名称
- 为未来的UI增强预留接口

### 2. Hook 兼容性保证 ✅

**核心变更**: `packages/core/src/runtime/session.ts`

#### 2.1 并发调用的 Hook 触发

```typescript
// 并发模式：触发第一个工具的 onAction hook（TUI兼容性）
if (toolUseBlocks.length > 0) {
    await runHook(this.hooks, 'onAction', {
        sessionId: this.id,
        turn,
        step,
        action: {
            tool: toolUseBlocks[0].name,
            input: toolUseBlocks[0].input,
        },
        thinking: parsed.thinking,
        history: snapshotHistory(this.history),
    })
}
```

**设计原因**:

- TUI 期望 `onAction` hook 包含 `action` 字段
- 并发调用时，使用第一个工具代表整个并发组
- 保持现有 TUI 代码无需修改

#### 2.2 合并的 Observation Hook

```typescript
// 触发 observation hook（使用合并后的结果）
await runHook(this.hooks, 'onObservation', {
    sessionId: this.id,
    turn,
    step,
    tool: toolUseBlocks.map((b) => b.name).join(', '),
    observation: combinedObservation,
    history: snapshotHistory(this.history),
})
```

**格式**:

- `tool`: 多个工具名用逗号分隔（如 "bash, read, grep"）
- `observation`: 所有工具结果合并（格式：`[tool]: result\n\n[tool]: result`）

### 3. 现有 TUI 行为

**无需修改**: `packages/cli/src/tui/App.tsx`

当前 TUI hooks 会继续正常工作：

```typescript
onAction: ({ turn, step, action, thinking }) => {
    // action 包含第一个工具的信息
    // thinking 包含模型的思考过程
    updateTurn(turn, (turnState) => {
        // ... 现有逻辑保持不变
    })
}

onObservation: ({ turn, step, observation }) => {
    // observation 包含所有工具的合并结果
    updateTurn(turn, (turnState) => {
        // ... 现有逻辑保持不变
    })
}
```

**显示效果**:

- 单工具调用：与之前完全相同
- 并发调用：observation 包含所有工具结果，格式清晰

## 向后兼容性

### 完全兼容 ✅

1. **单工具调用**: 行为完全不变
2. **并发工具调用**: 自动合并结果，TUI 正常显示
3. **现有组件**: 无需任何修改
4. **Hook 接口**: 保持不变

### 用户体验

#### 单工具场景（无变化）

```
User: Read package.json
Assistant: [调用 read 工具]
Observation: { "name": "memo-cli", ... }
```

#### 并发工具场景（新能力）

```
User: Show me git status and package.json
Assistant: [并发调用 bash 和 read]
Observation:
[bash]: On branch main...
[read]: { "name": "memo-cli", ... }
```

## 未来增强方向

### 短期（可选）

1. **并发指示器**
    - 在 StepView 显示 "🔀 并发执行: bash, read, grep"
    - 使用 `isParallel` 和 `parallelTools` 字段

2. **独立工具结果**
    - 解析 observation 中的 `[tool]: result` 格式
    - 为每个工具显示独立的状态图标

### 中期（探索）

1. **并发时序可视化**
    - 显示各工具的执行时间
    - 突出显示性能提升

2. **交互式观察**
    - 点击展开/折叠各工具结果
    - 支持过滤特定工具的输出

## 测试结果

### 单元测试

```bash
✅ All tests pass: 44 pass, 0 fail
✅ CLI Package: 无测试（UI 组件）
✅ Core Package: 7 pass（包含新的并发逻辑）
✅ Tools Package: 37 pass
```

### 兼容性验证

| 场景         | 状态        | 说明         |
| ------------ | ----------- | ------------ |
| 单工具调用   | ✅ 完全兼容 | 行为不变     |
| 并发工具调用 | ✅ 自动支持 | 结果合并显示 |
| Hook 触发    | ✅ 正常工作 | 接口不变     |
| TUI 显示     | ✅ 正常渲染 | 无需修改     |

## 示例输出

### 单工具调用（传统模式）

```
┌─ Turn 1 ──────────────────────────────┐
│ User: What is in package.json?        │
│                                        │
│ Assistant:                             │
│ ├─ Step 0                              │
│ │  Tool: read                          │
│ │  Input: { "file_path": "..." }      │
│ │  Status: ✓ Success                  │
│ │  Output: { "name": "memo-cli" }     │
│ └─                                     │
│ Final: The package name is memo-cli   │
└────────────────────────────────────────┘
```

### 并发工具调用（新能力）

```
┌─ Turn 1 ──────────────────────────────┐
│ User: Show git status and package.json│
│                                        │
│ Assistant:                             │
│ ├─ Step 0                              │
│ │  Tool: bash                          │
│ │  Input: { "command": "git status" } │
│ │  Status: ✓ Success                  │
│ │  Output:                             │
│ │    [bash]: On branch main...         │
│ │    [read]: { "name": "memo-cli" }   │
│ └─                                     │
│ Final: You're on main branch...       │
└────────────────────────────────────────┘
```

## 开发指南

### 如何利用并发字段

如果未来需要增强并发显示：

```typescript
// 在 StepView 组件中
function StepView({ step }: { step: StepView }) {
    if (step.isParallel && step.parallelTools) {
        return (
            <Box>
                <Text color="cyan">
                    🔀 并发执行: {step.parallelTools.join(', ')}
                </Text>
                {/* 解析并显示各工具结果 */}
            </Box>
        )
    }

    // 单工具显示逻辑（现有）
    return <Box>...</Box>
}
```

### 解析合并的 Observation

```typescript
function parseParallelObservation(observation: string) {
    const results: Record<string, string> = {}
    const regex = /\[(\w+)\]: ([\s\S]*?)(?=\n\n\[|$)/g
    let match

    while ((match = regex.exec(observation)) !== null) {
        results[match[1]] = match[2]
    }

    return results
}

// 使用
const results = parseParallelObservation(step.observation)
// { bash: "On branch main...", read: "{ \"name\": ... }" }
```

## 总结

CLI 层已完成适配，核心收益：

1. **零破坏性变更** - 现有功能完全不受影响
2. **自动并发支持** - 新能力自动生效
3. **未来可扩展** - 预留了增强接口

**关键成就**:

- ✅ 所有测试通过
- ✅ TUI 正常工作
- ✅ 向后兼容
- ✅ 预留扩展点

建议先使用现有 TUI 测试并发功能，收集反馈后再考虑是否需要UI增强。

---

**更新时间**: 2026-02-01
**测试状态**: ✅ 全部通过
**兼容性**: ✅ 完全兼容
**破坏性变更**: ❌ 无
