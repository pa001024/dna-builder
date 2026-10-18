/**
 * 安全模式校验题目库。
 *
 * 题目答案不存明文，只保存 bcrypt 哈希（由 tools/hash-answer.ts 生成）。
 * 前端只做"对/错"校验：答题后把用户回答与对应 answerHash 用 bcryptjs.compare 比对，
 * 从源码层面避免答案明文直接暴露。修改题目或新增答案时，先运行：
 *   bun tools/hash-answer.ts "答案文本"
 * 再把输出的哈希粘贴到对应 answerHash 字段。
 *
 * 抽取规则固定为：2 道选择题（kind: "choice"）+ 1 道填空题（kind: "text"）。
 * 通用题保留填空形式；与游戏内容相关的题（角色属性/标签/别名/阵营/生日/精通/
 * 基础属性，数据源自游戏英文本地化 DuetNightAbyssData2/final/i18n/en/Char.json）
 * 全部采用choice模式。
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

/** 每次抽取的选择题数量 */
export const SAFE_MODE_CHOICE_COUNT = 2
/** 每次抽取的填空题数量 */
export const SAFE_MODE_TEXT_COUNT = 1
/** 关闭安全模式需要答对的最少题数（2 选择 + 1 填空） */
export const SAFE_MODE_REQUIRED_COUNT = SAFE_MODE_CHOICE_COUNT + SAFE_MODE_TEXT_COUNT

