import { PiRunnerError } from "./config"

/** 一张经处理、可发给模型的图片；data 是 base64，不是路径或 URL。 */
export type PiImagePayload = { data: string; mimeType: string }

/** 子进程回传的 token 用量（可选，来源为最终 assistant message 的 usage）。 */
export type PiTokenUsagePayload = { input?: number; output?: number; cachedInput?: number; imageCalls?: number }

export type PiRunMessage = {
    type: "run"
    jobId: string
    fencingToken: number
    inputHash: string
    submissionVersionId: string
    prompt: string
    images: PiImagePayload[]
}

export type PiReadyMessage = { type: "ready" }

export type PiToolCallMessage = { type: "tool_call"; callId: string; name: string; args: Record<string, unknown> }

export type PiToolResultMessage = { type: "tool_result"; callId: string; ok: boolean; result?: unknown; error?: string }

export type PiResultMessage =
    | { type: "result"; ok: true; proposal: unknown; tokenUsage?: PiTokenUsagePayload }
    | { type: "result"; ok: false; error: string; detail?: string }

export type PiMessage = PiRunMessage | PiReadyMessage | PiToolCallMessage | PiToolResultMessage | PiResultMessage

/** 单行消息上限：图片 base64 会显著放大请求体积，但必须有界。 */
export const DEFAULT_MAX_MESSAGE_BYTES = 32 * 1024 * 1024

function protocol(message: string, detail?: Record<string, unknown>): never {
    throw new PiRunnerError("protocol_invalid", message, { detail })
}

function assertString(value: unknown, field: string): void {
    if (typeof value !== "string" || !value) protocol(`${field} 必须是非空字符串`)
}

function decodeImages(value: unknown): PiImagePayload[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) protocol("images 必须是数组")
    return value.map((item, index) => {
        if (!item || typeof item !== "object") protocol(`images[${index}] 不是对象`)
        const image = item as Record<string, unknown>
        assertString(image.data, `images[${index}].data`)
        assertString(image.mimeType, `images[${index}].mimeType`)
        return { data: image.data as string, mimeType: image.mimeType as string }
    })
}

/** 把一行 JSON 解析成受控协议消息；形状不符立即拒绝，方便测试构造。 */
export function decodeMessage(line: string): PiMessage {
    let parsed: unknown
    try {
        parsed = JSON.parse(line)
    } catch {
        protocol("消息不是合法 JSON")
    }
    if (!parsed || typeof parsed !== "object") protocol("消息必须是对象")
    const message = parsed as Record<string, unknown>

    switch (message.type) {
        case "ready":
            return { type: "ready" }
        case "run": {
            assertString(message.jobId, "jobId")
            if (!Number.isInteger(message.fencingToken) || (message.fencingToken as number) < 0) protocol("fencingToken 必须是非负整数")
            assertString(message.inputHash, "inputHash")
            assertString(message.submissionVersionId, "submissionVersionId")
            assertString(message.prompt, "prompt")
            return {
                type: "run",
                jobId: message.jobId as string,
                fencingToken: message.fencingToken as number,
                inputHash: message.inputHash as string,
                submissionVersionId: message.submissionVersionId as string,
                prompt: message.prompt as string,
                images: decodeImages(message.images),
            }
        }
        case "tool_call": {
            assertString(message.callId, "callId")
            assertString(message.name, "name")
            if (!message.args || typeof message.args !== "object" || Array.isArray(message.args)) protocol("args 必须是对象")
            return {
                type: "tool_call",
                callId: message.callId as string,
                name: message.name as string,
                args: message.args as Record<string, unknown>,
            }
        }
        case "tool_result": {
            assertString(message.callId, "callId")
            if (typeof message.ok !== "boolean") protocol("ok 必须是布尔值")
            if (!message.ok) assertString(message.error, "error")
            return {
                type: "tool_result",
                callId: message.callId as string,
                ok: message.ok as boolean,
                result: message.result,
                error: message.error as string | undefined,
            }
        }
        case "result": {
            if (typeof message.ok !== "boolean") protocol("ok 必须是布尔值")
            if (message.ok) {
                if (!message.proposal || typeof message.proposal !== "object") protocol("proposal 必须是对象")
                return {
                    type: "result",
                    ok: true,
                    proposal: message.proposal,
                    tokenUsage: decodeTokenUsage(message.tokenUsage),
                }
            }
            assertString(message.error, "error")
            if (message.detail !== undefined) assertString(message.detail, "detail")
            return { type: "result", ok: false, error: message.error as string, detail: message.detail as string | undefined }
        }
        default:
            protocol(`未知消息类型：${String(message.type)}`)
    }
}

