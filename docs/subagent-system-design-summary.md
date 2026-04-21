# Memo 项目 Subagent 系统设计实现方案总结（架构师视角）

## 1. 设计目标与定位

Subagent（子代理）系统的目标是：

- 将主会话中的大任务拆解为可并行执行的有界子任务；
- 在不引入复杂分布式基础设施的前提下，提供“轻量级多代理协作”；
- 通过统一工具体系接入主流程，保持与现有 Tool Router / Orchestrator / Approval 机制一致；
- 通过明确的生命周期与状态模型，保证可控性、可恢复性和可观测性。

在当前架构中，Subagent 被实现为 **工具层的协作工具族**，而不是单独的调度服务：`spawn_agent`、`send_input`、`resume_agent`、`wait`、`close_agent`。

---

## 2. 架构分层与职责映射

### 2.1 系统分层映射

Subagent 并未破坏 Memo 既有四层工具架构，而是嵌入其中：

1. **工具实现层（packages/tools/src/tools/collab.ts）**
    - 维护子代理运行态（内存 Map）；
    - 负责子进程拉起、终止、状态收敛、输出汇总；
    - 提供 5 个标准工具接口。

2. **路由层（ToolRouter）**
    - 与其他工具一致统一注册/发现/执行；
    - 对上层透明，调用方无需区分 subagent 与普通工具。

3. **编排层（Orchestrator）**
    - 复用统一输入校验与结果裁剪机制；
    - 保持工具调用顺序/并行策略一致。

4. **审批层（Approval）**
    - subagent 工具风险级别归类为 `read`；
    - 且位于 `ALWAYS_AUTO_APPROVE_TOOLS`，默认不阻塞审批链路。

### 2.2 配置驱动与开关控制

- `MEMO_ENABLE_COLLAB_TOOLS=0`：整体关闭子代理工具族；
- `MEMO_SUBAGENT_COMMAND`：指定子代理进程启动命令；
- `MEMO_SUBAGENT_MAX_AGENTS`：并发运行子代理上限（默认 4）。

这体现了“**默认可用、显式可禁用、容量可调优**”的产品策略。

---

## 3. 核心运行模型

### 3.1 控制平面：Agent Record

系统在内存中维护 `Map<string, AgentRecord>`，每个 AgentRecord 持有：

- 标识与时间：`id`、`createdAt`、`updatedAt`；
- 生命周期状态：`running | completed | errored | closed`；
- 恢复语义：`statusBeforeClose`；
- 最近上下文：`lastMessage`、`lastSubmissionId`、`lastOutput`、`lastError`；
- 当前运行态：`running`（包含 process、startedAt、interrupted）。

该模型实现了“**轻量状态机 + 最小审计信息**”的平衡。

### 3.2 数据平面：Submission 执行

每次 `spawn_agent`/`send_input` 都会触发一次 submission：

1. 解析并发上限；
2. 解析启动命令（环境变量 > dist fallback > memo fallback）；
3. `spawn(..., shell: true)` 拉起子进程；
4. 写入 message 到 stdin 后关闭 stdin；
5. 监听 stdout/stderr/close 汇总结果；
6. close 时根据退出码与中断标记收敛状态。

### 3.3 状态机语义

- 初始执行：`running`；
- 退出码 0：`completed`；
- 非 0 或中断：`errored`；
- 显式关闭：`closed`；
- `resume_agent`：仅恢复关闭前状态，不自动产生新 submission；
- `wait` 对未知 id 返回 `not_found`（只在 wait 结果域出现）。

---

## 4. 工具体系与协作协议

### 4.1 `spawn_agent`

- 创建 agent 记录并立即启动首个 submission；
- 返回 `agent_id` + `submission_id` + 状态摘要；
- 达到并发上限时失败。

### 4.2 `send_input`

- 向已有 agent 提交新任务；
- 若正在运行：默认 busy 错误；可 `interrupt=true` 先终止再提交；
- 对已关闭 agent 强制要求先 `resume_agent`。

### 4.3 `wait`

- 针对 `ids` 轮询直到出现“任一最终状态”或超时；
- 超时区间限制：10s~300s，默认 30s；
- 返回 `status/details` 快照与 `timed_out` 标记。

### 4.4 `close_agent` / `resume_agent`

- `close_agent`：可终止在跑 submission 并封存为 closed；
- `resume_agent`：恢复为 `statusBeforeClose`，用于续作而非自动执行。

---

## 5. 安全设计与风险边界

### 5.1 当前安全策略

- 子代理工具默认自动批准（含 strict 下白名单跳过）；
- 主风险在于子进程命令执行能力，因此系统提示明确要求“任务范围必须有边界”；
- 通过并发上限防止无限扩张；
- 通过 `close_agent` 与中断机制控制资源回收。

### 5.2 风险与治理建议（架构视角）

1. **命令面风险**：当前实现通过 `spawn(..., shell: true)` 执行子代理命令，`MEMO_SUBAGENT_COMMAND` 若配置不当会放大命令注入面；建议生产环境固化可执行模板并限制可注入变量来源。
2. **内存态风险**：当前状态仅驻留进程内存，进程重启后不可恢复；若后续面向长会话，可引入轻量持久化。
3. **并发饥饿风险**：单全局并发阈值对复杂任务可能过紧或过松；建议演进为“全局+会话”双层限流。

---

## 6. 可观测性与运维特征

- `wait` 返回结构化 details，可作为主会话的最小观测面；
- 输出会做预览裁剪（防止过长污染上下文）；
- 错误语义明确（not_found / busy / interrupted / exit code）；
- 测试覆盖关键链路：成功、关闭恢复、未知 id、并发上限、参数校验。

整体上，该系统提供了“**可用优先、治理逐步增强**”的工程实现路径。

---

## 7. 与主会话协同的设计要点

主提示词已内置子代理使用规约：

- 只用于可分解任务；
- 避免递归 spawn；
- 子任务 prompt 应简洁且有交付边界；
- `wait` 后汇总回主线程；
- 完成后 `close_agent` 释放资源。

这使得 Subagent 在产品行为层面形成“**工具能力 + Prompt 策略**”的双重约束。

---

## 8. 架构结论

Memo 的 Subagent 设计采用了“**内聚在工具层的轻量多代理方案**”：

- 复用现有工具基础设施，集成成本低；
- 生命周期语义清晰，满足多数并行协作场景；
- 通过环境变量完成启停、命令注入和容量调优；
- 当前实现偏本地会话内协作，后续可在持久化、隔离级别、调度公平性方向继续演进。

从系统架构角度看，这是一个在复杂度、可维护性和交付速度之间取舍合理的 V1 设计。
