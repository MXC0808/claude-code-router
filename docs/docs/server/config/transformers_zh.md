---
sidebar_position: 4
---

# Transformers

Transformer 是适配不同 LLM provider API 差异的核心机制。它们在不同格式之间转换请求和响应，处理认证，并管理 provider 特定的功能。

## 理解 Transformer

### 什么是 Transformer？

Transformer 是一个插件，它可以：
- **转换请求**：从统一格式转换为 provider 特定格式
- **转换响应**：从 provider 格式转换回统一格式
- **处理认证**：为 provider API 处理认证
- **修改请求**：添加或调整参数

### 数据流

```
┌─────────────────┐
│ Incoming Request│ (来自 Claude Code 的 Anthropic 格式)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformRequestOut            │ ← 解析传入请求为统一格式
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  UnifiedChatRequest             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformRequestIn (可选)      │ ← 发送前修改统一请求
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Provider API Call              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformResponseIn (可选)     │ ← 将 provider 响应转换为统一格式
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformResponseOut (可选)    │ ← 将统一响应转换为 Anthropic 格式
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Outgoing Response│ (发送给 Claude Code 的 Anthropic 格式)
└─────────────────┘
```

### Transformer 接口

所有 transformer 都实现以下接口：

```typescript
interface Transformer {
  // 将统一请求转换为 provider 特定格式
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ) => Promise<Record<string, any>>;

  // 将 provider 请求转换为统一格式
  transformRequestOut?: (
    request: any,
    context: TransformerContext
  ) => Promise<UnifiedChatRequest>;

  // 将 provider 响应转换为统一格式
  transformResponseIn?: (
    response: Response,
    context?: TransformerContext
  ) => Promise<Response>;

  // 将统一响应转换为 provider 格式
  transformResponseOut?: (
    response: Response,
    context: TransformerContext
  ) => Promise<Response>;

  // 自定义端点路径（可选）
  endPoint?: string;

  // Transformer 名称（用于自定义 transformer）
  name?: string;

  // 自定义认证处理器（可选）
  auth?: (
    request: any,
    provider: LLMProvider,
    context: TransformerContext
  ) => Promise<any>;

  // 日志实例（自动注入）
  logger?: any;
}
```

### 关键类型

#### UnifiedChatRequest

```typescript
interface UnifiedChatRequest {
  messages: UnifiedMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  tool_choice?: any;
  reasoning?: {
    effort?: ThinkLevel;  // "none" | "low" | "medium" | "high"
    max_tokens?: number;
    enabled?: boolean;
  };
}
```

#### UnifiedMessage

```typescript
interface UnifiedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null | MessageContent[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  thinking?: {
    content: string;
    signature?: string;
  };
}
```

## 内置 Transformer

项目包含 25 个内置 transformer，分为三类：Provider 专用 transformer、跨功能 transformer 和工具 transformer。

### Provider 专用 Transformer

这些 transformer 为特定的 LLM provider API 适配请求和响应。

#### anthropic

