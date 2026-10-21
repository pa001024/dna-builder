# dob-ui（db-style Tailwind 组件库）

`packages/dob-ui` 是 **daisyUI 5 的 fork**，用于替代 `daisyui` 依赖：
类名完全一致（`btn` / `card` / `input` / `modal` …，**没有前缀**），
`apps/web/src/style.css` 里换掉 `@plugin` 名即可整体切换。

## 使用方式

```css
/* apps/web/src/style.css */
@plugin "dob-ui" {
    themes: all;
    exclude: properties;
}

@plugin "dob-ui/theme" {
    name: "ez";
    /* 与 daisyUI 相同的 20 个色彩令牌 + 半径 / 尺寸 / 质感令牌 */
}
```

`package.json` 中通过 `"dob-ui": "file:../../packages/dob-ui"` 引入（workspace 符号链接）。

⚠️ `style.css` 里故意用**相对路径** `@plugin "../../../packages/dob-ui/index.js"`：
Tailwind 对 `@plugin "包名"` 会缓存 ESM 模块直到进程重启，相对路径每次编译都带 `?id` 缓存戳，
改 `packages/dob-ui/**` 后正在运行的 dev server 能直接热更新。

## 设计分工

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 上游组件 | `components/`、`base/`、`utilities/`、`functions/`、`theme/`、`imports.js`、`index.js` | 从 daisyUI 5.7.50 原样复制，**不要改**，方便与上游 diff 同步；这些路径已在 biome 里排除，避免格式化污染 upstream diff |
| db 覆写 | `db/tokens.js`、`db/components.js` | 唯一的风格差异来源 |

- 直角与平面化靠 `db/tokens.js` 的 `--radius-* = 0.125rem`、`--depth = 0`、`--noise = 0`
  （选择器 `:root, [data-theme]`：应用把主题挂在 `body[data-theme]` 上，只写 `:root` 会被覆盖）。
- 组件差异统一进 `@layer dob`。它在所有 `daisyui.l1.*` 子层之后首次声明，层序最高，
  不依赖规则写入顺序，也不会被上游变体反超；代价是覆盖了上游交互态，
  因此被覆写的组件必须同时显式写 `:hover / :active / :disabled`。
- 颜色全部由主题变量派生（`color-mix`），切主题自动跟随；不写死色值。

## 调试页

路由 `/dev/components`（`apps/web/src/views/DevComponentsView.vue`，`meta.requireData = false`）：
逐组展示全部组件与常用组合场景（工具栏、标题行状态徽章、设置行、筛选方章、主从列表、弹窗表单…），
右上角可临时切 `dark / light / cyberpunk` 观察令牌适配。改完 `db/` 先看这个页面，再去真实页面抽查。

## 下划线控件的内边距

上游 `.input` / `.select` / `.textarea` 默认左右各 12px，是给容器内图标留位的。
db 的下划线配方只需要 2px（`px-0.5`），因此 `db/components.js` 统一把 `padding-inline` 收到 `0.125rem`；
`select` 单独保留右侧 28px 给 chevron。新做窄控件（Combobox、`w-24` 数字框）时不要再自己补左右 padding。

## 已知坑（top layer / 毛玻璃）

原生 `<select>` 的 `::picker(select)`、`<dialog>`、popover 都在 top layer 渲染：
它们**不参与祖先的 backdrop-filter**，`background-color: inherit` 拿到的往往是透明或半透明值，
文字会直接叠在下面的页面上（表现为「下拉选项看不清」）。db 层已为 picker 指定
`--dob-surface-popover`（94% 纸面）+ 细边框 + 阴影，并单独定义 option 的三态颜色。
后续遇到其它 top layer 组件，按同样方式显式给不透明底，不要复用卡片的 62% 表面。

`otp` 的正确结构是 **`span` 在前、`input` 在最后**：`span` 是绝对定位的格子，
`input` 是量宽/接收输入的透明层。把 `input` 写在前面会把第一个格子挤出可视区，
看起来像「文字显示不全」。调试页已按正确结构演示 `xs / sm / joined` 三档。

## 页签变体

| 类 | db 形态 |
| --- | --- |
| `tabs`（默认） | 透明底 + 选中 2px 主色下划线 |
| `tabs-box` | 分段控件：`dob-fill` 底 + 细边框 + 2px 内边距；选中项 12% 主色底 + 主色文字，无阴影 |
| `tabs-border` | 2px 指示条、直角 |
| `tabs-lift` | 去掉了上游靠 border/radius 拼的立体页签，改为透明底 + 选中 12% 主色底 |

⚠️ **不要给 `.tabs-box` 加 `width: fit-content`**：它允许嵌 `.tab-content`
（`ModEditer` / `TraitEditer` 的品质页签就是这个结构），收缩宽度会让 tab-content 的
`width: 100%` 以页签宽度为基准，内容横向炸开。需要「只包住页签」的分段控件，
在**使用处**加 `w-fit`（调试页即如此）。

## ⚠️ 不要在 `@plugin "dob-ui"` 上加 `exclude: properties`

`packages/dob-ui/base/properties` 注册了两条 `@property`：

| 属性 | 作用 |
| --- | --- |
| `--aura-angle` | `aura` 的 `conic-gradient(from var(--aura-angle) …)` 旋转；未注册时变量不可动画，渐变会整块糊 |
| `--radialprogress` | `radial-progress` 的百分比驱动 |

