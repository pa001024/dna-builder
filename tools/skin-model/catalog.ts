/**
 * 从游戏的 Lua 数据表解析「皮肤 → 模型资产」映射。
 *
 * 游戏里这条链是三张表拼起来的：
 *   `Skin.lua`        皮肤 id → `SkinModelId` / `CharId` / `SkinTag`
 *   `Model.lua`       模型 id → `SkeletonMeshPath`（脸）与 `PartModelsId`（身体、头发等）
 *   `CharPartModel.lua` 部件 id → `PartPath`（真正的 SkeletalMesh 包路径）
 *
 * 不解析 UE 资产，只读文本表：这些表是稳定的纯 Lua 数据，改版时也不会换结构，
 * 比用反射遍历 AssetRegistry 可靠得多。
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface SkinCatalogEntry {
    /** 皮肤 id（社区染色码里的那个） */
    skinId: number
    /** 角色 id；默认皮肤等于 skinId */
    charId: number
    /** 皮肤标签，例如 `Fuluo01`；系列皮肤没有 tag，靠模型表拼出公共体型 + 角色头 */
    tag: string
    /** 模型 id */
    modelId: number
    /** 脸/骨架网格的包路径（`/Game/...` 形式） */
    faceMesh?: string
    /** 角色资产目录（`Asset/Char/Player/Char005_Shuimu`），来自模型表的 `MontageFolder` */
    characterDir?: string
    /** 身体、头发等部件网格的包路径 */
    partMeshes: string[]
    /** 皮肤品阶效果生物的网格（翅膀等），独立骨架，展示时挂在角色骨骼上 */
    effectMeshes: string[]
}

/** 读取文本文件，容错非 UTF-8 字节（数据表里有 GBK 残留）；缺失的表返回空串。 */
function readLua(path: string): string {
    if (!existsSync(path)) return ""
    return readFileSync(path).toString("utf8")
}

/** 顶层表项一律缩进两个空格，用它区分嵌套的 `[n] = {`（如 BattleCharUIMap）。 */
const TOP_LEVEL_ENTRY = /^ {2}\[(\d+)\] = \{/gm

/** 从 `[id] = { ... }` 里截出花括号配平的表体。 */
function blockAfter(source: string, marker: string, from = 0): string | undefined {
    const start = source.indexOf(marker, from)
    if (start < 0) return undefined
    const open = source.indexOf("{", start)
    if (open < 0) return undefined
    let depth = 0
    for (let index = open; index < source.length; index++) {
        if (source[index] === "{") depth++
        else if (source[index] === "}") {
            depth--
            if (!depth) return source.slice(open + 1, index)
        }
    }
    return undefined
}

/** 取出 `SkeletalMesh'/Game/...'` 里的包路径，统一成 `/Game/...` 并去掉 `.ObjectName` 后缀。 */
function meshPath(value: string | undefined): string | undefined {
    if (!value) return undefined
    const quoted = value.match(/'([^']+)'/)
    const raw = (quoted?.[1] ?? value).trim()
    if (!raw) return undefined
    // UE 的完整对象路径是 `/Game/A/B.B`；fmodel-cli 只要包路径 `/Game/A/B`
    const packagePath = raw.replace(/\.[^./]+$/, "")
    // Model.lua 里有的路径少了 `/Game/` 前缀
    return packagePath.startsWith("/Game/") ? packagePath : `/Game/${packagePath.replace(/^\/+/, "")}`
}

/**
 * 解析数据表顶部 `local T = {}` 里的复用常量（`T.RT_86 = { 110291, 110292 }`）。
 * 有些皮肤的 `PartModelsId` 写成常量引用而不是字面量数组。
 * @param source 数据表源码
 * @returns 常量名到表体文本
 */
function constantTables(source: string): Map<string, string> {
    const result = new Map<string, string>()
    for (const match of source.matchAll(/^T\.(RT_\d+) = \{/gm)) {
        const block = blockAfter(source, match[0], match.index)
        if (block !== undefined) result.set(match[1], block)
    }
    return result
}

/** 解析 `PartModelsId = {...}`，值可能是字面量数组，也可能是 `T.RT_N` 常量引用。 */
function partModelIds(block: string, constants: Map<string, string>): number[] {
    const match = block.match(/PartModelsId\s*=\s*(?:\{([^}]*)\}|T\.(RT_\d+))/)
    if (!match) return []
    const body = match[1] ?? constants.get(match[2]) ?? ""
    return [...body.matchAll(/\d+/g)].map(item => Number(item[0]))
}

/**
 * @description 解析皮肤品阶效果生物的网格：`Skin2LevelUpEffectCreature` → `EffectCreature`
 * （`MeshResourceId`）→ `Model.lua` 的 `SkeletonMeshPath`。
 *
 * 这类网格是独立骨架（只有翅膀骨骼），不在 `PartModelsId` 里，却是展示界面上最主要的外观元素。
 * @param luaDir 游戏 Script 目录
 * @returns 皮肤 id → 效果网格包路径（同皮肤内去重）
 */
