#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import * as ts from "typescript"
import { DNAAPI } from "../packages/dna-api/src/index.ts"
import regionData from "../packages/data/d/region.data"
import { subRegionData } from "../packages/data/d/subregion.data"

const TARGET_FILE = resolve(process.cwd(), "packages/data/d/onlinemapcache.data.ts")

/**
 * 将任意 JSON 值序列化为 TypeScript 友好的格式。
 * @param value 任意 JSON 值
 * @param indent 缩进层级
 * @returns TypeScript 字面量文本
 */
function formatTsValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent)
    const nextPad = "    ".repeat(indent + 1)

    if (value === null) return "null"
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]"
        return `[\n${value.map(item => `${nextPad}${formatTsValue(item, indent + 1)}`).join(",\n")}\n${pad}]`
    }

    switch (typeof value) {
        case "string":
            return JSON.stringify(value)
        case "number":
        case "boolean":
            return String(value)
        case "object": {
            const entries = Object.entries(value as Record<string, unknown>)
            if (entries.length === 0) return "{}"
            return `{\n${entries
                .map(([key, entryValue]) => `${nextPad}${JSON.stringify(key)}: ${formatTsValue(entryValue, indent + 1)}`)
                .join(",\n")}\n${pad}}`
        }
        default:
            throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
    }
}

/**
 * 在源码中定位指定变量初始化表达式的范围（数组 / 对象字面量均可）。
 * @param sourceFile TS 源文件
 * @param targetVar 目标变量名
 * @returns 需要替换的表达式范围
 */
function findInitializerSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) continue

            return {
                start: declaration.initializer.getStart(sourceFile),
                end: declaration.initializer.getEnd(),
            }
        }
    }

    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

// ================= 在线地图 → MapTool 世界坐标换算标定 =================
// 重拉线上快照时一并重算换算表（见 main），结果写入 onlinemapcache.data.ts 文件尾。
// 锚点是人工核对过的共识点对（在线 site id ↔ 世界传送点名）；拟合残差超过上限即视为
// 线上改点或配对失效，直接报错中断，不要静默接受——按 .agents/docs/online-map-transform.md 重核。

/** 候选旋转：正交整数角。θ 与 θ+180 在缩放变号时等价，拟合后统一规范到 s>0 */
const CARDINAL_ROTATION_DEGS = [0, 90, 180, 270]
const TRANSFORM_WORLD_UNITS_PER_METER = 100
const TRANSFORM_MAX_RMSE_METERS = 10
/** 单锚点外推的借用缩放：同组室内图（map5/7/8/16）标定缩放的均值，见标定记录 */
const SINGLE_ANCHOR_FALLBACK_SCALE = 14.9586
const SINGLE_ANCHOR_FALLBACK_ROTATION_DEG = 0

const ONLINE_MAP_REGION_IDS: Record<number, number> = {
    4: 1021,
    5: 1001,
    6: 1011,
    7: 1017,
    8: 1013,
    9: 1019,
    11: 1041,
    13: 1045,
    14: 1052,
    15: 1053,
    16: 1055,
    17: 1060,
    18: 1063,
    20: 1070,
    21: 1071,
    22: 1072,
}

interface TransformAnchor {
    onlineSiteId: number
    worldPointName: string
    /** 同名世界点在 subRegionData 中的出现序号，默认 0（地下轨道×2、站前穹顶×2 才需要） */
    worldOccurrence?: number
}

