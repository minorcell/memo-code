# Contributing / 贡献指南

感谢你对 memo-cli 的关注！为了让协作顺畅，请在提交 PR 前阅读以下约定。

## 快速开始 / Getting Started

- 先安装 [Bun](https://bun.sh/) (>=1.1)；部分工具/测试依赖 [ripgrep](https://github.com/BurntSushi/ripgrep)（命令 `rg`）。
- 安装依赖：`bun install`
- 运行 CLI：`bun start "你的问题" --once` 或交互式 `bun start`
- 构建产物：`bun build`

## 代码风格 / Code Style

- 采用 TypeScript + ESM；保持现有的目录与模块边界（Core/Tools/UI）。
- 提交前请运行格式化：`bun run format`；CI 将使用 `bun run format:check`。
- 变更公共接口或行为时同步更新文档（如 `README.md`、`docs/`）。

## 测试 / Testing

- 全量测试：`bun test`
- 定位单测：`bun test packages/tools/src/tools/bash.test.ts`
- 如果引入新功能，请补充或更新相关测试，确保本地通过后再提交。

## Issue & PR

- 提交问题或需求时，请使用 GitHub Issue 模板并提供复现步骤、日志和环境信息。
- 对于功能性改动，建议先开 issue 讨论或在 PR 中简述设计思路。
- 建议使用分支命名：`feature/<topic>`、`fix/<topic>`、`docs/<topic>`。
- PR 中注明变更范围、风险点以及验证方式，保持 commit 粒度清晰。

## 其他建议 / Tips

- 优先关注 Core/Tools 契约和可复用性，UI 仅做薄封装（参考 `docs/dev-direction.md`）。
- 对于涉及安全或文件系统的工具，注意路径白名单和错误信息一致性。
- 任何不确定的地方，欢迎开 issue 或在 PR 中提问，维护者会尽快回应。
