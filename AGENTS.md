# AGENTS.md

Guidelines for agentic coding assistants working on the dna-builder codebase.

本文件只做**索引**：命令、约定与硬性规则留在本页，机制细节一律放独立文档，避免单文件无限膨胀。
新增说明请写进 `.agents/docs/` 并在下方登记一行，不要往本页堆内容。
**给外部 agent 的 Spec（协议 / 实现 spec）一律放 `.docs/` 文件夹（git 已忽略，不进版本库）。**

## 文档索引

| 主题 | 文档 |
|---|---|
| 构建 / 增量 lint / SSG 预渲染 / 数据包改写（动手前必读） | [build-and-ssg.md](.agents/docs/build-and-ssg.md) |
| 增量 lint 自研类型检查驱动器（设计规格与实施记录） | [incremental-lint-checker-spec.md](.agents/docs/incremental-lint-checker-spec.md) |
| 代码风格细则（Formatter / TS / Vue / Rust） | [code-style.md](.agents/docs/code-style.md) |
| Dev Tools（i18n / 图标 / 称号框 / 属性 i18n / 文本包 / 数据包） | [dev-tools.md](.agents/docs/dev-tools.md) |
| RAG 检索层与向量索引（`rag_search`、Worker 索引、服务端索引库） | [rag.md](.agents/docs/rag.md) |
| 游戏数据 GraphQL 接口（`gameData*` 查询、数据集 id 口径、查询语义） | [game-data-api.md](.agents/docs/game-data-api.md) |
| Agent 技能（远端 skill 的 zip 下发 / 落盘缓存 / 虚拟文件系统工具） | [agent-skills.md](.agents/docs/agent-skills.md) |

- 技能：`.agents/skills/*/SKILL.md`（admin-management-page、build-creator、bun-webview-test、db-style、dob-skill-creator、fmodel-unpack、i18n、perf-hotspot-profiling、ue4-pak-mod）
- Spec 文档：`.docs/`（git 已忽略，面向外部 agent 的协议 / 实现 spec）
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

### i18n（`bun i18n` = `bun tools/i18n.ts`）

```bash
# 插入/覆盖：一次补齐 6 种语言，每种用自己的语言书写
bun i18n add setting.generative_ai \
  -cn "生成式AI" -tw "生成式AI" -en "Generative AI" -jp "生成AI" -kr "생성형 AI" -fr "IA générative"

bun i18n get <key> [--lang cn,en]          # 读取各语言的值（默认全部 6 种）
bun i18n rm <key>                          # 删除某键（所有语言）
bun i18n export/import                     # 导出/导入缺失翻译（tools/i18n-diff.json）
bun i18n check [--json] [--locale-gap]     # 扫描代码引用但翻译文件缺失的键
```

新增文案应**一次补齐 6 种语言、每种用自己的语言书写**（别 6 个参数都填中文，模型会加漏或理解错意思）；
`add` 结束会按实际文件内容检查，缺语言时输出 `⚠ warning`（只改一门译文、文件本就齐全时不会误报）。

细节与坑见 [dev-tools.md](.agents/docs/dev-tools.md) 与技能 `.agents/skills/i18n/SKILL.md`。

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
tools/               # Dev tools (i18n.ts, icon-tool.ts)
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
2. **CHINESE COMMENTS**: Required for complex function (>100 lines) (JSDoc format). 1-3 line summary.
3. **No shortcuts**: Never remove functions, skip processing, or use TODO placeholders instead of real code
4. **Consistency**: Check sibling files before writing to match existing patterns
5. **Always verify**: Run `pnpm lint` and `pnpm test` after frontend changes / `cargo check` after backend changes
6. **Git workflow**: For complex tasks, `git add` to staging first so you can `git checkout` to revert mistakes
7. **Prefer native APIs** over adding new library dependencies
8. **Use `bun -e "code"`** for inline code execution
9. Sensitive operations, such as generating migrations via `bun run gen`, must be confirmed by the user.
10. put all temporary files in `.tmp` directory
11. **Don't touch git**: Never use git for test, like add, stash, commit, push, pull, merge, rebase, cherry-pick, etc.

</system_rules>