将请求转换为兼容 Anthropic Messages API 的格式。

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq"]
    }
  ]
}
```

**功能：**
- 在 Anthropic 消息格式和 OpenAI 格式之间转换
- 处理工具调用和工具结果（`tool_use`/`tool_result` 内容块）
- 支持 thinking/reasoning 内容块
- 管理流式响应（Anthropic SSE 事件格式）
- 处理 base64 图片源
- 支持双认证模式：`x-api-key` 和 `Bearer` token

**端点：** `/v1/messages`

---

#### gemini

用于 Google Gemini 原生 API 的 transformer。

```json
{
  "transformers": [
    {
      "name": "gemini",
      "providers": ["gemini"]
    }
  ]
}
```

**功能：**
- 转换为 Gemini 的 `generateContent` 或 `streamGenerateContent` 格式
- 根据模型名称和流式模式动态构建 API URL
- 使用 `x-goog-api-key` 头进行认证

**端点：** `/v1beta/models/:modelAndAction`

---

#### deepseek

专用于 DeepSeek API 的 transformer。

```json
{
  "transformers": [
    {
      "name": "deepseek",
      "providers": ["deepseek"]
    }
  ]
}
```

**功能：**
- 处理 DeepSeek 特定的推理格式
- 从响应中提取 `reasoning_content` 并转换为 `thinking` 块
- 将 `max_tokens` 限制为 8192（DeepSeek 限制）
- 支持推理重放以保持上下文连续性
- 处理流式（SSE）和非流式响应

---

#### openai

用于 OpenAI 兼容 API 的透传 transformer（无需转换）。

```json
{
  "transformers": [
    {
      "name": "openai",
      "providers": ["openai"]
    }
  ]
}
```

**端点：** `/v1/chat/completions`

---

#### openrouter

用于 OpenRouter API 的 transformer（代理多个 LLM provider）。

```json
{
  "transformers": [
    {
      "name": "openrouter",
      "providers": ["openrouter"]
    }
  ]
}
```

**功能：**
- 模型感知：对 Claude 和非 Claude 模型有不同的行为
- 为非 Claude 模型去除 `cache_control`
- 从各种格式提取推理内容
- 将工具调用 ID 规范化为 `call_<uuid>` 格式
- 处理不同模型的图片 URL 转换

---

#### groq

用于 Groq API 的 transformer（开源模型的快速推理）。

```json
{
  "transformers": [
    {
      "name": "groq",
      "providers": ["groq"]
    }
  ]
}
```

**功能：**
- 去除缓存控制标记（Groq 不支持提示缓存）
- 规范化工具参数 schema
- 生成基于 UUID 的工具调用 ID
- 修复工具调用在文本内容之后出现时的排序问题

---

#### mistral

用于 Mistral API 的 transformer（OpenAI 兼容）。

```json
{
  "transformers": [
    {
      "name": "mistral",
      "providers": ["mistral"]
    }
  ]
}
```

**功能：**
- 转换为 Mistral 的聊天完成格式
- 处理 Mistral 的 thinking/reasoning 格式转换
- 使用 `Bearer` token 进行认证

---

#### cerebras

用于 Cerebras 推理服务的 transformer。

```json
{
  "transformers": [
    {
      "name": "cerebras",
      "providers": ["cerebras"]
    }
  ]
}
```

---

#### vercel

用于 Vercel AI SDK 格式的 transformer。

```json
{
  "transformers": [
    {
      "name": "vercel",
      "providers": ["vercel"]
    }
  ]
}
```

---

#### codex

用于 OpenAI Codex / ChatGPT 后端 API 的 transformer（Responses API 格式）。

```json
{
  "transformers": [
    {
      "name": "codex",
      "providers": ["codex"]
    }
  ]
}
```

**功能：**
- 将 Chat Completions 格式转换为 Responses API 格式
- 通过 `getValidAccessToken()` 处理 OAuth 认证
- 将消息转换为 Responses API 的 `input` 数组项
- 支持特殊工具如 `WebSearch` 和 `Edit`
- 将 Responses API 事件映射回 Chat Completions SSE 格式

---

#### vertex-gemini

用于 Google Vertex AI（Gemini 端点）的 transformer。

```json
{
  "transformers": [
    {
      "name": "vertex-gemini",
      "providers": ["vertex-gemini"]
    }
  ]
}
```

**功能：**
- 适配 Vertex AI 的 Gemini 端点
- 使用 Google OAuth 认证
- 处理 Vertex 特定的请求/响应格式

---

#### vertex-claude

用于 Google Vertex AI（Claude 端点）的 transformer。

```json
{
  "transformers": [
    {
      "name": "vertex-claude",
      "providers": ["vertex-claude"]
    }
  ]
}
```

**功能：**
- 适配 Vertex AI 的 Claude 端点
- 使用 Google OAuth 认证

---

#### chrome-on-device

用于 Chrome 本地模型的 transformer（Prompt API）。

```json
{
  "transformers": [
    {
      "name": "chrome-on-device",
      "providers": ["chrome-on-device"]
    }
  ]
}
```

**功能：**
- 适配 Chrome 的 Prompt API 格式
- 将工具定义转换为文本指令
- 将请求路由到本地 Chrome bridge

**默认 Bridge URL：** `http://127.0.0.1:3457`

