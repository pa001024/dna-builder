import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import * as ts from "typescript"

type JsonObject = Record<string, any>

const eventId = 103026
const levelIds = [40701, 40702, 40703, 40704, 40711, 40712, 40713, 40714, 40721, 40722, 40723, 40724]
const defaultInputDir = resolve(import.meta.dir, "../../DuetNightAbyssData2/out")
const defaultScriptDir = resolve(import.meta.dir, "../../DuetNightAbyssData2/script")
const defaultOutputFile = resolve(import.meta.dir, "../src/data/d/weapon-verify.data.ts")

type WeaponVerifyExport = {
    event: { id: number; name: string; description: string; rule: string; startTime: number; endTime: number; jumpUnlockCondition: number }
    levels: {
        id: number
        number: string
        name: string
        description: string
        levelType: number
        recommendedLevel: number
        goalTimes: number[]
        affixIds: number[]
        globalBuffIds: number[]
        levelBuffIds: number[]
        totalTime: number
        beginDelay: number
        winDelay: number
        winMode: number
        winTarget: number
        dungeonMonsters: number[]
        bossCreatorIds: number[]
        monsterSpawnIds: number[]
    }[]
    affixes: { id: number; name: string; description: string; icon: string; globalPassiveIds: number[] }[]
    buffs: {
        id: number
        name: string
        description: string
        scope: "global" | "level"
        effects: { attrName: string; rate?: number; value?: number; damageTag?: string }[]
    }[]
    rewards: { rewardId: number; requiredStar: number }[]
    settlement: { id: number; dungeonId: number; isShowCondition: boolean; isShowScore: boolean }[]
    preload: { monsterSpawn: Record<string, number>; onlineCoefficient: number }
}

/** 读取 JSON 文件。 */
async function readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await readFile(filePath, "utf8")) as T
}

/** 解析命令行路径参数。 */
function parseArgs(): { inputDir: string; scriptDir: string; outputFile: string } {
    const args = Bun.argv.slice(2)
    const getValue = (name: string) => {
        const index = args.indexOf(name)
        return index >= 0 ? args[index + 1] : undefined
    }
    return {
        inputDir: resolve(getValue("--input") || defaultInputDir),
        scriptDir: resolve(getValue("--script") || defaultScriptDir),
        outputFile: resolve(getValue("--output") || defaultOutputFile),
    }
}

/** 获取本地化文案，缺失时保留 key。 */
function translate(textMap: JsonObject, key: string): string {
    return textMap[key]?.TextMapContent || key
}

/** 将资源路径裁剪为前端可展示的资源名。 */
function getAssetName(resourcePath: string): string {
    return resourcePath.split("/").pop()?.split(".")[0] || resourcePath
}

/** 替换关卡目标文案中的顺序数字占位符。 */
function formatLevelDescription(text: string, targetCount: number): string {
    let index = 0
    const values = [0, targetCount]
    return text.replace(/%d/g, () => String(values[index++] ?? targetCount))
}

/** 将属性倍率转换为带符号的百分比文本。 */
function formatRate(rate: number): string {
    return `${rate > 0 ? "+" : ""}${rate * 100}%`
}

/** 将可展示的属性变更拼接到活动 Buff 文案中。 */
function appendEffectDescription(description: string, effects: WeaponVerifyExport["buffs"][number]["effects"]): string {
    if (effects.length === 0) return description
    const labels: Record<string, string> = {
        ATK: "敌人攻击力",
        MaxEs: "敌人最大护盾",
        MaxHp: "敌人最大生命值",
        SkillEfficiency: "技能效益",
        SkillSustain: "技能耐久",
    }
    const values = effects.map(effect => {
        const label = labels[effect.attrName] || effect.attrName
        return effect.rate !== undefined ? `${label}<H>${formatRate(effect.rate)}</>` : `${label}<H>${effect.value ?? 0}</>`
    })
    return `${description}（${values.join("，")}）`
}

