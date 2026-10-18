/**
 * 轻量二维码编码器（字节模式，版本 1–40，纠错等级 L/M/Q/H）。
 *
 * 仅实现 ISO/IEC 18004 要求的最小功能集：字节模式数据段、Reed-Solomon 纠错、
 * 功能图形绘制与 8 种掩码的罚分择优。用于把下载地址画成二维码，
 * 不依赖任何第三方库，因此可以在构建期（SSG 预渲染）与浏览器里直接运行。
 */

/** 纠错等级 */
export type QrEccLevel = "L" | "M" | "Q" | "H"

/** 纠错等级索引：与下方纠错表行号一致 */
const ECC_LEVEL_INDEX: Record<QrEccLevel, number> = { L: 0, M: 1, Q: 2, H: 3 }

/** 格式信息中表示纠错等级的 2 位取值（注意不是行号顺序） */
const ECC_FORMAT_BITS: Record<QrEccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

/** 数据段模式指示符：字节模式 */
const MODE_BYTE = 0b0100

/** 各版本、各纠错等级下每个纠错块的纠错码字数（索引 0 占位，版本 1–40） */
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
    [
        -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30,
        30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
        -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
        28, 28, 28, 28, 28, 28, 28, 28,
    ],
    [
        -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30,
        30, 30, 30, 30, 30, 30, 30, 30,
    ],
    [
        -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
        30, 30, 30, 30, 30, 30, 30, 30,
    ],
]

/** 各版本、各纠错等级下的纠错块数量（索引 0 占位，版本 1–40） */
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
    [
        -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22,
        24, 25,
    ],
    [
        -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38,
        40, 43, 45, 47, 49,
    ],
    [
        -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53,
        56, 59, 62, 65, 68,
    ],
    [
        -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60,
        63, 66, 70, 74, 77, 81,
    ],
]

/** 各版本定位图形中心坐标（版本 1 无定位图形，索引 0 占位） */
const ALIGNMENT_PATTERN_POSITIONS: readonly (readonly number[])[] = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170],
]

/** 掩码罚分权重 */
const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

/** 编码结果 */
export interface QrCodeData {
    /** 边长（模块数） */
    size: number
    /** 模块矩阵：modules[y][x] 为 true 表示深色 */
    modules: readonly (readonly boolean[])[]
    /** 实际使用的版本号（1–40） */
    version: number
    /** 使用的纠错等级 */
    ecc: QrEccLevel
    /** 实际使用的掩码编号（0–7） */
    mask: number
    /** 三个定位图形的左上角坐标 */
    finderOrigins: readonly QrPoint[]
    /** 校正图形中心坐标 */
    alignmentCenters: readonly QrPoint[]
}

/** 模块坐标（以模块为单位） */
export interface QrPoint {
    x: number
    y: number
}

/** 编码选项 */
export interface QrCodeOptions {
    /** 纠错等级，默认 M */
    ecc?: QrEccLevel
    /** 掩码编号（0–7），缺省时按罚分自动择优 */
    mask?: number
    /** 最小版本号，默认 1 */
    minVersion?: number
    /** 最大版本号，默认 40 */
    maxVersion?: number
}

/**
 * 取整数 x 的第 i 位。
 * @param x 整数
 * @param i 位序号（0 为最低位）
 * @returns 该位是否为 1
 */
function getBit(x: number, i: number): boolean {
    return ((x >>> i) & 1) !== 0
}

/**
 * 计算指定版本的功能图形布局。
 * @param version 版本号
 * @returns 定位图形左上角坐标与校正图形中心坐标
 */
export function getQrCodeLayout(version: number): { finderOrigins: QrPoint[]; alignmentCenters: QrPoint[] } {
    const size = version * 4 + 17
    const finderOrigins: QrPoint[] = [
        { x: 0, y: 0 },
        { x: size - 7, y: 0 },
        { x: 0, y: size - 7 },
    ]

    const positions = ALIGNMENT_PATTERN_POSITIONS[version]
    const alignmentCenters: QrPoint[] = []
    for (let i = 0; i < positions.length; i++) {
        for (let j = 0; j < positions.length; j++) {
            // 三个角落的校正图形与定位图形重叠，按规范省略
            if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) {
                continue
            }
            alignmentCenters.push({ x: positions[i], y: positions[j] })
        }
    }

    return { finderOrigins, alignmentCenters }
}

