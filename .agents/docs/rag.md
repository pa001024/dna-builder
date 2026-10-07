# RAG 检索层与向量索引

资料检索 Agent（`/db` 聊天页）的召回内核。AGENTS.md 只给入口，这里是完整说明。

## 〇、开关（实验性: 上下文检索增强）

输入框右下角的 toggle（`DBAskBox.vue`，`RAG` 标签在图片按钮左侧），**默认关闭**，状态在
`src/utils/rag/enabled.ts`（模块级缓存 + `setting_db_agent_rag`，不用 Pinia——读它的还有工具层）。

关闭时的四处闸门（缺一处就会在关闭态下建索引或发请求）：

| 位置 | 关闭时的行为 |
|---|---|
| `corpus.ts` `warmUpRagCorpus` | 直接返回：不装配语料、不建索引 |
| `vector.ts` `fetchVectorRecall` | 直接返回：不发 `POST /api/v1/rag/search`，也不读数据包指纹 |
| `api/dbAgent.ts` `runLoop` | 不声明 `rag_search`（提示词里同样没有它） |
| 同上 `executeTool` | 兜底分支：万一被调到只回一句「上下文检索增强未开启」，不触发建索引 |

- **提示词按开关注入**：`renderDBAgentSystemPrompt({ ragEnabled })` 关闭时**整段不注入** rag 相关段落
  （工具说明、证据类默认入口、剧情/档案/泛问分支改写成别的工具口径），不写「已关闭/不可用」之类的说明。
  开启态的渲染结果与开关引入前逐字一致。
- 开关在**当前会话还没有任何内容**时可改：锁定条件是 `hasMessages || isBusy || pendingAsk`
  （`DBView.vue` 的 `isRagToggleLocked`），锁定时提示「不可更改已开始的对话」——
  一次问答的提示词与索引状态在提问那一刻就定下了。
  ⚠️ 别退化成 `chatMode`（是否在对话界面上）：那样「空输入点发送」打开的空白新对话、
  `?dbchat=1` 恢复出来的空对话都会被锁住，用户得先退出去才能开启检索增强。
  同一口径也用在输入框占位文案上（`chatPlaceholder`：等待作答 > 已有消息 > 全新对话，
  全新对话用 `chatPlaceholderStart`「向资料检索提问」，不写「继续追问」）。
- 开启时立刻预热索引（`DBView.vue` 的 `watch`），不必等首次检索；关闭时已建好的索引保留在内存，不做回收。

## 一、客户端检索层（`src/utils/rag/`）

对外是一个工具：`rag_search` —— 一次跨「剧情台词 / 剧情 AI 总结 / 角色语音 / 角色档案 / 全库条目」召回，
返回**可直接引用的证据**：命中正文 + 前后几行片段 + 出处路径 + 得分与命中原因。
其中剧情总结（kind `summary`）是整条任务链的梗概，回答「这条剧情讲了什么」一次调用即可，
是剧情类提问的最快路径；`search_story` / `read_story` 的返回里也直接带这份总结。

| 文件 | 职责 |
|---|---|
| `src/data/rag/types.ts` | chunk 模型、锚点格式、内容指纹、`RAG_CHUNK_SCHEMA_VERSION`、`RAG_SUMMARY_LANG` |
| `src/data/rag/chunks.ts` | 切块（**双端共用**，服务端建索引也用同一份，见下）|
| `src/utils/rag/tokenize.ts` | 归一化 + CJK bigram / 拉丁词切分 |
| `src/utils/rag/lexical.ts` | 字段加权 BM25 倒排、短语/标题加成、拉丁前缀召回、拼音字段 |
| `src/utils/rag/query.ts` | 召回执行（词法变体 + 向量通道 → RRF 融合 → 片段拼装 → 标题多样性约束）|
| `src/utils/rag/corpus.ts` | 主线程读数据 + 分片切块 + 交给引擎 |
| `src/utils/rag/engine.ts` | 引擎选择：浏览器用 Worker，其余（vitest / SSG）退回进程内实现 |
| `src/utils/rag/rag.worker.ts` | Worker：建索引 + 执行召回 |
| `src/utils/rag/search.ts` | 对外入口 `ragSearch()`：语言归一化、跨语言关键词扩展、向量通道、note 组装 |
| `src/utils/rag/vector.ts` | 服务端向量通道客户端（未登录 / 版本不符 / 超时都静默退回词法）|

