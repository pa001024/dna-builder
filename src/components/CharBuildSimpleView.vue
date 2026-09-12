<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { type CSSProperties, computed, onBeforeUnmount, onMounted, ref } from "vue"
import type { IconTypes } from "@/components/Icon.vue"
import { useAttrI18n } from "@/composables/useAttrI18n"
import type { CharSettings } from "@/composables/useCharSettings"
import {
    type CharAttr,
    type CharBuild,
    charMap,
    LeveledChar,
    type LeveledMod,
    type LeveledSkillWeapon,
    LeveledWeapon,
    type WeaponAttr,
    weaponMap,
} from "@/data"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"

/**
 * 角色构筑「简洁模式」——全屏次世代 HUD 风格的装配总览。
 *
 * 与专业模式（CharBuildView 的三栏编辑器）互补：本组件只读，不修改任何构筑数据、不落盘，
 * 因此对现有构筑逻辑零侵入。展示的主干信息为：
 * 角色身份（等级/元素/技能）· 协战队友与队友武器 · 武器装配（近战/远程/同律）·
 * 魔之楔装配与耐受负荷 · 核心属性 · 伤害输出。
 *
 * 视觉上分三层：视差场景层（立绘/地面网格/辉光/尘埃）、3D 装配舞台（环形核心 + 武器节点）、
 * HUD 面板层（切角面板与等宽数字）。指针或手指移动会写入 --sc-px / --sc-py 两个归一化变量，
 * 各图层按自己的深度系数消费它们，从而形成纵深视差。
 */

const props = defineProps<{
    /** 当前构筑（数据包未就绪时可能是 CharBuildView 提供的空构筑占位对象） */
    charBuild: CharBuild
    /** 角色综合属性（CharBuild.calculateWeaponAttributes 的结果，附带 weapon 子对象） */
    attributes: CharAttr & { weapon?: WeaponAttr }
    /** 当前角色的本地配置（技能选择、技能等级、和鸣增益等主干信息） */
    charSettings: CharSettings
    /** 角色显示名（取自路由，数据未就绪时也能显示标题） */
    charName: string
}>()

const emit = defineEmits<{
    /** 请求切回专业模式 */
    switchMode: []
    /** 从「浏览构筑分享」里选用一份他人构筑，交由父组件落盘 */
    useBuild: [settings: CharSettings]
}>()

const { t } = useTranslation()
const { getAttrName } = useAttrI18n()
const ui = useUIStore()

//#region 主题与场景
/** 元素主题：HUD 强调色跟随角色元素，让不同角色呈现不同的战场氛围 */
const ELEMENT_ACCENTS: Record<string, { main: string; soft: string }> = {
    火: { main: "#ff6f43", soft: "#ffb489" },
    水: { main: "#3fa9ff", soft: "#93d4ff" },
    风: { main: "#3ee0a4", soft: "#9ff0d0" },
    雷: { main: "#a97bff", soft: "#d6bcff" },
    光: { main: "#ffc94d", soft: "#ffe6a3" },
    暗: { main: "#c765ff", soft: "#e8b5ff" },
}

/** 元素缺失（空构筑占位对象）时的中性强调色 */
const DEFAULT_ACCENT = { main: "#68b6ff", soft: "#a9d8ff" }

/** 数据包与角色数据是否就绪：空构筑占位对象没有 CharBuild 的方法与 mod 数组，未就绪时一律走安全分支 */
const ready = computed(() => Number(props.charBuild.char.id) > 0)

/**
 * 强调色的透明度阶梯。
 * 样式全部走 Tailwind 工具类后，模板里统一写 `var(--sc-accent-NN)`，
 * 比到处重复 `color-mix(in srgb, var(--sc-accent) NN%, transparent)` 短得多，也好改。
 */
const ACCENT_STEPS = [8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 34, 38, 40, 42, 45, 46, 52, 55, 62, 70] as const

/**
 * 根节点样式：注入基础调色板、元素强调色（含派生阶梯）与角色立绘地址。
 * 这些值都要参与 Tailwind 的任意值写法（`var(--sc-*)`），因此只能作为内联变量下发。
 */
const accentStyle = computed(() => {
    const theme = ELEMENT_ACCENTS[props.charBuild.char.属性] ?? DEFAULT_ACCENT
    const illustration = props.charBuild.char.bustUrl
    const style: Record<string, string> = {
        "--sc-bg-0": "#04060c",
        "--sc-bg-1": "#0a1120",
        "--sc-line": "rgba(255, 255, 255, 0.1)",
        "--sc-line-strong": "rgba(255, 255, 255, 0.22)",
        "--sc-text": "rgba(236, 243, 255, 0.94)",
        "--sc-text-dim": "rgba(190, 206, 232, 0.62)",
        "--sc-accent": theme.main,
        "--sc-accent-soft": theme.soft,
        "--sc-illust": illustration ? `url("${illustration}")` : "none",
    }
    for (const step of ACCENT_STEPS) {
        style[`--sc-accent-${step}`] = `color-mix(in srgb, ${theme.main} ${step}%, transparent)`
    }
    return style as CSSProperties
})

/** 魔之楔品质色：与游戏内稀有度一一对应（金/紫/蓝/绿/白） */
const QUALITY_COLORS: Record<string, string> = {
    金: "#f2c14e",
    紫: "#b06bff",
    蓝: "#4a9bff",
    绿: "#4bd07a",
    白: "#c3ccd9",
}

/** 空槽位的品质底色（中性灰） */
const EMPTY_QUALITY_COLOR = "rgba(255, 255, 255, 0.18)"

/**
 * 魔之楔槽位的品质配色。
 * 描边色是纯色，模板里用 `border-l-(--sc-quality)` 引用；
 * 底色需要把品质色插进渐变里，无法预先写成 Tailwind 类，只能内联。
 * @param quality 品质（金/紫/蓝/绿/白）；空槽传 undefined
 * @returns 内联样式（--sc-quality 与品质色渐变底）
 */
function qualityStyle(quality?: string) {
    const color = (quality && QUALITY_COLORS[quality]) || EMPTY_QUALITY_COLOR
    return {
        "--sc-quality": color,
        background: `linear-gradient(120deg, color-mix(in srgb, ${color} 16%, transparent), rgba(0, 0, 0, 0.34))`,
    }
}

/**
 * 生成场景尘埃粒子。
 * 使用固定种子的线性同余伪随机，保证每次挂载的分布一致（避免刷新时粒子跳变）；
 * 动画时长/延迟/横向漂移都由内联样式字符串给出，CSS 只负责上浮与淡入淡出。
 * @param count 粒子数量
 * @returns 粒子列表（含内联样式字符串）
 */
function createMotes(count: number): { id: number; style: string }[] {
    const motes: { id: number; style: string }[] = []
    let seed = 20240607
    /** 推进伪随机序列 */
    const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
    }
    for (let i = 0; i < count; i++) {
        const size = +(1 + next() * 2.2).toFixed(2)
        const left = +(next() * 100).toFixed(2)
        const duration = +(9 + next() * 12).toFixed(2)
        const delay = +(-next() * 18).toFixed(2)
        const drift = +((next() - 0.5) * 90).toFixed(1)
        motes.push({
            id: i,
            style: `left:${left}%;width:${size}px;height:${size}px;animation-duration:${duration}s;animation-delay:${delay}s;--sc-mote-drift:${drift}px`,
        })
    }
    return motes
}

const MOTES = createMotes(14)
//#endregion

//#region 3D 视差
const rootEl = ref<HTMLElement | null>(null)

/** 目标视差量（-1..1） */
let targetPx = 0
let targetPy = 0
/** 当前渲染的视差量：rAF 以阻尼插值逼近目标，避免指针抖动直接传到画面 */
let curPx = 0
let curPy = 0
let rafId = 0
let reducedMotion = false

/** 每帧向目标逼近的比例（越小越「重」） */
const DAMPING = 0.085
/** 收敛阈值：低于该差值即认为稳定并停掉 rAF */
const SETTLE = 0.0006

/**
 * 把数值收敛到 [min, max]。
 * @param value 原始值
 * @param min 下界
 * @param max 上界
 * @returns 收敛后的值
 */
function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

/** 把当前视差量写入根节点的 CSS 变量，供各图层以各自的深度系数消费 */
function writeParallaxVars() {
    const el = rootEl.value
    if (!el) return
    el.style.setProperty("--sc-px", curPx.toFixed(4))
    el.style.setProperty("--sc-py", curPy.toFixed(4))
}

