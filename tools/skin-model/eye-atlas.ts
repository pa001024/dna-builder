import { inflateSync } from "node:zlib"

export { eyeUvChannelFromParent } from "../../apps/web/src/utils/skin-model"

/** 虹膜在图集每格内的位置：圆心与角膜缘外缘半径，都是 0~1 的 UV。 */
export interface EyeAtlas {
    center: [number, number]
    radius: number
    /** 虹膜图集画在哪套 UV 上：V10/V11 材质在 UV0，V14 在 UV1。 */
    channel: 0 | 1
    /**
     * 瞳孔中心与等效半径。着色器**不读**这个值：贴图里瞳孔与虹膜体的亮度只差 0.67 倍，
     * 而游戏靠 `luma³` 把它放大到 31 倍，按亮度切出来的「瞳孔」会把虹膜花纹一并算进去
     * （黎瑟实测 r=0.215，真值 0.086）。瞳孔形态改由着色器按「相对暗度 × 半径」联合遮罩
     * 从贴图直接取，星芒/竖缝这些逐角色不同的形状才画得对。此字段留作标定参考。
     */
    pupil?: { center: [number, number]; radius: number }
}

/**
 * @description 判断虹膜图集画在 UV0 还是 UV1 上。
 *
 * 判据是「哪套 UV 的每只眼包围盒能铺满一整格」——铺满的那套跨度接近 1，另一套只有 0.05~0.5。
 * 两套都不铺满（Yeer 把左右眼合画在一张横图里、Baiheng 的虹膜不居中）时退回 UV0。
 */
export function pickEyeUvChannel(uv0: Float32Array | undefined, uv1: Float32Array | undefined, position: Float32Array): 0 | 1 {
    const fill = (uv: Float32Array | undefined) => {
        if (!uv) return -1
        let worst = Number.POSITIVE_INFINITY
        for (const side of [-1, 1]) {
            let minU = Number.POSITIVE_INFINITY
            let maxU = Number.NEGATIVE_INFINITY
            let minV = Number.POSITIVE_INFINITY
            let maxV = Number.NEGATIVE_INFINITY
            let count = 0
            for (let vertex = 0; vertex < position.length / 3; vertex++) {
                if ((position[vertex * 3] >= 0 ? 1 : -1) !== side) continue
                count++
                minU = Math.min(minU, uv[vertex * 2])
                maxU = Math.max(maxU, uv[vertex * 2])
                minV = Math.min(minV, uv[vertex * 2 + 1])
                maxV = Math.max(maxV, uv[vertex * 2 + 1])
            }
            if (!count) return -1
            worst = Math.min(worst, Math.min(maxU - minU, maxV - minV))
        }
        return worst
    }
    // 取跨度大的那套：铺满一格的那套就是虹膜图集。两套都不铺满（Yeer 的左右眼合画在一张
    // 横图里、Baiheng 的虹膜不居中）时取 UV0——V11 材质从不把虹膜放在 UV1 上。
    return fill(uv1) > Math.max(fill(uv0), 0.7) ? 1 : 0
}

/**
 * @description 解 8 位非隔行 PNG 到 RGBA。眼睛底图是游戏导出的 PNG，只有 6/2/0 型真彩与 3 型调色板，
 * 其余组合（16 位、隔行、带 tRNS 的调色板）返回 undefined，由调用方退回默认图集。
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

/**
 * @description 从眼睛底图量出虹膜图集参数。
 *
 * 角膜缘是虹膜外缘一圈等半径的暗环：先按「暗环的加权质心」定位圆心，再在该圆心周围
 * 做小范围搜索，取各角度最暗半径方差最小的位置；半径取这些最暗半径的中位数。
 * 圆心偏移或半径偏离过大（说明不是标准单眼贴图）时返回 undefined，由调用方退回默认值。
 */
