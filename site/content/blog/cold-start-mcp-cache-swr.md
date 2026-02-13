---
title: "冷启动 + MCP 缓存统一策略（SWR）"
description: "围绕启动阻塞与重复请求，落地一套 SWR 缓存方案，把工具发现和资源读取统一到同一份缓存策略。"
date: "2026-02-13"
order: 3
---

# 冷启动 + MCP 缓存统一策略（SWR）

这篇记录的是 memo 里一件很现实的事：
MCP 能力做起来不难，难的是“每次启动都要等”和“重复请求太多”。

我当时遇到的核心痛点有两个：

1. 冷启动阻塞：会话一启动就要连 MCP server、拉 `listTools`，首屏交互时间直接被网络和 server 状态绑住。
2. 重复请求多：`list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource` 在跨会话和重复调用时，冗余请求很明显。

连接池能解决进程内复用，但它覆盖不了“新进程重启”这条路径，也没法把工具发现和资源读取放到同一套缓存策略里。

## 目标

我想要的是三件事：

- 第二次启动尽量先用本地缓存，先可用再说。
- 启动阶段缓存和运行时缓存放在同一份数据里，别搞两套。
- 缓存策略可解释、可维护，不靠玄学。

## 方案：SWR 分层处理

核心思路是 `stale-while-revalidate`，拆成三层看。

### 1) 启动阶段（Tools Cache）

- 启动先读 `~/.memo/cache/mcp.json`（遵循 `MEMO_HOME`）。
- 如果命中 `toolsByServer`：
  - 先注册工具，马上可用。
  - 缓存过旧就后台刷新。
- 如果没命中：
  - 走同步连接 + `listTools` 拉取，再写回缓存。

### 2) 运行阶段（Resources Cache）

`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` 全部走统一缓存层（内存 + 磁盘），并且支持：

- TTL 缓存
- in-flight 去重
- 全量聚合时并发请求 + 部分失败容忍

### 3) 单一缓存文件

统一落地到：`~/.memo/cache/mcp.json`

内部拆两块：

- `toolsByServer`：给启动阶段用
- `responses`：给运行阶段工具调用用

## 更新与失效策略

### `toolsByServer`

- `fresh TTL`: 10 分钟
- `max-stale`: 24 小时
- `configHash`：MCP 配置变更时，相关 server 缓存立即失效

过期后的行为：

- `<= max-stale`：先用缓存，后台刷新
- `> max-stale`：丢弃缓存，回退同步拉取

### `responses`

- `list*` 默认 TTL：15 秒
- `read` 默认 TTL：60 秒
- 同 key 并发请求复用同一个 Promise，防止请求风暴

## 容错与一致性

这里我重点做了四件事：

1. 写盘原子化：`tmp + rename`，避免中间态文件。
2. 写盘节流：debounce，避免高频 IO。
3. 部分失败容忍：全量聚合时允许单 server 失败，并返回 `errors`。
4. 懒连接执行：缓存恢复的工具在首次调用时再连 server，避免“只为注册工具就全连”。

## 关键落点

- `packages/tools/src/router/mcp/cache_store.ts`
  - 统一缓存读写、TTL、SWR、落盘
- `packages/tools/src/router/mcp/index.ts`
  - 启动先读缓存注册工具，再按新鲜度决定同步拉取还是后台刷新
- `packages/tools/src/router/mcp/pool.ts`
  - server config 管理、连接 in-flight 去重、懒连接
- `packages/tools/src/tools/mcp_resources.ts`
  - 资源工具切换到统一缓存层

## 预期收益

1. 二次启动更快：工具可以直接从缓存恢复。
2. 调用更稳：重复请求减少，MCP server 压力下降。
3. 维护更简单：启动和运行时缓存共用一套策略。

## 关联

- 关联问题：`#155`
- 这篇可以当“冷启动 + MCP 缓存”后续演进的基线记录。
