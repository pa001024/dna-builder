import { MiHomeError } from "./errors"

const B64ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function b64encode(data: Uint8Array): string {
    let out = ""
    let i = 0
    for (; i + 2 < data.length; i += 3) {
        const n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
        out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + B64ABC[(n >> 6) & 63] + B64ABC[n & 63]
    }
    const rest = data.length - i
    if (rest === 1) {
        const n = data[i] << 16
        out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + "=="
    } else if (rest === 2) {
        const n = (data[i] << 16) | (data[i + 1] << 8)
        out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + B64ABC[(n >> 6) & 63] + "="
    }
    return out
}

export function b64decode(input: string): Uint8Array {
    const rev = new Map<string, number>()
    for (let i = 0; i < 64; i++) rev.set(B64ABC[i], i)
    if (input.length % 4 !== 0) throw MiHomeError.crypto("非法 base64 长度")
    let pad = 0
    if (input.endsWith("==")) pad = 2
    else if (input.endsWith("=")) pad = 1
    const out = new Uint8Array(((input.length / 4) * 3 - pad) | 0)
    let j = 0
    for (let i = 0; i < input.length; i += 4) {
        const c = [input[i], input[i + 1], input[i + 2], input[i + 3]].map(ch => {
            if (ch === "=") return 0
            const v = rev.get(ch)
            if (v === undefined) throw MiHomeError.crypto(`非法 base64 字符: ${ch}`)
            return v
        })
        const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3]
        if (j < out.length) out[j++] = (n >> 16) & 255
        if (j < out.length) out[j++] = (n >> 8) & 255
        if (j < out.length) out[j++] = n & 255
    }
    return out
}

const utf8Encode = (s: string): Uint8Array => new TextEncoder().encode(s)

function padded(data: Uint8Array, block: number, lenSize: number, bigEndianLen: bigint): Uint8Array {
    const total = data.length + 1 + lenSize
    const len = total % block === 0 ? total : total + (block - (total % block))
    const msg = new Uint8Array(len)
    msg.set(data)
    msg[data.length] = 0x80
    let v = bigEndianLen
    for (let i = 0; i < lenSize; i++) {
        msg[len - 1 - i] = Number(v & 255n)
        v >>= 8n
    }
    return msg
}

export function sha1(data: Uint8Array): Uint8Array {
    const msg = padded(data, 64, 8, BigInt(data.length) * 8n)
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength)
    const w = new Uint32Array(80)
    let h0 = 0x67452301
    let h1 = 0xefcdab89
    let h2 = 0x98badcfe
    let h3 = 0x10325476
    let h4 = 0xc3d2e1f0
    for (let off = 0; off < msg.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
        for (let i = 16; i < 80; i++) {
            const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
            w[i] = (x << 1) | (x >>> 31)
        }
        let a = h0
        let b = h1
        let c = h2
        let d = h3
        let e = h4
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
            const t = (((((a << 5) | (a >>> 27)) + f + e + k) | 0) + (w[i] | 0)) | 0
            e = d
            d = c
            c = (b << 30) | (b >>> 2)
            b = a
            a = t
        }
        h0 = (h0 + a) | 0
        h1 = (h1 + b) | 0
        h2 = (h2 + c) | 0
        h3 = (h3 + d) | 0
        h4 = (h4 + e) | 0
    }
    const out = new Uint8Array(20)
    const o = new DataView(out.buffer)
    o.setUint32(0, h0 >>> 0)
    o.setUint32(4, h1 >>> 0)
    o.setUint32(8, h2 >>> 0)
    o.setUint32(12, h3 >>> 0)
    o.setUint32(16, h4 >>> 0)
    return out
}

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
    0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
    0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
    0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

export function sha256(data: Uint8Array): Uint8Array {
    const msg = padded(data, 64, 8, BigInt(data.length) * 8n)
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength)
    const w = new Uint32Array(64)
    let h0 = 0x6a09e667
    let h1 = 0xbb67ae85
    let h2 = 0x3c6ef372
    let h3 = 0xa54ff53a
    let h4 = 0x510e527f
    let h5 = 0x9b05688c
    let h6 = 0x1f83d9ab
    let h7 = 0x5be0cd19
    for (let off = 0; off < msg.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
        for (let i = 16; i < 64; i++) {
            const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3)
            const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10)
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
        }
        let a = h0
        let b = h1
        let c = h2
        let d = h3
        let e = h4
        let f = h5
        let g = h6
        let h = h7
        for (let i = 0; i < 64; i++) {
            const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
            const ch = (e & f) ^ (~e & g)
            const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) | 0
            const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
            const maj = (a & b) ^ (a & c) ^ (b & c)
            const t2 = (s0 + maj) | 0
            h = g
            g = f
            f = e
            e = (d + t1) | 0
            d = c
            c = b
            b = a
            a = (t1 + t2) | 0
        }
        h0 = (h0 + a) | 0
        h1 = (h1 + b) | 0
        h2 = (h2 + c) | 0
        h3 = (h3 + d) | 0
        h4 = (h4 + e) | 0
        h5 = (h5 + f) | 0
        h6 = (h6 + g) | 0
        h7 = (h7 + h) | 0
    }
    const out = new Uint8Array(32)
    const o = new DataView(out.buffer)
    for (const [i, v] of [h0, h1, h2, h3, h4, h5, h6, h7].entries()) o.setUint32(i * 4, v >>> 0)
    return out
}

