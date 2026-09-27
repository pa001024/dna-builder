import type { Rgb } from "./color"

/** 参考图采样的最长边像素数：先缩图再统计，避免大图阻塞主线程。 */
const MAX_SAMPLE_SIZE = 120

/** 取像素集合在某个通道上的跨度（最大值 - 最小值）。 */
function channelRange(pixels: Rgb[], channel: number): number {
    let min = 255
    let max = 0
    for (const pixel of pixels) {
        const value = pixel[channel]
        if (value < min) min = value
        if (value > max) max = value
    }
    return max - min
}

/** 求像素集合的均值颜色。 */
function averageColor(pixels: Rgb[]): Rgb {
    let r = 0
    let g = 0
    let b = 0
    for (const pixel of pixels) {
        r += pixel[0]
        g += pixel[1]
        b += pixel[2]
    }
    return [Math.round(r / pixels.length), Math.round(g / pixels.length), Math.round(b / pixels.length)]
}

/**
 * @description 中位切分量化：反复挑选色彩跨度最大的桶，沿其最宽通道按中位数一分为二，
 * 最后取每个桶的均值颜色。结果按桶内像素数（出现频率）降序排列。
 * @param pixels 像素集合（0~255 的 sRGB 三元组）
 * @param count 目标主色数量
 * @returns 主色列表，按出现频率降序
 */
export function quantizeColors(pixels: Rgb[], count: number): Rgb[] {
    if (pixels.length === 0 || count <= 0) return []
    let buckets: Rgb[][] = [pixels]

    while (buckets.length < count) {
        // 选出仍可再分且跨度最大的桶
        let targetIndex = -1
        let targetRange = 0
        let targetChannel = 0
        buckets.forEach((bucket, index) => {
            if (bucket.length < 2) return
            for (const channel of [0, 1, 2]) {
                const range = channelRange(bucket, channel)
                if (range > targetRange) {
                    targetRange = range
                    targetIndex = index
                    targetChannel = channel
                }
            }
        })
        // 所有桶都不可再分（单像素或颜色完全一致）时提前结束
        if (targetIndex < 0) break
        const sorted = [...buckets[targetIndex]].sort((left, right) => left[targetChannel] - right[targetChannel])
        const middle = Math.floor(sorted.length / 2)
        buckets = buckets.filter((_, index) => index !== targetIndex)
        buckets.push(sorted.slice(0, middle), sorted.slice(middle))
    }

    return buckets
        .filter(bucket => bucket.length > 0)
        .sort((left, right) => right.length - left.length)
        .map(averageColor)
}

/**
 * @description 读取一张已加载图片的主色（先按最长边缩放到采样尺寸，再走中位切分量化）。
 * @param image 已加载完成的图片元素
 * @param count 目标主色数量
 * @returns 主色列表，按出现频率降序；无法读取时返回空数组
 */
export function extractImagePalette(image: HTMLImageElement, count = 8): Rgb[] {
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    if (!naturalWidth || !naturalHeight) return []
    const scale = Math.min(1, MAX_SAMPLE_SIZE / Math.max(naturalWidth, naturalHeight))
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return []
    context.drawImage(image, 0, 0, width, height)

    const { data } = context.getImageData(0, 0, width, height)
    const pixels: Rgb[] = []
    for (let index = 0; index < data.length; index += 4) {
        // 跳过接近全透明的像素
        if (data[index + 3] < 125) continue
        pixels.push([data[index], data[index + 1], data[index + 2]])
    }
    return quantizeColors(pixels, count)
}
