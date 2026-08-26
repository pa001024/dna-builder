---
name: db-style
description: DNA Builder 资料库（/db）页面风格改造标准。对 src/views/DB*.vue 及其 DetailItem 子组件做 Home 设计语言统一改造时使用，定义卡片分层、方章、下划线搜索、章节头等可复制的类名配方与禁则。
---

# DB 页面风格改造标准（Home 设计语言）

以 `src/views/DBCharListView.vue`、`src/components/DBCharDetailItem.vue`、`src/components/CharSkillShow.vue` 为**唯一权威参考实现**。改造前先通读这三个文件。

## 设计原则

1. **纸面直角美学**：直角（`rounded-xs` 或无圆角）、细边框、hairline 分隔线；禁止 `rounded` / `rounded-full` / `rounded-lg` 药丸胶囊。
2. **半透明分层**：页面不设实底背景色（去掉根节点 `bg-base-100` 等），靠窗口本体 `bg-base-100/30`、内容区 `bg-base-200/50` 透出透明窗体或自定义底图。
3. **主色克制强调**：primary 只用于选中态、序号块、数值、kicker 徽记、下划线指示条。
4. **子页面无页头**：/db 下所有页面都是 ResizeableWindow 的子页面，**禁止**添加 hero/header 大标题区。
5. **等宽徽记**：装饰性**纯英文/数字**小标才可用 `font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40`；含中文的文本禁止 font-mono（见禁则清单）。
6. **动画不进祖先**：任何 opacity/transform 入场动画（含 `animate-ef-rise`）只能加在「自身带 backdrop-filter」或「无 blur 后代」的元素上；需要容器级交错入场用 `.stagger-rise`（详见动效章节）。

## 卡片分层体系（严格两级，不得混用）

| 层级       | 类名配方                                                                                                         | 用途                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 外层区块卡 | `rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm`                                   | 页面顶级 section（属性、技能、溯源、筛选区…）   |
| 内层小卡   | `rounded-xs border border-base-content/10 bg-base-content/3 p-2.5`                                               | 外层卡内的条目卡（皮肤条目、子技能、武器名片…） |
| 属性格     | `flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2` | 键值对小格                                      |
| 数值文本   | `font-orbitron text-[13px] font-semibold tabular-nums text-primary`                                              | 属性数值、计数                                  |

规则：

- `backdrop-blur-sm` **只加在外层区块卡和列表项卡上**；内层小卡不加（父级已 blur）。
- 旧样式映射：`p-3 bg-base-200 rounded` → 外层区块卡；`p-2/p-3 bg-base-300 rounded` → 内层小卡或属性格。

## 章节头

外层区块卡的标题一律用现成组件（自动导入，无需 import）：

```html
<SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('char-build.base_attr')" />
```

- `kicker` 用装饰性英文大写（LEVEL / ATTRIBUTES / BONUS / SKILLS / TRACE / SIGNATURE…）。
- 右侧附加内容放 `<template #trailing>`。
- 列表页顶部如需页面级标题行，可用 kicker + hairline 组合，但**不做**大标题 header。

## 方章（chip / toggle）

筛选值 chip：

```html
<button
    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
    :class="
        active
            ? 'border-primary bg-primary font-semibold text-primary-content'
            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
    "
></button>
```

过滤器开关方章：

```html
<button
    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
    :class="
        on
            ? 'border-primary bg-primary/10 font-semibold text-primary'
            : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
    "
></button>
```

筛选组标签（**纯英文**才配 mono/大写）：`mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40`；中文组标签用普通字体：`mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55`。

## 下划线搜索框

```html
<div class="relative">
    <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
    <input
        v-model="keyword"
        type="text"
        placeholder="..."
        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
    />
    <span class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
        >{{ list.length }}</span
    >
</div>
```

## 主从列表页（master-detail）

列表项卡：

```html
<article
    class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
    :class="
        selectedId === item.id
            ? 'dbx-item-active border-primary/70 bg-primary/10'
            : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
    "
    :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
    @click="selectedId = item.id"
></article>
```

- 每个页面用自己的标记类前缀（`dbw-` / `dbm-` …），选中态必须带 `{prefix}-item-active` 类。
- 若页面调用 `useInitialScrollToSelectedItem()`，必须改为显式选择器：
  `useInitialScrollToSelectedItem({ selectedSelector: ".dbx-item-active" })`
- **切换选中必须重播入场动画**：右侧内嵌 DetailItem 必须绑定选中参数作为 key：
  `<DBXxxDetailItem :key="selectedXxxId" :xxx="selectedXxx" />`
- 选中项名称加 `text-primary`；可在左侧加主色竖条 `absolute inset-y-0 left-0 z-10 w-[3px] bg-primary`（选中时 opacity-100）。
- 底部统计条：`flex-none border-t border-base-content/15 px-4 py-2.5` + `text-[11px] tracking-wide text-base-content/50` 文本（含中文**不加 font-mono**），数字用 `font-orbitron text-sm font-semibold tabular-nums text-primary`。
- 面板分隔线用 `border-base-content/10~15`（替代旧 `border-base-200`）。

## 动效（与毛玻璃的硬性约束）

