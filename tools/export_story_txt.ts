import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import charData from "../src/data/d/char.data"
import modData from "../src/data/d/mod.data"
import { npcMap } from "../src/data/d/npc.data"
import { partyTopicData, type PartyTopic } from "../src/data/d/partytopic.data"
import { questChainData } from "../src/data/d/questchain.data"
import { questData, type Dialogue, type DialogueOption, type QuestItem, type QuestNode, type QuestStory } from "../src/data/d/quest.data"
import weaponData from "../src/data/d/weapon.data"
import type { Char, Mod, Weapon } from "../src/data/data-types"
import { LeveledMod } from "../src/data/leveled/LeveledMod"
import { type LeveledSkillField, LeveledSkill } from "../src/data/leveled/LeveledSkill"
import { LeveledWeapon } from "../src/data/leveled/LeveledWeapon"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments } from "../src/utils/story-text"

interface DialogueChainItem {
    dialogue: Dialogue
    selectedOption?: DialogueOption
}

interface QuestNodeWithChain extends QuestNode {
    chain: DialogueChainItem[]
}

const OUTPUT_DIR = resolve("src/data/txt")
const QUEST_OUTPUT_PATH = resolve(OUTPUT_DIR, "quest.txt")
const PARTY_TOPIC_OUTPUT_PATH = resolve(OUTPUT_DIR, "partytopic.txt")
const CHAR_OUTPUT_PATH = resolve(OUTPUT_DIR, "char.txt")
const WEAPON_OUTPUT_PATH = resolve(OUTPUT_DIR, "weapon.txt")
const MOD_OUTPUT_PATH = resolve(OUTPUT_DIR, "mod.txt")

const questChainById = new Map(questChainData.map(questChain => [questChain.id, questChain]))
const ROOT_INDEX_NAME = ["一", "二", "三", "四", "五", "六"] as const
const MOD_QUALITY_PRIORITY = ["金", "紫", "蓝", "绿", "白"] as const

/**
 * 将剧情文本转换为纯文本，复用页面中的占位符替换与标记解析逻辑。
 * @param text 原始剧情文本
 * @returns 纯文本
 */
function toPlainStoryText(text: string | undefined): string {
    if (!text) {
        return ""
    }

    return parseStoryTextSegments(text, DEFAULT_STORY_TEXT_CONFIG)
        .map(segment => segment.text)
        .join("")
        .replace(/\r\n/g, "\n")
        .replace(/\n+/g, " ")
        .trim()
}

const PLAIN_NUMBER_PROP_SET = new Set([
    "有效生命",
    "基础攻击",
    "基础生命",
    "基础护盾",
    "基础防御",
    "攻击范围",
    "固定攻击",
    "神智回复",
    "异常数量",
    "神智消耗",
    "最大耐受",
    "基础装填",
    "基础弹匣",
    "弹匣",
    "装填",
    "连击持续时间",
    "子弹爆炸范围",
])
const PLAIN_SKILL_FIELD_NAME_REGEX = /神智消耗|神智回复$/

/**
 * 将数值格式化为紧凑字符串（自动移除无意义尾零）。
 * @param value 数值
 * @param digits 小数位
 * @returns 格式化结果
 */
function formatFixedNumber(value: number, digits = 2): string {
    return `${+value.toFixed(digits)}`
}

/**
 * 将小数格式化为百分比文本。
 * @param value 小数值
 * @param digits 小数位
 * @returns 百分比文本
 */
function formatPercent(value: number, digits = 1): string {
    return `${formatFixedNumber(value * 100, digits)}%`
}

/**
 * 将小数格式化为带符号百分比文本。
 * @param value 小数值
 * @param digits 小数位
 * @returns 带符号百分比文本
 */
function formatSignedPercent(value: number, digits = 1): string {
    const body = formatFixedNumber(value * 100, digits)
    return `${value >= 0 ? "+" : ""}${body}%`
}

