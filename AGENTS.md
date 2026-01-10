# AGENTS.md

This file provides guidelines for agentic coding assistants working on the dna-builder codebase.

## Build / Lint / Test Commands

### Frontend (Vue + TypeScript)

```bash
pnpm dev           # Development
pnpm build         # Build
pnpm lint          # Type checking with vue-tsc
pnpm test          # Run all tests
pnpm test path/to/test.test.ts  # Run single test file
pnpm coverage      # Run tests with coverage
pnpm format        # Format code with prettier
```

### Desktop App (Tauri + Rust)

```bash
pnpm tauri dev     # Development mode
pnpm tauri build   # Build desktop app
```

### Server (Bun + Elysia)

```bash
cd server && bun run dev        # Start development server
bun run gen        # Generate database migrations
bun run migrate    # Run migrations
```

### Rust (MCP Server)

```bash
cd mcp_server && cargo build --release
```

## i18n Workflow

**Tool**: `tools/i18n_tool.ts` - Manage i18n translations

### Export Missing Translations

When zh-CN has translations that are missing in other languages:

```bash
bun tools/i18n_tool.ts export
```

This creates `tools/i18n_diff.json` with structure:

```json
{
    "key.path": {
        "zh-CN": "原文",
        "en": "",
        "ja": "",
        "ko": "",
        "zh-TW": ""
    }
}
```

### Import Completed Translations

Fill in the missing translations in the diff file, then:

```bash
bun tools/i18n_tool.ts import
```

This merges translations back to language files and deletes the diff file.

**Important**:

- Only export translations where zh-CN has the value and other languages are missing
- The tool handles nested JSON structures automatically
- Always verify translations before importing

## Icon Management Workflow

**Tool**: `tools/icon_tool.ts` - 管理图标

```bash
bun tools/icon_tool.ts add <icon-name>     # 从 remixicon 添加图标
bun tools/icon_tool.ts check               # 检查使用情况
bun tools/icon_tool.ts clean               # 删除未使用的图标
bun tools/icon_tool.ts ignore <icon>       # 忽略特定图标
bun tools/icon_tool.ts unignore <icon>     # 取消忽略
bun tools/icon_tool.ts ignored              # 列出已忽略的图标
bun tools/icon_tool.ts list [pattern]       # 搜索可用图标
```

**示例**:

```bash
bun tools/icon_tool.ts add subtract-line    # 添加 ri:subtract-line
bun tools/icon_tool.ts list heart         # 搜索包含 heart 的图标
bun tools/icon_tool.ts ignore po-A         # 忽略 po-A 图标
```

**说明**:

- 图标存储在 `src/components/Icon.vue` 的 `data` 对象中
- Remixicon 图标使用 `ri:` 前缀
- 自动扫描 `.vue`, `.ts`, `.tsx` 文件中的图标使用
- 支持多种绑定模式（静态/动态/模板字符串/条件/类型注解）
- 扫描时自动排除 `Icon.vue` 本身
- clean 前建议先运行 check 确认

## GLM API Usage Query

**Tool**: `tools/query-usage.mjs` - 查询 GLM Coding Plan 使用量统计

### 查询使用量

查询智谱AI (GLM) API 和知识库的使用量信息：

```bash
# 方法 1: 直接指定 API Key
node tools/query-usage.mjs your_api_key_here

# 方法 2: 使用环境变量
export ZHIPU_API_KEY=your_api_key_here  # Linux/Mac
set ZHIPU_API_KEY=your_api_key_here     # Windows
node tools/query-usage.mjs

# 方法 3: 使用 .env 文件
# 在项目根目录创建 .env 文件并添加:
# ZHIPU_API_KEY=your_api_key_here
node tools/query-usage.mjs
```

**输出信息**:

- 📚 **知识库使用量**: 字数使用、存储使用及使用率
- 🔌 **API 使用量**: 尝试查询多个可能的端点

**说明**:

- 工具会自动尝试多个可能的 API 端点来获取使用量信息
- 智谱AI可能没有公开的通用使用量查询 API，工具会提示访问控制台查看
- 控制台地址: https://open.bigmodel.cn/usercenter/billing

## Code Style Guidelines

### Formatting