- 入场：`animate-ef-rise motion-reduce:animate-none`（全局工具类，勿再写 keyframes）。
- 列表项 stagger：`:style="{ animationDelay: \`${Math.min(index * 30, 300)}ms\` }"`。
- **⚠️ 动画祖先会杀死后代毛玻璃**：Chromium 把"带 opacity/transform 动画（fill 保留）"的元素当作 backdrop root，其后代的 `backdrop-filter` 只能采样子树内部 → 模糊失效且动画结束时会跳变。因此：
  - `animate-ef-rise` 只允许加在「**自身带 backdrop-filter**」或「**无 blur 后代**」的元素上；
  - 容器需要子元素交错入场时，用全局工具类 **`.stagger-rise`**（style.css 已定义，直接子元素依次上浮，nth-child 延迟）——blur 卡片自己动，全程无跳变；
  - 排查口诀：剩余每个 `animate-ef-rise` 必须与 `backdrop-blur-*` 同元素，或其子树内没有任何 blur 元素。
- 禁止新增 `<style scoped>` 块；一切样式用 Tailwind 工具类表达。

## ID 展示与复制

- 实体 ID 一律用 `<CopyID :id="x.id" />`（普通方章样式），**禁止 `#{{ x.id }}` 纯文本形式**。
- compact 模式仅用于既有 hover 展开场景（父级需有 `group` 类），新代码默认非 compact。
- 序号/层数/楼层等非实体编号保留纯文本（如 `#{{ index + 1 }}`、深渊层数）。

## 稀有度/品质徽章

- 统一使用 `src/utils/rarity-utils.ts`：
  - 徽章：`:class="getRarityBadgeClass(x.rarity)"`（返回完整方章配方——直角细边框 + 半透明底 + 同色系文字，接受数字或中文品质名）；调用处不要再补形状类
  - 文本：`getRarityName(x.rarity)`；图标底色渐变：`getRarityGradientClass(...)`
- ❌ 本地再写任何稀有度色表（`bg-gray-500 text-white` / `bg-X-200 text-X-800` 一律删除改走 util）。

## 弹窗与浮层

- 点击条目展开详情的交互一律改为弹窗，统一用现成组件 `SourceDetailDialog.vue`（reka-ui 封装）：
  ```html
  <SourceDetailDialog v-model="showDetail">
      <DBXxxDetailItem v-if="selected" :xxx="selected" />
  </SourceDetailDialog>
  ```
  它**没有内置标题头**（由内容自带的档案头承担标题，避免重复）；半透明毛玻璃面板 + 遮罩。
- 小型 popover / 下拉面板：`rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md`（不要纯 `bg-base-100`）。
- 全屏覆盖层：`bg-base-100/85 backdrop-blur-md`。

## 禁则清单

- ❌ 实底背景卡：`bg-base-200` / `bg-base-300` 作为卡片底色（图标稀有度渐变 `bg-linear-*` 除外）；页面根节点/详情包装页不得有实底（`bg-base-300` 等）
- ❌ `rounded-full` / `rounded-md` / `rounded-lg` 卡片与按钮（头像图片内 `rounded-xs` 可用）
- ❌ `text-white`（用 `text-primary-content`；数据驱动实色徽记如稀有度色表、副本类型色除外）
- ❌ daisyUI `btn` 做筛选 chip（保留 daisyUI 于 modal/btn-ghost 图标按钮/select/toggle 等非列表场景可以）
- ❌ 页面级 header / hero 区
- ❌ 新增 scoped CSS、!important hack
- ❌ 改动业务逻辑：script 中仅允许 ① 滚动定位选择器参数 ② 抽取重复属性行为 computed/函数（带中文 JSDoc）。所有 `$t()` 调用、数据流、事件处理保持不变。
- ❌ **font-mono 用于可能含中文的文本**：mono 字体栈无中文字形，配套 `uppercase` 与大字距对中文是灾难。移除 mono 时一并移除配套 uppercase/大字距（tracking-[0.1em~0.3em]）。**允许保留**：纯数字/ASCII（ID、版本号 v1.2、Lv.55、CD: 5s、时间戳、百分比）、纯英文徽记 kicker。
- ❌ 动画祖先包 blur 后代（见动效章节）——`animate-ef-rise` 与 `backdrop-blur-*` 必须同元素或无嵌套关系
- ❌ `#{{ xxx.id }}` 纯文本实体 ID（改 CopyID）

## 其他约定

- 注释一律中文 JSDoc（遵循 AGENTS.md）。
- 图标只能用已注册的（见 `src/components/Icon.vue`）；需要新图标时**不要自行运行 icon_tool**，在结果报告中列出所需图标名（如 `ri:sword-line`），由主会话统一添加。
- 不要运行 `pnpm lint` / `pnpm test` / `pnpm dev`，由主会话统一验证。
- 已完成改造的参考页：DBCharListView、DBCharDetailView、DBCharDetailItem、CharSkillShow、AniTabs、ResourceCostItem、SourceDetailDialog、MonsterItem、WeaponItem（与 ModItem 同构）、DBView（db-rise 风格，可对照但不必改动）。