function decodeTokenUsage(value: unknown): PiTokenUsagePayload | undefined {
    if (value === undefined) return undefined
    if (!value || typeof value !== "object") protocol("tokenUsage 必须是对象")
    const usage = value as Record<string, unknown>
    const result: PiTokenUsagePayload = {}
    for (const key of ["input", "output", "cachedInput", "imageCalls"] as const) {
        const item = usage[key]
        if (item === undefined) continue
        if (typeof item !== "number" || !Number.isFinite(item) || item < 0) protocol(`tokenUsage.${key} 必须是非负数`)
        result[key] = item
    }
    return result
}

/** 序列化一条消息（带换行），父进程与子进程共用同一格式。 */
export function encodeMessage(message: PiMessage): string {
    return `${JSON.stringify(message)}\n`
}

/** 行输出的最小接口：Bun FileSink / process.stdout / 内存队列都满足。 */
export type LineSink = { write(chunk: string): unknown; flush?(): unknown; close?(): void }

/**
 * @description 按行切分异步字节流并解码协议消息；单行超限或协议不合法时终止读取。
 * @param source 字节块或字符串块来源
 * @param maxLineBytes 单行上限
 */
async function* readLines(source: AsyncIterable<string | Uint8Array>, maxLineBytes: number): AsyncGenerator<PiMessage> {
    const decoder = new TextDecoder()
    let buffer = ""
    for await (const chunk of source) {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "")
            buffer = buffer.slice(newline + 1)
            if (line.trim()) yield decodeMessage(line)
            newline = buffer.indexOf("\n")
        }
        if (buffer.length > maxLineBytes) {
            throw new PiRunnerError("protocol_invalid", "单条消息超过长度上限", { detail: { maxLineBytes } })
        }
    }
    const tail = buffer.trim()
    if (tail) yield decodeMessage(tail)
}

/**
 * @description 双向 JSON Lines 通道：父进程与子进程各持一端，`send` 写一行，`next` 取下一条消息。
 * 输入流结束返回 `null`；协议或流错误在下一次读取时抛出。
 */
export class JsonLineChannel {
    private readonly iterator: AsyncGenerator<PiMessage>
    private pendingError: unknown = null

    constructor(
        source: AsyncIterable<string | Uint8Array>,
        private readonly sink: LineSink,
        maxLineBytes = DEFAULT_MAX_MESSAGE_BYTES
    ) {
        this.iterator = readLines(source, maxLineBytes)
    }

    send(message: PiMessage): void {
        this.sink.write(encodeMessage(message))
        this.sink.flush?.()
    }

    /** 取下一条消息；流正常结束返回 null，错误在此时抛出。 */
    async next(): Promise<PiMessage | null> {
        if (this.pendingError) {
            const error = this.pendingError
            this.pendingError = null
            throw error
        }
        try {
            const result = await this.iterator.next()
            return result.done ? null : result.value
        } catch (error) {
            this.pendingError = error
            throw error
        }
    }

    /** 释放读取端并关闭可关闭的写入端（内存通道用它向对端发 EOF）；不等待未完成的读取。 */
    close(): void {
        try {
            void this.iterator.return(undefined)
        } catch {
            // 关闭阶段的错误对调用方无意义
        }
        try {
            this.sink.close?.()
        } catch {
            // 写入端可能已被对端关闭
        }
    }
}

/** 内存队列：把 `write` 接到对端的异步迭代器上，用于同进程双端与测试。 */
class MemorySource implements AsyncIterable<string>, LineSink {
    private readonly chunks: string[] = []
    private waiters: Array<(chunk: string | null) => void> = []
    private closed = false

    write(chunk: string): void {
        if (this.closed) return
        const waiter = this.waiters.shift()
        if (waiter) waiter(chunk)
        else this.chunks.push(chunk)
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        for (const waiter of this.waiters) waiter(null)
        this.waiters = []
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<string> {
        while (true) {
            const chunk = this.chunks.shift()
            if (chunk !== undefined) {
                yield chunk
                continue
            }
            if (this.closed) return
            const next = await new Promise<string | null>(resolve => this.waiters.push(resolve))
            if (next === null) return
            yield next
        }
    }
}

/**
 * @description 建立一对互连的内存通道；`parent` 发给 `child`，反之亦然。
 * 用于同进程集成测试以及不需要真实子进程的调用方。
 */
export function createInMemoryChannelPair(maxLineBytes = DEFAULT_MAX_MESSAGE_BYTES): { parent: JsonLineChannel; child: JsonLineChannel } {
    const parentToChild = new MemorySource()
    const childToParent = new MemorySource()
    return {
        parent: new JsonLineChannel(childToParent, parentToChild, maxLineBytes),
        child: new JsonLineChannel(parentToChild, childToParent, maxLineBytes),
    }
}
