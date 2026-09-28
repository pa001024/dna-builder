/**
 * AI 地图跳转（DBMapLink）的位置解析。
 *
 * 模型给出的参数是「类型 + id 或名称」这种最简形态，而地图跳转真正需要的是
 * 「区域 + 子区域 + 世界坐标」（见 `MapPosLink` 与 `MapTool` 的 query 约定），
 * 这一层负责把前者补齐成后者，让模型不必（也无法）拼出完整坐标：
 * - 类型写法容错：book / npc / resource，兼收「读物 / NPC / 资源 / 道具」这类中文写法；
 * - **读物按页面展开**：每一页的书页坐标与藏宝点坐标各算一个位置；
 * - **NPC 一个个体一行**：同名 NPC（如「鹿」）可能有多只，全部列出；
 * - **资源按子区域聚合**：同名资源可能有数百个采集点（见 `source[].pos`），
 *   聚合后一行对应一个子区域，跳转时用首个坐标定位、并把该资源作为地图筛选条件带上；
 * - 名称可能是译文：先用 `pickDBEntryByName` 反查回游戏原文再匹配。
 *
 * 区域没有本地地图（`region.mapMapping` 为空）时仍返回位置，但 `jumpable` 为 false——
 * 这时只能给出文本坐标，构建跳转路由会落空（与 `MapPosLink` 的处理一致）。
 */

import type { RouteLocationRaw } from "vue-router"
import { regionMap, subRegionMap } from "@/data/d"
import { type Book, type BookResource, booksData } from "@/data/d/book.data"
import { type NPC, npcData } from "@/data/d/npc.data"
import { type Resource, resourceData } from "@/data/d/resource.data"
import { expandDBAgentKeyword, resolveCurrentDBAgentLang } from "@/utils/db-locale"
import { normalizeDBEntryName, pickDBEntryByName, toNumericEntryId } from "@/utils/db-name-match"
import { getNpcDisplayText } from "@/utils/npc-utils"

/** 支持地图跳转的条目类型 */
export type DBMapKind = "book" | "npc" | "resource"

/** 位置类型：读物页 / 读物藏宝点 / NPC 所在点 / 资源采集点 */
export type DBMapPointType = "page" | "treasure" | "npc" | "source"

/** 类型缺失时按这个顺序逐个尝试 */
const MAP_KIND_ORDER: readonly DBMapKind[] = ["book", "npc", "resource"]

/** 类型参数的合法写法（小写后比对） */
const MAP_KIND_ALIASES: Record<string, DBMapKind> = {
    book: "book",
    books: "book",
    读物: "book",
    书籍: "book",
    藏宝图: "book",
    书: "book",
    npc: "npc",
    npcs: "npc",
    npc角色: "npc",
    人物: "npc",
    resource: "resource",
    resources: "resource",
    item: "resource",
    items: "resource",
    资源: "resource",
    道具: "resource",
    材料: "resource",
}

/** NPC 点位没有自带图标时的兜底图标（与资料库 NPC 详情页一致） */
const NPC_FALLBACK_ICON = "T_Gp_MainMission"

/** 位置类型的合法写法（小写后比对） */
const MAP_PART_ALIASES: Record<string, DBMapPointType> = {
    page: "page",
    pages: "page",
    pos: "page",
    书页: "page",
    内容: "page",
    treasure: "treasure",
    treasurepos: "treasure",
    宝藏: "treasure",
    藏宝点: "treasure",
}

/** 一个可跳转的地图位置分组 */
export interface DBMapGroup {
    /** 位置类型 */
    pointType: DBMapPointType
    /** 位置归属的名称（读物为具体页名，资源为资源名，均为游戏原文） */
    label: string
    /** 条目 id（读物为读物 id，资源为资源 id） */
    entryId: number
    /** 条目名称（游戏原文） */
    entryName: string
    /** 点位图标资源名 */
    icon: string
    /** 区域 id（即 map-tool 的 regionId） */
    regionId: number
    /** 区域名（游戏原文） */
    regionName: string
    /** 子区域 id */
    subRegionId: number
    /** 子区域名（游戏原文） */
    subRegionName: string
    /** 分组内的全部坐标（世界坐标），至少一条 */
    points: Array<[number, number]>
    /** 该分组是否能跳转到本地地图 */
    jumpable: boolean
}

/**
 * 归一化条目类型参数。
 * @param raw 模型给的 kind
 * @returns 归一化后的类型；无法识别时返回 undefined
 */
export function normalizeDBMapKind(raw: unknown): DBMapKind | undefined {
    const key = `${raw ?? ""}`.trim().toLowerCase()

    return key ? MAP_KIND_ALIASES[key] : undefined
}

/**
 * 归一化位置类型参数（读物的「只看书页 / 只看藏宝点」）。
 * @param raw 模型给的 part
 * @returns 归一化后的类型；无法识别时返回 undefined
 */