- **Indentation**: 4 spaces (no tabs)
- **Semicolons**: Omitted
- **Print width**: 140 characters
- **Quotes**: Double quotes preferred

### Vue / TypeScript

**Imports**: Use named imports, import types with `type` keyword

```typescript
import { ref, computed } from "vue"
import { defineStore } from "pinia"
import type { SomeType } from "./types"
```

**Naming Conventions**:

- Components: PascalCase (e.g., `Icon.vue`, `CharBuildView.vue`)
- Utilities/Composables: camelCase (e.g., `useCharSettings`, `formatProp`)
- Stores: camelCase with `use` prefix (e.g., `useGameStore`, `useUIStore`)
- Constants: UPPER_SNAKE_CASE (e.g., `GAME_PROCESS`)
- Types/Interfaces: PascalCase (e.g., `CharBuild`, `LeveledWeapon`)

**Vue Specifics**: Use `<script setup lang="ts">` for Vue 3 components, prefer Composition API over Options API, use Pinia for state management with `defineStore()`, use `defineProps<>()` and `defineEmits<>()` for type-safe props/emits

**Error Handling**:

```typescript
async function someAsync() {
    try {
        const result = await apiCall()
        return result
    } catch (error) {
        console.error("Operation failed", error)
        return null
    }
}
```

### Rust (Tauri / MCP Server)

**Naming Conventions**:

- Functions: snake_case (e.g., `import_mod`, `get_game_install`)
- Structs: PascalCase (e.g., `Particle`, `AppHandle`)
- Constants: UPPER_SNAKE_CASE (e.g., `GAME_PROCESS`)

**Commands**: Use `#[tauri::command]` attribute, return `Result<T, String>`

```rust
#[tauri::command]
async fn my_command(param: String) -> Result<String, String> {
    Ok("success".to_string())
}
```

**Error Handling**: Use `Result<T, E>` with `?` operator, prefer `eprintln!` for errors

### Server (Bun + Elysia)

**Patterns**: Create Elysia app, use plugins, listen on port (default: 8887)

```typescript
const app = new Elysia()
    .get("/", () => Bun.file("../dist/index.html"))
    .use(cors())
    .use(yogaPlugin())

app.listen(8887)
```

## Testing Guidelines

**Framework**: Vitest

**Test file location**: `src/data/tests/` or alongside source files

**Naming**: `*.test.ts`

**Basic structure**:

```typescript
import { describe, it, expect } from "vitest"

describe("Feature", () => {
    it("should do something", () => {
        const result = functionUnderTest()
        expect(result).toBe(expected)
    })
})
```

**Coverage thresholds**: Lines: 80%, Functions: 80%, Branches: 70%, Statements: 80%

## Project Structure

```
src/
├── components/      # Vue components
├── data/           # Game data and calculations (tests in data/tests/)
├── store/          # Pinia stores
├── views/          # Page components
├── api/            # API calls
└── utils/          # Utility functions
server/
└── src/            # Backend code
src-tauri/
└── src/            # Rust backend code
mcp_server/
└── src/            # MCP server Rust code
```

## Key Technologies

- **Frontend**: Vue 3, TypeScript, Tailwind CSS, daisyUI, Radix Vue
- **State**: Pinia
- **Routing**: Vue Router
- **i18n**: i18next
- **Desktop**: Tauri 2 (Rust + WebView2)
- **Server**: Bun + Elysia + Drizzle ORM + GraphQL
- **Testing**: Vitest
- **Build**: Vite

## Important Notes

- **CHINESE COMMENTS** needs for every function or complex logic, no need for simple code lines
- **JSDOC**: Use JSDoc for function documentation, including parameters, return values, and exceptions
- Chinese is acceptable in comments and strings (Chinese project)
- Use `@ts-ignore` sparingly and with justification
- Always run `pnpm lint` after changes to ensure type safety
- Always run `pnpm test` to ensure tests pass
- Prefer native APIs over libraries when possible
- Follow existing patterns in the codebase
- Use `unplugin-vue-components/vite` for automatic component imports
- Use `bun -e "code"` for inline code execution
- When you start a complex task, first use git add to add it to the staging area. Then you can use checkout to revert incorrect changes; otherwise, using git checkout or rm to delete unstaged files is not allowed.
