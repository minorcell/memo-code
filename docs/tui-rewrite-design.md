# Memo CLI/TUI 重构设计与实施文档（对标 Codex CLI）

## 1. 文档目标

本文档用于沉淀 `memo` CLI/TUI 重构方案，并记录已完成的实施结果，明确：

1. 为什么当前实现需要重构。
2. 对标 `codex` CLI/TUI 可以借鉴的架构原则。
3. `memo` 应采用的目标架构与模块边界。
4. 渐进式迁移路径、验收标准、风险与回滚策略。

本文档是 `packages/tui` 后续迭代的设计基线与进度记录。

### 1.1 实施状态（2026-02）

已完成：

1. TUI 代码从 `packages/cli` 抽离为独立包 `packages/tui`。
2. 可执行入口与模式分发层收敛到 `packages/tui/src/cli.tsx`。
3. slash 命令收敛到 `packages/tui/src/slash/registry.ts` 单一入口。
4. 关键状态与历史处理已落到 `packages/tui/src/state` / `packages/tui/src/controllers`。

进行中：

1. docs/web 文档与开发约定持续同步。
2. transcript 与输入层行为回归覆盖继续补齐。

## 2. 范围与非目标

### 2.1 范围

1. `packages/tui/src` 的架构重组与 UI 运行时重构。
2. 输入区、消息流、工具调用可视化、slash 指令、审批弹层、会话历史恢复流程。
3. 设计与 `@memo/core` Session Hook 事件模型的稳定对接方式。

### 2.2 非目标

1. 不改动 `packages/core` 的 Tool Use/ReAct 主流程语义。
2. 不改动 `packages/tools` 的工具能力集。
3. 不在本阶段引入 Web UI 或协议层升级。
4. 不在本阶段引入与当前功能无关的新命令。

## 3. 输入资料（已完成调研）

### 3.1 Memo 当前代码（重点）

1. `packages/tui/src/App.tsx`
2. `packages/tui/src/chatwidget/ChatWidget.tsx`
3. `packages/tui/src/chatwidget/Cells.tsx`
4. `packages/tui/src/bottom_pane/Composer.tsx`
5. `packages/tui/src/controllers/history_parser.ts`
6. `packages/tui/src/state/chat_timeline.ts`
7. `packages/tui/src/slash/registry.ts`

### 3.2 Codex 对标代码（重点）

1. `codex-rs/tui/src/app.rs`
2. `codex-rs/tui/src/chatwidget.rs`
3. `codex-rs/tui/src/history_cell.rs`
4. `codex-rs/tui/src/bottom_pane/mod.rs`
5. `codex-rs/tui/src/bottom_pane/chat_composer.rs`
6. `codex-rs/tui/src/bottom_pane/footer.rs`
7. `codex-rs/tui/src/slash_command.rs`

## 4. 重构前问题盘点（Memo，历史归档）

### 4.1 状态管理过重且职责混杂

`App.tsx` 同时承担：

1. Session 生命周期控制。
2. Hook 事件接收与 UI 数据装配。
3. Slash 命令分发。
4. 历史日志解析/恢复。
5. Provider/Model/Context 配置写回。
6. Approval 协调。

结果：

1. 状态源过多（`turns/systemMessages/busy/session/options/history/pendingApproval` 等），一致性难维护。
2. 新功能容易跨层穿透，回归风险高。
3. 难以做单元测试，主要依赖人工联调。

### 4.2 输入层承担过多业务逻辑

`InputPrompt.tsx` 同时处理：

1. 文本编辑与键盘行为。
2. 文件/历史/slash/model/context 建议系统。
3. slash 执行后的副作用分发。
4. 会话历史扫描与过滤。

结果：

1. 输入组件既是 View 又是 Controller。
2. 与上层 `App` 分工不清，命令链路重复。

### 4.3 slash 指令体系重复

当前同时存在：

1. `commands.ts`（旧实现）
2. `slash/*`（旧实现）

两套逻辑覆盖范围重叠，导致：

1. 维护成本高。
2. 行为不一致风险高。
3. 扩展新命令时无法确定唯一入口。

当前状态（已完成）：

1. 已删除重复入口，统一为 `packages/tui/src/slash/registry.ts`。

### 4.4 Transcript 渲染模型弱

当前渲染是 Turn/Step 结构直出，缺少稳定的“展示单元（cell）”抽象。导致：

1. 活跃态与完成态边界不清晰。
2. 并行工具调用、长输出、状态更新难做精细化展示。
3. 难支持后续 overlay、复盘、导出等扩展场景。

### 4.5 测试粒度偏薄

