/**
 * 图片内嵌编码：JUTF-122 自适应 7/12-bit 装填，编码前剥离常见图片容器的固定头尾。
 * 只保留一种编码，节点数据里直接存编码后的字符串，不再记录编码格式。
 */

export type ImageContainerFormat = "png" | "jpeg" | "webp" | "gif89a" | "gif87a" | "svg" | "raw"

/** JSON 字符串里必须转义的 7-bit 码点：0x00..0x1F、`"`、`\` */
const ILLEGAL_7BIT_VALUES: readonly number[] = [
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
    0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x22, 0x5c,
]

const SEVEN_BIT_TO_ILLEGAL_INDEX = new Int8Array(128).fill(-1)
ILLEGAL_7BIT_VALUES.forEach((code, index) => {
    SEVEN_BIT_TO_ILLEGAL_INDEX[code] = index
})

/** 末尾 1..6 bit 的码点偏移基数 */
const TAIL_BASE_BY_LENGTH = [0, 0, 2, 6, 14, 30, 62]

/** 2 字节 UTF-8 码点起点：跳过 C1 控制字符 */
const UTF8_2BYTE_BASE = 0x00a1

/**
 * JUTF-122 编码：7 位安全 ASCII 直接输出；遇到需要 JSON 转义的 7 位值时，
 * 连同后续 5 位合成 12 位，映射到 2 字节 UTF-8 码点，做到零转义。
 * @param input 原始字节
 * @returns 编码字符串
 */
export function encodeJutf122(input: Uint8Array): string {
    const totalBits = input.length * 8
    let bitPosition = 0
    const chunks: string[] = []

    const readBits = (count: number): number => {
        let value = 0
        for (let index = 0; index < count; index++) {
            const position = bitPosition + index
            const byteIndex = position >> 3
            const bitIndex = 7 - (position & 7)
            value = (value << 1) | ((input[byteIndex] >> bitIndex) & 1)
        }
        bitPosition += count
        return value
    }

    while (bitPosition < totalBits) {
        const remaining = totalBits - bitPosition

        if (remaining < 7) {
            const value = readBits(remaining)
            chunks.push(String.fromCharCode(UTF8_2BYTE_BASE + 1122 + TAIL_BASE_BY_LENGTH[remaining] + value))
            break
        }

        const sevenBits = readBits(7)
        const illegalIndex = SEVEN_BIT_TO_ILLEGAL_INDEX[sevenBits]

        if (illegalIndex === -1) {
            chunks.push(String.fromCharCode(sevenBits))
            continue
        }

        // 安全字符不够用时，单独把 7 位非法值映射成一个码点
        if (totalBits - bitPosition < 5) {
            chunks.push(String.fromCharCode(UTF8_2BYTE_BASE + 1088 + illegalIndex))
            continue
        }

        const fiveBits = readBits(5)
        chunks.push(String.fromCharCode(UTF8_2BYTE_BASE + illegalIndex * 32 + fiveBits))
    }

    return chunks.join("")
}

/**
 * JUTF-122 解码。
 * @param encoded 编码字符串
 * @returns 原始字节
 */
export function decodeJutf122(encoded: string): Uint8Array {
    const output = new Uint8Array(Math.ceil((encoded.length * 12) / 8) + 4)
    let bitCount = 0

    const writeBits = (value: number, count: number) => {
        for (let index = count - 1; index >= 0; index--) {
            if ((value >> index) & 1) {
                output[bitCount >> 3] |= 1 << (7 - (bitCount & 7))
            }
            bitCount++
        }
    }

    for (let index = 0; index < encoded.length; index++) {
        const codePoint = encoded.charCodeAt(index)
        if (codePoint < 0x80) {
            writeBits(codePoint, 7)
            continue
        }

        const offset = codePoint - UTF8_2BYTE_BASE
        if (offset >= 0 && offset < 1088) {
            writeBits(ILLEGAL_7BIT_VALUES[Math.floor(offset / 32)], 7)
            writeBits(offset & 31, 5)
        } else if (offset >= 1088 && offset < 1122) {
            writeBits(ILLEGAL_7BIT_VALUES[offset - 1088], 7)
        } else if (offset >= 1122 && offset < 1248) {
            const tailOffset = offset - 1122
            const length =
                tailOffset >= 62 ? 6 : tailOffset >= 30 ? 5 : tailOffset >= 14 ? 4 : tailOffset >= 6 ? 3 : tailOffset >= 2 ? 2 : 1
            writeBits(tailOffset - TAIL_BASE_BY_LENGTH[length], length)
        } else {
            throw new Error(`无效的 JUTF-122 码点 U+${codePoint.toString(16)}`)
        }
    }

    return output.subarray(0, bitCount >> 3)
}

