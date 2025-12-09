# 代码审查（整体项目）

角色：以 Google 资深工程师视角，对当前 `memo-cli` 的核心架构、工具与 CLI 入口进行审查，指出风险与改进建议。

## 主要问题

- 高 | `packages/core/src/runtime/session.ts`：`maxPromptTokens` 只在首轮检查，后续步骤上下文持续增长仍会请求 LLM，可能超限导致 4xx/高费用。应在每次循环前重查硬上限并在超限时直接返回。
- 中 | `packages/core/src/runtime/session.ts`：模型返回既无 `final` 也无 `action` 时立即退出并标记 `max_steps`，即便只跑 1 步。这会误导监控与 UX，应区分「输出不可解析」与真正的步数耗尽。
- 中 | `packages/core/src/utils/tokenizer.ts`：token 估算用 `role: content` 拼接而非 ChatML 规则，长上下文时偏差较大，导致 warn/hard limit 与 usage 对账不准。需改为 ChatML 近似或引入 model-specific 计算。
- 中 | `packages/tools/src/tools/write.ts`：声明会递归创建父目录但未 `mkdir`，新目录下写入会 ENOENT；`content` 使用 `z.any()` 并强制 `String(...)`，对象会写成 `[object Object]`，二进制被破坏。应创建父目录并约束/处理内容类型。
- 中 | `packages/tools/src/tools/fetch.ts`：无超时/大小限制/协议白名单，CLI 请求可能长时间挂起或拉取超大响应（或被用于 SSRF）。应加超时、最大正文长度、限制 http/https。
- 中 | `packages/ui/src/index.ts`：首次运行缺配置时总是交互式询问，即使环境变量已具备。`--once` 非交互或自动化场景会被阻塞。应在检测到 env 足够时跳过交互，或提供 `--yes`/`--non-interactive`。
- 低 | `docs/core.md`：引用了不存在的文件（如 `config/constants.ts`, `llm/openai.ts`），文档与现实现状不符，易误导贡献者。

## 补充建议

- 增加核心流测试（Session/Turn）：覆盖 prompt 限制路径、无解析输出的状态码、工具失败写入等，以 mock LLM 避免真实调用。
- 工具安全：为 bash/read/write/fetch 提供可选的白名单/只读/超时限，适配不可信场景。

## 结论

架构简洁（厚 Core、薄 UI，工具以 MCP 形式抽象），测试覆盖主要集中在工具层。需尽快修复 prompt 限制与状态码问题，并提升 token 计数精度和安全性，避免运行时故障和资源浪费。
