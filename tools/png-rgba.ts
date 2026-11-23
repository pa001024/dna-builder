import { inflateSync } from "node:zlib"

/**
 * @description 解 8 位非隔行 PNG 到 RGBA。支持真彩、灰度和调色板；16 位、隔行 PNG 等其他格式返回 undefined。
 */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } | undefined {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    let offset = 8
    let width = 0
    let height = 0
    let depth = 0
    let colorType = 0
    let interlace = 0
    let palette: Uint8Array | undefined
    let trns: Uint8Array | undefined
    const chunks: Buffer[] = []
    while (offset + 8 <= png.length) {
        const length = view.getUint32(offset)
        const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
        const data = png.subarray(offset + 8, offset + 8 + length)
        if (type === "IHDR") {
            width = view.getUint32(offset + 8)
            height = view.getUint32(offset + 12)
            depth = png[offset + 16]
            colorType = png[offset + 17]
            interlace = png[offset + 20]
        } else if (type === "IDAT") chunks.push(Buffer.from(data))
        else if (type === "PLTE") palette = data
        else if (type === "tRNS") trns = data
        if (type === "IEND") break
        offset += 12 + length
    }
    if (depth !== 8 || interlace !== 0 || !width || !height) return undefined
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 || colorType === 3 ? 1 : 0
    if (!channels || (colorType === 3 && !palette)) return undefined
    const raw = new Uint8Array(inflateSync(Buffer.concat(chunks)))
    const stride = width * channels
    if (raw.length < height * (stride + 1)) return undefined
    const pixels = new Uint8Array(height * stride)
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
        const current = pixels.subarray(y * stride, (y + 1) * stride)
        const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : undefined
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? current[x - channels] : 0
            const up = previous === undefined ? 0 : previous[x]
            const upLeft = previous === undefined || x < channels ? 0 : previous[x - channels]
            let value = line[x]
            if (filter === 1) value += left
            else if (filter === 2) value += up
            else if (filter === 3) value += (left + up) >> 1
            else if (filter === 4) {
                const estimate = left + up - upLeft
                const toLeft = Math.abs(estimate - left)
                const toUp = Math.abs(estimate - up)
                const toUpLeft = Math.abs(estimate - upLeft)
                value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
            }
            current[x] = value & 255
        }
    }
    const rgba = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) {
        let r: number
        let g: number
        let b: number
        let a = 255
        if (colorType === 6) {
            r = pixels[i * 4]
            g = pixels[i * 4 + 1]
            b = pixels[i * 4 + 2]
            a = pixels[i * 4 + 3]
        } else if (colorType === 2) {
            r = pixels[i * 3]
            g = pixels[i * 3 + 1]
            b = pixels[i * 3 + 2]
        } else if (colorType === 4) {
            r = g = b = pixels[i * 2]
            a = pixels[i * 2 + 1]
        } else if (colorType === 3) {
            const index = pixels[i]
            r = palette![index * 3]
            g = palette![index * 3 + 1]
            b = palette![index * 3 + 2]
            a = trns?.[index] ?? 255
        } else r = g = b = pixels[i]
        rgba[i * 4] = r
        rgba[i * 4 + 1] = g
        rgba[i * 4 + 2] = b
        rgba[i * 4 + 3] = a
    }
    return { width, height, rgba }
}