/** 逐地图共识锚点：在线 site id ↔ 世界传送点名（含钓鱼点/灵鸟回声/梦魇残声/Leave 引导点等语义外点） */
const TRANSFORM_ANCHORS: Record<number, TransformAnchor[]> = {
    4: [
        { onlineSiteId: 61, worldPointName: "龙莎要塞装卸区" },
        { onlineSiteId: 863, worldPointName: "龙莎要塞外环" },
        { onlineSiteId: 689, worldPointName: "龙莎要塞动力室" },
        { onlineSiteId: 775, worldPointName: "龙莎要塞下水道" },
        { onlineSiteId: 980, worldPointName: "龙莎要塞模拟战场" },
        { onlineSiteId: 843, worldPointName: "龙莎要塞中央控制室" },
    ],
    5: [
        { onlineSiteId: 49, worldPointName: "秽兽肆虐的村庄" },
        { onlineSiteId: 531, worldPointName: "神秘遗迹中层" },
        { onlineSiteId: 54, worldPointName: "神秘遗迹顶层" },
    ],
    6: [
        { onlineSiteId: 73, worldPointName: "冰湖城外围广场" },
        { onlineSiteId: 71, worldPointName: "修普诺斯之家" },
        { onlineSiteId: 2711, worldPointName: "冰湖城外围城门" },
        { onlineSiteId: 94, worldPointName: "融雪洞窟" },
        { onlineSiteId: 91, worldPointName: "风息小径" },
        { onlineSiteId: 80, worldPointName: "风语渡口" },
        { onlineSiteId: 62, worldPointName: "冰湖城郊外" },
        { onlineSiteId: 67, worldPointName: "格雷姆废矿" },
        { onlineSiteId: 132, worldPointName: "泪湖湖畔" },
    ],
    7: [
        { onlineSiteId: 180, worldPointName: "冰湖城下水道" },
        { onlineSiteId: 886, worldPointName: "废水处理区深处" },
        { onlineSiteId: 181, worldPointName: "冰湖城下水道深处" },
        { onlineSiteId: 884, worldPointName: "废水处理区" },
    ],
    8: [
        { onlineSiteId: 138, worldPointName: "格雷姆废矿底层" },
        { onlineSiteId: 162, worldPointName: "格雷姆废矿深处" },
    ],
    // map9 全图只有 1 个传送点共识，走单锚点外推（low 置信度），补点后在这里加锚点即可转正
    9: [{ onlineSiteId: 1252, worldPointName: "盖雷亚剧院" }],
    11: [
        { onlineSiteId: 1704, worldPointName: "听鸦原" },
        { onlineSiteId: 1703, worldPointName: "微茫市" },
        { onlineSiteId: 1701, worldPointName: "幽明涧" },
        { onlineSiteId: 1702, worldPointName: "枯荣阁" },
        { onlineSiteId: 1705, worldPointName: "尘漠石海" },
        { onlineSiteId: 1690, worldPointName: "蓼风岭西侧" },
        { onlineSiteId: 1660, worldPointName: "蓼风岭东侧" },
        { onlineSiteId: 1675, worldPointName: "潮声岩穴入口" },
        { onlineSiteId: 1673, worldPointName: "蒹葭浦" },
        { onlineSiteId: 1626, worldPointName: "浮星埠" },
        { onlineSiteId: 1657, worldPointName: "诫碑区" },
        { onlineSiteId: 1697, worldPointName: "百年春" },
        { onlineSiteId: 1889, worldPointName: "潮声岩穴内部" },
    ],
    13: [
        { onlineSiteId: 2065, worldPointName: "椒兰村高处" },
        { onlineSiteId: 2063, worldPointName: "椒兰村" },
        { onlineSiteId: 2061, worldPointName: "西郊" },
        { onlineSiteId: 2068, worldPointName: "祀烟阁外近郊" },
        { onlineSiteId: 2067, worldPointName: "西城" },
        { onlineSiteId: 2066, worldPointName: "参商港" },
        { onlineSiteId: 2070, worldPointName: "皓京中央广场" },
        { onlineSiteId: 2069, worldPointName: "内城" },
        { onlineSiteId: 2049, worldPointName: "分殊学院" },
        { onlineSiteId: 2047, worldPointName: "东城" },
        { onlineSiteId: 2051, worldPointName: "东郊" },
        { onlineSiteId: 2052, worldPointName: "东郊野外" },
        { onlineSiteId: 2053, worldPointName: "九章坪东侧" },
        { onlineSiteId: 2059, worldPointName: "九章坪" },
        { onlineSiteId: 2071, worldPointName: "执律阁" },
    ],
    14: [
        { onlineSiteId: 2229, worldPointName: "山外山入口" },
        { onlineSiteId: 2228, worldPointName: "山外山深处" },
        { onlineSiteId: 2230, worldPointName: "灵鸟回声·扼守（山外山）" },
    ],
    15: [
        { onlineSiteId: 2226, worldPointName: "太虚陵" },
        { onlineSiteId: 2227, worldPointName: "太皓与烛阴" },
    ],
    16: [
        { onlineSiteId: 2223, worldPointName: "由来巷" },
        { onlineSiteId: 2224, worldPointName: "由来巷钓鱼点" },
        { onlineSiteId: 2225, worldPointName: "灵鸟回声·避险（由来巷）" },
    ],
    17: [
        { onlineSiteId: 2433, worldPointName: "站前穹顶" },
        { onlineSiteId: 2434, worldPointName: "站外空地" },
        { onlineSiteId: 2480, worldPointName: "百花车站钓鱼点" },
        { onlineSiteId: 2437, worldPointName: "冰湖城外围" },
        { onlineSiteId: 2443, worldPointName: "锻铁厂下层" },
        { onlineSiteId: 2452, worldPointName: "地下轨道", worldOccurrence: 0 },
        { onlineSiteId: 2457, worldPointName: "地下轨道", worldOccurrence: 1 },
        { onlineSiteId: 2565, worldPointName: "极光号主炮" },
    ],
    18: [
        { onlineSiteId: 2435, worldPointName: "锻铁厂" },
        { onlineSiteId: 2436, worldPointName: "地下轨道" },
        { onlineSiteId: 2534, worldPointName: "站前穹顶", worldOccurrence: 1 },
        { onlineSiteId: 2563, worldPointName: "站前穹顶", worldOccurrence: 0 },
        { onlineSiteId: 2536, worldPointName: "锻铁厂上层" },
        { onlineSiteId: 2526, worldPointName: "站厅" },
    ],
    20: [
        { onlineSiteId: 2771, worldPointName: "阿尔卡诺山入口" },
        { onlineSiteId: 2792, worldPointName: "山中密林" },
        { onlineSiteId: 2738, worldPointName: "乐园镇" },
    ],
    21: [
        { onlineSiteId: 2803, worldPointName: "废墟游乐场" },
        { onlineSiteId: 2858, worldPointName: "吊桥" },
        { onlineSiteId: 2845, worldPointName: "焦土地" },
    ],
    22: [
        { onlineSiteId: 2890, worldPointName: "湖边营地" },
        { onlineSiteId: 2914, worldPointName: "污染湖泊" },
        { onlineSiteId: 2923, worldPointName: "山谷裂隙" },
    ],
}

