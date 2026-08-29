/**
 * 安全模式校验题目库。
 *
 * 题目答案不存明文，只保存 bcrypt 哈希（由 tools/hash-answer.ts 生成）。
 * 前端只做"对/错"校验：答题后把用户回答与对应 answerHash 用 bcryptjs.compare 比对，
 * 从源码层面避免答案明文直接暴露。修改题目或新增答案时，先运行：
 *   bun tools/hash-answer.ts "答案文本"
 * 再把输出的哈希粘贴到对应 answerHash 字段。
 */
import { compare } from "bcryptjs"

/** 安全模式校验题目：选择题（kind: "choice"） */
export interface SafeModeChoiceQuestion {
    kind: "choice"
    /** 题干 */
    question: string
    /** 候选项（选项文本即校验值，正确选项文本与 answerHash 对应） */
    options: string[]
    /** 正确选项文本的 bcrypt 哈希 */
    answerHash: string
}

/** 安全模式校验题目：填空题（kind: "text"） */
export interface SafeModeTextQuestion {
    kind: "text"
    /** 题干 */
    question: string
    /** 标准答案文本的 bcrypt 哈希 */
    answerHash: string
}

/** 安全模式校验题目联合类型 */
export type SafeModeQuestion = SafeModeChoiceQuestion | SafeModeTextQuestion

/** 关闭安全模式需要答对的最少题数 */
export const SAFE_MODE_REQUIRED_COUNT = 3

