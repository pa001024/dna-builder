# 狩月账本（AFK Ledger）

> 把「小小狩月人」奖励管道的原始事件，整理成可查、可统计、可常驻桌面的产出记录。
> 本文是产品与数据口径说明；实现见 `apps/web/src/utils/afk-ledger.ts`、`apps/web/src/store/afkLedger.ts`、
> `apps/web/src/store/afkSupport.ts`、`apps/web/src/views/AfkLedgerView.vue`、
> `apps/web/src/components/AfkLedgerChart.vue`、`apps/web/src/components/AfkLedgerHero.vue`、
> `apps/web/src/views/AfkWidgetView.vue`、`apps/web/src/composables/useAfkAnimation.ts` /
> `useAfkWidget.ts` / `useAfkSprites.ts`、`apps/web/src/utils/afk-anim-state.ts` /
> `afk-widget.ts` / `afk-drop.ts` / `afk-sprite.ts`。
> 协议本身见 `specs/afk-support-protocol.md`。
>
> 入口：More → 狩月账本（仅桌面端；路由 `/afk`）。动画小窗路由 `/afk-widget`
>（label `afk-widget`，不进导航）。页内分节：采集 / 概览 / 图表 / 排行 / 最近场次
> （`ScrollSpyLayout`，i18n 键 `afk-ledger.nav_*`）。

## 1. 定位

| 项 | 结论 |
| --- | --- |
| 用户 | 长时间挂机委托、想知道「这一轮到底刷出了什么」的 PC 玩家 |
| 核心问题 | 官方浮窗只有流水，没有按场次、按副本、按天的产出账 |
| 解法 | 本地 Dexie 持久化 + 一页可筛选的账本 + 屏幕信息条条目 + 可选的独立动画小窗 |
| 不做 | 不做市场价/金币估值（没有可靠价格源）；不做云端同步；不替官方工具 |

## 2. 数据口径

| 概念 | 定义 |
| --- | --- |
| 场次 run | `enter` 建场并写 `status="running"`，`complete` 收尾改 `status="done"`。只有开始帧的场次一直显示「进行中」；重开应用时最近 6 小时（`STALE_RUN_MS`）内未结束的场次恢复为进行中，更早的按完成收尾（兜底） |
| 掉落 drop | `reward` / `craft` 事件，数量按 `count` 累加；`rarity>=5` 记为金色 |
| 铸造产物 | `craft` 与副本无关，`runId` 恒为 null，不进副本产出/趋势/品质/排行，页面上是独立统计卡片与独立分布维度 |
| 迷津 | 管道用 `id=20`、占位名「测试场景」下发，账本与事件摘要统一显示为「迷津」，链接到 `/db/rouge`（`AFK_DUNGEON_ALIASES`） |
| 归属 | `reward` 到达时若有进行中的场次就直接归它；没有才挂起（`runId=null`），由下一次 `complete` 整批认领（`attachPending`，只认领 `kind!="craft"`），作为错过开始帧的兜底 |
| 重开挑战补场 | 完成后没收到 idle（非战斗角色状态）就又来掉落/完成，说明玩家直接重开：用上一场的结束时刻补一条开始，使掉落归到新场而不是挂起（`awaitingIdle` + `lastFinishedRun`） |
| 去重 | 同一条 `complete` 会在瞬间重复多次，按「副本 + 3 秒」去重（前端事件流另有「内容键 + 3 秒」去重，见 §8），不能重复计场次 |
| 本次 session | 当前这一次管道连接（`beginSession(connectedAt)`）。连接重建**不**结束进行中的场次，只记新 `sessionId`；快照里的 session 计数按 `sessionId` 归属 |
| 今日 | 本地时区 00:00 起 |
| 回放 | 连接瞬间补发的历史事件（连接后 3 秒 `AFK_REPLAY_WINDOW_MS` 内）**不写库**，只进事件列表；账本从开启同步后开始记 |
| 保留 | 90 天，超出在初始化时清理 |
| 备份 | 导出 `{ version: 1, exportedAt, runs, drops }` 的 JSON；导入按自然键（场次=副本+起止+状态，掉落=类型+物品+时刻+数量+场次）去重合并，只增不改，`runId` 会重映射到本地场次 |