/**
 * 计算指定版本除去功能图形后可用的模块数。
 * @param version 版本号
 * @returns 可用模块数
 */
function getNumRawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64
    if (version >= 2) {
        const numAlign = Math.floor(version / 7) + 2
        result -= (25 * numAlign - 10) * numAlign - 55
        if (version >= 7) {
            result -= 36
        }
    }
    return result
}

/**
 * 计算指定版本与纠错等级下可用的数据码字数。
 * @param version 版本号
 * @param ecc 纠错等级
 * @returns 数据码字数
 */
function getNumDataCodewords(version: number, ecc: QrEccLevel): number {
    const level = ECC_LEVEL_INDEX[ecc]
    return (
        Math.floor(getNumRawDataModules(version) / 8) -
        ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version]
    )
}

/**
 * 伽罗华域 GF(2^8) 乘法，本原多项式 0x11D。
 * @param x 乘数
 * @param y 被乘数
 * @returns 乘积
 */
function gfMultiply(x: number, y: number): number {
    let z = 0
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d)
        z ^= ((y >>> i) & 1) * x
    }
    return z & 0xff
}

/**
 * 计算 Reed-Solomon 生成多项式的系数（省略最高次项）。
 * @param degree 纠错码字数
 * @returns 生成多项式系数
 */
function computeReedSolomonDivisor(degree: number): Uint8Array {
    const result = new Uint8Array(degree)
    result[degree - 1] = 1
    let root = 1
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = gfMultiply(result[j], root)
            if (j + 1 < degree) {
                result[j] ^= result[j + 1]
            }
        }
        root = gfMultiply(root, 0x02)
    }
    return result
}

/**
 * 计算数据码字的 Reed-Solomon 余式（即纠错码字）。
 * @param data 数据码字
 * @param divisor 生成多项式系数
 * @returns 纠错码字
 */
function computeReedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
    const result = new Uint8Array(divisor.length)
    for (const b of data) {
        const factor = b ^ result[0]
        result.copyWithin(0, 1)
        result[result.length - 1] = 0
        for (let i = 0; i < divisor.length; i++) {
            result[i] ^= gfMultiply(divisor[i], factor)
        }
    }
    return result
}

/**
 * 按块拆分数据码字、计算纠错码字并交织为最终码字序列。
 * @param data 数据码字
 * @param version 版本号
 * @param ecc 纠错等级
 * @returns 交织后的码字序列
 */
function addEccAndInterleave(data: Uint8Array, version: number, ecc: QrEccLevel): Uint8Array {
    const level = ECC_LEVEL_INDEX[ecc]
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[level][version]
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[level][version]
    const rawCodewords = Math.floor(getNumRawDataModules(version) / 8)
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockLen = Math.floor(rawCodewords / numBlocks)

    const blocks: Uint8Array[] = []
    const divisor = computeReedSolomonDivisor(blockEccLen)
    for (let i = 0, k = 0; i < numBlocks; i++) {
        const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
        const dat = data.slice(k, k + dataLen)
        k += dataLen
        const block = new Uint8Array(shortBlockLen + 1)
        block.set(dat, 0)
        block.set(computeReedSolomonRemainder(dat, divisor), shortBlockLen + 1 - blockEccLen)
        blocks.push(block)
    }

    const result = new Uint8Array(rawCodewords)
    let index = 0
    for (let i = 0; i < blocks[0].length; i++) {
        for (let j = 0; j < blocks.length; j++) {
            // 短块在数据段末尾补过 0，跳过多余的填充位
            if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
                result[index] = blocks[j][i]
                index++
            }
        }
    }
    return result
}

/**
 * 计算 15 位格式信息（含 BCH 纠错与固定掩码）。
 * @param ecc 纠错等级
 * @param mask 掩码编号
 * @returns 15 位格式信息
 */
