/**
 * RAG 语料的公共类型与标识约定（客户端与服务端索引共用）。
 *
 * 双端一致是本文件存在的唯一理由：服务端预索引只存「锚点 + 向量 + 内容指纹」，
 * 正文与路径由客户端从本地数据还原，因此**锚点与指纹算法必须逐位一致**，
 * 任何一侧改了切块规则都要同步升 {@link RAG_CHUNK_SCHEMA_VERSION} 并重建索引。
 */

/**
 * chunk 切块规则版本。
 *
 * 改动切块规则（锚点格式、清洗方式、字段拼接、指纹算法）时必须 +1：
 * 服务端索引库把它写进 meta，与当前代码不一致时直接拒绝服务，
 * 避免用旧规则索引去匹配新规则还原出来的正文。
 *
 * 例外：**只新增语料种类**（例如后来的 `summary`）不升版本——已有锚点的正文与指纹逐位未变，
 * 旧索引对它们依然准确；新增的锚点在旧索引里没有向量，客户端按「向量缺失只影响该锚点的
 * 向量召回、词法通道照常」处理（见 `vector.ts` 与 `query.ts` 的锚点过滤），
 * 下次重建索引时自然补齐。升版本会让线上索引直接变 503，代价远大于收益。
 */
export const RAG_CHUNK_SCHEMA_VERSION = 1

/** chunk 种类：决定客户端如何还原正文、路径与上下文 */
export type RagChunkKind =
    /** 剧情对话（一行一条，含选项行） */
    | "story"
    /** 角色语音（一条语音一条） */
    | "voice"
    /** 资料库条目（一条目一条，正文为标题 + 副信息 + 隐藏检索词） */
    | "entry"
    /** 任务链剧情 AI 总结（一条任务链一条，正文为整链梗概） */
    | "summary"
    /** 角色档案（一条档案一条，正文为整篇档案原文，见 `charext.data`） */
    | "profile"

/**
 * 全部语料种类。
 *
 * 同时给工具 schema 的 enum 与入参校验用：模型可能给出不存在的种类或模块，
 * 检索前一律按白名单收敛，避免脏参数把检索面清空。
 */
export const RAG_CHUNK_KINDS: readonly RagChunkKind[] = ["story", "voice", "entry", "summary", "profile"]

/**
 * 参与服务端向量索引的语料种类（**双端契约**）。
 *
 * 语义检索的收益集中在长文本上，条目（entry）不进服务端索引：它是界面语言的短文本，
 * 词法 + facet 已经够用，且随译文变化，纳入指纹会让「同一份数据包」因界面语言不同而算出不同指纹。
 *
 * 数据包构建（算内容指纹）与服务端建索引都用这一份清单取语料，
 * 两边的切块结果一致，指纹才对得上。
 */
export const RAG_SERVER_KINDS: readonly RagChunkKind[] = ["story", "summary", "voice", "profile"]

/** 一条可检索的语料单元 */
export interface RagChunk {
    /** 双端一致的稳定标识，同时作为向量索引的主键 */
    anchor: string
    /** 语料种类 */
    kind: RagChunkKind
    /** 数据语言：剧情 / 语音 / 档案按语言切分，条目跟随界面语言 */
    lang: string
    /**
     * 条目所属资料库模块（kind 为 entry 时是条目模块如 char / weapon / mod，
     * 为 profile 时恒为 `charprofile`——档案同样按模块参与 `modules` 过滤）
     */
    module?: string
    /** 条目实体 id（仅 kind 为 entry 时存在），供工具按 id 回查详情 */
    entityId?: string
    /** 标题字段：说话人 / 语音名 / 条目名（检索时权重最高） */
    title: string
    /** 正文：参与检索并可作引用片段 */
    text: string
    /**
     * 结构化伴随信息：任务名 / 篇章 / 章节 / 类别等。
     *
     * 单独成字段而不是并进 text，是为了给它单独的字段权重（低于标题、高于正文），
     * 也便于返回时把「这段话属于哪条任务链的哪一章」一并给模型。
     */
    meta: string
    /** 客户端跳转路径，取自数据本身，不由模型拼接 */
    path: string
    /** 版本号（剧情任务链与可版本化的条目带，其余为空） */
    version?: string
    /** 内容指纹，用于校验服务端返回的向量是否对应当前正文 */
    hash: string
}

