/**
 * AI 回复中的「特殊组件」渲染。
 *
 * 资料检索 Agent 除了 markdown 之外，还可以输出少量**受限的自定义标签**来嵌入真实业务组件，例如：
 * - `<ResourceCostItem :value="[100, 151001, 'Resource']" />`
 * - `<RewardItem :reward="120301" />`
 *
 * 安全模型（与 markdown 的 `html: false` 保持一致）：
 * 1. **白名单**：只有下表中登记过的组件名会被实例化，其余标签一律按普通文本转义输出，
 *    不会进入 v-html，也不会被解析成 HTML 元素。
 * 2. **不开 HTML**：markdown-it 仍然 `html: false`，AI 无法注入任意 HTML；
 *    组件标签是我们在渲染层用正则**从纯文本里**识别出来的，解析结果只有
 *    「白名单组件 + 受控属性」两种产物，不存在任意标签的旁路。
 * 3. **属性受限**：只接受 `:prop="JSON"` 形式的绑定，属性名必须在组件声明的
 *    属性集合内；`on*` / `v-*` / `ref` / `is` / `slot` 等一律拒绝，
 *    因此即使模型被诱导输出恶意属性也无法触达（不存在模板编译，属性是直接以
 *    props 形式绑定的）。
 * 4. **参数归一化**：像 RewardItem 这种需要完整对象入参的组件，允许模型只给出
 *    条目 id，由本模块的数据工具补齐成组件真正需要的结构，降低模型编造的失败率。
 */

import { getRewardDetails } from "@/utils/reward-utils"

/** 一个可渲染的特殊组件定义 */
interface RichComponentDefinition {
    /** 允许的属性名（对应组件 props） */
    props: string[]
    /**
     * 归一化入参：把模型给的简写补齐成组件真正需要的结构。
     * @param props 已解析的属性
     * @returns 归一化后的属性；返回 null 表示参数不合法，该标签按文本处理
     */
    normalize?: (props: Record<string, unknown>) => Record<string, unknown> | null
}

/**
 * 特殊组件白名单。
 *
 * 新增组件时在这里登记：组件本身放在 `src/components` 下即可被
 * `unplugin-vue-components` 自动注册，无需改 import。
 */
const RICH_COMPONENTS: Record<string, RichComponentDefinition> = {
    /** 消耗/材料条目：name + value，value 支持数字或 [数量, 条目id, 类型] */
    ResourceCostItem: {
        props: ["name", "value", "mini"],
    },
    /** 奖励组条目：需要完整的 RewardItem 结构，允许只给 id 或 id 数组 */
    RewardItem: {
        props: ["reward", "typeFilter", "header"],
        normalize: resolveRewardProp,
    },
}

/** 特殊组件标签的匹配规则：`<组件名 属性... />` 或 `<组件名 属性...></组件名>` */
const RICH_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)\b([^<>]*?)\/?>(?:\s*<\/\1\s*>)?/g

