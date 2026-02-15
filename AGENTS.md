# 仓库指南

## 项目结构与模块

- `packages/tui/`：终端运行时包（入口文件 `src/cli.tsx`，包含交互式应用、聊天时间线、斜杠命令注册、批准/设置覆盖层）。
- `packages/core/`：会话状态机、提供商/配置处理、共享类型。
- `packages/tools/`：内置的类似 MCP 的工具；测试文件与实现文件放在一起，并使用 `*.test.ts` 命名。
- `docs/`：开发文档和设计方向；`public/`：TUI 静态资源。
- 根脚本由 `package.json` 管理；需要 Node.js >=20 和 pnpm。安装 `rg` 以加快搜索速度。类型/路径别名在 `tsconfig.json` 中。
- 运行时配置和日志默认存储在 `~/.memo/` 中，可以通过 `MEMO_HOME` 环境变量重定向。
- 上下文窗口仅由 `model_profiles.*.context_window` 决定；自动压缩阈值由 `auto_compact_threshold_percent` 控制（默认 `80`）。

## 构建、测试与开发

- 安装依赖：`pnpm install`。
- 本地运行：`pnpm start`（交互式 TUI）。非 TTY 标准输入会自动使用纯文本模式。
- 构建可分发的包：`pnpm run build`（输出 `dist/index.js` 和 `dist/prompt.md` 用于 npm 发布）。
- 格式化：`pnpm run format`（写入文件）/ `pnpm run format:check`（仅 CI 检查）。
- 测试：`pnpm test` 运行所有测试；按包测试：`pnpm run test:core`，`pnpm run test:tools`，`pnpm run test:tui`。CI 运行 `pnpm run ci` 进行格式检查、核心/工具测试和构建。
- 常见本地问题：缺少 `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` 会触发交互式提示；非 TTY 环境自动使用纯文本模式。
- 永远不要为旧实现做兼容性妥协。重构和改进是被鼓励的，但不应以牺牲代码质量、可维护性或安全性为代价。

## 代码风格与命名

- 语言：TypeScript + ESM。保持清晰的边界：Core（逻辑）、Tools（能力）、TUI 包（CLI 入口 + 交互式 UI/状态）。
- 使用 Prettier 进行格式化，缩进为 2 个空格。遵循 `pnpm run format` 的规则；不要手动更改样式规则。
- 保持现有的命名约定（例如，`config.ts`，`webfetch.test.ts`），并优先使用显式导出。
- 优先使用纯函数。将副作用保留在 CLI 入口或工具适配器中。为非显而易见的行为添加简短注释。
- 保持文档同步：当公共行为、参数或输出发生变化时，更新 `README.md` 和相关的 `docs/` 章节/示例。

## 测试指南

- 将测试文件放在源文件旁边，并使用 `*.test.ts` 命名；遵循现有示例（`bash.test.ts`，`glob_grep.test.ts`）。
- 使用 `pnpm test path/to/file.test.ts` 运行聚焦测试；新功能必须覆盖错误分支和配置边界。
- 更改提供商/配置流程时，在相关包中添加固定测试用例，以防止序列化和 CLI 参数回归。
- 确保所有新功能和更改都经过适当的测试覆盖（70% 以上），包括单元测试、集成测试和端到端测试（如果适用）。测试应该涵盖正常使用情况以及边缘情况，以确保代码的健壮性和可靠性。

## 提交与 PR 约定

- 保持小写提交前缀：`feat:`，`fix:`，`chore:`，`refactor:`，`ci:`，`docs:`，并带有简短的作用域。
- 推荐的分支名称：`feature/<topic>`，`fix/<topic>`，`docs/<topic>`。
- PR 应包括：更改摘要、关联的问题（如果有）、风险/回滚说明以及验证步骤（例如，`pnpm test`，`pnpm run format:check`）。对于仅涉及 UI 输出的更改，添加 TUI 截图。
- 如果 CI 失败，请在请求审查前在本地重现并修复。在合并前保持分支可快进（推荐变基）。

## 安全与配置说明

- 永远不要提交密钥。运行时密钥从环境变量（`OPENAI_API_KEY`，`DEEPSEEK_API_KEY`）或由 CLI 写入的 `~/.memo/config.toml` 文件中读取。
- 工具代码应防御性地验证路径和网络调用。优先使用显式的文件系统允许列表，尤其是在 `packages/tools/` 中。
- 升级依赖项时，注意许可证兼容性和包大小。为网络请求添加合理的超时和清晰的错误信息。
