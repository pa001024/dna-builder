export interface ModelverseConfig {
    baseUrl: string
    model: string
    timeoutMs: number
}

export interface ModelverseRequest {
    text: string
    refAudioPath: string
    emoAudioPath?: string
    emoControlMethod?: 0 | 1 | 2 | 3
    emoAlpha?: number
    speed?: number
    sampleRate?: number
}

function readApiKey(): string {
    const key = process.env.MODELVERSE_API_KEY || ""
    if (!key) throw new Error("缺少 MODELVERSE_API_KEY（.env）")
    return key
}

/**
 * 经 ModelVerse IndexTTS-2 合成（multipart，按次传参考，无 7 天过期问题）。
 * @param config 服务配置
 * @param request 合成请求
 * @returns wav 音频二进制
 */
export async function modelverseInferOnce(config: ModelverseConfig, request: ModelverseRequest): Promise<ArrayBuffer> {
    const maxRateRetries = 5
    let lastError: unknown = null
    for (let rateAttempt = 0; rateAttempt <= maxRateRetries; rateAttempt += 1) {
        try {
            return await modelverseInferAttempt(config, request)
        } catch (error) {
            lastError = error
            const message = error instanceof Error ? error.message : String(error)
            if (!/429|rate_limited|rate limit/i.test(message) || rateAttempt === maxRateRetries) throw error
            const backoffMs = 20000 * (rateAttempt + 1)
            console.log(`modelverse 429, ${Math.round(backoffMs / 1000)}s 后重试…`)
            await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
    }
    throw lastError instanceof Error ? lastError : new Error("ModelVerse 限流重试耗尽")
}

async function modelverseInferAttempt(config: ModelverseConfig, request: ModelverseRequest): Promise<ArrayBuffer> {
    const form = new FormData()
    form.append("model", config.model)
    form.append("spk_audio_file", Bun.file(request.refAudioPath), "ref.wav")
    if (request.emoAudioPath) {
        form.append("emo_audio_file", Bun.file(request.emoAudioPath), "emo.wav")
    }
    form.append(
        "payload",
        JSON.stringify({
            input: request.text,
            sample_rate: request.sampleRate ?? 22050,
            ...(request.speed !== undefined ? { speed: request.speed } : {}),
            emo_control_method: request.emoAudioPath ? (request.emoControlMethod ?? 1) : 0,
            emo_alpha: request.emoAlpha ?? 1,
        })
    )
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
        const response = await fetch(`${config.baseUrl}/v1/audio/infer`, {
            method: "POST",
            headers: { Authorization: `Bearer ${readApiKey()}` },
            body: form,
            signal: controller.signal,
        })
        if (!response.ok) throw new Error(`ModelVerse ${response.status}: ${(await response.text()).slice(0, 300)}`)
        return await response.arrayBuffer()
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 读取 ModelVerse 配置（key 只从环境取，不打印）。
 * @returns 服务配置
 */
export function readModelverseConfig(): ModelverseConfig {
    readApiKey()
    return {
        baseUrl: (process.env.MODELVERSE_BASE_URL || "https://api.modelverse.cn").replace(/\/+$/, ""),
        model: process.env.MODELVERSE_MODEL || "IndexTeam/IndexTTS-2",
        timeoutMs: Number(process.env.MODELVERSE_TIMEOUT_MS || 300000),
    }
}
