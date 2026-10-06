import type { Dialogue, DialogueOption, QuestNode } from "@/data/d/quest.data"

/**
 * 对话链条目：对话节点与按当前分支选中的选项。
 *
 * 任务剧情（DBQuestStoryNodes）与光阴集（DBPartyTopicDetailItem）共用的链路结构，
 * 阅读模式的对话正文也按此顺序展开。
 */
export interface DialogueChainItem {
    dialogue: Dialogue
    selectedOption?: DialogueOption
}

/**
 * 对话分支选择器：返回该对话当前应走的选项。
 * 无分支对话返回 undefined；按默认分支走时返回第一个选项。
 */
export type DialogueOptionSelector = (dialogue: Dialogue) => DialogueOption | undefined

/**
 * 递归收集对话及其嵌套选项，建立可查询映射。
 * @param dialogue 当前对话节点
 * @param dialogueMap 对话映射
 * @param incomingIds 入边节点集合
 */
function collectDialogueNode(dialogue: Dialogue, dialogueMap: Map<number, Dialogue>, incomingIds: Set<number>): void {
    dialogueMap.set(dialogue.id, dialogue)

    if (dialogue.next !== undefined) {
        incomingIds.add(dialogue.next)
    }

    for (const option of dialogue.options ?? []) {
        collectDialogueOption(option, dialogueMap, incomingIds)
    }
}

/**
 * 递归收集嵌套选项节点。
 * @param option 对话选项
 * @param dialogueMap 对话映射
 * @param incomingIds 入边节点集合
 */
function collectDialogueOption(option: DialogueOption, dialogueMap: Map<number, Dialogue>, incomingIds: Set<number>): void {
    dialogueMap.set(option.id, option)
    incomingIds.add(option.id)

    if (option.next !== undefined) {
        incomingIds.add(option.next)
    }

    for (const childOption of option.options ?? []) {
        collectDialogueOption(childOption, dialogueMap, incomingIds)
    }
}

/**
 * 从指定起点串接对话链，并防止循环引用导致死循环。
 * @param startId 起始对话 ID
 * @param dialogueMap 对话映射
 * @param visitedIds 已访问对话集合
 * @param chain 输出链路
 * @param selectOption 分支选择器
 */
function appendDialogueChain(
    startId: number,
    dialogueMap: Map<number, Dialogue>,
    visitedIds: Set<number>,
    chain: DialogueChainItem[],
    selectOption: DialogueOptionSelector
): void {
    let currentId: number | undefined = startId

    while (currentId !== undefined && !visitedIds.has(currentId)) {
        const dialogue = dialogueMap.get(currentId)
        if (!dialogue) {
            break
        }

        visitedIds.add(currentId)
        const selectedOption = selectOption(dialogue)
        chain.push({ dialogue, selectedOption })

        if (dialogue.options?.length) {
            currentId = selectedOption?.next
            continue
        }

        currentId = dialogue.next
    }
}

/**
 * 根据分支选择器把无入边的起点串接成可展示对话链。
 * @param dialogues 原始对话数组
 * @param selectOption 分支选择器，缺省时按第一个选项走
 * @returns 对话链
 */
export function buildDialogueChain(
    dialogues: Dialogue[],
    selectOption: DialogueOptionSelector = dialogue => dialogue.options?.[0]
): DialogueChainItem[] {
    if (!dialogues.length) {
        return []
    }

    const dialogueMap = new Map<number, Dialogue>()
    const incomingIds = new Set<number>()

    for (const dialogue of dialogues) {
        collectDialogueNode(dialogue, dialogueMap, incomingIds)
    }

    const startDialogues = dialogues.filter(dialogue => !incomingIds.has(dialogue.id))
    const startIds = (startDialogues.length > 0 ? startDialogues : [dialogues[0]]).map(dialogue => dialogue.id)

    const visitedIds = new Set<number>()
    const chain: DialogueChainItem[] = []
    for (const startId of startIds) {
        appendDialogueChain(startId, dialogueMap, visitedIds, chain, selectOption)
    }

    return chain
}

/**
 * 按 next 关系深度优先整理任务节点展示顺序，并用 visited 防止循环引用。
 *
 * 起点优先级：显式 startIds → 无入边节点 → 数据原序；
 * 未被 next 链覆盖到的节点按数据原序追加在末尾。
 * @param nodes 任务节点数组
 * @param startIds 显式起始节点 ID 列表
 * @returns 展示顺序的节点数组
 */
export function orderQuestNodes(nodes: QuestNode[], startIds?: string[]): QuestNode[] {
    const nodeMap = new Map<string, QuestNode>()
    for (const node of nodes) {
        nodeMap.set(node.id, node)
    }

    const incomingNodeIdSet = new Set<string>()
    for (const node of nodes) {
        for (const nextNodeId of node.next ?? []) {
            if (nodeMap.has(nextNodeId)) {
                incomingNodeIdSet.add(nextNodeId)
            }
        }
    }

    const orderedNodes: QuestNode[] = []
    const visitedNodeIdSet = new Set<string>()

    function visitNodeByNext(nodeId: string): void {
        if (visitedNodeIdSet.has(nodeId)) {
            return
        }

        const currentNode = nodeMap.get(nodeId)
        if (!currentNode) {
            return
        }

        visitedNodeIdSet.add(nodeId)
        orderedNodes.push(currentNode)

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

    return orderedNodes
}
