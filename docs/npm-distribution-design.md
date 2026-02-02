# NPM 分发设计文档

## 1. 设计目标

### 1.1 核心诉求

- **跨平台兼容**: 支持 macOS、Linux、Windows 无需重新编译
- **零运行时依赖**: 所有依赖打包到单一文件，用户无需关心依赖安装
- **标准 Node.js**: 仅依赖 Node.js >=18，不依赖 Bun 等特定运行时
- **最小化体积**: 发布包 < 100KB，安装快速

### 1.2 与二进制分发的对比

| 特性     | NPM 分发                | 二进制分发              |
| -------- | ----------------------- | ----------------------- |
| 跨平台   | ✅ 一次构建，全平台运行 | ❌ 需为每个平台单独构建 |
| 签名需求 | 无                      | macOS/Windows 需签名    |
| 包体积   | ~38KB                   | ~50-100MB               |
| 更新机制 | npm update              | 手动下载替换            |
| 环境要求 | Node.js >=18            | 无                      |
| 安装速度 | 快                      | 慢                      |

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────┐
│           @memo-code/memo               │
│  ┌─────────────────────────────────┐   │
│  │      dist/index.js (ESM)        │   │  ← 单一入口文件
│  │  - CLI 逻辑                      │   │
│  │  - Core 运行时                   │   │
│  │  - Tools 实现                    │   │
│  │  - UI (React/Ink)                │   │
│  └─────────────────────────────────┘   │
│              ↓                          │
│  ┌─────────────────────────────────┐   │
│  │      dist/prompt.md             │   │  ← 运行时资源
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Node.js Runtime (>=18)          │
└─────────────────────────────────────────┘
```

### 2.2 构建流水线

```
Source Code                    Build Output
────────────                   ────────────
packages/cli/src/
  └─ index.tsx    ───┐         dist/
                     ├─tsup──→   ├─ index.js (bundled)
packages/core/src/  ─┤            │   - React/Ink UI
  ├─ runtime/        │            │   - Session 管理
  ├─ config/         │            │   - LLM 调用
  └─ ...             │            │   - Token 计数
                     │            │
packages/tools/src/ ─┤            │   ← 所有依赖内联
  ├─ bash.ts         │            │
  ├─ read/write/     │            │
  └─ ...             │            │
                     │            │
packages/core/src/   │            │
  └─ runtime/        │            │
      └─ prompt.md ──┴──────────→├─ prompt.md
```

### 2.3 依赖处理策略

| 依赖类型         | 处理方式   | 原因            |
| ---------------- | ---------- | --------------- |
| `react`, `ink`   | 打包内联   | 运行时必需      |
| `fast-glob`      | 打包内联   | 避免用户安装    |
| `openai`         | 打包内联   | API 客户端      |
| `tiktoken`       | 打包内联   | Token 计数      |
| `zod`            | 打包内联   | Schema 验证     |
| Node.js 内置模块 | `external` | 由 Node.js 提供 |

## 3. 关键实现细节

### 3.1 构建配置 (tsup)

```typescript
export default defineConfig({
    entry: ['packages/cli/src/index.tsx'],
    format: ['esm'], // ESM 格式
    target: 'node18', // 最低 Node.js 版本
    bundle: true, // 打包所有依赖
    minify: true, // 压缩代码
    splitting: false, // 单一文件
    external: [], // 无外部依赖
    banner: {
        js: '#!/usr/bin/env node', // Shebang
    },
    onSuccess() {
        // 复制资源文件
        copyFileSync('packages/core/src/runtime/prompt.md', 'dist/prompt.md')
    },
})
```

### 3.2 资源文件处理

**问题**: `prompt.md` 是 Markdown 模板，需要运行时读取。

**方案**:

- 构建时复制到 `dist/prompt.md`
- `package.json` `files` 字段显式包含
- 运行时通过 `__dirname` 定位

```typescript
// 运行时读取
const __dirname = dirname(fileURLToPath(import.meta.url))
const promptPath = join(__dirname, 'prompt.md')
const prompt = await readFile(promptPath, 'utf-8')
```

### 3.3 路径别名解析

**开发时** (tsconfig.json):

```json
{
    "paths": {
        "@memo/core": ["packages/core/src/index.ts"],
        "@memo/core/*": ["packages/core/src/*"],
        "@memo/tools": ["packages/tools/src/index.ts"],
        "@memo/tools/*": ["packages/tools/src/*"]
    }
}
```

**构建时**: tsup 自动解析并内联，最终产物无路径别名。

**测试时** (vitest.config.ts):

```typescript
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],
})
```

## 4. 跨平台兼容性

### 4.1 文件路径处理

```typescript
// 使用 Node.js path 模块，自动处理分隔符
import { join, normalize } from 'node:path'