### 语料种类

| kind | 来源 | 粒度 / 路径 |
|---|---|---|
| `story` | `quest.data` 各语言剧情 | 一行对话（含选项行）一条；`/db/questchain/<chainId>/<questId>` |
| `summary` | `storysummary.data`（**只有中文**）| 一条任务链一条，正文是整链梗概；`/db/questchain/<chainId>` |
| `voice` | `charvoice.data` 各语言语音 | 一条语音一条；`/db/char/<charId>` |
| `profile` | `charext.data` 各语言角色档案 | 一条档案一条，正文是整篇档案原文；`/db/char/<charId>` |
| `clue` | `clue.data`（**只有中文**）| 一条线索内容条目一条，正文 = 该条线索记录原文；`/db/clue?id=<clueId>` |
| `review` | `review.data`（**只有中文**）| 一条回顾条目一条，正文 = 该条剧情回顾原文；`/db/review?id=<reviewId>` |
| `wiki` | `wiki.data`（**只有中文**）| 一条百科正文段一条，正文 = 该段词条原文；`/db/wiki?id=<entryId>` |
| `entry` | 全库检索索引枚举出的 30 个数据源 | 一条目一条，正文 = 副信息 + 隐藏检索词；详情页路径 |

- 角色档案（`profile`）与语音一样是「按语言切分的独立数据集」（六种语言齐备），标题拼成
  「角色名 · 档案名」（实测 517 条只有 20 个不同档案名，各角色共用，不带角色名无法区分主体）；
  正文与角色详情页「档案」标签同口径清洗。命中后要整篇正文用 `read_entry`（module `charprofile`）。
  档案 chunk 带 `module = charprofile`，因此 `modules: ["charprofile"]` 与 `kinds: ["profile"]` 都能收窄到它。
- 剧情总结是「概括类提问」的快路径：`rag_search` 带 `kinds: ["summary"]` 一次拿到整链脉络，
  `search_story`（带关键词时）与 `read_story` 的返回里也带 `summary` 字段，模型无需逐行翻原文再拼结论。
- 总结与待检索数据包的版本门限一致（只枚举通过门限的任务链），语言固定 `RAG_SUMMARY_LANG = zh`：
  其他语言提问靠跨语言关键词扩展命中它，`note` 会说明「总结只有中文原文」。
- 线索板（`clue`）、剧情回顾（`review`）与游戏内百科（`wiki`）同属「只有简体中文一套」的派生内容（`RAG_CN_SOURCE_LANG = zh`）：
  每个语言的语料都嵌同一份中文正文，命中即完整正文，无需再用别的工具回查；`note` 同样提示只有中文原文。

### 性能（实测，中文全量 2.8 万条 chunk / 227 万字符）

- 主线程：读数据 ~0ms（懒加载已缓存）+ 切块 ~60ms，按任务链分片（每片 <10ms）；
- Worker：切词 + 倒排 ~1.0s；传参按 4000 条一批（每批序列化十几毫秒）；
- 检索：索引就绪后单次 1~7ms（对照：旧 Fuse 链级检索每次 32ms）。

### 硬约束

- **Worker 不得 import 数据模块**（`@/data/d/**`）：生产构建里它们是「空 fallback + 主线程水合」的
  活绑定，Worker 侧永远为空。语料必须由主线程切好传进去。`query.ts` / `lexical.ts` / `tokenize.ts`
  都遵循这条。
