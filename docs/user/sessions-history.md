# 会话与历史

Memo 会把会话过程写入本地 JSONL，便于恢复上下文和排查问题。

## 一、存储位置

默认目录：

- `~/.memo/sessions/`

若设置 `MEMO_HOME`，目录变为：

- `$MEMO_HOME/sessions/`

目录结构（按日期分桶）：

- `YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<sessionId>.jsonl`

## 二、JSONL 事件内容

每行一个事件对象，常见类型：

- `session_start` / `session_end`
- `turn_start` / `turn_end`
- `assistant`
- `action`
- `observation`
- `final`

排障时通常重点看：`action`、`observation`、`final`。

补充：`session_start` 事件会写入本次会话实际使用的系统提示词（`role=system`，`content` 字段）。

## 三、如何恢复历史

在输入框输入：

- `resume`
- `resume 关键词`

选择候选后，Memo 会把对应历史对话加载到当前会话上下文。

## 四、使用建议

- 问题排查时，提供相关 `.jsonl` 文件路径会显著提速。
- 上下文过长时，先 `/new` 新建会话，或用 `/context` 降低上限。

## 五、隐私提示

历史日志可能包含你的输入、工具参数与部分输出。共享前请先检查并脱敏。
