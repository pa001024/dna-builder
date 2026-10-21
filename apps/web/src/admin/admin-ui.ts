/**
 * 后台管理页共用的类名配方（A 台账 Ledger 方向）。
 * 设计语言对齐首页主视觉与 DB 页：直角纸面、hairline 分梳、主色只做强调与选中。
 * 只放类名字符串，不放逻辑；页面里用 `:class` 或直接写在 class 上。
 */

/** 装饰性英文小标（纯英文大写才配字距） */
export const ADMIN_KICKER = "text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"

/** 页面主标题 */
export const ADMIN_PAGE_TITLE = "text-[26px] font-semibold leading-tight tracking-tight text-base-content"

/** 页面副标题 */
export const ADMIN_PAGE_DESC = "mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-base-content/55"

/** 区块小标（表头式，全大写 + 字距） */
export const ADMIN_LABEL = "text-[9.5px] font-semibold tracking-[0.2em] text-base-content/40 uppercase"

/** 下划线输入框 */
export const ADMIN_INPUT =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"

/** 下划线输入框（数值 / 日期） */
export const ADMIN_INPUT_NUM = `${ADMIN_INPUT} font-orbitron tabular-nums`

/** 方章按钮（描边） */
export const ADMIN_BTN =
    "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xs border border-base-content/20 px-2.5 text-[11.5px] text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-base-content/10 disabled:text-base-content/25"

/** 主色方章按钮 */
export const ADMIN_BTN_PRIMARY =
    "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xs border border-primary bg-primary px-2.5 text-[11.5px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-base-content/12 disabled:bg-base-content/12 disabled:text-base-content/35"

/** 危险方章按钮 */
export const ADMIN_BTN_DANGER =
    "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xs border border-error/50 px-2.5 text-[11.5px] text-error transition-colors duration-150 hover:bg-error/10 disabled:cursor-not-allowed disabled:border-base-content/10 disabled:text-base-content/25"

/** 筛选方章（可选中）：配合 on 状态使用 */
export const ADMIN_CHIP =
    "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 active:scale-[0.97]"

/** 筛选方章：未选中 */
export const ADMIN_CHIP_OFF = "border-base-content/18 text-base-content/55 hover:border-base-content/35 hover:text-base-content/80"

/** 筛选方章：已选中 */
export const ADMIN_CHIP_ON = "border-primary bg-primary/12 font-semibold text-primary"

/** 状态方章（表内小标）：高度 18px、10px 字并加字距，保证深色主题下能读清 */
export const ADMIN_BADGE =
    "inline-flex h-[18px] items-center rounded-xs border px-1.5 text-[10px] font-medium tracking-[0.04em] whitespace-nowrap"

/** 状态方章：中性 / 主色 / 成功 / 危险 / 警告 */
export const ADMIN_BADGE_NEUTRAL = "border-base-content/25 text-base-content/65"
export const ADMIN_BADGE_PRIMARY = "border-primary/45 bg-primary/10 text-primary"
export const ADMIN_BADGE_SUCCESS = "border-success/45 bg-success/10 text-success"
export const ADMIN_BADGE_ERROR = "border-error/45 bg-error/10 text-error"
export const ADMIN_BADGE_WARNING = "border-warning/45 bg-warning/10 text-warning"

/** 表头单元格 */
export const ADMIN_TH =
    "border-b border-base-content/15 px-3 py-2 text-left text-[9.5px] font-semibold tracking-[0.16em] whitespace-nowrap text-base-content/40 uppercase"

/** 表体单元格 */
export const ADMIN_TD = "border-b border-base-content/[0.06] px-3 py-2.5 text-[12px] text-base-content/80"

/** 表格外壳（只做横向滚动裁切，不加卡片） */
export const ADMIN_TABLE = "w-full min-w-[680px] border-collapse text-left"

/** 行 hover / 选中共用（选中态由页面追加 bg 与左侧竖条） */
export const ADMIN_ROW = "group/row transition-colors duration-150 hover:bg-base-content/[0.035]"

/** 外层区块卡（极少数需要包住整块内容时用） */
export const ADMIN_SECTION = "rounded-xs border border-base-content/10 bg-base-100/50"

/** 统计开本单元（连续表面 + 竖细线，不用卡片） */
export const ADMIN_STAT_CELL = "flex-1 border-r border-base-content/10 px-4 py-3 last:border-r-0"

/** 统计条标签 */
export const ADMIN_STAT_LABEL = ADMIN_LABEL

/** 统计条数值行 */
export const ADMIN_STAT_VALUE = "mt-1 flex items-baseline gap-1.5"

/** 统计条数字字体 */
export const ADMIN_NUM = "font-orbitron text-[17px] font-semibold leading-none tabular-nums text-base-content"

/** 统计条数字后缀说明 */
export const ADMIN_NUM_UNIT = "text-[10.5px] text-base-content/40"

/** 表格 / 链接类数据里的编号（孤儿 ID、会话 ID） */
export const ADMIN_MONO = "font-mono text-[11.5px] tabular-nums"

/** 行内文字操作（基础部分，颜色由 tone 单独给，避免同属性工具类互相覆盖） */
export const ADMIN_ROW_ACTION =
    "cursor-pointer text-[11.5px] transition-colors duration-150 disabled:cursor-not-allowed disabled:text-base-content/20"

/** 行内操作为中性 */
export const ADMIN_ROW_TONE_NEUTRAL = "text-base-content/55 hover:text-base-content"

/** 行内操作为主操作 */
export const ADMIN_ROW_TONE_PRIMARY = "text-primary/90 hover:text-primary"

/** 行内操作为危险操作 */
export const ADMIN_ROW_TONE_ERROR = "text-error/80 hover:text-error"

/** 空态容器 */
export const ADMIN_EMPTY = "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center"

/** 数据加载中的顶部进度条容器 */
export const ADMIN_PROGRESS_TRACK = "absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/15"
