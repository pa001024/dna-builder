export interface GptSoVitsConfig {
    baseUrl: string
    endpoint: string
    timeoutMs: number
    retries: number
}

export interface GptSoVitsSynthRequest {
    text: string
    textLang: string
    refAudioPath: string
    promptText: string
    promptLang: string
}

/**
 * 读取 GPT-SoVITS 服务配置（环境变量 GSTS_API_URL 覆盖默认本机地址）。
 * @returns 服务配置
 */
export function readGptSoVitsConfig(): GptSoVitsConfig {
    return {
        baseUrl: (process.env.GSTS_API_URL || "http://127.0.0.1:9880").replace(/\/+$/, ""),
        endpoint: process.env.GSTS_ENDPOINT || "/",
        timeoutMs: Number(process.env.GSTS_TIMEOUT_MS || 120000),
        retries: Number(process.env.GSTS_RETRIES || 2),
    }
}

/**
 * 调用一次 GPT-SoVITS 合成，返回 wav 二进制。
 * @param config 服务配置
 * @param request 合成请求
 * @returns wav 音频二进制
 */
export async function synthesizeOnce(config: GptSoVitsConfig, request: GptSoVitsSynthRequest): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
        text: request.text,
        text_lang: request.textLang,
        ref_audio_path: request.refAudioPath,
        prompt_text: request.promptText,
        prompt_lang: request.promptLang,
        media_type: "wav",
        streaming_mode: "false",
    })
    let lastError: unknown = null
    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), config.timeoutMs)
            try {
                const response = await fetch(`${config.baseUrl}${config.endpoint}?${params.toString()}`, { signal: controller.signal })
                if (!response.ok) throw new Error(`GPT-SoVITS ${response.status}: ${await response.text()}`)
                return await response.arrayBuffer()
            } finally {
                clearTimeout(timer)
            }
        } catch (error) {
            lastError = error
        }
    }
    throw lastError instanceof Error ? lastError : new Error("GPT-SoVITS 合成失败")
}