/** 条目类 chunk 的输入（客户端由全库检索索引枚举，服务端目前不建条目索引） */
export interface RagEntryInput {
    /** 全库检索索引里的条目 id，形如 `char:1001` / `weapon:10101` */
    id: string
    /** 条目名（已按界面语言翻译） */
    title: string
    /** 副信息 */
    subtitle?: string
    /** 类型展示名（角色 / 武器 / 魔之楔…） */
    typeLabel?: string
    /** 详情页路径 */
    path: string
    /** 隐藏检索词（详情页字段，只在索引里参与匹配，不对外返回） */
    searchText?: string
    /** 版本号 */
    version?: string
}

/** 剧情 chunk 的锚点前缀 */
export const RAG_STORY_ANCHOR_PREFIX = "story:"

/** 语音 chunk 的锚点前缀 */
export const RAG_VOICE_ANCHOR_PREFIX = "voice:"

/** 条目 chunk 的锚点前缀 */
export const RAG_ENTRY_ANCHOR_PREFIX = "entry:"

/** 剧情 AI 总结 chunk 的锚点前缀 */
export const RAG_SUMMARY_ANCHOR_PREFIX = "summary:"

/** 角色档案 chunk 的锚点前缀 */
export const RAG_PROFILE_ANCHOR_PREFIX = "profile:"

/**
 * 角色档案在资料库里的模块 id（跨端契约的一部分）。
 *
 * 档案 chunk 带这个 module，因此 `rag_search` 的 `modules` 过滤与
 * `query_module_entries` 的模块 id 指的是同一件东西，必须逐字一致。
 */
export const RAG_PROFILE_MODULE = "charprofile"

/**
 * 剧情 AI 总结正文的语言（跨端一致项之一）。
 *
 * 总结来自 i18n 导出的 storySummary.json，只有简体中文一套（见 `storysummary.data.ts`），
 * 因此不论语料按哪种语言装配，这批 chunk 的 `lang` 都恒为 zh；
 * 服务端建索引与客户端装配语料取的是同一份正文，锚点与指纹才能逐位对上。
 */
export const RAG_SUMMARY_LANG = "zh"

/**
 * 拼剧情对话行的锚点。
 *
 * 对话与选项分别用 `d` / `o` 前缀区分：两者的 id 各自在自己的表里唯一，
 * 不加前缀会在同一条任务里撞号。
 * @param chainId 任务链 id
 * @param questId 任务 id
 * @param dialogueId 对话 id
 * @returns 锚点
 */
export function storyDialogueAnchor(chainId: number, questId: number, dialogueId: number): string {
    return `${RAG_STORY_ANCHOR_PREFIX}${chainId}:${questId}:d${dialogueId}`
}

/**
 * 拼剧情选项行的锚点。
 * @param chainId 任务链 id
 * @param questId 任务 id
 * @param optionId 选项 id
 * @returns 锚点
 */
export function storyOptionAnchor(chainId: number, questId: number, optionId: number): string {
    return `${RAG_STORY_ANCHOR_PREFIX}${chainId}:${questId}:o${optionId}`
}

/**
 * 拼角色语音的锚点。
 * @param charId 角色 id
 * @param voiceId 语音 id
 * @returns 锚点
 */
export function voiceAnchor(charId: number, voiceId: number): string {
    return `${RAG_VOICE_ANCHOR_PREFIX}${charId}:${voiceId}`
}

/**
 * 拼条目锚点。
 * @param module 模块 id（char / weapon / mod…）
 * @param entityId 条目 id
 * @returns 锚点
 */
export function entryAnchor(module: string, entityId: string | number): string {
    return `${RAG_ENTRY_ANCHOR_PREFIX}${module}:${entityId}`
}