---

### 跨功能 Transformer

这些 transformer 提供与 provider 无关的功能，可应用于任何 provider。

#### reasoning

用于推理/思考模式控制的跨功能 transformer。

```json
{
  "transformers": [
    {
      "name": "reasoning",
      "options": {
        "enable": true
      }
    }
  ]
}
```

**功能：**
- 跨 provider 启用/禁用 thinking 模式
- 将 `reasoning` 配置转换为 provider 特定的标志（Anthropic 风格使用 `thinking`，其他使用 `enable_thinking`）
- 从响应中提取 `reasoning_content` 并转换为 `thinking` 块
- 支持推理重放以保持上下文连续性
- 通过 `enable` 选项可配置（默认：`true`）

---

#### tooluse

强制工具使用模式。

```json
{
  "transformers": [
    {
      "name": "tooluse"
    }
  ]
}
```

**功能：**
- 注入系统提示，指示模型使用工具
- 添加 `ExitTool` 函数作为退出工具模式的唯一方式
- 设置 `tool_choice = "required"`
- 拦截 `ExitTool` 调用并转换为常规内容消息

---

#### enhancetool

增强非流式响应的工具处理。

```json
{
  "transformers": [
    {
      "name": "enhancetool"
    }
  ]
}
```

**功能：**
- 解析非流式工具调用参数
- 规范化工具调用格式

---

#### forcereasoning

强制启用推理模式。

```json
{
  "transformers": [
    {
      "name": "forcereasoning"
    }
  ]
}
```

**功能：**
- 无论请求配置如何，始终启用 thinking/reasoning

---

### 工具 Transformer

这些 transformer 提供特定的参数处理或清理功能。

#### maxtoken

