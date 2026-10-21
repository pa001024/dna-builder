# dob-ui

DNA Builder 的 Tailwind CSS v4 组件库，是 [daisyUI 5](https://daisyui.com) 的 **db-style 分支**（MIT，见 [LICENSE](./LICENSE)）。

- **直接替代 daisyUI**：类名与 daisyUI 完全一致（`btn` / `card` / `input` / `modal` …），没有前缀，替换插件即可整体切换视觉。
- **db-style 默认值**：直角纸面、细边框、半透明分层、主色克制；去掉立体投影与噪点贴图（`--depth: 0`、`--noise: 0`）。
- 主题色、尺寸、组件 API 与上游保持一致；主题只决定色调，几何与质感由 db 层统一约束。

## 用法

```css
@import "tailwindcss";

@plugin "dob-ui" {
    themes: all;
    /* 不要加 exclude: properties —— 会丢掉 --aura-angle / --radialprogress 的 @property 注册 */
}

/* 与 daisyUI 相同的主题写法 */
@plugin "dob-ui/theme" {
    name: "ez";
    color-scheme: "light";
    --color-base-100: oklch(100% 0 0);
    --color-primary: oklch(80% 0.105 251.813);
    /* …其余 20 个色彩令牌 */
    --radius-selector: 0.125rem;
    --radius-field: 0.125rem;
    --radius-box: 0.125rem;
    --border: 1px;
    --depth: 0;
    --noise: 0;
}
```

开发期若希望改 `packages/dob-ui` 后 dev server 直接热更新，用相对路径引用插件：

```css
@plugin "../../../packages/dob-ui/index.js";
@plugin "../../../packages/dob-ui/theme/index.js";
```

（Tailwind 按包名加载 `@plugin` 时会缓存 ESM 模块到进程重启，相对路径每次编译都带缓存戳。）

插件选项与 daisyUI 一致：`themes`（`all` / 主题名数组）、`include`、`exclude`、`prefix`、`logs`、`root`。
`exclude: "db"` 可关闭 db 覆写层，得到原版 daisyUI 外观。

## 冒烟检查

```bash
pnpm --filter dob-ui check
```

用应用真实 `apps/web/src/style.css` 走一遍 Tailwind 编译，断言 `@layer dob`、设计令牌与关键样式都在产物中。

## 目录结构（fork 自 daisyUI 5.7.50）

| 路径 | 作用 |
| --- | --- |
| `index.js` | 插件入口：主题 → base → 组件 → utilities → db 覆写层 |
| `base/` `components/` `utilities/` | 上游组件源码，尽量保持原样以便整体同步 |
| `theme/` | 内置主题令牌与 `@plugin "dob-ui/theme"` |
| `db/tokens.js` | db 设计令牌（颜色派生自主题变量，半径/质感在此统一） |
| `db/components.js` | db 风格差异；统一写入 `@layer dob` |
| `functions/` | 上游的层嵌套、前缀、主题处理器 |

## 层叠约定

上游把组件规则放进 `daisyui.l1` → `daisyui.l1.l2` → `daisyui.l1.l2.l3` → `…l4` 这组嵌套子层，
后声明的子层优先级更高。db 覆写统一进 **`@layer dob`**：它在整个插件里最后写入、在全部
`daisyui.*` 子层之后首次声明，因此层序天然最高，不依赖规则顺序，也不会被上游变体反超。

因为层优先级高于上游交互态，被覆写的组件必须同时显式定义 `:hover / :active / :disabled`，
db 语义是「亮边框 + 主色文字」，不铺实底。

## db 设计令牌

| 令牌 | 默认值 | 用途 |
| --- | --- | --- |
| `--dob-line` | `base-content 10%` | 卡片 / 分隔细线 |
| `--dob-line-strong` | `base-content 18%` | 控件边框 |
| `--dob-line-hover` | `primary 55%` | 悬停边框 |
| `--dob-fill` | `base-content 4%` | 内层小卡 / 隔行底 |
| `--dob-fill-strong` | `base-content 7%` | 悬停底 |
| `--dob-surface` | `base-100 62%` | 外层卡半透明表面 |
| `--dob-surface-strong` | `base-100 86%` | 浮层 / 弹窗 |
| `--dob-ink-soft` / `--dob-ink-faint` | `base-content 58% / 40%` | 次级 / 弱化文字 |
| `--dob-blur` / `--dob-blur-strong` | `8px / 12px` | 毛玻璃强度 |
| `--dob-display-font` | `var(--font-orbitron, ui-monospace)` | 数值展示字体 |
| `--dob-scrim` | 深色 52% | 弹窗遮罩 |

令牌写在 `:root, [data-theme]`（base 层，最后写入）：应用把主题挂在 `body[data-theme]` 上，
只写 `:root` 会被同特异度的主题变量覆盖。运行时注入的自定义主题 `<style>` 更靠后，仍可整体覆盖。

## 当前 db 覆写范围

按钮（方章，透明底 + 细边框 + 主色悬停）、输入框 / 下拉 / 文本域（下划线，左右内边距收到 2px；`input-bordered` 走纸面小卡：
5% 填充 + 细边框 + 直角 + 轻毛玻璃，对应 GameModStore 搜索框那类场景）、卡片（半透明纸面）、
徽章（直角 + 半透明同色底 + 文字向正文色收敛）、弹窗（毛玻璃 + 半透明遮罩）、开关、
滑杆（4px 细轨 + 同高渐变进度 + 方章滑块，内芯用 `--range-thumb`，与 checkbox 勾同源：变体下是 `*-content`、默认是 `base-100`；需 `overflow: visible` 才不被输入框高度裁剪）、提示框、进度条、键帽、
页签（默认下划线；`tabs-box` 改成分段控件：细边框 + 4% 填充、选中 12% 主色底；
`tabs-border` 2px 指示条；`tabs-lift` 去掉上游的立体描边拼图，改为纸面页签）、
表格（细线行 + 大写小表头）、提示条、菜单、步骤条 / 头像直角化。

### 原生下拉的弹出层

`::picker(select)` 在 top layer 里渲染、不能继承页面玻璃层，daisyUI 原本用 `background-color: inherit`，
而 db 的 `.select` 是透明的，结果选项文字直接叠在页面内容上。db 层给 picker 上了
`--dob-surface-popover`（94% 纸面）+ 细边框 + 阴影，并单独定义 `option` / `option:checked` / `option:disabled` 的颜色。
新增弹出层组件时同理：**top layer 里的元素必须自带足够不透明的背景**，不能靠祖先的毛玻璃。

### 滑杆需要运行时

daisyUI 的进度画在滑块头的内阴影上，无法与细轨同高；dob-ui 改为在轨道上按 value 画渐变。
应用启动时调用一次：

```js
import { initRangeProgress } from "dob-ui/runtime/range"

initRangeProgress()
```

它会扫描 `input.range`、监听后续挂载与拖拽，并拦截程序化 `value` 赋值（Vue `v-model`）。
未调用时轨道只有基准色、不显示进度，滑块仍可正常拖动。

新增差异时只改 `db/`，不要改上游 `components/*/object.js`，以便与上游对比同步。
