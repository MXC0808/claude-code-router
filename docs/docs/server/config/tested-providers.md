# 已测试供应商

本分支已验证的供应商列表（模型获取 + 请求路由）。

| 供应商 | UI 获取模型 | 请求路由 | 备注 |
|--------|:-----------:|:--------:|------|
| DeepSeek | 通过 | 通过 | 标准 OpenAI 兼容 API |
| Gemini | 通过 | 通过 | 使用 `?key=` 认证，`/v1beta/models` 端点 |
| 小米 (MiMo) | 通过 | 通过 | 需配置 `reasoning_content` transformer；参见 [reasoning_content修复文档](../../../../REASONING_CONTENT_FIX.md) |
| 英伟达 | 通过 | 通过 | OpenAI 兼容 API |

## UI 获取模型的认证方式

各供应商在 UI 获取模型列表时使用的认证方式和响应格式：

| 供应商 | 认证方式 | 模型端点 | 响应格式 |
|--------|----------|----------|----------|
| DeepSeek | `Authorization: Bearer` | `{baseUrl}/models` | OpenAI 格式 (`data[].id`) |
| Gemini | `?key=` URL 查询参数 | `generativelanguage.googleapis.com/v1beta/models` | Gemini 格式 (`models[].name`) |
| 小米 | `Authorization: Bearer` | `{baseUrl}/v1/models` | OpenAI 格式 |
| 英伟达 | `Authorization: Bearer` | `{baseUrl}/v1/models` | OpenAI 格式 |