限制请求中的 `max_tokens`。

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      },
      "models": ["deepseek,deepseek-chat"]
    }
  ]
}
```

---

#### maxcompletiontokens

处理 `max_completion_tokens` 参数（OpenAI 新格式）。

```json
{
  "transformers": [
    {
      "name": "maxcompletiontokens"
    }
  ]
}
```

---

#### sampling

处理采样参数（temperature、top_p 等）。

```json
{
  "transformers": [
    {
      "name": "sampling"
    }
  ]
}
```

---

#### streamoptions

处理流式选项配置。

```json
{
  "transformers": [
    {
      "name": "streamoptions"
    }
  ]
}
```

---

#### cleancache

清理请求中的缓存相关标记。

```json
{
  "transformers": [
    {
      "name": "cleancache"
    }
  ]
}
```

**功能：**
- 移除目标 provider 不支持的 `cache_control` 标记

---

#### customparams

向请求注入自定义参数。

```json
{
  "transformers": [
    {
      "name": "customparams",
      "options": {
        "include_reasoning": true,
        "custom_header": "value"
      }
    }
  ]
}
```

## 创建自定义 Transformer

### 简单 Transformer：修改请求

最简单的 transformer 只是在请求发送到 provider 之前修改它。

**示例：向所有请求添加自定义头**

```javascript
// custom-header-transformer.js
module.exports = class CustomHeaderTransformer {
  name = 'custom-header';

  constructor(options) {
    this.headerName = options?.headerName || 'X-Custom-Header';
    this.headerValue = options?.headerValue || 'default-value';
  }

  async transformRequestIn(request, provider, context) {
    // 添加自定义头（将被 auth 方法使用）
    request._customHeaders = {
      [this.headerName]: this.headerValue
    };
    return request;
  }

  async auth(request, provider) {
    const headers = {
      'authorization': `Bearer ${provider.apiKey}`,
      ...request._customHeaders
    };
    return {
      body: request,
      config: { headers }
    };
  }
};
```

**在配置中使用：**

```json
{
  "transformers": [
    {
      "name": "custom-header",
      "path": "/path/to/custom-header-transformer.js",
      "options": {
        "headerName": "X-My-Header",
        "headerValue": "my-value"
      }
    }
  ]
}
```

### 中级 Transformer：请求/响应转换

此示例展示如何在不同 API 格式之间进行转换。

**示例：Mock API 格式 transformer**

```javascript
// mockapi-transformer.js
module.exports = class MockAPITransformer {
  name = 'mockapi';
  endPoint = '/v1/chat';  // 自定义端点

  // 从 MockAPI 格式转换为统一格式
  async transformRequestOut(request, context) {
    const messages = request.conversation.map(msg => ({
      role: msg.sender,
      content: msg.text
    }));

    return {
      messages,
      model: request.model_id,
      max_tokens: request.max_tokens,
      temperature: request.temp
    };
  }

  // 从统一格式转换为 MockAPI 格式
  async transformRequestIn(request, provider, context) {
    return {
      model_id: request.model,
      conversation: request.messages.map(msg => ({
        sender: msg.role,
        text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      })),
      max_tokens: request.max_tokens || 4096,
      temp: request.temperature || 0.7
    };
  }

  // 将 MockAPI 响应转换为统一格式
  async transformResponseIn(response, context) {
    const data = await response.json();

    const unifiedResponse = {
      id: data.request_id,
      object: 'chat.completion',
      created: data.timestamp,
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.reply.text
        },
        finish_reason: data.stop_reason
      }],
      usage: {
        prompt_tokens: data.tokens.input,
        completion_tokens: data.tokens.output,
        total_tokens: data.tokens.input + data.tokens.output
      }
    };

    return new Response(JSON.stringify(unifiedResponse), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

### 高级 Transformer：流式响应处理

此示例展示如何处理流式响应。

**示例：向流式响应添加自定义元数据**

```javascript
// streaming-metadata-transformer.js
module.exports = class StreamingMetadataTransformer {
  name = 'streaming-metadata';

  constructor(options) {
    this.metadata = options?.metadata || {};
    this.logger = null;  // 将由系统注入
  }

  async transformResponseOut(response, context) {
    const contentType = response.headers.get('Content-Type');

    // 处理流式响应
    if (contentType?.includes('text/event-stream')) {
      return this.transformStream(response, context);
    }

    // 处理非流式响应
    return response;
  }

  async transformStream(response, context) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const transformedStream = new ReadableStream({
      start: async (controller) => {
        const reader = response.body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }

              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }

              try {
                const chunk = JSON.parse(data);

                // 添加自定义元数据
                if (chunk.choices && chunk.choices[0]) {
                  chunk.choices[0].metadata = this.metadata;
                }

                // 用于调试的日志
                this.logger?.debug({
                  chunk,
                  context: context.req.id
                }, 'Transformed streaming chunk');

                const modifiedLine = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(encoder.encode(modifiedLine));
              } catch (parseError) {
                // 如果解析失败，透传原始行
                controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          }
        } catch (error) {
          this.logger?.error({ error }, 'Stream transformation error');
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    });

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
};
```

### 实际示例：Reasoning Content Transformer

基于代码库中实际的 `reasoning.transformer.ts`。

```typescript
// reasoning-transformer.ts
import { Transformer, TransformerOptions } from "@musistudio/llms";

export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";
  enable: boolean;

  constructor(private readonly options?: TransformerOptions) {
    this.enable = this.options?.enable ?? true;
  }

  // 转换请求以添加推理参数
  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (!this.enable) {
      request.thinking = {
        type: "disabled",
        budget_tokens: -1,
      };
      request.enable_thinking = false;
      return request;
    }

    if (request.reasoning) {
      request.thinking = {
        type: "enabled",
        budget_tokens: request.reasoning.max_tokens,
      };
      request.enable_thinking = true;
    }
    return request;
  }

  // 转换响应以将 reasoning_content 转换为 thinking 格式
  async transformResponseOut(response: Response): Promise<Response> {
    if (!this.enable) return response;

    const contentType = response.headers.get("Content-Type");

    // 处理非流式响应
    if (contentType?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse.choices[0]?.message.reasoning_content) {
        jsonResponse.thinking = {
          content: jsonResponse.choices[0].message.reasoning_content
        };
      }
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // 处理流式响应
    if (contentType?.includes("stream")) {
      // [流式转换代码]
      // 完整实现请参见代码库
    }

    return response;
  }
}
```

## Transformer 注册

### 方法 1：静态名称（基于类）

在 TypeScript/ES6 中创建 transformer 时使用：

```typescript
export class MyTransformer implements Transformer {
  static TransformerName = "my-transformer";

  async transformRequestIn(request: UnifiedChatRequest): Promise<any> {
    // 转换逻辑
    return request;
  }
}
```

### 方法 2：实例名称（基于实例）

用于 JavaScript transformer：

```javascript
module.exports = class MyTransformer {
  constructor(options) {
    this.name = 'my-transformer';
    this.options = options;
  }

  async transformRequestIn(request, provider, context) {
    // 转换逻辑
    return request;
  }
};
```

## 应用 Transformer

### 全局应用（Provider 级别）

应用于 provider 的所有请求：

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "transformers": ["anthropic"]
    }
  ]
}
```

### 特定模型应用

仅应用于特定模型：

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      },
      "models": ["deepseek,deepseek-chat"]
    }
  ]
}
```

