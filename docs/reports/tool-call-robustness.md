# 工具调用稳健性问题研究报告

## 背景

- 弱模型在工具调用时频繁输出非法参数（如中文自然语言、截断 JSON），导致 `JSON.parse` 抛错并终止回合。案例：`2026-02-01_025937_d89a8cf2-d9cf-48f8-92e3-9091ea5ecd77.jsonl` turn1 step4。
- 系统存在两条路径：原生 Tool Use（function calling）与文本 JSON 兜底，缺乏统一能力分流与防御。

## 现状与影响

- Tool Use 分支此前直接 `JSON.parse(function.arguments)`，非法即 fatal；现已改为安全解析并降级为文本，但文本 JSON 模式仍会在解析失败时结束回合。
- 并发工具时任一坏参数可能中断整轮；UI 未清晰提示“工具未执行”。

## 根因

1. 模型能力差异：并非所有 provider 支持 Tool Use，提示词未按能力分流。
2. 防御不足：文本 JSON 模式错误即终止；提示/重试缺失。
3. 观测缺位：未记录 parse_error 指标，无法按模型/提示优化。

## 统一方案（推荐）

- **唯一首选接口：原生 Tool Use/function calling。** 默认只向支持 Tool Use 的模型发送工具定义，禁止文本 JSON 指令。
- **兼容兜底：仅在 provider 明确不支持 Tool Use 时启用文本 JSON 模式**（标记为 deprecated，长期目标移除）。
- **提示词收敛：** Tool Use 模板强调“不要输出 JSON，直接填充工具参数”；JSON 模板提供唯一 fenced 示例，禁止旁白/换行命令。

## 能力与适配（AI 网关草案）

- Provider 能力字段：`supports_tool_use`、`supports_parallel_tools`、`tool_id_pattern?`、`allows_midturn_system`、`json_stability`。
- 探针：若未声明 `supports_tool_use`，会话启动发送 dummy tool，返回 `tool_calls` 视为支持，否则降级。
- 网关流程：
    ```
    callLLM(request):
      caps = providerCaps(request.provider)
      if caps.supports_tool_use:
         return runToolUse(request, caps)
      else:
         return runJsonFallback(request, caps)
    ```

    - runToolUse：校验 tool_id，`parseToolArguments` 安全解析；失败转文本 `[tool_use parse error] ...`，不抛错；存在 tool_use 才标记 stop_reason=tool_use。
    - runJsonFallback：应用固定 JSON 模板；解析失败记录 `parse_error`，返回“未执行工具”提示文本，可选一次补偿重试；成功则转为 tool_use block。
- 并发策略：`supports_parallel_tools=false` 时强制串行；工具输入校验失败转 observation，不中断。

## 可观测

- 在 history meta 写入：`parse_error{mode,error,snippet}`, `strategy{tool_use|json_fallback}`, `probe{ok,error}`。
- 报表：parse_error 率、重试次数、turn 成功率（按模型/提示词）。

## 推进计划

- **Phase1（1–2天）**：增加能力字段与探针；保留已上线的 Tool Use 安全解析。
- **Phase2（2–3天）**：文本 JSON 软落地、parse_error 埋点、TUI “未执行”提示。
- **Phase3（1–2天）**：并发降级、补偿重试策略。
- **Phase4**：指标看板，基于数据迭代提示词与模型选择。

## 验证与测试

- 单测：非法 Tool Use 参数、旁白+JSON、截断 JSON、并发中混入坏参数、弱模型串行模式。
- 手测：在不支持 Tool Use 的模型上走 JSON 模式，确认解析失败不致中断且有可视提示。

## 预期收益

- 解析失败不再导致 fatal；用户可见“未执行工具”提示。
- 通过能力分流和并发策略，弱模型稳定性提升；强模型保持效率。
- 指标驱动后续提示词与模型决策，降低维护成本。