export function normalizeDBMapPart(raw: unknown): DBMapPointType | undefined {
    const key = `${raw ?? ""}`.trim().toLowerCase()

    return key ? MAP_PART_ALIASES[key] : undefined
}

/**
 * 解析坐标：只接受两个有限数值组成的二元组。
 * @param raw 原始坐标
 * @returns 坐标；不合法时返回 undefined
 */
function normalizePoint(raw: unknown): [number, number] | undefined {
    if (!Array.isArray(raw) || raw.length < 2) {
        return undefined
    }

    const x = Number(raw[0])
    const y = Number(raw[1])

    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined
}

/**
 * 取子区域与区域信息。
 * @param subRegionId 子区域 id
 * @returns 区域与子区域信息；查不到时返回 undefined
 */
function resolveLocation(subRegionId: number | undefined) {
    if (subRegionId === undefined) {
        return undefined
    }

    const subRegion = subRegionMap.get(subRegionId)
    const region = subRegion ? regionMap.get(subRegion.rid) : undefined

    if (!subRegion || !region) {
        return undefined
    }

    return {
        regionId: region.id,
        regionName: region.name,
        subRegionId: subRegion.id,
        subRegionName: subRegion.name,
        jumpable: Array.isArray(region.mapMapping) && region.mapMapping.length > 0,
    }
}

/**
 * 按「类型 + id 或名称」定位读物条目。
 *
 * id 既可以是读物 id，也可以是读物条目的 id（`res[].id`）：模型从「收录内容」里
 * 拿到的是页 id，直接给页 id 也要能定位到它所属的读物与那一页。
 * @param params 查询条件：id / 名称
 * @returns 读物与其限定页（给了页 id 时）；查不到时返回 undefined
 */
function resolveBook(params: { id?: number; name: string }): { book: Book; res?: BookResource } | undefined {
    if (params.id !== undefined) {
        const book = booksData.find(item => item.id === params.id)

        if (book) {
            return { book }
        }

        for (const candidate of booksData) {
            const res = candidate.res.find(item => item.id === params.id)

            if (res) {
                return { book: candidate, res }
            }
        }
    }

    if (params.name) {
        const book = pickDBEntryByName(booksData, params.name, item => [item.name])

        if (book) {
            return { book }
        }
    }

    return undefined
}

/**
 * 按「类型 + id 或名称」定位资源。
 * @param params 查询条件：id / 名称
 * @returns 资源；查不到时返回 undefined
 */
function resolveResource(params: { id?: number; name: string }): Resource | undefined {
    if (params.id !== undefined) {
        const resource = resourceData.find(item => item.id === params.id)

        if (resource) {
            return resource
        }
    }

    return params.name ? pickDBEntryByName(resourceData, params.name, item => [item.name]) : undefined
}

/**
 * 按「id 或名称」定位 NPC。
 *
 * 与读物 / 资源不同，**同名 NPC 是常态**（「鹿」「卫兵」这类），因此给名称时
 * 先收全部同名个体；一个都没有才退回模糊匹配取最像的那个。
 * @param params 查询条件：id / 名称
 * @returns 命中的 NPC 列表；查不到时返回空数组
 */
function resolveNpcs(params: { id?: number; name: string }): NPC[] {
    if (params.id !== undefined) {
        const npc = npcData.find(item => item.id === params.id)

        return npc ? [npc] : []
    }

    if (!params.name) {
        return []
    }

    const named = pickNamedNpcs(params.name)

    if (named.length) {
        return named
    }

    const best = pickDBEntryByName(npcData, params.name, item => [getNpcDisplayText(item)])

    return best ? [best] : []
}

/**
 * 收全部同名 NPC。
 * @param name 模型给的名称（可为译文）
 * @returns 同名 NPC 列表；没有精确同名时返回空数组
 */
function pickNamedNpcs(name: string): NPC[] {
    const queries = expandDBAgentKeyword(name, resolveCurrentDBAgentLang())
    const normalized = new Set(queries.map(query => normalizeDBEntryName(query)).filter(Boolean))

    if (!normalized.size) {
        return []
    }

    return npcData.filter(npc => normalized.has(normalizeDBEntryName(getNpcDisplayText(npc))))
}

/**
 * 把 NPC 的位置展开成跳转分组（一个 NPC 一个点位）。
 * @param npcs NPC 列表
 * @returns 跳转分组列表
 */
function collectNpcGroups(npcs: NPC[]): DBMapGroup[] {
    const groups: DBMapGroup[] = []

    for (const npc of npcs) {
        const point = normalizePoint(npc.pos)
        const location = resolveLocation(npc.srId)

        if (!point || !location) {
            continue
        }

        const label = getNpcDisplayText(npc)

        groups.push({
            pointType: "npc",
            label,
            entryId: npc.id,
            entryName: label,
            icon: npc.icon || NPC_FALLBACK_ICON,
            ...location,
            points: [point],
        })
    }

    return groups
}