注意：模型格式为 `provider,model`（例如 `deepseek,deepseek-chat`）。

### 全局 Transformer（所有 Provider）

将 transformer 应用于所有 provider：

```json
{
  "transformers": [
    {
      "name": "custom-logger",
      "path": "/path/to/custom-logger.js"
    }
  ]
}
```

### 传递选项

某些 transformer 接受配置选项：

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      }
    },
    {
      "name": "customparams",
      "options": {
        "custom_param_1": "value1",
        "custom_param_2": 42
      }
    }
  ]
}
```

## 最佳实践

### 1. 不可变性

始终创建新对象而不是修改现有对象：

```javascript
// 不好
async transformRequestIn(request) {
  request.max_tokens = 4096;
  return request;
}

// 好
async transformRequestIn(request) {
  return {
    ...request,
    max_tokens: request.max_tokens || 4096
  };
}
```

### 2. 错误处理

始终优雅地处理错误：

```javascript
async transformResponseIn(response) {
  try {
    const data = await response.json();
    // 处理数据
    return new Response(JSON.stringify(processedData), {
      status: response.status,
      headers: response.headers
    });
  } catch (error) {
    this.logger?.error({ error }, 'Transformation failed');
    // 如果转换失败，返回原始响应
    return response;
  }
}
```

### 3. 日志记录

使用注入的 logger 进行调试：

```javascript
async transformRequestIn(request, provider, context) {
  this.logger?.debug({
    model: request.model,
    provider: provider.name
  }, 'Transforming request');

  // 您的转换逻辑

  return modifiedRequest;
}
```

### 4. 流处理

处理流时，始终：
- 使用缓冲区处理不完整的块
- 正确释放 reader 锁
- 处理流中的错误
- 完成后关闭 controller

```javascript
const transformedStream = new ReadableStream({
  start: async (controller) => {
    const reader = response.body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 处理流...
      }
    } catch (error) {
      controller.error(error);
    } finally {
      controller.close();
      reader.releaseLock();
    }
  }
});
```

### 5. Context 使用

`context` 参数包含有用的信息：

```javascript
async transformRequestIn(request, provider, context) {
  // 访问请求 ID
  const requestId = context.req.id;

  // 访问原始请求
  const originalRequest = context.req.original;

  // 您的转换逻辑
}
```

## 测试您的 Transformer

### 手动测试

1. 将您的 transformer 添加到配置中
2. 启动服务器：`ccr restart`
3. 检查日志：`tail -f ~/.claude-code-router/logs/ccr-*.log`
4. 发送测试请求
5. 验证输出

### 调试技巧

- 添加日志以跟踪转换步骤
- 同时测试流式和非流式请求
- 使用无效输入验证错误处理
- 检查错误时是否返回原始响应

## 后续步骤

- [高级主题](/docs/server/advanced/custom-router) - 高级路由自定义
- [Agents](/docs/server/advanced/agents) - 使用 agent 扩展
- [核心包](/docs/server/intro) - 了解 @musistudio/llms