CLI 现有测试覆盖部分 utils 与组件，但针对“完整事件流 -> 视图状态”的测试不足。典型后果：

1. 多来源状态更新时易出现不可见回归。
2. 输入快捷键和命令行为稳定性依赖人工验证。

## 5. Codex CLI 可借鉴原则（抽象层面）

### 5.1 清晰分层

Codex TUI 核心模式是：

1. `App` 负责事件循环和全局编排。
2. `ChatWidget` 负责会话视图状态聚合。
3. `BottomPane` 负责输入/弹层/页脚。

关键价值：

1. 状态流向清晰。
2. UI 变更可局部演进。

### 5.2 Cell 化 transcript

Codex 使用 `HistoryCell` 作为历史显示原子单元。关键价值：

1. 活跃单元可增量更新。
2. 不同事件类型（用户消息/工具执行/警告/状态）可独立渲染。

### 5.3 输入区与业务动作解耦

`ChatComposer` 只管理编辑状态、弹层和输入事件，业务动作由上层接收。关键价值：

1. 输入层可复用。
2. 命令/会话逻辑不侵入输入控件。

### 5.4 命令注册中心

Slash 命令统一注册，具备：

1. 统一描述。
2. 统一可见性/可执行条件。
3. 统一参数能力。

### 5.5 强测试心智

Codex 对底栏、历史单元、状态提示做了大量 snapshot/行为测试。关键价值：

1. TUI 回归可控。
2. 重构可分步推进。

## 6. Memo 目标架构（To-Be）

## 6.1 分层总览

建议在 `packages/tui/src` 下形成以下结构：

```text
App.tsx
state/
  chat_timeline.ts        # timeline reducer/state transitions
controllers/
  history_parser.ts       # history line parser
  session_history.ts      # local session discovery/filtering
  file_suggestions.ts     # @path suggestion source
chatwidget/
  ChatWidget.tsx
  Cells.tsx
bottom_pane/
  Composer.tsx
  SuggestionPanel.tsx
  Footer.tsx
overlays/
  ApprovalOverlay.tsx
slash/
  registry.ts
```

### 6.2 运行时职责切分

1. `App.tsx`
   只负责：初始化、连接 controller、装配 view、退出流程。
2. `session_controller`
   只负责：session 生命周期与 Hook 转事件。
3. `chat_timeline reducer`
   只负责：事件 -> UI 状态快照。
4. `Composer`
   只负责：编辑与选择行为，不直接操作业务状态。
5. `command_controller`
   只负责：命令解析、权限判断、触发 side effects。

## 6.3 事件模型（核心）

将 `@memo/core` hooks 映射为稳定 UI 事件：

1. `turn_start`
2. `assistant_chunk`
3. `tool_action`
4. `tool_observation`
5. `turn_final`
6. `system_notice`
7. `approval_requested`
8. `approval_resolved`
9. `history_loaded`
10. `session_reset`

核心规则：

1. 所有 UI 展示状态必须由事件驱动，不允许散落式 setState。
2. reducer 必须幂等（同事件重复进入不破坏状态）。
3. 活跃 turn 与已完成 turn 明确分层。

## 6.4 Transcript 单元化（Cell）

定义 UI Cell 类型：

1. `UserCell`
2. `ThinkingCell`
3. `ToolCallCell`
4. `ToolResultCell`
5. `AssistantFinalCell`
6. `SystemNoticeCell`

设计原则：

1. Cell 对应“用户可感知事件”，而不是内部数据结构。
2. Turn 只是时间分组，渲染单元是 Cell。
3. 并行工具调用用聚合 Cell 展示（统一状态 + 简明参数）。

## 6.5 输入与页脚分离

`bottom_pane` 拆成三部分：

1. Composer：编辑、cursor、多行、快捷键。
2. SuggestionPanel：文件/历史/slash/model/context。
3. StatusFooter：busy、context 使用率、快捷键提示。

目标：

1. 页脚提示与输入编辑逻辑解耦。
2. 未来支持“状态行配置”更容易。

## 6.6 Slash 命令统一化

仅保留 `packages/tui/src/slash/*` 体系，命令解析统一走 `registry.ts`。

统一要求：

1. 每个命令有唯一 `name/description/run`。
2. 统一“可执行条件”（比如 busy 时是否可用）。
3. 统一输入参数解析策略。
4. 统一帮助文案来源。

## 7. 迁移实施计划（分阶段）

当前状态：阶段 A-E 的骨架能力已完成首轮落地，以下计划作为后续增量优化清单。

### 阶段 A：基线冻结与观测（1 个迭代）

