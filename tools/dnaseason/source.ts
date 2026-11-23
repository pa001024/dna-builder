import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { type DnaSeasonSource, normalizeCharIds } from "./derive"
import { buildSpawnUnits } from "./spawn"

const TOOLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REPO_ROOT = path.resolve(TOOLS_ROOT, "..")

/**
 * 上游仓库根：`--upstream` > `.env` 的 DNA_UPSTREAM > 同级 `../DuetNightAbyssData2`。
 * 与 `tools/import-i18n-data.ts` 口径一致。低于 1.8 的 `-v` 历史版本没有 DNASeason*.json，
 * 这 4 个模块在 `index.ts` 里直接跳过，不会走到本模块读取最新 Lua。
 */
function resolveUpstreamRoot(): string {
    const argv = process.argv
    const index = argv.indexOf("--upstream")
    const configured = index >= 0 ? argv[index + 1] : process.env.DNA_UPSTREAM
    return configured ? path.resolve(configured) : path.resolve(REPO_ROOT, "..", "DuetNightAbyssData2")
}

const UPSTREAM_ROOT = resolveUpstreamRoot()
const I18N_ROOT = process.env.DNA_UPSTREAM_I18N ? path.resolve(process.env.DNA_UPSTREAM_I18N) : path.join(UPSTREAM_ROOT, "final", "i18n")

async function readJson(name: string): Promise<Record<string, any>> {
    const filePath = path.join(I18N_ROOT, "cn", `${name}.json`)
    if (!existsSync(filePath)) {
        throw new Error(`上游数据源不存在：${filePath}（请检查 .env 的 DNA_UPSTREAM / DNA_UPSTREAM_I18N，以及 -v 版本是否包含 DNASeason）`)
    }
    try {
        return JSON.parse(await readFile(filePath, "utf-8"))
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`读取上游数据源 ${filePath} 失败：${reason}`)
    }
}

interface LuaManagerLike {
    loadScriptValue(relativePath: string): { value?: unknown; error?: string }
}

async function readLuaTable(name: string): Promise<unknown> {
    const managerPath = path.join(UPSTREAM_ROOT, "src", "lua", "LuaDataManager.ts")
    if (!existsSync(managerPath)) {
        throw new Error(`上游 Lua 取数模块不存在：${managerPath}（请检查 .env 的 DNA_UPSTREAM 是否指向 DuetNightAbyssData2 仓库根）`)
    }
    const scriptPath = path.join(UPSTREAM_ROOT, "Script", "Datas", `${name}.lua`)
    if (!existsSync(scriptPath)) {
        throw new Error(`上游 Lua 表不存在：${scriptPath}（请检查 .env 的 DNA_UPSTREAM 是否指向 DuetNightAbyssData2 仓库根）`)
    }
    const module = await import(pathToFileURL(managerPath).href)
    const manager = new module.LuaDataManager(UPSTREAM_ROOT) as LuaManagerLike
    const { value, error } = manager.loadScriptValue(path.join("Script", "Datas", `${name}.lua`))
    if (value === undefined) {
        throw new Error(`读取上游 Lua 表 ${name} 失败：${error ?? "未知错误"}`)
    }
    return value
}

/** 螺旋引用到的全部刷怪组 id（顶层精英 + 每层普通；兼容未来层内精英）。 */
function collectSpawnIds(rift: Record<string, any>): number[] {
    const ids = new Set<number>(rift.eliteMonsterIds ?? [])
    for (const floor of rift.floors ?? []) {
        for (const id of floor.normalMonsterIds ?? []) {
            ids.add(id)
        }
        for (const id of floor.eliteMonsterIds ?? []) {
            ids.add(id)
        }
    }
    return [...ids]
}

/**
 * 校验上游词条的 charIds：非空正整数数组才保留，去重升序；非法值删除并告警。
 * 该字段由上游导出器精确 join，缺失表示不适用，严禁用 desc 文本回退。
 */
function normalizeAffixCharIds(equip: Record<string, any>, warnings: string[]): void {
    if (!Array.isArray(equip.affixes)) {
        return
    }
    for (const affix of equip.affixes) {
        if (affix?.charIds === undefined) {
            continue
        }
        const result = normalizeCharIds(affix.charIds)
        if (result.ids) {
            affix.charIds = result.ids
        } else {
            delete affix.charIds
            warnings.push(`词条 ${affix.id} 的 charIds 非法（${result.error}），已忽略`)
        }
    }
}

/**
 * 读取 4 个 CN 上游 JSON 与 MonsterSpawn 刷怪组。
 * @returns 派生输入与读取阶段告警
 */
export async function loadDnaSeasonSource(): Promise<{ source: DnaSeasonSource; warnings: string[] }> {
    const [season, equip, progress, rift] = await Promise.all([
        readJson("DNASeason"),
        readJson("DNASeasonEquip"),
        readJson("DNASeasonProgress"),
        readJson("DNASeasonRift"),
    ])
    const spawnTable = await readLuaTable("MonsterSpawn")
    const { spawnUnits, warnings } = buildSpawnUnits(spawnTable, collectSpawnIds(rift))
    normalizeAffixCharIds(equip, warnings)
    return { source: { season, equip, progress, rift, spawnUnits }, warnings }
}