/** 启动 rAF 缓动循环（幂等） */
function startParallaxLoop() {
    if (!rafId) rafId = requestAnimationFrame(tickParallax)
}

/**
 * 每帧以阻尼插值逼近目标视差量；稳定后写入最终值并停止循环，避免空转占用主线程。
 */
function tickParallax() {
    curPx += (targetPx - curPx) * DAMPING
    curPy += (targetPy - curPy) * DAMPING
    const settled = Math.abs(targetPx - curPx) < SETTLE && Math.abs(targetPy - curPy) < SETTLE
    if (settled) {
        curPx = targetPx
        curPy = targetPy
    }
    writeParallaxVars()
    if (settled) {
        rafId = 0
        return
    }
    rafId = requestAnimationFrame(tickParallax)
}

/** 关闭视差操作提示：用户一旦真的操作（移动指针/滚动）就不再显示 */
function dismissHint() {
    if (!showHint.value) return
    showHint.value = false
    if (hintTimer) {
        window.clearTimeout(hintTimer)
        hintTimer = 0
    }
}

/**
 * 指针/手指移动：把视口坐标归一化到 [-1, 1] 后写入目标视差量。
 * @param event 指针事件
 */
function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return
    dismissHint()
    const rect = rootEl.value?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    targetPx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1)
    targetPy = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1)
    startParallaxLoop()
}

/** 指针离开：视差回归中位 */
function onPointerLeave() {
    if (reducedMotion) return
    targetPx = 0
    targetPy = 0
    startParallaxLoop()
}
//#endregion

//#region 主干信息
/**
 * 角色属性区展示顺序：攻击 / 生命 + 技能四维（威力 · 耐久 · 效益 · 范围）。
 * 这六项是构筑的主干读数，其余乘区与细节属性留在专业模式。
 */
const CHAR_ATTR_KEYS = ["攻击", "生命", "技能威力", "技能耐久", "技能效益", "技能范围"]
/** 按数值（而非百分比）展示的角色属性 */
const FLAT_CHAR_ATTRS = new Set(["攻击", "生命", "护盾", "防御", "神智", "有效生命"])

/** 单个属性展示行 */
interface AttrRow {
    /** 属性键名 */
    key: string
    /** 属性的展示名（同时是翻译键） */
    label: string
    /** 已格式化的数值文本 */
    value: string
}

/**
 * 从属性对象中按给定顺序挑出可展示的主干属性行。
 * @param source 属性来源对象（角色属性 / 武器属性）
 * @param keys 期望展示的属性键顺序
 * @param attackPrefix 「攻击」行需要拼上的元素或伤害类型前缀
 * @param flatKeys 按数值展示（而非百分比）的属性集合
 * @param keepZero 是否保留数值为 0 的属性（主干读数固定六项时保留，避免整块少行）
 * @returns 展示行列表
 */
function pickAttrRows(
    source: object | undefined,
    keys: readonly string[],
    attackPrefix: string,
    flatKeys: Set<string>,
    keepZero = false
): AttrRow[] {
    if (!source) return []
    const record = source as Record<string, unknown>
    const rows: AttrRow[] = []
    for (const key of keys) {
        const raw = record[key]
        if (typeof raw !== "number" || !Number.isFinite(raw)) continue
        if (raw === 0 && !keepZero) continue
        rows.push({ key, label: getAttrName(key, attackPrefix), value: formatAttrValue(key, raw, flatKeys) })
    }
    return rows
}

/**
 * 属性值的展示格式：数值型属性按保留位数展示，其余按百分比展示
 * （与角色属性面板、装配预览的约定保持一致）。
 * @param key 属性键名
 * @param value 属性值
 * @param flatKeys 按数值展示的属性集合
 * @returns 格式化后的字符串
 */
function formatAttrValue(key: string, value: number, flatKeys: Set<string>): string {
    if (flatKeys.has(key)) return `${+value.toFixed(key === "攻击" ? 2 : 0)}`
    return `${+(value * 100).toFixed(1)}%`
}

/** 角色核心属性行：攻击 / 生命 + 技能四维，固定六项（为 0 也保留，保证版面稳定） */
const charAttrRows = computed<AttrRow[]>(() => {
    if (!ready.value) return []
    return pickAttrRows(props.attributes, CHAR_ATTR_KEYS, `${props.charBuild.char.属性}属性`, FLAT_CHAR_ATTRS, true)
})

/** 技能槽位类型到短标签翻译键的映射（避免直接使用「角色/近战」这类长译名） */
const SKILL_TYPE_KEYS: Record<string, string> = {
    角色: "char-build.char",
    近战: "char-build.melee",
    远程: "char-build.ranged",
    同律: "char-build.skill",
}

/** 当前选中技能所属的槽位标签 */
const skillTypeLabel = computed(() => t(SKILL_TYPE_KEYS[props.charBuild.selectedSkillType] ?? "char-build.char"))

/** 当前选中技能名 */
const skillName = computed(() => props.charSettings.baseName)

/** 当前技能等级 */
const skillLevel = computed(() => props.charSettings.charSkillLevel)

/** 当前技能是否为召唤物技能（有召唤物时输出行额外标注召唤物名） */
const summonName = computed(() => (ready.value ? (props.charBuild.selectedSkill?.召唤物?.名称 ?? "") : ""))

/** 元素展示名（如「火属性」） */
const elementLabel = computed(() => {
    const element = props.charBuild.char.属性
    return element ? t(`${element}属性`) : ""
})

/** 和鸣增益百分比文本 */
const resonanceText = computed(() => `${+((props.charSettings.resonanceGain ?? 0) * 100).toFixed(0)}%`)

/** 总伤害（数据未就绪时为 0） */
const totalDamage = computed(() => (ready.value ? props.charBuild.calculate() : 0))

/**
 * 总伤害的展示文本：与榜单页面（RankingView）一致，取整后按千分位展示，
 * 避免同一份构筑在榜单与构筑页读出两个样。
 */
const damageText = computed(() => Math.round(totalDamage.value).toLocaleString())

/**
 * 伤害输出的标题：与榜单页面一致展示目标函数原样文本。
 * 注意不能把它交给 $t()——目标函数是形如「残光::伤害」的 AST 表达式，
 * i18next 会把 `::` 当成命名空间分隔符，从而解析出错误文案。
 */
const damageTitle = computed(() => props.charSettings.targetFunction)

/** 舞台上的武器槽位 */
interface StageWeapon {
    /** 槽位键名（同时是魔之楔页签的键，点击卡片即切到该页签） */
    key: string
    /** 槽位短标签 */
    label: string
    /** 已装备武器；未装备时为 null（用于展示空槽态） */
    weapon: LeveledWeapon | LeveledSkillWeapon | null
    /** 无真实图标时用于渲染技能遮罩图的 URL（目前只有特殊同律武器会用到） */
    maskUrl: string
}

/** 装配舞台上的武器节点：近战 / 远程 / 同律（未装备的槽位保留空态，让装配图完整） */
const stageWeapons = computed<StageWeapon[]>(() => {
    if (!ready.value) return []
    const build = props.charBuild
    const slots: StageWeapon[] = [
        { key: "melee", label: t("char-build.melee"), weapon: build.meleeWeapon.isEmpty ? null : build.meleeWeapon, maskUrl: "" },
        { key: "ranged", label: t("char-build.ranged"), weapon: build.rangedWeapon.isEmpty ? null : build.rangedWeapon, maskUrl: "" },
    ]
    // 特殊同律（如芙罗拉的「圆舞」）数据里没有 icon，只能按技能图标渲染
    if (build.skillWeapon) {
        const skillWeapon = build.skillWeapon
        slots.push({
            key: "skill",
            label: t("char-build.skill"),
            weapon: skillWeapon,
            maskUrl: hasRealSkillWeaponIcon(skillWeapon) ? "" : getSkillWeaponMaskUrl(skillWeapon),
        })
    }
    return slots
})

/**
 * 读取武器的精炼等级：同律武器没有精炼概念，返回 null 表示不展示。
 * @param weapon 武器
 * @returns 精炼等级或 null
 */
function weaponRefine(weapon: LeveledWeapon | LeveledSkillWeapon | null): number | null {
    const refine = (weapon as { 精炼?: number } | null)?.精炼
    return typeof refine === "number" ? refine : null
}

/**
 * 读取武器的技能等级：仅同律武器有该概念，其余返回 null 表示不展示。
 * @param weapon 武器
 * @returns 技能等级或 null
 */