function readEffectMeshes(luaDir: string): Map<number, string[]> {
    const result = new Map<number, string[]>()
    const skinSource = readLua(join(luaDir, "Datas/Skin2LevelUpEffectCreature.lua"))
    const creatureSource = readLua(join(luaDir, "Datas/EffectCreature.lua"))
    const modelSource = readLua(join(luaDir, "Datas/Model.lua"))
    if (!skinSource || !creatureSource) return result

    const creatureMeshes = new Map<number, number>()
    for (const match of creatureSource.matchAll(TOP_LEVEL_ENTRY)) {
        const block = blockAfter(creatureSource, match[0])
        const meshId = Number(block?.match(/MeshResourceId\s*=\s*(\d+)/)?.[1] ?? 0)
        if (meshId) creatureMeshes.set(Number(match[1]), meshId)
    }
    const modelMeshes = new Map<number, string>()
    for (const match of modelSource.matchAll(TOP_LEVEL_ENTRY)) {
        const block = blockAfter(modelSource, match[0])
        const path = meshPath(block?.match(/SkeletonMeshPath\s*=\s*"([^"]+)"/)?.[1])
        if (path) modelMeshes.set(Number(match[1]), path)
    }
    for (const match of skinSource.matchAll(TOP_LEVEL_ENTRY)) {
        const block = blockAfter(skinSource, match[0])
        if (!block) continue
        const meshes = new Set<string>()
        for (const row of block.matchAll(/EffectCreatureId\s*=\s*(\d+)/g)) {
            const meshId = creatureMeshes.get(Number(row[1]))
            const path = meshId === undefined ? undefined : modelMeshes.get(meshId)
            if (path) meshes.add(path)
        }
        if (meshes.size) result.set(Number(match[1]), [...meshes])
    }
    return result
}

/**
 * @description 解析全部皮肤目录。只收「有独立模型的皮肤」（skinId !== charId），
 * 默认外观不算皮肤。
 *
 * 两类皮肤都收：
 * - 角色专属皮肤：`SkinTag` 非空，部件是自己的身体 + 头发；
 * - 系列皮肤：没有 `SkinTag`，部件是**公共体型** + 角色头发，和游戏里一样靠模型表拼出来。
 * @param luaDir 游戏 Script 目录（含 `Datas/Skin.lua`）
 * @returns 按皮肤 id 升序的目录
 */
export function readSkinCatalog(luaDir: string): SkinCatalogEntry[] {
    const skinSource = readLua(join(luaDir, "Datas/Skin.lua"))
    const modelSource = readLua(join(luaDir, "Datas/Model.lua"))
    const partSource = readLua(join(luaDir, "Datas/CharPartModel.lua"))

    // 部件 id → 网格路径
    const partMeshes = new Map<number, string>()
    for (const match of partSource.matchAll(TOP_LEVEL_ENTRY)) {
        const block = blockAfter(partSource, match[0])
        if (!block) continue
        const path = meshPath(block.match(/PartPath\s*=\s*"([^"]+)"/)?.[1])
        if (path) partMeshes.set(Number(match[1]), path)
    }

    const catalog: SkinCatalogEntry[] = []
    const constants = constantTables(modelSource)
    const effectMeshes = readEffectMeshes(luaDir)
    for (const match of skinSource.matchAll(TOP_LEVEL_ENTRY)) {
        const skinId = Number(match[1])
        const block = blockAfter(skinSource, match[0])
        if (!block) continue
        const modelId = Number(block.match(/SkinModelId\s*=\s*(\d+)/)?.[1] ?? 0)
        const charId = Number(block.match(/CharId\s*=\s*(\d+)/)?.[1] ?? 0)
        const tag = block.match(/SkinTag\s*=\s*"([^"]+)"/)?.[1] ?? ""
        if (!modelId || !charId) continue
        // 默认外观（skinId === charId）没有独立模型，跳过
        if (skinId === charId) continue

        const modelBlock = blockAfter(modelSource, `[${modelId}] = {`)
        if (!modelBlock) continue
        // 没有 PartModelsId 的是纯图标/商店条目，没有可导出的网格
        const partIds = partModelIds(modelBlock, constants)
        const parts = partIds.map(id => partMeshes.get(id)).filter((path): path is string => Boolean(path))
        if (!parts.length) continue
        const faceMesh = meshPath(modelBlock.match(/SkeletonMeshPath\s*=\s*"([^"]+)"/)?.[1])
        // 系列皮肤的脸是公共体型自带的，只有模型表还记着角色自己的目录
        const montageFolder = modelBlock.match(/MontageFolder\s*=\s*"([^"]+)"/)?.[1]
        const characterDir = montageFolder?.replace(/^\/?(Game\/)?/, "").split("/Animation/")[0] || undefined
        catalog.push({
            skinId,
            charId,
            tag,
            modelId,
            faceMesh,
            characterDir,
            partMeshes: [...new Set(parts)],
            effectMeshes: effectMeshes.get(skinId) ?? [],
        })
    }
    return catalog.sort((a, b) => a.skinId - b.skinId)
}

/**
 * @description 由皮肤条目推出角色资产目录（`EM/Content/Asset/Char/...`），
 * 用于搜索该角色的展示动画与材质。
 * 优先用模型表的 `MontageFolder`：系列皮肤的脸网格来自公共体型目录，靠脸网格推不出角色。
 * @param entry 皮肤目录条目
 * @returns 角色目录的包路径前缀
 */
export function characterDirectory(entry: SkinCatalogEntry): string | undefined {
    if (entry.characterDir) return entry.characterDir
    return entry.faceMesh?.replace(/^\/Game\//, "").split("/Mesh/")[0]
}
