# Tested Providers

Providers verified in this fork for model fetching and request routing.

| Provider | Model Fetching (UI) | Request Routing | Notes |
|----------|:-------------------:|:---------------:|-------|
| DeepSeek | Pass | Pass | Standard OpenAI-compatible API |
| Gemini | Pass | Pass | Uses `?key=` auth, `/v1beta/models` endpoint |
| Xiaomi (MiMo) | Pass | Pass | Requires `reasoning_content` transformer config; see [REASONING_CONTENT_FIX.md](../../../../REASONING_CONTENT_FIX.md) |
| NVIDIA | Pass | Pass | OpenAI-compatible API |

## Model Fetching Behavior

Each provider uses different authentication methods and response formats when listing models via the UI:

| Provider | Auth Method | Models Endpoint | Response Format |
|----------|-------------|-----------------|-----------------|
| DeepSeek | `Authorization: Bearer` | `{baseUrl}/models` | OpenAI format (`data[].id`) |
| Gemini | `?key=` query param | `generativelanguage.googleapis.com/v1beta/models` | Gemini format (`models[].name`) |
| Xiaomi | `Authorization: Bearer` | `{baseUrl}/v1/models` | OpenAI format |
| NVIDIA | `Authorization: Bearer` | `{baseUrl}/v1/models` | OpenAI format |
