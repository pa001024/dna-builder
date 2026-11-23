import { describe, expect, it } from "bun:test"
import { PiRunnerError } from "./config"
import {
    createInMemoryChannelPair,
    decodeMessage,
    encodeMessage,
    JsonLineChannel,
    type PiMessage,
    type PiResultMessage,
    type PiRunMessage,
} from "./proposal-io"

const runMessage: PiRunMessage = {
    type: "run",
    jobId: "job-1",
    fencingToken: 2,
    inputHash: "hash-1",
    submissionVersionId: "sub-1:1",
    prompt: "处理反馈",
    images: [{ data: "aGVsbG8=", mimeType: "image/png" }],
}

describe("pi runner IPC protocol", () => {
    it("run 消息编码后能完整解码", () => {
        const line = encodeMessage(runMessage)
        expect(line.endsWith("\n")).toBe(true)
        expect(decodeMessage(line.trim())).toEqual(runMessage)
    })

    it("result / tool_call / tool_result / ready 都能往返", () => {
        const messages: PiMessage[] = [
            { type: "ready" },
            { type: "tool_call", callId: "c1", name: "search_bug_candidates", args: { query: "卡" } },
            { type: "tool_result", callId: "c1", ok: true, result: { candidates: [] } },
            { type: "result", ok: true, proposal: { schemaVersion: 1 }, tokenUsage: { input: 3, output: 4 } },
            { type: "result", ok: false, error: "schema_invalid", detail: "missing parts[0].title" },
        ]
        for (const message of messages) {
            expect(decodeMessage(encodeMessage(message).trim())).toEqual(message)
        }
    })

    it("非法 JSON、未知类型与缺失字段被拒绝", () => {
        expect(() => decodeMessage("{not json")).toThrow(PiRunnerError)
        expect(() => decodeMessage('{"type":"nope"}')).toThrow(/未知消息类型/)
        expect(() => decodeMessage('{"type":"run","jobId":"j"}')).toThrow(/fencingToken/)
        expect(() => decodeMessage('{"type":"tool_call","callId":"c","name":"x","args":[]}')).toThrow(/args/)
        expect(() => decodeMessage('{"type":"result","ok":true}')).toThrow(/proposal/)
        expect(() => decodeMessage('{"type":"result","ok":false}')).toThrow(/error/)
    })

    it("内存通道对可双向收发，EOF 返回 null", async () => {
        const { parent, child } = createInMemoryChannelPair()

        child.send({ type: "ready" })
        expect(await parent.next()).toEqual({ type: "ready" })

        parent.send(runMessage)
        expect(await child.next()).toEqual(runMessage)

        child.send({ type: "result", ok: false, error: "timeout" })
        const result = (await parent.next()) as PiResultMessage
        expect(result).toEqual({ type: "result", ok: false, error: "timeout" })

        parent.close()
        expect(await child.next()).toBeNull()
    })

    it("分块到达的多行消息按行切分", async () => {
        const chunks = ['{"type":"tool_res', 'ult","callId":"c1","ok":true}\n{"type":"ready"}\n']
        let index = 0
        const source = {
            async *[Symbol.asyncIterator]() {
                while (index < chunks.length) yield chunks[index++]!
            },
        }
        const received: PiMessage[] = []
        const channel = new JsonLineChannel(source, { write: () => {} })
        while (true) {
            const message = await channel.next()
            if (!message) break
            received.push(message)
        }
        expect(received).toEqual([{ type: "tool_result", callId: "c1", ok: true }, { type: "ready" }])
    })

    it("单行超过上限时拒绝", async () => {
        const source = {
            async *[Symbol.asyncIterator]() {
                yield `{"type":"ready","padding":"${"x".repeat(200)}"}`
            },
        }
        const channel = new JsonLineChannel(source, { write: () => {} }, 64)
        await expect(channel.next()).rejects.toThrow(/长度上限/)
    })
})