- **锚点是跨端契约**：`story:<chainId>:<questId>:d<dialogueId>`、`voice:<charId>:<voiceId>`、
  `profile:<charId>:<profileId>`、`entry:<module>:<id>`、`summary:<chainId>`。同一段对话被多个分支复用（中文实测 404 行重复）时只保留首次出现，
  保证锚点唯一。改动锚点 / 清洗方式 / 字段拼接 / 指纹算法都要 +1 `RAG_CHUNK_SCHEMA_VERSION`；
  **只新增语料种类不升版本**（已有锚点的正文与指纹未变，旧索引仍然准确，新锚点缺向量只是少了那一路召回）。
- **缓存失效**：数据包水合（换版本）时清空语料缓存并 `engine.reset()`。

## 二、服务端向量索引（`server/src/rag/`，自动运维）

语义召回（「谁把我从雪地里救出来」这类措辞对不上的提问）由服务端提供，
**向量必须预索引**：客户端没有 embedding 模型，也不该下载向量（单语言 110MB）。

**索引库后端是 DuckDB**（`server/data/rag-index.duckdb`，曾用 bun:sqlite + int8 BLOB + JS 暴力点积，已完全移除）：
每张语言表建 HNSW 向量索引（`vss` 扩展，cosine 度量，持久化），向量按 float32 落盘，
检索 `ORDER BY array_cosine_distance(vec, ?)` 走索引扫描、打分为精确余弦（无量化损失）；
远端模式下本地只存元数据行（vec 为 NULL），向量本体只在 DashVector。

**构建 = 线上库上的单个事务**（BEGIN → 写入 → 事务内自检 → COMMIT）：不再有临时文件与换名，
校验不过或中途崩溃就整体回滚/由 WAL 恢复；增量构建不再整库复制，直接原地改标/插删。
构建由跨进程锁文件（`*.lock`，带 PID 存活检测）互斥——两个实例并发构建同一索引会交错写入并损坏库文件，锁会让后来者直接报错。

| 文件 | 职责 |
|---|---|
| `server/src/rag/embedding.ts` | OpenAI 兼容 embeddings 客户端：批量 256、并发 4、L2 归一化、退避重试、按 `index` 重排 |
| `server/src/rag/build.ts` | **自动构建**：启动预热指纹、单飞后台任务、增量复用、按种类回收、事务提交 |
| `server/src/rag/duckstore.ts` | 独立索引库（**DuckDB**）：meta 表 + 每语言一张 `chunks_<lang>` 表（`vec FLOAT[dims]`）+ HNSW 索引 + 按语言/种类的指纹 + 严格校验 + 实例缓存复用 |
| `server/src/rag/search.ts` | 本地：查询向量化 → DuckDB HNSW 检索（部分种类可服务时下推指纹过滤，退化为精确扫描）；远端：DashVector 查询 |
| `server/src/rag/progress-ui.tsx` | 主进程内的构建进度固定区域（ink/React，仅交互式终端）|
| `server/src/api/rag.ts` | `POST /api/v1/rag/search`（每账号限流，`RAG_SEARCH_RATE_LIMIT` 可调，默认 60/min）、`GET /api/v1/rag/status`（含进程 RSS） |

### DuckDB 后端要点（duckstore.ts）

- **vss 扩展**：首次 `LOAD vss` 失败会自动 `INSTALL`（从 extensions.duckdb.org 拉到 `~/.duckdb/extensions`，此后离线可用）；
  彻底装不上（离线环境）只警告一次——`array_cosine_distance` 等查询函数是核心内置的，
  **没有 vss 只是没有索引，精确扫描照样可用**，构建与检索都不会因此失败。
- **持久化 HNSW**：`SET hnsw_enable_experimental_persistence = true` 后索引随提交落盘；
  连接关闭时 DuckDB 自动把 WAL 合并进主文件，无需（也不应）手动 CHECKPOINT。