> 「收益」在本页指掉落产出（件数、金色件数、场均、每小时），不是货币价值。

写入细节（`store/afkLedger.ts`）：

- 事件按到达顺序串行落库（模块级 `writeQueue`），避免「掉落先于场次创建」算错归属；快照刷新合并 400 ms 防抖（`scheduleSnapshot`），页面用 `version++` + 300 ms 防抖重查。
- `closeActive(at, flush)` 一律按完成收尾（账本不记录「中断」）；`complete` 无进行中场次时补一条 `startedAt=at`（重开挑战时则为上一场结束时刻）的已完成场次，不丢数据。
- 查询（`loadRange(from, to, dungeonId)`）：时间范围 + 副本走 Dexie 索引；**品质/物品/时段只在页面内存里过滤**，保证筛选项（副本/物品下拉）始终完整。掉落的副本字段若缺失，用同查的 `runIndex` 从所属场次回填；跨出查询区间的场次会 `bulkGet` 补查。
- 类型判定：`resolveDropType` 按 id 查 Mod → Resource → Weapon → Char（名必须也对上才认，否则退回纯 id 口径），id 查不到或为 null 时按名反查；铸造只有名字，按名反查武器/魔之楔/角色/资源。历史脏数据（武器成品存成 `Resource` + 空 id）在展示层与导入时统一经 `resolveCraftItem` 纠正。

## 2.1 品质表示

事件里的 `rarity` 是 `1..5`，对应 **白 / 绿 / 蓝 / 紫 / 金**。页面遵循仓库既有的「只用颜色表示品质」约定：

- 名称（白/绿/蓝/紫/金）**只出现在筛选栏**（i18n `afk-ledger.rarity_*`）；
- 物品排行、品质分布、事件列表一律用色块（`rarity-utils` 的 `getRaritySwatchClass` / `getRarityColor`）；
- 任何位置都不出现数字品质。

## 3. 页面结构

```
┌ 狩月账本 ────────────────────────────────────────────────┐
│ [动画页头：官方素材 canvas + 标题压字]                   │
│ [采集条：同步开关/通知开关/状态/计数/小窗开关/风格/解锁] │
│ [筛选：今天/7天/30天/全部 · 副本/品质/物品/时段 · 导出   │
│  导入/清空]                                             │
├──────────────────────────────────────────────────────────┤
│ 完成场次 │ 总掉落 │ 金色掉落 │ 场均掉落 │ 累计时长        │
├───────────────────────────────┬──────────────────────────┤
│ 掉落趋势（柱=件数 线=场次）   │ 分布（品质/副本/物品/铸造)│
├───────────────────────────────┼──────────────────────────┤
│ 物品排行（副本掉落/铸造切换） │ 副本产出（场次/件数/场均/ │
│                               │  平均时长）              │
├───────────────────────────────┴──────────────────────────┤
│ 最近场次（时间/副本/时长/掉落 inline 图标 · 20 条翻页）  │
│ 备注                                                     │
└──────────────────────────────────────────────────────────┘
```

### 3.1 页头（AfkLedgerHero）

- 画布逻辑尺寸 1098×118（官方 366×118 横向铺三屏），`useAfkAnimation` 绘制，
  待机时角色居右（`idleOffsetRatio 0.22`）；左侧渐隐遮罩保证标题可读。
- 素材直读本机游戏目录的官方浮窗资源，不打包；无清单时只显示底纹 + 占位体积。
- 右下角：网页端显示「仅桌面端可用」；桌面端缺游戏目录显示 `hero_missing`。

### 3.2 采集条（nav_capture）