/**
 * 格式化通用属性值，规则与界面展示保持一致。
 * @param prop 属性名
 * @param value 属性值
 * @returns 格式化文本
 */
function formatPropertyValue(prop: string, value: number): string {
    if (PLAIN_NUMBER_PROP_SET.has(prop)) {
        return value > 0 && !prop.startsWith("基础") ? `+${formatFixedNumber(value, 2)}` : formatFixedNumber(value, 2)
    }

    return prop.startsWith("基础") ? formatPercent(value, 1) : formatSignedPercent(value, 1)
}

/**
 * 按技能字段格式渲染字段值。
 * @param field 技能字段
 * @returns 字段显示文本
 */
function formatSkillFieldValue(field: LeveledSkillField): string {
    if (field.格式) {
        let placeholderCount = 0
        return field.格式.replace(/\{%?\}|\{\}/g, token => {
            const useSecondValue = placeholderCount % 2 === 1
            placeholderCount += 1
            const targetValue = useSecondValue ? field.值2 || 0 : field.值
            return token.includes("%") ? formatPercent(targetValue, 2) : formatFixedNumber(targetValue, 2)
        })
    }

    return PLAIN_SKILL_FIELD_NAME_REGEX.test(field.名称) ? formatFixedNumber(field.值, 1) : formatPercent(field.值, 2)
}

/**
 * 获取导出用说话人名称。
 * @param npcId NPC ID
 * @returns 说话人名称
 */
function getSpeakerName(npcId: number | undefined): string {
    if (npcId === undefined) {
        return "旁白"
    }

    const rawName = npcMap.get(npcId)?.name || `${npcId}`
    return toPlainStoryText(rawName)
}

/**
 * 将单条对话格式化为“说话人: 文本”。
 * @param dialogue 对话条目
 * @returns 文本行
 */
function formatDialogueLine(dialogue: Dialogue): string {
    const speaker = getSpeakerName(dialogue.npc)
    const content = toPlainStoryText(dialogue.content)
    return `${speaker}: ${content}`
}

/**
 * 读取默认分支选项（与页面渲染规则一致：默认第一项）。
 * @param dialogue 对话条目
 * @returns 默认选项
 */
function getSelectedOption(dialogue: Dialogue): DialogueOption | undefined {
    if (!dialogue.options?.length) {
        return undefined
    }

    return dialogue.options[0]
}

/**
 * 从指定起点拼接对话链，并避免循环引用。
 * @param startId 起始对话 ID
 * @param dialogueMap 对话映射
 * @param visitedIds 已访问 ID 集合
 * @param chain 输出链路
 */
function appendDialogueChain(
    startId: number,
    dialogueMap: Map<number, Dialogue>,
    visitedIds: Set<number>,
    chain: DialogueChainItem[]
): void {
    let currentId: number | undefined = startId

    while (currentId !== undefined && !visitedIds.has(currentId)) {
        const dialogue = dialogueMap.get(currentId)
        if (!dialogue) {
            break
        }

        visitedIds.add(currentId)
        const selectedOption = getSelectedOption(dialogue)
        chain.push({ dialogue, selectedOption })

        if (dialogue.options?.length) {
            currentId = selectedOption?.next
            continue
        }

        currentId = dialogue.next
    }
}

/**
 * 根据默认分支构建可展示对话链。
 * @param dialogues 原始对话数组
 * @returns 对话链
 */
function buildDialogueChain(dialogues: Dialogue[]): DialogueChainItem[] {
    if (!dialogues.length) {
        return []
    }

    const dialogueMap = new Map<number, Dialogue>()
    const incomingIds = new Set<number>()

    for (const dialogue of dialogues) {
        dialogueMap.set(dialogue.id, dialogue)

        if (dialogue.next !== undefined) {
            incomingIds.add(dialogue.next)
        }

        for (const option of dialogue.options ?? []) {
            if (option.next !== undefined) {
                incomingIds.add(option.next)
            }
        }
    }

    const startDialogues = dialogues.filter(dialogue => !incomingIds.has(dialogue.id))
    const startIds = (startDialogues.length > 0 ? startDialogues : [dialogues[0]]).map(dialogue => dialogue.id)
    const visitedIds = new Set<number>()
    const chain: DialogueChainItem[] = []

    for (const startId of startIds) {
        appendDialogueChain(startId, dialogueMap, visitedIds, chain)
    }

    return chain
}

