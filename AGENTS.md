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
| 资料库页面渲染为净化 HTML（`render_page`、离屏渲染 / 净化 / 点击展开页签） | [page-html-snapshot.md](.agents/docs/page-html-snapshot.md) |
| Agent 技能（远端 skill 的 zip 下发 / 落盘缓存 / 虚拟文件系统工具） | [agent-skills.md](.agents/docs/agent-skills.md) |
| 在线地图→MapTool 坐标换算（`onlinemap-transform` 标定方法 / 置信度 / 坑） | [online-map-transform.md](.agents/docs/online-map-transform.md) |
| 安全模式 | [safe-mode-unlock.md](.agents/docs/safe-mode-unlock.md) |
| 剧情 AI 补语音流水线（缺语音扫描 / BERT 情绪 / GPT-SoVITS / aistory 发布 / AI 角标） | [voice-aistory-pipeline.md](.agents/docs/voice-aistory-pipeline.md) |

- 技能：`.agents/skills/*/SKILL.md`
- Spec 文档：`.docs/`（git 已忽略，面向外部 agent 的协议 / 实现 spec）
- 业务与设计文档：`docs/`

## Build / Lint / Test Commands

### Frontend (Vue + TypeScript)

```bash
pnpm dev                              # Development server (http://localhost:1420/)
pnpm lint                             # 增量 lint：Biome + vue-tsc 只处理改动过的文件
pnpm test                             # Run all tests (vitest run)
pnpm --filter dna-builder-data test -- tests/foo.test.ts  # Run single data test file
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

细节见技能 `.agents/skills/i18n/SKILL.md`。

### Server (Bun + Elysia)

```bash
cd server && bun run dev         # Start dev server (port 8887)
bun run gen                      # Generate database migrations
```

## Project Structure

```
apps/
├── web/               # 前端应用（Vue）：src/（components/store/views/api/utils/shared…）、
│                      # public/、mock/、index.html、vite/vitest 配置与 src-tauri 桌面壳
├── server/            # Bun + Elysia backend（bun 独立安装，不在 pnpm workspace 内）
└── dob-bot/           # GitHub App bot（bun 独立安装）
packages/
├── data/              # dna-builder-data：游戏数据模型与计算（原 src/data）
├── dna-api/           # BBS API 客户端（原 externals/dna-api，workspace 包）
├── graphql-mobius/    # GraphQL 类型安全客户端（原 externals/graphql-mobius）
└── dob-script/        # dob-script CLI 的 npm 包装
tools/                # 仓库级 Dev tools（i18n.ts、icon-tool.ts、data-pack.ts…），cwd 无关
crates/               # Rust crates（hpatchz-wasm、mcp_server）
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

## Important Rules

<system_rules>

1. **DO NOT RUN `pnpm dev` or `pnpm build`** — view http://localhost:1420/ directly in browser
2. **COMMENTS**: Limit the amount of comments you put in the code to astrict minimum. You should almost never add comments,except sometimes on non-trivial code, or for complex function (>100 lines) (Chinese JSDoc format). 1-3 line summary.
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
