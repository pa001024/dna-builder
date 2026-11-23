/**
 * 升华界面官方贴图的 mask 样式与槽型 / 标记映射。
 *
 * 贴图来源（官方导出，非相似图）：
 * - 槽型：`EM/Content/UI/Texture/Dynamic/Atlas/Season/T_Season_Equipment_Icon*.uasset`，128×128 DXT5；
 * - 标记：`EM/Content/UI/Texture/Static/Atlas/Season/Tips/T_Season_Tips_Point_0{1,2,3}.png`
 *   （U66a 从 1.8 客户端 pak 按 32/56/40 原尺寸重导，太古为红色多刺星，不再靠染色）。
 * 槽型与图标角标是纯白 alpha 剪影，用 mask + `currentColor` 着色，深浅主题跟随正文色；
 * 词条行的彩色标记（太古红星 / 最终金星 / 专属橙星）改用 `<img>` 原色渲染，保留太阳黑心与星星层次。
 *
 * maskSize 口径：贴图字形只占画布一部分，`contain` 铺进 24px 盒子里只剩细笔画（U41 craft 图标同病）。
 * 这里按各图 alpha 包围盒换算放大倍数、取「不裁边」的上限（单值百分比保持等比，mask-position:center）。
 * 实测 alpha 包围盒（alpha>8，烘焙后的 PNG）：Head (34,22)-(93,105) 60×84、Body (29,23)-(98,103) 70×81、
 * Hand (34,20)-(92,107) 59×88、Foot (22,32)-(104,94) 83×63、Ear (40,20)-(87,106) 48×87、
 * Neck (23,24)-(104,102) 82×79、Ring (28,29)-(99,97) 72×69、Pendant (33,17)-(93,109) 61×93、
 * Seal (21,20)-(106,107) 86×88、Book (19,31)-(108,95) 90×65、Pattern (27,30)-(99,96) 73×67。
 * 下表 maskSize 按研究表标定；用实测 bbox 复核后，最长边占盒 78–94%（<100%，均不裁边）。
 * 标记 bbox（1.8 pak 重导后实测）：Point_01 26/32（81.3%）、Point_02 42×47/56（83.9%）、Point_03 24/40（60%）。
 */

/** 官方贴图 + 按包围盒标定的 mask-size */
export interface TranscendIconSpec {
    /** `/imgs/webp/*.webp` 完整字面量（webp-import 文本扫描依赖字面量，勿改成拼接模板） */
    url: string
    /** mask-size 单值百分比：保持等比，取包围盒换算后不裁边的上限 */
    maskSize: string
}

/**
 * 装备槽型 → 官方图标。键是 `slotType` 1–11，图标名以官方贴图为准：
 * 8 护符 Pendant、9 印章 Seal、10 典籍 Book、11 纹饰 Pattern（英文槽名 Belt/CrystalBall/Shield 曾漂移，勿按英文反推）。
 */
export const TRANSCEND_SLOT_ICONS = {
    1: { url: "/imgs/webp/T_Season_Equipment_IconHead.webp", maskSize: "137%" },
    2: { url: "/imgs/webp/T_Season_Equipment_IconBody.webp", maskSize: "143%" },
    3: { url: "/imgs/webp/T_Season_Equipment_IconHand.webp", maskSize: "137%" },
    4: { url: "/imgs/webp/T_Season_Equipment_IconFoot.webp", maskSize: "123%" },
    5: { url: "/imgs/webp/T_Season_Equipment_IconEar.webp", maskSize: "137%" },
    6: { url: "/imgs/webp/T_Season_Equipment_IconNeck.webp", maskSize: "125%" },
    7: { url: "/imgs/webp/T_Season_Equipment_IconRing.webp", maskSize: "145%" },
    8: { url: "/imgs/webp/T_Season_Equipment_IconPendant.webp", maskSize: "125%" },
    9: { url: "/imgs/webp/T_Season_Equipment_IconSeal.webp", maskSize: "123%" },
    10: { url: "/imgs/webp/T_Season_Equipment_IconBook.webp", maskSize: "116%" },
    11: { url: "/imgs/webp/T_Season_Equipment_IconPattern.webp", maskSize: "136%" },
} as const

