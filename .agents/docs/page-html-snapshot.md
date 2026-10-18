# 资料库页面渲染（render_page / 页面快照）

资料检索 Agent 的 `render_page` 工具闭环：**把资料库页面在离屏容器里真实渲染一次 → 净化 → 交给模型读**。
用来补上原始数据工具（`read_entry` / `query_module_entries`）读不到的「页面成品」内容。

## 为什么需要

资料库的页面不是数据的直接投影：活动详情页里嵌着子玩法组件（永恒梦魇 / 高难挑战、且试锋芒、签到、
拍照任务、累充返利、盲盒掉落、微茫珍藏解谜…），内容由组件现算、按交互状态拼出来，原始字段里根本没有。
这些内容只有「渲染之后」才存在，只能靠渲染读取。

## 组成

| 文件 | 职责 |
|---|---|
| `apps/web/src/utils/page-html-snapshot.ts` | 离屏渲染、净化（DOMPurify 白名单）、结构化文本化 |
| `apps/web/src/api/agent/tools/page-snapshot.ts` | `render_page` 工具：参数收敛、按结构截断、结果说明 |
| `apps/web/src/api/agent/tools/retrieval-modules.ts` | `DB_RETRIEVAL_PROFILES.db` 打开 `page: true`（配装 profile 不开） |
| `apps/web/src/shared/dbAgentSystemPrompt.ts` | 只在决策流程里给触发场景与判断口径；参数与机制写在工具定义里，不重复 |

## 渲染机制

- 建一个**独立的 memory history router**（复用 `apps/web/src/router.ts` 的 `routes`），把目标路径 `push` 进去；
  不复用主应用的路由实例，快照期间不会切走用户当前页面。
- 用 `createApp({ render: () => h(RouterView) })` 挂到 `document.body` 上的**离屏容器**
  （`position:fixed; left:-12000px; visibility:hidden`）。留在文档里而不是游离节点，是为了让布局、
  `ResizeObserver`、滚动监听与 echarts 这类需要尺寸的组件都能正常工作。
- 插件装 `createPinia()`（**新建**，与主应用隔离，避免渲染污染用户状态）、`I18NextVue`（复用全局 i18next，
  因此输出跟随界面语言）、以及主应用注册的 `h-resize-for` 指令占位。
- `app.config.errorHandler` 收集渲染错误：单个区块崩掉不影响其余内容继续采集，错误会随结果返回。
- 采集顺序：`nextTick` → 等待 `settleMs` → 按 `click` 逐个点击（每次点击后重新等待）→ 取 `innerHTML`。
- 结束后 `unmount()` + 移除容器，并**恢复 `document.title`**（页面组件可能会改写它）。

## 净化规则

1. DOMPurify 白名单：只保留文本语义标签（标题 / 段落 / 列表 / 表格 / 链接等），
   属性只留 `href` / `colspan` / `rowspan` / `title` / `datetime`；
   `class`、`style`、`on*`、`aria-*`、`data-*` 全部丢弃；脚本、样式、`img` / `svg` / `canvas` 等一律不出现。
2. 删掉下拉框候选项（`[role=listbox]` / `[role=option]` / `[role=menu]`）：reka-ui 的 Select 会把
   全部选项铺进 DOM（等级选择器 240 个），读出来只是一串挤在一起的数字。
3. 后序删除渲染残留的空壳节点；文本节点里的连续空白压成单个空格（`pre` 内保持原样）。

## 文本化（`format=text`）

按块级标签分行：标题带 `#`、列表带 `-`、表格按 `|` 分列、站内链接变成 `[文字](/db/...)`。
同样字符数能装下 2~5 倍内容，长页面优先用 `text`。

## 交互态内容：`click`

页签 / 折叠面板里的内容不在默认快照里。首次渲染结果的 `clickable` 是页面上的按钮、页签与选项名称；
把它放进 `click`（最多 4 个，按顺序点）再渲染一次即可。定位顺序：先当 CSS 选择器（`#` / `.` / `[` 开头），
否则按可见文本匹配，多个命中取文本最短（最具体）的那个；点不到的目标会出现在 `missingClicks` 里。
`ID 123` 这类复制 ID 的按钮不进 `clickable`（点了也没有新内容）。

## 提示词只写「什么时候用」