/**
 * 把读物的位置展开成跳转分组。
 * @param book 读物
 * @param res 限定页（为空表示整本读物）
 * @param part 只看某类位置（为空表示两类都看）
 * @returns 跳转分组列表
 */
function collectBookGroups(book: Book, res: BookResource | undefined, part: DBMapPointType | undefined): DBMapGroup[] {
    const groups: DBMapGroup[] = []
    const pages = res ? [res] : book.res

    for (const page of pages ?? []) {
        const label = page.name?.trim() || book.name
        const candidates: Array<[DBMapPointType, unknown]> = [
            ["page", page.pos],
            ["treasure", page.treasurePos],
        ]

        for (const [pointType, rawPoint] of candidates) {
            if (part && part !== pointType) {
                continue
            }

            const point = normalizePoint(rawPoint)
            const location = resolveLocation(page.srId)

            if (!point || !location) {
                continue
            }

            groups.push({
                pointType,
                label,
                entryId: book.id,
                entryName: book.name,
                icon: book.icon,
                ...location,
                points: [point],
            })
        }
    }

    return groups
}

/**
 * 把资源的采集点按子区域聚合成跳转分组。
 *
 * 同一个子区域可能有多条 `source` 记录（不同奖励来源共享一片采集点），
 * 因此先按子区域 id 把坐标并起来再建分组——否则同一子区域会重复出好几行。
 * @param resource 资源
 * @returns 跳转分组列表（同名资源在各子区域的采集点各成一行）
 */
function collectResourceGroups(resource: Resource): DBMapGroup[] {
    const pointsBySubRegion = new Map<number, Array<[number, number]>>()

    for (const source of resource.source ?? []) {
        const points = (source.pos ?? []).map(normalizePoint).filter((point): point is [number, number] => point !== undefined)

        if (!points.length) {
            continue
        }

        pointsBySubRegion.set(source.srId, [...(pointsBySubRegion.get(source.srId) ?? []), ...points])
    }

    const groups: DBMapGroup[] = []

    for (const [subRegionId, points] of pointsBySubRegion) {
        const location = resolveLocation(subRegionId)

        if (!location) {
            continue
        }

        groups.push({
            pointType: "source",
            label: resource.name,
            entryId: resource.id,
            entryName: resource.name,
            icon: resource.icon,
            ...location,
            points,
        })
    }

    return groups
}

/**
 * 解析条目的全部地图位置。
 *
 * 定位顺序是「先 id 后名称」，类型缺失时按 book → npc → resource 逐个试；
 * id 命中即返回，避免同名条目影响 id 的精确性。
 * `part` 是**严格筛选**（只对读物的书页 / 藏宝点有意义）：指定的那类位置一条都没有就返回空数组，
 * 由调用方决定要不要退回不筛选（见 `DBMapLink.vue`）。
 * @param params 模型给的参数（kind / id / name / part）
 * @returns 跳转分组列表；参数不足或查不到时返回空数组
 */
export function resolveDBMapGroups(params: { kind?: unknown; id?: unknown; name?: unknown; part?: unknown }): DBMapGroup[] {
    const kind = normalizeDBMapKind(params.kind)
    const part = normalizeDBMapPart(params.part)
    const id = toNumericEntryId(params.id)
    const name = `${params.name ?? ""}`.trim()
    const kinds = kind ? [kind] : MAP_KIND_ORDER

    if (id === undefined && !name) {
        return []
    }

    for (const candidate of kinds) {
        if (candidate === "book") {
            const found = resolveBook({ id, name })

            if (found) {
                return collectBookGroups(found.book, found.res, part)
            }

            continue
        }

        if (candidate === "npc") {
            const npcs = resolveNpcs({ id, name })

            if (npcs.length) {
                return collectNpcGroups(npcs)
            }

            continue
        }

        const resource = resolveResource({ id, name })

        if (resource) {
            return collectResourceGroups(resource)
        }
    }

    return []
}

/**
 * 生成地图跳转路由。
 *
 * 与 `MapPosLink` 用同一套 query 约定：读物按 `pointX/pointY` 聚焦到具体坐标；
 * 资源额外带上 `rid`，让地图把该资源的采集点整体高亮出来。
 * @param group 跳转分组
 * @param pointName 可选的点位名（地图上的标记文案，通常传入已本地化的名称）
 * @returns 路由目标；区域没有本地地图时返回 null
 */
export function buildDBMapRoute(group: DBMapGroup, pointName?: string): RouteLocationRaw | null {
    if (!group.jumpable) {
        return null
    }

    const [x, y] = group.points[0] ?? []

    if (x === undefined || y === undefined) {
        return null
    }

    const query: Record<string, string> = {
        regionId: String(group.regionId),
        subRegionId: String(group.subRegionId),
        pointName: pointName?.trim() || group.label,
        pointX: String(x),
        pointY: String(y),
        pointIcon: group.icon,
    }

    if (group.pointType === "source") {
        query.rid = String(group.entryId)
    }

    return { name: "map-tool", query }
}
