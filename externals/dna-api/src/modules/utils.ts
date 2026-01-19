import * as forge from "node-forge"

export interface RequestOptions {
    method?: "GET" | "POST"
    sign?: boolean
    file?: File
    tokenSig?: boolean
    kf?: boolean
    h5?: boolean
    token?: boolean
    refer?: boolean
    params?: Record<string, any>
    max_retries?: number
    retry_delay?: number
    timeout?: number
}

export interface HeadersPayload {
    headers: Record<string, any>
    payload: string | FormData | undefined
}

export function rsa_encrypt(text: string, public_key_b64: string): string {
    try {
        const lines: string[] = []
        for (let i = 0; i < public_key_b64.length; i += 64) {
            lines.push(public_key_b64.slice(i, i + 64))
        }
        const pem = `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`

        const publicKey = forge.pki.publicKeyFromPem(pem)
        const textBytes = forge.util.encodeUtf8(text)
        const encrypted = publicKey.encrypt(textBytes)

        return forge.util.encode64(encrypted)
    } catch (e) {
        throw new Error(`[DNA] RSA 加密失败: ${(e as Error).message}`)
    }
}

export function rand_str(length: number = 16): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

export function md5_upper(text: string): string {
    const md = forge.md.md5.create()
    md.update(text)
    return md.digest().toHex().toUpperCase()
}

export function signature_hash(text: string): string {
    function swap_positions(text: string, positions: number[]): string {
        const chars = text.split("")
        for (let i = 1; i < positions.length; i += 2) {
            const p1 = positions[i - 1]
            const p2 = positions[i]
            if (p1 >= 0 && p1 < chars.length && p2 >= 0 && p2 < chars.length) {
                ;[chars[p1], chars[p2]] = [chars[p2], chars[p1]]
            }
        }
        return chars.join("")
    }
    return swap_positions(md5_upper(text), [1, 13, 5, 17, 7, 23])
}

function sign_fI(data: Record<string, any>, secret: string): string {
    const pairs: string[] = []
    const sortedKeys = Object.keys(data).sort()
    for (const k of sortedKeys) {
        const v = data[k]
        if (v !== null && v !== undefined && v !== "") {
            pairs.push(`${k}=${v}`)
        }
    }
    const qs = pairs.join("&")
    return signature_hash(`${qs}&${secret}`)
}

export function build_signature(data: Record<string, any>, token?: string): Record<string, any> {
    const ts = Date.now()
    const sign_data = { ...data, timestamp: ts, token }
    const sec = rand_str(16)
    const sig = sign_fI(sign_data, sec)
    const enc = xor_encode(sig, sec)
    return { s: enc, t: ts, k: sec }
}
// 构建上传图片签名（返回签名和密钥）
export function build_upload_signature(public_key: string): { signature: string; key: string } {
    const key = rand_str(16)
    const encrypted = rsa_encrypt(key, public_key)
    const signature = swapForUploadImgApp(encrypted)
    return { signature, key }
}

// 上传图片签名 - 字符交换
export function swapForUploadImgApp(text: string): string {
    const chars = text.split("")
    const swaps = [
        [3, 23],
        [11, 32],
        [22, 42],
        [25, 48],
    ]
    for (const [p1, p2] of swaps) {
        if (p1 < chars.length && p2 < chars.length) {
            ;[chars[p1], chars[p2]] = [chars[p2], chars[p1]]
        }
    }
    return chars.join("")
}

// AES 解密图片 URL
export function aesDecryptImageUrl(encryptedUrl: string, key: string): string {
    const swapped = swapForUploadImgApp(encryptedUrl)

    const encryptedData = forge.util.decode64(swapped)

    const decipher = forge.cipher.createDecipher("AES-CBC", key)
    decipher.start({ iv: "A-16-Byte-String" })
    decipher.update(forge.util.createBuffer(encryptedData))
    decipher.finish()

    return decipher.output.getBytes()
}

// XOR编码函数
function xor_encode(text: string, key: string): string {
    const encoder = new TextEncoder()
    const tb = encoder.encode(text)
    const kb = encoder.encode(key)
    const out: string[] = []
    for (let i = 0; i < tb.length; i++) {
        const b = tb[i]
        const e = (b & 255) + (kb[i % kb.length] & 255)
        out.push(`@${e}`)
    }
    return out.join("")
}