/**
 * 按节点跳转关系构建任务节点展示顺序。
 * @param nodes 节点数组
 * @param startIds 起始节点 ID
 * @returns 排序后的节点链
 */
function buildQuestNodeChains(nodes: QuestNode[], startIds?: string[]): QuestNodeWithChain[] {
    const nodeMap = new Map<string, QuestNodeWithChain>()
    for (const node of nodes) {
        nodeMap.set(node.id, {
            ...node,
            chain: buildDialogueChain(node.dialogues ?? []),
        })
    }

    const incomingNodeIdSet = new Set<string>()
    for (const node of nodeMap.values()) {
        for (const nextNodeId of node.next ?? []) {
            if (nodeMap.has(nextNodeId)) {
                incomingNodeIdSet.add(nextNodeId)
            }
        }
    }

    const orderedNodeIds: string[] = []
    const visitedNodeIdSet = new Set<string>()

    /**
     * 沿着 next 关系深度优先遍历，确保顺序与页面一致并防止循环。
     * @param nodeId 当前节点 ID
     */
    function visitNodeByNext(nodeId: string): void {
        if (visitedNodeIdSet.has(nodeId)) {
            return
        }

        const currentNode = nodeMap.get(nodeId)
        if (!currentNode) {
            return
        }

        visitedNodeIdSet.add(nodeId)
        orderedNodeIds.push(nodeId)

        for (const nextNodeId of currentNode.next ?? []) {
            visitNodeByNext(nextNodeId)
        }
    }

    const explicitStartNodeIds = (startIds ?? []).filter(startId => nodeMap.has(startId))
    const fallbackStartNodeIds = nodes.filter(node => !incomingNodeIdSet.has(node.id)).map(node => node.id)
    const initialNodeIds = explicitStartNodeIds.length
        ? explicitStartNodeIds
        : fallbackStartNodeIds.length
          ? fallbackStartNodeIds
          : nodes.map(node => node.id)

    for (const startNodeId of initialNodeIds) {
        visitNodeByNext(startNodeId)
    }

    for (const node of nodes) {
        visitNodeByNext(node.id)
    }

    return orderedNodeIds.map(nodeId => nodeMap.get(nodeId)).filter((node): node is QuestNodeWithChain => !!node)
}

/**
 * 提取任务内全部剧情文本行。
 * @param quest 任务数据
 * @returns 剧情行
 */
function extractQuestDialogueLines(quest: QuestItem): string[] {
    const lines: string[] = []
    const orderedNodes = buildQuestNodeChains(quest.nodes ?? [], quest.startIds)

    for (const node of orderedNodes) {
        for (const chainItem of node.chain) {
            lines.push(formatDialogueLine(chainItem.dialogue))
        }
    }

    return lines
}

/**
 * 按任务链配置排序任务；若存在未配置任务则追加到末尾。
 * @param questStory 任务剧情组
 * @returns 排序后的任务数组
 */
function sortQuestItemsByChain(questStory: QuestStory): QuestItem[] {
    const questMap = new Map<number, QuestItem>(questStory.quests.map(quest => [quest.id, quest]))
    const orderedQuests: QuestItem[] = []
    const chainConfig = questChainById.get(questStory.id)

    for (const quest of chainConfig?.quests ?? []) {
        const questItem = questMap.get(quest.id)
        if (!questItem) {
            continue
        }

        orderedQuests.push(questItem)
        questMap.delete(quest.id)
    }

    for (const questItem of questStory.quests) {
        if (!questMap.has(questItem.id)) {
            continue
        }

        orderedQuests.push(questItem)
        questMap.delete(questItem.id)
    }

    return orderedQuests
}