function weaponSkillLevel(weapon: LeveledWeapon | LeveledSkillWeapon | null): number | null {
    const level = (weapon as { 技能等级?: number } | null)?.技能等级
    return typeof level === "number" ? level : null
}

/**
 * 判断同律武器是否存在可直接展示的真实图标。
 * 与专业模式（DBCharDetailItem / WeaponTab / 侧栏页签）保持同一条规则：
 * 数据里没有 icon 字段时 `LeveledSkillWeapon.url` 会落到占位路径 /imgs/webp/_.webp，
 * 而该文件并不存在，直接当普通武器渲染就会出现图片报错。
 * @param weapon 同律武器
 * @returns 是否存在真实图标
 */
function hasRealSkillWeaponIcon(weapon: LeveledSkillWeapon): boolean {
    return !!weapon._originalWeaponData.icon && !weapon.url.endsWith("/_.webp")
}

/**
 * 同律武器没有真实图标时用于兜底的技能图标（按遮罩着色渲染）。
 * 优先取同律配置 skill 指向的角色技能图标，其次退回同律自身技能的图标。
 * @param weapon 同律武器
 * @returns 技能图标 URL；两者都没有时返回空串
 */
function getSkillWeaponMaskUrl(weapon: LeveledSkillWeapon): string {
    const sourceSkill = props.charBuild.char.技能[(weapon._originalWeaponData.skill ?? [1])[0]]
    return sourceSkill?.url || weapon.技能?.[0]?.url || ""
}

/** 协战槽位的展示数据 */
interface TeamMember {
    /** 槽位序号（1/2），用于空位占位文案 */
    slot: number
    /** 队友角色名（未配置为空串） */
    charName: string
    /** 队友头像地址 */
    charIcon: string
    /** 队友元素（未配置为空串） */
    element: string
    /** 队友武器名（未配置为空串） */
    weaponName: string
    /** 队友武器图标地址 */
    weaponIcon: string
    /** 队友武器类型标签（未配置为空串） */
    weaponType: string
    /** 该队友在专业模式里关联的服务器构筑 id（未关联为空串，此时不可点击） */
    buildId: string
}

/**
 * 读取一个协战槽位的队友与队友武器展示信息。
 * 配置里未选择时 id 为 "-"，此时对应字段返回空串，模板按空位渲染；
 * 关联构筑同理：配置里用 "-" 占位，这里统一归一化为空串表示未关联。
 * @param slot 槽位序号（1/2）
 * @param charId 队友角色 id（"-" 表示未配置）
 * @param weaponId 队友武器 id（"-" 表示未配置）
 * @param buildId 队友关联的服务器构筑 id（"-" 表示未关联）
 * @returns 该槽位的展示数据
 */
function readTeamMember(slot: number, charId: number | "-", weaponId: number | "-", buildId: string): TeamMember {
    const char = typeof charId === "number" ? charMap.get(charId) : undefined
    const weapon = typeof weaponId === "number" ? weaponMap.get(weaponId) : undefined
    return {
        slot,
        charName: char?.名称 ?? "",
        charIcon: char ? LeveledChar.url(char.icon) : "",
        element: char?.属性 ?? "",
        weaponName: weapon?.名称 ?? "",
        weaponIcon: weapon ? LeveledWeapon.url(weapon.icon) : "",
        weaponType: weapon?.类型[0] ?? "",
        buildId: buildId && buildId !== "-" ? buildId : "",
    }
}

/**
 * 协战队友（角色 + 武器）。
 * 数据包已水合是本组件渲染的前提，因此这里可以直接读静态表；仍未配置的槽位保持空串。
 */
const teamMembers = computed<TeamMember[]>(() => {
    if (!ready.value) return []
    const settings = props.charSettings
    return [
        readTeamMember(1, settings.team1, settings.team1Weapon, settings.team1Build ?? "-"),
        readTeamMember(2, settings.team2, settings.team2Weapon, settings.team2Build ?? "-"),
    ]
})

/** 协战区是否有任何已配置内容（全空时整块不渲染，避免占位信息挤占版面） */
const hasTeam = computed(() => teamMembers.value.some(member => member.charName || member.weaponName))

//#region 协战构筑弹窗
/** 弹窗开关 */
const teamBuildShow = ref(false)
/** 弹窗展示的构筑 id（空串表示该队友未关联构筑） */
const teamBuildId = ref("")
/** 弹窗标题里的队友名（构筑拉取完成前占位） */
const teamBuildCharName = ref("")
/** 本次点击来源：角色 / 武器，用于打开后定位到对应区块 */
const teamBuildFocus = ref<"char" | "weapon">("char")

/**
 * 打开协战构筑弹窗（展示该队友关联构筑的魔之楔）。
 * @param member 协战槽位展示数据
 * @param focus 点击来源（角色 / 武器）
 */
function openTeamBuild(member: TeamMember, focus: "char" | "weapon") {
    teamBuildId.value = member.buildId
    teamBuildCharName.value = member.charName
    teamBuildFocus.value = focus
    teamBuildShow.value = true
}

/**
 * 生成协战角色/武器板块的交互属性。
 * 只有专业模式里关联过构筑的队友才可点击；未关联时返回空属性，元素保持原样（不改外观、不可点）。
 * 这里只给已有的展示元素挂事件，不新增包裹层，保持简洁模式协战区的原有结构与排版。
 * @param member 协战槽位展示数据
 * @param focus 点击来源（角色 / 武器）
 * @returns 需要绑定的属性（class / title / 事件）
 */
function teamBuildAttrs(member: TeamMember, focus: "char" | "weapon") {
    if (!member.buildId) return {}
    return {
        // 可点击态的样式直接给 Tailwind 类：组件已不再保留自定义 CSS
        class: "cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--sc-line-strong)",
        title: t("char-build.team_view_build", { name: t(member.charName) }),
        role: "button",
        tabindex: 0,
        onClick: () => openTeamBuild(member, focus),
        onKeydown: (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            openTeamBuild(member, focus)
        },
    }
}
//#endregion

/**
 * 读取武器的副标题：把类别与伤害类型拼成一行（如「长柄 · 切割」）。
 * @param weapon 武器
 * @returns 副标题文本
 */
function weaponSubtitle(weapon: LeveledWeapon | LeveledSkillWeapon | null): string {
    if (!weapon) return ""
    return [weapon.类别, weapon.伤害类型]
        .filter(Boolean)
        .map(item => t(item))
        .join(" · ")
}
//#endregion

//#region 魔之楔
/** 魔之楔页签 */
interface ModTab {
    /** 槽位类型（CharBuild.getMods 的参数） */
    key: string
    /** 展示名 */
    label: string
    /** 对应武器槽位是否已装备 */
    available: boolean
    /** 已装配数量 */
    count: number
}

/** 当前查看的魔之楔页签 */
const modTab = ref("角色")

/**
 * 统计一套魔之楔中已装配的数量。
 * @param mods 槽位数组（空槽为 null）
 * @returns 已装配数量
 */
function countMods(mods?: (LeveledMod | null)[] | null): number {
    return (mods ?? []).filter((mod): mod is LeveledMod => !!mod).length
}

/**
 * 可查看的魔之楔页签列表。
 * 存在同律武器时始终列出「同律」页签（与专业模式的页签一致）：
 * 继承型同律（inherit）的魔之楔来自被继承的武器槽位，CharBuild.getMods 会自动重定向到近战/远程，
 * 因此这里只需按被继承的槽位是否已装备来决定能否配置。
 */
const modTabs = computed<ModTab[]>(() => {
    if (!ready.value) return []
    const build = props.charBuild
    const tabs: ModTab[] = [
        { key: "角色", label: t("char-build.char"), available: true, count: countMods(build.charMods) },
        { key: "近战", label: t("char-build.melee"), available: !build.meleeWeapon.isEmpty, count: countMods(build.meleeMods) },
        { key: "远程", label: t("char-build.ranged"), available: !build.rangedWeapon.isEmpty, count: countMods(build.rangedMods) },
    ]
    const skillWeapon = build.skillWeapon
    if (skillWeapon) {
        const inheritedSlot = skillWeapon.inherit === "melee" ? "近战" : skillWeapon.inherit === "ranged" ? "远程" : ""
        // 非继承型用同律自身槽位；继承型跟随被继承的武器槽位
        const available = inheritedSlot === "近战" ? !build.meleeWeapon.isEmpty : inheritedSlot === "远程" ? !build.rangedWeapon.isEmpty : true
        tabs.push({
            key: "同律",
            label: t("char-build.skill"),
            available,
            count: countMods(inheritedSlot === "" ? build.skillMods : inheritedSlot === "近战" ? build.meleeMods : build.rangedMods),
        })
    }
    return tabs
})

