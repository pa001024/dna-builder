# DNA Builder Structure Map

## Root Layout
- Frontend app source lives in `src/` with feature-heavy Vue route files in `src/views/` and reusable UI in `src/components/`.
- Backend service lives in `server/` with runtime code in `server/src/`, migrations in `server/drizzle/`, and local DB file `server/data.db`.
- Desktop/native code lives in `src-tauri/` with Rust sources in `src-tauri/src/` and Tauri config in `src-tauri/tauri.conf.json`.
- Public static assets live in `public/` including i18n files in `public/i18n/` and template assets in `public/tpl/`.
- Automation and generation tools live in `tools/` such as `tools/generateApiCalls.ts`, `tools/i18n_tool.ts`, and `tools/icon_tool.ts`.
- Additional package workspace content exists in `packages/dob-script/`.

## Frontend Placement Conventions (`src/`)
- Bootstrapping files are at root: `src/main.ts`, `src/login.ts`, `src/App.vue`, `src/router.ts`, `src/i18n.ts`.
- HTTP/GraphQL/native client wrappers are grouped under `src/api/` (`src/api/graphql.ts`, `src/api/app.ts`, `src/api/query.ts`, `src/api/mutation.ts`).
- Generated API contracts are isolated in `src/api/gen/` (`api-types.ts`, `api-queries.ts`, `api-mutations.ts`).
- State management is centralized in `src/store/` with one concern per file (`game.ts`, `ui.ts`, `user.ts`, `scriptRuntime.ts`).
- Domain logic and calculations are in `src/data/` (`CharBuild.ts`, `LevelUpCalculator.ts`, `ast.ts`, `data-types.ts`).
- Domain tests are colocated under `src/data/tests/` (`CharBuild.test.ts`, `LevelUpCalculator.test.ts`, etc.).
- Composables and utility helpers are separated into `src/composables/` and `src/utils/`.
- Feature pages use PascalCase Vue SFC naming in `src/views/` (for example `GuideListView.vue`, `DBCharDetailView.vue`, `DNAHomeView.vue`).

## Backend Placement Conventions (`server/src/`)
- Main server composition lives in `server/src/index.ts`.
- REST-style plugins are grouped in `server/src/api.ts` and `server/src/api/dna-auth.ts`.
- AI-related endpoints are isolated in `server/src/ai.ts`.
- Bot integration is isolated in `server/src/bot/index.ts` plus subcommands under `server/src/bot/commands/`.
- Database bootstrap and exports are in `server/src/db/index.ts`; schema and migration logic are in `server/src/db/schema.ts` and `server/src/db/migrate.ts`.
- GraphQL server adapter is in `server/src/db/yoga.ts`.
- GraphQL business domains are split by module in `server/src/db/mod/*.ts` (`guide.ts`, `build.ts`, `todo.ts`, `user.ts`, `room.ts`, etc.).
- Real-time/pubsub utilities are in `server/src/rt/pubsub.ts`.

## Native/Desktop Placement Conventions (`src-tauri/`)
- Rust entrypoint is `src-tauri/src/main.rs`; application wiring is in `src-tauri/src/lib.rs`.
- Cross-cutting Rust helpers are in `src-tauri/src/util.rs`.
- Auxiliary binaries/scripts live under `src-tauri/src/bin/` and examples under `src-tauri/examples/`.
- Build-time config and metadata are in `src-tauri/Cargo.toml`, `src-tauri/build.rs`, and `src-tauri/tauri.conf.json`.
- Native capabilities/plugins are declared in `src-tauri/src/lib.rs` (`tauri_plugin_http`, `tauri_plugin_updater`, `tauri_plugin_window_state`, etc.).

## Config and Tooling Locations
- Workspace scripts and dependency graph start in root `package.json`.
- TS compiler behavior and aliasing (`@/*` to `src/*`) are in `tsconfig.json`.
- Build config is in `vite.config.ts`; test runner config is in `vitest.config.ts`.
- Formatting/linting policy is in `biome.json`.
- Git hooks are in `.husky/`.
- CI/repo automation lives in `.github/`.

## Naming and Organization Patterns (Observed)
- Vue route and screen components use `PascalCase` file names in `src/views/`.
- Reusable component primitives also use `PascalCase` names in `src/components/`.
- Store modules use lowercase/camel file names by concern in `src/store/` and export `use...Store` from inside each file.
- Backend database modules map roughly to domain nouns in `server/src/db/mod/` (`activity.ts`, `message.ts`, `timeline.ts`).
- API code distinguishes handcrafted files (`src/api/graphql.ts`, `src/api/openai.ts`) from generated files (`src/api/gen/*`).

## Current Structural Notes
- `.planning/codebase/` was empty before this mapping pass and is now populated by architecture/structure docs.
- The repository contains a TypeScript MCP implementation at `src/data/mcp/index.ts`.
- A top-level `mcp_server/` directory is not currently present, despite references in `AGENTS.md`.