- 同步总开关（`afkSupport.setEnabled`，桌面端可用；与官方工具互斥，见协议 spec §6）。
- 两个独立通知开关：副本完成 / 铸造完成（默认都开；只控制系统通知，不影响落库与页内提示）。
- 状态：圆点 + 文案（未启用 / 等待游戏连接 / 已连接）+ `已接收/已丢弃` 计数（Rust 侧统计）+ 忙 spinner + 错误/纯网页提示。
- 小窗开关（`setting.afkWidgetEnabled`，见 §5）+ 画面风格方块按钮（普通 / BAD APPLE 剪影）+ 穿透中时的「解锁小窗」按钮 + 跳设置页 `afk-support` 分节的链接。

### 3.3 筛选

- 时间：今天（本地 00:00 起）/ 7 天（当天-6 起）/ 30 天（当天-29 起）/ 全部（查询 `from=0`；趋势横轴从最早一条掉落算起，避免空桶拉长）。
- 下拉（与 `/db` 同一套 `FilterSelect`）：副本（来自快照 `dungeons`，展示名与 `/db/dungeon` 同规则、带括号后缀）、品质、物品（当前时间/副本下聚合的可选项，不受时段/品质筛选影响）、时段（**只有掉落>0 的桶**才进选项，给点不中柱子的键盘/读屏用户一条等价路径）。
- 切换时间/副本会清掉时段筛选；「清除筛选」只清时段/品质/物品，保留时间与副本。
- 右侧：导出 / 导入 / 清空（二次确认，6 秒不确认自动取消）。

### 3.4 状态与空态

- 数据库不可用（`ledger.error` / 查询异常）：红框 + 原始错误 + 重试按钮。
- 首屏加载中：骨架 + spinner。
- 完全没记录：`empty`（全部范围）/ `empty_range` + 引导（查看全部 / 开启同步 / 清除筛选）。
- 有数据但筛选组合无结果：`no_match` + 清除筛选。

### 3.5 概览（nav_overview）

5 张 KPI 卡：完成场次 / 总掉落（件数）/ 金色掉落（金色字）/ 场均掉落（保留 1 位小数）/ 累计时长（`mm:ss` / `h:mm:ss`）。

- 口径都是**副本掉落**（铸造不计入）；场均 = 已收尾场次的掉落 / 完成场次，其中「已收尾场次的掉落」含 `runId=null` 的挂起件（`settledDrops`），进行中场次不参与分母。
- 数字按当前语言千分位格式化。

### 3.6 图表（nav_charts）

- 趋势图：柱=掉落件数，线=场次（按开始时刻归桶；今日按小时，其余按天；两线共用一纵轴）。点击柱子按该时段筛选，再点同一根取消；**空桶点中不产生筛选**。选中桶的柱子描边高亮。实现：`AfkLedgerChart` 合并式 `setOption`（实时刷新不闪 tooltip、不重置图例），悬停类目在数据刷新后恢复；点击按像素反查类目，整列高度都算命中。配色跟主题走：读 CSS 变量后经 1×1 画布归一化成 sRGB（ECharts 解析不了 oklch，鼠标一碰柱子会消失），阴影透明度 0.08，柱宽上限 18。
- 分布：维度切换 品质 / 副本 / 物品 / 铸造（默认物品；i18n `mix_*`）。上为按占比的堆叠条，下为行列表（色块 + 名称 + 占比）。点击行为：品质行切换品质筛选；副本行设置/清除副本筛选（「未归属」不可点）；物品行设置/清除物品筛选；**铸造行不可点**（没有对应筛选）。选中行高亮；品质维用统一品质色块，其余维用调色板小方块（与堆叠条同色）。占比分母是当前维度总件数。
- 时段筛选语义：场次按「与时段相交」保留（跨桶战斗在覆盖的每个时段都算），掉落按 `at ∈ [from, to)`；选了物品后场次收敛为「掉出过该物品的场」。

### 3.7 排行（nav_rank）

