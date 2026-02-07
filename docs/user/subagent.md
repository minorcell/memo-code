# Subagent 使用说明

本文介绍 Memo 的 subagent（多 agent 协作）能力：什么时候用、如何启用、如何控制生命周期。

## 一、什么是 subagent

subagent 是由主会话派生出的“子任务执行单元”，适合把大任务拆成多个明确子任务并并行/分步推进。

当前对应工具族：

- `spawn_agent`
- `send_input`
- `resume_agent`
- `wait`
- `close_agent`

## 二、启用条件

默认启用。若要关闭：

```bash
export MEMO_ENABLE_COLLAB_TOOLS=0
```

建议同时配置：

```bash
export MEMO_SUBAGENT_COMMAND="memo --dangerous"
export MEMO_SUBAGENT_MAX_AGENTS=4
```

字段说明：

- `MEMO_SUBAGENT_COMMAND`：每个 subagent 提交时实际执行的命令。
- `MEMO_SUBAGENT_MAX_AGENTS`：并发运行中的 subagent 上限（默认 `4`）。

## 三、推荐使用场景

- 任务天然可拆分：例如“并行检查多个模块并汇总结果”。
- 某个子任务耗时较长，不希望阻塞主流程。
- 需要对同类任务做分批推进与轮询等待。

不建议：

- 简单单文件改动或一次性命令执行（主 agent 即可）。
- 你尚未明确子任务边界与完成标准时。

## 四、生命周期（建议流程）

1. `spawn_agent` 创建子任务并拿到 `agent_id`
2. 通过 `wait` 等待完成状态（或超时）
3. 若需继续同一 agent，使用 `send_input`
4. 若运行中需打断，`send_input` 搭配 `interrupt=true`
5. 任务结束后用 `close_agent` 关闭
6. 若误关闭或需恢复，先 `resume_agent` 再 `send_input`

## 五、关键行为说明

- `send_input` 在 agent 忙碌时，默认会报 busy；设置 `interrupt=true` 会先中断当前提交再发送新任务。
- `wait` 会等待“任一目标进入终态”，返回终态映射与是否超时。
- `close_agent` 会终止运行中的提交，并将状态置为 `closed`。
- `resume_agent` 只恢复状态，不会自动触发新提交。
- subagent 工具默认免审批，请按危险操作对待并严格控制范围。

## 六、常见问题

### 1) 看不到 subagent 工具

检查是否误设了 `MEMO_ENABLE_COLLAB_TOOLS=0`，并重启会话。

### 2) `spawn_agent` 报并发上限

说明运行中的 agent 数达到 `MEMO_SUBAGENT_MAX_AGENTS`，可：

1. 增大上限；
2. 先 `close_agent` 释放占用；
3. 降低并行度，改为分批执行。

### 3) `wait` 一直超时

优先检查 `MEMO_SUBAGENT_COMMAND` 是否在当前环境可执行，再检查子任务本身是否可结束。

## 相关文档

- 工具总览：[`docs/user/tools.md`](./tools.md)
- 工具参数：`docs/tool/spawn_agent.md`、`docs/tool/send_input.md`、`docs/tool/resume_agent.md`、`docs/tool/wait.md`、`docs/tool/close_agent.md`
- 排障：[`docs/user/troubleshooting.md`](./troubleshooting.md)