工具的参数、格式、`clickable` / `click` 机制全在 `render_page` 的 definition 里，系统提示词不重复，
只在「决策流程」里给触发场景与判断口径（「字段里没有不等于资料库没有」）。
新增内容时同样别再往提示词里抄工具定义。

## 验证与已知边界

### 端到端

`.tmp/verify-*.ts`（bun-webview-test，指向跑着的 dev server）验过：活动详情页渲染出内嵌的永恒梦魇整块（Boss 列表、两种模式、逐档掉落、强力增益、敌人面板）、`click` 能切到另一个 Boss 与高难模式；
净化产物无 `class=` / `style=` / `<script>` / `<img>` / `<svg>` / `data-`；主界面 DOM 与 `document.title` 无副作用，离屏容器无残留。

> 没测过的：模型通过真实对话调用工具（需要 AI 配置与登录），以及生产构建（规则不允许跑 `pnpm build`）。

### 数据包

dev server 的 `DISABLE_REWRITE=1` 直读源码（实测 `/packages/data/d/event.data.ts` 未被重写），所以水合路径只能在机制层验证：

- 快照用的是**同一份模块实例与活绑定**，不是导入时的拷贝。实测把 `eventData` 清空 → 快照报 `Event with id 103036 not found`，把数据填回 → 立即恢复；
  数据包水合正是往同一批绑定里回填，因此生产环境读到的就是水合后的数据。
- 水合完成前数据模块是空的：`renderPageSnapshot` 会先 `waitForDataPackHydration`（最多 4s，也受 `timeoutMs` 约束），
  仍未就绪时抛出「游戏数据还没就绪」而不是误导性的「页面不存在」，结果的 `dataReady=false` 会让工具在 note 里说明。
- 排行榜这类**走服务端接口**的页面在快照里只有壳（本地没有那份数据），工具说明里已写明。

### Worker

DB 页面里唯一会起 Worker 的是背包拼图求解（`BackpackPuzzle.worker.ts`）：

- 挂载时走 `backpackPuzzleSolutionPresets` 的预设解，**不需要 Worker**（24 个关卡全有预设），所以默认快照内容是完整的；
- 只有在用户手动改过放置后才会 `new Worker(...)`；实测该 Worker 用真实关卡数据能正常返回（9ms，score 2400），组件 `onBeforeUnmount` 会 `terminate()`，快照卸载时不会漏线程。
- 其它 Worker（`code-sandbox` / `build-sandbox` / `rag/engine` / `LevelUpCalculator`）都在配装页、Agent 沙箱与 RAG 索引里，不在 `/db` 页面链路上。

### 性能（dev，1280×1024 离屏容器）

| 场景 | 耗时 |
|---|---|
| 同页重复渲染（已加载过 chunk） | 266~300ms |
| 未打开过的页首次渲染 | 588ms（含懒加载 chunk） |
| `/db/achievement` 这类大列表页 | ~800ms，文本 34k 字（靠 `max_chars` 截断） |

连续 9 次渲染后 DOM 节点数与堆占用无持续增长（+2 节点来自主界面倒计时），离屏容器全部回收。
依赖服务端数据的页面（`/db/rank`）只渲染出筛选壳，耗时同样在 600ms 内。

## 约束与注意

- **只接受 `/db` 开头的站内路径**（`normalizeSnapshotPath`）：路径一律取自其它工具返回的 `path`。
- 输出跟随**界面语言**，`lang` 参数对它无效。
- 返回值带 `truncated` / `chars`：HTML 截在标签边界并补齐未闭合标签，文本截在行边界。
- 结果里的 `errors` 非空说明有区块渲染失败，`note` 会说明「对应区块不完整，不代表资料库没有这些数据」。
- 工具没有标 `concurrentSafe`：渲染是重活，串行执行。
- 单测（`apps/web/src/utils/page-html-snapshot.test.ts`）只覆盖纯逻辑的路径收敛；渲染链路依赖真实浏览器，
  验证走 `.agents/skills/bun-webview-test`（在页面里 `await import("/src/utils/page-html-snapshot.ts")` 直接调用）。
- **改了本功能的模块后，如果浏览器里仍看到旧行为，先确认 dev server 的模块图已经失效重编**
  （实测长时间运行的 vite 偶尔会继续吐旧的 transform 结果，重启 dev server 即恢复）。
