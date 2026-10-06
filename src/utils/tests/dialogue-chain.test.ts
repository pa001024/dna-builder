import { describe, expect, it } from "vitest"
import type { Dialogue, DialogueOption, QuestNode } from "@/data/d/quest.data"
import { buildDialogueChain, orderQuestNodes } from "../dialogue-chain"

function dialogue(id: number, overrides: Partial<Dialogue> = {}): Dialogue {
    return { id, ...overrides }
}

function option(id: number, overrides: Partial<DialogueOption> = {}): DialogueOption {
    return { id, content: `选项${id}`, ...overrides }
}

describe("buildDialogueChain", () => {
    it("空数组返回空链", () => {
        expect(buildDialogueChain([])).toEqual([])
    })

    it("按 next 串接线性对话链", () => {
        const dialogues = [dialogue(3, { content: "丙" }), dialogue(1, { content: "甲", next: 2 }), dialogue(2, { content: "乙", next: 3 })]
        const chain = buildDialogueChain(dialogues)
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 2, 3])
    })

    it("分支对话默认走第一个选项", () => {
        const dialogues = [
            dialogue(1, { content: "甲", options: [option(11, { next: 2 }), option(12, { next: 3 })] }),
            dialogue(2, { content: "分支一" }),
            dialogue(3, { content: "分支二" }),
        ]
        const chain = buildDialogueChain(dialogues)
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 2])
        expect(chain[0].selectedOption?.id).toBe(11)
    })

    it("自定义选择器决定分支走向", () => {
        const dialogues = [
            dialogue(1, { content: "甲", options: [option(11, { next: 2 }), option(12, { next: 3 })] }),
            dialogue(2, { content: "分支一" }),
            dialogue(3, { content: "分支二" }),
        ]
        const chain = buildDialogueChain(dialogues, source => source.options?.find(item => item.id === 12))
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 3])
    })

    it("链中对话与选项不作为起点，嵌套选项同样计入入边", () => {
        const dialogues = [
            dialogue(30, { content: "被选项跳入的后续" }),
            dialogue(1, { content: "甲", options: [option(11, { next: 30, options: [option(111, { next: 2 })] })] }),
            dialogue(2, { content: "乙" }),
        ]
        const chain = buildDialogueChain(dialogues)
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 30])
    })

    it("循环引用不会死循环", () => {
        const dialogues = [dialogue(1, { content: "甲", next: 2 }), dialogue(2, { content: "乙", next: 1 })]
        const chain = buildDialogueChain(dialogues)
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 2])
    })

    it("无入边起点有多个时依次串接", () => {
        const dialogues = [dialogue(1, { content: "甲一" }), dialogue(2, { content: "甲二" })]
        const chain = buildDialogueChain(dialogues)
        expect(chain.map(item => item.dialogue.id)).toEqual([1, 2])
    })
})

describe("orderQuestNodes", () => {
    function node(id: string, overrides: Partial<QuestNode> = {}): QuestNode {
        return { id, type: "TalkNode", name: `节点${id}`, ...overrides }
    }

    it("空数组返回空列表", () => {
        expect(orderQuestNodes([])).toEqual([])
    })

    it("按 next 关系深度优先排序", () => {
        const nodes = [node("c"), node("a", { next: ["b"] }), node("b")]
        expect(orderQuestNodes(nodes).map(item => item.id)).toEqual(["c", "a", "b"])
    })

    it("显式 startIds 优先于无入边判定", () => {
        const nodes = [node("a"), node("b"), node("c", { next: ["b"] })]
        expect(orderQuestNodes(nodes, ["c"]).map(item => item.id)).toEqual(["c", "b", "a"])
    })

    it("startIds 中不存在的节点被忽略", () => {
        const nodes = [node("a"), node("b")]
        expect(orderQuestNodes(nodes, ["missing"]).map(item => item.id)).toEqual(["a", "b"])
    })

    it("循环引用不会死循环，未触达节点按原序追加", () => {
        const nodes = [node("a", { next: ["b"] }), node("b", { next: ["a"] }), node("c")]
        expect(orderQuestNodes(nodes).map(item => item.id)).toEqual(["c", "a", "b"])
    })
})
