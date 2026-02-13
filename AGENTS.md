# AGENTS.md

Guidelines for agentic coding assistants working on the dna-builder codebase.

## Build / Lint / Test Commands

### Frontend (Vue + TypeScript)

```bash
pnpm dev                              # Development server (http://localhost:1420/)
pnpm build                            # Production build
pnpm lint                             # Biome lint --fix + vue-tsc type checking
pnpm test                             # Run all tests (vitest run)
pnpm test src/data/tests/foo.test.ts  # Run single test file
pnpm coverage                         # Tests with coverage
pnpm format                           # Format with Biome
```

### Desktop App (Tauri + Rust)

```bash
pnpm tauri dev     # Development mode
pnpm tauri build   # Build desktop app
```

### Server (Bun + Elysia)

```bash
cd server && bun run dev   # Start dev server (port 8887)
bun run gen                # Generate database migrations
bun run migrate            # Run migrations
```

### Rust (MCP Server)

```bash
cd mcp_server && cargo build --release
```

## Code Style Guidelines

### Formatting (Biome)

- **Formatter**: Biome (`biome.json`) — NOT Prettier
- **Indentation**: 4 spaces (no tabs)
- **Line width**: 140 characters
- **Semicolons**: `asNeeded` (omit when possible)
- **Quotes**: Double quotes
- **Trailing commas**: ES5 style
- **Arrow parens**: As needed (omit for single param)
- **Line endings**: LF
- **Imports**: Auto-organized by Biome assist

### TypeScript Config

- **Strict mode**: Enabled (`strict: true`)
- **No unused locals/params**: Enforced
- **Path alias**: `@/*` → `./src/*`
- **Target**: ESNext, bundler module resolution
- **JSX**: Preserve with Vue JSX import source
- **Decorators**: `experimentalDecorators` enabled

### Vue / TypeScript Conventions

**Imports**: Named imports, type-only imports with `type` keyword

```typescript
import { ref, computed } from "vue"
import { defineStore } from "pinia"
import type { SomeType } from "./types"
```

**Naming**:

- Components: PascalCase (`Icon.vue`, `CharBuildView.vue`)
- Utilities/Composables: camelCase (`useCharSettings`, `formatProp`)
- Stores: `use` prefix (`useGameStore`, `useUIStore`)
- Constants: UPPER_SNAKE_CASE (`GAME_PROCESS`)
- Types/Interfaces: PascalCase (`CharBuild`, `LeveledWeapon`)

**Vue Specifics**:

- `<script setup lang="ts">` for all components
- Composition API only (no Options API)
- Pinia with `defineStore()` for state
- `defineProps<>()` and `defineEmits<>()` for type-safe props/emits
- Auto component imports via `unplugin-vue-components/vite`

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

- Functions: snake_case, Structs: PascalCase, Constants: UPPER_SNAKE_CASE
- Tauri commands: `#[tauri::command]`, return `Result<T, String>`
- Error handling: `Result<T, E>` with `?` operator

## Testing Guidelines

- **Framework**: Vitest
- **Location**: `src/data/tests/` or alongside source files
- **Naming**: `*.test.ts`
- **Excludes**: `server/**`, `externals/**`
- **Coverage thresholds**: Lines 80%, Functions 80%, Branches 70%, Statements 80%

```typescript
import { describe, it, expect } from "vitest"

describe("Feature", () => {
    it("should do something", () => {
        expect(functionUnderTest()).toBe(expected)
    })
})
```

## Project Structure

```
src/
├── components/      # Vue components
├── data/            # Game data and calculations (tests in data/tests/)
├── store/           # Pinia stores
├── views/           # Page components
├── api/             # API calls
├── utils/           # Utility functions
└── router.ts        # Route config
server/              # Bun + Elysia backend
src-tauri/           # Tauri Rust backend
mcp_server/          # MCP server (Rust)
tools/               # Dev tools (i18n_tool.ts, icon_tool.ts)
externals/dna-api/   # DNA API package
public/i18n/         # Translation files
```

## Key Technologies

- **Frontend**: Vue 3, TypeScript, Tailwind CSS v4, daisyUI v5, reka-ui
- **State**: Pinia v3
- **Routing**: Vue Router
- **i18n**: i18next
- **Desktop**: Tauri 2 (Rust + WebView2)
- **Server**: Bun + Elysia + Drizzle ORM + GraphQL (graphql-yoga)
- **Testing**: Vitest
- **Build**: Vite v7
- **Linting/Formatting**: Biome

## Dev Tools

- **i18n**: `bun tools/i18n_tool.ts export|import` — export missing translations, import completed ones
- **Icons**: `bun tools/icon_tool.ts add|check|clean|list` — manage icons in `src/components/Icon.vue`
- **API gen**: `pnpm gen` — generate API calls from tools/generateApiCalls.ts

## Git Hooks (Husky)

Pre-commit hook auto-runs: version bump → `biome format` → `git add .`

**Warning**: The pre-commit hook runs `git add .` — all files in working directory get staged.

## Serena Toolchain (Tooling Requirements)

**High-level rule:** Use Serena helpers for code navigation and edits when available.
* **Activate project**: Call `serena__activate_project` at session start to set context.
* **Search & edit via helpers**: Use `find_symbol`, `search_for_pattern`, `apply_patch`, `replace_symbol_body`, etc.
* **Thinking guards**: Invoke `think_about_task_adherence` and `think_about_whether_you_are_done` before and after major steps.
* **Restart LSP**: Run `restart_language_server` if external edits appear or LSP state drifts.

**Typical sequence**:

1. `serena__activate_project`
2. `search_for_pattern(“pattern”)`
3. `find_symbol(“Name”)`
4. `apply_patch(…)`
5. `summarize_changes` and open PR

**Do not** edit files directly outside of Serena unless absolutely necessary — document reasons and restart the language server afterward.

## Context7 (Library resolution & docs)

* Resolve library identifiers: `context7__resolve-library-id(“”)`.
* Fetch docs: `context7__get-library-docs()`.
* Include resolved IDs and versions when justifying API choices in PRs.

## Important Rules

1. **DO NOT RUN `pnpm dev` or `pnpm build`** — view http://localhost:1420/ directly in browser
2. **CHINESE COMMENTS**: Required for every function and complex logic block (JSDoc format)
3. **JSDoc**: Use for function documentation including params, return values, exceptions
4. **No shortcuts**: Never remove functions, skip processing, or use TODO placeholders instead of real code
5. **Consistency**: Check sibling files before writing to match existing patterns
6. **Always verify**: Run `pnpm lint` and `pnpm test` after changes
7. **Git workflow**: For complex tasks, `git add` to staging first so you can `git checkout` to revert mistakes
8. **Prefer native APIs** over adding new library dependencies
9. **Use `bun -e "code"`** for inline code execution
