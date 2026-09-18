import { describe, expect, it } from "vitest"
import type { AskUserRequest } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer, normalizeAskUserRequest, summarizeAskUserRequest } from "@/utils/db-ask-user"

/**
 * 「向用户提问」的纯逻辑用例：模型参数的归一化与回答的回填。
 *
 * 只覆盖 utils 层，不碰 Agent 循环——循环需要真实网络与 OpenAI 客户端，
 * 放在这里会让测试依赖外部服务。
 */

/** 构造一份标准提问，供回填类用例复用 */
function makeRequest(): AskUserRequest {
    return {
        id: "ask_1",
        title: "需要确认范围",
        questions: [
            {
                id: "type",
                header: "要查哪一类剧情？",
                question: "剧情分主线、支线等类型",
                options: [
                    { id: "main", label: "主线任务" },
                    { id: "side", label: "支线任务" },
                ],
                allowCustom: true,
                multiple: false,
            },
            {
                id: "chapter",
                header: "哪个篇章？",
                options: [
                    { id: "night", label: "夜航篇", description: "第一章" },
                    { id: "dusk", label: "泊暮篇" },
                ],
                allowCustom: true,
                multiple: true,
            },
        ],
    }
}

describe("normalizeAskUserRequest", () => {
    it("归一化标准结构", () => {
        const request = normalizeAskUserRequest({
            id: "ask_1",
            title: "需要确认",
            questions: [{ id: "type", header: "哪一类？", options: [{ id: "a", label: "主线" }] }],
        })

        expect(request).not.toBeNull()
        expect(request!.id).toBe("ask_1")
        expect(request!.title).toBe("需要确认")
        expect(request!.questions).toHaveLength(1)
        expect(request!.questions[0]!.options[0]!.label).toBe("主线")
    })

    it("选项写成纯字符串数组时自动补 id", () => {
        const request = normalizeAskUserRequest({
            questions: [{ header: "哪一类？", options: ["主线任务", "支线任务"] }],
        })

        expect(request!.questions[0]!.options.map(option => option.label)).toEqual(["主线任务", "支线任务"])
        expect(request!.questions[0]!.options.map(option => option.id)).toEqual(["opt_1", "opt_2"])
    })

    it("questions 传成 JSON 字符串时也能解析", () => {
        const request = normalizeAskUserRequest({
            questions: JSON.stringify([{ header: "哪一类？", options: ["主线"] }]),
        })

        expect(request!.questions).toHaveLength(1)
    })

    it("顶层就是单道题时自动包成数组", () => {
        const request = normalizeAskUserRequest({ header: "要查哪一类？", options: ["主线", "支线"] })

        expect(request!.questions).toHaveLength(1)
        expect(request!.questions[0]!.header).toBe("要查哪一类？")
    })

    it("题干缺失时用 question / label 兜底，都没有则生成占位题干", () => {
        const withQuestion = normalizeAskUserRequest({ questions: [{ question: "补充说明", options: ["主线"] }] })
        expect(withQuestion!.questions[0]!.header).toBe("补充说明")

        const withPlaceholder = normalizeAskUserRequest({ questions: [{ options: ["主线"] }] })
        expect(withPlaceholder!.questions[0]!.header).toBe("问题 1")
    })

    it("allowCustom 默认开启，显式 false 才关闭", () => {
        const request = normalizeAskUserRequest({
            questions: [
                { header: "A", options: ["x"] },
                { header: "B", options: ["y"], allowCustom: false },
            ],
        })

        expect(request!.questions[0]!.allowCustom).toBe(true)
        expect(request!.questions[1]!.allowCustom).toBe(false)
    })

    it("multiple 只有显式 true 才开启", () => {
        const request = normalizeAskUserRequest({
            questions: [
                { header: "A", options: ["x"] },
                { header: "B", options: ["y"], multiple: true },
            ],
        })

        expect(request!.questions[0]!.multiple).toBe(false)
        expect(request!.questions[1]!.multiple).toBe(true)
    })

    it("题目与选项数量会被裁到上限", () => {
        const questions = Array.from({ length: 9 }, (_, index) => ({
            header: `题 ${index}`,
            options: Array.from({ length: 12 }, (_, opt) => `选项 ${opt}`),
        }))

        const request = normalizeAskUserRequest({ questions })

        expect(request!.questions).toHaveLength(5)
        expect(request!.questions[0]!.options).toHaveLength(8)
    })

    it("超长题干会被截断", () => {
        const request = normalizeAskUserRequest({ questions: [{ header: "很".repeat(300), options: ["x"] }] })

        expect(request!.questions[0]!.header.length).toBeLessThanOrEqual(121)
        expect(request!.questions[0]!.header.endsWith("…")).toBe(true)
    })

    it("丢弃既无题干又无选项的题", () => {
        const request = normalizeAskUserRequest({
            questions: [
                { header: "", options: [] },
                { header: "有效题", options: ["x"] },
            ],
        })

        expect(request!.questions).toHaveLength(1)
        expect(request!.questions[0]!.header).toBe("有效题")
    })

    it("全部题都无效时返回 null", () => {
        expect(normalizeAskUserRequest({ questions: [{ header: "", options: [] }] })).toBeNull()
        expect(normalizeAskUserRequest({})).toBeNull()
        expect(normalizeAskUserRequest(null)).toBeNull()
        expect(normalizeAskUserRequest("not json")).toBeNull()
    })

    it("题面缺少 header 与 options 时，若顶层本身就是题也能识别", () => {
        // 顶层只有 options、没有 header：走「单题包装」分支，靠选项保住这道题
        const request = normalizeAskUserRequest({ options: ["主线任务"] })

        expect(request!.questions).toHaveLength(1)
        expect(request!.questions[0]!.options).toHaveLength(1)
    })
})