- **实例复用与串行化**：实例按路径缓存（只读/可写按需升级），同路径的创建与升级在互斥链上串行化；
  请求路径的 meta 读取连接用完即关但**保留实例**。压测（48 查询 × 并发 1~32，见 `server/.tmp/bench-rag-api.ts`）发现
  「每次读完就关实例」会与在飞请求的连接竞态（`Failed to connect`），且瞬时读失败会被接口层误判成「索引落后」触发真实构建——
  修复后同样的压测 1109 请求 0 失败，单并发 p50 约 77ms（状态校验 ×3 + DuckDB 检索 + HTTP 全链路）。
- **每语言一张表**（`chunks_zh`、`chunks_en`…）：HNSW 索引作用于整表，且 cosine 度量**只匹配
  「无过滤的 `ORDER BY array_cosine_distance(vec, ?)` 升序」**——带任何 WHERE 都退化为精确扫描
  （实测 2.8 万 × 1024 维两条路径都约 100ms，其中索引遍历仅约 8ms，大头是向量列回算）。
  因此常用路径（该语言全部种类指纹都可服务）不带过滤；部分种类可服务时下推 `WHERE fingerprint IN (...)`。
- **批量写入**：先按锚点分批 `DELETE`（512 个/批）再 `INSERT ... SELECT unnest(from_json(?::JSON, ...))`，2048 行/语句；
  不用 `INSERT OR REPLACE`——它为每行做一次冲突检测，实测 2048 条 × 1024 维下比「删 + 插」慢约两成。
  向量序列化控制到 1e-6（float32 精度之下）。
- **索引只在缺失时创建**（`ensureVectorIndex` = `CREATE INDEX IF NOT EXISTS`，已存在时约 1ms）：
  **持久 HNSW 索引由 DuckDB 随 INSERT / DELETE 自动维护**——实测（2 万条真实向量）插入新行后不重建即可召回、
  删掉的行也不会再返回。全量重建 2 万条 × 1024 维要 20s 以上，增量构建这么做纯属浪费。
- **嵌入去重**：构建进程内有内容寻址的嵌入缓存（按完整嵌入文本 LRU + 96MB 字节预算）——
  summary 只有中文一份却被放进每种语言的语料、fr/tc 的语音与 zh 同文（回退文案），
  这些逐字相同的文本在多语言构建里只向量化一次。
- **语言白名单**：`AI_EMBEDDING_LANG=zh,en`（留空 = 全部，支持 `ja→jp`、`ko→kr` 别名）。
  预热的指纹计算、`--index-all`、请求触发的构建都只覆盖白名单内的语言；
  白名单外的语言检索返回 `lang_not_allowed`，客户端退回纯词法。

### 内容指纹：按语言 × 按语料种类（双端契约）

- 指纹 = 该种类全部 chunk 的 `锚点:正文指纹` 排序拼串后再哈希（`ragKindFingerprints`），
  **数据包构建（`tools/data-pack.ts`）与服务端各算一份**，两边用同一套切块器所以逐位相同。
- 数据包清单里写成 `rag: { <lang>: { kinds: { story: "...", voice: "...", summary: "...", profile: "..." }, count } }`，
  客户端检索时原样携带（`getLoadedDataPackRagFingerprints`），**不在本地重算**——
  客户端数据会被安全模式门限过滤，重算的值因人而异。
- 服务端**按种类**比对：指纹逐字相同的种类才提供向量（`served_kinds`），其余种类本次退回词法。
  因此「只有部分模块变化」时（补几条语音、改几段对话、加一篇档案），未变的模块照常命中，不会被一起判死。
- 没有版本号参与：`pack_version` 已删除。内容是否一致、索引是否过期，一律看指纹。

### 构建时机：启动预热一次，请求路径只比较