/**
 * 构建单个任务文本段落。
 * @param questStory 任务剧情组
 * @param quest 任务数据
 * @returns 段落文本；无剧情时返回 null
 */
function buildQuestParagraph(questStory: QuestStory, quest: QuestItem): string | null {
    const taskName = toPlainStoryText(questChainById.get(questStory.id)?.name) || `${questStory.id}`
    const chapterName = toPlainStoryText(quest.name) || `${quest.id}`
    const summary = toPlainStoryText(quest.desc)
    const dialogueLines = extractQuestDialogueLines(quest)
    if (!dialogueLines.length) {
        return null
    }

    const lines = [`任务: ${taskName}`, `章节: ${chapterName}`, `简介: ${summary}`, "剧情:"]
    lines.push(...dialogueLines)
    return lines.join("\n")
}

/**
 * 生成 quest.txt 内容。
 * @returns 文本内容
 */
function buildQuestTxt(): string {
    const paragraphs: string[] = []

    for (const questStory of questData) {
        const orderedQuests = sortQuestItemsByChain(questStory)
        for (const quest of orderedQuests) {
            const paragraph = buildQuestParagraph(questStory, quest)
            if (paragraph) {
                paragraphs.push(paragraph)
            }
        }
    }

    if (!paragraphs.length) {
        return ""
    }

    return `${paragraphs.join("\n\n")}\n`
}

/**
 * 提取光阴集剧情文本行。
 * @param partyTopic 光阴集数据
 * @returns 剧情行
 */
function extractPartyTopicDialogueLines(partyTopic: PartyTopic): string[] {
    return buildDialogueChain(partyTopic.dialogues ?? []).map(chainItem => formatDialogueLine(chainItem.dialogue))
}

/**
 * 构建单个光阴集文本段落。
 * @param partyTopic 光阴集数据
 * @returns 段落文本；无剧情时返回 null
 */
function buildPartyTopicParagraph(partyTopic: PartyTopic): string | null {
    const title = toPlainStoryText(partyTopic.name)
    const summary = toPlainStoryText(partyTopic.desc)
    const memoryName = toPlainStoryText(partyTopic.memoryName)
    const memoryDesc = toPlainStoryText(partyTopic.memoryDesc)
    const dialogueLines = extractPartyTopicDialogueLines(partyTopic)
    if (!dialogueLines.length) {
        return null
    }

    const lines = [`光阴集: ${title}`, `简介: ${summary}`, `记忆: ${memoryName}`, `记忆简介: ${memoryDesc}`, "剧情:"]
    lines.push(...dialogueLines)
    return lines.join("\n")
}

/**
 * 生成 partytopic.txt 内容。
 * @returns 文本内容
 */
function buildPartyTopicTxt(): string {
    const paragraphs = partyTopicData
        .map(partyTopic => buildPartyTopicParagraph(partyTopic))
        .filter((paragraph): paragraph is string => !!paragraph)
    if (!paragraphs.length) {
        return ""
    }

    return `${paragraphs.join("\n\n")}\n`
}

/**
 * 生成角色根源标签文本。
 * @param index 根源索引
 * @returns 标签文本
 */
function getRootLabel(index: number): string {
    return `第${ROOT_INDEX_NAME[index] || index + 1}根源`
}

/**
 * 构建单个角色文本段落。
 * @param char 角色数据
 * @returns 段落文本
 */
