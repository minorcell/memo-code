# 模型无关设计：Memo CLI 如何消除模型差异

## 设计理念

Memo CLI 通过统一的接口层设计，实现对不同 LLM 服务的透明接入。上层应用（Session、TUI）无需关心底层使用的具体模型，只要该模型兼容 OpenAI API 格式即可。

## 四层架构

### 1. Provider 配置层

位置：`packages/core/src/config/config.ts`

```typescript
type ProviderConfig = {
    name: string // 提供商标识
    env_api_key: string // API Key 环境变量名
    model: string // 模型名称
    base_url?: string // API 基础 URL
}

type MemoConfig = {
    current_provider: string // 当前选中的 provider
    providers: ProviderConfig[] // 支持的 provider 列表
    // ...
}
```

**配置示例**（`~/.memo/config.toml`）：

```toml
current_provider = "deepseek"

[[providers.deepseek]]
name = "deepseek"
env_api_key = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
base_url = "https://api.deepseek.com"

[[providers.openai]]
name = "openai"
env_api_key = "OPENAI_API_KEY"
model = "gpt-4o"
base_url = "https://api.openai.com/v1"

[[providers.ollama]]
name = "ollama"
env_api_key = "OLLAMA_API_KEY"
model = "llama3"
base_url = "http://localhost:11434/v1"
```

### 2. 统一 HTTP 客户端层

位置：`packages/core/src/runtime/defaults.ts:147-174`

使用 OpenAI SDK 作为统一接口：

```typescript
const client = new OpenAI({
    apiKey,
    baseURL: provider.base_url, // 关键：不同 Provider 只需配置正确的 base_url
})
```

**核心逻辑**：

- 读取配置中选中的 Provider
- 根据环境变量获取 API Key
- 使用 OpenAI SDK 发送请求（任何兼容 OpenAI API 的服务都可用）

### 3. 消息格式转换层

位置：`packages/core/src/runtime/defaults.ts:34-60`

将内部 `ChatMessage` 格式转换为 OpenAI API 格式：

```typescript
function toOpenAIMessage(message: ChatMessage): OpenAI.ChatCompletionMessageParam {
    if (message.role === 'assistant') {
        return {
            role: 'assistant',
            content: message.content,
            tool_calls: message.tool_calls?.map((toolCall) => ({
                id: toolCall.id,
                type: toolCall.type,
                function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                },
            })),
        }
    }
    if (message.role === 'tool') {
        return {
            role: 'tool',
            content: message.content,
            tool_call_id: message.tool_call_id,
        }
    }
    return {
        role: message.role,
        content: message.content,
    }
}
```

**支持的消息类型**：

- `system`: 系统提示词
- `user`: 用户输入
- `assistant`: 助手输出（包含 `tool_calls`）
- `tool`: 工具执行结果

### 4. 响应格式归一化层

位置：`packages/core/src/runtime/defaults.ts:176-236`

将模型响应转换为内部统一的 `LLMResponse` 格式：

```typescript
type LLMResponse = {
    content: ContentBlock[] // 内容块：text 或 tool_use
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
    usage?: Partial<TokenUsage> // Token 使用统计
}

type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
```

**转换流程**：

1. 解析 OpenAI API 的 `tool_calls`
2. 提取文本内容和工具调用
3. 统一 `stop_reason` 语义
4. 归一化 token 统计数据

## Provider 选择机制

位置：`packages/core/src/config/config.ts:203-208`

```typescript
export function selectProvider(config: MemoConfig, preferred?: string): ProviderConfig {
    const name = preferred || config.current_provider
    const found = config.providers.find((p) => p.name === name)
    if (found) return found
    return config.providers?.[0] ?? DEFAULT_CONFIG.providers[0]!
}
```

**切换方式**：

- 配置文件修改 `current_provider`
- CLI 命令 `/models` 交互式切换
- 代码指定 `providerName` 参数

## 支持的模型类型

只要兼容 OpenAI Chat Completions API 的模型均可接入：

| Provider               | Model                    | Base URL                  |
| ---------------------- | ------------------------ | ------------------------- |
| DeepSeek               | deepseek-chat            | https://api.deepseek.com  |
| OpenAI                 | gpt-4o, gpt-4o-mini      | https://api.openai.com/v1 |
| Anthropic              | claude-3-opus (通过代理) | 代理地址                  |
| Ollama                 | llama3, mistral          | http://localhost:11434/v1 |
| Azure OpenAI           | gpt-4                    | Azure 端点                |
| vLLM                   | 各种开源模型             | vLLM 端点                 |
| 其他兼容 OpenAI 的服务 | -                        | -                         |

## 使用示例

### 切换 Provider

```bash
# 交互式切换
memo
/models
# 选择 deepseek

# 或直接指定
/models openai
```

### 自定义 Provider

编辑 `~/.memo/config.toml`：

```toml
[[providers.custom]]
name = "custom"
env_api_key = "CUSTOM_API_KEY"
model = "your-model-name"
base_url = "https://your-api-endpoint.com/v1"
```

## 架构优势

1. **零学习成本**：符合 OpenAI API 的服务无需额外适配
2. **灵活切换**：运行时切换 Provider，无需重启
3. **统一体验**：不同模型提供一致的工具调用和响应格式
4. **易于扩展**：新增 Provider 只需配置，无需修改代码
5. **降低依赖**：不依赖特定模型的私有 API

## 相关文件

- `packages/core/src/config/config.ts` - Provider 配置管理
- `packages/core/src/runtime/defaults.ts` - HTTP 客户端和消息转换
- `packages/core/src/types.ts` - 统一类型定义
- `packages/tui/src/slash/registry.ts` - CLI 命令处理
