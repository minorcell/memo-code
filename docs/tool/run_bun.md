# Memo CLI `run_bun` 工具

在临时文件中运行任意 Bun (JS/TS) 代码，等价于一个轻量「代码解释器」。

## 基本信息

- 工具名称：`run_bun`
- 描述：在临时文件中运行 Bun (JS/TS) 代码，支持 top-level await，输出 stdout/stderr 与退出码。
- 文件：`packages/tools/src/tools/run_bun.ts`
- 确认：否

## 参数

- `code`（字符串，必填）：需要执行的 JS/TS 代码。

## 行为

- 运行前会创建独立的临时目录（尊重 `TMPDIR`，否则 `os.tmpdir()`），将代码写入 `main.ts`，并在执行后递归删除整个目录。
- Linux 通过 [bubblewrap (`bwrap`)](https://github.com/containers/bubblewrap) 创建沙箱；macOS 使用 `sandbox-exec` profile。只有该临时目录被绑定为可写，其他系统路径保持只读。
- 默认 `MEMO_RUN_BUN_ALLOW_NET=0`（禁用网络）；设置为 `1` 可打开网络转发。
- 可以通过 `MEMO_RUN_BUN_SANDBOX='["/path/to/runner","--flag","{{entryFile}}"]'` 自定义沙箱命令；支持 `{{entryFile}}`、`{{runDir}}`、`{{allowNetwork}}` 占位符。
- 执行命令时自动设置 `TMPDIR=HOME=<临时目录>`、`FORCE_COLOR=0`，避免污染宿主环境。
- 收集 stdout/stderr 文本及退出码，返回格式：
    ```
    exit=<code>
    stdout:
    <stdout content>
    stderr:
    <stderr content>
    ```
- 即使出现 runtime error 也会返回（exit 为非 0，stderr 包含错误）；只在文件写入/进程创建等异常时标记 `isError=true`。
- 执行完会尝试删除临时文件（清理失败会被忽略）。

## 适用场景

- 小块 JS/TS 验证、字符串/数据处理。
- 调用 npm/bun 内置 API（无需项目依赖）。
- 验证 top-level await 或 TypeScript 类型提示行为。

## 注意

- Linux 需要预装 `bwrap`，macOS 依赖系统自带的 `sandbox-exec`；否则需通过 `MEMO_RUN_BUN_SANDBOX` 指定自定义沙箱（命令以 JSON 数组形式配置）。
- 只能访问环境已有的依赖（未自动安装第三方包）。
- 网络默认关闭，如确需联网请设置 `MEMO_RUN_BUN_ALLOW_NET=1` 并考虑额外的出口控制。
- 输出未经截断，长输出可能占用较多 token。\*\*\*