interface OnlineMapDetailLike {
    matterCategorizes: { matters: { sites: { id: number; x: number; y: number }[] }[] }[]
}

interface CoordinatePoint {
    x: number
    y: number
}

interface FittedMapTransform {
    mapId: number
    regionId: number
    regionName: string
    scale: number
    rotationDeg: number
    translateX: number
    translateY: number
    samples: number
    rmseMeters: number
    confidence: "high" | "medium" | "low"
}

/**
 * 收集某张在线地图的全部标点（按 site id 索引）。
 * @param mapDetail 在线地图详情（新拉的或静态快照均可）
 * @returns site id 到像素坐标的映射
 */
function collectOnlineSitePositions(mapDetail: OnlineMapDetailLike): Map<number, CoordinatePoint> {
    const sitePositions = new Map<number, CoordinatePoint>()
    for (const category of mapDetail.matterCategorizes ?? []) {
        for (const matter of category.matters ?? []) {
            for (const site of matter.sites ?? []) {
                sitePositions.set(site.id, { x: site.x, y: site.y })
            }
        }
    }
    return sitePositions
}

/**
 * 按名称收集某区域的世界传送点（保持 subRegionData 中的出现顺序，供同名点序号定位）。
 * @param regionId 区域 id
 * @param pointName 传送点名称
 * @returns 世界坐标列表
 */
