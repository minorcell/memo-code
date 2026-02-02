# 提案：npm 分发（Node 运行时）

## 背景与目标

- 目标：发布为 npm 包，用户 `npm install -g @memo-code/memo` 后直接 `memo` 可用；运行依赖 Node（≥18），无需额外签名。

## 范围

- 构建目标为 Node 可执行 JS。
- 发布渠道改为 npm 公有包（或 beta tag）。
- 运行时仍支持 MCP/工具等现有特性。

## 实现方案

### 1. 使用 Node 标准库

| API                       | 用途     |
| ------------------------- | -------- |
| `fs/promises.readFile()`  | 文件读取 |
| `fs/promises.writeFile()` | 文件写入 |
| `fast-glob`               | 模式匹配 |

### 2. 构建工具

- 使用 `tsup` 打包为单文件 ESM
- 输出 `dist/index.js`，添加 shebang `#!/usr/bin/env node`

### 3. 包配置

```json
{
    "name": "@memo-code/memo",
    "bin": {
        "memo": "./dist/index.js"
    },
    "engines": {
        "node": ">=18.0.0"
    }
}
```

### 4. 依赖调整

- 新增：`fast-glob`, `tsup`, `tsx`, `vitest`
- 移除：`react-devtools-core`

## 已完成

- [x] 使用 `fs/promises` 进行文件操作
- [x] 使用 `fast-glob` 进行模式匹配
- [x] 更新测试文件使用 Vitest
- [x] 配置 `tsup` 构建
- [x] 更新 `package.json` 为 npm 包配置
- [x] 更新 `README.md` 安装说明

## 发布流程

```bash
# 1. 构建
npm run build

# 2. 发布到 npm
npm publish

# 3. 用户安装
npm install -g @memo-code/memo
memo
```

## 优势

1. **跨平台兼容**：Windows/macOS/Linux 一致
2. **分发简化**：npm 自动处理版本管理、依赖解析
3. **更新便捷**：`npm update -g @memo-code/memo`
4. **开发友好**：使用标准 Node 生态

## 注意事项

- 测试使用 Vitest（与 pnpm 配合良好）
- 开发运行使用 `tsx` 直接执行 TS（`pnpm start`）
- 构建产物为单文件，便于分发