/** 实际生效的页签：选择的页签在当前构筑下不存在时回落到第一个 */
const activeModTab = computed(() => {
    const tabs = modTabs.value
    if (!tabs.some(tab => tab.key === modTab.value)) return "角色"
    return modTab.value
})

/** 当前页签的元信息（恒定有值，未就绪时为角色页签占位） */
const currentModTab = computed<ModTab>(
    () => modTabs.value.find(tab => tab.key === activeModTab.value) ?? { key: "角色", label: t("char-build.char"), available: true, count: 0 }
)

/** 当前页签的普通槽位（角色页签的最后一格是中枢魔之楔，单独一行展示） */
const activeModSlots = computed<(LeveledMod | null | undefined)[]>(() => {
    if (!ready.value) return []
    const slots = props.charBuild.getMods(activeModTab.value)
    return activeModTab.value === "角色" ? slots.slice(0, -1) : slots
})

/** 中枢（光环）魔之楔，仅在角色页签展示 */
const auraMod = computed<LeveledMod | null>(() => {
    if (!ready.value || activeModTab.value !== "角色") return null
    return props.charBuild.auraMod ?? null
})

/** 当前页签的耐受负荷（按极化方案削减后的有效负荷 / 耐受上限） */
const capacity = computed(() => {
    if (!ready.value) return { load: 0, cap: 0, percent: 0, over: false }
    const tab = activeModTab.value
    const cap = props.charBuild.getModCap(tab)
    const load = props.charBuild.getModCostMax(tab)
    return {
        load,
        cap,
        percent: cap > 0 ? Math.min(100, Math.round((load / cap) * 100)) : 0,
        over: load > cap,
    }
})

/** 武器槽位键 → 魔之楔页签键 */
const SLOT_TO_MOD_TAB: Record<string, string> = { melee: "近战", ranged: "远程", skill: "同律" }

/**
 * 点击装配舞台上的武器卡：把魔之楔面板切到对应页签。
 * 装配区与魔之楔面板不同屏时（窄屏单栏）顺手滚过去，避免「点了没反应」。
 * @param key 武器槽位键（melee / ranged / skill）
 */
function focusWeaponSlot(key: string) {
    const tab = SLOT_TO_MOD_TAB[key]
    if (tab && modTabs.value.some(item => item.key === tab)) modTab.value = tab
    const section = bodyEl.value?.querySelector<HTMLElement>('[data-section="mods"]')
    if (section && section.getBoundingClientRect().top > window.innerHeight * 0.6) scrollToSection("mods")
}
//#endregion


/**
 * 武器卡的三种态（选中 / 空槽 / 普通）× 互斥工具类。
 *
 * 迁移到 Tailwind 后，同一条 CSS 属性只能由一个工具类负责：静态 class 与动态 class 都写
 * border-color / background 时，胜负取决于样式表里的先后而不是 class 书写顺序，
 * 于是会出现「加了 is-active 却看不出高亮」。所以态相关的类整套在这里给出，静态 class 只留排版。
 */
const WEAPON_CARD_SKIN = {
    active: "border-(--sc-accent-62) border-l-(--sc-accent-70) bg-[linear-gradient(150deg,var(--sc-accent-22),rgba(255,255,255,0.03))] shadow-[0_0_0_1px_var(--sc-accent-40)]",
    empty: "border-dashed border-(--sc-line) border-l-white/18 bg-[linear-gradient(150deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] opacity-66 hover:border-(--sc-line-strong) hover:bg-[linear-gradient(150deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]",
    normal: "border-(--sc-line) border-l-(--sc-accent-70) bg-[linear-gradient(150deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] hover:border-(--sc-line-strong) hover:bg-[linear-gradient(150deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]",
} as const

/**
 * 武器卡的状态样式。
 * @param slot 槽位展示数据
 * @returns class 绑定（互斥的态样式 + 语义钩子）
 */
function weaponCardClass(slot: StageWeapon): (string | Record<string, boolean>)[] {
    const active = SLOT_TO_MOD_TAB[slot.key] === activeModTab.value
    return [
        active ? WEAPON_CARD_SKIN.active : slot.weapon ? WEAPON_CARD_SKIN.normal : WEAPON_CARD_SKIN.empty,
        { "is-empty": !slot.weapon, "is-active": active },
    ]
}

/**
 * 魔之楔页签的状态样式（互斥，理由同 WEAPON_CARD_SKIN）。
 * @param key 页签键
 * @returns class 绑定
 */
function modTabClass(key: string): string {
    return activeModTab.value === key
        ? "is-on border-(--sc-accent-62) bg-(--sc-accent-16) text-(--sc-text)"
        : "border-(--sc-line) bg-transparent text-(--sc-text-dim) hover:border-(--sc-line-strong) hover:text-(--sc-text)"
}

/**
 * 移动端底部页签的状态样式（互斥，理由同 WEAPON_CARD_SKIN）。
 * @param key 区块键
 * @returns class 绑定
 */
function mobileTabClass(key: string): string {
    return activeSection.value === key ? "is-on border-t-(--sc-accent) text-(--sc-accent-soft)" : "border-t-transparent text-(--sc-text-dim)"
}

/**
 * 耐受负荷条的填充样式（正常 / 超限互斥）。
 * @returns class 绑定
 */
function capacityFillClass(): string {
    return capacity.value.over
        ? "is-over bg-[linear-gradient(90deg,#ff6a3d,#ff3d6e)] shadow-[0_0_12px_rgba(255,61,110,0.7)]"
        : "bg-[linear-gradient(90deg,var(--sc-accent-55),var(--sc-accent))] shadow-[0_0_12px_var(--sc-accent-70)]"
}

/**
 * 耐受负荷数值的颜色（正常 / 超限互斥）。
 * @returns class 绑定
 */
function capacityValueClass(): string {
    return capacity.value.over ? "is-over text-[#ff7a8f]" : "text-(--sc-text)"
}

/**
 * 当前魔之楔页签对应的社区代码。
 * 与专业模式「复制代码」同一来源（CharBuild.getCode），社区里交换魔之楔方案用的就是这串字符；
 * 继承型同律由 getCode 自行重定向到被继承的近战/远程槽位。
 */
const modCode = computed(() => (ready.value ? props.charBuild.getCode(activeModTab.value) : ""))

/**
 * 复制社区代码到剪贴板。
 * 只读组件里唯一的「输出」动作：不改任何构筑状态，只把现成的代码串交给剪贴板。
 */
async function copyModCode() {
    if (!modCode.value) return
    try {
        await copyText(modCode.value)
        ui.showSuccessMessage(t("char-build.copied_to_clipboard"))
    } catch (error) {
        ui.showErrorMessage(t("char-build.copy_failed"), error instanceof Error ? error.message : "")
    }
}

//#region 移动端页签
const bodyEl = ref<HTMLElement | null>(null)

/** 移动端页签对应的区块顺序（必须与模板中的 DOM 顺序一致，滚动高亮依赖它） */
const SECTIONS = ["stage", "identity", "mods", "stats", "output"] as const

/** 当前处在视口内的区块 */
const activeSection = ref<string>(SECTIONS[0])

/** 移动端底部页签定义 */
const mobileTabs = computed<{ key: string; label: string; icon: IconTypes }[]>(() => [
    { key: "stage", label: t("char-build.equipment_preview"), icon: "ri:gamepad-line" },
    { key: "identity", label: t("char-build.char"), icon: "ri:user-line" },
    { key: "mods", label: t("魔之楔"), icon: "ri:puzzle-line" },
    { key: "stats", label: t("char-build.simple_key_stats"), icon: "ri:bar-chart-line" },
    { key: "output", label: t("char-build.damage"), icon: "ri:flashlight-line" },
])

/**
 * 内容区滚动：把「已越过视口上方 30% 线」的最后一个区块作为当前页签，用于移动端页签高亮。
 * 同时关闭视差操作提示——用户已经在滚动了，提示没有存在意义。
 */
function onBodyScroll() {
    dismissHint()
    const el = bodyEl.value
    if (!el) return
    const line = el.scrollTop + el.clientHeight * 0.3
    let current: string = SECTIONS[0]
    for (const key of SECTIONS) {
        const section = el.querySelector<HTMLElement>(`[data-section="${key}"]`)
        if (section && section.offsetTop <= line) current = key
    }
    if (current !== activeSection.value) activeSection.value = current
}

