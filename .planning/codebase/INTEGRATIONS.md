# Integrations Mapping
Scope mapped from runtime and config evidence in `src/`, `server/`, `src-tauri/`, `externals/dna-api/`, and deployment/config files.

## Inbound interfaces (what this system exposes)
- GraphQL HTTP + WebSocket endpoint at `/graphql` from backend (`server/src/db/yoga.ts`, `server/src/index.ts`).
- REST-style API routes under `/api/*` including image upload and desktop installer redirect (`server/src/api.ts`).
- AI proxy endpoints under `/api/v1/*` (`server/src/ai.ts`).
- DNA QR auth endpoints under `/api/auth/dna/*` (`server/src/api/dna-auth.ts`).
- QQ bot auxiliary endpoint `/api/css` (`server/src/bot/index.ts`).
- Server listen port is `8887` (`server/src/index.ts`, `server/docker-compose.yml`).

## External APIs and services
- **DNA Builder public API host**: frontend points GraphQL/API to `https://api.dna-builder.cn` (`src/env.ts`, `src/api/graphql.ts`).
- **OpenAI-compatible LLM provider (Zhipu/BigModel)**:
  - Frontend default base URL `https://open.bigmodel.cn/api/paas/v4/` (`src/api/openai.ts`, `src/store/setting.ts`).
  - Backend AI proxy forwards to `AI_BASE_URL` (`server/src/ai.ts`, `server/.env.example`).
- **MCP service (local HTTP)**:
  - Browser AI client connects to local MCP server URL/port (`src/api/openai.ts` default `http://127.0.0.1:28080`).
  - Data package also runs as stdio MCP (`src/data/mcp/index.ts`, `src/data/package.json`).
- **Aliyun OSS + CDN**:
  - Upload and public URL generation in backend (`server/src/upload.ts`, `server/src/api.ts`).
  - Deployment uploads MSI and `latest.json` to OSS (`server/deploy.ts`).
  - Secrets/targets from env (`server/.env.example`).
- **SMTP email provider**: password-reset email via Nodemailer transporter (`server/src/util/email.ts`, `server/.env.example`).
- **Sentry telemetry ingestion**: frontend DSN to `*.ingest.us.sentry.io` (`src/main.ts`).
- **Tauri updater sources**:
  - CDN endpoint `https://cdn.dna-builder.cn/latest.json`.
  - GitHub release endpoint fallback.
  - Both configured in `src-tauri/tauri.conf.json`.
- **QQ official bot platform**: bot websocket/event client via `qq-official-bot` (`server/src/bot/index.ts`).
- **Game/community upstream APIs via `dna-api` package**:
  - Base URLs include `https://dnabbs-api.yingxiong.com/`, `https://lunoloft-api.yingxiong.com/`, and `https://kf.yingxiong.com/` (`externals/dna-api/src/modules/base.ts`).
  - Additional auth/social endpoints include `graph.facebook.com` and `api.twitter.com` in SDK module code (`externals/dna-api/src/modules/user.ts`).
- **Herobox image host requirement**: DNA auth verify only accepts URLs starting with `https://herobox-img.yingxiong.com/` (`server/src/api/dna-auth.ts`).
- **OCR model CDN**: desktop OCR bootstrap downloads models from `https://cdn.dna-builder.cn/ocr` (`src-tauri/src/submodules/ocr.rs`).

## Database and local storage
- **Server DB**: SQLite file `data.db` through Bun SQLite + Drizzle (`server/src/db/index.ts`, `server/src/db/migrate.ts`, `server/drizzle.config.ts`).
- **Server schema/migrations**: Drizzle schema and migration folder usage (`server/src/db/schema.ts`, `server/src/db/migrate.ts`, `server/package.json` scripts).
- **Frontend IndexedDB**:
  - URQL graph cache persistence DB `graphcache-v3` (`src/api/graphql.ts`).
  - App data DB `dna` via Dexie (`src/store/db.ts`).
- **Frontend localStorage**:
  - JWT and UI/user settings (`src/store/user.ts`, `src/store/setting.ts`, `src/main.ts`).
  - Includes AI API key and base URL persistence (`src/store/setting.ts`).
- **Desktop filesystem boundary**:
  - Tauri exposes file read/write/export/delete/rename/watch commands (`src-tauri/src/lib.rs`, `src/api/app.ts`).

## AuthN/AuthZ and secret boundaries
- JWT-based app auth:
  - Tokens are signed/verified server-side (`server/src/db/mod/user.ts`, `server/src/db/yoga.ts`).
  - Client sends JWT in GraphQL headers and WS connection params (`src/api/graphql.ts`).
- Role-based authorization:
  - Admin-only resolvers enforced in server GraphQL modules (`server/src/db/mod/user.ts`, `server/src/db/mod/activity.ts`).
- Service token boundary:
  - Ingestion mutations require `API_TOKEN` (`server/src/db/mod/missionsIngame.ts`, `server/src/db/mod/activity.ts`).
- DNA QR auth flow:
  - Ephemeral session table + steganographic image challenge (`server/src/api/dna-auth.ts`, `server/src/db/schema.ts`).
- Secrets and config are env-driven in backend (`server/.env.example`, `server/src/index.ts` import of `dotenv/config`).

## Telemetry, logging, and monitoring
- Frontend production telemetry is Sentry-only (`src/main.ts`).
- Backend uses console logging; no dedicated metrics/trace backend found in `server/src/`.
- Docker healthcheck probes GraphQL endpoint (`server/docker-compose.yml`).

## Webhooks and eventing
- No webhook receiver routes were found (no explicit webhook handlers in `server/src/`).
- Event-driven channels used instead:
  - GraphQL subscriptions over WS (`server/src/db/yoga.ts`, `server/src/db/mod/missionsIngame.ts`).
  - QQ bot websocket events (`server/src/bot/index.ts`).
  - Desktop app emits/listens Tauri events (`src-tauri/src/lib.rs`, `src/store/scriptRuntime.ts`, `src/utils/game-download.ts`).

## Network boundary map
- **Browser/PWA boundary**: web client talks to remote API host and static i18n assets (`src/env.ts`, `src/api/graphql.ts`, `src/i18n.ts`).
- **Desktop WebView boundary**: frontend delegates HTTP to Rust `fetch` command to bypass browser header limits (`src/api/app.ts`, `src-tauri/src/lib.rs`).
- **Backend outbound boundary**: server calls LLM, OSS, SMTP, DNA upstream, and bot services (`server/src/ai.ts`, `server/src/upload.ts`, `server/src/util/email.ts`, `server/src/api/dna.ts`, `server/src/bot/index.ts`).
- **Build/deploy boundary**: deploy script pushes artifacts over OSS and SSH/SCP (`server/deploy.ts`).

## Dev/prod port and protocol notes
- Vite dev server `http://localhost:1420` with HMR on `1421` (`vite.config.ts`, `src-tauri/tauri.conf.json`).
- Vite proxies `/api/v1` to backend `http://localhost:8887` in dev (`vite.config.ts`).
- Backend serves GraphQL and API on `8887` (`server/src/index.ts`).
- GraphQL subscriptions run over WS on same `/graphql` path (`server/src/db/yoga.ts`).
