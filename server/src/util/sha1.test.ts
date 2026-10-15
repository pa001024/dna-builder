import { describe, expect, it } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { Sha1 } from "./sha1"

function nodeSha1(data: Uint8Array): string {
    return createHash("sha1").update(data).digest("hex")
}

function oneShot(data: Uint8Array): string {
    const sha = new Sha1()
    sha.update(data)
    return sha.digest()
}

describe("Sha1", () => {
    it("标准向量", () => {
        expect(oneShot(new Uint8Array(0))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709")
        expect(oneShot(new TextEncoder().encode("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d")
        expect(oneShot(new TextEncoder().encode("abcdbcdecdefdefgefghijklmnop"))).toBe("98b0e2e04c04507d8b201368a06ea804972ffe68")
    })

    it("与 node:crypto 逐字节一致（含 64 字节边界两侧）", () => {
        for (const len of [1, 55, 56, 57, 63, 64, 65, 119, 128, 1000]) {
            const data = randomBytes(len)
            expect(oneShot(data)).toBe(nodeSha1(data))
        }
    })

    it("分片喂入与整块喂入结果一致", () => {
        const data = randomBytes(100000)
        const sha = new Sha1()
        for (let offset = 0; offset < data.length; offset += 7000) {
            sha.update(data.slice(offset, offset + 7000))
        }
        expect(sha.digest()).toBe(nodeSha1(data))
    })

    it("64 对齐快照可作为分片校验上下文：快照续算等价", () => {
        const data = randomBytes(4 * 1024 + 17)
        const head = data.slice(0, 4096)
        const tail = data.slice(4096)
        const first = new Sha1()
        first.update(head)
        const snap = first.snapshot()
        expect(snap).toHaveLength(5)

        const resumed = Sha1.resume(snap, 4096)
        resumed.update(tail)
        expect(resumed.digest()).toBe(nodeSha1(data))
    })
})
