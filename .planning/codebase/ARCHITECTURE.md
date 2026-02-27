# DNA Builder Architecture Map

## System Shape
- The repository is a multi-runtime monorepo with a Vue desktop/web client in `src/`, a Bun/Elysia server in `server/src/`, and a Rust Tauri native layer in `src-tauri/src/`.
- The frontend bootstraps from `src/main.ts` (main app shell) and `src/login.ts` (DNA login shell), with route composition centralized in `src/router.ts`.
- The backend entrypoint is `server/src/index.ts`, which composes plugins from `server/src/api.ts`, `server/src/api/dna-auth.ts`, `server/src/ai.ts`, `server/src/db/yoga.ts`, and `server/src/bot/index.ts`.
- Desktop-native behavior is exposed through many Tauri commands in `src-tauri/src/lib.rs`, started by `src-tauri/src/main.rs`.

## Runtime Entry Points
- Web/Desktop UI entry: `src/main.ts` with `createApp(App)`, `createPinia()`, `I18NextVue`, and `router`.
- Auth-only UI entry: `src/login.ts` with `createApp(App)` mounting `src/views/DNALogin.vue`.
- Router entry: `src/router.ts` uses `createRouter(...)` and switches history mode via `env.isApp ? createWebHashHistory() : createWebHistory()`.
- HTTP/GraphQL server entry: `server/src/index.ts` creates `new Elysia()` and listens on `8887`.
- Native runtime entry: `src-tauri/src/main.rs` calls into `src-tauri/src/lib.rs` where `pub fn run()` configures plugins and `invoke_handler(...)`.
- Data MCP-style CLI entry: `src/data/mcp/index.ts` runs on stdio and consumes a configurable GraphQL endpoint.

## Layered Design
- Presentation layer: view routes in `src/views/*.vue` and reusable widgets in `src/components/*.vue`.
- State layer: Pinia stores in `src/store/game.ts`, `src/store/ui.ts`, `src/store/user.ts`, `src/store/scriptRuntime.ts`, etc.
- Client integration layer: GraphQL and HTTP clients in `src/api/graphql.ts`, `src/api/query.ts`, `src/api/mutation.ts`, and native bridge wrappers in `src/api/app.ts`.
- Client contract layer: generated API artifacts in `src/api/gen/api-types.ts`, `src/api/gen/api-queries.ts`, and `src/api/gen/api-mutations.ts`.
- Domain/data layer: gameplay and calculation logic under `src/data/` (for example `src/data/CharBuild.ts`, `src/data/LevelUpCalculator.ts`, `src/data/ast.ts`).
- Server transport layer: Elysia route plugins in `server/src/api.ts`, `server/src/api/dna-auth.ts`, and `server/src/ai.ts`.
- Server data-access layer: Drizzle/Bun SQLite setup in `server/src/db/index.ts` and schema in `server/src/db/schema.ts`.
- Server GraphQL layer: Yoga setup in `server/src/db/yoga.ts` and resolver modules in `server/src/db/mod/*.ts`.
- Native OS/service layer: command and platform operations in `src-tauri/src/lib.rs` and helpers in `src-tauri/src/util.rs`.

## Key Data and Control Flows
- App boot flow: `src/main.ts` wires plugins, loads i18n from `src/i18n.ts`, installs router from `src/router.ts`, then mounts `#app`.
- Route/window flow: each route in `src/router.ts` uses `beforeEnter` + `setMinSize(...)` to coordinate UI navigation with desktop window sizing.
- GraphQL query/mutation flow: Vue view/component calls in files like `src/views/ChatRoom.vue` and `src/components/TodoList.vue` consume operations from `src/api/graphql.ts`.
- GraphQL server flow: `server/src/index.ts` mounts `yogaPlugin()` from `server/src/db/yoga.ts`, exposing HTTP and WS on `/graphql`.
- DB flow: resolver modules in `server/src/db/mod/*.ts` use table definitions from `server/src/db/schema.ts` through `db` from `server/src/db/index.ts`.
- REST flow: upload/download/auth endpoints are served via `server/src/api.ts` and `server/src/api/dna-auth.ts`; UI sends requests from files like `src/views/GuideEditView.vue`.
- Native invoke flow: frontend wrapper functions in `src/api/app.ts` call `invoke(...)` for commands such as `apply_material` implemented in `src-tauri/src/lib.rs`.
- Event flow: frontend listens to Tauri events in `src/store/scriptRuntime.ts`, `src/utils/game-download.ts`, and `src/components/GameUpdate.vue`; backend GraphQL pub/sub is in `server/src/rt/pubsub.ts`.

## Main Abstractions
- API façade abstraction: `src/api/combined/index.ts` consolidates generated and handcrafted API modules.
- Store façade abstraction: domain state is segmented by concern (`game`, `ui`, `user`, `script-runtime`) in separate files under `src/store/`.
- Resolver modularization abstraction: each business area has its own resolver module (`server/src/db/mod/guide.ts`, `server/src/db/mod/build.ts`, `server/src/db/mod/todo.ts`, etc.).
- Native capability abstraction: Tauri commands in `src-tauri/src/lib.rs` isolate filesystem/process/network/system operations from Vue code.
- Config boundary abstraction: build/runtime config lives in `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `biome.json`, and `src-tauri/tauri.conf.json`.

## Architecture Notes and Constraints
- Server persistence is local SQLite (`data.db`) via Bun + Drizzle per `server/src/db/index.ts` and `server/src/db/migrate.ts`.
- GraphQL authentication uses JWT logic in `server/src/db/yoga.ts` (`jwtToken`, `jwt.verify(...)`) and is reused by modules like `server/src/api/dna-auth.ts`.
- The repository includes a data MCP implementation in TypeScript at `src/data/mcp/index.ts`; no `mcp_server/` directory is currently present at root.
- Frontend codebase is broad and route-heavy (many DB/DNA views in `src/views/`), so store/API boundaries are critical for maintainability.
