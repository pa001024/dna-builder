# 代码风格细则

AGENTS.md 只留「必须当场遵守」的几条，这里是完整清单。

## Formatting (Biome)

- **Formatter**: Biome (`biome.json`) — NOT Prettier
- **Indentation**: 4 spaces (no tabs)
- **Line width**: 140 characters
- **Semicolons**: `asNeeded`（能省则省）
- **Quotes**: Double quotes
- **Trailing commas**: ES5 style
- **Arrow parens**: As needed（单参数省略括号）
- **Line endings**: LF
- **Imports**: 由 Biome assist 自动整理

## TypeScript Config

- **Strict mode**: `strict: true`
- **No unused locals/params**: 开启
- **Path alias**: `@/*` → `./src/*`
- **Target**: ESNext，bundler module resolution
- **JSX**: Preserve + Vue JSX import source
- **Decorators**: `experimentalDecorators` 开启

## Vue / TypeScript Conventions

**Imports**：具名导入；类型用 `type` 关键字单独导入。

```typescript
import { ref, computed } from "vue"
import { defineStore } from "pinia"
import type { SomeType } from "./types"
```

**Naming**：

- 组件：PascalCase（`Icon.vue`、`CharBuildView.vue`）
- 工具 / 组合式函数：camelCase（`useCharSettings`、`formatProp`）
- Store：`use` 前缀（`useGameStore`、`useUIStore`）
- 常量：UPPER_SNAKE_CASE（`GAME_PROCESS`）
- 类型 / 接口：PascalCase（`CharBuild`、`LeveledWeapon`）

**Vue**：

- 一律 `<script setup lang="ts">`
- 只用组合式 API（不用 Options API）
- 状态用 Pinia `defineStore()`
- `defineProps<>()` / `defineEmits<>()` 做类型安全
- 组件由 `unplugin-vue-components/vite` 自动导入

**错误处理**：

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

**注释**：复杂函数（>100 行）必须有中文注释（JSDoc 格式，1-3 行摘要）。
其余注释只写代码看不出的事（约束、口径、为什么这样写），不要复述代码在做什么。

## Rust (Tauri / MCP Server)

- 函数 snake_case、结构体 PascalCase、常量 UPPER_SNAKE_CASE
- Tauri 命令：`#[tauri::command]`，返回 `Result<T, String>`
- 错误处理：`Result<T, E>` + `?`
