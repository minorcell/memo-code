# 提案：工具执行审批系统

## 摘要

在执行工具前加入用户审批，避免意外或危险操作。对高风险工具（bash、write、edit 等）弹出三种选择：**拒绝**、**仅本次允许**、或 **本会话始终允许**。

## 动机

Memo Code 目前所有工具调用立即执行，存在风险：

1. **破坏性操作**：`rm -rf`、`sudo`、覆盖写入即时落地
2. **无安全垫**：执行前无法审查或取消
3. **缺乏控制**：无法按场景选择性放行/拒绝
4. **安全隐患**：恶意或缺陷提示可能造成严重损失

Cursor、Aider 等已通过“敏感操作需审批”降低同类风险。

## 方案

### 1) 审批选项

- **Deny** (`d`)：拒绝本次调用并向 LLM 返回错误
- **Allow Once** (`o`)：仅放行本次，下一次再询问
- **Always Allow** (`a`)：加入会话白名单，剩余会话自动放行

### 2) 工具风险分级

**高风险**（必审）：`bash`、`write`、`edit`  
**中风险**（按模式审）：`bash` 匹配 `rm|sudo|chmod|mv|>|curl * | bash` 等；对已存在文件的 `write`；大规模 `edit`  
**低风险**（免审）：`read`、`glob`、`grep`、`webfetch`

### 3) 会话级审批规则

```ts
interface ApprovalRule {
    tool: string
    pattern?: string // 例："git *"、"ls *"
    action: 'allow' | 'deny'
    timestamp: number
}

class ApprovalRegistry {
    private rules: ApprovalRule[] = []
    shouldApprove(tool: string, input: any): 'prompt' | 'allow' | 'deny'
    addRule(rule: ApprovalRule): void
    clear(): void
}
```

### 4) 用户界面

**TUI**

```
┌─ Tool Approval Required ────────────────────────────┐
│  Tool: bash                                          │
│  Command: rm -rf node_modules                        │
│                                                      │
│  [D]eny  [O]nce  [A]lways (this session)             │
└──────────────────────────────────────────────────────┘
```

**纯文本**

```
⚠️  需要工具审批:
  Tool: bash
  Command: rm -rf node_modules

[d]eny / [o]nce / [a]lways?
```

### 5) 配置示例

`~/.memo/config.toml`

```toml
[approval]
enabled = true                   # 可关闭（不建议）
high_risk_tools = ["bash", "write", "edit"]
dangerous_patterns = [
  "rm *",
  "sudo *",
  "chmod *",
  "mv *",
  "> *",
  "curl * | bash"
]
safe_patterns = [
  "git *",
  "ls *",
  "cat *",
  "echo *"
]
```

## 实施计划

### Phase 1：核心

1. `packages/core/src/approval/` 内实现 `ApprovalRegistry`
2. `AgentSessionDeps` 增加 `onToolApprovalRequest`
3. `session.ts` 在 `tool.execute()` 前进行审批

### Phase 2：UI

1. TUI：`ApprovalModal`，支持 d/o/a 快捷键与输入预览
2. 纯文本：readline 提示，30 秒超时自动拒绝

### Phase 3：配置与模式

1. `MemoConfig` 增加审批配置
2. 默认危险/安全模式与 glob 匹配实现
3. 支持用户自定义规则

### Phase 4：测试与文档

1. `ApprovalRegistry` 单测
2. 审批流程集成测
3. README 与 CLAUDE.md 补充示例

## 示例

```bash
$ pnpm start "delete all log files"

⚠️  需要工具审批:
  Tool: bash
  Command: find . -name "*.log" -delete
[d]eny / [o]nce / [a]lways? o

⚠️  需要工具审批:
  Tool: bash
  Command: git status
[d]eny / [o]nce / [a]lways? a   # 会话内后续 bash 自动放行
```

## 备选方案

- Dry-run 预览：交互过慢，否决
- 沙箱执行：部署复杂、影响本地体验，否决
- 仅首次审批：粒度不足，否决

## 待决问题

1. 规则是否跨会话持久化？建议否，会话内即可
2. 是否支持正则？先用 glob，必要时再加正则
3. 拒绝后是否告知 LLM？建议告知以便调整策略
4. MCP 工具默认高风险吗？建议是，统一审批

## 成功标准

- 危险操作均需用户同意
- 审批 UI 响应 <100ms，低打扰
- 会话白名单减少重复弹窗
- 配置可定制/可关闭
- TUI 与非 TTY 场景均可用

## 时间表

- Week 1：Phase 1（核心）
- Week 2：Phase 2（UI）
- Week 3：Phase 3（配置）
- Week 4：Phase 4（测试与文档）

## 参考

- Cursor 审批：https://cursor.sh/docs
- Aider 机制：https://aider.chat/docs
- 其他相关讨论：待补充

---

**标签**：`enhancement`，`security`，`high-priority`  
**负责人**：待定  
**里程碑**：v2.0
