import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface AsrVerifyItem {
    id: number
    wav: string
    text: string
}

export interface AsrVerifyResult {
    id: number
    transcript: string
    cer: number
    recall: number
    missing: number
    longest_missing: number
}

export interface QaFailure {
    id: number
    suffix: string
    cer: number
    recall: number
    missing: number
    longest_missing: number
    transcript: string
    text: string
    ref: string
}

/** QA 通过规则（防丢字为主，容忍 ASR 专名噪声）。 */
export interface QaThresholds {
    cer: number
    recall: number
    span: number
    shortLen: number
    shortMiss: number
    shortCer: number
}

/**
 * 读取 QA 阈值（环境变量覆盖）。
 * @returns QA 阈值
 */
export function readQaThresholds(): QaThresholds {
    return {
        cer: Number(process.env.VOICE_QA_CER ?? 0.6),
        recall: Number(process.env.VOICE_QA_RECALL ?? 0.8),
        span: Number(process.env.VOICE_QA_SPAN ?? 8),
        shortLen: Number(process.env.VOICE_QA_SHORT_LEN ?? 12),
        shortMiss: Number(process.env.VOICE_QA_SHORT_MISS ?? 2),
        shortCer: Number(process.env.VOICE_QA_SHORT_CER ?? 0.4),
    }
}

/**
 * 判定验音是否通过。
 * @param result 验音结果
 * @param thresholds QA 阈值
 * @param refLen 期望文本归一化长度
 * @returns 是否通过
 */
export function isQaPass(
    result: Pick<AsrVerifyResult, "cer" | "recall" | "missing" | "longest_missing">,
    thresholds: QaThresholds,
    refLen: number
): boolean {
    if (result.longest_missing >= thresholds.span) return false
    if (result.cer > thresholds.cer) return false
    if (result.recall >= thresholds.recall) return true
    return refLen <= thresholds.shortLen && result.missing <= thresholds.shortMiss && result.cer <= thresholds.shortCer
}

/** 常驻 ASR 验音服务（模型只加载一次，逐条走 stdin/stdout）。 */
export class AsrServeSession {
    private proc: ReturnType<typeof Bun.spawn> | undefined
    private reader: ReadableStreamDefaultReader<string> | undefined
    private buffer = ""
    private restarts = 0

    /**
     * 拉起常驻进程（模型加载约半分钟）。
     */
    async start(): Promise<void> {
        const script = path.resolve(THIS_DIR, "asr_verify.py")
        this.proc = Bun.spawn([GSTS_PYTHON, script, "--serve", "--model", process.env.VOICE_ASR_MODEL || "paraformer-zh"], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "ignore",
            env: { ...process.env, PYTHONUTF8: "1" },
        })
        const stdout = this.proc.stdout
        if (!stdout || typeof stdout === "number") throw new Error("ASR stdout 不是 pipe")
        this.reader = stdout.pipeThrough(new TextDecoderStream()).getReader()
        this.restarts = 0
    }

    /**
     * 验一条 wav，失败自动重启进程重试一次。
     * @param item 待验项
     * @returns 验音结果
     */
    async verify(item: AsrVerifyItem): Promise<AsrVerifyResult> {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await this.verifyOnce(item)
            } catch {
                await this.restart()
            }
        }
        throw new Error("ASR 验音进程无响应")
    }

    private async verifyOnce(item: AsrVerifyItem): Promise<AsrVerifyResult> {
        if (!this.proc || !this.reader) throw new Error("ASR 未启动")
        const stdin = this.proc.stdin
        if (!stdin || typeof stdin === "number") throw new Error("ASR stdin 不是 pipe")
        stdin.write(`${JSON.stringify(item)}\n`)
        for (;;) {
            const { done, value } = await this.reader.read()
            if (done) throw new Error("ASR 进程退出")
            this.buffer += value
            for (;;) {
                const newlineIndex = this.buffer.indexOf("\n")
                if (newlineIndex === -1) break
                const line = this.buffer.slice(0, newlineIndex).trim()
                this.buffer = this.buffer.slice(newlineIndex + 1)
                if (!line) continue
                try {
                    const parsed = JSON.parse(line) as AsrVerifyResult
                    if (parsed.id === item.id) return parsed
                } catch {}
            }
        }
    }

    private async restart(): Promise<void> {
        this.restarts += 1
        if (this.restarts > 3) throw new Error("ASR 进程反复崩溃")
        try {
            this.reader?.releaseLock()
        } catch {}
        try {
            this.proc?.kill()
        } catch {}
        await this.start()
    }

    /**
     * 关闭常驻进程。
     */
    stop(): void {
        try {
            this.reader?.cancel()
        } catch {}
        try {
            this.proc?.kill()
        } catch {}
    }
}

const GSTS_PYTHON = path.resolve(process.env.GSTS_PYTHON || "E:/soft/GPT-SoVITS-v2/runtime/python.exe")

const THIS_DIR = typeof import.meta.dir === "string" ? (import.meta.dir as string) : path.dirname(fileURLToPath(import.meta.url))

/**
 * FunASR 批量验音：转写 wav 并算 CER，一次进程处理整批。
 * @param items 待验项（id + wav 路径 + 期望文本）
 * @returns 按 id 排序的验音结果
 */
export async function verifyPronunciationBatch(items: AsrVerifyItem[]): Promise<AsrVerifyResult[]> {
    if (!items.length) return []
    const workDir = mkdtempSync(path.join(tmpdir(), "voice-asr-"))
    try {
        const inputPath = path.join(workDir, "input.json")
        const outputPath = path.join(workDir, "output.json")
        writeFileSync(inputPath, JSON.stringify(items))
        const script = path.resolve(THIS_DIR, "asr_verify.py")
        const result = spawnSync(
            GSTS_PYTHON,
            [script, "--input", inputPath, "--output", outputPath, "--model", process.env.VOICE_ASR_MODEL || "paraformer-zh"],
            { encoding: "utf-8" }
        )
        if (result.status !== 0) {
            throw new Error(`ASR 验音进程退出 ${result.status}: ${String(result.stderr).slice(-500)}`)
        }
        const results = JSON.parse(readFileSync(outputPath, "utf-8")) as AsrVerifyResult[]
        return results.sort((a, b) => a.id - b.id)
    } finally {
        rmSync(workDir, { recursive: true, force: true })
    }
}