/** 安全模式校验题目库（含 bcrypt 哈希答案） */
export const SAFE_MODE_QUESTIONS: SafeModeQuestion[] = [
    {
        kind: "text",
        question: "What is the ultimate answer to the universe?",
        answerHash: "$2b$10$jJna/SrFGANWqkFtQiAlXOo1U4CfablzpjZKCJtpoyYdpGotH7tBO",
    },
    {
        kind: "choice",
        question: "What is the game server opening date? (8-digit number)",
        options: ["20241106", "20251028", "20251231", "20260101"],
        answerHash: "$2b$10$/wExqQCq/kSyEq/84JEVo.n6ZhtkK7BfGEnMYwZf3vyymyBBp7dhi",
    },
    {
        kind: "text",
        question: "What time do daily tasks refresh every day? (1-digit number)",
        answerHash: "$2b$10$R4rz0FFpMULg2kvtNQIRB.TFAiWDDsyil4Z2O0Ma5eF1Sxz5LBPJm",
    },
    {
        kind: "choice",
        question: "What color is the sky on a clear day?",
        options: ["Red", "Green", "Blue", "Yellow"],
        answerHash: "$2b$10$sYmiCCObJHV5/PwpilkuyOE3x2tjLB2ivNcKfVKxmp1ey38b7uYDi",
    },
    {
        kind: "choice",
        question: "What is the second day of the week in English?",
        options: ["Monday", "Tuesday", "Wednesday", "Thursday"],
        answerHash: "$2b$10$q65S67V2yQWYw9BWgiNeNu1FOTySTpkfvVTwj4KH7JvBfGfR1EYd6",
    },
    {
        kind: "choice",
        question: "What is the first month of the year?",
        options: ["December", "January", "February", "March"],
        answerHash: "$2b$10$0zUXG2vXZkjRSX.2vOroZ.SxyMFZouwEhqZRrXhzrZkL.f4ADLcGy",
    },
    {
        kind: "choice",
        question: "What is the color of a banana?",
        options: ["Red", "Yellow", "Blue", "Green"],
        answerHash: "$2b$10$PGK4m/Abz4QreSzskBwt0ebKEbDtGoUm6BnqHQCo29ov.cPWvHoaq",
    },
    {
        kind: "choice",
        question: "How many days are in a week?",
        options: ["5", "6", "7", "8"],
        answerHash: "$2b$10$QYkAeLJSMvPEX7zuoSydZuHLjUSi3WMJHWfVeZ7mFMycOHT5OMcUq",
    },
    {
        kind: "text",
        question: "Type the word 'unlock' backwards.",
        answerHash: "$2b$10$wP/c4ualFN1WI6KdtAGuuOVRIwRqRzWy7apVRf7R0h1y0BHGT5p.m",
    },
    {
        kind: "text",
        question: "What is the opposite of cold?",
        answerHash: "$2b$10$Kz8JadxYmwi40G1kdmULpu4DMLnP3awNNowlgXaeu51geUd9RkOM.",
    },
    {
        kind: "choice",
        question: "What is 7 × 8?",
        options: ["54", "56", "64", "72"],
        answerHash: "$2b$10$8uI0gsIV4I/C8vg5rthbDu2/4bt3bAUKvKHfs.om5v.uPMEgCozDi",
    },
    {
        kind: "choice",
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        answerHash: "$2b$10$efsNxV/TzeBWneThn3XMWeGxq/SaIhrFFGpMUHBNIpLYR8CB.OqL6",
    },
    {
        kind: "choice",
        question: "What is the largest ocean on Earth?",
        options: ["Atlantic", "Indian", "Pacific", "Arctic"],
        answerHash: "$2b$10$38aLG76Qmh1jxisGeV9nNOzW0B0bAQM9RXi24cWAAHXk0SdAFJ/qS",
    },
    {
        kind: "choice",
        question: "How many colors are in a rainbow?",
        options: ["5", "6", "7", "8"],
        answerHash: "$2b$10$jHlP/amBSMtaX4zxkFPyjOl6rAiQ/FhDoR.Np6EkuxYN/GitvmO3a",
    },
    {
        kind: "choice",
        question: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        answerHash: "$2b$10$Z8qYhGFSyEhh1K76lJoznunoKwSaVqDxf3I0Zm4w88GqqRmKtvn5u",
    },
    {
        kind: "choice",
        question: "Which element has the chemical symbol 'O'?",
        options: ["Gold", "Oxygen", "Iron", "Silver"],
        answerHash: "$2b$10$7gEH6ixdPW0ZIla5ZsSz0.mqMq/AS5wj9UuhF5MHjThQFdbf514QC",
    },
    {
        kind: "choice",
        question: "Which month comes right after September?",
        options: ["August", "October", "November", "December"],
        answerHash: "$2b$10$2j.LENpz2bCzl2shAQt9oezobRIhw7CzN45FPwqSqM8lRPp9XLWOu",
    },
    {
        kind: "choice",
        question: "How many legs does a spider have?",
        options: ["6", "7", "8", "10"],
        answerHash: "$2b$10$gd0baMntXlHBLoau3dV.We7YbF9YBPtopQBfSfiNW.hiIgKV.8FNu",
    },
    {
        kind: "choice",
        question: "Which of these numbers is a prime number?",
        options: ["4", "6", "7", "9"],
        answerHash: "$2b$10$1euKhEnILGqN2alVWPcHHejI0TId5uEe1u/iOuywU7G.s3uUDsyLe",
    },
    {
        kind: "choice",
        question: "What is the square of 9?",
        options: ["72", "81", "90", "99"],
        answerHash: "$2b$10$VDFRF0xIfKPk2mL4tCnM6eGla9oo8R19qbl1HgPJU612SkIDSMwXS",
    },
    {
        kind: "text",
        question: "Type the word 'dna' backwards.",
        answerHash: "$2b$10$4gaZRPqE9BG4ykZ.ORYP1uUyhZ.pEVDinplLXGzhPwkNd.C9Sn.mS",
    },
    {
        kind: "text",
        question: "What is the opposite of 'up'?",
        answerHash: "$2b$10$mhZwb2K2uiC3i4mwqOLew.AO7zYWRJhh1tGrNGYQV23UxGRGdSvH2",
    },
]

/**
 * 从题目库中随机抽取指定数量的不重复题目。
 * @param count 抽取数量
 * @returns 抽取到的题目数组
 */
export function pickSafeModeQuestions(count: number): SafeModeQuestion[] {
    const pool = [...SAFE_MODE_QUESTIONS]
    const picked: SafeModeQuestion[] = []
    for (let i = 0; i < count && pool.length > 0; i++) {
        const index = Math.floor(Math.random() * pool.length)
        picked.push(pool.splice(index, 1)[0])
    }
    return picked
}

/**
 * 校验用户的全部回答：逐一与对应题目的 bcrypt 哈希比对，仅返回是否全部正确。
 * @param questions 抽取出的题目列表（与 answers 一一对应）
 * @param answers 用户回答列表；选择题为选中选项文本，填空题为标准答案文本
 * @returns 是否全部回答正确
 */
export async function checkSafeModeAnswers(questions: SafeModeQuestion[], answers: string[]): Promise<boolean> {
    if (questions.length === 0 || questions.length !== answers.length) {
        return false
    }
    const results = await Promise.all(questions.map((question, index) => compare(answers[index] ?? "", question.answerHash)))
    return results.every(Boolean)
}
