# Style and Conventions
- Formatter/linter: Biome (`biome.json`), 4-space indent, max width 140, double quotes, semicolons as needed, LF endings.
- TypeScript: strict mode enabled, no unused locals/params, `@/*` alias to `src/*`.
- Vue style: `<script setup lang="ts">`, Composition API only, Pinia stores with `defineStore`.
- Naming: components/types PascalCase, utilities camelCase, stores `useXxx`, constants UPPER_SNAKE_CASE.
- Imports: prefer named imports; use `import type` for type-only imports.
- Rust style: snake_case for functions, PascalCase for structs, UPPER_SNAKE_CASE for constants; Tauri commands return `Result<T, String>`.
- Project-specific rule from AGENTS: Chinese JSDoc comments are required for functions and complex logic blocks.