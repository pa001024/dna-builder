# AGENTS.md

Guidelines for agentic coding assistants working on the dna-builder codebase.

本文件只做**索引**：命令、约定与硬性规则留在本页，机制细节一律放独立文档，避免单文件无限膨胀。
新增说明请写进 `.agents/docs/` 并在下方登记一行，不要往本页堆内容。

## 文档索引

| 主题 | 文档 |
|---|---|
| 构建 / 增量 lint / SSG 预渲染 / 数据包改写（动手前必读） | [build-and-ssg.md](.agents/docs/build-and-ssg.md) |
| 代码风格细则（Formatter / TS / Vue / Rust） | [code-style.md](.agents/docs/code-style.md) |
| Dev Tools（i18n / 图标 / 称号框 / 属性 i18n / 文本包 / 数据包） | [dev-tools.md](.agents/docs/dev-tools.md) |
| RAG 检索层与向量索引（`rag_search`、Worker 索引、服务端索引库） | [rag.md](.agents/docs/rag.md) |
| 游戏数据 GraphQL 接口（`gameData*` 查询、数据集 id 口径、查询语义） | [game-data-api.md](.agents/docs/game-data-api.md) |

- 技能：`.agents/skills/*/SKILL.md`（admin-management-page、bun-webview-test、db-style、fmodel-unpack、perf-hotspot-profiling、ue4-pak-mod）
- 业务与设计文档：`docs/`

## Build / Lint / Test Commands

### Frontend (Vue + TypeScript)

```bash
pnpm dev                              # Development server (http://localhost:1420/)
pnpm build                            # Production build
pnpm lint                             # 增量 lint：Biome + vue-tsc 只处理改动过的文件
pnpm lint:full                        # 全量检查（旧行为，约 2.5 分钟）
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
cd server && bun run dev         # Start dev server (port 8887)
bun run gen                      # Generate database migrations
bun run migrate                  # Run migrations
```

### Rust (MCP Server)

```bash
cd mcp_server && cargo build --release
```

## Code Style（完整清单见 code-style.md）

- Biome 格式化：**4 空格缩进 / 双引号 / 省略分号 / 140 列 / ES5 尾逗号 / LF**
- TypeScript `strict`，`@/*` → `./src/*`，不用 Prettier
- Vue 一律 `<script setup lang="ts">` + 组合式 API + Pinia `defineStore()`
- **每个函数与复杂逻辑块必须写中文注释（JSDoc：参数 / 返回值 / 异常）**；注释只写代码看不出的约束与口径
- 命名：组件 PascalCase / 工具与组合式 camelCase / Store `use` 前缀 / 常量 UPPER_SNAKE_CASE
- Rust：函数 snake_case、结构体 PascalCase、Tauri 命令返回 `Result<T, String>`

## Testing Guidelines

- **Framework**：前端 Vitest、server 侧 `bun test`
- **Location**：`src/data/tests/` 或与源文件同目录；**Naming**：`*.test.ts`
- 前端 vitest 排除 `server/**`、`externals/**`（server 单独跑）
- **Coverage thresholds**：Lines 80% / Functions 80% / Branches 70% / Statements 80%
- e2e 用 [bun-webview-test](.agents/skills/bun-webview-test/SKILL.md)，**禁止 Playwright**

## Project Structure

```
src/
├── components/      # Vue components
├── data/            # Game data and calculations (tests in data/tests/)
├── store/           # Pinia stores
├── views/           # Page components
├── api/             # API calls
├── utils/           # Utility functions
├── shared/          # Agent 提示词等跨端共享文本
└── router.ts        # Route config
server/              # Bun + Elysia backend
src-tauri/           # Tauri Rust backend
mcp_server/          # MCP server (Rust)
tools/               # Dev tools (i18n-tool.ts, icon-tool.ts)
externals/dna-api/   # DNA API package
public/i18n/         # Translation files
.agents/docs/        # 本文件展开的细节文档
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

## Git Hooks (Husky)

Pre-commit hook auto-runs: version bump → `biome format` → `git add .`

**Warning**: The pre-commit hook runs `git add .` — all files in working directory get staged.

## Important Rules

<system_rules>

1. **DO NOT RUN `pnpm dev` or `pnpm build`** — view http://localhost:1420/ directly in browser
2. **CHINESE COMMENTS**: Required for every function and complex logic block (JSDoc format). Do not overdo it. Keep the main content. Strictly prohibit writing design ideas, process descriptions, detailed implementation records, and repetitive explanations in code comments
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
