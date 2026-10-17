import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export interface IndexTtsConfig {
    baseUrl: string
    timeoutMs: number
}

export interface IndexTtsRequest {
    text: string
    refAudioPath: string
    settings?: Record<string, unknown>
}

const INDEX_DO_SAMPLE = (process.env.INDEX_DO_SAMPLE ?? "false").toLowerCase() === "true"

/**
 * 读取 IndexTTS 服务配置。
 * @returns 服务配置
 */
export function readIndexTtsConfig(): IndexTtsConfig {
    return {
        baseUrl: (process.env.INDEX_API_URL || "http://127.0.0.1:8849").replace(/\/+$/, ""),
        timeoutMs: Number(process.env.INDEX_TIMEOUT_MS || 300000),
    }
}

/**
 * 调用一次 IndexTTS 合成，返回 wav 二进制（经服务端落盘中转）。
 * @param config 服务配置
 * @param request 合成请求
 * @returns wav 音频二进制
 */
export async function indexTtsOnce(config: IndexTtsConfig, request: IndexTtsRequest): Promise<ArrayBuffer> {
    const workDir = mkdtempSync(path.join(tmpdir(), "index-tts-"))
    try {
        const outputPath = path.join(workDir, "out.wav")
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), config.timeoutMs)
        try {
            const response = await fetch(`${config.baseUrl}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    audio_path: request.refAudioPath,
                    output_path: outputPath,
                    text: request.text,
                    verbose: false,
                    setings: { do_sample: INDEX_DO_SAMPLE, ...(request.settings ?? {}) },
                }),
                signal: controller.signal,
            })
            if (!response.ok) throw new Error(`IndexTTS ${response.status}: ${(await response.text()).slice(0, 200)}`)
        } finally {
            clearTimeout(timer)
        }
        const raw = readFileSync(outputPath)
        return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    } finally {
        rmSync(workDir, { recursive: true, force: true })
    }
}
