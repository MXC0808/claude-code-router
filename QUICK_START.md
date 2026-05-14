# Claude Code Router 快速入门指南

## 项目简介

Claude Code Router 是一个强大的工具，用于将 Claude Code 请求路由到不同的 LLM 提供商。它允许用户在不使用 Anthropic 账户的情况下使用 Claude Code，并将请求转发到其他 LLM 提供商。

## 核心特性

- **模型路由**：根据请求类型自动路由到不同的模型
- **多提供商支持**：支持 OpenRouter、DeepSeek、Ollama、Gemini 等多种提供商
- **请求/响应转换**：使用转换器为不同的提供商自定义请求和响应
- **动态模型切换**：在 Claude Code 中动态切换模型
- **CLI 管理**：通过终端管理模型和提供商
- **Web 界面**：通过图形界面管理配置

## 快速开始

### 1. 安装

首先，确保您已安装 Claude Code：

```bash
npm install -g @anthropic-ai/claude-code
```

然后，安装 Claude Code Router：

```bash
npm install -g @musistudio/claude-code-router
```

### 2. 配置

创建配置文件 `~/.claude-code-router/config.json`：

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-deepseek-api-key",
      "MODELS": ["deepseek-chat", "deepseek-coder"],
      "transformers": ["anthropic"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

### 3. 启动服务

```bash
ccr start
```

### 4. 使用 Claude Code

```bash
ccr code
```

## 常用命令

### 服务管理

```bash
ccr start      # 启动服务
ccr stop       # 停止服务
ccr restart    # 重启服务
ccr status     # 查看状态
```

### 配置管理

```bash
ccr model      # 交互式模型选择
ccr ui         # 打开 Web 管理界面
```

### 预设管理

```bash
ccr preset list                # 列出所有预设
ccr preset install my-preset   # 安装预设
ccr preset export my-config    # 导出当前配置为预设
```

## 配置详解

### 提供商配置

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "MODELS": ["deepseek-chat", "deepseek-coder"],
      "transformers": ["anthropic"]
    }
  ]
}
```

### 路由配置

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "groq,llama-3.3-70b-versatile",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "gemini,gemini-1.5-pro",
    "longContextThreshold": 100000,
    "webSearch": "deepseek,deepseek-chat",
    "image": "gemini,gemini-1.5-pro"
  }
}
```

### 转换器配置

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

### 回退配置

```json
{
  "fallback": {
    "default": [
      "openrouter,anthropic/claude-sonnet-4"
    ],
    "think": [
      "openrouter,anthropic/claude-3.7-sonnet:thinking"
    ]
  }
}
```

## 使用场景

### 1. 使用免费模型

配置免费的 LLM 提供商：

```json
{
  "Providers": [
    {
      "NAME": "ollama",
      "HOST": "http://localhost:11434",
      "APIKEY": "ollama",
      "MODELS": ["llama3", "codellama"],
      "transformers": ["anthropic"]
    }
  ],
  "Router": {
    "default": "ollama,llama3"
  }
}
```

### 2. 多模型切换

配置多个提供商，根据任务类型选择模型：

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-deepseek-key",
      "MODELS": ["deepseek-chat", "deepseek-coder"],
      "transformers": ["anthropic"]
    },
    {
      "NAME": "openai",
      "HOST": "https://api.openai.com/v1",
      "APIKEY": "your-openai-key",
      "MODELS": ["gpt-4", "gpt-3.5-turbo"],
      "transformers": ["openai"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "think": "openai,gpt-4",
    "background": "deepseek,deepseek-chat"
  }
}
```

### 3. 使用预设

安装社区预设：

```bash
# 从预设市场安装
ccr install my-preset

# 使用预设启动
ccr my-preset "Write a Hello World program"
```

## Web UI

### 启动 Web UI

```bash
ccr ui
```

### 功能特性

- **配置管理**：可视化编辑配置文件
- **提供商管理**：添加、编辑、删除提供商
- **路由配置**：设置路由规则
- **转换器管理**：配置请求/响应转换器
- **预设市场**：浏览和安装社区预设
- **日志查看**：查看服务日志
- **调试工具**：请求历史和调试信息

## 环境集成

### Shell 集成

将以下内容添加到您的 shell 配置文件（如 `~/.bashrc` 或 `~/.zshrc`）：

```bash
eval "$(ccr activate)"
```

这将设置以下环境变量：

```bash
export ANTHROPIC_BASE_URL=http://localhost:3456
export ANTHROPIC_API_KEY=your-api-key
```

### GitHub Actions 集成

在 GitHub Actions 中使用：

```yaml
- name: Setup Claude Code Router
  run: |
    npm install -g @musistudio/claude-code-router
    ccr start
    
- name: Run Claude Code
  run: |
    ccr code "Your prompt here"
