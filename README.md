# ReAct Demo

一个使用 Bun、DeepSeek 模型和 XML 格式的 ReAct Agent 示例。

## 快速开始

1. 安装依赖：
   ```bash
   bun install
   ```
2. 设置 API 密钥：
   ```bash
   export DEEPSEEK_API_KEY=your_key_here
   ```
3. 运行：
   ```bash
   bun start "你的问题"
   ```

## 内置工具

- `bash`: 执行 shell 命令
- `read`: 读取文件
- `write`: 创建/覆盖文件
- `edit`: 替换文本
- `glob`: 文件匹配
- `grep`: 代码搜索
- `fetch`: HTTP GET 请求

## 自定义

- 修改 `src/prompt.tmpl` 调整行为
- 在 `src/tools/` 添加新工具
- 调试可调整 `src/index.ts` 中的参数
