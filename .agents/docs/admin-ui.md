# 后台管理（/admin）设计约定

**读这份文档的时机**：新增 / 修改 `apps/web/src/admin/` 下任何页面，或要让后台某页与站内其它页面「看起来是同一个产品」时。

## 一份定义，三处消费

| 文件 | 职责 |
|---|---|
| `apps/web/src/admin/admin-ui.ts` | **唯一**的类名配方出口（按钮 / 输入 / 方章 / 表头表格 / 统计开本 / 空态…）。页面里不要在 class 里现编一套。 |
| `apps/web/src/admin/admin-menu.ts` | 模块索引（分组 + 顺序）。侧栏编号、首页模块总览、顶部面包屑编号都从它算，**不要在页面里另抄一份菜单**。 |
| `apps/web/src/admin/AdminPageHeader.vue` | 页头：kicker（英文大写）+ 中文页名 + 一句话说明 + 右侧操作。 |

## 设计语言（A 台账 Ledger）

- **面**：直角纸面 + 1px hairline 分梳；不用卡片外壳、不用阴影、不叠圆角。内容区的层次靠「连续表面 + 竖细线分栏」（统计开本）而不是一堆盒子。
- **字**：页标题 26 / 区块标题 15 / 表体 12 / 表头 9.5 + 字距 + 大写；数字一律 `font-orbitron tabular-nums`。
- **色**：主色只用于「选中、主操作、统计数字强调」；`error` 只给破坏性操作。
- **筛选用方章**（`ADMIN_CHIP`），下拉式筛选也用方章组，不要在页内引入第二/第三套表单控件。选项超过 5 个或需要输入预填时，才退化为原生 `select` 并套 `ADMIN_INPUT` 的外观。
- **行操作**是右对齐文字链（`ADMIN_ROW_ACTION` + `ADMIN_ROW_TONE_*`），不铺按钮。
- **动效**只留两处：页面根容器 `.admin-page` 上浮（建立阅读起点）+ 150ms 颜色过渡（点选反馈）。

## 页面骨架

```
<div class="admin-page mx-auto flex min-h-full w-full max-w-[1560px] flex-col px-5 pb-5">
    <AdminPageHeader kicker="Records" :title="config.title" :description="config.description" />
    <!-- 统计开本：flex + ADMIN_STAT_CELL（只放接口能给的口径） -->
    <!-- 检索条：border-b + 下划线输入 + 方章筛选 + 方章按钮 -->
    <!-- 表格：ADMIN_TH / ADMIN_TD + 右对齐行操作 -->
    <PageFoot ... />
</div>
```

## 硬约定（踩过的坑）

- **不许出现 daisyUI 组件类**：`card / btn / badge / alert / input / select / textarea / loading / menu / form-control / table / rounded-2xl`。后台整套是自绘的，混入组件类会立刻出现两套笔法。
- **不许用 `class="a" :class="b"` 写两个 class 属性**：Vue 3.5 编译器会报 `Duplicate attribute` 直接白屏。静态 + 动态合并写成 `:class="[STATIC, COND ? 'x' : '']"`。
- **勾选框用 `.admin-check`**（`style.css`）：原生 `input[type=checkbox]` 不受 daisyUI 主题控制，深色主题下是纯白方块。
- `cellClass` 只写语义修饰（`font-medium` / `font-mono` / `truncate max-w-*` / `text-center` / `whitespace-nowrap`）。
  **不要覆盖 `px-*` / `py-*` / `text-sm` 这类表体基础值**——`ADMIN_TD` 已经给了 12px 与行内边距，覆盖会让行高从 41px 涨到 60px 以上。
- `badgeClass` 一律返回 `ADMIN_BADGE_*` 令牌。历史配置里的 `badge-*`（组件库徽章）会被 `AdminCrudPage` 的 `sanitizeBadgeClass` 映射成同义方章色，
  但组件库徽章自带的文字色在深色主题下是深色，**不要依赖这层兜底**。
- 图标 / `Dialog` / `ScrollArea` / `PageFoot` 全局自动注册，不要 import。
- 用户可控文本一律 `{{ }}`，禁止 `v-html`。
- **不编造指标**：后台接口只有 `adminStats`（首页六个总量）和各列表的 `items/total`。模块页的统计开本只许放 `total` / 本页条数 / 页码这类可诚实推导的量。

## 加一页

1. 数据是「数据库一行」→ 写 `crud-config.ts` 配置，复用 `AdminCrudPage.vue`；是文件 / 日志 / 外部接口 → 新建自定义页并复用上面的骨架。
2. 在 `admin-menu.ts` 对应分组里加一项（编号会自动续号）。
3. `router.ts` 的 `/admin` children 里加懒加载路由。
4. 跑 `bun tools/incremental-lint.ts`，再用 Playwright 探针截图核对（探针写法见 `.tmp/pw-newshots.mjs`）。