function collectWorldPointPositions(regionId: number, pointName: string): CoordinatePoint[] {
    const worldPoints: CoordinatePoint[] = []
    for (const subRegion of subRegionData.filter(item => item.rid === regionId)) {
        for (const teleport of subRegion.tp ?? []) {
            if (teleport.name === pointName) worldPoints.push({ x: teleport.pos[0], y: teleport.pos[1] })
        }
    }
    return worldPoints
}

/**
 * 解 3 元一次方程组（高斯消元）。
 * @param normalMatrix 3x3 系数矩阵（按行展开）
 * @param normalVector 右端向量
 * @returns 解向量，无解返回 null
 */
function solveLinearSystem3(normalMatrix: Float64Array, normalVector: Float64Array): number[] | null {
    const rows = Array.from({ length: 3 }, (_, index) => [
        normalMatrix[index * 3]!,
        normalMatrix[index * 3 + 1]!,
        normalMatrix[index * 3 + 2]!,
        normalVector[index]!,
    ])
    for (let col = 0; col < 3; col++) {
        let pivot = col
        for (let row = col + 1; row < 3; row++) {
            if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row
        }
        if (Math.abs(rows[pivot]![col]!) < 1e-9) return null
        ;[rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!]
        for (let row = 0; row < 3; row++) {
            if (row === col) continue
            const factor = rows[row]![col]! / rows[col]![col]!
            for (let k = col; k < 4; k++) rows[row]![k]! -= factor * rows[col]![k]!
        }
    }
    return rows.map((row, index) => row[3]! / row[index]!)
}

/**
 * 在固定旋转与镜像下解最小二乘（未知数 s/tx/ty，旋转后的在线坐标为已知系数）。
 * @param onlinePoints 在线像素点列
 * @param worldPoints 世界坐标点列（与在线点列一一对应）
 * @param rotationDeg 逆时针旋转角（度，只取正交整数角）
 * @returns 缩放、平移与残差，无解返回 null
 */
