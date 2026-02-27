# Stack Mapping
Last mapped against live repo files in `package.json`, `vite.config.ts`, `tsconfig.json`, `biome.json`, `server/package.json`, `src-tauri/Cargo.toml`, and `src/data/package.json`.

## Repository shape
- Frontend SPA/PWA code lives in `src/` with Vite entrypoints in `index.html` and `login_jjj.html` (`vite.config.ts`).
- Desktop shell is Tauri 2 in `src-tauri/` (`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
- Optional backend is Bun + Elysia in `server/` (`server/package.json`, `server/src/index.ts`).
- A publishable data package exists in `src/data/` as `dna-builder-data` (`src/data/package.json`).
- A publishable Windows CLI package exists in `packages/dob-script/` (`packages/dob-script/package.json`).
- Vendored packages are present under `externals/dna-api/` and `externals/graphql-mobius/` (`externals/dna-api/package.json`, `externals/graphql-mobius/package.json`).

## Languages and runtimes
- TypeScript/ESM is primary for app and server (`package.json` has `"type": "module"`, `server/package.json` has `"type": "module"`).
- Vue SFC + TS is primary UI language (`src/**/*.vue`, `tsconfig.json` includes Vue files).
- Rust (edition 2024) powers desktop backend (`src-tauri/Cargo.toml`).
- Bun runtime is used for server execution and tooling (`server/package.json` scripts, `tools/generateApiCalls.ts` shebang uses Bun).
- Node + pnpm are used for frontend dependency/build workflows (`package.json` scripts, `packageManager` in `package.json`).

## Frontend stack (`src/`)
- Framework: Vue 3 + Vue Router + Pinia (`package.json`, `src/main.ts`).
- Build tool: Vite 7 (`package.json`, `vite.config.ts`).
- Styling: Tailwind CSS v4 + daisyUI + reka-ui (`package.json`, `vite.config.ts`).
- State/data clients:
  - GraphQL client with `@urql/vue`, graphcache offline storage, and `graphql-ws` subscriptions (`src/api/graphql.ts`).
  - IndexedDB via Dexie (`src/store/db.ts`).
  - Local storage persistence via VueUse `useLocalStorage` (`src/store/setting.ts`, `src/store/user.ts`).
- i18n: `i18next` + `i18next-http-backend` + `i18next-vue` (`src/i18n.ts`, `src/main.ts`).
- AI SDKs: `openai`, `langchain`, MCP SDK usage in browser/client code (`src/api/openai.ts`, `src/api/buildAgent.ts`).
- Telemetry: Sentry Vue SDK initialized in production (`src/main.ts`).
- PWA: `vite-plugin-pwa` + Workbox runtime caching (`vite.config.ts`, `src/main.ts` service-worker registration).

## Desktop app stack (`src-tauri/`)
- Tauri 2 app config and bundling in `src-tauri/tauri.conf.json`.
- Rust crate `dna-builder` with `tauri` and multiple plugins (`src-tauri/Cargo.toml`).
- Major Rust runtime deps: `tokio`, `reqwest`, `tokio-tungstenite`, `opencv`, `boa_*`, `zip`, `sevenz-rust2` (`src-tauri/Cargo.toml`).
- Tauri command surface is implemented in `src-tauri/src/lib.rs` and consumed by `src/api/app.ts`.
- Updater artifacts are enabled; updater endpoints are configured in `src-tauri/tauri.conf.json`.
- Additional CLI target (`dob-script`) is built via feature/example (`src-tauri/Cargo.toml`, `src-tauri/examples/dob-script.rs`, root script `build:dob-script` in `package.json`).

## Server stack (`server/`)
- HTTP framework: Elysia (`server/package.json`, `server/src/index.ts`).
- API protocol: GraphQL Yoga over HTTP + WS at `/graphql` (`server/src/db/yoga.ts`).
- ORM + DB: Drizzle ORM on Bun SQLite, file DB `data.db` (`server/src/db/index.ts`, `server/src/db/migrate.ts`, `server/drizzle.config.ts`).
- Schema-first GraphQL modules under `server/src/db/mod/*.ts` (aggregated in `server/src/db/mod/index.ts`).
- Additional REST-style routes under `/api` and `/api/auth/dna` (`server/src/api.ts`, `server/src/api/dna-auth.ts`).
- AI proxy route under `/api/v1` (`server/src/ai.ts`).
- Optional bot integration plugin is loaded in main server app (`server/src/index.ts`, `server/src/bot/index.ts`).

## Data/MCP package stack (`src/data/`)
- Package `dna-builder-data` exports TS models and ships MCP stdio binary (`src/data/package.json`).
- MCP server implementation uses `@modelcontextprotocol/sdk`, `zod`, `fuse.js` (`src/data/mcp/index.ts`, `src/data/package.json`).
- Default online GraphQL endpoint is embedded in MCP code (`src/data/mcp/index.ts`).

## Tooling, linting, testing
- Formatter/linter baseline is Biome (`biome.json`, root scripts `lint`/`format` in `package.json`).
- Type-checking uses `vue-tsc` in frontend and `tsc --noEmit` in server (`package.json`, `server/package.json`).
- Unit tests:
  - Frontend/data: Vitest (`package.json`, `vitest.config.ts`, `src/data/package.json`).
  - Server: `bun test` (`server/package.json`).
- Git hooks via Husky run version update + formatting + staging (`.husky/pre-commit`).

## Key build/dev commands (from scripts/config)
- Frontend dev: `pnpm dev` (`package.json`) on port `1420` (`vite.config.ts`).
- Frontend build: `pnpm build` (`package.json`).
- Desktop dev/build: `pnpm tauri dev` / `pnpm tauri build` (`package.json`, `src-tauri/tauri.conf.json`).
- Server dev: `cd server && bun run dev` (`server/package.json`).
- Server migrations: `cd server && bun run gen` / `bun run mig` (`server/package.json`).
- Data package tests/build: `cd src/data && pnpm test` / `pnpm run build:mcp` (`src/data/package.json`).
