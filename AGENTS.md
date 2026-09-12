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
tools/               # Dev tools (i18n-tool.ts, icon-tool.ts)
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

- **i18n**: `bun tools/i18n-tool.ts export|import` — export missing translations, import completed ones
- **Icons**: `bun tools/icon-tool.ts add|check|clean|list` — manage icons in `src/components/Icon.vue` use when lint error on icon not found
- **API gen**: `pnpm gen` — generate API calls from tools/generate-api-calls.ts
- **Title frames**: `pnpm itf` (`bun tools/import-title-frame.ts`) — regenerate 称号框 render data by
  reading the game pak through fmodel-cli; outputs `src/data/generated/title-frame.generated.ts`,
  `src/data/generated/title-frame-textures.json`（webp 文件名 → 游戏内包路径的清单）and
  `public/imgs/titleframe/*.webp`. Preview any frame with `tools/title-frame-preview.html` on the dev
  server (`?frames=07_1,09_1` to narrow down).
  - 称号框贴图遇到同名冲突会改写成带父目录前缀的名字（如 `13_T_PersonalInfo_Title_13_08.webp`），
    basename 与源 PNG 对不上；`tools/webp-import.ts` 读上面那份清单，按包路径把它们补齐，
    所以 `bun tools/webp-import.ts` 也能覆盖这些贴图，不会再把它们报成缺失。
- **Attribute i18n**: `pnpm iattr` (`bun tools/import-attr-i18n.ts`) — 把上游
  `out/AttrConfig.json` + `out/TextMap_I18n.json` 里的属性名（`Attr_*_Name`，如 `Attr_ATK_Fire_Name`）
  与属性说明（`ATTR_DESC_*`，如 `ATTR_DESC_ATK_Fire`）导入 `public/i18n/*/translation.json`。
  属性名补进根命名空间，只补缺失键、不覆盖已有译文；属性说明写入 `attrDesc` 命名空间。
  键均为属性在 zh-CN 下的展示名（攻击行按元素/伤害类型区分，如 `火属性攻击`、`切割攻击`），
  读取入口为 `src/composables/useAttrI18n.ts`，展示在角色属性面板（`CharAttrShow.vue`）、武器面板
  （`WeaponTab.vue`）的属性来源 tooltip 标题与说明里。上游目录默认取同级 `DuetNightAbyssData2`，
  缺失时回退 `D:/dev/DuetNightAbyssData2`，可用 `--upstream <dir>` 或 `DNA_UPSTREAM` 覆盖，
  `--check` 只比对不落盘。

## Git Hooks (Husky)

Pre-commit hook auto-runs: version bump → `biome format` → `git add .`

**Warning**: The pre-commit hook runs `git add .` — all files in working directory get staged.

## Important Rules

<system_rules>

1. **DO NOT RUN `pnpm dev` or `pnpm build`** — view http://localhost:1420/ directly in browser
2. **CHINESE COMMENTS**: Required for every function and complex logic block (JSDoc format)
3. **JSDoc**: Use for function documentation including params, return values, exceptions
4. **No shortcuts**: Never remove functions, skip processing, or use TODO placeholders instead of real code
5. **Consistency**: Check sibling files before writing to match existing patterns
6. **Always verify**: Run `pnpm lint` and `pnpm test` after frontend changes / `cargo check` after backend changes
7. **Git workflow**: For complex tasks, `git add` to staging first so you can `git checkout` to revert mistakes
8. **Prefer native APIs** over adding new library dependencies
9. **Use `bun -e "code"`** for inline code execution
10. Sensitive operations, such as generating migrations via `bun run gen`, must be confirmed by the user.
11. put all temporary files in `.tmp` directory
12. **Don't touch git**: Never use git for test, like add, stash, commit, push, pull, merge, rebase, cherry-pick, etc.

</system_rules>
