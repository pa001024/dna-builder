import { type DnaSeasonModules, deriveDnaSeasonModules } from "./derive"
import { loadDnaSeasonSource } from "./source"

/**
 * 历史版本导出（`-v <1.8`）：v1.8 之前没有 DNASeason*.json，全量重建会把 4 个表清空。
 * 返回 true 时由调用方跳过这些函数源，保留当前已落盘数据。
 */
export function isLegacyDnaSeasonVersion(argv: string[] = process.argv): boolean {
    const index = argv.findIndex(
        arg => arg === "-v" || arg === "--version" || arg.startsWith("--version=") || (arg.startsWith("-v") && !arg.startsWith("--"))
    )
    if (index < 0) {
        return false
    }
    const raw = argv[index].startsWith("--version=")
        ? argv[index].slice("--version=".length)
        : argv[index].startsWith("-v") && argv[index].length > 2 && !argv[index].startsWith("--")
          ? argv[index].slice(2)
          : argv[index + 1]
    const match = /^v?(\d+)(?:\.(\d+))?/.exec(raw ?? "")
    if (!match) {
        return false
    }
    return Number(match[1]) < 1 || (Number(match[1]) === 1 && Number(match[2] ?? 0) < 8)
}

/** 4 个数据文件 stem，与 `packages/data/d/dnaseason*.data.ts` 一一对应。 */
export const DNASEASON_TARGET_STEMS = ["dnaseason", "dnaseasonequip", "dnaseasonprogress", "dnaseasonrift"] as const

export type DnaSeasonStem = (typeof DNASEASON_TARGET_STEMS)[number]

export type DnaSeasonReplacement = {
    targetVar: string
    value: unknown
}

let modulesPromise: Promise<DnaSeasonModules> | null = null
let legacyWarningPrinted = false

/** 读取上游并派生 4 个模块（进程内只跑一次，4 个函数源共用）。 */
function loadModules(): Promise<DnaSeasonModules> {
    if (!modulesPromise) {
        modulesPromise = (async () => {
            const { source, warnings } = await loadDnaSeasonSource()
            const modules = deriveDnaSeasonModules(source)
            const all = [...warnings, ...modules.warnings]
            for (const warning of all) {
                console.warn(`[dnaseason] ${warning}`)
            }
            return { ...modules, warnings: all }
        })()
    }
    return modulesPromise
}

/**
 * 取某个数据文件的全部变量替换值，供 `import-i18n-data.ts` 的函数源直接消费。
 * @param stem 目标文件 stem（不含 `.data.ts`）
 * @param argv 命令行参数，默认当前进程（测试可注入）
 */
export async function buildDnaSeasonReplacements(stem: DnaSeasonStem, argv: string[] = process.argv): Promise<DnaSeasonReplacement[]> {
    if (isLegacyDnaSeasonVersion(argv)) {
        if (!legacyWarningPrinted) {
            console.warn("[dnaseason] -v 历史版本低于 1.8，跳过 4 个升华数据模块（上游无 DNASeason*.json，避免清空当前数据）")
            legacyWarningPrinted = true
        }
        return []
    }
    const modules = await loadModules()
    return Object.entries(modules[stem]).map(([targetVar, value]) => ({ targetVar, value }))
}