function buildCharParagraph(char: Char): string {
    const lines: string[] = []
    lines.push(`角色: ${toPlainStoryText(char.名称)}`)
    lines.push(`属性: ${toPlainStoryText(char.属性)}`)

    if (char.别名) {
        lines.push(`别称: ${toPlainStoryText(char.别名)}`)
    }
    if (char.出生地) {
        lines.push(`出生地: ${toPlainStoryText(char.出生地)}`)
    }
    if (char.势力) {
        lines.push(`势力: ${toPlainStoryText(char.势力)}`)
    }
    if (char.生日) {
        lines.push(`生日: ${toPlainStoryText(char.生日)}`)
    }

    for (const [index, trace] of (char.溯源 ?? []).entries()) {
        lines.push(`${getRootLabel(index)}: ${toPlainStoryText(trace)}`)
    }

    for (const [index, skill] of char.技能.entries()) {
        const leveledSkill = new LeveledSkill(skill, 12)
        lines.push(`技能${index + 1}: ${toPlainStoryText(skill.名称)}`)
        lines.push(`类型: ${toPlainStoryText(skill.类型)}`)
        lines.push(`技能描述: ${toPlainStoryText(skill.描述)}`)

        for (const field of leveledSkill.getFieldsWithAttr()) {
            const valueText = formatSkillFieldValue(field)
            const attrText = field.影响 ? ` (${field.影响})` : ""
            lines.push(`${toPlainStoryText(field.名称)}: ${valueText}${attrText}`)
        }
    }

    return lines.join("\n")
}

/**
 * 生成 char.txt 内容。
 * @returns 文本内容
 */
function buildCharTxt(): string {
    const paragraphs = charData.map(char => buildCharParagraph(char))
    if (!paragraphs.length) {
        return ""
    }

    return `${paragraphs.join("\n\n")}\n`
}

/**
 * 构建单个武器文本段落。
 * @param weapon 武器数据
 * @returns 段落文本
 */
function buildWeaponParagraph(weapon: Weapon): string {
    const lines: string[] = []
    const leveledWeapon = new LeveledWeapon(weapon, 5, 80)
    const refineDesc = weapon.熔炼?.[5] ?? weapon.熔炼?.[weapon.熔炼.length - 1]

    lines.push(`武器: ${toPlainStoryText(weapon.名称)}`)
    lines.push(`简介: ${toPlainStoryText(weapon.描述)}`)
    lines.push(`攻击: ${formatFixedNumber(leveledWeapon.基础攻击, 2)}`)
    lines.push(`暴击率: ${formatPercent(weapon.暴击, 2)}`)
    lines.push(`暴击伤害: ${formatPercent(weapon.暴伤, 2)}`)
    lines.push(`触发概率: ${formatPercent(weapon.触发, 2)}`)

    if (refineDesc) {
        lines.push(`属性: ${toPlainStoryText(refineDesc)}`)
    }

    return lines.join("\n")
}

/**
 * 生成 weapon.txt 内容。
 * @returns 文本内容
 */
function buildWeaponTxt(): string {
    const paragraphs = weaponData.map(weapon => buildWeaponParagraph(weapon))
    if (!paragraphs.length) {
        return ""
    }

    return `${paragraphs.join("\n\n")}\n`
}

interface ModExportGroup {
    key: string
    mods: Mod[]
}

/**
 * 生成魔之楔分组键（跨品质合并）。
 * @param mod 魔之楔数据
 * @returns 分组键
 */
function getModGroupKey(mod: Mod): string {
    return [mod.系列, mod.名称, mod.类型, mod.属性 || "", mod.极性 || "", mod.限定 || ""].join("|")
}

/**
 * 获取魔之楔品质排序值（越小优先级越高）。
 * @param quality 品质
 * @returns 排序值
 */
function getModQualityRank(quality: string): number {
    const index = MOD_QUALITY_PRIORITY.indexOf(quality as (typeof MOD_QUALITY_PRIORITY)[number])
    return index === -1 ? MOD_QUALITY_PRIORITY.length : index
}

/**
 * 构建魔之楔类型展示文本。
 * @param mod 魔之楔数据
 * @returns 类型文本
 */
