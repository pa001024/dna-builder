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

## Code Style Guidelines

### Formatting

- **Indentation**: 4 spaces (no tabs)
- **Semicolons**: Omitted
- **Print width**: 140 characters
- **Quotes**: Double quotes preferred
- **Always run `pnpm format`** before committing

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
- Chinese is acceptable in comments and strings (Chinese project)
- Use `@ts-ignore` sparingly and with justification
- Always run `pnpm lint` after changes to ensure type safety
- Always run `pnpm test` to ensure tests pass
- Prefer native APIs over libraries when possible
- Follow existing patterns in the codebase
- Use `unplugin-vue-components/vite` for automatic component imports
