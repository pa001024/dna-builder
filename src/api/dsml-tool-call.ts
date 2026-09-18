/**
 * DSML 工具调用标记容错解析。
 *
 * # 背景
 *
 * 部分 OpenAI 兼容服务端（智谱 GLM、DeepSeek 等）在工具调用兼容层出问题时，
 * 会把**工具调用语法当作正文文本**返回，而不是填进 `tool_calls` 字段。典型形态：
 *
 * ```text
 * <||DSML|||tool_calls>
 * <||DSML|||invoke name="list_data_modules">
 * </||DSML|||invoke>
 * </||DSML|||tool_calls>
 * ```
 *
 * 对使用方来说这会同时造成两个后果：界面上出现一串莫名其妙的标记；
 * 且因为 `tool_calls` 为空，agent 会误判「模型已给出最终回答」而提前结束检索。
 *
 * # 职责
 *
 * 本模块只做**纯文本 → 工具调用**的转换，不碰网络与流：
 * 把混在正文里的 DSML 块抽出来、翻译成标准工具调用结构，并返回剔除 DSML 后的干净正文。
 * 调用方（`DBAgent.run`）负责把清理后的正文吐给界面、把解析出的工具调用补进本轮调用表。
 *
 * # 兼容的形态
 *
 * - 标记：带 `|DSML|` 与不带 `|DSML|` 两套（不带是上游工具模板的另一种拼写）。
 * - 参数：XML 参数标签（`<||DSML|||parameter name="x">值</||DSML|||parameter>`）
 *   与**直接写 JSON**（`{"x":"值"}`）两种。
 * - 一个 `tool_calls` 块内可含多个 `invoke`。
 * - `invoke` 可以没有参数（例如 `list_data_modules`）。
 * - 流式分片：标签可能被切成多个 chunk，解析器需能跨片段识别。
 */

/** 解析出的单个工具调用 */
export interface ParsedDsmlCall {
    /** 工具名 */
    name: string
    /** 参数对象 */
    args: Record<string, unknown>
}

/** 一次解析的结果 */
export interface DsmlParseResult {
    /** 剔除 DSML 块后剩余的正文 */
    text: string
    /** 从正文里抽出的工具调用 */
    calls: ParsedDsmlCall[]
}

/**
 * `|DSML|` 标记片段的可选正则片段。
 *
 * 真实拼写是 `<||DSML|||tool_calls>`——注意 `DSML` 前后各是**两个**竖线、
 * 结尾与标签名之间还有**一个**竖线，合起来视觉上是三个。
 * 裸标记形态（`<||tool_calls>`）则完全没有这一段。
 * 用「可选 + 竖线数量放宽」表达，避免为两套拼写各写一份规则。
 */
const DSML_OPT = "(?:\\|\\|DSML\\|\\|\\|)?"

/**
 * 标签内部允许出现在标签名前的残留竖线。
 * `DSML_OPT` 不匹配（裸标记）时，标签名前面还会剩一个 `||`，
 * 这里统一吸收掉，让「带标记」与「裸标记」共用同一套规则。
 */
const LEADING_PIPES = "\\|*\\s*"

/** 整个 `tool_calls` 块的匹配（块内容单独捕获，再逐个拆 invoke） */
const TOOL_CALLS_BLOCK_SOURCE = `<${DSML_OPT}${LEADING_PIPES}tool_calls\\s*\\|?>[\\s\\S]*?<\\/${DSML_OPT}${LEADING_PIPES}tool_calls\\s*\\|?>`
const TOOL_CALLS_BLOCK_RE = new RegExp(TOOL_CALLS_BLOCK_SOURCE, "g")

/**
 * 同一条规则的无 `g` 副本。
 * 带 `g` 的正则用 `test()` 会推进 `lastIndex`，在流式循环里反复调用会得出错乱的匹配结果，
 * 因此凡是「只判断是否存在」的场景都用这份。
 */
const TOOL_CALLS_BLOCK_TEST_RE = new RegExp(TOOL_CALLS_BLOCK_SOURCE)

/** 只匹配 `tool_calls` 开标签（供流式过滤器判断「块是否已开始」） */
const TOOL_CALLS_OPEN_RE = /<\s*(?:\|\|DSML\|\|\|)?\|*\s*tool_calls\b/i

/** 单个 `invoke` 块：捕获工具名与块内内容 */
const INVOKE_RE = new RegExp(
    `<${DSML_OPT}${LEADING_PIPES}invoke\\s+name\\s*=\\s*"([^"]+)"\\s*\\|?>([\\s\\S]*?)<\\/${DSML_OPT}${LEADING_PIPES}invoke\\s*\\|?>`,
    "g"
)

/** XML 形式的参数标签：捕获参数名与值 */
const PARAMETER_RE = new RegExp(
    `<${DSML_OPT}${LEADING_PIPES}parameter\\s+name\\s*=\\s*"([^"]+)"\\s*\\|?>([\\s\\S]*?)<\\/${DSML_OPT}${LEADING_PIPES}parameter\\s*\\|?>`,
    "g"
)