describe("formatAskUserResponse", () => {
    it("把选项 id 还原成文案", () => {
        const text = formatAskUserResponse(makeRequest(), {
            requestId: "ask_1",
            answers: [{ questionId: "type", optionIds: ["main"] }],
        })

        expect(text).toContain("主线任务")
        expect(text).toContain("要查哪一类剧情？")
    })

    it("多选题把多个选项用分号连接", () => {
        const text = formatAskUserResponse(makeRequest(), {
            requestId: "ask_1",
            answers: [{ questionId: "chapter", optionIds: ["night", "dusk"] }],
        })

        expect(text).toContain("夜航篇；泊暮篇")
    })

    it("自由输入会标注为「用户补充」", () => {
        const text = formatAskUserResponse(makeRequest(), {
            requestId: "ask_1",
            answers: [{ questionId: "type", optionIds: [], custom: "我想看活动剧情" }],
        })

        expect(text).toContain("用户补充：我想看活动剧情")
    })

    it("选项与自由输入可以同时存在", () => {
        const text = formatAskUserResponse(makeRequest(), {
            requestId: "ask_1",
            answers: [{ questionId: "type", optionIds: ["side"], custom: "最好是带印象检定的" }],
        })

        expect(text).toContain("支线任务")
        expect(text).toContain("用户补充：最好是带印象检定的")
    })

    it("跳过时明确告知模型用户没给信息", () => {
        const text = formatAskUserResponse(makeRequest(), { requestId: "ask_1", answers: [], skipped: true })

        expect(text).toContain("跳过了这次提问")
    })

    it("一道题都没答时提示模型不要重复提问", () => {
        const text = formatAskUserResponse(makeRequest(), { requestId: "ask_1", answers: [] })

        expect(text).toContain("不要重复提问")
    })

    it("只回答案了的题，未作答的题不出现在回填里", () => {
        const text = formatAskUserResponse(makeRequest(), {
            requestId: "ask_1",
            answers: [{ questionId: "type", optionIds: ["main"] }],
        })

        expect(text).not.toContain("哪个篇章")
    })
})

describe("hasAskAnswer", () => {
    it("选中了选项即算有作答", () => {
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [{ questionId: "type", optionIds: ["main"] }] })).toBe(true)
    })

    it("只填了自由输入也算有作答", () => {
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [{ questionId: "type", optionIds: [], custom: "活动" }] })).toBe(
            true
        )
    })

    it("什么都没选也没填时不算作答", () => {
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [{ questionId: "type", optionIds: [] }] })).toBe(false)
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [] })).toBe(false)
    })

    it("选项 id 不属于该题时不算作答", () => {
        // chapter 的 night 拿去答 type 题：题与选项不匹配，视为无效
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [{ questionId: "type", optionIds: ["night"] }] })).toBe(false)
    })

    it("跳过本身视为一种有效结果（模型要能继续）", () => {
        expect(hasAskAnswer(makeRequest(), { requestId: "ask_1", answers: [], skipped: true })).toBe(true)
    })
})

describe("summarizeAskUserRequest", () => {
    it("单题时给出题干", () => {
        const request = normalizeAskUserRequest({ questions: [{ header: "要查哪一类剧情？", options: ["主线", "支线"] }] })

        expect(summarizeAskUserRequest(request!)).toBe("等待选择：要查哪一类剧情？")
    })

    it("多题时给出题目数量", () => {
        expect(summarizeAskUserRequest(makeRequest())).toBe("2 个问题待选择")
    })
})