/**
 * 装备标记 → 官方 tips 贴图（图标角标用：太古走 `<img>` 原色，专属菱走 mask + `currentColor`）。
 * 官方图标角标没有最终精锻标记，最终金星只用于词条行（`TRANSCEND_LINE_MARKS`）。
 */
export const TRANSCEND_MARK_ICONS = {
    ancient: { url: "/imgs/webp/T_Season_Tips_Point_02.webp", maskSize: "100%" },
    unique: { url: "/imgs/webp/T_Season_Tips_Point_03.webp", maskSize: "100%" },
} as const

/** 词条行标记键：Forge 四层 + 普通灰点 + 专属橙星 + 空孔 */
export type TranscendLineMarkKey = "random" | "ancient" | "finalMasterwork" | "tempering" | "enchant" | "unique" | "emptyGroove"

/** 上游词条富文本基准字号（`Season_Tips_RichText_T15` 全部样式 `Font.Size = 15`） */
export const TRANSCEND_MARK_BASE_FONT_SIZE = 15

/** 标记槽 `SizeBox_Point`：24 设计单位（非 Image，不受 4K 减半）= 1.6em；上游不裁剪，太古 28 设计值居中溢出 */
export const TRANSCEND_MARK_SLOT_EM = 1.6

/**
 * 装备 Tips 顶部太古总数条（上游 `List_Primordial` 每 AncientRow 一颗）：单颗星 1.2em，
 * 相对 13px 名称行约 15.6px，对齐游戏截图里星 / 名称 ≈ 15 / 16 的比例；条内间距 0.35em。
 */
export const TRANSCEND_ANCIENT_TOTAL_EM = 1.2

/** 词条文本起点（相对槽左边）：槽 1.6em + 上游 `Padding.Left=-2` → 1.4667em */
export const TRANSCEND_MARK_TEXT_OFFSET_EM = 1.4667

/** 上游 `Padding.Left=-2` 的负外边距（槽 1.6 − 文本起点 1.4667） */
export const TRANSCEND_MARK_TEXT_PULL_EM = 0.1333

/** 槽顶部 `Padding.Top=1`（1 设计单位） */
export const TRANSCEND_MARK_PADDING_TOP_EM = 0.0667

/** 黑描边宽度（上游 Outline 2 的 4K 减半 = 1 设计单位） */
export const TRANSCEND_MARK_BORDER_EM = 0.0667

/** 描边 CSS 宽度：不小于 1 CSS 像素，其余随宿主字号缩放 */
export const TRANSCEND_MARK_BORDER_CSS = `max(1px, ${TRANSCEND_MARK_BORDER_EM}em)`

/**
 * 词条行标记规格（上游 `WBP_Com_Tips_Season_Item` + Lua `BuildAffixRow`）。
 * `control` 记录 WBP 控件名：控件名与素材编号**错位**（`Point_03` 控件用 Point_01 金星、`Effect` 用 Point_03 橙星），
 * 不得按控件名反推素材。彩色层用 `<img>` 保留贴图原色与黑心；纯色块（灰点 / 淬炼 / 附魔）用背景色 + 黑描边。
 * `z` 为同一 1.6em 锚点内的叠放顺序：太古红星 → 最终金星 → 淬炼橙红点 → 附魔紫点。
 */
export interface TranscendLineMarkSpec {
    /** 设计尺寸 px（官方 SizeBox / ImageSize 的 4K 设计值，仅取证 / 追溯，不直接用于渲染） */
    size: number
    /**
     * 相对宿主字号的 em 比值 = 4K 减半后的有效尺寸 / 基准字号 15。
     * 56/32/40/14/8/36 设计值运行时有效为 28/16/20/7/4/18，即 1.8667/1.0667/1.3333/0.4667/0.2667/1.2。
     */
    em: number
    /** 同锚点叠放顺序，越大越靠上 */
    z: number
    /** WBP 控件名（与素材编号错位，仅作取证记录） */
    control: string
    /** 官方贴图；彩色层用 `<img>` 原色渲染 */
    url?: string
    /** 纯色块 CSS 颜色（灰点 `#99FFFFFF` 是上游 ARGB，CSS 需写成 rgba 白 60%） */
    color?: string
    /** 上游 ARGB 十六进制（仅作取证记录，勿直接用作 CSS 颜色） */
    colorHex?: string
    /** 不透明度（灰点 0.6） */
    opacity?: number
    /** 黑描边设计宽度 px（淬炼 / 附魔 2px 的 4K 设计值；运行时用 `TRANSCEND_MARK_BORDER_CSS`） */
    border?: number
}