function buildModTypeText(mod: Mod): string {
    const segments = [toPlainStoryText(mod.类型)]
    if (mod.属性) {
        segments.push(`${toPlainStoryText(mod.属性)}属性`)
    }
    if (mod.限定) {
        segments.push(toPlainStoryText(mod.限定))
    }

    return segments.join("/")
}

/**
 * 按“系列+名称+类型+属性+极性+限定”分组魔之楔。
 * @returns 分组结果
 */
function groupModsByIdentity(): ModExportGroup[] {
    const groupMap = new Map<string, Mod[]>()
    for (const mod of modData) {
        const key = getModGroupKey(mod)
        const group = groupMap.get(key)
        if (group) {
            group.push(mod)
            continue
        }

        groupMap.set(key, [mod])
    }

    return [...groupMap.entries()].map(([key, mods]) => ({ key, mods }))
}

/**
 * 构建单个魔之楔文本段落。
 * @param group 魔之楔分组
 * @returns 段落文本
 */
function buildModParagraph(group: ModExportGroup): string {
    const sortedMods = [...group.mods].sort((left, right) => getModQualityRank(left.品质) - getModQualityRank(right.品质))
    const leveledMods = sortedMods.map(mod => new LeveledMod(mod))
    const primaryMod = leveledMods[0]
    const qualities = [...new Set(leveledMods.map(mod => mod.品质))]
    const lines: string[] = []

    lines.push(`魔之楔: ${toPlainStoryText(primaryMod.系列)}之${toPlainStoryText(primaryMod.名称)}`)
    lines.push(`类型: ${buildModTypeText(primaryMod)}`)
    lines.push(`耐受: ${leveledMods.map(mod => `${mod.耐受}(${mod.品质})`).join(" ")}`)
    if (primaryMod.极性) {
        lines.push(`趋向: ${primaryMod.极性}`)
    }
    lines.push(`系列: ${toPlainStoryText(primaryMod.系列)}`)
    lines.push(`品质: ${qualities.join("/")}`)
    if (primaryMod.效果) {
        lines.push(`效果: ${toPlainStoryText(primaryMod.效果)}`)
    }

    for (const [propName, propValue] of Object.entries(primaryMod.getProperties())) {
        if (typeof propValue !== "number" || !Number.isFinite(propValue) || propValue === 0) {
            continue
        }

        lines.push(`${propName}: ${formatPropertyValue(propName, propValue)}`)
    }

    return lines.join("\n")
}

/**
 * 生成 mod.txt 内容。
 * @returns 文本内容
 */
function buildModTxt(): string {
    const paragraphs = groupModsByIdentity().map(group => buildModParagraph(group))
    if (!paragraphs.length) {
        return ""
    }

    return `${paragraphs.join("\n\n")}\n`
}

/**
 * 写入文本文件，自动创建父级目录。
 * @param filePath 文件路径
 * @param content 文件内容
 */
function writeTextFile(filePath: string, content: string): void {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, "utf8")
}

/**
 * 执行剧情文本导出。
 */
function main(): void {
    writeTextFile(QUEST_OUTPUT_PATH, buildQuestTxt())
    writeTextFile(PARTY_TOPIC_OUTPUT_PATH, buildPartyTopicTxt())
    writeTextFile(CHAR_OUTPUT_PATH, buildCharTxt())
    writeTextFile(WEAPON_OUTPUT_PATH, buildWeaponTxt())
    writeTextFile(MOD_OUTPUT_PATH, buildModTxt())
    console.log(`已导出: ${QUEST_OUTPUT_PATH}`)
    console.log(`已导出: ${PARTY_TOPIC_OUTPUT_PATH}`)
    console.log(`已导出: ${CHAR_OUTPUT_PATH}`)
    console.log(`已导出: ${WEAPON_OUTPUT_PATH}`)
    console.log(`已导出: ${MOD_OUTPUT_PATH}`)
}

main()
