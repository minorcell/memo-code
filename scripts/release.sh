#!/bin/bash
set -e

# 发布脚本
# 使用: ./scripts/release.sh [patch|minor|major]

if [ $# -ne 1 ]; then
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

VERSION_TYPE=$1

# 检查是否在干净的工作目录
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory is not clean"
    git status
    exit 1
fi

# 运行测试和构建
echo "Running tests and build..."
pnpm run ci

# 创建版本标签
echo "Creating $VERSION_TYPE version..."
npm version $VERSION_TYPE -m "chore: release v%s"

# 推送标签
echo "Pushing tags..."
git push --follow-tags

# 发布到 npm
echo "Publishing to npm..."
npm publish

echo "Release completed successfully!"
