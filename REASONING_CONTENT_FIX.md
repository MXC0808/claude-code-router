# DeepSeek/MiMo reasoning_content 回传问题 - 完整解决方案

## 问题背景

### 现象
使用 claude-code-router 转发请求到 DeepSeek 或 MiMo 模型时，在多轮对话中会遇到 **400 错误**。

### 根本原因
DeepSeek 和 MiMo 模型在响应中会返回 `reasoning_content` 字段（思考过程内容）。根据这两个模型的 API 文档：

- [MiMo reasoning_content 文档](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/passing-back-reasoning_content)
- [DeepSeek thinking_mode 文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)

**要求**：在多轮对话中，如果之前的响应包含 `reasoning_content`，客户端**必须**在下一轮对话时将这个 `reasoning_content` 回传给模型。

## 配置示例

### DeepSeek 配置
```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "sk-xxx",
      "models": [
        "deepseek-v4-flash",
        "deepseek-v4-pro"
      ],
      "transformer": {
        "use": [
          "deepseek"
        ]
      }
    }
  ]
}
```

### MiMo 配置
```json
{
  "Providers": [
    {
      "name": "xiaomi-mimo-pro",
      "api_base_url": "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
      "api_key": "tp-xxx",
      "models": [
        "mimo-v2.5-pro",
        "mimo-v2.5"
      ],
      "transformer": {
        "use": [
          [
            "deepseek",
            {
              "requiresReasoningReplay": true
            }
          ]
        ],
        "mimo-v2.5-pro": {
          "use": [
            [
              "deepseek",
              {
                "requiresReasoningReplay": true
              }
            ]
          ]
        }
      }
    }
  ]
}
```

---

## 测试验证

### 测试步骤
1. 应用修复后重新构建：
   ```bash
   pnpm build
   ```

2. 重启服务：
   ```bash
   ccr restart
   ```

3. 测试多轮对话：
   ```bash
   ccr code "你好，请帮我写一个 Hello World 程序"
   # 等待响应完成
   ccr code "请把它改成 Python 版本"
   ```
   
## 常见问题

### Q1: 为什么使用 deepseek 转换器处理 MiMo？
A1: 因为 MiMo 和 DeepSeek 使用相同的 `reasoning_content` 格式，所以可以复用 deepseek 转换器。

### Q2: 其他模型也需要这个修复吗？
A2: 只有使用 `reasoning_content` 字段的模型需要，目前包括：
- DeepSeek (deepseek-reasoner)
- MiMo (mimo-v2-pro, mimo-v2-flash)

### Q3: 修复后会影响其他模型吗？
A3: 不会。这个修复只在消息包含 `thinking` 字段时才生效，其他模型的消息不受影响。

---

## 总结

这个修复解决了一个关键的多轮对话问题，使得 claude-code-router 能够正确支持 DeepSeek 和 MiMo 等使用 `reasoning_content` 的模型。

**应用范围**：
- DeepSeek (所有模型)
- MiMo (所有模型)
- 其他使用 `reasoning_content` 格式的模型