- 物品排行：来源切换 副本掉落 / 铸造产物（两边口径互不混算，各自显示合计与金色件数；Top 10；inline 图标+名+件数，品质由图标底色体现）。铸造排行来自**时段过滤后**的铸造（不受品质/物品筛选影响）；选了副本筛选时铸造为空并提示先清副本筛选。
- 副本产出表：副本 / 场次（含进行中）/ 掉落件数 / 场均（只按已收尾场次算，无则 `-`）/ 平均时长（有进行中显示「进行中」徽，否则已收尾平均，无则 `-`）。副本名可点：别名玩法进 `/db/rouge`，数据包有的副本进 `/db/dungeon/:id`，其余纯文本。

### 3.8 最近场次（nav_recent）

- 倒序全量 + 常驻分页条（20 条/页，不足一页也显示，按钮禁用；`上一页/下一页` + `a–b / n` + `p / pages`；筛选或数据变化回第 1 页）。
- 列：时间（`MM-DD HH:mm:ss`）/ 副本（同排行链接规则）/ 时长（进行中徽，否则 `runDuration`，未结束按当前时刻算）/ 掉落（该场全部物品 inline 图标；**不受品质/物品筛选影响**，保留上下文；无则 `-`）。

### 3.9 备注

页尾一行：开启同步后自动记账；连接瞬间回放的历史不计入（i18n `note`）。

## 4. 屏幕信息条条目

新增条目类型「狩月账本」，三个维度：

| 配置 | 取值 |
| --- | --- |
| 指标 | 完成场次 / 掉落数量 / 物品（最后掉落） |
| 范围 | 今日 / 本次 |
| 来源 | 全部副本 / 某个已记录副本 |

渲染成一颗胶囊：场次/掉落为 `[图标] 扼守/无尽 今日 3 场`；物品为 `[物品图标] 扼守/无尽 今日 生物萃取物 ×2`，无掉落时显示占位。主窗口算好快照（`buildSnapshot`，铸造不计入；最后掉落按 `at` 取最新，图标预解析后随快照下发，浮窗不查数据包）写入
`localStorage["dna.afkLedger"]`；信息条窗口每秒轮询一次（两个 webview 不保证派发 `storage` 事件，按原始字符串比对），经 `normalizeAfkSnapshot` 校验后渲染，不直接打开 Dexie。设置页用同快照做来源下拉与预览（来源名走带括号的完整名）。旧配置的金色指标读到即迁移为物品。

## 5. 独立动画小窗（AfkWidgetView，`/afk-widget`）

- 窗口由主窗口创建（label `afk-widget`）：透明、无边框、置顶、 shows_in_taskbar=false，默认摆在屏幕右下角任务栏上方（与官方「小小狩月人」同位置）。
- 页面只做三件事：画动画（逻辑画布 366×118，与官方窗口一致）+ 顶部副本完成横幅（4 秒消失；`openedAt` 之后的消息才弹，打开时不回放历史）+ 悬停操作条。
- 悬停才出现的 4 个方形纯图标按钮：拖动（系统原生拖拽，松手记住位置、不写配置，重启回默认位）/ 关闭 / 置顶（默认开）/ 鼠标穿透；右下角复位按钮回到右下角默认位。
- 鼠标穿透：跨窗口状态键 `afk_widget_click_through`，小窗写入、主窗口经 `storage` 读回并显示「解锁小窗」恢复入口；小窗打开/关闭时先解除穿透，避免一出现就点不到。窗口关闭（含 Alt+F4 / 主窗口销毁）把 `setting.afkWidgetEnabled` 写回 false。
- 开关范式与屏幕信息条一致：开关存设置里，窗口只是投影；账本页与设置页负责启停，`syncWindowWithSetting` 双向对齐（开关开但窗不在就拉起，有孤儿窗但开关关就关闭），应用启动时在 App.vue 调一次，不必等进一次账本页才收敛。

## 6. 动画引擎与共享状态

