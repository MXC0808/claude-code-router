### Claude Code Router


### 一款强大的工具，可将 Claude Code 请求路由到不同的模型，并自定义任何请求

> 基于 [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router/tree/v2.0.0) v2.0.2版本的分支，主要用来merge pr 和 fixed bug。

 | 中文 |[原项目-英文](https://github.com/musistudio/claude-code-router/blob/main/README.md)|[原项目-中文](https://github.com/musistudio/claude-code-router/blob/main/README_zh.md)

##  🚀 快速开始

```shell
#安装claude code
# macOS, Linux, WSL:
curl -fsSL https://claude.ai/install.sh | bash
# Windows PowerShell:
irm https://claude.ai/install.ps1 | iex
# Windows CMD:
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd

# 如果安装过原项目请先备份下配置文件
cp -r ~/.claude-code-router/config.json  config.json-backup-to-update-20260520

#卸载原项目
npm uninstall -g @musistudio/claude-code-router

#再安装 claude-code-router
npm install -g @leoomao/claude-code-router
```

创建 `~/.claude-code-router/config.json`，启动：

```shell
ccr code
```

## 变更记录

#### v2.0.3

fix：修复 UI 获取可用模型时 Gemini 认证失败的问题，改用 `?key=` 查询参数替代 `Authorization: Bearer` 头，并适配 Gemini 响应格式。

fix：修复 UI 获取可用模型时 DeepSeek 等 provider 认证失败的问题，发送请求前解析 API Key 中的环境变量占位符（如 `$DEEPSEEK_API_KEY`）。

fix：修复 UI 多选模型后点击添加只添加一个模型的问题，改为一次性批量添加。

#### v2.0.1

feat:编辑供应商新增获取可用模型列表的功能，方便用户快速选择模型; [已测试供应商文档](docs/docs/server/config/tested-providers.md)

feat：路由配置页新增快速填充功能-"应用全部"按钮，选择默认模型后可一键覆盖所有场景（后台、思考、长上下文、网络搜索、图像）。

feat：添加 Mistral、Codex、Chrome 设备端提供商；修复 Gemini/DeepSeek 流媒体播放和推理问题;   [#pr-1393](https://github.com/musistudio/claude-code-router/pull/1393)

fix: 修复了调用小米 mimo模型报400 reasoning_content的问题 ; 查看[reasoning_content修复文档](REASONING_CONTENT_FIX.md)添加相关配置

fix：优化了~/.claude-code-router/config.json 文件的权限;  [#pr-1399](https://github.com/musistudio/claude-code-router/pull/1399)

## 📚 文档

- [Transformer 中文文档](docs/docs/server/config/transformers_zh.md) - 25 个内置 transformer 的详细说明，包括 Provider 专用 transformer、功能型 transformer 和工具 transformer
- [Transformer English Documentation](docs/docs/server/config/transformers.md)