function computeFormatBits(ecc: QrEccLevel, mask: number): number {
    const data = (ECC_FORMAT_BITS[ecc] << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) {
        rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    }
    return ((data << 10) | rem) ^ 0x5412
}

/**
 * 计算 18 位版本信息（含 BCH 纠错，仅版本 7 及以上需要）。
 * @param version 版本号
 * @returns 18 位版本信息
 */
function computeVersionBits(version: number): number {
    let rem = version
    for (let i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    }
    return (version << 12) | rem
}

/**
 * 模块矩阵绘制器：维护模块颜色与「是否功能图形」两张表。
 */
class QrMatrix {
    readonly size: number
    readonly modules: boolean[][]
    private readonly isFunction: boolean[][]

    constructor(
        readonly version: number,
        readonly ecc: QrEccLevel
    ) {
        this.size = version * 4 + 17
        this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
        this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
        this.drawFunctionPatterns()
    }

    /**
     * 设置模块颜色并标记为功能图形。
     * @param x 列坐标
     * @param y 行坐标
     * @param isDark 是否深色
     */
    setFunctionModule(x: number, y: number, isDark: boolean): void {
        this.modules[y][x] = isDark
        this.isFunction[y][x] = true
    }

    /**
     * 读取模块颜色。
     * @param x 列坐标
     * @param y 行坐标
     * @returns 是否深色
     */
    getModule(x: number, y: number): boolean {
        return this.modules[y][x]
    }

    /**
     * 绘制全部功能图形：定位图形、分隔符、校正图形、时序图形、格式与版本信息。
     */
    private drawFunctionPatterns(): void {
        for (let i = 0; i < this.size; i++) {
            this.setFunctionModule(6, i, i % 2 === 0)
            this.setFunctionModule(i, 6, i % 2 === 0)
        }

        this.drawFinderPattern(3, 3)
        this.drawFinderPattern(this.size - 4, 3)
        this.drawFinderPattern(3, this.size - 4)

        const alignPos = ALIGNMENT_PATTERN_POSITIONS[this.version]
        for (let i = 0; i < alignPos.length; i++) {
            for (let j = 0; j < alignPos.length; j++) {
                // 三个角落已被定位图形占用
                if (!((i === 0 && j === 0) || (i === 0 && j === alignPos.length - 1) || (i === alignPos.length - 1 && j === 0))) {
                    this.drawAlignmentPattern(alignPos[i], alignPos[j])
                }
            }
        }

        // 先占位绘制一次格式信息（掩码取 0），确保数据区不侵入格式信息区
        this.drawFormatBits(0)
        this.drawVersionBits()
    }