export function detectEyeAtlas(rgba: Uint8Array, width: number, height: number): EyeAtlas | undefined {
    const lum = new Float32Array(width * height)
    for (let i = 0; i < width * height; i++) lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255
    const sample = (x: number, y: number) => {
        const px = Math.round(x)
        const py = Math.round(y)
        if (px < 0 || py < 0 || px >= width || py >= height) return Number.NaN
        return lum[py * width + px]
    }
    // ① 暗环加权质心：只在 0.55~1.0 的归一化半径环带里取权重，避开虹膜内部的花纹
    let weightSum = 0
    let sumX = 0
    let sumY = 0
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const dx = (x + 0.5) / width - 0.5
            const dy = (y + 0.5) / height - 0.5
            const r = Math.hypot(dx, dy) / 0.5
            if (r < 0.55 || r > 1.0) continue
            const weight = 1 - lum[y * width + x]
            weightSum += weight
            sumX += weight * (x + 0.5)
            sumY += weight * (y + 0.5)
        }
    if (weightSum <= 0) return undefined
    const seed: [number, number] = [sumX / weightSum / width, sumY / weightSum / height]
    // ② 环一致性搜索：圆心正确时，各角度最暗半径几乎相同
    const ANG = 96
    const evaluate = (cx: number, cy: number) => {
        const radii: number[] = []
        for (let a = 0; a < ANG; a++) {
            const angle = (a / ANG) * Math.PI * 2
            const dx = Math.cos(angle)
            const dy = Math.sin(angle)
            let bestRadius = Number.NaN
            let bestValue = Number.POSITIVE_INFINITY
            for (let r = 0.3; r <= 0.56; r += 0.0025) {
                const value = sample(cx * width + dx * r * width, cy * height + dy * r * height)
                if (Number.isNaN(value)) continue
                if (value < bestValue) {
                    bestValue = value
                    bestRadius = r
                }
            }
            if (!Number.isNaN(bestRadius)) radii.push(bestRadius)
        }
        if (radii.length < ANG * 0.8) return { score: Number.NEGATIVE_INFINITY, radius: 0 }
        radii.sort((a, b) => a - b)
        const median = radii[Math.floor(radii.length / 2)]
        // IQR 比标准差抗离群：高光把暗环打断几个角度时仍能收敛
        const q1 = radii[Math.floor(radii.length * 0.25)]
        const q3 = radii[Math.floor(radii.length * 0.75)]
        return { score: median / (q3 - q1 + 0.004), radius: median }
    }
    let best = { cx: seed[0], cy: seed[1], radius: 0.45, score: Number.NEGATIVE_INFINITY }
    for (const [step, span] of [
        [0.008, 0.08],
        [0.002, 0.012],
    ] as const) {
        const baseX = best.cx
        const baseY = best.cy
        for (let dy = -span; dy <= span + 1e-9; dy += step)
            for (let dx = -span; dx <= span + 1e-9; dx += step) {
                const { score, radius } = evaluate(baseX + dx, baseY + dy)
                if (score > best.score) best = { cx: baseX + dx, cy: baseY + dy, radius, score }
            }
    }
    // 圆心离图心超过 12%、或半径超出 0.3~0.55，说明这张贴图不是单眼图集，退回默认值更安全。
    // 半径正好贴在搜索边界上同理：那说明压根没找到等半径的暗环，只是搜索走到了尽头。
    if (Math.abs(best.cx - 0.5) > 0.12 || Math.abs(best.cy - 0.5) > 0.12) return undefined
    if (best.radius < 0.305 || best.radius > 0.545) return undefined
    const pupil = detectPupil(lum, width, height, best.cx, best.cy, best.radius)
    return pupil ? { center: [best.cx, best.cy], radius: best.radius, pupil } : { center: [best.cx, best.cy], radius: best.radius }
}

/**
 * @description 量瞳孔：虹膜内部最暗的一块连通区域。
 *
 * 游戏里瞳孔相对虹膜圆心的偏移与半径是逐角色不同的（黎瑟是偏上 0.07UV 的圆，奥特是竖缝），
 * 所以必须从贴图里量，不能按角色写死。只在虹膜内 0.85R 范围取样，避开角膜缘那圈同样很暗的环；
 * 用 Otsu 分界把「瞳孔 vs 虹膜体」切开，再要求暗区足够大且靠近圆心，
 * 星芒/亮心类贴图（伊芙、颂露）量不出暗瞳孔，此时返回 undefined，由着色器跳过瞳孔分支。
 */
function detectPupil(
    lum: Float32Array,
    width: number,
    height: number,
    cx: number,
    cy: number,
    irisRadius: number
): { center: [number, number]; radius: number } | undefined {
    const inner = irisRadius * 0.85
    const values: number[] = []
    const mask: number[] = []
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const dx = (x + 0.5) / width - cx
            const dy = (y + 0.5) / height - cy
            if (Math.hypot(dx, dy) > inner) continue
            values.push(lum[y * width + x])
            mask.push(y * width + x)
        }
    if (values.length < 64) return undefined
    // Otsu：把内部亮度直方图切成两簇，取类间方差最大处
    const BINS = 64
    const histogram = new Uint32Array(BINS)
    for (const value of values) histogram[Math.min(BINS - 1, Math.floor(value * BINS))]++
    const total = values.length
    let sumAll = 0
    for (let i = 0; i < BINS; i++) sumAll += i * histogram[i]
    let bestT = -1
    let bestVariance = -1
    let weightLow = 0
    let sumLow = 0
    for (let t = 0; t < BINS; t++) {
        weightLow += histogram[t]
        if (!weightLow) continue
        const weightHigh = total - weightLow
        if (!weightHigh) break
        sumLow += t * histogram[t]
        const meanLow = sumLow / weightLow
        const meanHigh = (sumAll - sumLow) / weightHigh
        const variance = weightLow * weightHigh * (meanLow - meanHigh) ** 2
        if (variance > bestVariance) {
            bestVariance = variance
            bestT = t
        }
    }
    if (bestT < 0) return undefined
    const threshold = (bestT + 1) / BINS
    let sumX = 0
    let sumY = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
        if (values[i] > threshold) continue
        const index = mask[i]
        sumX += (index % width) + 0.5
        sumY += Math.floor(index / width) + 0.5
        count++
    }
    // 暗区占比过小（星芒贴图只有细缝）或几乎占满内部（整片暗）都不当瞳孔
    const coverage = count / total
    if (coverage < 0.02 || coverage > 0.55) return undefined
    const pupilCx = sumX / count / width
    const pupilCy = sumY / count / height
    // 瞳孔必须落在圆心附近：偏离超过 0.4R 说明量到的是虹膜上的花纹或高光暗部
    if (Math.hypot(pupilCx - cx, pupilCy - cy) > irisRadius * 0.4) return undefined
    return { center: [pupilCx, pupilCy], radius: Math.sqrt(count / Math.PI) / width }
}