/**
 * 拼角色档案的锚点。
 *
 * 档案 id 在角色内唯一（每条档案带 charId），但不同角色之间存在同号风险，
 * 因此与语音同口径把 charId 一并放进锚点。
 * @param charId 角色 id
 * @param profileId 档案 id
 * @returns 锚点
 */
export function profileAnchor(charId: number, profileId: number): string {
    return `${RAG_PROFILE_ANCHOR_PREFIX}${charId}:${profileId}`
}

/**
 * 拼任务链剧情 AI 总结的锚点。
 *
 * 一条任务链只有一份总结（数据本身以任务链 id 为键），因此锚点只需链 id，
 * 不带任务维度——总结覆盖的是整条链。
 * @param chainId 任务链 id
 * @returns 锚点
 */
export function summaryAnchor(chainId: number): string {
    return `${RAG_SUMMARY_ANCHOR_PREFIX}${chainId}`
}

/**
 * 计算内容指纹（FNV-1a 32 位双通道，取两份不同种子的结果拼成 16 位十六进制）。
 *
 * 用纯 JS 手写而不是 WebCrypto：客户端与服务端需要**同步、同值**的指纹，
 * WebCrypto 是异步的，而 node:crypto 与浏览器实现又不保证跨端一致；
 * 这里只需要防「版本漂移导致的错配」，不需要抗碰撞的密码学强度。
 * @param text 正文文本
 * @returns 16 位十六进制指纹
 */
export function ragChunkHash(text: string): string {
    let hashA = 0x811c9dc5
    let hashB = 0x01000193

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        hashA ^= code
        hashA = Math.imul(hashA, 0x01000193)
        hashB = Math.imul(hashB ^ code, 0x85ebca6b)
        hashB ^= hashB >>> 13
    }

    const partA = (hashA >>> 0).toString(16).padStart(8, "0")
    const partB = (hashB >>> 0).toString(16).padStart(8, "0")

    return `${partA}${partB}`
}

/**
 * 按语料种类的指纹表（键即 {@link RagChunkKind} 的值，如 `story` / `voice`）。
 *
 * 用普通字符串键而不是联合类型键：这份表要在清单 JSON、请求体、索引 meta 之间原样传递，
 * 三处的键都是运行期字符串，写成映射类型只会给取值加一层无谓的断言。
 * 只记有内容的种类（某语言没有档案就没有 `profile` 键）。
 */
export type RagKindFingerprintMap = Record<string, string>

/**
 * 计算一份语料**按种类分别**的内容指纹（**双端契约**）。
 *
 * 为什么按种类分开而不是只给一个整体指纹：数据更新绝大多数只动其中一部分
 * （补几条语音、改几段剧情、加一篇档案），一个整体指纹会把这些无关模块一起判为「不一致」，
 * 客户端就只能整包失效、索引也只能整体重来。分开之后：
 * - 数据包清单里每个种类各一份指纹，客户端原样携带；
 * - 服务端按种类比对，**指纹相符的种类照常提供向量**（老模块可复用），不符的种类退回词法；
 * - 索引重建同样按种类判断，只重算变化的那部分。
 *
 * 每个种类的指纹 = 该种类全部 chunk 的「锚点 + 正文指纹」排序后拼串再哈希：
 * 锚点或正文任一变化都会改变它，与 chunk 的产出顺序无关。
 * @param chunks 语料 chunk（至少含种类、锚点与内容指纹）
 * @returns 种类 → 16 位十六进制指纹
 */
export function ragKindFingerprints(chunks: readonly { kind: RagChunkKind; anchor: string; hash: string }[]): RagKindFingerprintMap {
    const linesByKind = new Map<RagChunkKind, string[]>()

    for (const chunk of chunks) {
        const lines = linesByKind.get(chunk.kind) ?? []
        lines.push(`${chunk.anchor}:${chunk.hash}`)
        linesByKind.set(chunk.kind, lines)
    }

    const fingerprints: RagKindFingerprintMap = {}

    for (const [kind, lines] of linesByKind) {
        lines.sort()
        fingerprints[kind] = ragChunkHash(lines.join("\n"))
    }

    return fingerprints
}