    /**
     * 绘制 7×7 定位图形及其分隔符。
     * @param x 中心列坐标
     * @param y 中心行坐标
     */
    private drawFinderPattern(x: number, y: number): void {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy))
                const xx = x + dx
                const yy = y + dy
                if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
                    this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4)
                }
            }
        }
    }

    /**
     * 绘制 5×5 校正图形。
     * @param x 中心列坐标
     * @param y 中心行坐标
     */
    private drawAlignmentPattern(x: number, y: number): void {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
            }
        }
    }

    /**
     * 绘制格式信息（两份副本）。
     * @param mask 掩码编号
     */
    drawFormatBits(mask: number): void {
        const bits = computeFormatBits(this.ecc, mask)

        for (let i = 0; i <= 5; i++) {
            this.setFunctionModule(8, i, getBit(bits, i))
        }
        this.setFunctionModule(8, 7, getBit(bits, 6))
        this.setFunctionModule(8, 8, getBit(bits, 7))
        this.setFunctionModule(7, 8, getBit(bits, 8))
        for (let i = 9; i < 15; i++) {
            this.setFunctionModule(14 - i, 8, getBit(bits, i))
        }

        for (let i = 0; i < 8; i++) {
            this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i))
        }
        for (let i = 8; i < 15; i++) {
            this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i))
        }
        // 固定深色模块
        this.setFunctionModule(8, this.size - 8, true)
    }

    /**
     * 绘制版本信息（仅版本 7 及以上）。
     */
    private drawVersionBits(): void {
        if (this.version < 7) {
            return
        }

        const bits = computeVersionBits(this.version)
        for (let i = 0; i < 18; i++) {
            const bit = getBit(bits, i)
            const a = this.size - 11 + (i % 3)
            const b = Math.floor(i / 3)
            this.setFunctionModule(a, b, bit)
            this.setFunctionModule(b, a, bit)
        }
    }

    /**
     * 按 Zigzag 顺序写入码字比特。
     * @param data 交织后的码字序列
     */
    drawCodewords(data: Uint8Array): void {
        let i = 0
        for (let right = this.size - 1; right >= 1; right -= 2) {
            // 第 6 列是竖向时序图形，跳过
            if (right === 6) {
                right = 5
            }
            for (let vert = 0; vert < this.size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j
                    const upward = ((right + 1) & 2) === 0
                    const y = upward ? this.size - 1 - vert : vert
                    if (!this.isFunction[y][x] && i < data.length * 8) {
                        this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7))
                        i++
                    }
                }
            }
        }
    }

    /**
     * 对非功能模块异或指定掩码。
     * @param mask 掩码编号
     */
    applyMask(mask: number): void {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.isFunction[y][x]) {
                    continue
                }

                let invert: boolean
                switch (mask) {
                    case 0:
                        invert = (x + y) % 2 === 0
                        break
                    case 1:
                        invert = y % 2 === 0
                        break
                    case 2:
                        invert = x % 3 === 0
                        break
                    case 3:
                        invert = (x + y) % 3 === 0
                        break
                    case 4:
                        invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
                        break
                    case 5:
                        invert = ((x * y) % 2) + ((x * y) % 3) === 0
                        break
                    case 6:
                        invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
                        break
                    default:
                        invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
                        break
                }

                if (invert) {
                    this.modules[y][x] = !this.modules[y][x]
                }
            }
        }
    }

    /**
     * 计算当前矩阵的掩码罚分（规则 N1–N4）。
     * @returns 罚分总分
     */
    getPenaltyScore(): number {
        let result = 0
        const size = this.size

        // N1：行与列上连续同色模块
        for (let y = 0; y < size; y++) {
            let runColor = false
            let runX = 0
            for (let x = 0; x < size; x++) {
                if (this.modules[y][x] === runColor) {
                    runX++
                    if (runX === 5) result += PENALTY_N1
                    else if (runX > 5) result++
                } else {
                    runColor = this.modules[y][x]
                    runX = 1
                }
            }
        }
        for (let x = 0; x < size; x++) {
            let runColor = false
            let runY = 0
            for (let y = 0; y < size; y++) {
                if (this.modules[y][x] === runColor) {
                    runY++
                    if (runY === 5) result += PENALTY_N1
                    else if (runY > 5) result++
                } else {
                    runColor = this.modules[y][x]
                    runY = 1
                }
            }
        }

        // N2：2×2 同色块
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const color = this.modules[y][x]
                if (color === this.modules[y][x + 1] && color === this.modules[y + 1][x] && color === this.modules[y + 1][x + 1]) {
                    result += PENALTY_N2
                }
            }
        }

        // N3：形如 1:1:3:1:1 且一侧带 4 个空白的图形（定位图形相似物）。
        // 按 11 位滑动窗口匹配 10111010000 / 00001011101 两种写法。
        const columnBuffer = new Array<boolean>(size)
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                columnBuffer[x] = this.modules[x][y]
            }
            result += countFinderLikePatterns(this.modules[y])
            result += countFinderLikePatterns(columnBuffer)
        }

        // N4：深色模块占比偏离 50% 的程度（每 5% 计一档）
        let darkCount = 0
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (this.modules[y][x]) darkCount++
            }
        }
        const total = size * size
        const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total)
        result += k * PENALTY_N4

        return result
    }
}

