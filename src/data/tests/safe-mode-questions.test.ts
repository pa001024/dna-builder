import { hash } from "bcryptjs"
import { describe, expect, it } from "vitest"
import type { SafeModeQuestion } from "../safe-mode-questions"
import { checkSafeModeAnswers, pickSafeModeQuestions, SAFE_MODE_QUESTIONS, SAFE_MODE_REQUIRED_COUNT } from "../safe-mode-questions"

/** bcrypt 哈希串格式（$2a/$2b/$2x/$2y + 轮数 + 53 字符盐与校验和） */
const BCRYPT_HASH_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/

describe("SAFE_MODE_QUESTIONS 题目库", () => {
    it("至少包含 SAFE_MODE_REQUIRED_COUNT 道题", () => {
        expect(SAFE_MODE_QUESTIONS.length).toBeGreaterThanOrEqual(SAFE_MODE_REQUIRED_COUNT)
    })

    it("每道题的 answerHash 都是合法 bcrypt 哈希串（不含明文答案）", () => {
        for (const question of SAFE_MODE_QUESTIONS) {
            expect(question.answerHash, question.question).toMatch(BCRYPT_HASH_RE)
        }
    })

    it("选择题必须提供至少 2 个互不重复的候选项", () => {
        for (const question of SAFE_MODE_QUESTIONS) {
            if (question.kind !== "choice") continue
            expect(question.options.length, question.question).toBeGreaterThanOrEqual(2)
            expect(new Set(question.options).size, question.question).toBe(question.options.length)
        }
    })
})

describe("pickSafeModeQuestions 随机抽题", () => {
    it("抽取数量与请求一致且不重复", () => {
        const picked = pickSafeModeQuestions(SAFE_MODE_REQUIRED_COUNT)
        expect(picked).toHaveLength(SAFE_MODE_REQUIRED_COUNT)
        expect(new Set(picked).size).toBe(SAFE_MODE_REQUIRED_COUNT)
        for (const question of picked) {
            expect(SAFE_MODE_QUESTIONS).toContain(question)
        }
    })

    it("抽取数量超过题库时返回全部题目", () => {
        const picked = pickSafeModeQuestions(SAFE_MODE_QUESTIONS.length + 5)
        expect(picked).toHaveLength(SAFE_MODE_QUESTIONS.length)
    })
})

describe("checkSafeModeAnswers 对错校验", () => {
    it("全部答对时返回 true", async () => {
        const questions: SafeModeQuestion[] = [
            { kind: "choice", question: "q1", options: ["a", "b"], answerHash: await hash("b", 4) },
            { kind: "text", question: "q2", answerHash: await hash("unlock", 4) },
        ]
        expect(await checkSafeModeAnswers(questions, ["b", "unlock"])).toBe(true)
    })

    it("任一题答错时返回 false", async () => {
        const questions: SafeModeQuestion[] = [
            { kind: "choice", question: "q1", options: ["a", "b"], answerHash: await hash("b", 4) },
            { kind: "text", question: "q2", answerHash: await hash("unlock", 4) },
        ]
        expect(await checkSafeModeAnswers(questions, ["a", "unlock"])).toBe(false)
    })

    it("回答数量与题目数量不一致时返回 false", async () => {
        const questions: SafeModeQuestion[] = [{ kind: "choice", question: "q1", options: ["a", "b"], answerHash: await hash("b", 4) }]
        expect(await checkSafeModeAnswers(questions, [])).toBe(false)
        expect(await checkSafeModeAnswers([], [])).toBe(false)
    })
})
