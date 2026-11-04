/**
 * @file 给生成卡片 HTML 的 agent 的样式参考。
 * 数值取自 apps/web/src/style.css 的 ez 主题与 db-style 覆写层，agent 可自行取舍。
 */

export const DESIGN_REFERENCE = `## 项目视觉语言（参考，不是硬性约束）

DNA Builder 是《二重螺旋》的配装/伤害计算工具，界面是 daisyUI 的 db-style 分支：
纸面直角、细边框、半透明分层，克制而偏工具感。卡片面向 B 站动态，需要比应用内更醒目，
但配色和质感应当让人一眼认出是同一个产品。

### 主题色（取自 apps/web/src/style.css 的 ez 主题）
- base-100 #ffffff（纸面底色）
- base-200 oklch(93% 0 0)（分区底色）
- base-300 oklch(86% 0 0)（分隔/边框）
- base-content oklch(35.519% 0.032 262.988) ≈ #3f4655（正文）
- primary oklch(80% 0.105 251.813) ≈ #9ec9f0（浅蓝，品牌色）
- secondary oklch(70% 0.183 293.541) ≈ #a78bfa（紫）
- accent oklch(91% 0.08 205.041) ≈ #b7e7f2（青）
- success #6ee7b7 / warning #fbbf24 / error #f87171

### 形态
- 圆角极小（--radius-selector/field/box: 0.125rem），默认直角；只有胶囊标签用 999px
- 边框 1px，不用投影堆叠层次（--depth: 0）
- 分区靠底色与细线区分，而不是大圆角卡片

### 字体
- 中文：Microsoft YaHei / PingFang SC / Noto Sans SC
- 数字与版本号：Bahnschrift 或等宽（Consolas），可加 letter-spacing
- 标题字重 700-800，正文 400-500

### 排版参考（1080px 宽画布）
- 左右留白 64-80px，顶部留白 56-80px
- 标题 52-64px，副标题 20-24px/1.5，正文 18-20px/1.6
- 分组标题 22-26px，条目 18-20px
- 元素间距 20-40px，分区之间 32-48px
- 信息密度优先，不要大块空白

### 可选的表现手法
- 顶部一条品牌渐变细线
- 极淡的网格或点阵底纹（透明度 ≤ 0.05）
- 亮点区 2-3 个并列小块，左侧竖色条区分分组
- 版本号用胶囊标签，日期用等宽小字
- emoji 只用于亮点图标，不要满屏都是`