/** 从预加载 Lua 中提取 WeaponVerify.RT_1 的固定怪物配置。 */
function parsePreload(scriptText: string): { monsterSpawn: Record<string, number>; onlineCoefficient: number } {
    const block = scriptText.match(/WeaponVerify\s*=\s*\{\s*RT_1\s*=\s*\{([\s\S]*?)\n\s*\}\s*\}/)?.[1] || ""
    const monsterBlock = block.match(/MonsterSpawn\s*=\s*\{([\s\S]*?)\n\s*\}/)?.[1] || ""
    const monsterSpawn: Record<string, number> = {}
    for (const match of monsterBlock.matchAll(/\[(\d+)\]\s*=\s*(\d+)/g)) monsterSpawn[match[1]] = Number(match[2])
    return { monsterSpawn, onlineCoefficient: Number(block.match(/OnlineCoefficient\s*=\s*([\d.]+)/)?.[1] || 1) }
}

/** 构建活动 103026 的最小可展示数据。 */
async function buildExport(inputDir: string, scriptDir: string): Promise<WeaponVerifyExport> {
    const [
        textMap,
        eventMain,
        eventPortal,
        eventLevels,
        eventBuffs,
        eventEntries,
        eventRewards,
        globalPassives,
        buffs,
        weaponVerify,
        settlements,
    ] = await Promise.all([
        readJson<JsonObject>(resolve(inputDir, "TextMap_I18n.json")),
        readJson<JsonObject>(resolve(inputDir, "EventMain.json")),
        readJson<JsonObject>(resolve(inputDir, "EventPortal.json")),
        readJson<JsonObject>(resolve(inputDir, "WeaponVerifyEventLevel.json")),
        readJson<JsonObject>(resolve(inputDir, "WeaponVerifyEventBuff.json")),
        readJson<JsonObject>(resolve(inputDir, "WeaponVerifyEntry.json")),
        readJson<JsonObject>(resolve(inputDir, "WeaponVerifyEventReward.json")),
        readJson<JsonObject>(resolve(inputDir, "GlobalPassiveData.json")),
        readJson<JsonObject>(resolve(inputDir, "Buff.json")),
        readJson<JsonObject>(resolve(inputDir, "WeaponVerify.json")),
        readJson<JsonObject>(resolve(inputDir, "EventSettlementPage.json")),
    ])
    const preload = parsePreload(await readFile(resolve(scriptDir, "DungeonPreloadData.lua"), "utf8"))
    const event = eventMain[eventId]
    const portal = eventPortal[eventId]
    const levels = levelIds.map(id => {
        const level = eventLevels[id]
        const battle = weaponVerify[id]
        return {
            id,
            number: translate(textMap, level.LevelNumber),
            name: translate(textMap, level.LevelName),
            description: formatLevelDescription(translate(textMap, level.LevelDes), level.LevelType === 1 ? battle.WinTarget : 1),
            levelType: level.LevelType,
            recommendedLevel: level.RecomendLevel,
            goalTimes: level.LevelGoalRequiredTime,
            affixIds: level.AffixGroup,
            globalBuffIds: level.GlobalBuff,
            levelBuffIds: level.LevelBuff,
            totalTime: battle.TotalTime,
            beginDelay: battle.BeginDelay,
            winDelay: battle.WinDelay,
            winMode: battle.WinMode,
            winTarget: battle.WinTarget,
            dungeonMonsters: battle.DungeonMonsters || [],
            bossCreatorIds: battle.BossCreatorId || [],
            monsterSpawnIds: battle.MonsterSpawnId || [],
        }
    })
    const affixes = Object.values(eventEntries).map(entry => ({
        id: entry.ID,
        name: translate(textMap, entry.Name),
        description: translate(textMap, entry.Desc),
        icon: getAssetName(entry.IconPath),
        globalPassiveIds: entry.GlobalPassives || [],
    }))
    const buffIdToGlobalPassiveId: Record<number, number> = {
        1001: 23001,
        1002: 23003,
        1003: 23002,
        2001: 23004,
        2002: 23005,
        2003: 23006,
        2004: 23007,
    }
    const exportedBuffs = Object.values(eventBuffs).map(buff => {
        const passive = globalPassives[buffIdToGlobalPassiveId[buff.BuffId]]
        const sourceBuff = passive?.Vars?.Buff ? buffs[passive.Vars.Buff] : undefined
        const effects = (sourceBuff?.AddAttrs || []).map((effect: JsonObject) => ({
            attrName: effect.AttrName,
            rate: effect.Rate ?? effect.Value,
            value: effect.Value,
            damageTag: effect.DamageTag,
        }))
        const translatedDescription = translate(textMap, buff.Desc)
        const description = buff.BuffId >= 2000 ? appendEffectDescription(translatedDescription, effects) : translatedDescription
        return {
            id: buff.BuffId,
            name: buff.BuffId >= 2000 ? translate(textMap, "UI_WeaponVerify_LevelBuff") : translate(textMap, "UI_WeaponVerify_GlobalBuff"),
            description,
            scope: buff.BuffId >= 2000 ? ("level" as const) : ("global" as const),
            effects,
        }
    })
    return {
        event: {
            id: eventId,
            name: translate(textMap, event.EventName),
            description: translate(textMap, event.EventDes),
            rule: translate(textMap, event.EventRule),
            startTime: event.EventStartTime,
            endTime: event.EventEndTime,
            jumpUnlockCondition: portal.JumpUnlockCondition,
        },
        levels,
        affixes,
        buffs: exportedBuffs,
        rewards: Object.values(eventRewards)
            .filter(reward => reward.EventId === eventId)
            .map(reward => ({ rewardId: reward.RewardId, requiredStar: reward.RequiredStar })),
        settlement: Object.values(settlements)
            .filter(item => item.EventId === eventId)
            .map(item => ({
                id: item.Id,
                dungeonId: item.DungeonId,
                isShowCondition: item.IsShowCondition,
                isShowScore: item.IsShowScore,
            })),
        preload,
    }
}