- 唯一状态源 `localStorage["dna.afkAnimState"]`：`character`（最近角色事件）/ `runDrops`（当前进行中场次掉落，最多 60）/ `scene`（当前背景，刷新后沿用）/ `notices`（最多 4）/ `style`（normal / badapple）。同窗口写后更新 ref，跨窗口靠 `storage` 事件 + 1 秒轮询兜底。
- 绘制（`useAfkAnimation`，页头与小窗共用）：背景视差（官方速度、战斗接敌/复位阶段才滚动、复位 4 倍速）+ 角色 + 怪物 + 官方战斗状态机 + 掉落粒子。素材来自 `useAfkSprites()`（读游戏目录 `AFKSupport/Res/Runtime` 的 manifest；角色由 `character` 事件切换，只驱动动画不落库）。
- 场景：只在「从非战斗进入战斗」时随机换战斗场景，战斗中重复事件沿用；待机回默认场景；事件自带可用场景则采用；持久化场景优先。
- 掉落：只画进行中这一场（`publishRunDrops` 在进场/完成/收包时刷新、小窗打开时读一次）；每条按数量铺粒子（每件 `clamp(count,1..50)`，上限 120 颗），一律从怪物死亡点附近随机爆出并跑物理；落点用 `monsterDeath` 阶段的 X（怪物从左走到右才死，不能取路径中段）。
- 风格：账本页蘑菇按钮在普通 / BAD APPLE 间切换；后者白底 + 全黑剪影（`brightness(0)`，背景层不画）+ 极淡扫描线。

## 7. 事件消费与通知（`store/afkSupport.ts`）

- 常量：内存保留最近 50 条；内容去重「kind + 关键字段 + count」3 秒窗；连接后 3 秒回放窗。
- `init`：注册事件/状态监听，读 Rust 侧状态，按持久化开关恢复接收端。
- `handleEvent`：去重 → `character` 事件进 `animState` + `lastCharacter` → 入列表（超 50 条截断）→ 回放窗内只 `record(event, true)`（不写库）不 `announce`；窗外正常落库 + 提示。
- `announce`：`craft` 优先撤销 `useForgeAlarm` 里**同名**产物的本地排期，再按开关发系统通知 + 页内 toast；`dungeon complete` 按开关发系统通知 + 写 `animState.notices`（小窗横幅），主窗口 toast 只在小窗关闭时发。
- 设置页卡片（`AfkSupportSetting.vue`）：总开关 + 互斥说明 + 错误/纯网页提示；两个通知开关；状态 + `已接收/已丢弃` + 跳 `/afk`；最近 8 条倒序（时刻 + kind 徽 + 品质色块 + 文案/副本链接）+ 清空（只清内存列表）。账本页采集条是同一套控制的紧凑版。

## 8. 与官方工具的关系

接收端与官方工具二选一（同一个管道名）。账本只消费本应用收到的实时事件；
官方工具关闭后，进入/退出挂机场景即可让游戏连到本应用。详见 `specs/afk-support-protocol.md` §6。

## 9. 米家联动（插件化）