export function rc4Crypt(key: Uint8Array, data: Uint8Array, discard: number): Uint8Array {
    const s = new Uint8Array(256)
    for (let i = 0; i < 256; i++) s[i] = i
    let j = 0
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key[i % key.length]) & 255
        const t = s[i]
        s[i] = s[j]
        s[j] = t
    }
    let ii = 0
    j = 0
    const out = new Uint8Array(data.length)
    let skip = discard
    let dataIdx = 0
    for (let n = 0; n < discard + data.length; n++) {
        ii = (ii + 1) & 255
        j = (j + s[ii]) & 255
        const t = s[ii]
        s[ii] = s[j]
        s[j] = t
        const k = s[(s[ii] + s[j]) & 255]
        if (skip > 0) {
            skip--
        } else {
            out[dataIdx] = data[dataIdx] ^ k
            dataIdx++
        }
    }
    return out
}

function randomBytes(n: number): Uint8Array {
    const out = new Uint8Array(n)
    const g = globalThis.crypto
    if (g?.getRandomValues) {
        g.getRandomValues(out)
        return out
    }
    for (let i = 0; i < n; i++) out[i] = (Math.random() * 256) | 0
    return out
}

export function genNonce(): string {
    const millis = Date.now()
    const rand = new DataView(randomBytes(8).buffer).getBigUint64(0, false)
    const signed = (rand - (1n << 63n)) & ((1n << 64n) - 1n)
    const head = new Uint8Array(8)
    new DataView(head.buffer).setBigUint64(0, signed, false)
    const part2 = Math.floor(millis / 60000)
    let hex = part2.toString(16)
    if (hex.length % 2 !== 0) hex = `0${hex}`
    const tail = new Uint8Array(hex.length / 2)
    for (let i = 0; i < tail.length; i++) tail[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    const combined = new Uint8Array(8 + tail.length)
    combined.set(head)
    combined.set(tail, 8)
    return b64encode(combined)
}

export function signedNonce(ssecretB64: string, nonceB64: string): string {
    const key = b64decode(ssecretB64)
    const nonce = b64decode(nonceB64)
    const both = new Uint8Array(key.length + nonce.length)
    both.set(key)
    both.set(nonce, key.length)
    return b64encode(sha256(both))
}

export function encSignature(uri: string, method: string, signedNonceStr: string, params: Array<[string, string]>): string {
    const parts = [method.toUpperCase(), uri]
    for (const [k, v] of params) parts.push(`${k}=${v}`)
    parts.push(signedNonceStr)
    return b64encode(sha1(utf8Encode(parts.join("&"))))
}

export function generateEncParams(
    uri: string,
    method: string,
    signedNonceStr: string,
    nonce: string,
    params: Array<[string, string]>,
    ssecurity: string
): Array<[string, string]> {
    params.push(["rc4_hash__", encSignature(uri, method, signedNonceStr, params)])
    const key = b64decode(signedNonceStr)
    for (const pair of params) pair[1] = b64encode(rc4Crypt(key, utf8Encode(pair[1]), 1024))
    params.push(["signature", encSignature(uri, method, signedNonceStr, params)])
    params.push(["ssecurity", ssecurity])
    params.push(["_nonce", nonce])
    return params
}

export function encryptRc4(passwordB64: string, payload: string): string {
    return b64encode(rc4Crypt(b64decode(passwordB64), utf8Encode(payload), 1024))
}

export function decryptRc4(passwordB64: string, payloadB64: string): Uint8Array {
    return rc4Crypt(b64decode(passwordB64), b64decode(payloadB64), 1024)
}

export async function decrypt(ssecurityB64: string, nonceB64: string, payload: string): Promise<string> {
    const signed = signedNonce(ssecurityB64, nonceB64)
    const raw = decryptRc4(signed, payload)
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(raw)
    } catch {
        const ds = new DecompressionStream("gzip")
        const stream = new Blob([raw as unknown as BlobPart]).stream().pipeThrough(ds)
        return await new Response(stream).text()
    }
}