// ============================================================================
// 图片容器固定头尾：PNG / JPEG / GIF / WebP 的魔数在编码前剥离，恢复时补回
// ============================================================================

const PNG_PREFIX_16 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
const PNG_SUFFIX_12 = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
const RIFF_MAGIC = new Uint8Array([0x52, 0x49, 0x46, 0x46])
const WEBP_MAGIC = new Uint8Array([0x57, 0x45, 0x42, 0x50])

function matchesSlice(buffer: Uint8Array, offset: number, pattern: Uint8Array): boolean {
    if (offset < 0 || offset + pattern.length > buffer.length) return false
    for (let index = 0; index < pattern.length; index++) {
        if (buffer[offset + index] !== pattern[index]) return false
    }
    return true
}

const textDecoder = new TextDecoder()

/**
 * 通过魔数判断图片容器格式。
 * @param input 图片字节
 * @returns 容器格式
 */
export function detectImageFormat(input: Uint8Array): ImageContainerFormat {
    if (input.length > 28 && matchesSlice(input, 0, PNG_PREFIX_16) && matchesSlice(input, input.length - 12, PNG_SUFFIX_12)) {
        return "png"
    }
    if (
        input.length > 4 &&
        input[0] === 0xff &&
        input[1] === 0xd8 &&
        input[input.length - 2] === 0xff &&
        input[input.length - 1] === 0xd9
    ) {
        return "jpeg"
    }
    if (input.length > 12 && matchesSlice(input, 0, RIFF_MAGIC) && matchesSlice(input, 8, WEBP_MAGIC)) {
        const riffSize = (input[4] | (input[5] << 8) | (input[6] << 16) | (input[7] << 24)) >>> 0
        if (riffSize === input.length - 8) return "webp"
    }
    if (
        input.length > 7 &&
        input[0] === 0x47 &&
        input[1] === 0x49 &&
        input[2] === 0x46 &&
        input[3] === 0x38 &&
        input[5] === 0x61 &&
        input[input.length - 1] === 0x3b
    ) {
        if (input[4] === 0x39) return "gif89a"
        if (input[4] === 0x37) return "gif87a"
    }
    if (input.length > 5 && input[0] === 0x3c) {
        const head = textDecoder.decode(input.subarray(0, Math.min(64, input.length)))
        if (head.includes("<svg") || head.includes("<?xml")) return "svg"
    }
    return "raw"
}

/** 容器格式 → MIME 类型；raw 返回空串，由调用方回退到文件自带类型 */
const MIME_BY_FORMAT: Record<ImageContainerFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif89a: "image/gif",
    gif87a: "image/gif",
    svg: "image/svg+xml",
    raw: "",
}

/**
 * 读取容器格式对应的 MIME。
 * @param format 容器格式
 * @returns MIME 类型
 */
export function imageMimeForFormat(format: ImageContainerFormat): string {
    return MIME_BY_FORMAT[format]
}

/**
 * 剥离已知容器的固定头尾，用 1 字节标记代替：
 * 0xF1 PNG / 0xF2 JPEG / 0xF3 GIF89a / 0xF4 GIF87a / 0xF5 WebP。
 * 原始数据首字节恰好落在 0xF0..0xF5 时加 0xF0 转义。
 * @param input 原始图片字节
 * @returns 剥离结果
 */