```

## Docker 部署

### 拉取镜像

```bash
docker pull musistudio/claude-code-router
```

### 运行容器

```bash
docker run -d \
  -p 3456:3456 \
  -v ~/.claude-code-router:/root/.claude-code-router \
  musistudio/claude-code-router
```

### Docker Compose

```yaml
version: '3.8'
services:
  claude-code-router:
    image: musistudio/claude-code-router
    ports:
      - "3456:3456"
    volumes:
      - ~/.claude-code-router:/root/.claude-code-router
    restart: unless-stopped
```

## 故障排除

### 服务无法启动

1. 检查端口是否被占用：
   ```bash
   lsof -i :3456
   ```

2. 检查配置文件格式：
   ```bash
   cat ~/.claude-code-router/config.json | jq .
   ```

3. 查看日志：
   ```bash
   cat ~/.claude-code-router/logs/ccr-*.log
   ```

### 请求失败

1. 检查 API 密钥是否正确
2. 验证提供商配置
3. 查看错误日志

### 性能问题

1. 检查网络连接
2. 调整超时设置
3. 优化模型选择

## 高级功能

### 自定义路由

创建自定义路由函数：

```javascript
// custom-router.js
module.exports = function(config, request) {
  const { messages } = request.body;
  
  // 根据消息内容选择模型
  if (messages.some(m => m.content.includes('code'))) {
    return 'deepseek,deepseek-coder';
  }
  
  return config.Router.default;
};
```

配置使用：

```json
{
  "CUSTOM_ROUTER_PATH": "./custom-router.js"
}
```

### 自定义转换器

创建自定义转换器：

```javascript
// my-transformer.js
module.exports = {
  name: 'my-transformer',
  
  async transformRequestIn(request, provider, context) {
    // 修改请求
    return {
      ...request,
      // 自定义参数
    };
  },
  
  async transformResponseIn(response, context) {
    // 修改响应
    return response;
  }
};
```

配置使用：

```json
{
  "transformers": [
    {
      "name": "my-transformer",
      "path": "./my-transformer.js",
      "providers": ["my-provider"]
    }
  ]
}
```

## 最佳实践

### 1. 配置管理

- 使用环境变量存储敏感信息
- 定期备份配置文件
- 使用版本控制管理配置

### 2. 性能优化

- 合理设置长上下文阈值
- 使用轻量级模型处理后台任务
- 启用缓存减少重复计算

### 3. 安全建议

- 设置强 API 密钥
- 限制服务监听地址
- 定期更新依赖包

### 4. 监控策略

- 启用详细日志记录
- 设置健康检查告警
- 监控资源使用情况

## 获取帮助

- **文档**：https://musistudio.github.io/claude-code-router/
- **GitHub**：https://github.com/musistudio/claude-code-router
- **Discord**：https://discord.gg/rdftVMaUcS

## 示例配置

### 简单配置

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "MODELS": ["deepseek-chat"],
      "transformers": ["anthropic"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

### 完整配置

```json
{
  "port": 3456,
  "LOG": true,
  "LOG_LEVEL": "debug",
  "APIKEY": "your-secret-key",
  "HOST": "0.0.0.0",
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "$DEEPSEEK_API_KEY",
      "MODELS": ["deepseek-chat", "deepseek-coder"],
      "transformers": ["anthropic"]
    },
    {
      "NAME": "groq",
      "HOST": "https://api.groq.com/openai/v1",
      "APIKEY": "$GROQ_API_KEY",
      "MODELS": ["llama-3.3-70b-versatile"],
      "transformers": ["anthropic"]
    },
    {
      "NAME": "gemini",
      "HOST": "https://generativelanguage.googleapis.com/v1beta",
      "APIKEY": "$GEMINI_API_KEY",
      "MODELS": ["gemini-1.5-pro"],
      "transformers": ["anthropic"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "groq,llama-3.3-70b-versatile",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "gemini,gemini-1.5-pro",
    "longContextThreshold": 100000,
    "webSearch": "deepseek,deepseek-chat",
    "image": "gemini,gemini-1.5-pro"
  },
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq", "gemini"]
    }
  ],
  "fallback": {
    "default": [
      "openrouter,anthropic/claude-sonnet-4"
    ],
    "think": [
      "openrouter,anthropic/claude-3.7-sonnet:thinking"
    ]
  }
}
```

## 总结

Claude Code Router 提供了一个简单而强大的方式来使用 Claude Code，同时支持多种 LLM 提供商。通过合理的配置，您可以：

1. **降低成本**：使用免费或低成本的模型
2. **提高灵活性**：根据任务类型选择最优模型
3. **增强功能**：利用不同提供商的特色功能
4. **保护隐私**：本地运行保护数据安全

开始使用 Claude Code Router，享受更灵活、更经济的 AI 编码体验！