/**
 * 移动端页签点击：把内容区平滑滚动到对应区块。
 * @param key 区块标识
 */
function scrollToSection(key: string) {
    dismissHint()
    const el = bodyEl.value
    const section = el?.querySelector<HTMLElement>(`[data-section="${key}"]`)
    if (!el || !section) return
    el.scrollTo({ top: Math.max(0, section.offsetTop - 8), behavior: "smooth" })
    activeSection.value = key
}
//#endregion

//#region 构筑分享浏览
/** 「浏览构筑分享」弹窗开关 */
const browseBuildsShow = ref(false)

/**
 * 在浏览弹窗里选用某份构筑：直接把配置交给父组件落盘（与专业模式的配装分享同一条路径），
 * 本组件自身仍然不写任何构筑数据。
 * @param settings 选中的构筑配置
 */
function onUseSharedBuild(settings: CharSettings) {
    browseBuildsShow.value = false
    emit("useBuild", settings)
}
//#endregion

/** 视差操作提示：进入页面时短暂显示后自动隐藏 */
const showHint = ref(true)
let hintTimer = 0

onMounted(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    hintTimer = window.setTimeout(() => {
        showHint.value = false
    }, 7000)
})

onBeforeUnmount(() => {
    if (rafId) cancelAnimationFrame(rafId)
    if (hintTimer) window.clearTimeout(hintTimer)
})
</script>

