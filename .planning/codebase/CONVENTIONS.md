# CONVENTIONS

## Scope
- This map is based on direct repo evidence from `biome.json`, `tsconfig.json`, `vite.config.ts`, `src/main.ts`, `src/router.ts`, `src/store/*.ts`, `src/components/*.vue`, `src-tauri/src/lib.rs`, `.husky/pre-commit`, and `AGENTS.md`.

## Formatting and linting baseline
- Frontend formatting is Biome-first, with 4-space indentation, LF endings, 140 char line width, double quotes, ES5 trailing commas, and semicolons `asNeeded` in `biome.json`.
- Imports are auto-organized via Biome assist (`organizeImports`) in `biome.json`.
- Linting is enforced through `biome lint --fix && vue-tsc --noEmit` in `package.json` under `scripts.lint`.
- Formatting command is centralized at `biome format --write` in `package.json` under `scripts.format`.

## TypeScript and module conventions
- TypeScript strict mode is enabled in `tsconfig.json` via `strict`, `noUnusedLocals`, and `noUnusedParameters`.
- Module resolution is `bundler` with modern target `ESNext` in `tsconfig.json`.
- Path alias `@/* -> ./src/*` is defined in `tsconfig.json` and mirrored in Vite alias config in `vite.config.ts`.
- Vue JSX settings (`jsx: preserve`, `jsxImportSource: vue`) are configured in `tsconfig.json`.

## Vue architecture and component patterns
- Components overwhelmingly use `<script setup lang="ts">` (e.g., `src/App.vue`, `src/components/Icon.vue`, `src/views/CharBuildView.vue`).
- Typed props/emits with Composition API macros are common (`defineProps`, `defineEmits`) in files like `src/components/AutoBuild.vue`, `src/components/CodeEditor.vue`, and `src/components/WeaponTab.vue`.
- Component file naming is PascalCase in `src/components` (e.g., `src/components/CharSkillShow.vue`, `src/components/DBQuestStoryNodes.vue`).
- App wiring uses plugin chaining (`Pinia`, `i18next-vue`, router) in `src/main.ts`.

## State and routing conventions
- State is organized by Pinia stores under `src/store` with `useXxxStore` naming, e.g., `useGameStore` in `src/store/game.ts`, `useUIStore` in `src/store/ui.ts`, `useNodeEditorStore` in `src/store/nodeEditor.ts`.
- Both options-style and setup-style `defineStore` patterns coexist (`src/store/game.ts` vs `src/store/nodeEditor.ts`).
- Routing is centralized and typed in `src/router.ts` with `RouteRecordRaw[]`.
- Route-level code splitting via lazy imports is standard in `src/router.ts` (`component: () => import(...)` across many views).
- Runtime history mode switches by environment in `src/router.ts` (`createWebHashHistory` in app, `createWebHistory` in web).

## Error handling conventions
- Try/catch with `console.error` logging is the dominant frontend pattern, seen in `src/api/openai.ts`, `src/components/GameUpdate.vue`, `src/views/ScriptListView.vue`, and `src/data/CharBuild.ts`.
- Error messages are usually contextual and human-readable (often Chinese) in `src/components/TodoList.vue`, `src/api/dna-sign.ts`, and `src/views/GameLauncher.vue`.
- In many UI flows, failures are logged and execution continues/falls back rather than throwing to top-level handlers (`src/components/AIChatDialog.vue`, `src/components/ActivityCalendar.vue`).

## Rust/Tauri backend conventions
- Tauri command surface is extensive and explicit via `#[tauri::command]` in `src-tauri/src/lib.rs`.
- Rust command return style frequently uses `Result<T, String>` in `src-tauri/src/lib.rs` (`start_heartbeat`, `download_file`, `run_script`, etc.).
- Rust naming follows snake_case function style in `src-tauri/src/lib.rs` and `src-tauri/src/main.rs`.

## Process and repo policy conventions
- Pre-commit hook updates versions, formats code, and then stages broadly (`git add .`) in `.husky/pre-commit`.
- Project policy requires Chinese JSDoc-style comments for functions/complex blocks and post-change verification in `AGENTS.md`.
- Project policy also states not to run `pnpm dev` or `pnpm build` during agent tasks in `AGENTS.md`.

## Practical implications for contributors
- Treat Biome and TypeScript strict settings as non-optional baseline gates (`biome.json`, `tsconfig.json`, `package.json`).
- Follow existing Composition API and typed macro style for new Vue code (`src/components/*.vue`, `src/views/*.vue`).
- Keep new stores aligned with `useXxxStore` naming and colocated under `src/store`.
- Preserve try/catch + contextual logging style for async/network/file operations (`src/api/*`, `src/components/*`, `src/views/*`).
- Account for pre-commit broad staging behavior before committing (`.husky/pre-commit`).