/** 判断对象 key 是否可以直接作为 TypeScript 标识符输出。 */
function isIdentifierKey(key: string): boolean {
    return /^[$_\p{ID_Start}][$\u200C\p{ID_Continue}]*$/u.test(key)
}

/** 将 JSON 值格式化为 TypeScript 字面量。 */
function formatTsValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent)
    const nextPad = "    ".repeat(indent + 1)

    if (value === null) return "null"
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]"
        const items = value.map(item => `${nextPad}${formatTsValue(item, indent + 1)}`).join(",\n")
        return ["[", `${items},`, `${pad}]`].join("\n")
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
        if (entries.length === 0) return "{}"
        const items = entries
            .map(([key, item]) => `${nextPad}${isIdentifierKey(key) ? key : JSON.stringify(key)}: ${formatTsValue(item, indent + 1)}`)
            .join(",\n")
        return ["{", `${items},`, `${pad}}`].join("\n")
    }
    if (typeof value === "string") return JSON.stringify(value)
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
}

/** 在变量初始化表达式中寻找第一个数组或对象字面量。 */
function findFirstCollectionLiteral(node: ts.Node): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null {
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) return node

    let found: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null = null
    ts.forEachChild(node, child => {
        if (found) return
        found = findFirstCollectionLiteral(child)
    })
    return found
}

/** 根据变量名定位目标集合字面量的替换区间。 */
function findReplacementSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) continue
            const collectionNode = findFirstCollectionLiteral(declaration.initializer)
            if (!collectionNode) throw new Error(`在 ${sourceFile.fileName} 中找不到 ${targetVar} 的数组或对象字面量`)
            return { start: collectionNode.getStart(sourceFile), end: collectionNode.getEnd() }
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/** 将替换内容写入目标字面量区间，保留文件其他内容。 */
function applyReplacement(fileText: string, replacement: { start: number; end: number; text: string }): string {
    return `${fileText.slice(0, replacement.start)}${replacement.text}${fileText.slice(replacement.end)}`
}

/** 通过 AST 区间替换更新导出的活动数据。 */
async function main(): Promise<void> {
    const { inputDir, scriptDir, outputFile } = parseArgs()
    const data = await buildExport(inputDir, scriptDir)
    const originalText = await readFile(outputFile, "utf8")
    const sourceFile = ts.createSourceFile(outputFile, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const span = findReplacementSpan(sourceFile, "weaponVerifyData")
    const nextText = applyReplacement(originalText, { ...span, text: formatTsValue(data) })
    if (nextText !== originalText) await writeFile(outputFile, nextText, "utf8")
    console.log(`WeaponVerify 数据已通过 AST 更新到 ${outputFile}`)
}

await main()