function solveScaleTranslate(
    onlinePoints: CoordinatePoint[],
    worldPoints: CoordinatePoint[],
    rotationDeg: number
): { scale: number; translateX: number; translateY: number; rmse: number } | null {
    const radians = (rotationDeg * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    // 设计矩阵行：X 行 [rotatedX, 1, 0]，Y 行 [rotatedY, 0, 1]
    const normalMatrix = new Float64Array(9)
    const normalVector = new Float64Array(3)
    for (let index = 0; index < onlinePoints.length; index++) {
        const baseX = onlinePoints[index]!.x
        const baseY = onlinePoints[index]!.y
        const rotatedX = cos * baseX - sin * baseY
        const rotatedY = sin * baseX + cos * baseY
        const rows = [
            { coefficients: [rotatedX, 1, 0], value: worldPoints[index]!.x },
            { coefficients: [rotatedY, 0, 1], value: worldPoints[index]!.y },
        ]
        for (const { coefficients, value } of rows) {
            for (let a = 0; a < 3; a++) {
                normalVector[a]! += coefficients[a]! * value
                for (let b = 0; b < 3; b++) normalMatrix[a * 3 + b]! += coefficients[a]! * coefficients[b]!
            }
        }
    }
    const solution = solveLinearSystem3(normalMatrix, normalVector)
    if (!solution) return null
    const [scale, translateX, translateY] = solution as [number, number, number]
    let squaredError = 0
    for (let index = 0; index < onlinePoints.length; index++) {
        const baseX = onlinePoints[index]!.x
        const baseY = onlinePoints[index]!.y
        const rotatedX = cos * baseX - sin * baseY
        const rotatedY = sin * baseX + cos * baseY
        squaredError +=
            (scale * rotatedX + translateX - worldPoints[index]!.x) ** 2 + (scale * rotatedY + translateY - worldPoints[index]!.y) ** 2
    }
    return { scale, translateX, translateY, rmse: Math.sqrt(squaredError / onlinePoints.length) }
}

/**
 * 正交约束相似变换拟合：枚举正交旋转角，取残差最小的一组（缩放统一规范到正数）。
 * @param onlinePoints 在线像素点列
 * @param worldPoints 世界坐标点列
 * @returns 最优拟合，无解时抛出
 */
function fitCardinalTransform(
    onlinePoints: CoordinatePoint[],
    worldPoints: CoordinatePoint[]
): { rotationDeg: number; scale: number; translateX: number; translateY: number; rmse: number } {
    let best: { rotationDeg: number; scale: number; translateX: number; translateY: number; rmse: number } | null = null
    for (const rotationDeg of CARDINAL_ROTATION_DEGS) {
        const fitted = solveScaleTranslate(onlinePoints, worldPoints, rotationDeg)
        if (!fitted) continue
        // θ 与 θ+180 在缩放变号时等价：统一规范到 s>0，旋转归到正交整数角
        const canonicalRotation = fitted.scale < 0 ? (rotationDeg + 180) % 360 : rotationDeg
        const candidate = {
            rotationDeg: canonicalRotation,
            scale: Math.abs(fitted.scale),
            translateX: fitted.translateX,
            translateY: fitted.translateY,
            rmse: fitted.rmse,
        }
        if (!best || candidate.rmse < best.rmse) best = candidate
    }
    if (!best) throw new Error("换算拟合无解：法方程奇异")
    return best
}

/**
 * 拟合单张在线地图的换算参数（含残差门禁与单锚点外推）。
 * @param mapId 在线地图 id
 * @param mapDetail 在线地图详情
 * @returns 该地图的换算行
 */
function fitOneMapTransform(mapId: number, mapDetail: OnlineMapDetailLike): FittedMapTransform {
    const regionId = ONLINE_MAP_REGION_IDS[mapId]
    if (regionId === undefined) throw new Error(`map${mapId} 缺少 region 映射（ONLINE_MAP_REGION_IDS）`)
    const regionName = regionData.find(item => item.id === regionId)?.name ?? ""
    const anchors = TRANSFORM_ANCHORS[mapId]
    if (!anchors || anchors.length === 0) throw new Error(`map${mapId} 缺少标定锚点（TRANSFORM_ANCHORS）`)
    const sitePositions = collectOnlineSitePositions(mapDetail)
    const onlinePoints = anchors.map(anchor => {
        const position = sitePositions.get(anchor.onlineSiteId)
        if (!position) throw new Error(`map${mapId} 在线快照缺少锚点 site id=${anchor.onlineSiteId}（线上改点，需重核锚点）`)
        return position
    })
    const worldPoints = anchors.map(anchor => {
        const candidates = collectWorldPointPositions(regionId, anchor.worldPointName)
        const position = candidates[anchor.worldOccurrence ?? 0]
        if (!position) throw new Error(`map${mapId} 世界侧缺少锚点 ${anchor.worldPointName}（本地数据改名，需重核锚点）`)
        return position
    })
    if (anchors.length === 1) {
        // 单锚点只能定平移：旋转按 -mapRotation 取正交角，缩放借用同组均值，锚点处精确、越远越不准
        const anchorOnline = onlinePoints[0]!
        const anchorWorld = worldPoints[0]!
        const radians = (SINGLE_ANCHOR_FALLBACK_ROTATION_DEG * Math.PI) / 180
        const rotatedX = Math.cos(radians) * anchorOnline.x - Math.sin(radians) * anchorOnline.y
        const rotatedY = Math.sin(radians) * anchorOnline.x + Math.cos(radians) * anchorOnline.y
        return {
            mapId,
            regionId,
            regionName,
            scale: SINGLE_ANCHOR_FALLBACK_SCALE,
            rotationDeg: SINGLE_ANCHOR_FALLBACK_ROTATION_DEG,
            translateX: anchorWorld.x - SINGLE_ANCHOR_FALLBACK_SCALE * rotatedX,
            translateY: anchorWorld.y - SINGLE_ANCHOR_FALLBACK_SCALE * rotatedY,
            samples: 1,
            rmseMeters: -1,
            confidence: "low",
        }
    }
    const fitted = fitCardinalTransform(onlinePoints, worldPoints)
    const rmseMeters = fitted.rmse / TRANSFORM_WORLD_UNITS_PER_METER
    if (rmseMeters > TRANSFORM_MAX_RMSE_METERS) {
        throw new Error(
            `map${mapId} 换算残差 ${rmseMeters.toFixed(2)}m 超标（>${TRANSFORM_MAX_RMSE_METERS}m）：线上改点或配对失效，需重核锚点`
        )
    }
    return {
        mapId,
        regionId,
        regionName,
        scale: fitted.scale,
        rotationDeg: fitted.rotationDeg,
        translateX: fitted.translateX,
        translateY: fitted.translateY,
        samples: anchors.length,
        rmseMeters,
        confidence: anchors.length >= 3 ? "high" : "medium",
    }
}

/**
 * 拟合全部在线地图的换算参数（任一失败即中断，保证不落地半份标定）。
 * @param detailsByMapId 在线地图详情（新拉的或静态快照均可，至少含 matterCategorizes）
 * @returns 以地图 id 为键的换算行
 */
function fitAllMapTransforms(detailsByMapId: Record<number, OnlineMapDetailLike>): Record<number, FittedMapTransform> {
    const rows: Record<number, FittedMapTransform> = {}
    for (const mapId of Object.keys(ONLINE_MAP_REGION_IDS)
        .map(Number)
        .sort((left, right) => left - right)) {
        const mapDetail = detailsByMapId[mapId]
        if (!mapDetail) throw new Error(`map${mapId} 缺少在线详情，无法标定换算`)
        rows[mapId] = fitOneMapTransform(mapId, mapDetail)
    }
    return rows
}

/**
 * 把拟合结果序列化成换算表字面量（与 onlinemapcache.data.ts 提交格式逐字一致）。
 * @param rows 以地图 id 为键的换算行
 * @returns 表字面量文本
 */
function formatTransformTableText(rows: Record<number, FittedMapTransform>): string {
    const compact = (value: number, fractionDigits: number): string => String(Number(value.toFixed(fractionDigits)))
    const lines = Object.keys(rows)
        .map(Number)
        .sort((left, right) => left - right)
        .map(mapId => {
            const row = rows[mapId]!
            return `    ${mapId}: { mapId: ${row.mapId}, regionId: ${row.regionId}, regionName: ${JSON.stringify(row.regionName)}, scale: ${compact(row.scale, 4)}, rotationDeg: ${row.rotationDeg}, translateX: ${compact(row.translateX, 1)}, translateY: ${compact(row.translateY, 1)}, samples: ${row.samples}, rmseMeters: ${compact(row.rmseMeters, 2)}, confidence: ${JSON.stringify(row.confidence)} },`
        })
    return `{\n${lines.join("\n")}\n}`
}

/**
 * 把换算表字面量文本写回 onlinemapcache.data.ts（只替换 ONLINE_MAP_TRANSFORMS 初始化段，其余不动）。
 * @param tableText 换算表字面量文本
 */
async function rewriteTransformFile(tableText: string): Promise<void> {
    const fileText = await readFile(TARGET_FILE, "utf-8")
    const sourceFile = ts.createSourceFile(TARGET_FILE, fileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const tableSpan = findInitializerSpan(sourceFile, "ONLINE_MAP_TRANSFORMS")
    const newText = `${fileText.slice(0, tableSpan.start)}${tableText}${fileText.slice(tableSpan.end)}`
    await writeFile(TARGET_FILE, newText, "utf-8")
    console.log(`[update-map-cache] transforms updated: ${TARGET_FILE}`)
}

/**
 * 用已提交的静态快照校验换算表：拟合并逐字比对，不写文件（离线可跑）。
 * @returns 校验通过返回换算行
 */
async function checkCommittedTransforms(): Promise<Record<number, FittedMapTransform>> {
    const snapshot = (await import("../packages/data/d/onlinemapcache.data")) as { onlineMapCache: Record<number, OnlineMapDetailLike> }
    const rows = fitAllMapTransforms(snapshot.onlineMapCache)
    const fileText = await readFile(TARGET_FILE, "utf-8")
    const sourceFile = ts.createSourceFile(TARGET_FILE, fileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const tableSpan = findInitializerSpan(sourceFile, "ONLINE_MAP_TRANSFORMS")
    const committed = fileText.slice(tableSpan.start, tableSpan.end).trim()
    const generated = formatTransformTableText(rows).trim()
    for (const row of Object.values(rows).sort((left, right) => left.mapId - right.mapId)) {
        console.log(
            `[check] map${row.mapId} ${row.regionName}: rot=${row.rotationDeg} s=${row.scale.toFixed(4)} samples=${row.samples} rmse=${row.rmseMeters < 0 ? "外推" : `${row.rmseMeters.toFixed(2)}m`} ${row.confidence}`
        )
    }
    if (committed !== generated) {
        throw new Error("换算表与提交版本不一致：先跑 `bun tools/update-map-cache.ts`（会重拉快照并重算），再确认是线上改点还是锚点失效")
    }
    console.log("[check] transforms match committed snapshot")
    return rows
}

/**
 * 使用线上接口刷新地图分类与地图详情缓存，顺带重算坐标换算表。
 * 拟合在任何写文件之前先跑：任一地图超差就整体中断，不落地半份标定。
 */
async function main() {
    if (process.argv.includes("--check")) {
        await checkCommittedTransforms()
        return
    }
    if (process.argv.includes("--transforms-only")) {
        // 离线重算：用已提交的静态快照拟合并写回换算表（不碰网络，用于改完锚点后刷新）
        const snapshot = (await import("../packages/data/d/onlinemapcache.data")) as {
            onlineMapCache: Record<number, OnlineMapDetailLike>
        }
        const transformRows = fitAllMapTransforms(snapshot.onlineMapCache)
        await rewriteTransformFile(formatTransformTableText(transformRows))
        return
    }
    const api = new DNAAPI({ fetchFn: fetch })

    const categorizeRes = await api.getMapCategorizeList()
    if (!categorizeRes.is_success || !categorizeRes.data?.list) {
        throw new Error(`获取地图分类失败: ${categorizeRes.msg || categorizeRes.code}`)
    }

    const mapIds: number[] = []
    for (const category of categorizeRes.data.list) {
        for (const map of category.maps) {
            mapIds.push(map.id)
        }
    }

    const onlineMapCache: Record<number, unknown> = {}
    for (const mapId of mapIds) {
        const res = await api.getMapDetail(mapId)
        if (!res.is_success || !res.data) {
            throw new Error(`获取地图详情失败: mapId=${mapId}, msg=${res.msg || res.code}`)
        }
        onlineMapCache[mapId] = {
            floors: res.data.floors ?? [],
            matterCategorizes: res.data.matterCategorizes ?? [],
            map: res.data.map,
            userSites: res.data.userSites ?? [],
        }
    }

    const fileText = await readFile(TARGET_FILE, "utf-8")
    const transformRows = fitAllMapTransforms(onlineMapCache as Record<number, OnlineMapDetailLike>)
    const transformTableText = formatTransformTableText(transformRows)
    const sourceFile = ts.createSourceFile(TARGET_FILE, fileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    // 目录与详情一起落快照：两者都是线上真相源的静态拷贝，禁止手改（见 map.data.ts 文件头契约）
    const catalogSpan = findInitializerSpan(sourceFile, "offlineMapCatalog")
    const cacheSpan = findInitializerSpan(sourceFile, "onlineMapCache")
    const catalogReplacement = formatTsValue(categorizeRes.data.list, 0)
    const cacheReplacement = formatTsValue(onlineMapCache, 0)
    const replacements = [
        { ...catalogSpan, text: catalogReplacement },
        { ...cacheSpan, text: cacheReplacement },
    ].sort((left, right) => right.start - left.start)
    let newText = fileText
    for (const replacement of replacements) {
        newText = `${newText.slice(0, replacement.start)}${replacement.text}${newText.slice(replacement.end)}`
    }

    await writeFile(TARGET_FILE, newText, "utf-8")
    console.log(`[update-map-cache] updated: ${TARGET_FILE}`)
    await rewriteTransformFile(transformTableText)
}

if (import.meta.main) {
    main().catch(error => {
        console.error("[update-map-cache] failed:", error)
        process.exit(1)
    })
}
