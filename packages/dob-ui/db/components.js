/**
 * db-style 组件覆写层。
 *
 * 差异全部写进自定义子层 `@layer dob`（由 db/index.js 包裹）：
 * daisyUI 自带的子层 `daisyui.l1` → `daisyui.l1.l2` → `daisyui.l1.l2.l3` → `…l4`
 * 按首次出现顺序排列，`dob` 在本插件里最后注册，因此层序天然高于它们 ——
 * 不依赖「同层后写入」的规则排序，也就不会出现上游变体排在我们之后的情况。
 *
 * 代价是层优先级高于上游所有交互态，所以凡被覆写的组件，其 hover / active / disabled
 * 都在这里显式重写，保持 db 的方章语义（亮边框 + 主色文字，不铺底色）。
 */

/** 无颜色变体的普通按钮（方章）：透明底 + 细边框 + 主色悬停 */
const plainBtn =
    ".btn:where(:not(.btn-primary):not(.btn-secondary):not(.btn-accent):not(.btn-neutral):not(.btn-info):not(.btn-success):not(.btn-warning):not(.btn-error):not(.btn-ghost):not(.btn-outline):not(.btn-dash):not(.btn-soft):not(.btn-link))"

/** 带颜色的徽章变体：统一改半透明底 + 同色系文字 */
const tintedBadges = ["primary", "secondary", "accent", "neutral", "info", "success", "warning", "error"]
    .map(color => `.badge-${color}`)
    .join(", ")

/** 下划线表单控件的共用配方 */
const underlineField = {
    "border-radius": "0",
    "border-width": "0 0 var(--border, 1px) 0",
    "border-color": "var(--dob-line-strong)",
    "background-color": "transparent",
    "box-shadow": "none",
    outline: "none",
    // 上游默认左右各 12px（为内部图标留位）；db 的下划线控件不需要，收到 px-0.5，
    // 否则窄控件（Combobox、w-24 数字框）里文字会被挤到中间
    "padding-inline": "0.125rem",
}

/** 下划线控件聚焦态：只亮下边框 */
const underlineFocus = {
    "border-bottom-color": "var(--color-primary)",
    "box-shadow": "none",
    outline: "none",
}