/** 属性匹配：`:name="expr"`（绑定）或 `name="text"`（字面量），expr 里允许 `>` 之外的内容 */
const ATTRIBUTE_RE = /:([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"|([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g

/** 允许作为绑定值的简单字面量：字符串 / 数字 / true / false / null */
const LITERAL_VALUE_RE = /^(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|(true|false|null))$/

/** 禁止的属性名：事件、内置指令、模板相关能力一律不开放 */
const FORBIDDEN_PROP_RE = /^(?:on[A-Z]|v-|ref$|key$|is$|slot$|slot-scope$|innerHTML$|domProps$)/

/** 单个属性值的长度上限，避免模型塞入超长文本 */
const MAX_ATTRIBUTE_LENGTH = 20000

/** 单条回复中允许渲染的组件数量上限，避免模型刷屏 */
const MAX_COMPONENTS_PER_MESSAGE = 24

/** 解析后的一个特殊组件 */
export interface ParsedRichComponent {
    /** 组件名（已在白名单内） */
    name: string
    /** 归一化后的属性 */
    props: Record<string, unknown>
    /** 原始标签文本（用于替换） */
    raw: string
    /** 在源文本中的起始下标 */
    start: number
}

/** 解析特殊组件的结果 */
export interface ParsedRichText {
    /** markdown 源文本（特殊组件标签已被剥离） */
    markdown: string
    /** 待渲染的组件列表，顺序与占位符一致 */
    components: ParsedRichComponent[]
}

/**
 * 解析绑定属性里的简单字面量。
 *
 * 只支持字符串 / 数字 / 布尔 / null；数组与对象会被当作 JSON 解析，
 * 其余表达式（函数调用、变量引用等）一律拒绝，避免引入表达式求值。
 * @param raw 属性表达式原文
 * @returns 解析结果；不合法时返回 undefined
 */
function parseBindingValue(raw: string): unknown {
    const value = raw.trim()

    if (!value || value.length > MAX_ATTRIBUTE_LENGTH) {
        // 空表达式与超长表达式直接判非法（超长多半是模型吐了一整段数据）
        return value ? undefined : ""
    }

    const literal = value.match(LITERAL_VALUE_RE)

    if (literal) {
        if (literal[1] !== undefined) {
            return literal[1]
        }
        if (literal[2] !== undefined) {
            return literal[2]
        }
        if (literal[3] !== undefined) {
            return Number(literal[3])
        }
        if (literal[4] === "true") {
            return true
        }
        if (literal[4] === "false") {
            return false
        }
        return null
    }

    // 数组 / 对象：按 JSON 解析。这是 ResourceCostItem 的 `:value="[1, 2, 'Resource']"`
    // 这类写法的关键路径——模型输出的 JSON 常带单引号，所以先做一次宽松规范化。
    if (value.startsWith("[") || value.startsWith("{")) {
        return parseLooseJson(value)
    }

    return undefined
}

/**
 * 解析宽松 JSON：兼容模型常见的单引号与无引号键写法。
 *
 * 先把单引号字符串统一成双引号，再尝试 `JSON.parse`；
 * 解析失败时回退到「按逗号切分的简单数组」，尽量让常见参数不至于整条失效。
 * @param raw 原始文本
 * @returns 解析结果；无法解析时返回 undefined
 */
function parseLooseJson(raw: string): unknown {
    try {
        return JSON.parse(raw)
    } catch {
        // 继续尝试宽松修复
    }

    try {
        // 单引号 → 双引号（字符串内部的转义单引号先还原占位）
        const normalized = raw.replace(/'/g, '"')
        return JSON.parse(normalized)
    } catch {
        // 继续尝试最宽松的降级
    }

    // 降级：形如 [100, 151001, 'Resource'] 的简单数组，逐项做字面量解析
    if (raw.startsWith("[") && raw.endsWith("]")) {
        const items = raw
            .slice(1, -1)
            .split(",")
            .map(item => item.trim())
            .filter(item => item !== "")

        if (items.length && items.every(item => parseBindingValueShadow(item) !== undefined)) {
            return items.map(item => parseBindingValueShadow(item))
        }
    }

    return undefined
}

/**
 * 与 parseBindingValue 同构但不含容器分支的取值函数（供降级数组逐项解析使用）。
 * 独立出来是为了避免 `parseLooseJson` 与 `parseBindingValue` 相互递归。
 * @param raw 单项文本
 * @returns 解析结果；不合法时返回 undefined
 */
function parseBindingValueShadow(raw: string): unknown {
    const value = raw.trim()
    const literal = value.match(LITERAL_VALUE_RE)

    if (!literal) {
        return undefined
    }

    if (literal[1] !== undefined) {
        return literal[1]
    }
    if (literal[2] !== undefined) {
        return literal[2]
    }
    if (literal[3] !== undefined) {
        return Number(literal[3])
    }
    if (literal[4] === "true") {
        return true
    }
    if (literal[4] === "false") {
        return false
    }

    return null
}

/**
 * 解析一个特殊组件标签的属性串。
 * @param name 组件名（已确认在白名单内）
 * @param definition 组件定义
 * @param rawAttributes 标签内的属性串
 * @returns 归一化后的属性；属性不合法时返回 null
 */
function parseRichComponentProps(name: string, definition: RichComponentDefinition, rawAttributes: string): Record<string, unknown> | null {
    const props: Record<string, unknown> = {}
    // 每次解析都从零开始扫描：全局正则带 g 标志，复用会受 lastIndex 影响
    const matcher = new RegExp(ATTRIBUTE_RE.source, "g")

    for (let match = matcher.exec(rawAttributes); match !== null; match = matcher.exec(rawAttributes)) {
        const propName = match[1] ?? match[3] ?? ""
        const rawValue = match[2] ?? match[4] ?? ""

        // 属性名必须在白名单里，且不能是事件/指令等危险属性
        if (!definition.props.includes(propName) || FORBIDDEN_PROP_RE.test(propName)) {
            continue
        }

        // 绑定属性（:name="x"）走字面量/JSON 解析；字面量属性按纯文本处理
        const isBound = match[1] !== undefined
        const value = isBound ? parseBindingValue(rawValue) : rawValue

        if (value === undefined) {
            // 绑定表达式无法解析：整条标签判非法，避免把错误参数传给组件
            return null
        }

        props[propName] = value
    }

    const normalized = definition.normalize ? definition.normalize(props) : props

    if (!normalized) {
        return null
    }

    // 归一化后再次过滤属性名，避免 normalize 引入白名单外的键
    const safeProps: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(normalized)) {
        if (definition.props.includes(key) && !FORBIDDEN_PROP_RE.test(key)) {
            safeProps[key] = value
        }
    }

    // 组件名仅用于 debug 时的可读性，不参与渲染
    void name

    return safeProps
}

/**
 * 解析 AI 回复中的特殊组件，并把它们从 markdown 源文本里剥离。
 *
 * 剥离时用同名的 HTML 注释占位符（`<!--rich:N-->`）替换原文：
 * markdown 渲染器遇到 HTML 注释会原样透传，于是渲染后的 HTML 里就留下了
 * 一个可定位的挂点，供 `DBChatMessages` 用 Vue 动态组件逐个替换成真实组件。
 * 这样既不用把组件塞进 v-html（组件无法在 v-html 里实例化），
 * 也不会破坏 markdown 的段落/列表结构。
 * @param text markdown 源文本
 * @returns 剥离后的 markdown 与待渲染组件列表
 */
export function parseRichComponents(text: string): ParsedRichText {
    if (!text?.includes("<")) {
        return { markdown: text, components: [] }
    }

    // 先把 fenced code block 挖出来保护起来：模型在示例代码里写组件标签时不应被渲染
    const codeBlocks: string[] = []
    const shielded = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, block => {
        codeBlocks.push(block)
        return `\u0000CODE${codeBlocks.length - 1}\u0000`
    })

    const components: ParsedRichComponent[] = []
    const matcher = new RegExp(RICH_COMPONENT_RE.source, "g")

    const markdown = shielded.replace(matcher, (raw, name: string, rawAttributes: string, offset: number) => {
        if (components.length >= MAX_COMPONENTS_PER_MESSAGE) {
            return raw
        }

        const definition = RICH_COMPONENTS[name]

        if (!definition) {
            // 不在白名单：原样保留，交给 markdown 转义成纯文本
            return raw
        }

        const props = parseRichComponentProps(name, definition, rawAttributes)

        if (!props) {
            return raw
        }

        components.push({ name, props, raw, start: offset })

        return `<!--rich:${components.length - 1}-->`
    })

    // 还原被保护的代码块
    const restored = markdown.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? "")

    if (!components.length) {
        // 没有可渲染的组件时直接返回原文，避免无谓的占位符往返
        return { markdown: text, components: [] }
    }

    return { markdown: restored, components }
}

