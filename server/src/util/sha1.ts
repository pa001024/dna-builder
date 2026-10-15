/**
 * 增量 SHA1，附带中间状态导出。
 *
 * node:crypto 不暴露哈希中间状态，而夸克多分片上传要求 part_number > 1 的分片
 * 在取地址时携带此前全部字节的 SHA1 链接值（parallel_sha1_ctx），因此这里自带
 * 一份标准 SHA1 实现（与 node:crypto 逐字节对拍验证，见 sha1.test.ts）。
 * 快照仅在 64 字节对齐处有效，调用方需保证分片大小为 64 的倍数。
 */
export class Sha1 {
    private h0 = 0x67452301
    private h1 = 0xefcdab89
    private h2 = 0x98badcfe
    private h3 = 0x10325476
    private h4 = 0xc3d2e1f0
    private readonly block = new Uint8Array(64)
    private buffered = 0
    private total = 0
    private finalized = false
    private readonly w = new Int32Array(80)

    private static rotl(value: number, bits: number): number {
        return (value << bits) | (value >>> (32 - bits))
    }

    private compress(chunk: Uint8Array, offset: number): void {
        const w = this.w
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4
            w[i] = (chunk[j] << 24) | (chunk[j + 1] << 16) | (chunk[j + 2] << 8) | chunk[j + 3]
        }
        for (let i = 16; i < 80; i++) {
            w[i] = Sha1.rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
        }
        let [a, b, c, d, e] = [this.h0, this.h1, this.h2, this.h3, this.h4]
        for (let i = 0; i < 80; i++) {
            let f: number
            let k: number
            if (i < 20) {
                f = (b & c) | (~b & d)
                k = 0x5a827999
            } else if (i < 40) {
                f = b ^ c ^ d
                k = 0x6ed9eba1
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d)
                k = 0x8f1bbcdc
            } else {
                f = b ^ c ^ d
                k = 0xca62c1d6
            }
            const tmp = (Sha1.rotl(a, 5) + f + e + k + w[i]) | 0
            e = d
            d = c
            c = Sha1.rotl(b, 30)
            b = a
            a = tmp
        }
        this.h0 = (this.h0 + a) | 0
        this.h1 = (this.h1 + b) | 0
        this.h2 = (this.h2 + c) | 0
        this.h3 = (this.h3 + d) | 0
        this.h4 = (this.h4 + e) | 0
    }

    /**
     * 从快照恢复上下文（快照须取自 64 字节对齐处，bytesFed 为取快照时已喂入的字节数）。
     */
    static resume(snap: [number, number, number, number, number], bytesFed: number): Sha1 {
        const sha = new Sha1()
        sha.h0 = snap[0] | 0
        sha.h1 = snap[1] | 0
        sha.h2 = snap[2] | 0
        sha.h3 = snap[3] | 0
        sha.h4 = snap[4] | 0
        sha.total = bytesFed
        return sha
    }

    /** 喂入数据，可多次调用。 */
    update(data: Uint8Array): void {
        if (this.finalized) {
            throw new Error("SHA1 已终结，不可再喂入数据")
        }
        this.total += data.length
        let offset = 0
        let remain = data.length
        if (this.buffered > 0) {
            const take = Math.min(64 - this.buffered, remain)
            this.block.set(data.subarray(offset, offset + take), this.buffered)
            this.buffered += take
            offset += take
            remain -= take
            if (this.buffered === 64) {
                this.compress(this.block, 0)
                this.buffered = 0
            }
        }
        while (remain >= 64) {
            this.compress(data, offset)
            offset += 64
            remain -= 64
        }
        if (remain > 0) {
            this.block.set(data.subarray(offset, offset + remain), 0)
            this.buffered = remain
        }
    }

    /** 已喂入字节数。 */
    get bytesFed(): number {
        return this.total
    }

    /**
     * 导出当前链接值（5 个无符号 32 位整数）。
     * 仅当已喂入字节数为 64 的倍数时可作为分片校验上下文使用。
     */
    snapshot(): [number, number, number, number, number] {
        return [this.h0 >>> 0, this.h1 >>> 0, this.h2 >>> 0, this.h3 >>> 0, this.h4 >>> 0]
    }

    /** 终结并输出 hex 摘要（调用后不可再 update）。 */
    digest(): string {
        if (!this.finalized) {
            this.finalized = true
            const bitLen = this.total * 8
            const padStart = this.buffered
            this.block[padStart] = 0x80
            for (let i = padStart + 1; i < 64; i++) {
                this.block[i] = 0
            }
            if (this.buffered > 55) {
                this.compress(this.block, 0)
                this.block.fill(0)
            }
            const hi = Math.floor(bitLen / 0x100000000)
            const lo = bitLen >>> 0
            this.block[56] = (hi >>> 24) & 0xff
            this.block[57] = (hi >>> 16) & 0xff
            this.block[58] = (hi >>> 8) & 0xff
            this.block[59] = hi & 0xff
            this.block[60] = (lo >>> 24) & 0xff
            this.block[61] = (lo >>> 16) & 0xff
            this.block[62] = (lo >>> 8) & 0xff
            this.block[63] = lo & 0xff
            this.compress(this.block, 0)
        }
        const digits = "0123456789abcdef"
        let out = ""
        for (const word of this.snapshot()) {
            for (let shift = 28; shift >= 0; shift -= 4) {
                out += digits[(word >>> shift) & 0xf]
            }
        }
        return out
    }
}
