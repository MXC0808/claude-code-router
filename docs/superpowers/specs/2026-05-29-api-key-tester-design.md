# API Key 快速测试功能设计

## 概述

在 UI 顶部工具栏新增"快速测试"入口（`Zap` 图标），打开一个专用 Dialog，支持批量测试供应商 API Keys 的可用性和延迟，结果按延迟升序排列，支持一键复制或导入到供应商配置。

## 架构

### 方案选择

采用纯前端方案：新增 `ApiKeyTesterDialog` 组件，复用现有 `/api/providers/test` 端点，在前端实现 Promise Pool 并发控制（最多 5 个并发）。后端零改动。

### 组件结构

```
App.tsx
└── ApiKeyTesterDialog.tsx   (新增)
    ├── 配置区 (Tab: 已有供应商 / 手动输入)
    ├── 测试进度列表
    └── 结果操作区
```

### 入口

在顶部工具栏新增按钮，使用 `Zap` 图标，文字"快速测试"。

## 交互流程

### 步骤一：配置

Dialog 顶部分两个 Tab：

**"已有供应商" Tab：**
- 下拉选择已配置的供应商
- 自动填入 `api_base_url`
- Keys 预填逻辑：优先使用 `api_keys` 数组；若 `api_keys` 为空则使用 `api_key` 单个值；每行一个

**"手动输入" Tab：**
- 手动填写 Base URL 输入框

两个 Tab 共用：
- Model 输入框（手动填写，或从供应商 models 列表选择）
- API Keys 多行文本框（每行一个 key）

### 步骤二：测试中

点击"开始测试"后：
- 按钮变为"测试中..."并禁用，显示取消按钮
- 顶部显示进度：`3 / 10 完成`
- Keys 列表实时展示每个 key 的状态：
  - `pending` — 灰色，等待中
  - `testing` — 蓝色旋转图标，测试中
  - `success` — 绿色 + 延迟数值（如 `342ms`）
  - `failed` — 红色 + 错误原因（如 `AUTH_FAILED`）
  - `cancelled` — 灰色删除线，已取消

### 步骤三：结果

全部完成后：
- 可用 keys 按延迟升序重新排列，置顶展示
- 顶部汇总：`可用 5 / 共 10，最低延迟 234ms`
- 操作按钮：
  - **"复制可用 Keys"** — 将可用 keys 换行拼接复制到剪贴板
  - **"追加到供应商"** — 下拉选择目标供应商，追加到其 `api_keys`
  - **"替换供应商 Keys"** — 下拉选择目标供应商，替换其 `api_keys`
  - 目标供应商选择器：追加和替换共用，默认选中"已有供应商" Tab 中当前选择的供应商；手动输入模式下默认为空

## 数据结构

### KeyTestResult

```typescript
interface KeyTestResult {
  key: string;           // 原始 key 值（显示时脱敏：前8位 + **** + 后4位）
  status: 'pending' | 'testing' | 'success' | 'failed' | 'cancelled';
  latency?: number;      // ms，仅 success 时有值
  error?: string;        // 错误码，仅 failed 时有值
}
```

### Dialog 内部状态

```typescript
mode: 'existing' | 'manual'
selectedProviderIndex: number | null
baseUrl: string
keysText: string          // 多行文本，解析时按换行分割、去空行去重
model: string
isTesting: boolean
results: KeyTestResult[]  // 与输入 keys 一一对应，测试中实时更新
importTargetIndex: number | null
```

## 并发控制

前端实现 Promise Pool，维护"当前运行数"计数器，始终保持最多 5 个并发请求，某个完成后立即启动下一个。不引入新依赖，使用原生 Promise 实现。

## 错误处理

### 输入校验（点击"开始测试"前）

- Base URL 为空 → 提示"请输入 Base URL"
- Keys 文本框为空或解析后无有效 key → 提示"请输入至少一个 API Key"
- Model 为空 → 提示"请输入 Model"
- 重复 key 自动去重，去重后提示"已移除 N 个重复 key"

### 测试过程中

- 单个 key 超时（复用现有 30s 超时）→ 标记为 `failed`，错误码 `TIMEOUT`
- 单个 key 网络错误 → 标记为 `failed`，错误码 `NETWORK_ERROR`
- 测试进行中点击"取消" → 中止未开始的 key，将其状态标记为 `cancelled`；已在测试中的等待完成，结果保留

### 导入操作

- 追加/替换前检查是否有可用 key，无可用 key 时按钮禁用
- 导入成功后触发 Toast 提示，调用 `persistConfig` 保存配置
- 导入不自动关闭 Dialog，方便用户继续操作

### 全部失败场景

- 汇总区显示"0 个可用 key"，复制和导入按钮禁用
- 保留失败列表供用户排查

## 复用清单

| 复用项 | 来源 |
|--------|------|
| `/api/providers/test` 端点 | `packages/server/src/server.ts` |
| `api.testProviderModel()` | `packages/ui/src/lib/api.ts` |
| `Dialog`, `Button`, `Badge` | `packages/ui/src/components/ui/` |
| `Combobox`, `Toast` | `packages/ui/src/components/ui/` |
| `persistConfig` 模式 | `packages/ui/src/components/Providers.tsx` |
| `Zap` 图标 | `lucide-react` |

## 文件改动范围

- **新增**：`packages/ui/src/components/ApiKeyTesterDialog.tsx`
- **修改**：`packages/ui/src/App.tsx` — 添加入口按钮和 Dialog 挂载
- **后端**：零改动
