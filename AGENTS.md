# Repository Guidelines

## 项目结构与模块

- `packages/cli/`：TUI 入口与命令编排（`src/index.tsx`），构建后输出到 `dist/`。
- `packages/core/`：会话状态机、Provider/配置处理、共享类型。
- `packages/tools/`：内置类 MCP 工具；测试与实现同级，命名为 `*.test.ts`。
- `docs/`：开发文档与方向；`public/`：TUI 静态资源。
- 根目录脚本由 `package.json` 驱动，需 Node.js ≥18 和 pnpm，推荐安装 `rg` 加快搜索；类型与路径别名见 `tsconfig.json`。
- 运行时配置与日志默认位于 `~/.memo/`，可通过环境变量 `MEMO_HOME` 重定向。

## 构建、测试与开发

- 安装依赖：`pnpm install`。
- 本地运行（自动选择 TUI/单轮模式）：`pnpm start` 或 `pnpm start "prompt" --once`。
- 生成可分发包：`pnpm run build`；生成可执行二进制：`pnpm run build:binary`（产出 `memo`）。
- 格式化：`pnpm run format`（写入）/ `pnpm run format:check`（CI 只检查）。
- 测试：`pnpm test` 全量；或按包：`pnpm run test:core`、`pnpm run test:tools`、`pnpm run test:cli`。CI 使用 `pnpm run ci` 串联格式检查、核心/工具测试与构建。
- 本地常见故障：未设置 `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` 会提示交互输入；非 TTY 环境会自动退回单轮模式。
- 开发迭代可用 `pnpm test -- --watch path/to/file.test.ts` 缩短反馈时间。

## 代码风格与命名

- 语言：TypeScript + ESM；保持 Core（逻辑）、Tools（能力）、CLI（UI/接线）边界清晰。
- 使用 Prettier 统一格式，2 空格缩进；遵循 `pnpm run format` 输出，不手动改规则。
- 文件命名保持现有习惯（如 `config.ts`, `webfetch.test.ts`），导出尽量显式。
- 优先纯函数，副作用集中在 CLI 入口或工具适配层；对非显然行为补充简短注释。
- 文档同步：公共行为、参数或输出变动需更新 `README.md`、`docs/` 对应段落或示例。

## 测试准则

- 测试紧邻源码，文件名用 `*.test.ts`；延续现有示例（`bash.test.ts`, `glob_grep.test.ts`）。
- 定位执行：`pnpm test path/to/file.test.ts`；新增功能需覆盖错误分支与配置边界。
- 调整 Provider/配置流程时，在对应 package 下补充 fixture，防止序列化与 CLI 参数回归。
- 若修改 TUI 交互，建议附加截图/录屏，并在测试中覆盖核心快捷键和主要输出格式。

## 提交与 PR 约定

- Commit 前缀沿用现有小写类型：`feat:`, `fix:`, `chore:`, `refactor:`, `ci:`, `docs:`，后接简短作用域。
- 分支命名建议：`feature/<topic>`、`fix/<topic>`、`docs/<topic>` 等。
- PR 需包含：变更摘要、关联 issue（如有）、风险/回滚提示、验证步骤（如 `pnpm test`, `pnpm run format:check`）；仅 UI 输出变更时附 TUI 截图。
- CI 失败请先本地复现修复再请求评审；合并前保持分支可快进（推荐 rebase）。

## 安全与配置提示

- 不要提交密钥；运行时从环境变量（`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`）或 CLI 写入的 `~/.memo/config.toml` 读取。
- 工具代码需防御性检查路径与网络调用；文件系统操作优先显式白名单，尤其在 `packages/tools/` 中。
- 升级依赖时留意许可证兼容与体积变化；涉及网络请求请添加合理超时与错误提示。