export function stripImageContainerHeaders(input: Uint8Array): {
    stripped: Uint8Array
    format: ImageContainerFormat
    bytesSaved: number
} {
    const format = detectImageFormat(input)

    if (format === "png") {
        const output = new Uint8Array(1 + input.length - 28)
        output[0] = 0xf1
        output.set(input.subarray(16, input.length - 12), 1)
        return { stripped: output, format, bytesSaved: 27 }
    }

    if (format === "jpeg") {
        const output = new Uint8Array(1 + input.length - 4)
        output[0] = 0xf2
        output.set(input.subarray(2, input.length - 2), 1)
        return { stripped: output, format, bytesSaved: 3 }
    }

    if (format === "gif89a" || format === "gif87a") {
        const output = new Uint8Array(1 + input.length - 7)
        output[0] = format === "gif89a" ? 0xf3 : 0xf4
        output.set(input.subarray(6, input.length - 1), 1)
        return { stripped: output, format, bytesSaved: 6 }
    }

    if (format === "webp") {
        const output = new Uint8Array(1 + input.length - 12)
        output[0] = 0xf5
        output.set(input.subarray(12), 1)
        return { stripped: output, format, bytesSaved: 11 }
    }

    if (input.length > 0 && input[0] >= 0xf0 && input[0] <= 0xf5) {
        const output = new Uint8Array(1 + input.length)
        output[0] = 0xf0
        output.set(input, 1)
        return { stripped: output, format, bytesSaved: -1 }
    }

    return { stripped: input, format, bytesSaved: 0 }
}

/**
 * 还原被剥离的容器头尾。
 * @param stripped 去掉头尾后的字节
 * @returns 完整图片字节
 */
export function restoreImageContainerHeaders(stripped: Uint8Array): Uint8Array {
    if (stripped.length === 0) return stripped
    const marker = stripped[0]

    if (marker === 0xf1) {
        const body = stripped.subarray(1)
        const output = new Uint8Array(16 + body.length + 12)
        output.set(PNG_PREFIX_16, 0)
        output.set(body, 16)
        output.set(PNG_SUFFIX_12, 16 + body.length)
        return output
    }

    if (marker === 0xf2) {
        const body = stripped.subarray(1)
        const output = new Uint8Array(2 + body.length + 2)
        output[0] = 0xff
        output[1] = 0xd8
        output.set(body, 2)
        output[2 + body.length] = 0xff
        output[3 + body.length] = 0xd9
        return output
    }

    if (marker === 0xf3 || marker === 0xf4) {
        const body = stripped.subarray(1)
        const output = new Uint8Array(6 + body.length + 1)
        output.set([0x47, 0x49, 0x46, 0x38, marker === 0xf3 ? 0x39 : 0x37, 0x61], 0)
        output.set(body, 6)
        output[6 + body.length] = 0x3b
        return output
    }

    if (marker === 0xf5) {
        const body = stripped.subarray(1)
        const totalSize = 12 + body.length
        const riffSize = totalSize - 8
        const output = new Uint8Array(totalSize)
        output.set([0x52, 0x49, 0x46, 0x46], 0)
        output[4] = riffSize & 0xff
        output[5] = (riffSize >>> 8) & 0xff
        output[6] = (riffSize >>> 16) & 0xff
        output[7] = (riffSize >>> 24) & 0xff
        output.set([0x57, 0x45, 0x42, 0x50], 8)
        output.set(body, 12)
        return output
    }

    if (marker === 0xf0) {
        return stripped.subarray(1)
    }

    return stripped
}

/**
 * 把原始字节编码为内嵌字符串，并返回识别出的容器格式。
 * @param rawBytes 原始图片字节
 * @returns 编码结果与容器格式
 */
export function encodeImageBytes(rawBytes: Uint8Array): { encoded: string; format: ImageContainerFormat } {
    const { stripped, format } = stripImageContainerHeaders(rawBytes)
    return { encoded: encodeJutf122(stripped), format }
}

/**
 * 把内嵌字符串还原为完整图片字节。
 * @param encoded 内嵌字符串
 * @returns 完整图片字节
 */
export function decodeImageBytes(encoded: string): Uint8Array {
    return restoreImageContainerHeaders(decodeJutf122(encoded))
}
