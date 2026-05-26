#!/bin/bash
set -e

# 发布脚本
# - 仅发布 CLI 包 @leoomao/claude-code-router（依赖 @musistudio/llms）
# - @musistudio/llms 为原作者已发布的包，不重新发布

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION=$(node -p "require('${ROOT_DIR}/packages/cli/package.json').version")

echo "========================================="
echo "发布 Claude Code Router v${VERSION}"
echo "========================================="

# 检查是否已登录 npm
if ! npm whoami &>/dev/null; then
  echo "错误: 未登录 npm，请先运行: npm login"
  exit 1
fi

# 备份原始 package.json
CLI_DIR="${ROOT_DIR}/packages/cli"
BACKUP_DIR="${ROOT_DIR}/packages/cli/.backup"
mkdir -p "$BACKUP_DIR"
cp "$CLI_DIR/package.json" "$BACKUP_DIR/package.json.bak"

# 创建临时的发布用 package.json
node -e "
  const pkg = require('${ROOT_DIR}/packages/cli/package.json');
  pkg.name = '@leoomao/claude-code-router';
  delete pkg.scripts;
  pkg.files = ['dist/*', 'README.md', 'LICENSE'];
  pkg.dependencies = {};
  delete pkg.dependencies['@CCR/shared'];
  delete pkg.dependencies['@CCR/server'];
  delete pkg.devDependencies;
  pkg.dependencies['@musistudio/llms'] = '^' + require('${ROOT_DIR}/packages/core/package.json').version;
  pkg.peerDependencies = {
    'node': '>=18.0.0'
  };
  pkg.engines = {
    'node': '>=18.0.0'
  };
  require('fs').writeFileSync('${ROOT_DIR}/packages/cli/package.publish.json', JSON.stringify(pkg, null, 2));
"

# 使用发布版本的 package.json
mv "$CLI_DIR/package.json" "$BACKUP_DIR/package.json.original"
mv "$CLI_DIR/package.publish.json" "$CLI_DIR/package.json"

# 复制 README 和 LICENSE
cp "${ROOT_DIR}/README.md" "$CLI_DIR/" 2>/dev/null || echo "README.md 不存在，跳过..."
cp "${ROOT_DIR}/LICENSE" "$CLI_DIR/" 2>/dev/null || echo "LICENSE 文件不存在，跳过..."

# 发布到 npm
cd "$CLI_DIR"
echo "执行 npm publish..."
npm publish --access public

# 恢复原始 package.json
mv "$BACKUP_DIR/package.json.original" "$CLI_DIR/package.json"

echo ""
echo "========================================="
echo "🎉 发布完成!"
echo "========================================="
echo "包名: @leoomao/claude-code-router@${VERSION}"
echo "安装: npm install -g @leoomao/claude-code-router"
