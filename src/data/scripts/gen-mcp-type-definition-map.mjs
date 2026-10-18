import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * MCP 类型定义映射配置。
 * key 为类型名，value 为源文件与 interface 名称。
 */
const TYPE_DEFINITION_CONFIG = {
    AbyssDungeon: { filePath: "d/abyss.data.ts", interfaceName: "AbyssDungeon" },
    AsyncCombat: { filePath: "d/dungeon.data.ts", interfaceName: "AsyncCombat" },
    Buff: { filePath: "d/buff.data.ts", interfaceName: "Buff" },
    Char: { filePath: "d/char.data.ts", interfaceName: "Char" },
    CharExt: { filePath: "d/charext.data.ts", interfaceName: "CharExt" },
    CharVoice: { filePath: "d/charvoice.data.ts", interfaceName: "CharVoice" },
    DBMap: { filePath: "d/onlinemapcache.data.ts", interfaceName: "DBMap" },
    Draft: { filePath: "d/draft.data.ts", interfaceName: "Draft" },
    Dungeon: { filePath: "d/dungeon.data.ts", interfaceName: "Dungeon" },
    HardBoss: { filePath: "d/hardboss.data.ts", interfaceName: "HardBoss" },
    Jargon: { filePath: "d/jargon.data.ts", interfaceName: "Jargon" },
    DynQuest: { filePath: "d/dynquest.data.ts", interfaceName: "DynQuest" },
    Mod: { filePath: "d/mod.data.ts", interfaceName: "Mod" },
    NPC: { filePath: "d/npc.data.ts", interfaceName: "NPC" },
    Pan: { filePath: "d/pan.data.ts", interfaceName: "Pan" },
    PartyTopic: { filePath: "d/partytopic.data.ts", interfaceName: "PartyTopic" },
    Pet: { filePath: "d/pet.data.ts", interfaceName: "Pet" },
    QuestStory: { filePath: "d/quest.data.ts", interfaceName: "QuestStory" },
    Reward: { filePath: "d/reward.data.ts", interfaceName: "Reward" },
    SubRegion: { filePath: "d/subregion.data.ts", interfaceName: "SubRegion" },
    Weapon: { filePath: "d/weapon.data.ts", interfaceName: "Weapon" },
}

/**
 * 从源码文本中提取 export interface 定义。
 * @param {string} source 源码文本
 * @param {string} interfaceName 接口名称
 * @returns {string | null} 接口定义文本
 */
function extractInterfaceDefinition(source, interfaceName) {
    const startToken = `export interface ${interfaceName}`
    // 全词匹配：接口名后只允许空白、`{`（定义体）或 `<`（泛型），
    // 否则 `DynQuest` 会误命中先出现的 `DynQuestLevel`，`Char` 会误命中 `CharTrait`。
    let start = -1
    let from = 0
    for (;;) {
        const found = source.indexOf(startToken, from)
        if (found === -1) break
        const next = source[found + startToken.length]
        if (next === undefined || next === "{" || next === "<" || /\s/.test(next)) {
            start = found
            break
        }
        from = found + startToken.length
    }
    if (start === -1) return null

    const bodyStart = source.indexOf("{", start + startToken.length)
    if (bodyStart === -1) return null

    let depth = 0
    let end = -1
    for (let index = bodyStart; index < source.length; index++) {
        const char = source[index]
        if (char === "{") depth++
        if (char === "}") depth--
        if (depth === 0) {
            end = index + 1
            break
        }
    }

    if (end === -1) return null
    return source.slice(start, end).trim()
}

/**
 * 生成类型定义映射文件内容。
 * @returns {{ code: string, missing: string[] }} 生成内容与缺失类型
 */
function generateTypeDefinitionMapCode() {
    const result = {}
    const missing = []

    for (const [typeName, meta] of Object.entries(TYPE_DEFINITION_CONFIG)) {
        const sourcePath = resolve(process.cwd(), meta.filePath)
        const source = readFileSync(sourcePath, "utf-8")
        const definition = extractInterfaceDefinition(source, meta.interfaceName)
        result[typeName] = definition
        if (!definition) {
            missing.push(`${typeName}(${meta.interfaceName})`)
        }
    }

    const code = `/**
 * 数据类型 interface 快照映射。
 * 注意：该文件由 src/data/scripts/gen-mcp-type-definition-map.mjs 自动生成。
 */
export const DATA_TYPE_INTERFACE_DEFINITION_MAP = ${JSON.stringify(result, null, 4)} as const
`
    return { code, missing }
}

/**
 * 用仓库 Biome 落盘格式化生成文件，保证 regen 不产生格式分叉。
 * 发布流水线仅安装本包依赖、无 Biome 时跳过（不影响构建产物语义）。
 * @param targetPath 生成文件路径
 */
function formatGeneratedFile(targetPath) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
    const binDir = resolve(repoRoot, "node_modules", ".bin")
    const candidates = process.platform === "win32" ? ["biome.CMD", "biome.cmd", "biome"] : ["biome"]
    const bin = candidates.map(name => resolve(binDir, name)).find(path => existsSync(path))
    if (!bin) {
        console.warn(`[gen-mcp-type-definition-map] biome not found, skip formatting: ${targetPath}`)
        return
    }
    const command = `"${bin}" check --write "${targetPath}"`
    const result = spawnSync(command, { stdio: "inherit", shell: true })
    if (result.status !== 0) {
        console.error(`[gen-mcp-type-definition-map] biome format failed: ${targetPath}`)
        process.exit(1)
    }
}

/**
 * 执行生成流程。
 */
function main() {
    const targetPath = resolve(process.cwd(), "mcp/type-definition-map.ts")
    const { code, missing } = generateTypeDefinitionMapCode()

    if (missing.length > 0) {
        console.error("[gen-mcp-type-definition-map] 以下类型未找到 interface 定义:", missing.join(", "))
        process.exit(1)
    }

    writeFileSync(targetPath, code, "utf-8")
    formatGeneratedFile(targetPath)
    console.log(`[gen-mcp-type-definition-map] generated: ${targetPath}`)
}

main()
