/**
 * 设置页「一键添加供应商」的预设清单。
 *
 * `baseUrl` 必须能直接续接 `/chat/completions` 或 `/models`；Anthropic / DeepSeek 由协议判定层
 * 自动切到 Messages。本地网关的 key 只是占位或固定口令：回环请求多数不校验密钥，
 * 但前端的「自定义模型」开关要求有值才会直连。
 */

/** 预设分组：官方、云平台/聚合、本机网关。 */
export type AiProviderGroup = "official" | "aggregator" | "local"

/** 一条供应商预设。 */
export interface AiProviderPreset {
    /** 稳定 id（Select 的 value） */
    id: string
    /** 展示名（品牌名不翻译） */
    name: string
    /** 所属分组 */
    group: AiProviderGroup
    /** 上游基址 */
    baseUrl: string
    /** 预设密钥；云端供应商留空由用户填写 */
    apiKey?: string
    /** 本机网关：桌面端走 Tauri 原生 HTTP，网页端需网关放行来源 */
    local?: boolean
    /** 模型列表不在基址下时给站点根的路径：magpie 的 `/models` 不挂在 `/v1` 下 */
    modelsPath?: string
}

/** 预设清单：顺序即设置页下拉里的展示顺序。 */
export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
    { id: "openai", name: "OpenAI", group: "official", baseUrl: "https://api.openai.com/v1" },
    { id: "anthropic", name: "Anthropic Claude", group: "official", baseUrl: "https://api.anthropic.com" },
    { id: "deepseek", name: "DeepSeek", group: "official", baseUrl: "https://api.deepseek.com" },
    { id: "gemini", name: "Google Gemini", group: "official", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
    { id: "xai", name: "xAI Grok", group: "official", baseUrl: "https://api.x.ai/v1" },
    { id: "mistral", name: "Mistral", group: "official", baseUrl: "https://api.mistral.ai/v1" },
    { id: "openrouter", name: "OpenRouter", group: "aggregator", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "siliconflow", name: "SiliconFlow", group: "aggregator", baseUrl: "https://api.siliconflow.cn/v1" },
    { id: "zhipu", name: "智谱 GLM", group: "aggregator", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    { id: "moonshot", name: "Moonshot Kimi", group: "aggregator", baseUrl: "https://api.moonshot.cn/v1" },
    {
        id: "dashscope",
        name: "阿里云百炼",
        group: "aggregator",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    { id: "ark", name: "火山方舟", group: "aggregator", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
    { id: "groq", name: "Groq", group: "aggregator", baseUrl: "https://api.groq.com/openai/v1" },
    { id: "together", name: "Together AI", group: "aggregator", baseUrl: "https://api.together.xyz/v1" },
    {
        id: "magpie",
        name: "Magpie",
        group: "local",
        baseUrl: "http://127.0.0.1:3425/v1",
        apiKey: "magpie",
        local: true,
        modelsPath: "/models",
    },
    { id: "ollama", name: "Ollama", group: "local", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "ollama", local: true },
    { id: "lmstudio", name: "LM Studio", group: "local", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "lmstudio", local: true },
]

/**
 * @description 按 id 查找预设。
 * @param id 预设 id
 * @returns 匹配的预设；不存在时 undefined
 */
export function findAiProviderPreset(id: string): AiProviderPreset | undefined {
    return AI_PROVIDER_PRESETS.find(preset => preset.id === id)
}

/**
 * @description 按用户填写的基址反查预设（用于下拉回显）。
 * @param baseUrl 当前上游基址
 * @returns 匹配的预设；手填地址或存在尾斜杠差异不匹配时 undefined
 */
export function resolveAiProviderByBaseUrl(baseUrl: string): AiProviderPreset | undefined {
    const target = normalizeBaseUrl(baseUrl)
    if (!target) {
        return undefined
    }

    return AI_PROVIDER_PRESETS.find(preset => normalizeBaseUrl(preset.baseUrl) === target)
}

/**
 * @description 比较用的基址归一化：去空白、去尾斜杠、统一小写。
 * @param baseUrl 原始基址
 * @returns 归一化后的字符串
 */
function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, "").toLowerCase()
}