/**
 * 统计一行（或一列）中「定位图形相似物」的出现次数，每次计 N3 罚分。
 * 匹配的 11 位窗口为 10111010000 或 00001011101。
 * @param line 一行或一列模块
 * @returns 罚分
 */
function countFinderLikePatterns(line: readonly boolean[]): number {
    let window = 0
    let penalty = 0
    for (let i = 0; i < line.length; i++) {
        window = ((window << 1) & 0x7ff) | (line[i] ? 1 : 0)
        if (i >= 10 && (window === 0x5d0 || window === 0x05d)) {
            penalty += PENALTY_N3
        }
    }
    return penalty
}

/**
 * 把文本编码为二维码矩阵（UTF-8 字节模式）。
 * @param text 待编码文本
 * @param options 编码选项
 * @returns 二维码矩阵
 * @throws 文本超出所选版本容量时抛错
 */
export function createQrCode(text: string, options: QrCodeOptions = {}): QrCodeData {
    const ecc = options.ecc ?? "M"
    const minVersion = options.minVersion ?? 1
    const maxVersion = options.maxVersion ?? 40
    const bytes = new TextEncoder().encode(text)

    let version = -1
    let dataUsedBits = 0
    for (let v = minVersion; v <= maxVersion; v++) {
        const capacityBits = getNumDataCodewords(v, ecc) * 8
        const charCountBits = v <= 9 ? 8 : 16
        const used = 4 + charCountBits + bytes.length * 8
        if (used <= capacityBits) {
            version = v
            dataUsedBits = used
            break
        }
    }

    if (version < 0) {
        throw new Error(`二维码内容过长，无法编码：${bytes.length} 字节`)
    }

    // 组装比特流：模式指示符 + 字符计数 + 数据 + 终止符 + 填充
    const capacityBits = getNumDataCodewords(version, ecc) * 8
    const bits: boolean[] = []
    const appendBits = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) {
            bits.push(((value >>> i) & 1) !== 0)
        }
    }

    appendBits(MODE_BYTE, 4)
    appendBits(bytes.length, version <= 9 ? 8 : 16)
    for (const b of bytes) {
        appendBits(b, 8)
    }
    appendBits(0, Math.min(4, capacityBits - dataUsedBits))
    appendBits(0, (8 - (bits.length % 8)) % 8)

    for (let padByte = 0xec; bits.length < capacityBits; padByte ^= 0xec ^ 0x11) {
        appendBits(padByte, 8)
    }

    const dataCodewords = new Uint8Array(bits.length / 8)
    for (let i = 0; i < bits.length; i++) {
        if (bits[i]) {
            dataCodewords[i >>> 3] |= 0x80 >>> (i & 7)
        }
    }

    const allCodewords = addEccAndInterleave(dataCodewords, version, ecc)

    let mask = options.mask ?? -1
    const matrix = new QrMatrix(version, ecc)
    matrix.drawCodewords(allCodewords)

    if (mask === -1) {
        let minPenalty = Number.MAX_SAFE_INTEGER
        for (let i = 0; i < 8; i++) {
            matrix.applyMask(i)
            matrix.drawFormatBits(i)
            const penalty = matrix.getPenaltyScore()
            if (penalty < minPenalty) {
                mask = i
                minPenalty = penalty
            }
            // 异或两次即可还原
            matrix.applyMask(i)
        }
    }

    matrix.applyMask(mask)
    matrix.drawFormatBits(mask)

    return {
        size: matrix.size,
        modules: matrix.modules.map(row => [...row]),
        version,
        ecc,
        mask,
        ...getQrCodeLayout(version),
    }
}

/**
 * 把二维码矩阵转换为单条 SVG path 的 `d` 属性值，便于用一个 `<path>` 渲染整张二维码。
 * @param qr 二维码矩阵
 * @returns SVG path 数据
 */
export function createQrCodePath(qr: QrCodeData): string {
    const segments: string[] = []
    for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
            if (qr.modules[y][x]) {
                segments.push(`M${x} ${y}h1v1h-1z`)
            }
        }
    }
    return segments.join("")
}
