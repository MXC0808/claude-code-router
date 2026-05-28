# API Key 号池 - 变更记录

## v2.0.1

### 新增功能

**API Key 号池**

支持为单个供应商配置多个 API Key，实现自动轮询和失效切换。

- 新增 `api_keys` 配置字段，接受 `string[]` 数组
- 请求失败时自动切换到下一个可用 Key（默认触发状态码：401、403、429）
- 新增 `retryable_status_codes` 可选配置，允许自定义触发切换的 HTTP 状态码
- 服务日志输出 Key 轮询切换记录，便于监控和排查
- 详细文档：[API Key 号池](./api-key-pool.md)

**UI 批量导入密钥**

- 供应商列表新增密钥导入按钮（Key 图标，位于复制按钮左侧）
- 点击弹出批量导入弹窗，支持每行一个 Key 粘贴导入
- 自动去除重复 Key
- 导入不影响已有的 `api_key` 字段

**测试供应商兼容 api_keys**

- 配置了 `api_keys` 的供应商，测试功能使用第一个 Key 进行验证
- 未配置 `api_key` 时不再报"需要 API Key"错误

### 配置示例

```json
{
  "providers": [
    {
      "name": "xiaomi-mimo",
      "api_base_url": "https://api.xiaomi.com/v1",
      "api_keys": ["$MIMO_KEY_1", "$MIMO_KEY_2", "$MIMO_KEY_3"],
      "retryable_status_codes": [401, 403, 429],
      "models": ["MiMo-7B"],
      "transformer": { "use": ["openai"] }
    }
  ]
}
```

### 技术实现

- 新增 `ApiKeyPool` 类，封装轮询选择和失效管理逻辑
- `ProviderService` 初始化时根据 `api_keys` 自动创建 Key Pool
- `sendRequestToProvider` 支持 Key Pool 自动重试，对上游调用完全透明
- 单 `api_key` 供应商零影响，无 Pool 开销