1. **启动**（`server/src/index.ts` 调 `warmCurrentFingerprints`）：装配各语言语料、算出当前数据指纹并缓存；
   索引里已建过、但内容已变的语言**自动排队重建**（无需任何手工命令）。
2. **请求**：只把客户端指纹与「索引里的指纹」「当前数据指纹」做字符串比较（`resolveIndexFingerprint`），
   **不装配语料**——客户端怎么刷都不会引起重复计算。
3. **构建**：只在「索引确实落后于当前数据」时跑；单飞（同一时刻一个任务，重复触发合并排队），
   失败后按语言冷却 5 分钟。进程内进度 UI 与日志分别负责「现在到哪了」「发生过什么」。
4. **手动全量**：`bun sv -- --index-all`（或 `bun run dev -- --index-all`）启动时把白名单内的语言
   全部排入构建队列；已最新的语言只做指纹比对（不重新嵌入）。

### 增量与垃圾回收

- **按内容复用**：比对「锚点 + 正文指纹」，没变的向量直接复用，只向量化新增/变更的部分；
  行携带它所属种类的指纹，因此回收与「可服务范围」都按种类判定。
- **回收（新指纹覆盖老指纹）**：每次构建收尾删掉不属于本次任何种类指纹的行，同一语言每个种类只留最新一代；
  全量重建时清空全部语言表（旧模型的向量整体作废，其它语言按需重建）。
- **模型 / 维度 / 切块规则 / 表结构 / 向量库后端**（meta 里的 `vectorStore`：`local:duckdb` 或 `remote:<集合>`）
  任一变化 → 拒绝复用（全量重建），改动后自动重建，不需要人工介入。

### 性能与资源（实测）

- 写入按 2048 条一批「嵌入 → 批量注入 DuckDB」：一次性把全部向量留在内存非常夸张
  （4096 维 × 2 万条，光 JS 数值就要 600MB+），分批后常驻只有一批的量级。
- 向量按 **float32** 存进 DuckDB（`vec FLOAT[dims]` 列 + HNSW 图索引；单语言 1024 维约 115MB、4096 维约 460MB，
  由 DuckDB 缓冲管理，不再占 JS 堆；检索时不再需要整语言加载进内存做点积）。
- 本地单次检索约 10ms（2 万 × 1024 维，走 HNSW + `hnsw_ef_search=256`，top40 与精确扫描重合 97.5%）；
  单条查询 embedding 才是大头（实测 1~4s），因此查询向量化有 2.5s 预算（`RAG_EMBED_TIMEOUT_MS`），
  超时返回 503 `embedding_timeout` 让客户端立刻走词法，而不是干等。
- 增量构建（生产库副本实测：500 条变更 + 200 条删除 + 4 种改标）**7357ms → 1093ms**，
  主要来自「不再重建索引」（4362ms → 0）与「删除改批量」（147ms → 14ms）。
- 旧 sqlite 时代的 `rag-index.db` 不再被读取（v3 起后端即 DuckDB），文件可手动删除。

### 远端向量库（可选：阿里云 DashVector）

DashVector 三件套（`AI_EMBEDDING_SERVER_ENDPOINT` / `_API_KEY` / `_COLLECTION`）**配齐即启用**远端后端，
**向量不再存在本地**。嵌入通道恒为 OpenAI 兼容协议（`AI_EMBEDDING_BASE_URL`），与向量库后端是两件互不相干的事：

- 本地 DuckDB 索引库只留**元数据行**（锚点 / 种类 / 正文指纹 / 内容指纹，`vec` 为 NULL），
  用来算增量差异与服务门禁；**检索路径完全不加载本地向量**，本地内存不随语料规模增长——
  这正是远端后端的目的（本地只留几 MB 元数据，而不是 100MB+/语言的向量）。
- 检索直接走远端 `query`，门禁（语言 + 本次可服务的种类指纹）**下推成过滤表达式**，
  不需要把整库取回来再筛；远端不可用时没有本地向量可退，本次退回纯词法（日志会写明原因）。