export default {
    // ── 按钮：默认方章 ────────────────────────────────────────────────
    [plainBtn]: {
        "--btn-bg": "transparent",
        "--btn-border": "var(--dob-line-strong)",
        "--btn-inset": "0 0 0 0 transparent",
        "--btn-shadow": "0 0 0 0 transparent",
        color: "var(--dob-ink-soft)",
        "font-weight": 500,
        "background-image": "none",
    },
    [`${plainBtn}:hover`]: {
        "--btn-bg": "transparent",
        "--btn-border": "var(--dob-line-hover)",
        color: "var(--color-primary)",
    },
    [`${plainBtn}:active`]: {
        "--btn-bg": "transparent",
        "--btn-border": "var(--dob-line-hover)",
        color: "var(--color-primary)",
        "box-shadow": "none",
    },
    ":is(.btn-disabled, .btn:disabled, .btn[disabled])": {
        "--btn-bg": "transparent",
        "--btn-border": "var(--dob-line)",
        "background-color": "transparent",
        "background-image": "none",
        color: "var(--dob-ink-faint)",
        "box-shadow": "none",
    },

    // ── 输入框 / 下拉 / 文本域：下划线 ────────────────────────────────
    ".input": underlineField,
    // select 的右侧要留出 chevron 的位置
    ".select": { ...underlineField, "padding-inline-end": "calc(0.25rem * 7)" },
    ".textarea": { ...underlineField, resize: "none" },
    ".input:focus, .input:focus-within, .select:focus, .select:focus-within, .select:open, .textarea:focus, .textarea:focus-within":
        underlineFocus,

    // ── 带框输入框：纸面小卡（参考 GameModStore 搜索框） ────────────
    // 默认 .input 是下划线；.input-bordered 恢复完整边框，但用纸面小卡配方
    // （5% 填充 + 细边框 + 直角 + 轻毛玻璃），而不是 daisyUI 的实底 + 输入色边框。
    ".input-bordered": {
        "border-width": "1px",
        "border-color": "var(--dob-line-strong)",
        "border-radius": "var(--radius-selector)",
        "background-color": "var(--dob-fill)",
        "backdrop-filter": "blur(4px)",
        "padding-inline": "calc(0.25rem * 2)",
    },
    ".input-bordered:focus, .input-bordered:focus-within": {
        "border-color": "var(--color-primary)",
    },

    // ── 原生 select 的弹出层：必须在 top layer 里给足不透明度 ──────
    // 上游用 background-color: inherit，而 db 的 .select 是透明的；
    // 结果选项文字直接叠在页面内容上，看起来又糊又乱。
    ":is(.select)::picker(select), :is(.select select)::picker(select)": {
        "background-color": "var(--dob-surface-popover)",
        border: "1px solid var(--dob-line-strong)",
        "border-radius": "var(--radius-box)",
        "box-shadow": "0 18px 48px -20px oklch(0% 0 0 / 0.45)",
    },
    ":is(.select) option, :is(.select select) option": {
        color: "var(--color-base-content)",
        "border-radius": "var(--radius-selector)",
    },
    ":is(.select) option:checked, :is(.select select) option:checked": {
        "background-color": "color-mix(in oklab, var(--color-primary) 18%, transparent)",
        color: "var(--color-primary)",
        "font-weight": 600,
    },
    ":is(.select) option:disabled, :is(.select select) option:disabled": {
        color: "var(--dob-ink-faint)",
    },

    // ── otp：让输入层可点击 ────────────────────────────────────────
    // 上游把 input 设成 pointer-events: none，靠外层 <label> 转发点击；
    // 用 <div class="otp"> 时点不动、看起来像不能输入。这里直接放开输入层。
    ".otp": {
        cursor: "text",
    },
    ".otp > input": {
        "pointer-events": "auto",
    },
    ".otp > span": {
        "background-color": "var(--dob-surface-strong)",
        "border-color": "var(--dob-line-strong)",
        "box-shadow": "none",
    },
    ".otp:focus-within > span": {
        "border-color": "var(--color-primary)",
    },
    // 聚焦环收敛到主色：上游用 base-content，深色主题下发白，四个格子各套一圈白边太吵
    ".otp:has(input:valid:focus) > span": {
        "outline-color": "var(--color-primary)",
    },

    // ── 卡片：半透明纸面 + 细边框 ───────────────────────────────────
    ".card": {
        "background-color": "var(--dob-surface)",
        border: "1px solid var(--dob-line)",
        "backdrop-filter": "blur(var(--dob-blur))",
    },

    // ── 徽章：直角、细边框、半透明底 ────────────────────────────────
    ".badge": {
        "--badge-bg": "color-mix(in oklab, var(--color-base-content) 10%, transparent)",
        "--badge-fg": "var(--dob-ink-soft)",
        "border-color": "var(--dob-line-strong)",
        "background-image": "none",
        "font-weight": 500,
    },
    [tintedBadges]: {
        "--badge-bg": "color-mix(in oklab, var(--badge-color) 14%, transparent)",
        // 文字向正文色收敛：neutral 这类极暗色在深色主题下也能读，亮色在浅色主题下不发白
        "--badge-fg": "color-mix(in oklab, var(--badge-color) 72%, var(--color-base-content))",
        "border-color": "color-mix(in oklab, var(--badge-color) 45%, transparent)",
    },
    ".badge-outline": {
        color: "color-mix(in oklab, var(--badge-color, var(--dob-ink-soft)) 72%, var(--color-base-content))",
    },

    // ── 弹窗：毛玻璃面板 + 半透明遮罩 ───────────────────────────────
    ".modal-box": {
        "background-color": "var(--dob-surface-strong)",
        border: "1px solid var(--dob-line-strong)",
        "backdrop-filter": "blur(var(--dob-blur-strong))",
        "box-shadow": "0 18px 48px -20px oklch(0% 0 0 / 0.45)",
    },
    ".modal.modal-open, .modal[open], .modal:popover-open, .modal:target, .modal-toggle:checked + .modal": {
        "background-color": "var(--dob-scrim)",
        "backdrop-filter": "blur(4px)",
    },

    // ── 开关：直角轨道 ──────────────────────────────────────────────
    ".toggle": {
        "border-radius": "var(--radius-selector)",
    },
    ".toggle:before": {
        "border-radius": "calc(var(--radius-selector) * 0.5)",
    },

    // ── 滑杆：细轨 + 同高进度 + 纸面方章滑块 ────────────────────────
    // 上游把进度画在滑块头的超长内阴影上，高度恒等于滑块头，和细轨拼不出同一厚度。
    // dob-ui 改为在轨道上用渐变绘制进度（runtime/range.js 同步 --range-progress），
    // 细轨与进度同高，滑块是纸面方章 + 细主色描边；未接 runtime 时只显示基准轨。
    ".range": {
        "--range-p": "2px",
        "--range-bg": "var(--dob-line-strong)",
        // 上游靠 overflow:hidden 裁剪滑块内阴影绘制的进度条；db 的进度画在轨道上，
        // 必须放开裁剪，否则 16px 方章滑块会被输入框的 16px 高度切掉边角。
        overflow: "visible",
        "--range-progress": "0",
        "--range-fill-pos": "calc(var(--range-thumb-size) / 2 + var(--range-progress) * (100% - var(--range-thumb-size)))",
        "border-radius": "var(--radius-selector)",
    },
    ".range::-webkit-slider-runnable-track, .range::-moz-range-track": {
        height: "4px",
        "border-radius": "var(--radius-selector)",
        "background-color": "var(--range-bg)",
        "background-image": "linear-gradient(to right, currentColor var(--range-fill-pos), transparent var(--range-fill-pos))",
    },
    ".range::-webkit-slider-thumb, .range::-moz-range-thumb": {
        // 方章滑块：内芯用 --range-thumb（与 checkbox 勾同源 —— 变体下是 *-content，
        // 默认是纸面色），2px 描边用 currentColor（变体色）。
        // 垂直居中完全沿用上游（inset-block-start: 50% + translateY(-50%)）：
        // 上游的进度靠滑块内阴影绘制，才需要大尺寸滑块；db 的进度在轨道上，
        // 这里不能另加 margin-top 之类的偏移，否则滑块会整体上移。
        "border-radius": "calc(var(--radius-selector) + var(--range-p))",
        "background-color": "var(--range-thumb)",
        border: "2px solid currentColor",
        "box-shadow": "none",
    },
    // 整条 range 的默认 outline 会把 320px 宽的控件框成一个方框，聚焦指示收敛到滑块上
    ".range:focus-visible": {
        outline: "none",
    },
    ".range:focus-visible::-webkit-slider-thumb, .range:focus-visible::-moz-range-thumb": {
        outline: "2px solid currentColor",
        "outline-offset": "2px",
    },

    // ── 提示框：毛玻璃 + 细边框 ─────────────────────────────────────
    ".tooltip": {
        "--tt-bg": "var(--dob-surface-strong)",
        "--tt-radius": "var(--radius-field)",
    },
    ".tooltip > .tooltip-content, .tooltip[data-tip]:before": {
        color: "var(--color-base-content)",
        border: "1px solid var(--dob-line-strong)",
        "backdrop-filter": "blur(var(--dob-blur))",
    },

    // ── 进度条：细轨直角 ────────────────────────────────────────────
    ".progress": {
        height: "0.375rem",
        "border-radius": "var(--radius-selector)",
        "background-color": "var(--dob-fill)",
    },
    ".progress::-webkit-progress-bar, .progress::-webkit-progress-value, .progress::-moz-progress-bar": {
        "border-radius": "var(--radius-selector)",
    },

    // ── 快捷键键帽 ──────────────────────────────────────────────────
    ".kbd": {
        "border-radius": "var(--radius-selector)",
        border: "1px solid var(--dob-line-strong)",
        "background-color": "var(--dob-fill)",
        "box-shadow": "none",
    },

    // ── 页签：默认下划线；tabs-box / tabs-border / tabs-lift 全部纸面化 ──
    ".tabs:not(.tabs-box, .tabs-lift, .tabs-border) > .tab": {
        "--tab-bg": "transparent",
        "border-radius": "0",
    },
    '.tabs:not(.tabs-box, .tabs-lift, .tabs-border) > .tab:is(.tab-active, [aria-selected="true"], [aria-current="true"], [aria-current="page"]), .tabs:not(.tabs-box, .tabs-lift, .tabs-border) > .tab:is(input:checked), .tabs:not(.tabs-box, .tabs-lift, .tabs-border) > .tab:is(label:has(:checked))':
        {
            color: "var(--color-primary)",
            "font-weight": 600,
            "box-shadow": "inset 0 -2px 0 0 var(--color-primary)",
        },

    // tabs-box：细边框 + 4% 填充的分段控件。选中项只加主色底与主色文字，
    // 不沿着 daisyUI 的实底 + 立体阴影（与纸面直角冲突）。
    ".tabs-box": {
        "background-color": "var(--dob-fill)",
        border: "1px solid var(--dob-line)",
        "border-radius": "var(--radius-selector)",
        "box-shadow": "none",
        padding: "2px",
        // 不要设 width: fit-content：tabs-box 里允许嵌 .tab-content（ModEditer 的品质页签），
        // 收缩宽度会让 tab-content 的 100% 基准变成页签宽度，整块内容横向炸开。
        // 需要「只包住页签」的场景（如工具栏分段控件）由使用处加 w-fit。
    },
    ".tabs-box > .tab": {
        "border-radius": "var(--radius-selector)",
    },
    '.tabs-box > :is(.tab-active, [aria-selected="true"], [aria-current="true"], [aria-current="page"]):not(.tab-disabled, [disabled]), .tabs-box > :is(input:checked), .tabs-box > :is(label:has(:checked))':
        {
            "background-color": "color-mix(in oklab, var(--color-primary) 12%, transparent)",
            color: "var(--color-primary)",
            "font-weight": 600,
            "box-shadow": "none",
        },
    ".tabs-box > .tab-content": {
        "border-radius": "var(--radius-selector)",
    },

    // tabs-border：2px 指示条、直角
    ".tabs-border > .tab": {
        "border-radius": "var(--radius-selector)",
    },
    ".tabs-border > .tab:before": {
        height: "2px",
        "border-radius": "var(--radius-selector)",
    },

    // tabs-lift：抬升页签改为纸面页签（透明底 + 细边框 + 选中主色），去掉上游的立体描边拼图
    ".tabs-lift > .tab": {
        "--tab-radius-limit": "var(--radius-selector)",
        "--tab-border": "0",
        "--tab-border-colors": "transparent",
        "--tab-paddings": "0 var(--tab-p)",
        "border-width": "0",
        "border-radius": "var(--radius-selector)",
        "box-shadow": "none",
        background: "transparent",
    },
    '.tabs-lift > .tab:is(.tab-active, [aria-selected="true"], [aria-current="true"], [aria-current="page"]), .tabs-lift > .tab:is(input:checked), .tabs-lift > .tab:is(label:has(:checked))':
        {
            "background-color": "color-mix(in oklab, var(--color-primary) 12%, transparent)",
            color: "var(--color-primary)",
            "font-weight": 600,
        },
    ".tabs-lift > .tab:before, .tabs-lift > .tab:after": {
        display: "none",
    },

    // ── 表格：细线行 + 大写小表头 ───────────────────────────────────
    ".table": {
        "font-size": "0.8125rem",
    },
    ".table :where(thead, tfoot)": {
        color: "var(--dob-ink-faint)",
        "font-size": "0.6875rem",
        "letter-spacing": "0.08em",
        "text-transform": "uppercase",
    },
    ".table :where(thead tr :is(td, th), tbody tr:not(:last-child) :is(td, th))": {
        "border-bottom-color": "var(--dob-line)",
    },
    ".table-zebra tbody tr:where(:nth-child(even))": {
        "background-color": "var(--dob-fill)",
    },

    // ── 提示条：半透明着色底，文字回到正文色 ────────────────────────
    ".alert": {
        "background-color": "color-mix(in oklab, var(--alert-color, var(--color-base-content)) 8%, transparent)",
        // 上游把边框色做成变量（--alert-border-color 由变体覆盖），必须改变量才能生效
        "--alert-border-color": "color-mix(in oklab, var(--alert-color, var(--color-base-content)) 35%, transparent)",
        "box-shadow": "none",
        "background-image": "none",
    },
    ".alert-info, .alert-success, .alert-warning, .alert-error": {
        color: "var(--color-base-content)",
    },

    // ── 菜单：透明底（分层由卡片承担） ──────────────────────────────
    ".menu": {
        "background-color": "transparent",
    },

    // ── 步骤条 / 头像：直角化 ───────────────────────────────────────
    ".steps .step:not(:has(.step-icon)):after, .step-icon": {
        "border-radius": "var(--radius-selector)",
    },
    ".avatar > div, .avatar-group .avatar": {
        "border-radius": "var(--radius-box)",
    },
}
