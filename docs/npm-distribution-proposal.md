# 提案：改用 npm 分发（Node 运行时）

## 背景与目标
- 现状：通过 `bun build --compile` 生成本地二进制，macOS 上遭遇签名/Taskgated 拒绝执行；分发需要手工签名。
- 目标：发布为 npm 包，用户 `npm install -g @minorcell/memo` 后直接 `memo` 可用；运行依赖 Node（≥18），无需额外签名。

## 范围
- 构建目标由 Bun 二进制切换为 Node 可执行 JS。
- 发布渠道改为 npm 公有包（或 beta tag）。
- 运行时仍支持 MCP/工具等现有特性。

## 设计概览
1) **打包目标**
   - 使用 `bun build --target node --outdir dist packages/cli/src/index.tsx` 或改用 `tsup/esbuild/tsc`。
   - 入口文件 `dist/index.js` 顶部添加 shebang：`#!/usr/bin/env node`。
2) **包配置**
   - `package.json`：`"name": "@minorcell/memo"`, `"version": <语义化>`, `"private": false`
   - 增加 `"bin": { "memo": "dist/index.js" }`
   - 保持 `"type": "module"`；若需 CJS 兼容可输出双格式（`dist/index.mjs` / `dist/index.cjs`）。
3) **Bun 专有 API 替换**
   - `Bun.spawn` → `child_process.spawn`（带超时/stdio piping）
   - `Bun.file` / `Bun.write` → `fs/promises`
   - `bun:test` → `vitest` 或 `jest`
   - `bunx` 调用第三方 CLI → 改为依赖对应 npm 包或在文档提示“需全局安装”
4) **脚本调整**
   - `build`: `bun run build:node`（或 `tsup`）产出 dist
   - 新增 `prepare`/`prepublishOnly`: 运行构建+测试
   - 测试脚本切到 Node 测试框架
5) **发布流程**
   - 本地验证：`npm pack` → `npm install -g ./memo-<version>.tgz` → `memo --help`
   - 正式：`npm publish --access public`（可先 `--tag beta`）
6) **兼容与回退**
   - 保留 Bun 开发体验：`bun start` 继续支持；但发行物以 Node 为准。
   - 如需二进制分发，可后续补充 `pkg`/`ncc`/`bun --compile` 作为可选产物。

## 任务拆解
- 包元数据：更新 `package.json`（name/private/bin/scripts）。
- 构建链：选定 bundler（tsup/esbuild/tsc）；加入 shebang 处理。
- 运行时替换：定位所有 Bun API（`rg "Bun\\."`、`rg "bun:test"`）并重写。
- 测试迁移：引入 `vitest`，迁移测试与快照。
- CI 调整：使用 `npm ci && npm run test && npm run build`；可保留 `bun` 作为 dev 工具，但 CI 需 Node 跑得通。
- 文档：更新 README 快速开始、发布指南；保留本提案。

## 风险与缓解
- Bun API 替换遗漏 → 用 `rg` 全局审计；新增单元测试覆盖工具层。
- 体积与启动速度变化 → 打包时启用 tree-shaking/minify；必要时拆分动态加载。
- 用户环境 Node 版本不足 → 在 `package.json` 标明 `"engines": { "node": ">=18" }` 并在启动时检测友好提示。

## 里程碑
- M1：确定 bundler、完成 package.json 调整、出可运行的 dist（Node）。
- M2：完成 Bun API 替换与测试迁移，CI 绿色。
- M3：`npm pack` 本地验证，发布 beta tag。
- M4：稳定后 `npm publish` 正式版，并在 README 公告新安装方式。