// 正确
const filePath = join(process.cwd(), 'config.toml')

// 错误 (硬编码分隔符)
const filePath = `${process.cwd()}/config.toml`
```

### 4.2 环境检测

```typescript
// 检测 ripgrep 可用性
const rgAvailable = (() => {
    const result = spawnSync('rg', ['--version'], { stdio: 'ignore' })
    return !result.error && result.status === 0
})()
```

### 4.3 Shell 命令执行

```typescript
// 使用 bash -lc 确保加载用户配置
spawn('bash', ['-lc', command], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
})
```

## 5. 发布流程

### 5.1 CI/CD 流程

```yaml
# .github/workflows/ci.yml
jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v2
            - uses: actions/setup-node@v4

            - run: pnpm install
            - run: pnpm run format:check
            - run: pnpm run test
            - run: pnpm run build
```

### 5.2 手动发布步骤

```bash
# 1. 确保测试通过
pnpm run ci

# 2. 更新版本号
npm version patch  # 或 minor/major

# 3. 构建并发布
npm publish --access public
```

### 5.3 发布后验证

```bash
# 1. 清理本地缓存
npm cache clean --force

# 2. 全局安装测试
npm install -g @memo-code/memo

# 3. 验证运行
memo --version
memo "test prompt"
```

## 6. 安装方式对比

| 方式      | 命令                             | 适用场景   |
| --------- | -------------------------------- | ---------- |
| 全局安装  | `npm install -g @memo-code/memo` | 日常使用   |
| pnpm 全局 | `pnpm add -g @memo-code/memo`    | pnpm 用户  |
| npx 运行  | `npx @memo-code/memo`            | 临时使用   |
| 本地安装  | `npm install @memo-code/memo`    | 项目内使用 |

## 7. 故障排查设计

### 7.1 常见问题

| 问题                   | 原因                   | 解决方案                               |
| ---------------------- | ---------------------- | -------------------------------------- |
| `command not found`    | 全局 bin 目录不在 PATH | 添加 `$(npm bin -g)` 到 PATH           |
| `prompt.md not found`  | 资源文件未复制         | 检查 `files` 字段包含 `dist/prompt.md` |
| `ERR_MODULE_NOT_FOUND` | 路径别名未解析         | 确保构建时无外部依赖                   |
| Windows 执行失败       | PowerShell 执行策略    | `Set-ExecutionPolicy RemoteSigned`     |

### 7.2 调试模式

```bash
# 查看详细日志
DEBUG=* memo

# 检查配置文件
memo --config

# 运行诊断
memo --doctor
```

## 8. 安全考虑

### 8.1 依赖安全

- 所有依赖在构建时锁定版本
- 使用 `npm audit` 定期检查
- 避免动态 `require()` 防止注入

### 8.2 运行时安全

- 工具执行前确认（bash、write、edit）
- 路径白名单检查
- 沙箱执行外部命令

## 9. 未来扩展

### 9.1 可能的优化

- **代码分割**: 按需加载大型依赖（如 tiktoken wasm）
- **压缩算法**: 使用 Brotli 进一步减小体积
- **增量更新**: 支持热更新机制

### 9.2 平台特定优化

- **macOS**: 考虑 Notarization（如分发 App）
- **Windows**: 提供 PowerShell 模块
- **Linux**: 提供 snap/flatpak 包

## 10. 总结

本设计通过以下策略实现高效跨平台分发：

1. **单一文件**: 所有代码打包到 `dist/index.js`
2. **资源内嵌**: `prompt.md` 随包分发
3. **零依赖**: 用户只需 Node.js
4. **标准工具链**: pnpm + tsup + vitest

相比二进制分发，NPM 分发具有更好的跨平台兼容性和更小的包体积，适合以 Node.js 为基础的 CLI 工具。