/**
 * 归一化 RewardItem 的入参。
 *
 * 组件的 `reward` 属性需要完整的奖励树结构，而模型通常只知道奖励 id，
 * 因此这里接受三种写法并统一补齐：
 * - `:reward="120301"` → 用 id 查完整奖励树
 * - `:reward="[120301]"` → 取数组第一项
 * - `:reward="{...}"` → 已是完整结构，原样使用
 * @param props 已解析的属性
 * @returns 归一化后的属性；参数不可用时返回 null
 */
function resolveRewardProp(props: Record<string, unknown>): Record<string, unknown> | null {
    const raw = props.reward

    if (raw === undefined || raw === null) {
        return null
    }

    // 已经是完整结构（含 child 数组）时直接放行
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return { ...props, reward: raw }
    }

    const target = Array.isArray(raw) ? raw[0] : raw
    const rewardId = Number(target)

    if (!Number.isFinite(rewardId)) {
        return null
    }

    const resolved = resolveRewardTree(rewardId)

    return resolved ? { ...props, reward: resolved } : null
}

/**
 * 通过奖励 id 解析完整奖励树。
 * @param rewardId 奖励 id
 * @returns 奖励树；id 不存在时返回 null
 */
function resolveRewardTree(rewardId: number): unknown | null {
    return getRewardDetails(rewardId)
}
