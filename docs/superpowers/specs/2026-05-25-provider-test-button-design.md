# Provider Test Button

在供应商列表页为每个供应商增加测试按钮，选择模型后通过最小 API 调用验证模型能否正常响应。

## Motivation

用户在配置供应商后，无法在 UI 中验证供应商的 API 地址、Key 以及特定模型是否可用。只能在运行时通过 CLI 报错才能发现问题，反馈周期长。

## Design

### Interaction

```
ProviderList 行（测试 > 编辑 > 删除，测试按钮在最前）
  → 点击测试按钮 → 弹出测试对话框
    → 从 provider config 的 models 字段读取模型列表
    → 用户选择模型 → 点击"测试"
      → 后端发送 chat completion 请求 (max_tokens: 1)
      → 显示结果：成功（含延迟）或失败（含错误原因）
```

### Backend: POST /api/providers/test

新建端点，复用 `/api/providers/models` 中已有的工具函数。

**Request:**
```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "model": "gpt-4"
}
```

**Handler 流程:**
1. `validateBaseUrl(baseUrl)` — SSRF 防护
2. 解析 `apiKey` 中的环境变量占位符（`$VAR_NAME` / `${VAR_NAME}`）
3. 发送 chat completion 请求:
   ```http
   POST {baseUrl}/chat/completions
   Authorization: Bearer {apiKey}
   Content-Type: application/json

   {"model":"{model}","messages":[{"role":"user","content":"Hi"}],"max_tokens":1}
   ```
4. 超时 30 秒
5. 成功 → 返回 `{ success: true, latency: 1234 }`
6. 失败 → 按 HTTP 状态码分类错误信息

**Success Response:**
```json
{ "success": true, "latency": 1234 }
```

**Error Response:**
```json
{ "success": false, "error": "AUTH_FAILED", "message": "Authentication failed. Please check your API Key." }
```

错误分类（与 models 端点一致）:
| HTTP Status | Error Code |
|-------------|------------|
| 401 / 403 | `AUTH_FAILED` |
| 404 | `MODEL_NOT_FOUND` |
| 408 / 超时 | `TIMEOUT` |
| 网络错误 | `NETWORK_ERROR` |
| 其他 | `UNKNOWN` |

对于 Gemini，API key 使用 query param 方式传递（`?key={apiKey}`）。

### Frontend: ProviderList.tsx

在测试 > 编辑 > 删除顺序中，测试按钮放在最前（编辑按钮左侧），使用 `Wifi` 图标（与已注释的测试代码保持一致）:

```tsx
<Button variant="ghost" size="icon" onClick={() => onTest(index)} title="Test Connectivity">
  <Wifi className="h-4 w-4" />
</Button>
```

新增 `onTest` prop。

### Frontend: Providers.tsx

- 新增状态: `testingProviderIndex`, `testingModel`, `testResult`, `isTesting`
- 新增测试对话框组件（小型 Dialog，不含搜索/筛选）
- 模型列表从 `provider.models` 读取，用 radio 或 select 让用户选择
- 测试按钮调用 `api.testProviderModel(baseUrl, apiKey, model)`
- 测试过程中按钮显示 loading 状态
- 测试结果用内联消息展示（成功绿色 / 失败红色）

### Frontend: api.ts

新增方法:

```typescript
async testProviderModel(baseUrl: string, apiKey: string, model: string): Promise<TestResult>
```

### Files Changed

| File | Change |
|------|--------|
| `packages/server/src/server.ts` | 新增 `POST /api/providers/test` 端点（~50 行） |
| `packages/ui/src/lib/api.ts` | 新增 `testProviderModel` 方法（~10 行） |
| `packages/ui/src/components/ProviderList.tsx` | 新增测试按钮 + `onTest` prop（~10 行） |
| `packages/ui/src/components/Providers.tsx` | 新增测试对话框 + 状态管理（~80 行） |
| `packages/ui/src/locales/en.json` | 新增少量键值（~5 行） |
| `packages/ui/src/locales/zh.json` | 新增对应中文键值 |

Zero new dependencies. Zero new utility modules.

### Error Handling

- API 地址为空 → 禁用测试按钮，toast 提示"请先填写 API 地址"
- API Key 为空 → 禁用测试按钮，toast 提示"请先填写 API Key"
- 无模型 → 禁用测试按钮，toast 提示"请先添加模型"
- 测试失败 → 展示具体错误原因（认证失败 / 模型不存在 / 超时等）
- 网络错误 → 展示友好提示

## Alternatives Considered

### 复用 fetchProviderModels 做连通性测试

不满足需求: 连通性测试只能验证 URL+Key，无法验证特定模型是否可用。用户需要的是模型级别的验证。

### 复用 /v1/models 端点检查模型存在性

即使模型在列表中，也不代表它能正常响应（可能被禁用、限流等）。实际 chat call 才是金标准。通过 `max_tokens: 1` 将成本降到最低。