1. 冻结现有 TUI 行为（命令、快捷键、审批、history）。
2. 补齐关键行为测试（至少覆盖现有主路径）。
3. 记录“当前行为快照”作为回归基线。

交付物：

1. 行为基线清单。
2. 最小回归测试集。

### 阶段 B：状态层重建（1 个迭代）

1. 引入 `chat_timeline reducer`，承接 turn/step/system 状态。
2. 将 `App.tsx` 的散落状态迁入 reducer + runtime state。
3. 保持 UI 视觉不变，只替换状态通路。

交付物：

1. 新状态模型落地。
2. 行为回归通过。

### 阶段 C：Transcript Cell 化（1-2 个迭代）

1. 重写 `MainContent`、`TurnView`、`StepView` 到 `Transcript + Cells`。
2. 并行工具调用改为聚合展示。
3. 历史回放与实时输出统一走同一渲染通路。

交付物：

1. 新 transcript 渲染架构。
2. snapshot 回归集。

### 阶段 D：Bottom Pane 重构（1 个迭代）

1. 拆分 `InputPrompt` 为 composer/suggestion/footer。
2. 快捷键与建议系统保持兼容。
3. 审批弹层与输入禁用行为标准化。

交付物：

1. 输入区边界清晰。
2. 快捷键行为回归通过。

### 阶段 E：命令系统收敛与清理（1 个迭代）

1. 收敛至单一 slash 框架。
2. 删除重复路径。
3. 更新帮助文档、README 与开发文档。

交付物：

1. 命令系统单一入口。
2. 文档同步完成。

## 8. 验收标准

### 8.1 功能一致性

1. `/help`、`/new`、`/exit`、`/models`、`/context`、`/mcp`、`/init`、`resume` 行为无回退。
2. 批准弹层（once/session/deny）行为保持一致。
3. 历史加载后上下文注入行为保持一致。

### 8.2 体验一致性

1. 支持多行输入、Shift+Enter。
2. 支持 `Esc Esc` 取消/清空语义。
3. 支持文件和历史建议流程。

### 8.3 架构质量

1. `App.tsx` 不再承担业务细节。
2. 事件流有单一来源与可追踪路径。
3. slash 逻辑只有一套实现。

### 8.4 测试门槛

1. `pnpm run test:tui` 通过。
2. `packages/tui/src/cli.tsx` 可完成命令解析、plain mode 与 TUI mode 启动。
3. 新增 reducer 单测覆盖核心事件。
4. Transcript 关键路径 snapshot 覆盖。

## 9. 风险与应对

### 风险 1：重构期间行为回退

应对：

1. 先补行为基线测试再重构。
2. 每阶段保持可回滚提交边界。

### 风险 2：历史日志兼容性问题

应对：

1. 解析器保留兼容分支。
2. 加入旧日志样本回归测试。

### 风险 3：输入快捷键冲突

应对：

1. 将快捷键映射集中化。
2. 为 Esc/Tab/Enter 组合编写场景测试。

### 风险 4：并行工具展示复杂度上升

应对：

1. 使用聚合 cell，避免逐 token 级渲染过度复杂。
2. 保持“摘要优先，详情可扩展”的展示策略。

## 10. 对当前代码的后续迭代建议

1. 继续收敛 `packages/tui/src/App.tsx`，将非编排逻辑下沉到 `state` / `controllers`。
2. 继续增强 `packages/tui/src/chatwidget/Cells.tsx` 的可测试性与复用性。
3. 在 `packages/tui/src/bottom_pane` 维持输入、建议、页脚的清晰边界。
4. 在 `packages/tui/src/slash/registry.ts` 维持命令单一入口，避免旁路实现。
5. 持续补齐 `state` 与 `slash` 的行为测试，作为后续功能迭代护栏。

## 11. 后续迭代检查清单

1. 是否先更新文档与行为说明，再做代码改造。
2. 是否锁定单阶段目标，避免状态层与视觉层混改。
3. 是否确定每阶段必须跑 `pnpm run test:tui`。
4. 是否为每阶段准备回滚点（独立提交）。

## 12. 结论

`memo` 当前 CLI/TUI 的核心问题不是“功能缺失”，而是“边界和状态组织方式不适配继续增长”。

推荐采用对标 Codex 的思路，但不是照搬 Rust 实现，而是落在 TypeScript + Ink 场景下的同构架构：

1. 编排层与渲染层分离。
2. 事件驱动 reducer 作为单一状态真源。
3. transcript 单元化。
4. 输入区职责瘦身。
5. 命令系统单一入口。

在此基础上，后续“重构甚至重写 TUI”才能做到可控推进，而不是一次性高风险替换。
