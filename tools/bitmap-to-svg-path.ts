import { fitSvgContour, type Point } from "./fit-svg-contour"
import { decodePng } from "./png-rgba"

const VIEWBOX_SIZE = 24
const TRACE_SIZE = 256
const THRESHOLD = 127.5

type ContourNode = { point: Point; neighbors: number[] }

// 每格按左上、右上、右下、左下编码，边按上、右、下、左编号。
const SEGMENTS: [number, number][][] = [
    [],
    [[3, 0]],
    [[0, 1]],
    [[3, 1]],
    [[1, 2]],
    [],
    [[0, 2]],
    [[3, 2]],
    [[2, 3]],
    [[0, 2]],
    [],
    [[1, 2]],
    [[1, 3]],
    [[0, 1]],
    [[3, 0]],
    [],
]

function makeMask(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3]
    if (mask.some(alpha => alpha < THRESHOLD)) return mask

    for (let i = 0; i < mask.length; i++) {
        const offset = i * 4
        mask[i] = Math.round(0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2])
    }
    const corners = [mask[0], mask[width - 1], mask[mask.length - width], mask[mask.length - 1]]
    const lightBackground = corners.filter(value => value > THRESHOLD).length >= 2
    return lightBackground ? mask.map(value => 255 - value) : mask
}

function traceContours(mask: Uint8Array, width: number, height: number): Point[][] {
    const nodes = new Map<number, ContourNode>()
    const sample = (x: number, y: number): number => (x >= 0 && x < width && y >= 0 && y < height ? mask[y * width + x] : 0)
    const stride = 2 * (width + 2)

    for (let y = -1; y < height; y++) {
        for (let x = -1; x < width; x++) {
            const a = sample(x, y) - THRESHOLD
            const b = sample(x + 1, y) - THRESHOLD
            const c = sample(x + 1, y + 1) - THRESHOLD
            const d = sample(x, y + 1) - THRESHOLD
            const state = Number(a > 0) + 2 * Number(b > 0) + 4 * Number(c > 0) + 8 * Number(d > 0)
            if (state === 0 || state === 15) continue

            let segments = SEGMENTS[state]
            // 鞍点用双线性插值决定连通性；平局时对角前景互不相连。
            if (state === 5)
                segments =
                    a * c > b * d
                        ? [
                              [0, 1],
                              [2, 3],
                          ]
                        : [
                              [3, 0],
                              [1, 2],
                          ]
            if (state === 10)
                segments =
                    b * d > a * c
                        ? [
                              [3, 0],
                              [1, 2],
                          ]
                        : [
                              [0, 1],
                              [2, 3],
                          ]

            const top = (y + 1) * stride + 2 * (x + 1)
            const ids = [top, top + 3, top + stride, top + 1]
            const originX = x + 0.5
            const originY = y + 0.5
            const points: Point[] = [
                [originX + a / (a - b), originY],
                [originX + 1, originY + b / (b - c)],
                [originX + d / (d - c), originY + 1],
                [originX, originY + a / (a - d)],
            ]
            for (const [from, to] of segments) {
                for (const [edge, neighbor] of [
                    [from, to],
                    [to, from],
                ]) {
                    const id = ids[edge]
                    const node = nodes.get(id) ?? { point: points[edge], neighbors: [] }
                    node.neighbors.push(ids[neighbor])
                    nodes.set(id, node)
                }
            }
        }
    }

    const contours: Point[][] = []
    for (const start of nodes.keys()) {
        const contour: Point[] = []
        let current = start
        let previous = -1
        do {
            const node = nodes.get(current)!
            contour.push(node.point)
            nodes.delete(current)
            const next = node.neighbors[0] === previous ? node.neighbors[1] : node.neighbors[0]
            previous = current
            current = next
        } while (current !== start)
        contours.push(contour)
    }
    return contours
}

export function rgbaToSvgPath(rgba: Uint8Array, width: number, height: number): string {
    const contours = traceContours(makeMask(rgba, width, height), width, height)
    const scale = VIEWBOX_SIZE / Math.max(width, height)
    const offsetX = (VIEWBOX_SIZE - width * scale) / 2
    const offsetY = (VIEWBOX_SIZE - height * scale) / 2
    const coord = (value: number): number => Math.round(value * 1000) / 1000
    const svgPoint = ([x, y]: Point): string => `${coord(x * scale + offsetX)} ${coord(y * scale + offsetY)}`
    return contours.map(contour => fitSvgContour(contour, svgPoint)).join("")
}

export async function bitmapToSvgPath(file: string): Promise<string> {
    const png = await new Bun.Image(file, { maxPixels: 4096 ** 2 })
        .resize(TRACE_SIZE, TRACE_SIZE, { fit: "inside", withoutEnlargement: true })
        .png({ palette: false })
        .bytes()
    const image = decodePng(png)
    if (!image) throw new Error("无法解码位图")
    const path = rgbaToSvgPath(image.rgba, image.width, image.height)
    if (!path) throw new Error("位图中未找到可描摹的前景")
    return path
}
