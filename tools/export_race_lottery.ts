import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import * as ts from "typescript"

type JsonObject = Record<string, any>

const defaultInputDir = resolve(import.meta.dir, "../../DuetNightAbyssData2/out")
const defaultOutputFile = resolve(import.meta.dir, "../src/data/d/race-lottery.data.ts")

type RaceLotteryExport = {
    players: {
        playerId: number
        modelId: string
        icon: string
        defaultSpeed: number
        name: string
    }[]
    maxStakes: { EventDay: number; MaxStake: number }[]
    outsideBuffs: {
        rumorId: number
        buffMap: string
        pValueEffect: number
        randomWeight: number
        bannedWhenValueHigherThan?: number
        bannedWhenValueLowerThan?: number
        name: string
    }[]
    insideBuffs: {
        insideBuffId: number
        unlockDay: number
        effect: number
        effectPath?: string
        randomWeight: number
        name: string
        description: string
    }[]
    constants: Record<string, number | string>
    rewardRates: { RewardRate: number; TargetHitNum: number }[]
    rumorFees: { RumorInquireFee: number; RumorInquireTime: number }[]
}

/**
 * 读取 JSON 文件并返回其内容。
 * @param filePath JSON 文件路径。
 * @returns JSON 数据。
 */
async function readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await readFile(filePath, "utf8")) as T
}

/**
 * 解析命令行参数，允许在其他机器上复用一次性导出脚本。
 * @returns 输入目录和输出文件路径。
 */
function parseArgs(): { inputDir: string; outputFile: string } {
    const args = Bun.argv.slice(2)
    const getValue = (name: string) => {
        const index = args.indexOf(name)
        return index >= 0 ? args[index + 1] : undefined
    }

    return {
        inputDir: resolve(getValue("--input") || defaultInputDir),
        outputFile: resolve(getValue("--output") || defaultOutputFile),
    }
}

/**
 * 从 TextMap 中读取中文文案，缺失时保留原始 key 便于发现数据问题。
 * @param textMap TextMap 数据。
 * @param key 文案 key。
 * @returns 中文文案。
 */
function translate(textMap: JsonObject, key: string): string {
    return textMap[key]?.TextMapContent || key
}

/**
 * 裁剪游戏资源路径，只保留前端静态图片文件名。
 * @param resourcePath 游戏资源路径。
 * @returns 不带扩展名的资源名。
 */
function getAssetName(resourcePath: string): string {
    return resourcePath.split("/").pop()?.split(".")[0] || resourcePath
}

/**
 * 将常量字符串转换为数字，无法转换时保留字符串。
 * @param value 原始常量值。
 * @returns 适合前端使用的常量值。
 */
function parseConstantValue(value: string): number | string {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : value
}

/**
 * 根据游戏原始 JSON 构造前端所需的 RaceLottery 静态数据。
 * @param inputDir D2 out 目录。
 * @returns 已完成中文翻译的活动数据。
 */
async function buildExport(inputDir: string): Promise<RaceLotteryExport> {
    const [textMap, players, maxStakes, outsideBuffMap, insideBuffMap, constants, rewardRates, rumorFees] = await Promise.all([
        readJson<JsonObject>(resolve(inputDir, "TextMap_I18n.json")),
        readJson<JsonObject>(resolve(inputDir, "RaceLotteryPlayer.json")),
        readJson<{ EventDay: number; MaxStake: number }[]>(resolve(inputDir, "RaceLotteryMaxStake.json")),
        readJson<JsonObject>(resolve(inputDir, "RaceLotteryBuffMap.json")),
        readJson<JsonObject>(resolve(inputDir, "RaceLotteryInsideBuff.json")),
        readJson<JsonObject>(resolve(inputDir, "RaceLotteryConstant.json")),
        readJson<{ RewardRate: number; TargetHitNum: number }[]>(resolve(inputDir, "RaceLotteryRewardRate.json")),
        readJson<{ RumorInquireFee: number; RumorInquireTime: number }[]>(resolve(inputDir, "RaceLotteryRumorFee.json")),
    ])

    return {
        players: Object.values(players).map(player => {
            const name = translate(textMap, player.PlayerName)
            return {
                playerId: player.PlayerId,
                modelId: player.PlayerModelId,
                icon: getAssetName(player.PlayerIcon),
                defaultSpeed: player.PlayerDefaultSpeed,
                name,
            }
        }),
        maxStakes,
        outsideBuffs: Object.values(outsideBuffMap).map(buff => {
            const name = translate(textMap, buff.MaxStake)
            return {
                rumorId: buff.RumorId,
                buffMap: buff.BuffMap,
                pValueEffect: buff.PValueEffect,
                randomWeight: buff.RandomWeight,
                bannedWhenValueHigherThan: buff.BannedWhenValueHigherThan,
                bannedWhenValueLowerThan: buff.BannedWhenValueLowerThan,
                name,
            }
        }),
        insideBuffs: Object.values(insideBuffMap).map(buff => {
            const name = translate(textMap, buff.InsideBuffName)
            const description = translate(textMap, buff.InsideBuffDes)
            return {
                insideBuffId: buff.InsideBuffId,
                unlockDay: buff.BuffUnlockDay,
                effect: buff.InsideBuffEffect,
                effectPath: buff.BuffEffectPath,
                randomWeight: buff.RandomWeight,
                name,
                description,
            }
        }),
        constants: Object.fromEntries(Object.entries(constants).map(([key, value]) => [key, parseConstantValue(value.ConstantValue)])),
        rewardRates,
        rumorFees,
    }
}

