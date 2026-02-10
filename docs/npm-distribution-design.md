# NPM Distribution Design

## 1. Design Goals

### 1.1 Core Requirements

- **Cross-platform compatibility**: support macOS, Linux, and Windows without per-platform recompilation
- **Zero runtime dependency setup for users**: package all dependencies into one deliverable file
- **Standard Node.js runtime**: require only Node.js >=18 (no Bun-specific runtime dependency)
- **Small package size**: published package under 100KB for fast install

### 1.2 Comparison with Binary Distribution

| Feature              | NPM Distribution              | Binary Distribution            |
| -------------------- | ----------------------------- | ------------------------------ |
| Cross-platform       | ✅ build once, run everywhere | ❌ separate build per platform |
| Signing requirements | none                          | macOS/Windows signing required |
| Package size         | ~38KB                         | ~50-100MB                      |
| Update workflow      | `npm update`                  | manual download/replace        |
| Runtime requirement  | Node.js >=18                  | none                           |
| Install speed        | fast                          | slower                         |

## 2. Architecture

### 2.1 Overall Architecture

```text
┌─────────────────────────────────────────┐
│           @memo-code/memo               │
│  ┌─────────────────────────────────┐   │
│  │      dist/index.js (ESM)        │   │  ← single entry file
│  │  - CLI logic                     │   │
│  │  - Core runtime                  │   │
│  │  - Tools implementation          │   │
│  │  - UI (React/Ink)                │   │
│  └─────────────────────────────────┘   │
│              ↓                          │
│  ┌─────────────────────────────────┐   │
│  │      dist/prompt.md             │   │  ← runtime resource
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Node.js Runtime (>=18)          │
└─────────────────────────────────────────┘
```

### 2.2 Build Pipeline

```text
Source Code                    Build Output
────────────                   ────────────
packages/tui/src/
  └─ cli.tsx      ───┐         dist/
                     ├─tsup──→   ├─ index.js (bundled)
packages/core/src/  ─┤            │   - React/Ink UI
  ├─ runtime/        │            │   - Session management
  ├─ config/         │            │   - LLM invocation
  └─ ...             │            │   - Token counting
                     │            │
packages/tools/src/ ─┤            │   ← all dependencies inlined
  ├─ exec_command.ts │            │
  ├─ read_file.ts    │            │
  ├─ list_dir.ts     │            │
  ├─ grep_files.ts   │            │
  └─ ...             │            │
                     │            │
packages/core/src/   │            │
  └─ runtime/        │            │
      └─ prompt.md ──┴──────────→├─ prompt.md
```

### 2.3 Dependency Strategy

| Dependency Type | Handling      | Reason                           |
| --------------- | ------------- | -------------------------------- |
| `react`, `ink`  | bundle inline | required at runtime              |
| `fast-glob`     | bundle inline | avoid user-side install concerns |
| `openai`        | bundle inline | API client                       |
| `tiktoken`      | bundle inline | token counting                   |
| `zod`           | bundle inline | schema validation                |
| Node built-ins  | `external`    | provided by Node.js              |

## 3. Key Implementation Details

### 3.1 Build Config (`tsup`)

```typescript
export default defineConfig({
    entry: ['packages/tui/src/cli.tsx'],
    format: ['esm'], // ESM format
    target: 'node18', // minimum Node.js version
    bundle: true, // bundle all dependencies
    minify: true, // minify code
    splitting: false, // single file output
    external: [], // no external runtime deps
    banner: {
        js: '#!/usr/bin/env node', // shebang
    },
    onSuccess() {
        // copy runtime resource file
        copyFileSync('packages/core/src/runtime/prompt.md', 'dist/prompt.md')
    },
})
```

### 3.2 Resource File Handling

**Problem**: `prompt.md` is a runtime-read Markdown template.

**Solution**:

- Copy it to `dist/prompt.md` during build
- Include it explicitly in `package.json` `files`
- Locate it with `__dirname` at runtime

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url))
const promptPath = join(__dirname, 'prompt.md')
const prompt = await readFile(promptPath, 'utf-8')
```

### 3.3 Path Alias Resolution

**During development** (`tsconfig.json`):

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

**During build**: tsup resolves and inlines aliases automatically.

**During test** (`vitest.config.ts`):

```typescript
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],
})
```

## 4. Cross-platform Compatibility

### 4.1 File Path Handling

```typescript
import { join, normalize } from 'node:path'

// correct
const filePath = join(process.cwd(), 'config.toml')

// avoid hard-coded separators
const filePath2 = `${process.cwd()}/config.toml`
```

### 4.2 Environment Detection

```typescript
const rgAvailable = (() => {
    const result = spawnSync('rg', ['--version'], { stdio: 'ignore' })
    return !result.error && result.status === 0
})()
```

### 4.3 Shell Command Execution

```typescript
spawn('bash', ['-lc', command], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
})
```

## 5. Release Workflow

### 5.1 CI/CD Flow

```yaml
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

### 5.2 Manual Release Steps

```bash
# 1) ensure everything passes
pnpm run ci

# 2) bump version
npm version patch  # or minor/major

# 3) build and publish
npm publish --access public
```

### 5.3 Post-release Validation

```bash
# 1) clear local cache
npm cache clean --force

# 2) global install test
npm install -g @memo-code/memo

# 3) runtime verification
memo --version
memo "test prompt"
```

## 6. Installation Modes

| Mode           | Command                          | Typical Use          |
| -------------- | -------------------------------- | -------------------- |
| Global install | `npm install -g @memo-code/memo` | daily usage          |
| pnpm global    | `pnpm add -g @memo-code/memo`    | pnpm users           |
| npx run        | `npx @memo-code/memo`            | temporary usage      |
| Local install  | `npm install @memo-code/memo`    | project-scoped usage |

## 7. Troubleshooting Design

### 7.1 Common Issues

| Issue                     | Cause                            | Fix                                      |
| ------------------------- | -------------------------------- | ---------------------------------------- |
| `command not found`       | global bin directory not in PATH | add `$(npm bin -g)` to PATH              |
| `prompt.md not found`     | resource file not copied         | ensure `files` includes `dist/prompt.md` |
| `ERR_MODULE_NOT_FOUND`    | path aliases unresolved          | ensure fully bundled build output        |
| Windows execution failure | PowerShell policy                | `Set-ExecutionPolicy RemoteSigned`       |

### 7.2 Debug Mode

```bash
# verbose logs
DEBUG=* memo

# check config
memo --config

# run diagnostics
memo --doctor
```

## 8. Security Considerations

### 8.1 Dependency Security

- lock dependency versions at build time
- run `npm audit` regularly
- avoid dynamic `require()` where possible

### 8.2 Runtime Security

- approve risky tools before execution (`exec_command`, `shell`, `apply_patch`)
- enforce path allowlists
- run external commands in controlled environments

## 9. Future Extensions

### 9.1 Possible Optimizations

- **Code splitting**: lazy-load large dependencies (for example tiktoken wasm)
- **Compression**: use Brotli to reduce package size further
- **Incremental updates**: support hot-update style mechanism

### 9.2 Platform-specific Improvements

- **macOS**: consider Notarization if distributing as an app
- **Windows**: provide PowerShell module
- **Linux**: provide snap/flatpak package

## 10. Summary

This design achieves efficient cross-platform distribution through:

1. **Single entry file**: all code bundled into `dist/index.js`
2. **Bundled resource**: `prompt.md` ships with package
3. **Minimal runtime requirement**: users only need Node.js
4. **Standard toolchain**: pnpm + tsup + vitest

Compared with binary distribution, NPM distribution gives better cross-platform compatibility and much smaller package size for Node.js-based CLI tools.