/**
 * 判断一段文本里是否残留 DSML 标记。
 *
 * 用于两处：识别「本轮出现泄露需要特殊处理」，以及兜底校验
 * （清理后仍含有标记说明格式超出了解析器能力）。
 * 判据放宽到「`<` + 可选 `/` + 可选 `||DSML|||` + 可选竖线 + 已知标签名」——
 * 标签后的竖线与属性写法会在模型版本间漂移，但标签名本身是稳定的。
 * 注意**闭合标签**写作 `</||DSML|||invoke>`，斜杠与 `DSML` 之间隔着竖线，
 * 所以 `/` 必须放在 `||DSML|||` 之前。
 * @param text 待检查文本
 * @returns 是否含有 DSML 标记
 */
export function containsDsmlMarker(text: string): boolean {
    return /<\s*\/?\s*(?:\|\|DSML\|\|\|)?\|*\s*(?:tool_calls|invoke|parameter)\b/i.test(text)
}

/**
 * 解析一段候选字符串为参数对象。
 *
 * 依次尝试：直接 JSON（模型有时把整个参数写成 JSON）、剥离 XML 标签后再 JSON、
 * 空串（无参数工具）。全部失败时返回 `undefined`，交由调用方决定是否忽略这次调用。
 * @param raw 候选参数字符串
 * @returns 解析出的参数对象；无法解析时返回 undefined
 */
function parseArgsCandidate(raw: string): Record<string, unknown> | undefined {
    const trimmed = raw.trim()

    // 无参数工具：允许空块
    if (!trimmed) {
        return {}
    }

    // 优先当作完整 JSON（对象或字符串化对象）
    const jsonDirect = tryParseJsonObject(trimmed)

    if (jsonDirect) {
        return jsonDirect
    }

    // 去掉包裹的 markdown 代码围栏后再试（模型偶尔会给参数套 ```json）
    const withoutFence = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim()
    const jsonUnfenced = tryParseJsonObject(withoutFence)

    if (jsonUnfenced) {
        return jsonUnfenced
    }

    return undefined
}

/**
 * 尝试把字符串解析成 JSON 对象。
 * @param text 待解析文本
 * @returns 解析出的对象；不是对象字面量时返回 undefined
 */
function tryParseJsonObject(text: string): Record<string, unknown> | undefined {
    if (!text.startsWith("{") || !text.endsWith("}")) {
        return undefined
    }

    try {
        const parsed = JSON.parse(text) as unknown

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
    } catch {
        return undefined
    }

    return undefined
}

/**
 * 解析单个 invoke 块内部的参数。
 *
 * 支持两种写法：
 * 1. XML 参数标签（可能有多个）；
 * 2. 直接写 JSON（整块就是一个对象字面量）。
 * 若同一块里两种都出现，以 XML 标签为准（信息更完整），JSON 作为补充。
 * @param body invoke 块内部文本
 * @returns 参数对象；无法解析时返回 undefined
 */
function parseInvokeArgs(body: string): Record<string, unknown> | undefined {
    const args: Record<string, unknown> = {}
    let matchedXml = false

    PARAMETER_RE.lastIndex = 0

    for (let match = PARAMETER_RE.exec(body); match; match = PARAMETER_RE.exec(body)) {
        const [, name, rawValue] = match
        matchedXml = true
        args[name] = coerceParamValue(rawValue)
    }

    // 去掉 XML 参数标签后，看剩余部分是否是一个 JSON 对象（模型可能两种混用）
    PARAMETER_RE.lastIndex = 0
    const remainder = body.replace(PARAMETER_RE, "").trim()
    const jsonArgs = parseArgsCandidate(remainder)

    if (jsonArgs) {
        Object.assign(args, jsonArgs)
        return args
    }

    if (matchedXml) {
        return args
    }

    // 既没有 XML 标签、剩余部分也不是 JSON：交给上层判定为「无法解析」
    return undefined
}

/**
 * 把 XML 参数标签里的文本值转换成合适类型。
 *
 * 模型习惯把数字/布尔也写成文本，这里做一次轻量还原，
 * 避免下游 `Number(args.limit)` 之类的调用拿到的语义过于含糊。
 * @param raw 标签内原始文本（已 trim）
 * @returns 还原后的值
 */
function coerceParamValue(raw: string): unknown {
    const value = raw.trim()

    if (value === "true") {
        return true
    }

    if (value === "false") {
        return false
    }

    if (value === "null") {
        return null
    }

    // 纯数字（含负号与小数）才转 number，避免把 "1.6" 这类版本号误判（版本号转 number 也无害）
    if (/^-?\d+(?:\.\d+)?$/.test(value)) {
        return Number(value)
    }

    return value
}

/**
 * 从一段正文里抽取 DSML 工具调用，并返回剔除后的文本。
 *
 * 只有在**没有检测到标记**时才走快速路径（原样返回），保证正常文本零开销、
 * 零改写风险；一旦检测到标记才做完整解析与清洗。
 * @param text 待处理的正文
 * @returns 清洗后的正文与解析出的工具调用
 */