从 daisyUI 抄配置时很容易带上 `exclude: properties`，那会让 `aura` 退化成一块纯白方块
（曾经踩过）。`style.css` 里已去掉该项，冒烟检查也加了 `@property --aura-angle` 断言。

## otp 的输入

上游把 `.otp > input` 设为 `pointer-events: none`，靠外层 `<label>` 转发点击。db 层已改成
`pointer-events: auto`，并给格子配上纸面底色与主色聚焦环，因此 `<div class="otp">` 也能直接输入。
标记仍要与官方一致：**`span` 在前、`input` 在最后**，`span` 数量 = `maxlength`。

## 新增 / 调整组件样式

1. 先在 `db/components.js` 里用与 daisyUI 相同的类名写差异；能改变量（`--btn-bg`、`--alert-border-color`、`--badge-*`…）就不要直接写属性，变量会经上游规则继续生效。
2. 上游把一部分声明放在子层之外（例如 `.alert` 的 `border-color: var(--alert-border-color)`），这种属性必须改变量而不是改属性。
3. 改完跑冒烟检查（用应用真实 `style.css` 走一遍 Tailwind 编译，核对 `@layer dob`、令牌与关键规则）：

```bash
pnpm --filter dob-ui check
```

也可以直接看 `scripts/check.mjs` 的 `required` 列表，按需补充新约定。

浏览器里用 `getComputedStyle` 抽查：普通按钮透明底、卡片 62% 半透明 + 细边框、
输入框只剩 1px 下边框、徽章 14% 同色底、弹窗毛玻璃。

`range` 是特例：上游用滑块头的超长内阴影画进度条，填充高度恒等于滑块头（16px），
与细轨无法同高（会呈「左粗右细」断层）。db 层改为在轨道上用渐变画进度：
`--range-progress`（0~1）由 `packages/dob-ui/runtime/range.js` 从 input 的 value 同步，
CSS 里用 `--range-fill-pos` 把进度端点对齐到滑块中心的行程。

- 应用入口 `main.ts` 已调用 `initRangeProgress()` 一次；新增独立窗口/子应用不需要重复调用（监听在 document 上）。
- 它会拦截实例上的 `value` 访问器以覆盖 Vue `v-model` 的程序化赋值，并监听 `input` 事件覆盖拖拽。
- 未接运行时是优雅降级：只剩基准轨 + 可拖动的方章滑块，不显示进度。

滑块造型（2026-10 定稿）：`16px` 方章，内芯 `--range-thumb`（**与 checkbox 勾同源**：
`range-primary` 等变体下是 `--color-{变体}-content`，默认是 `--color-base-100`）、
`2px` 描边 `currentColor`（跟随变体色），圆角 `calc(var(--radius-selector) + var(--range-p))`。
不要改用 `--color-base-content`：它在浅色主题下是近黑色，滑块中间会发黑。
填充与轨道同高（4px），不使用上游的滑块内阴影填充。

⚠️ 必须同时设 `overflow: visible`：上游靠它裁剪内阴影进度条，而 db 的进度画在轨道上；
默认的 `hidden` 会把 16px 方章滑块连同描边一起切掉（表现是滑块看起来像个残缺方块）。

## 与 db-style skill 的关系

`.agents/skills/db-style/SKILL.md` 描述的类名配方仍然有效（它们是显式工具类，优先级高于组件层）；
新增页面优先用 `dob-ui` 的组件类，少写长串工具类。daisyUI 的 `input` / `select` / `textarea`
在这个 fork 里已经是下划线配方，`btn` 已是方章。

## 手写配方 → 组件映射（已迁移 / 保留）

| 手写配方（SKILL 章节） | dob-ui 组件写法 | 状态 |
| --- | --- | --- |
| 筛选值 chip（实底选中） | `btn btn-xs` + 选中 `:class="'btn-primary'"` | ✅ 已迁移（2026-10，约 170 处） |
| 过滤器开关方章（tint 选中） | 底座 `btn btn-xs`，`bg-primary/10` tint 分支保留在 `:class` | ✅ 底座已迁移，tint 无组件等价物、保留手写 |
| 变体 tone（error 描边、primary 描边、静态实底按钮） | `btn btn-xs` + 原颜色 token（`btn-primary` 替代实底组） | ✅ 已迁移 |
| 下划线输入框（密集 `text-[13px]` 网格） | 保留手写配方 | 保留：`input` 默认 14px/固定高，与密集 metrics 不一致 |
| 通用表单输入（弹窗/设置行） | `input` / `textarea` / `select` | ✅ 本就是组件 |
| 外层区块卡 / 内层小卡 / 属性格 | 保留手写配方 | 保留：`card-body` 默认 padding/gap 与 `p-3` 不一致，显式工具类优先级更高 |
| 下划线搜索框（带图标 + 计数） | 保留手写配方 | 保留：组合件，无单一组件等价物 |
| 主从列表项卡 / 档案头 / 稀有度 | 保留手写 | 保留：db 特有模式，dob-ui 未收录 |
| `CopyID` / 密集行内按钮 | 保留手写 | 保留：行高敏感（`btn-xs` 24px 会撑高列表行） |