- 契约细节（都按真机验证，见 `server/src/rag/dashvector.ts` 的注记）：
  - 鉴权头是 **`dashvector-auth-token`**（不是 `Authorization: Bearer`）；
  - 向量必须写成**浮点字面量**（`1` 会被拒为 `Mismatched Data Type`，`1.0` 才行）；
  - 文档 id 只允许 `[a-zA-Z0-9_-!@#$%+=.]` 且 ≤64 字符，锚点里的 `:` 转写成 `.`，真锚点放 `anchor` 字段；
  - `score` 是**距离**（cosine 度量下同向 0、正交 1），换算成相似度是 `1 - score`，与本地口径对齐；
  - 写入按「条数 ≤100、请求体 ≤1.5MB」装箱（远端请求体硬上限 2MB，超了报 413），每批逐条检查结果码（部分失败会报错而不是静默丢）；
  - 集合维度必须与 `AI_EMBEDDING_DIM` 一致（不一致时索引构建会在写入阶段报错）。

### 配置（`server/.env`）

| 变量 | 说明 |
|---|---|
| `AI_EMBEDDING_MODEL` | 模型名，如 `BAAI/bge-m3`（1024 维）或 `Nebius/Qwen3-Embedding-8B`（原生 4096 维）|
| `AI_EMBEDDING_BASE_URL` | 完整端点（必填，含 `/embeddings`；OpenAI 兼容协议）|
| `AI_EMBEDDING_API_KEY` | 密钥 |
| `AI_EMBEDDING_DIM` | 可选：指定输出维度（MRL 截断）。要求显式指定维度的渠道必须配；改维度会自动全量重建 |
| `AI_EMBEDDING_BATCH_SIZE` | 可选：单请求条数（默认 256、上限 1024）|
| `AI_EMBEDDING_SERVER_ENDPOINT` / `_API_KEY` / `_COLLECTION` | DashVector 集群地址、密钥与集合名；**三件套配齐即启用远端向量库**，留空任一项 = 本地 DuckDB 索引 |
| `RAG_INDEX_DB` | 可选：索引库文件路径（默认 `server/data/rag-index.duckdb`；两种后端共用该配置）|
| `AI_EMBEDDING_LANG` | 可选：语言白名单（`zh,en,ja`；支持 ja→jp、ko→kr 别名；留空 = 全部）。只构建白名单内的语言 |
| `PORT` | 可选：服务监听端口（默认 8887），同机并行多实例时用 |

**本地 → 远端迁移**：`bun run rag:migrate`（`server/src/rag/migrate-to-remote.ts`）——把本地已构建的向量
**原样**推送到 DashVector（不重新嵌入），成功后把 meta 的 vectorStore 改写为 `remote:<集合>`；
三件套本来就已配置时推送完成即无缝接管，重启服务即可，不触发全量重嵌。
支持 `--lang=zh`、`--dry-run`（只分析本地）、`--no-switch`（只推送不改标记）；推送按锚点 upsert，可安全重跑。
迁移后本地文件仍有全量向量（~100MB+/语言）：远端模式下它们是死重且不可复用（切回本地会按 tag 整体重建），
可用 `server/.tmp/slim-index.ts` 瘦身到几 MB（删 HNSW 索引 + vec 置 NULL + 紧凑重建；元数据行保留供增量构建用）。

运维只需 `GET /api/v1/rag/status`：各语言已索引指纹、当前数据指纹、构建状态（运行中/排队/上次结果/上次错误）。

### 当前范围

服务端索引**剧情 + 剧情 AI 总结 + 语音 + 角色档案**（条目语义检索收益低，词法 + facet 已足够），
客户端词法通道覆盖五类语料。总结只有中文一套，各语言索引都嵌同一份（双端锚点/指纹逐位一致，
实测服务端与客户端各 139 条、指纹零差异）。语言按需构建，目前只建了 zh。