- 打包与安装：`tools/automation-pack.ts` 把每个插件构建为单个 CJS bundle（js-only，无 vendor：`@dob/host` 与 vue 系全 external，`packages/mihome-api` 等工作区纯 TS 包打进包内；settings.vue 先编译再一起打包），产物为 zip（`<id>.js` + `plugin.json`，mock 镜像在 `apps/web/mock/plugins/`，不进应用包）。`upload` 模式上传到对象存储 `plugins/` 前缀并写 CDN 清单（含 size/sha256/url）。运行时（`automation/loader.ts`）只做两件事：读清单做市场发现、按用户手动安装下载 zip（开发走 `/mock/plugins`、线上走 CDN 主备，sha256 校验后解包执行注册）。启动只恢复已安装插件（本地持久化），从不全量自动加载；未安装插件的规则命中时记动作缺失错误。
- 链路是「事件源 → 规则 → 动作」：`afkSupport.handleEvent` 经 `afkPipe.afkToAutomationEvent`、`mihan.checkNotify` 经 `sources/mihan.mihanToAutomationEvent` 分别转成 `AutomationEvent`（afk 的 `kind` 沿用 `dungeon/reward/craft/…`，密函订阅命中为 `commission_refresh`（整点刷新出想要的任务，不是完成），`data` 只留单层匹配字段）→ `automation` store 的 `dispatch` 按 `match{kind,when}` 命中规则（`kind` 单选，为空不限种类）→ 执行规则绑定的动作；`dispatch`/`fireRuleNow` 统一跳过被手动关闭的插件（`disabledPlugins`，动作 id 点分前缀即插件 id）。
- 插件自带界面：`plugins/mihome` 除 `ActionDef`（`title` + `fields[scene_id/home_id]` + `execute`）外，还经 `plugin.json` 的 `settings` 字段提供 `settings.vue`（登录 + 场景选择框）；`AutomationPanel` 有插件界面就渲染它，无则回退通用字段表单（通用表单按 `fields[].required` 统一校验，面板内不再留插件特例）。
- 登录态回文件：存储逻辑在插件内（`plugins/mihome/fileStore.ts`，宿主只提供 `runtime.appDataFile/readTextFile/writeTextFile` 原语），桌面端经 Tauri 命令 `app_data_file("mihome","auth.json")` 落盘（与原版同路径），首次读取顺带继承老 `mijia/auth.json` 并搬家；浏览器回退 `localStorage`。通讯走 TS 库 `packages/mihome-api`（`MiHomeClient` + 注入的 `fetch`），`ctx.runtime.fetch` 桌面端即 `tauriFetch`（Rust 侧发请求，不过 WebView CORS）。
- 设置入口是账本页尾「自动化规则」一节（`AfkAutomationSetting`，空账本时也能配置）：顶部插件计数 + 管理弹窗（已安装列表含 `isPluginEnabled/setPluginEnabled` 开关，关闭后该插件规则不再触发；账号类界面走各插件自带 `settings.vue` 的 `account-only` 模式，不在 core 里另起一套）+ 快捷预设（只组装 core 的 kind/when：副本完成 / 指定物品掉落 / 铸造完成 / 委托刷新，动作用编辑器默认动作，配置由面板内插件界面继续填写）+ 通用规则面板（`AutomationPanel`，动作配置区有插件界面就渲染它，无则回退通用字段表单）。

## 10. 仅一次 fireOnce（单规则）

- 默认开：新建规则 `fireOnce` 初值 `true`，开关在每条规则行与编辑器内（badge `automation.only_once`）。
- 语义：`dispatch` 整批命中规则执行完后统一把其中 `fireOnce` 的规则置 `enabled=false`（同一批次全部执行，不丢触发；对齐密函 `mihanNotifyOnce` 先关后通的口径）。
- 只影响自动触发：手动「立即执行」（`fireRuleNow`）无视规则的 `enabled/fireOnce` 且永不翻转开关，但仍受插件总开关约束（插件关闭时返回 `plugin disabled`）；回放事件（`replayed`）不进 `dispatch`（与通知口径一致）；关闭 `fireOnce` 的规则每次命中都执行。
- 触发记录在 `automation` store：`lastFiredAt[ruleId]` 展示上次执行时刻，`fireError[ruleId]` 展示最近一次错误（成功即清空），行内错误不弹整页提示。

## 11. 动画资源包缺失提示

- 素材不打包：`useAfkSprites` 直读游戏安装目录 `EM/Binaries/Win64/AFKSupport/Res/Runtime/manifest.json`（读不到记 `error`）；`hasGameDir` 即 `game.path !== ""`。
- 页头（`AfkLedgerHero`）与小窗（`AfkWidgetView`）右下角同一口径：`error && hasGameDir` 显示 `afk-ledger.hero_res_missing` + 下载链接（`env.afkResPackUrl`）`afk-ledger.hero_res_download`；有 `error` 但无游戏目录显示 `afk-ledger.hero_missing`。
- `hero_res_missing` / `hero_res_download` 六语言一次补齐。