/** 词条行标记规格表：尺寸 / em / z / WBP 控件名 / 贴图与纯色 */
export const TRANSCEND_LINE_MARKS: Record<TranscendLineMarkKey, TranscendLineMarkSpec> = {
    random: { size: 8, em: 0.2667, z: 0, control: "Point_01", color: "rgba(255, 255, 255, 0.6)", colorHex: "#99FFFFFF", opacity: 0.6 },
    ancient: { size: 56, em: 1.8667, z: 1, control: "Point_02", url: "/imgs/webp/T_Season_Tips_Point_02.webp" },
    finalMasterwork: { size: 32, em: 1.0667, z: 2, control: "Point_03", url: "/imgs/webp/T_Season_Tips_Point_01.webp" },
    tempering: { size: 14, em: 0.4667, z: 3, control: "Tempering", color: "#EB774E", border: 2 },
    enchant: { size: 14, em: 0.4667, z: 4, control: "Enchant", color: "#A34EEB", border: 2 },
    unique: { size: 40, em: 1.3333, z: 1, control: "Effect", url: "/imgs/webp/T_Season_Tips_Point_03.webp" },
    emptyGroove: {
        size: 36,
        em: 1.2,
        z: 0,
        control: "Groove_Empty",
        url: "/imgs/webp/T_Season_Tips_EmptyGroove.webp",
        colorHex: "#66C6BDAC",
        color: "rgba(198, 189, 172, 0.4)",
    },
}

/**
 * 插槽行标记（上游 `PointStyle` 3/4，WBP `WS_Point` 的 `Groove_Empty` / `Groove` 槽）。
 * 槽与词条标记槽同为 `TRANSCEND_MARK_SLOT_EM`；空孔 36 设计值运行时减半 18 = 1.2em，
 * 已镶嵌为同尺寸槽内的动态宝石图标（`Resource.Icon`），底图沿用空孔框。
 * 文本色调：`<EmptyGroove>` = `#66C6BDAC`（40% 米金），`<Title>` = `#C6BDAC`。
 */
export const TRANSCEND_GROOVE_MARKS = {
    emptyGroove: {
        pointStyle: 3,
        size: 36,
        em: 1.2,
        control: "Groove_Empty",
        url: "/imgs/webp/T_Season_Tips_EmptyGroove.webp",
        colorHex: "#66C6BDAC",
        color: "rgba(198, 189, 172, 0.4)",
        labelKey: "transcend-build.gear_socket_empty",
    },
    occupiedGroove: {
        pointStyle: 4,
        size: 36,
        iconSize: 28,
        em: 1.2,
        /** 宝石图标无上游尺寸证据，与空孔同比例 1.2em（产品一致性选择） */
        iconEm: 1.2,
        control: "Groove",
        colorHex: "#C6BDAC",
        color: "#c6bdac",
        textClass: "text-affix-title",
    },
} as const

/** 槽型图标；未知 slotType 回退纹饰（与替换前 `v-else` 分支口径一致） */
export function transcendSlotIcon(slotType: number): TranscendIconSpec {
    return TRANSCEND_SLOT_ICONS[slotType as keyof typeof TRANSCEND_SLOT_ICONS] ?? TRANSCEND_SLOT_ICONS[11]
}

/**
 * mask 样式（同时给标准属性与 Webkit 前缀：WebView2 / 旧 Safari 仍认带前缀版本）。
 * @param url 贴图地址（`/imgs/webp/*.webp`）
 * @param maskSize mask-size 单值百分比
 */
export function transcendIconMaskStyle(url: string, maskSize: string) {
    return {
        maskImage: `url("${url}")`,
        maskSize,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url("${url}")`,
        WebkitMaskSize: maskSize,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
    }
}
