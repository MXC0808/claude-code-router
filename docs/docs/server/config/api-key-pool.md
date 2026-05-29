# API Key 号池

## 概述

API Key 号池允许为同一个供应商配置多个 API Key。当某个 Key 失效（认证失败、额度耗尽、被封禁等）时，系统自动切换到下一个可用 Key，无需手动干预。

## 工作流程

```
请求到达
  ↓
从 Key Pool 取下一个 Key
  ↓
发送请求到供应商
  ↓
成功？ → 返回响应 ✓
  ↓
失败（可重试状态码）
  ↓
标记当前 Key 为失效
  ↓
还有可用 Key？ → 取下一个 Key → 重试
  ↓
全部失效 → 返回 "All N keys unavailable (detail)" 错误
```

## 配置

### 基础配置

在 `~/.claude-code-router/config.json` 的 `providers` 中使用 `api_keys` 替代 `api_key`：

```json
{
  "providers": [
    {
      "name": "xiaomi-mimo",
      "api_base_url": "https://api.xiaomi.com/v1",
      "api_keys": [
        "$MIMO_KEY_1",
        "$MIMO_KEY_2",
        "$MIMO_KEY_3"
      ],
      "models": ["MiMo-7B"],
      "transformer": { "use": ["openai"] }
    }
  ]
}
```

### 配置项说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api_keys` | `string[]` | 是* | 多个 API Key 数组，与 `api_key` 二选一 |
| `api_key` | `string` | 是* | 单个 API Key，与 `api_keys` 二选一 |
| `retryable_status_codes` | `number[]` | 否 | 触发 Key 切换的 HTTP 状态码，默认 `[401, 403, 429]` |
| `key_cooldown_seconds` | `number` | 否 | 冷却时间（秒），默认 60。429 等可重试错误触发冷却，供应商返回 `Retry-After` header 时取两者较大值 |

> *`api_key` 和 `api_keys` 二选一，`api_keys` 优先。

### 可配置重试状态码

默认情况下，以下 HTTP 状态码会触发 Key 切换：

- **401** — Key 无效或已过期
- **403** — Key 被封禁
- **429** — 请求频率超限或额度耗尽

如需自定义，添加 `retryable_status_codes`：

```json
{
  "name": "custom-provider",
  "api_base_url": "https://api.example.com/v1",
  "api_keys": ["$KEY_1", "$KEY_2"],
  "retryable_status_codes": [401, 403, 429, 500],
  "models": ["model-a"],
  "transformer": { "use": ["openai"] }
}
```

> 部分中转商可能使用 500 表示 Key 相关错误，可根据实际情况配置。

### Key 失效分类

系统对不同状态码采用不同的失效策略：

| 状态码 | 失效类型 | 行为 |
|--------|----------|------|
| 401、403 | 永久失效 | Key 本身有问题，从池中永久移除，不再尝试 |
| 429、500 等 | 冷却失效 | 额度或频率问题，冷却 `key_cooldown_seconds` 秒后自动恢复 |

冷却时间取 `key_cooldown_seconds` 与供应商返回的 `Retry-After` header 中的较大值，确保不会过早重试。

### 环境变量支持

Key 值支持环境变量插值，后端 ConfigService 自动解析：

```json
{
  "api_keys": [
    "$MIMO_API_KEY",
    "${MIMO_API_KEY_2}",
    "sk-plain-text-key"
  ]
}
```

## 配置示例

### 示例 1：小米 MiMo 多 Key

```json
{
  "providers": [
    {
      "name": "xiaomi-mimo",
      "api_base_url": "https://api.xiaomi.com/v1",
      "api_keys": [
        "$MIMO_KEY_1",
        "$MIMO_KEY_2",
        "$MIMO_KEY_3"
      ],
      "models": ["MiMo-7B"],
      "transformer": { "use": ["openai"] }
    }
  ]
}
```

### 示例 2：OpenRouter + 自定义重试状态码

```json
{
  "providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1",
      "api_keys": [
        "$OR_KEY_1",
        "$OR_KEY_2"
      ],
      "retryable_status_codes": [401, 403, 429, 500],
      "models": ["anthropic/claude-sonnet-4"],
      "transformer": { "use": ["openai"] }
    }
  ]
}
```

### 示例 3：混合配置（单 Key + 多 Key 供应商共存）

```json
{
  "providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/v1",
      "api_key": "$DEEPSEEK_KEY",
      "models": ["deepseek-chat"],
      "transformer": { "use": ["openai"] }
    },
    {
      "name": "xiaomi-mimo",
      "api_base_url": "https://api.xiaomi.com/v1",
      "api_keys": ["$MIMO_KEY_1", "$MIMO_KEY_2"],
      "models": ["MiMo-7B"],
      "transformer": { "use": ["openai"] }
    }
  ]
}
```

## UI 操作

### 导入多个 Key

1. 打开 Web UI（`ccr ui`）
2. 在供应商列表中，点击 Key 图标按钮（位于复制按钮左侧）
3. 在弹窗中每行粘贴一个 Key
4. 点击保存

> UI 会自动去除重复的 Key。

### 测试供应商

配置了 `api_keys` 的供应商，测试功能会使用第一个 Key 进行验证。

## 日志

Key 轮询切换时，服务日志会输出：

```
[key_pool] Key for provider xiaomi-mimo returned 429, rotating to next key
```

所有 Key 耗尽时：

```
[key_pool] All 3 keys exhausted for provider xiaomi-mimo
```

日志文件位置：`~/.claude-code-router/logs/ccr-*.log`

## 注意事项

- 单个 `api_keys`（数组只有 1 个元素）等同于 `api_key`，无额外开销
- Key 失效标记在服务重启后重置（重启 `ccr restart` 可恢复所有 Key）
- 当前版本（v2.0.1）不支持 429 冷却恢复，429 标记为永久失效
- `api_key` 和 `api_keys` 互不影响，可通过 UI 分别管理
