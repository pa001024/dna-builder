/**
 * db-style 设计令牌。
 *
 * 颜色全部由主题色推导，主题（浅色 / 深色 / 自定义）切换时自动跟随；
 * 组件只消费这些变量，不写死颜色。
 *
 * 半径与质感在这里统一压成「纸面直角 + 无深度 + 无噪点」，
 * 因此除自定义主题外，任意内置主题都得到同一套 db 视觉，主题只决定色调。
 *
 * 选择器必须同时覆盖 `:root` 与 `[data-theme]`：应用把主题挂在 `body[data-theme]` 上，
 * 只写 `:root` 会被 body 上的同特异度主题变量压掉（变量继承自最近祖先）。
 * 两者与主题规则同特异度，靠「本层最后写入」取胜；运行时注入的自定义主题 `<style>`
 * 在文档中更靠后，仍可整体覆盖这些令牌。
 */
export default {
    ":root, [data-theme]": {
        // 纸面直角：与 Tailwind rounded-xs 同档
        "--radius-selector": "0.125rem",
        "--radius-field": "0.125rem",
        "--radius-box": "0.125rem",
        // 平面化：去掉 daisyUI 的立体投影与噪点贴图
        "--depth": "0",
        "--noise": "0",

        // 细边框：卡片 10%、控件 18%、悬停 55% 主色
        "--dob-line": "color-mix(in oklab, var(--color-base-content) 10%, transparent)",
        "--dob-line-strong": "color-mix(in oklab, var(--color-base-content) 18%, transparent)",
        "--dob-line-hover": "color-mix(in oklab, var(--color-primary) 55%, transparent)",
        // 半透明填充：内层小卡 / 悬停底
        "--dob-fill": "color-mix(in oklab, var(--color-base-content) 4%, transparent)",
        "--dob-fill-strong": "color-mix(in oklab, var(--color-base-content) 7%, transparent)",
        // 半透明表面：外层卡 62% / 浮层 86% / 浮层选项（不需要透出下层文字）94%
        "--dob-surface": "color-mix(in oklab, var(--color-base-100) 62%, transparent)",
        "--dob-surface-strong": "color-mix(in oklab, var(--color-base-100) 86%, transparent)",
        "--dob-surface-popover": "color-mix(in oklab, var(--color-base-100) 94%, transparent)",
        // 文本层级
        "--dob-ink-soft": "color-mix(in oklab, var(--color-base-content) 58%, transparent)",
        "--dob-ink-faint": "color-mix(in oklab, var(--color-base-content) 40%, transparent)",
        // 毛玻璃强度
        "--dob-blur": "8px",
        "--dob-blur-strong": "12px",
        // 数值展示字体（应用侧可覆盖 --font-orbitron）
        "--dob-display-font": "var(--font-orbitron, ui-monospace, monospace)",
        // 遮罩
        "--dob-scrim": "color-mix(in oklab, oklch(23% 0.02 260) 52%, transparent)",
    },
}