/**
 * 判断对象 key 是否可以直接作为 TypeScript 标识符输出。
 * @param key 对象 key。
 * @returns 是否为合法标识符。
 */
function isIdentifierKey(key: string): boolean {
    return /^[$_\p{ID_Start}][$\u200C\p{ID_Continue}]*$/u.test(key)
}

/**
 * 将 JSON 值格式化为 TypeScript 字面量，供 AST 区间替换使用。
 * @param value 待格式化的数据。
 * @param indent 当前缩进层级。
 * @returns TypeScript 字面量源码。
 */
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
            .map(([key, item]) => {
                const formattedKey = isIdentifierKey(key) ? key : JSON.stringify(key)
                return `${nextPad}${formattedKey}: ${formatTsValue(item, indent + 1)}`
            })
            .join(",\n")
        return ["{", `${items},`, `${pad}}`].join("\n")
    }
    if (typeof value === "string") return JSON.stringify(value)
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
}

/**
 * 在变量初始化表达式中寻找第一个数组或对象字面量。
 * @param node 变量初始化表达式。
 * @returns 找到的集合字面量。
 */
function findFirstCollectionLiteral(node: ts.Node): ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null {
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
        return node
    }

    let found: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression | null = null
    ts.forEachChild(node, child => {
        if (found) return
        const candidate = findFirstCollectionLiteral(child)
        if (candidate) found = candidate
    })
    return found
}

/**
 * 根据变量名定位目标集合字面量的替换区间。
 * @param sourceFile 已解析的 TypeScript 文件。
 * @param targetVar 变量名。
 * @returns 集合字面量在源文件中的区间。
 */
function findReplacementSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) continue
            const collectionNode =
                ts.isArrayLiteralExpression(declaration.initializer) || ts.isObjectLiteralExpression(declaration.initializer)
                    ? declaration.initializer
                    : findFirstCollectionLiteral(declaration.initializer)
            if (!collectionNode) throw new Error(`在 ${sourceFile.fileName} 中找不到 ${targetVar} 的数组或对象字面量`)
            return {
                start: collectionNode.getStart(sourceFile),
                end: collectionNode.getEnd(),
            }
        }
    }
    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 按 AST 区间从后往前替换多个初始化表达式，保留文件其余内容。
 * @param fileText 原始 TypeScript 源码。
 * @param replacements 替换区间和新文本。
 * @returns 更新后的 TypeScript 源码。
 */
function applyReplacements(fileText: string, replacements: Array<{ start: number; end: number; text: string }>): string {
    let result = fileText
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`
    }
    return result
}

/**
 * 执行一次性数据导出并写入格式化 TypeScript 模块。
 */
async function main(): Promise<void> {
    const { inputDir, outputFile } = parseArgs()
    const data = await buildExport(inputDir)
    const originalText = await readFile(outputFile, "utf8")

    const sourceFile = ts.createSourceFile(outputFile, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const values = [
        ["raceLotteryPlayers", data.players],
        ["raceLotteryMaxStakeData", data.maxStakes],
        ["raceLotteryOutsideBuffs", data.outsideBuffs],
        ["raceLotteryInsideBuffs", data.insideBuffs],
        ["raceLotteryConstants", data.constants],
        ["raceLotteryRewardRates", data.rewardRates],
        ["raceLotteryRumorFees", data.rumorFees],
    ] as const
    const replacements = values.map(([targetVar, value]) => {
        const span = findReplacementSpan(sourceFile, targetVar)
        return { ...span, text: formatTsValue(value) }
    })
    const nextText = applyReplacements(originalText, replacements)
    if (nextText !== originalText) await writeFile(outputFile, nextText, "utf8")
    console.log(`RaceLottery 数据已通过 AST 更新到 ${outputFile}`)
}

await main()