export function parseDsmlToolCalls(text: string): DsmlParseResult {
    if (!containsDsmlMarker(text)) {
        return { text, calls: [] }
    }

    const calls: ParsedDsmlCall[] = []

    // 先抠出所有 tool_calls 块，逐块解析 invoke（每次使用前重置 lastIndex）
    TOOL_CALLS_BLOCK_RE.lastIndex = 0
    const withoutBlocks = text.replace(TOOL_CALLS_BLOCK_RE, block => {
        collectInvokes(block, calls)
        return ""
    })

    // 有些服务端不输出外层 tool_calls 包裹，直接给 invoke；这里再兜一次
    INVOKE_RE.lastIndex = 0
    const withoutLooseInvokes = withoutBlocks.replace(INVOKE_RE, (_whole, name: string, body: string) => {
        const args = parseInvokeArgs(body)

        if (args) {
            calls.push({ name, args })
        }

        return ""
    })

    // 仍残留的孤立标记（如只有闭合标签、残缺块）一律剔除，绝不能让它显示出来
    return { text: stripResidualMarkers(withoutLooseInvokes), calls }
}

/**
 * 从一个 `tool_calls` 块里解析出所有 invoke。
 * @param block 块文本（含外层标签）
 * @param calls 结果收集数组
 */
function collectInvokes(block: string, calls: ParsedDsmlCall[]) {
    INVOKE_RE.lastIndex = 0

    for (let match = INVOKE_RE.exec(block); match; match = INVOKE_RE.exec(block)) {
        const [, name, body] = match
        const args = parseInvokeArgs(body)

        if (args) {
            calls.push({ name, args })
        }
    }
}

/**
 * 剔除残留的 DSML 标记与因此产生的多余空行。
 *
 * 走到这一步说明标记结构不完整（流被中断、格式再次变异），
 * 无法翻译成工具调用，只能保证不显示给用户。
 * 注意闭合标签写成 `</||DSML|||invoke>`——斜杠与 `DSML` 之间还有竖线，
 * 所以 `</` 之后同样要放宽竖线。
 * @param text 待清洗文本
 * @returns 清洗后的文本
 */
function stripResidualMarkers(text: string): string {
    // 注意：斜杠写成字符组 `[/]`，避免字面量正则里的 `\/` 被格式化器改写成 `\\/`
    // （那会变成「匹配反斜杠+斜杠」，导致标签清不掉）。
    const anyTag = /<\s*[/]?\s*(?:\|\|DSML\|\|\|)?\|*\s*(?:tool_calls|invoke|parameter)[^>]*>/gi

    return text
        .replace(anyTag, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/**
 * 流式增量解析器：跨 chunk 累积 content，按需吐出「干净正文」与「工具调用」。
 *
 * 存在的意义是**不能让半个标签漏给界面**：流式下 `<||DSM` 与 `L|||tool_calls>` 可能
 * 分属两个 chunk，逐块直接清洗会把未闭合的前缀当正文泄露出去。
 *
 * 策略是维护一个缓冲区，只放行「已经确定不可能再变成标记」的部分：
 * - 尾部若有未闭合的 `<`（还没等到 `>`），整段扣住；
 * - 尾部若已出现 `tool_calls` 开标签但没等到闭标签，从**开标签起点**扣住
 *   （起点之前的文本照常放行，那部分已经确定是正文）。
 */
export class DsmlStreamFilter {
    /** 尚未判定去留的尾巴（可能是半个标签，也可能是未闭合的 DSML 块） */
    private buffer = ""

    /**
     * 喂入一段增量，取出可安全展示的正文与本次解析出的工具调用。
     * @param chunk 本次增量
     * @returns 干净正文与工具调用
     */
    public push(chunk: string): DsmlParseResult {
        this.buffer += chunk

        // 第一步：尾部未闭合的 '<' 之后整段扣住（可能是被切碎的标签）
        const lastOpen = this.buffer.lastIndexOf("<")
        let flushable = this.buffer
        let pending = ""

        if (lastOpen >= 0 && this.buffer.indexOf(">", lastOpen) < 0) {
            flushable = this.buffer.slice(0, lastOpen)
            pending = this.buffer.slice(lastOpen)
        }

        // 第二步：已出现 tool_calls 开标签但还没等到闭标签，从开标签起点扣住。
        // 起点之前的文本已经确定是正文，不能跟着一起扣，否则会拖慢流式观感。
        const openBlock = flushable.search(TOOL_CALLS_OPEN_RE)

        if (openBlock >= 0 && !TOOL_CALLS_BLOCK_TEST_RE.test(flushable)) {
            pending = flushable.slice(openBlock) + pending
            flushable = flushable.slice(0, openBlock)
        }

        this.buffer = pending

        return parseDsmlToolCalls(flushable)
    }

    /**
     * 结束流并取出缓冲区剩余内容。
     * 用于收尾：此时不会再有后续片段，残留内容按普通正文处理（标记仍会被清洗）。
     * @returns 干净正文与工具调用
     */
    public flush(): DsmlParseResult {
        const rest = this.buffer
        this.buffer = ""

        return parseDsmlToolCalls(rest)
    }
}
