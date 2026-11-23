import { deflateSync } from "node:zlib"
import { decodePng } from "./skin-model/eye-atlas"

/** 把加法材质的发光强度烘焙进 alpha，保留预乘颜色，避免 DOM 合成时显示不透明黑底。 */
export function additiveRgba(rgba: Uint8Array): Uint8Array {
    const output = rgba.slice()
    for (let offset = 0; offset < output.length; offset += 4) {
        const intensity = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2])
        output[offset + 3] = Math.round((rgba[offset + 3] * intensity) / 255)
        for (let channel = 0; channel < 3; channel++) {
            output[offset + channel] = intensity ? Math.round((rgba[offset + channel] * 255) / intensity) : 0
        }
    }
    return output
}

export function additivePng(png: Uint8Array): Uint8Array {
    const decoded = decodePng(png)
    if (!decoded) throw new Error("动态框加法贴图必须是可解码的 8 位非隔行 PNG")
    const { width, height } = decoded
    const rgba = additiveRgba(decoded.rgba)
    const raw = new Uint8Array(height * (width * 4 + 1))
    for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
    const chunk = (type: string, data: Uint8Array): Uint8Array => {
        const bytes = new Uint8Array(data.length + 12)
        const view = new DataView(bytes.buffer)
        view.setUint32(0, data.length)
        bytes.set(
            [...type].map(char => char.charCodeAt(0)),
            4
        )
        bytes.set(data, 8)
        let crc = 0xffffffff
        for (const byte of bytes.subarray(4, data.length + 8)) {
            crc ^= byte
            for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
        }
        view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0)
        return bytes
    }
    const header = new Uint8Array(13)
    new DataView(header.buffer).setUint32(0, width)
    new DataView(header.buffer).setUint32(4, height)
    header[8] = 8
    header[9] = 6
    const chunks = [
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", new Uint8Array()),
    ]
    const result = new Uint8Array(chunks.reduce((length, bytes) => length + bytes.length, 0))
    let offset = 0
    for (const bytes of chunks) {
        result.set(bytes, offset)
        offset += bytes.length
    }
    return result
}
