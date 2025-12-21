## CLI 入口实现摘要（基于 packages/cli/index.ts 与 packages/cli/src/gemini.tsx）

### 架构与流程

- `index.ts` 为 Node 可执行入口，调用 `main()` 并统一捕获 `FatalError`/未知异常，确保 `runExitCleanup()` 与退出码一致。
- 启动阶段补丁 I/O 与异常处理：`patchStdio()`、`setupUnhandledRejectionHandler()`，并注册同步清理防止缓冲输出丢失。
- 配置链路：`loadSettings()` → `migrateDeprecatedSettings()` → `parseArguments()` → `loadCliConfig()`，区分轻量初始化与完整初始化。
- 运行分支：先处理 SANDBOX/子进程重启 → 完整初始化 → 分流交互 UI 或非交互执行。
- 事件驱动：`coreEvents` 负责输出与日志流转；`ConsolePatcher` 将 console 输出映射到事件总线。

### 功能能力

- 参数与校验：支持模型、交互/非交互、输出格式、扩展与会话管理；对 stdin + `--prompt-interactive` 等冲突输入早失败。
- 认证与安全：默认选择 auth 类型；进入 sandbox 前校验/刷新认证，避免 OAuth 回调受 sandbox 影响。
- 主题与配置：启动时加载自定义主题并激活；`SettingsContext`/`Keypress`/`Mouse`/`Scroll` 等 Provider 统一管理状态。
- 会话管理：支持 `--resume` 恢复会话、列出/删除会话；恢复后复用 sessionId 继续记录。
- 维护任务：清理 checkpoints 与过期会话；启动时异步检测更新并触发自动更新。

### 交互与体验

- 交互式 UI：Ink 渲染 `AppContainer`，可进入 alternate buffer + 鼠标事件；raw mode 管理输入并设置窗口标题。
- 终端能力：检测并启用 Kitty 键盘协议，按屏幕阅读器设置决定是否使用 alternate buffer。
- 非交互：支持 stdin 输入、`/slash` 与 `@include` 预处理；流式输出中处理 tool call、多轮执行与结果回传。
- 取消与容错：非交互通过 Ctrl+C + `AbortController` 取消；EPIPE 关闭时平滑退出。
- 输出格式：`text/json/stream-json` 三种格式，`initializeOutputListenersAndFlush()` 确保无监听时仍可输出。

### 技术栈与依赖

- 运行时：Node.js（process/os/v8/dns/readline/path）。
- TUI：React + Ink，Context/Hook 驱动终端 UI。
- CLI 解析：yargs 参数解析与子命令管理。
- 核心库：`@google/gemini-cli-core` 提供配置、事件、工具执行、遥测、认证与存储能力。
- 终端控制：ANSI 转义、alternate screen、Kitty 协议检测。
