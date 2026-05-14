# DeepSeek & MiMo 推理内容回传修复（多轮对话）

## 问题描述

DeepSeek V4 和 MiMo 模型在响应中返回 `reasoning_content` 字段（思考过程）。在多轮对话中，这些模型要求将 `reasoning_content` 在后续请求中回传。否则第二轮及后续请求会失败并返回 400 错误。

**错误信息：**
```
API Error: 400 The `reasoning_content` in the thinking mode must be passed back to the API.
```

## 根因分析

Claude Code 客户端使用的是 `thinking`（思考块）格式而非 `reasoning_content`：

| 格式 | 使用者 | 字段名 |
|------|--------|--------|
| Anthropic 格式 | Claude Code | `thinking.content` |
| OpenAI 格式 | DeepSeek/MiMo | `reasoning_content` |

**数据流问题：**
```
DeepSeek 响应: { reasoning_content: "思考过程..." }
    ↓ (转换)
Claude Code: { thinking: { content: "思考过程..." } }
    ↓ (下一轮请求)
发送给 DeepSeek: { thinking: { content: "..." } }  ← 格式错误！
    ↓
DeepSeek 返回 400 错误
```

## 修复方案

在 `deepseek.transformer.ts` 中实现三重修复：

### 1. 请求转换（PR #1375）
将 `thinking` 转换回 `reasoning_content`：

```typescript
// thinking → reasoning_content
if (message.role === "assistant" && message.thinking) {
  if (message.thinking.content) {
    message.reasoning_content = message.thinking.content;
  }
  delete message.thinking;
}
```

### 2. 响应转换（PR #1375）
将 `reasoning_content` 转换为 `thinking`：

```typescript
// reasoning_content → thinking
if (jsonResponse.choices?.[0]?.message?.reasoning_content) {
  jsonResponse.choices[0].message.thinking = {
    content: jsonResponse.choices[0].message.reasoning_content,
  };
  delete jsonResponse.choices[0].message.reasoning_content;
}
```

### 3. 推理存储（PR #1376）
跨轮次持久化工具调用消息的 `reasoning_content`：

```typescript
// 使用 tool_call IDs 作为 key 存储 reasoning_content
const REASONING_STORE = new Map<string, string>();

// 响应时存储
function keyFromToolCalls(toolCalls) {
  const ids = toolCalls.map(tc => tc.id).filter(Boolean);
  return ids.slice().sort().join("|");
}

// 请求时恢复
const key = keyFromToolCalls(msg.tool_calls);
const stored = REASONING_STORE.get(key);
if (stored) msg.reasoning_content = stored;
```

## 配置示例

### DeepSeek 配置

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-v4-pro", "deepseek-v4-flash"],
      "transformer": {
        "use": ["deepseek"]
      }
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-v4-pro",
    "think": "deepseek,deepseek-v4-pro"
  }
}
```

### MiMo 配置（复用 deepseek 转换器）

```json
{
  "Providers": [
    {
      "name": "mimo",
      "api_base_url": "https://api.xiaomimimo.com/v1/chat/completions",
      "api_key": "$MIMO_API_KEY",
      "models": ["mimo-v2-pro", "mimo-v2-flash"],
      "transformer": {
        "use": ["deepseek"]
      }
    }
  ],
  "Router": {
    "default": "mimo,mimo-v2-pro"
  }
}
```

### 混合配置

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-v4-pro", "deepseek-v4-flash"],
      "transformer": {
        "use": ["deepseek"]
      }
    },
    {
      "name": "mimo",
      "api_base_url": "https://api.xiaomimimo.com/v1/chat/completions",
      "api_key": "$MIMO_API_KEY",
      "models": ["mimo-v2-pro", "mimo-v2-flash"],
      "transformer": {
        "use": ["deepseek"]
      }
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-v4-pro",
    "think": "deepseek,deepseek-v4-pro",
    "background": "mimo,mimo-v2-flash"
  }
}
```

## 重要说明

### API 端点选择

**必须使用 OpenAI 兼容端点：**

| 提供商 | ✅ 正确端点 | ❌ 错误端点 |
|--------|------------|------------|
| DeepSeek | `https://api.deepseek.com/chat/completions` | `https://api.deepseek.com/anthropic/v1/messages` |
| MiMo | `https://api.xiaomimimo.com/v1/chat/completions` | - |

**为什么不能使用 Anthropic 端点？**
- `deepseek` transformer 是为 OpenAI 格式设计的
- Anthropic 端点使用不同的消息格式
- 格式不匹配会导致 `system` 角色错误

### MiMo 为什么可以复用 deepseek 转换器？

MiMo 和 DeepSeek 都使用相同的 `reasoning_content` 格式：
- 都是 OpenAI 兼容 API
- 都返回 `reasoning_content` 字段
- 都需要在多轮对话中回传

## 测试验证

### 单轮对话测试

```bash
curl -X POST http://127.0.0.1:3456/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek,deepseek-v4-flash",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

### 多轮对话测试（with thinking）

```bash
curl -X POST http://127.0.0.1:3456/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek,deepseek-v4-flash",
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "What is 2+2?"},
      {
        "role": "assistant",
        "content": "4",
        "thinking": {"content": "Simple math: 2+2=4"}
      },
      {"role": "user", "content": "Multiply by 3"}
    ]
  }'
```

### Tool-use 多轮对话测试

```bash
curl -X POST http://127.0.0.1:3456/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek,deepseek-v4-flash",
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "Calculate 2+2"},
      {
        "role": "assistant",
        "content": "",
        "reasoning_content": "User wants calculation",
        "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "calc", "arguments": "{\"expr\":\"2+2\"}"}}]
      },
      {"role": "tool", "tool_call_id": "call_1", "content": "4"},
      {"role": "user", "content": "Multiply by 3"}
    ]
  }'
```

## 相关链接

- [Issue #1378](https://github.com/musistudio/claude-code-router/issues/1378) - 问题详情
- [PR #1376](https://github.com/musistudio/claude-code-router/pull/1376) - reasoning store
- [PR #1375](https://github.com/musistudio/claude-code-router/pull/1375) - 双向转换
- [DeepSeek Thinking Mode 文档](https://api-docs.deepseek.com/guides/thinking_mode)
- [MiMo Reasoning Content 文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/passing-back-reasoning_content)

## 常见问题

### Q: 为什么 MiMo 可以复用 deepseek 转换器？

A: 因为 MiMo 和 DeepSeek 都使用相同的 `reasoning_content` 格式，都是 OpenAI 兼容 API。

### Q: 可以使用 Anthropic 端点吗？

A: 不推荐。`deepseek` transformer 是为 OpenAI 格式设计的，使用 Anthropic 端点会导致格式不匹配错误。

### Q: 修复后会影响其他模型吗？

A: 不会。修复只在消息包含 `thinking` 或 `reasoning_content` 字段时才生效，其他模型不受影响。

### Q: 如何验证修复是否生效？

A: 运行多轮对话测试，如果第二轮及后续对话正常响应（不再返回 400 错误），则修复生效。
