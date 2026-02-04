import * as forge from "node-forge"

export interface RequestOptions {
    method?: "GET" | "POST"
    sign?: boolean
    file?: File
    kf?: boolean
    h5?: boolean
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
export function rand_str2(length: number = 16): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
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

/**
 * MD5 结果位置混淆: 1↔13, 5↔17, 7↔23
 */
export function shuffle_md5(md5_hex: string): string {
    if (md5_hex.length <= 23) {
        return md5_hex
    }
    const chars = md5_hex.split("")
    const swaps = [
        [1, 13],
        [5, 17],
        [7, 23],
    ]
    for (const [i, j] of swaps) {
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join("")
}

/**
 * 生成 sa 参数 (30位字符串)
 * @returns [raw_sa, shuffled_sa]
 */
export function generate_sa(): [string, string] {
    const random_part = rand_str(17)
    const timestamp = Date.now().toString()

    const result: string[] = []
    let rand_idx = 0
    let time_idx = 0

    for (let i = 0; i < 30; i++) {
        if (8 <= i && i <= 12) {
            result.push(timestamp[time_idx])
            time_idx++
        } else if (16 <= i && i <= 20) {
            result.push(timestamp[time_idx])
            time_idx++
        } else if (22 <= i && i <= 24) {
            result.push(timestamp[time_idx])
            time_idx++
        } else {
            result.push(random_part[rand_idx])
            rand_idx++
        }
    }

    const raw_sa = result.join("")

    const chars = raw_sa.split("")
    for (const [i, j] of [
        [2, 23],
        [9, 17],
        [13, 25],
    ]) {
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    const shuffled_sa = chars.join("")

    return [raw_sa, shuffled_sa]
}

/**
 * 构建签名字符串
 */
export function build_sign_string(params: Record<string, any>, app_key: string): string {
    const sorted_keys = Object.keys(params).sort()
    const pairs: string[] = []
    for (const key of sorted_keys) {
        const value = params[key]
        if (value !== null && value !== undefined && value !== "") {
            pairs.push(`${key}=${value}`)
        }
    }
    pairs.push(app_key)
    return pairs.join("&")
}

/**
 * 生成混淆后的签名
 */
export function sign_shuffled(params: Record<string, any>, app_key: string): string {
    const sign_str = build_sign_string(params, app_key)
    const md5_res = md5_upper(sign_str)
    return shuffle_md5(md5_res)
}

// XOR编码函数
export function xor_encode(text: string, key: string): string {
    const encoder = new TextEncoder()
    const tb = encoder.encode(text)
    const kb = encoder.encode(key)
    const out: string[] = []
    for (let i = 0; i < tb.length; i++) {
        const e = (tb[i] & 255) + (kb[i % kb.length] & 255)
        out.push(`@${e}`)
    }
    return out.join("")
}

export function build_signature120(pk: string, payload: Record<string, any>, token?: string): Record<string, any> {
    const rk = rand_str(16)
    const [raw_sa, shuffled_sa] = generate_sa()
    const str_params: Record<string, any> = {}

    // 将所有参数转换为字符串
    for (const [k, v] of Object.entries(payload)) {
        str_params[k] = String(v)
    }

    const sign_params = { ...str_params }
    if (token) {
        sign_params.token = token
    }
    sign_params.sa = raw_sa

    // 生成签名
    const sign_val = sign_shuffled(sign_params, rk)
    const sign_encoded = xor_encode(sign_val, rk)

    // 对 rk 进行 RSA 加密
    const rk_encrypted = rsa_encrypt(rk, pk)

    // 生成 tn 值
    const tn = `${rk_encrypted},${sign_encoded}`

    return { rk, tn, sa: shuffled_sa }
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

function signature_hash(text: string): string {
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

/** 1.1.1版本加密 */
export function build_signature111(data: Record<string, any>, token?: string): Record<string, any> {
    const ts = Date.now()
    const sign_data = { ...data, timestamp: ts, token }
    const sec = rand_str(16)
    const sig = sign_fI(sign_data, sec)
    const enc = xor_encode(sig, sec)
    return { s: enc, t: ts, k: sec }
}
