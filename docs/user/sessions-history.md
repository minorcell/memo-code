# 会话与日志（History / Sessions）

Memo 会把会话过程以 JSONL 事件流写到本地，便于恢复上下文、排查问题与复盘。

## 会话日志保存位置

默认目录：

- `~/.memo/sessions/`

可通过 `MEMO_HOME` 重定向（见 [配置](./configuration.md)）。

文件组织方式：

- 按当前工作目录（cwd）做“桶目录”（路径会被清洗/截断）
- 每个会话一个 JSONL 文件：`YYYY-MM-DD_HHMMSS_<sessionId>.jsonl`

> 只有当会话包含用户消息时才会落盘，避免产生空文件。

## JSONL 里有什么？

每一行是一个事件（JSON 对象），常见事件包括：

- `session_start` / `session_end`
- `turn_start` / `turn_end`
- `assistant`（模型输出）
- `action`（工具调用）
- `observation`（工具结果）
- `final`（最终答复）

你通常不需要读懂全部字段；排障时关注 `action/observation/final` 即可。

## 如何恢复历史（`resume`）

在 TUI 输入框键入：

- `resume`（或 `resume <关键词>`）

会弹出历史会话建议；选中后会把历史对话加载进当前 session 作为上下文，继续对话。

## 相关建议

- 复现/报错时：把对应的 `.jsonl` 文件路径发出来通常能更快定位问题
- 觉得上下文太长时：用 `/new` 新会话，或用 `/context` 降低上限