/** 安全模式校验题目库（含 bcrypt 哈希答案） */
export const SAFE_MODE_QUESTIONS: SafeModeQuestion[] = [
    // ---- 通用填空题 ----
    {
        kind: "text",
        question: "What is the ultimate answer to the universe?",
        answerHash: "$2b$10$jJna/SrFGANWqkFtQiAlXOo1U4CfablzpjZKCJtpoyYdpGotH7tBO",
    },
    {
        kind: "text",
        question: "What time do daily tasks refresh every day? (1-digit number)",
        answerHash: "$2b$10$R4rz0FFpMULg2kvtNQIRB.TFAiWDDsyil4Z2O0Ma5eF1Sxz5LBPJm",
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
        kind: "text",
        question: "What is the name of this application? (3 uppercase letters)",
        answerHash: "$2b$10$Hve9dmqh0wzorpn0SCd41OydJ995JJcMkbhu54MEV4ex64jYR4C3C",
    },
    {
        kind: "text",
        question: "What is the opposite of 'up'?",
        answerHash: "$2b$10$mhZwb2K2uiC3i4mwqOLew.AO7zYWRJhh1tGrNGYQV23UxGRGdSvH2",
    },
    {
        kind: "text",
        question: "How many types of character elements are there in this game?",
        answerHash: "$2b$10$kHJbztFTHBR23z0oBTRKPe0lWwH0bplozuKcuQNcSFzcakWfXQOwG",
    },
    // ---- 游戏元素英文名填空题（6 种元素各一题）----
    {
        kind: "text",
        question: "What is the name of the Dark element in the game?",
        answerHash: "$2b$10$0jCbCdMoy..WKZG7j2ZKuuMvvh6f2ZXj1cjycRYCkAJuufwvPYm3y",
    },
    {
        kind: "text",
        question: "What is the name of the Light element in the game?",
        answerHash: "$2b$10$EE9OMrQUgRGvLzZ/YEVhqubIpSQGDhCJVMf.9bTnbRzF27y3FVzIm",
    },
    {
        kind: "text",
        question: "What is the name of the Water element in the game?",
        answerHash: "$2b$10$kScHrujoQVr8onev2RXddu2UpUVV.dSBN.sCyaRvOQDskcmhgogMO",
    },
    {
        kind: "text",
        question: "What is the name of the Fire element in the game?",
        answerHash: "$2b$10$DPoCzUMQPWTYIPW5EeQt5.yr6J1OhDks6bE0u.0lyal7naEro/zaW",
    },
    {
        kind: "text",
        question: "What is the name of the Thunder element in the game?",
        answerHash: "$2b$10$wtUQR2Br.LYC9VnM5tBQpeNUfAQrMM9ZVVZUKjGnbqT4feL1xPXsO",
    },
    {
        kind: "text",
        question: "What is the name of the Wind element in the game?",
        answerHash: "$2b$10$kWJ09AvaH6fM2bJWB5x6wOanEMGbvUAmxZKKQs141sWH2XYg9nYQ2",
    },
    // ---- 通用选择题 ----
    {
        kind: "choice",
        question: "What is the game server opening date? (8-digit number)",
        options: ["20241106", "20251028", "20251231", "20260101"],
        answerHash: "$2b$10$/wExqQCq/kSyEq/84JEVo.n6ZhtkK7BfGEnMYwZf3vyymyBBp7dhi",
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
    // ---- 游戏内容题（选择提示模式）：角色属性 ----
    {
        kind: "choice",
        question: "Which element does Lisbell belong to?",
        options: ["Lumino", "Umbro", "Pyro", "Electro"],
        answerHash: "$2b$10$EE9OMrQUgRGvLzZ/YEVhqubIpSQGDhCJVMf.9bTnbRzF27y3FVzIm",
    },
    {
        kind: "choice",
        question: "What is the element of Rebecca?",
        options: ["Hydro", "Pyro", "Anemo", "Umbro"],
        answerHash: "$2b$10$kScHrujoQVr8onev2RXddu2UpUVV.dSBN.sCyaRvOQDskcmhgogMO",
    },
    {
        kind: "choice",
        question: "What is the element of Hellfire?",
        options: ["Pyro", "Hydro", "Umbro", "Electro"],
        answerHash: "$2b$10$DPoCzUMQPWTYIPW5EeQt5.yr6J1OhDks6bE0u.0lyal7naEro/zaW",
    },
    {
        kind: "choice",
        question: "What is the element of Yuming?",
        options: ["Electro", "Pyro", "Hydro", "Lumino"],
        answerHash: "$2b$10$wtUQR2Br.LYC9VnM5tBQpeNUfAQrMM9ZVVZUKjGnbqT4feL1xPXsO",
    },
    {
        kind: "choice",
        question: "Which element does Kezhou belong to?",
        options: ["Lumino", "Umbro", "Anemo", "Electro"],
        answerHash: "$2b$10$EE9OMrQUgRGvLzZ/YEVhqubIpSQGDhCJVMf.9bTnbRzF27y3FVzIm",
    },
    {
        kind: "choice",
        question: "Which element does Flora belong to?",
        options: ["Umbro", "Lumino", "Pyro", "Hydro"],
        answerHash: "$2b$10$0jCbCdMoy..WKZG7j2ZKuuMvvh6f2ZXj1cjycRYCkAJuufwvPYm3y",
    },
    {
        kind: "choice",
        question: "Which element does Psyche belong to?",
        options: ["Anemo", "Umbro", "Electro", "Lumino"],
        answerHash: "$2b$10$kWJ09AvaH6fM2bJWB5x6wOanEMGbvUAmxZKKQs141sWH2XYg9nYQ2",
    },
    {
        kind: "choice",
        question: "Which element does Truffle and Filbert belong to?",
        options: ["Anemo", "Hydro", "Lumino", "Pyro"],
        answerHash: "$2b$10$kWJ09AvaH6fM2bJWB5x6wOanEMGbvUAmxZKKQs141sWH2XYg9nYQ2",
    },
    // ---- 游戏内容题（选择提示模式）：角色标签 ----
    {
        kind: "choice",
        question: "Which of these characters has the 'Healing' tag?",
        options: ["Fushu", "Randy", "Sibylle", "Margie"],
        answerHash: "$2b$10$8eCK6vNBgeadZbkY6gQPtOB0qyentDCBjKig5UhjUGCLHKRCxn3ai",
    },
    {
        kind: "choice",
        question: "Which character has the 'Shielding' tag?",
        options: ["Randy", "Fushu", "Sibylle", "Tabethe"],
        answerHash: "$2b$10$N2kPiIJYz58VgPkRA3xvL.K0dok38OD17PHBRRU/eviMetaj8Jj22",
    },
    {
        kind: "choice",
        question: "Which of these characters has the 'Summon' tag?",
        options: ["Rebecca", "Fina", "Hilda", "Margie"],
        answerHash: "$2b$10$9aid8aUVEXqhid2Jn43UwOz1AgyHGA9wgaQ4TLGLWP0Xho39HBCRe",
    },
    {
        kind: "choice",
        question: "Which character has the 'DEF' tag?",
        options: ["Randy", "Fushu", "Sibylle", "Tabethe"],
        answerHash: "$2b$10$N2kPiIJYz58VgPkRA3xvL.K0dok38OD17PHBRRU/eviMetaj8Jj22",
    },
    {
        kind: "choice",
        question: "Which of these characters has the 'Consonance Weapon' tag?",
        options: ["Lynn", "Rebecca", "Eve", "Yuming"],
        answerHash: "$2b$10$qL7gJ9TDSQNVd4wh77QDS.PtwJkJO4/oIBb6lruBuLX9kXCBmRWc6",
    },
    {
        kind: "choice",
        question: "Which of these characters has the 'Max HP' tag?",
        options: ["Hellfire", "Rebecca", "Eve", "Yuming"],
        answerHash: "$2b$10$2HKJpf4VVYu3/uUUeGfdGO0XGI40KfTQMfv9/Z1wC3eodIn6rkJ8q",
    },
    {
        kind: "choice",
        question: "Which of these characters has the 'Crowd Control' tag?",
        options: ["Margie", "Fushu", "Randy", "Sibylle"],
        answerHash: "$2b$10$nUpbyJni5pew0i6rAjKk6eiACibCxF.OTUARZ6Bh9qfxwC9Vfx9JS",
    },
    {
        kind: "choice",
        question: "Which character has the 'Sanity Recovery' tag?",
        options: ["Fushu", "Tabethe", "Sibylle", "Margie"],
        answerHash: "$2b$10$8eCK6vNBgeadZbkY6gQPtOB0qyentDCBjKig5UhjUGCLHKRCxn3ai",
    },
    // ---- 游戏内容题（选择提示模式）：角色别名 ----
    {
        kind: "choice",
        question: "Which character has the alias 'The Stranger'?",
        options: ["Outsider", "Psyche", "Daphne", "Kezhou"],
        answerHash: "$2b$10$DUP67xKWdROtnykDL.ohROoak6Xb8uSkw3yw1pDZ4b2w.lt52B2iu",
    },
    {
        kind: "choice",
        question: "What is the alias of Lisbell?",
        options: ["Patience·Petulance", "Aurelia Affinity", "Scarlet Nectar", "Grace in Pluvia"],
        answerHash: "$2b$10$eX3OnJ.c4nbRsvCXciyAKelzguuD1MXogr3BCYoFe4FhKCHqqOqG.",
    },
    {
        kind: "choice",
        question: "Which character has the alias 'The Expectant Future'?",
        options: ["Berenica", "Flora", "Phantasio", "Lisbell"],
        answerHash: "$2b$10$iDt4rcLea/NiuJCDUycIFOC23S/dm0600KdiBqjro4CFvp5CpSf2C",
    },
    {
        kind: "choice",
        question: "Which character has the alias 'Scarlet Nectar'?",
        options: ["Camilla", "Margie", "Hilda", "Falsi"],
        answerHash: "$2b$10$wqG4p3/Lr3gdCJk4oze4IeTqeto7HLTsjBad5.BSItmzr0piFaJT6",
    },
    {
        kind: "choice",
        question: "Which character has the alias 'The Jackdaw'?",
        options: ["Sibylle", "Randy", "Zhiliu", "Yuming"],
        answerHash: "$2b$10$tHIR.509Punmz4/fYvXLNOTWfcazv33zcCplb4XAqoJqgICLYF6Hm",
    },
    {
        kind: "choice",
        question: "Which character has the alias 'Grace in Pluvia'?",
        options: ["Daphne", "Sibylle", "Psyche", "Fushu"],
        answerHash: "$2b$10$rm/barqHvo3n.Lo4AxGqke7SQLHsaly9hru4xIr0f0nHO40r7LVhe",
    },
    {
        kind: "choice",
        question: "Which character has the alias 'The Lone Bunny of Paradise'?",
        options: ["Eve", "Rebecca", "Tabethe", "Fushu"],
        answerHash: "$2b$10$oBgQuAFxDu4T9aqFWLlrwOhBcI44kQY3z9iejlmGaIXmbrRH8Vr4S",
    },
    // ---- 游戏内容题（选择提示模式）：角色阵营 ----
    {
        kind: "choice",
        question: "Which faction does Kezhou belong to?",
        options: ["Huaxu", "The Elysian Church", "The Noctoyagers", "Republic of Luca"],
        answerHash: "$2b$10$lrkGaAwTjxT/k1eNg9NJceypOt1E90O0Tn0MMZXP0K27VUldGvHmO",
    },
    {
        kind: "choice",
        question: "Which of these characters belongs to the Noctoyagers faction?",
        options: ["Berenica", "Flora", "Lisbell", "Yuming"],
        answerHash: "$2b$10$iDt4rcLea/NiuJCDUycIFOC23S/dm0600KdiBqjro4CFvp5CpSf2C",
    },
    {
        kind: "choice",
        question: "Which of these characters belongs to The Hyperborean Empire?",
        options: ["Flora", "Lisbell", "Kezhou", "Rebecca"],
        answerHash: "$2b$10$yR6uUVerKfo1NGzCXpO23.SMfbIJXLNE0Rx06gD8KJrKTm4eW725e",
    },
    {
        kind: "choice",
        question: "Which of these characters belongs to The Elysian Church?",
        options: ["Lisbell", "Kezhou", "Su Yi", "Yuming"],
        answerHash: "$2b$10$VVQ8NOlXiov0Bacnu4c8rer4.f4oEx85M4SVUHADkUcBU/XEK2tgG",
    },
    {
        kind: "choice",
        question: "Which of these characters belongs to the Republic of Luca?",
        options: ["Rebecca", "Fina", "Hilda", "Margie"],
        answerHash: "$2b$10$9aid8aUVEXqhid2Jn43UwOz1AgyHGA9wgaQ4TLGLWP0Xho39HBCRe",
    },
    // ---- 游戏内容题（选择提示模式）：角色生日 ----
    {
        kind: "choice",
        question: "Which character's birthday is 08-08?",
        options: ["Lisbell", "Eve", "Yuming", "Berenica"],
        answerHash: "$2b$10$VVQ8NOlXiov0Bacnu4c8rer4.f4oEx85M4SVUHADkUcBU/XEK2tgG",
    },
    {
        kind: "choice",
        question: "What is the birthday of Lisbell? (MM-DD)",
        options: ["08-08", "04-02", "11-11", "01-01"],
        answerHash: "$2b$10$SoDKLLX37KljDF5FVJu2Gue2OuWkffsBjJhHjVWn7Ejz6bY8/Quum",
    },
    {
        kind: "choice",
        question: "What is the birthday of Fina? (MM-DD)",
        options: ["04-02", "08-08", "09-06", "03-20"],
        answerHash: "$2b$10$5Eu7Qs8BJeG21.9OPqU8J.l2KPfxsPVN90YOb4WYnnqkv0wR9jHni",
    },
    {
        kind: "choice",
        question: "What is the birthday of Yuming? (MM-DD)",
        options: ["11-11", "08-08", "03-20", "12-19"],
        answerHash: "$2b$10$AVry.me3AjpEOlmAhwAjNObPPWcXJlZruCdsGNVfYUtswKGaRBJyO",
    },
    {
        kind: "choice",
        question: "Which character's birthday is 03-20?",
        options: ["Rebecca", "Eve", "Tabethe", "Fushu"],
        answerHash: "$2b$10$9aid8aUVEXqhid2Jn43UwOz1AgyHGA9wgaQ4TLGLWP0Xho39HBCRe",
    },
    {
        kind: "choice",
        question: "Which character's birthday is 09-06?",
        options: ["Eve", "Rebecca", "Tabethe", "Fushu"],
        answerHash: "$2b$10$oBgQuAFxDu4T9aqFWLlrwOhBcI44kQY3z9iejlmGaIXmbrRH8Vr4S",
    },
    {
        kind: "choice",
        question: "Which character's birthday is 01-01?",
        options: ["Berenica", "Flora", "Phantasio", "Lisbell"],
        answerHash: "$2b$10$iDt4rcLea/NiuJCDUycIFOC23S/dm0600KdiBqjro4CFvp5CpSf2C",
    },
    {
        kind: "choice",
        question: "Which character's birthday is 04-28?",
        options: ["Flora", "Berenica", "Phantasio", "Lisbell"],
        answerHash: "$2b$10$yR6uUVerKfo1NGzCXpO23.SMfbIJXLNE0Rx06gD8KJrKTm4eW725e",
    },
    // ---- 游戏内容题（选择提示模式）：角色精通武器 ----
    {
        kind: "choice",
        question: "Which character is proficient with a Katana?",
        options: ["Lady Nifle", "Rebecca", "Kezhou", "Su Yi"],
        answerHash: "$2b$10$eF8Oxsd8XSA7A5zNW5qDjePbLon3W0NQ45I8N//IcXOm4Ija.inqm",
    },
    {
        kind: "choice",
        question: "Which of these characters is proficient with a Whipblade?",
        options: ["Fushu", "Su Yi", "Lady Nifle", "Kezhou"],
        answerHash: "$2b$10$8eCK6vNBgeadZbkY6gQPtOB0qyentDCBjKig5UhjUGCLHKRCxn3ai",
    },
    {
        kind: "choice",
        question: "Which of these characters is proficient with a Greatsword?",
        options: ["Phantasio", "Berenica", "Rebecca", "Eve"],
        answerHash: "$2b$10$BX0PLBTraOGYM09.9UsHQebp4O56J.xFLevlOeWrirxT8Ne6rQMxu",
    },
    {
        kind: "choice",
        question: "Which character is proficient with all weapon types?",
        options: ["Kezhou", "Su Yi", "Fina", "Lisbell"],
        answerHash: "$2b$10$tQz9ZvkU8ICbVBR3pEx2BuVzUQ.flnpFuNfghQkC/XYNmSMTxAMya",
    },
    {
        kind: "choice",
        question: "Which of these characters is proficient with a Polearm?",
        options: ["Su Yi", "Kezhou", "Lisbell", "Randy"],
        answerHash: "$2b$10$oBIR/ok35PK4HENZ2CWmXedufMJq3DWx8qXvmhsCQjjstVjnljWVa",
    },
    // ---- 游戏内容题（选择提示模式）：角色基础属性 ----
    {
        kind: "choice",
        question: "What is the base DEF of Berenica?",
        options: ["300", "250", "350", "200"],
        answerHash: "$2b$10$AP097zO5AXyM0Yrw.Neg8.kkThBgmQSfCybxgIbDaoI0eqqauwbFq",
    },
    {
        kind: "choice",
        question: "What is the base ATK of Berenica?",
        options: ["20", "26", "30", "35"],
        answerHash: "$2b$10$lPKRfWqL4No8OY5lGYv8Newg8/zOuVbeiq.RS73v57fBRvyopl5D2",
    },
    {
        kind: "choice",
        question: "What is the base Sanity of Berenica?",
        options: ["150", "180", "200", "130"],
        answerHash: "$2b$10$WEPXFJ4dInzqO/wzRox7.eBQMd9ij96kIlNA/Lze9dNkvA3z1nXUS",
    },
]

/**
 * 从池中随机抽取指定数量的不重复元素。
 * @param pool 候选池
 * @param count 抽取数量
 * @returns 抽取到的元素数组
 */
function pickUnique<T>(pool: T[], count: number): T[] {
    const remaining = [...pool]
    const picked: T[] = []
    for (let i = 0; i < count && remaining.length > 0; i++) {
        const index = Math.floor(Math.random() * remaining.length)
        picked.push(remaining.splice(index, 1)[0])
    }
    return picked
}

/**
 * 按固定规则抽取安全模式校验题：2 道选择题 + 1 道填空题。
 * @param choiceCount 选择题抽取数量，默认 SAFE_MODE_CHOICE_COUNT
 * @param textCount 填空题抽取数量，默认 SAFE_MODE_TEXT_COUNT
 * @returns 抽取到的题目数组（选择题在前，填空题在后）
 */
export function pickSafeModeQuestions(
    choiceCount: number = SAFE_MODE_CHOICE_COUNT,
    textCount: number = SAFE_MODE_TEXT_COUNT
): SafeModeQuestion[] {
    const choicePool = SAFE_MODE_QUESTIONS.filter(question => question.kind === "choice")
    const textPool = SAFE_MODE_QUESTIONS.filter(question => question.kind === "text")
    return [...pickUnique(choicePool, choiceCount), ...pickUnique(textPool, textCount)]
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