<template>
    <!--
        简洁模式的全部外观都由 Tailwind 工具类表达，本组件不再保留任何自定义 CSS
        （仅有的两条自定义动画 mote-rise / hint-fade 放在全局 style.css 的 @theme 里）。
        需要运行时注入的只有三样东西：
        1) 根节点上的 --sc-* 调色板与元素强调色（供任意值写法 var(--sc-*) 消费）；
        2) 视差变量 --sc-px / --sc-py（由指针驱动的归一化 -1..1）；
        3) 每个尘埃粒子的时长/延迟/漂移（伪随机生成，没法预先写成类）。
    -->
    <div
        ref="rootEl"
        class="sc relative isolate flex h-full w-full flex-col overflow-hidden bg-(--sc-bg-0) text-(--sc-text)"
        :style="accentStyle"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerLeave"
    >
        <!-- 场景层：立绘 / 地面网格 / 辉光 / 尘埃 / 扫描线 / 暗角，全部纯装饰 -->
        <div
            class="sc-scene pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[radial-gradient(120%_90%_at_50%_6%,var(--sc-accent-12),transparent_62%),linear-gradient(180deg,var(--sc-bg-1),var(--sc-bg-0)_68%)]"
            aria-hidden="true"
        >
            <!-- 角色立绘（CDN 大图）：视差幅度最小，读作「远处的战场」 -->
            <div
                class="sc-illust absolute top-[-6%] right-[-4%] bottom-[-6%] left-[18%] bg-(image:--sc-illust) bg-position-[center_22%] bg-cover opacity-42 will-change-transform mask-[linear-gradient(90deg,transparent,#000_26%,#000_74%,transparent)] filter-[saturate(0.92)_contrast(1.04)] transform-[translate3d(calc(var(--sc-px,0)*-16px),calc(var(--sc-py,0)*-10px),0)_scale(1.04)] motion-reduce:transform-none"
            />
            <!-- 立绘底部渐隐，避免与地面网格硬接 -->
            <div class="absolute inset-0 bg-[linear-gradient(180deg,transparent_34%,rgba(4,6,12,0.72)_78%,var(--sc-bg-0))]" />
            <!-- 透视地面网格：科幻 HUD 的空间基准面 -->
            <div
                class="absolute bottom-[-18%] left-1/2 ml-[-95%] h-[62%] w-[190%] bg-[repeating-linear-gradient(90deg,var(--sc-accent-42)_0_1px,transparent_1px_72px),repeating-linear-gradient(0deg,var(--sc-accent-30)_0_1px,transparent_1px_56px)] opacity-34 mask-[radial-gradient(120%_86%_at_50%_100%,#000_12%,transparent_72%)] transform-[perspective(560px)_rotateX(70deg)] origin-[50%_100%]"
            />
            <!-- 元素辉光：随指针同向位移，制造光晕在场景中的纵深 -->
            <div
                class="absolute top-[44%] left-1/2 size-[min(62vw,720px)] bg-[radial-gradient(circle,var(--sc-accent-26)_0%,transparent_62%)] opacity-70 will-change-transform transform-[translate(-50%,-50%)_translate3d(calc(var(--sc-px,0)*26px),calc(var(--sc-py,0)*20px),0)] motion-reduce:transform-[translate(-50%,-50%)]"
            />
            <!-- 尘埃：自下而上缓慢上浮的微粒 -->
            <div class="absolute inset-0">
                <span
                    v-for="mote in MOTES"
                    :key="mote.id"
                    class="sc-mote absolute bottom-[-6%] rounded-full bg-(--sc-accent-soft) opacity-0 animate-mote-rise motion-reduce:animate-none"
                    :style="mote.style"
                />
            </div>
            <!-- 扫描线：加一层 CRT 质感 -->
            <div
                class="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_3px)] opacity-16 mix-blend-overlay"
            />
            <!-- 暗角：把视觉焦点收进中央 -->
            <div class="absolute inset-0 bg-[radial-gradient(120%_88%_at_50%_46%,transparent_42%,rgba(0,0,0,0.62)_100%)]" />
        </div>

        <!-- 顶部 HUD：身份 + 浏览分享 + 模式切换 -->
        <header
            class="sc-head relative z-3 flex flex-wrap items-center gap-2.5 border-b border-(--sc-line) bg-[linear-gradient(180deg,rgba(6,10,20,0.86),rgba(6,10,20,0.32))] px-4 pt-3.5 pb-2"
        >
            <div class="sc-head-id flex min-w-0 flex-[1_1_auto] items-center gap-2.5">
                <span
                    v-if="elementLabel"
                    class="sc-emblem grid size-8.5 flex-none place-items-center border border-(--sc-accent-45) bg-(--sc-accent-14) [clip-path:polygon(0_0,100%_0,100%_72%,72%_100%,0_100%)]"
                >
                    <img :src="charBuild.char.elementUrl" alt="" class="size-5.5 object-contain" />
                </span>
                <div class="min-w-0">
                    <div class="sc-kicker text-[9px] tracking-[0.34em] text-(--sc-text-dim) uppercase">
                        {{ $t("char-build.equipment_preview") }}
                    </div>
                    <h1
                        class="sc-name m-0 truncate text-[19px] leading-[1.15] font-bold tracking-[0.02em] text-shadow-[0_0_22px_var(--sc-accent-55)]"
                    >
                        {{ $t(charName) }}
                    </h1>
                </div>
                <span
                    v-if="elementLabel"
                    class="sc-chip flex-none border border-(--sc-accent-38) bg-(--sc-accent-10) px-2.25 py-0.75 text-[10px] tracking-[0.14em] text-(--sc-accent-soft) [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
                >
                    {{ elementLabel }}
                </span>
                <span
                    v-if="ready"
                    class="sc-chip sc-chip--lv flex-none border border-(--sc-accent-38) bg-(--sc-accent-10) px-2.25 py-0.75 font-orbitron text-[10px] tracking-[0.14em] text-(--sc-accent-soft) tabular-nums [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
                >
                    LV.{{ charBuild.char.等级 }}
                </span>
            </div>
            <div class="sc-head-actions flex flex-none items-center gap-1.5">
                <button
                    v-if="ready"
                    type="button"
                    class="sc-browse inline-flex h-7.5 cursor-pointer items-center gap-1.25 border border-(--sc-accent-38) bg-(--sc-accent-10) px-3 text-[11px] tracking-[0.08em] text-(--sc-accent-soft) transition-colors duration-200 hover:border-(--sc-accent-70) hover:bg-(--sc-accent-20) hover:text-(--sc-text) focus-visible:border-(--sc-accent-70) focus-visible:bg-(--sc-accent-20) focus-visible:text-(--sc-text) focus-visible:outline-none"
                    :title="$t('char-build.share_build')"
                    @click="browseBuildsShow = true"
                >
                    <Icon icon="ri:file-list-line" class="size-3.5" />
                    {{ $t("char-build.simple_browse") }}
                </button>
                <!-- 模式切换：当前模式为静态标识，另一模式为可点按钮 -->
                <div
                    class="sc-mode flex flex-none gap-0.5 border border-(--sc-line) bg-white/4 p-0.5"
                    role="group"
                    :aria-label="$t('char-build.simple_mode')"
                >
                    <span
                        class="sc-mode-item is-on inline-flex h-6.5 cursor-default items-center bg-[linear-gradient(180deg,var(--sc-accent-soft),var(--sc-accent))] px-3 text-[11px] tracking-[0.08em] text-[#05070d]"
                    >
                        {{ $t("char-build.simple_mode") }}
                    </span>
                    <button
                        type="button"
                        class="sc-mode-item inline-flex h-6.5 cursor-pointer items-center border-0 bg-transparent px-3 text-[11px] tracking-[0.08em] text-(--sc-text-dim) transition-colors duration-200 hover:bg-white/8 hover:text-(--sc-text)"
                        :title="$t('char-build.switch_to_pro')"
                        @click="emit('switchMode')"
                    >
                        {{ $t("char-build.pro_mode") }}
                    </button>
                </div>
            </div>
        </header>

        <!-- 浏览构筑分享：复用专业模式「配装分享」的列表组件，本组件本身不写构筑数据 -->
        <DialogModel v-model="browseBuildsShow" class="bg-base-300 w-11/12 max-w-5xl">
            <div class="flex h-[68vh] min-h-72 flex-col">
                <div class="flex flex-none items-center gap-2 border-b border-base-content/10 pb-3">
                    <Icon icon="ri:file-list-line" class="size-4 shrink-0 text-primary" />
                    <h3 class="text-base font-bold">{{ $t("char-build.share_build") }}</h3>
                </div>
                <DOBBuildShow
                    v-if="browseBuildsShow"
                    :char-id="charBuild.char.id"
                    class="min-h-0 flex-1"
                    @use-build="onUseSharedBuild"
                />
            </div>
            <template #action>
                <button type="button" class="btn btn-sm" @click="browseBuildsShow = false">
                    {{ $t("char-build.simple_close") }}
                </button>
            </template>
        </DialogModel>

        <!-- 数据未就绪：保持同样的场景，只把主体换成载入提示 -->
        <div v-if="!ready" class="sc-boot relative z-2 flex flex-1 flex-col items-center justify-center gap-4.5">
            <span class="sc-boot-ring size-11.5 animate-spin rounded-full border-2 border-(--sc-line) border-t-(--sc-accent) [animation-duration:1.1s] motion-reduce:animate-none" />
            <span class="sc-boot-text text-[11px] tracking-[0.3em] text-(--sc-text-dim) uppercase">{{ $t("char-build.simple_loading") }}</span>
        </div>

        <div v-else ref="bodyEl" class="sc-body relative z-2 grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto overscroll-contain px-3.5 pt-2.5 pb-24 [grid-template-areas:'stage'_'identity'_'mods'_'stats'_'output'] auto-rows-min lg:grid-cols-[minmax(230px,0.86fr)_minmax(0,1.7fr)_minmax(280px,1fr)] lg:content-stretch lg:gap-3.5 lg:px-4 lg:pt-3.5 lg:pb-4 lg:auto-rows-auto lg:[grid-template-areas:'identity_stage_mods'_'stats_stage_mods'_'output_output_mods']" @scroll.passive="onBodyScroll">
            <!-- 装配舞台 -->
            <section class="sc-stage relative flex min-h-85 flex-col overflow-hidden border border-(--sc-line) bg-[radial-gradient(78%_58%_at_50%_42%,var(--sc-accent-14),transparent_70%),linear-gradient(180deg,rgba(10,16,30,0.55),rgba(4,6,12,0.2))] [clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)] [grid-area:stage] lg:min-h-110" data-section="stage">
                <div class="sc-deck grid flex-[1_1_auto] place-items-center px-1.5 pt-13.5 pb-5 perspective-distant lg:px-2.5 lg:pt-16 lg:pb-6.5">
                    <div class="sc-deck-inner flex w-full rotate-x-[calc(var(--sc-py,0)*-6deg)] rotate-y-[calc(var(--sc-px,0)*7deg)] flex-col items-center gap-6 transform-3d will-change-transform motion-reduce:transform-none lg:gap-8.5">
                        <div class="sc-core relative flex translate-z-16 flex-col items-center gap-2.5">
                            <span class="sc-ring sc-ring--a absolute top-12 left-1/2 size-34 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border border-dashed border-(--sc-accent-46) [animation-duration:26s] motion-reduce:animate-none" />
                            <span class="sc-ring sc-ring--b absolute top-12 left-1/2 size-42 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border border-(--sc-accent-34) [animation-direction:reverse] [animation-duration:40s] motion-reduce:animate-none" />
                            <span class="sc-ring sc-ring--c absolute top-12 left-1/2 size-50 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border border-dotted border-(--sc-accent-18) [animation-duration:58s] motion-reduce:animate-none" />
                            <div class="sc-avatar relative size-24 overflow-hidden rounded-full border border-(--sc-accent-62) shadow-[0_0_0_6px_rgba(4,6,12,0.72),0_0_34px_var(--sc-accent-52)]">
                                <img :src="charBuild.char.url" :alt="$t(charName)" class="size-full object-cover object-top" />
                            </div>
                            <div class="sc-core-meta relative z-1 text-center">
                                <div class="sc-core-name text-base font-bold tracking-[0.08em]">{{ $t(charName) }}</div>
                                <div class="sc-core-sub mt-0.5 font-orbitron text-[10px] tracking-[0.22em] text-(--sc-accent-soft) uppercase">{{ skillTypeLabel }} · Lv.{{ skillLevel }}</div>
                            </div>
                        </div>

                        <div class="sc-weapons relative z-1 grid w-full translate-z-6 grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 px-3">
                            <article
                                v-for="slot in stageWeapons"
                                :key="slot.key"
                                class="sc-weapon flex cursor-pointer flex-col gap-1.5 border border-l-2 px-2.5 py-2 transition-[border-color,background,box-shadow] duration-250 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--sc-line-strong)"
                                :class="weaponCardClass(slot)"
                                role="button"
                                tabindex="0"
                                :aria-pressed="SLOT_TO_MOD_TAB[slot.key] === activeModTab"
                                :title="$t('char-build.simple_show_mods', { slot: slot.label })"
                                @click="focusWeaponSlot(slot.key)"
                                @keydown.enter.prevent="focusWeaponSlot(slot.key)"
                                @keydown.space.prevent="focusWeaponSlot(slot.key)"
                            >
                                <div class="sc-weapon-head flex items-center justify-between gap-1.5">
                                    <span class="sc-weapon-slot text-[10px] tracking-[0.24em] text-(--sc-accent-soft) uppercase">{{ slot.label }}</span>
                                    <span v-if="slot.weapon" class="sc-weapon-lv font-orbitron text-[10px] text-(--sc-text-dim) tabular-nums">Lv.{{ slot.weapon.等级 }}</span>
                                </div>
                                <div class="sc-weapon-body flex min-w-0 items-center gap-2">
                                    <span class="sc-weapon-icon grid size-10 flex-none place-items-center overflow-hidden border border-(--sc-line) bg-black/40 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]">
                                        <!-- 特殊同律武器没有真实图标，用技能图标做遮罩并按强调色着色（与专业模式同规则） -->
                                        <span
                                            v-if="slot.maskUrl"
                                            class="sc-weapon-mask size-full bg-(--sc-accent-soft)"
                                            :style="{ mask: `url(${slot.maskUrl}) no-repeat center/68%` }"
                                        />
                                        <img v-else-if="slot.weapon" :src="slot.weapon.url" alt="" class="size-full object-cover" />
                                        <Icon v-else icon="ri:add-line" class="sc-weapon-placeholder size-4 text-(--sc-text-dim)" />
                                    </span>
                                    <span class="sc-weapon-text flex min-w-0 flex-col">
                                        <span class="sc-weapon-name truncate text-[13px] font-semibold">{{
                                            slot.weapon ? $t(slot.weapon.名称) : $t("char-build.weapon_slot_not_equipped")
                                        }}</span>
                                        <span class="sc-weapon-sub truncate text-[10px] text-(--sc-text-dim)">{{
                                            slot.weapon ? weaponSubtitle(slot.weapon) : $t("char-build.weapon_slot_empty_desc")
                                        }}</span>
                                    </span>
                                </div>
                                <div v-if="slot.weapon" class="sc-weapon-foot flex gap-2.5 font-orbitron text-[10px] tracking-[0.12em] text-(--sc-text-dim) tabular-nums">
                                    <span v-if="weaponRefine(slot.weapon) !== null">
                                        {{ $t("char-build.refine") }} {{ weaponRefine(slot.weapon) }}
                                    </span>
                                    <span v-if="weaponSkillLevel(slot.weapon) !== null">
                                        {{ $t("char-build.skill_level") }} {{ weaponSkillLevel(slot.weapon) }}
                                    </span>
                                </div>
                            </article>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 角色身份 -->
            <section class="sc-panel sc-identity flex flex-col gap-2.5 border border-(--sc-line) bg-[linear-gradient(165deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-3 [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] [grid-area:identity]" data-section="identity">
                <div class="sc-panel-head flex items-baseline gap-2 border-b border-(--sc-line) pb-2">
                    <span class="sc-panel-num font-orbitron text-[11px] font-bold text-(--sc-accent)">01</span>
                    <span class="sc-panel-title text-[12px] tracking-[0.18em]">{{ $t("char-build.char_info") }}</span>
                </div>
                <div class="sc-ident flex gap-3">
                    <div class="sc-ident-portrait relative h-24 w-19.5 flex-none overflow-hidden border border-(--sc-line-strong) [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]">
                        <img :src="charBuild.char.url" :alt="$t(charName)" class="size-full object-cover object-top" />
                        <span class="sc-ident-lv absolute right-0 bottom-0 bg-[linear-gradient(180deg,var(--sc-accent-soft),var(--sc-accent))] px-1.5 py-0.5 font-orbitron text-[10px] font-bold text-[#05070d] tabular-nums">LV.{{ charBuild.char.等级 }}</span>
                    </div>
                    <div class="sc-ident-rows flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                        <div class="sc-row flex items-baseline justify-between gap-2 border-b border-dashed border-white/8 pb-1 text-[11px]">
                            <span>{{ $t("char-build.elem") }}</span>
                            <b>{{ elementLabel || "—" }}</b>
                        </div>
                        <div class="sc-row flex items-baseline justify-between gap-2 border-b border-dashed border-white/8 pb-1 text-[11px]">
                            <span>{{ $t("char-build.simple_skill") }}</span>
                            <b>{{ skillName ? $t(skillName) : "—" }}</b>
                        </div>
                        <div class="sc-row flex items-baseline justify-between gap-2 border-b border-dashed border-white/8 pb-1 text-[11px]">
                            <span>{{ $t("char-build.skill_level") }}</span>
                            <b>Lv.{{ skillLevel }}</b>
                        </div>
                        <div class="sc-row flex items-baseline justify-between gap-2 border-b border-dashed border-white/8 pb-1 text-[11px]">
                            <span>{{ $t("char-build.resonance_gain") }}</span>
                            <b>{{ resonanceText }}</b>
                        </div>
                    </div>
                </div>

                <!-- 协战：队友与队友武器（两者都未配置时整块不渲染） -->
                <template v-if="hasTeam">
                    <div class="sc-subhead flex items-center gap-2 text-[10px] tracking-[0.24em] text-(--sc-accent-soft) uppercase">
                        <span>{{ $t("char-build.team") }}</span>
                        <span class="sc-subhead-line h-px flex-1 bg-[linear-gradient(90deg,var(--sc-accent-45),transparent)]" />
                    </div>
                    <div class="sc-team flex flex-col gap-1.5">
                        <div v-for="member in teamMembers" :key="member.slot" class="sc-team-slot grid grid-cols-[28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-1.5">
                            <!-- 队友头像/名字：关联过构筑时点击弹窗查看其魔之楔（未关联则保持原样） -->
                            <span class="sc-team-avatar grid size-7 place-items-center overflow-hidden border border-(--sc-line-strong) bg-black/38 data-[empty=1]:border-dashed data-[empty=1]:opacity-62" :data-empty="member.charName ? '' : '1'" v-bind="teamBuildAttrs(member, 'char')">
                                <img v-if="member.charIcon" :src="member.charIcon" :alt="$t(member.charName)" class="size-full object-cover object-top" />
                                <Icon v-else icon="ri:user-line" class="sc-team-placeholder size-3.5 text-(--sc-text-dim)" />
                            </span>
                            <span class="sc-team-text flex min-w-0 flex-col" v-bind="teamBuildAttrs(member, 'char')">
                                <span class="sc-team-name truncate text-[11px] font-semibold">{{ member.charName ? $t(member.charName) : "—" }}</span>
                                <span v-if="member.element" class="sc-team-elem truncate text-[9px] text-(--sc-text-dim)">{{ $t(`${member.element}属性`) }}</span>
                            </span>
                            <!-- 队友武器：同一份关联构筑，点击后定位到武器魔之楔 -->
                            <span class="sc-team-weapon grid size-7 place-items-center overflow-hidden border border-(--sc-line-strong) bg-black/38 border-dashed data-[empty=1]:opacity-62" :data-empty="member.weaponName ? '' : '1'" v-bind="teamBuildAttrs(member, 'weapon')">
                                <img v-if="member.weaponIcon" :src="member.weaponIcon" :alt="$t(member.weaponName)" class="size-full object-cover object-top" />
                                <Icon v-else icon="ri:sword-line" class="sc-team-placeholder size-3.5 text-(--sc-text-dim)" />
                            </span>
                            <span class="sc-team-weapon-text flex min-w-0 flex-col" v-bind="teamBuildAttrs(member, 'weapon')">
                                <span class="sc-team-name truncate text-[11px] font-semibold">{{ member.weaponName ? $t(member.weaponName) : "—" }}</span>
                                <span v-if="member.weaponType" class="sc-team-elem truncate text-[9px] text-(--sc-text-dim)">{{ $t(member.weaponType) }}</span>
                            </span>
                        </div>
                    </div>
                </template>
            </section>

            <!-- 魔之楔装配 -->
            <section class="sc-panel sc-mods flex flex-col gap-2.5 border border-(--sc-line) bg-[linear-gradient(165deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-3 [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] [grid-area:mods]" data-section="mods">
                <div class="sc-panel-head flex items-baseline gap-2 border-b border-(--sc-line) pb-2">
                    <span class="sc-panel-num font-orbitron text-[11px] font-bold text-(--sc-accent)">02</span>
                    <span class="sc-panel-title text-[12px] tracking-[0.18em]">{{ $t("魔之楔") }}</span>
                    <span class="sc-panel-tail ml-auto font-orbitron text-[11px] text-(--sc-text-dim) tabular-nums">{{ capacity.load }} / {{ capacity.cap }}</span>
                </div>
                <div class="sc-modtabs flex flex-wrap gap-1">
                    <button
                        v-for="tab in modTabs"
                        :key="tab.key"
                        type="button"
                        class="sc-modtab inline-flex h-6 cursor-pointer items-center gap-1.25 border px-2.25 text-[11px] transition-colors duration-200"
                        :class="modTabClass(tab.key)"
                        @click="modTab = tab.key"
                    >
                        {{ tab.label }}
                        <span v-if="tab.count" class="sc-modtab-count font-orbitron text-[9px] text-(--sc-accent-soft) tabular-nums">{{ tab.count }}</span>
                    </button>
                </div>
                <template v-if="currentModTab.available">
                    <!-- 每个槽位都带名称，仅凭图标无法区分同系列魔之楔 -->
                    <div class="sc-modgrid grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1.5">
                        <div v-for="(mod, index) in activeModSlots" :key="index" class="sc-mod flex items-center gap-1.75 border border-l-2 border-(--sc-line) border-l-(--sc-quality) px-1.75 py-1.25 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]" :style="qualityStyle(mod?.品质)">
                            <span class="sc-mod-icon grid size-7.5 flex-none place-items-center overflow-hidden border border-(--sc-line) bg-black/42">
                                <img v-if="mod" :src="mod.url" :alt="$t(mod.名称)" class="size-full object-cover" />
                                <span v-else class="sc-mod-index font-orbitron text-[11px] text-white/24">{{ index + 1 }}</span>
                            </span>
                            <span class="sc-mod-text flex min-w-0 flex-1 flex-col">
                                <span class="sc-mod-name truncate text-[12px] font-semibold">{{ mod ? $t(mod.名称) : $t("char-build.simple_empty_slot") }}</span>
                                <span v-if="mod" class="sc-mod-sub truncate text-[9px] text-(--sc-text-dim)">{{ $t(mod.系列) }}</span>
                            </span>
                            <span v-if="mod" class="sc-mod-lv flex-none font-orbitron text-[11px] font-bold text-(--sc-text-dim) tabular-nums">+{{ mod.等级 }}</span>
                        </div>
                    </div>
                    <div v-if="activeModTab === '角色'" class="sc-mod flex items-center gap-1.75 border border-l-2 border-(--sc-line) border-l-(--sc-quality) px-1.75 py-1.25 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]" :style="qualityStyle(auraMod?.品质)">
                        <span class="sc-mod-icon grid size-7.5 flex-none place-items-center overflow-hidden border border-(--sc-line) bg-black/42">
                            <img v-if="auraMod" :src="auraMod.url" :alt="$t(auraMod.名称)" class="size-full object-cover" />
                            <Icon v-else icon="ri:add-line" class="sc-weapon-placeholder size-4 text-(--sc-text-dim)" />
                        </span>
                        <span class="sc-mod-text flex min-w-0 flex-1 flex-col">
                            <span class="sc-mod-name truncate text-[12px] font-semibold">{{ auraMod ? $t(auraMod.名称) : $t("char-build.simple_empty_slot") }}</span>
                            <span v-if="auraMod" class="sc-mod-sub truncate text-[9px] text-(--sc-text-dim)">{{ $t(auraMod.系列) }}</span>
                        </span>
                        <span v-if="auraMod" class="sc-mod-lv flex-none font-orbitron text-[11px] font-bold text-(--sc-text-dim) tabular-nums">+{{ auraMod.等级 }}</span>
                        <span class="sc-mod-tag ml-auto flex-none border border-(--sc-accent-45) px-1.5 py-0.5 text-[9px] tracking-[0.2em] text-(--sc-accent-soft)">{{ $t("char-build.simple_aura") }}</span>
                    </div>
                    <div class="sc-cap flex flex-col gap-1.25">
                        <div class="sc-cap-track relative h-1.5 overflow-hidden border border-(--sc-line) bg-black/50">
                            <span
                                class="sc-cap-fill block h-full transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                :class="capacityFillClass()"
                                :style="{ width: `${capacity.percent}%` }"
                            />
                        </div>
                        <div class="sc-cap-meta flex items-baseline justify-between text-[10px] text-(--sc-text-dim)">
                            <span>{{ $t("char-build.simple_capacity") }}</span>
                            <b class="font-orbitron text-[11px] tabular-nums" :class="capacityValueClass()">{{ capacity.load }} / {{ capacity.cap }}</b>
                        </div>
                        <!-- 社区代码：当前页签这套魔之楔的短代码，右侧方形按钮一键复制 -->
                        <div class="sc-code-row flex items-stretch gap-1.5">
                            <span
                                class="sc-code flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden border border-(--sc-line) bg-black/30 px-1.5 py-1"
                                :title="modCode"
                            >
                                <span class="flex-none text-[9px] tracking-[0.12em] text-(--sc-text-dim)">{{ $t("char-build.simple_community_code") }}</span>
                                <b class="sc-code-value truncate font-orbitron text-[10px] font-normal text-(--sc-text) tracking-[0.06em]">{{ modCode }}</b>
                            </span>
                            <button
                                type="button"
                                class="sc-copy grid size-7 flex-none cursor-pointer place-items-center border border-(--sc-accent-38) bg-(--sc-accent-10) text-(--sc-accent-soft) transition-colors duration-200 hover:border-(--sc-accent-70) hover:bg-(--sc-accent-20) hover:text-(--sc-text) focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--sc-line-strong)"
                                :title="$t('char-build.export_code')"
                                :aria-label="$t('char-build.export_code')"
                                @click="copyModCode"
                            >
                                <Icon icon="ri:file-copy-line" class="size-3.5" />
                            </button>
                        </div>
                    </div>
                </template>
                <p v-else class="sc-note m-0 text-[11px] leading-[1.6] text-(--sc-text-dim)">{{ $t("char-build.mods_need_weapon", { slot: currentModTab.label }) }}</p>
            </section>

            <!-- 核心属性 -->
            <section class="sc-panel sc-stats flex flex-col gap-2.5 border border-(--sc-line) bg-[linear-gradient(165deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-3 [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] [grid-area:stats]" data-section="stats">
                <div class="sc-panel-head flex items-baseline gap-2 border-b border-(--sc-line) pb-2">
                    <span class="sc-panel-num font-orbitron text-[11px] font-bold text-(--sc-accent)">03</span>
                    <span class="sc-panel-title text-[12px] tracking-[0.18em]">{{ $t("char-build.simple_key_stats") }}</span>
                </div>
                <div v-if="charAttrRows.length" class="sc-statgrid grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
                    <div v-for="row in charAttrRows" :key="row.key" class="sc-stat flex flex-col gap-0.5 border border-(--sc-line) bg-white/3 px-2 py-1.5 [clip-path:polygon(7px_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%,0_7px)]">
                        <span class="sc-stat-label truncate text-[10px] text-(--sc-text-dim)">{{ $t(row.label) }}</span>
                        <b class="sc-stat-value font-orbitron text-sm tabular-nums">{{ row.value }}</b>
                    </div>
                </div>
                <p v-else class="sc-note m-0 text-[11px] leading-[1.6] text-(--sc-text-dim)">—</p>
            </section>

            <!-- 伤害输出：标题取目标函数、数值取整按千分位，与榜单页面保持一致 -->
            <section class="sc-output flex flex-wrap items-center gap-3.5 border border-(--sc-accent-34) bg-[radial-gradient(90%_160%_at_6%_50%,var(--sc-accent-18),transparent_70%),linear-gradient(120deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] px-3.5 py-3 [clip-path:polygon(16px_0,100%_0,100%_calc(100%-16px),calc(100%-16px)_100%,0_100%,0_16px)] [grid-area:output]" data-section="output">
                <div class="sc-output-main min-w-40 flex-[1_1_200px]">
                    <div
                        class="sc-output-label text-[10px] tracking-[0.28em] text-(--sc-text-dim) uppercase"
                        :title="`${skillName ? $t(skillName) : '—'} - ${damageTitle || $t('char-build.simple_output')}`"
                    >
                        {{ damageTitle || $t("char-build.simple_output") }}
                    </div>
                    <div class="sc-output-value font-orbitron text-[clamp(30px,6vw,46px)] leading-[1.05] font-bold text-(--sc-accent-soft) tabular-nums text-shadow-[0_0_30px_var(--sc-accent-62)]">{{ damageText }}</div>
                    <div class="sc-output-sub truncate text-[11px] text-(--sc-text-dim)">
                        {{ skillName ? $t(skillName) : "—" }}
                        <template v-if="summonName">· {{ $t(summonName) }}</template>
                    </div>
                </div>
            </section>
        </div>

        <!-- 移动端底部页签 -->
        <nav v-if="ready" class="sc-tabs absolute right-0 bottom-0 left-0 z-4 flex border-t border-(--sc-line) bg-[linear-gradient(0deg,rgba(4,6,12,0.96),rgba(4,6,12,0.78))] px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] lg:hidden">
            <button
                v-for="tab in mobileTabs"
                :key="tab.key"
                type="button"
                class="sc-tab flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.75 border-t-2 bg-transparent px-0.5 py-1.5 transition-colors duration-200"
                :class="mobileTabClass(tab.key)"
                @click="scrollToSection(tab.key)"
            >
                <Icon :icon="tab.icon" class="sc-tab-icon size-4.25" />
                <span class="sc-tab-label w-full truncate text-center text-[9px] leading-[1.2]">{{ tab.label }}</span>
            </button>
        </nav>

        <div v-if="ready && showHint" class="sc-hint absolute left-1/2 z-4 w-max max-w-[calc(100%-24px)] -translate-x-1/2 border border-(--sc-line) bg-[rgba(4,6,12,0.72)] px-3 py-1.25 text-[10px] tracking-[0.16em] text-(--sc-text-dim) animate-hint-fade pointer-events-none bottom-21 motion-reduce:animate-none lg:bottom-4.5">{{ $t("char-build.simple_hint") }}</div>

        <!-- 协战构筑弹窗：展示该协战角色关联构筑的魔之楔（teleport 到 body，渲染位置不影响版面） -->
        <TeamBuildDialog v-model="teamBuildShow" :build-id="teamBuildId" :char-name="teamBuildCharName" :focus="teamBuildFocus" />
    </div>
</template>
