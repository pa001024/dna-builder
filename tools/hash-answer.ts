#!/usr/bin/env bun
/**
 * hash-answer.ts — 用 bcrypt 加密安全模式题目答案，生成可写入题目库的哈希串。
 *
 * 前端不存储明文答案，只保存 bcrypt 哈希；答题时用 bcryptjs.compare 校验对错。
 * 因此新增/修改题目时，先运行本工具把答案哈希出来，再粘贴到
 * src/data/safe-mode-questions.ts 的 answerHash 字段。
 *
 * 用法:
 *   bun tools/hash-answer.ts "42"                    # 哈希答案，默认 10 轮
 *   bun tools/hash-answer.ts -r 12 "42"              # 指定加密轮数
 *   bun tools/hash-answer.ts --check "<hash>" "42"   # 校验答案是否匹配某哈希（返回 true/false）
 *
 * 注意: bcrypt 只使用密码前 72 字节；轮数越高越安全但校验越慢，默认 10 轮即可。
 */
import { compare, hash } from "bcryptjs"

const args = process.argv.slice(2)

/** 解析命令行参数 */
function parseArgs(raw: string[]): { rounds: number; check: boolean; answer: string; hashValue?: string } {
    let rounds = 10
    let check = false
    let hashValue: string | undefined
    const rest: string[] = []

    for (let i = 0; i < raw.length; i++) {
        const arg = raw[i]
        if (arg === "-r" || arg === "--rounds") {
            const value = Number(raw[++i])
            if (!Number.isInteger(value) || value < 4 || value > 31) {
                throw new Error(`非法轮数: ${raw[i]}（应为 4~31 的整数）`)
            }
            rounds = value
        } else if (arg === "--check") {
            check = true
            hashValue = raw[++i]
        } else {
            rest.push(arg)
        }
    }

    if (rest.length === 0) {
        throw new Error("缺少答案参数")
    }
    return { rounds, check, answer: rest[0], hashValue }
}

/** 主入口：生成哈希或校验匹配 */
async function main() {
    try {
        const { rounds, check, answer, hashValue } = parseArgs(args)
        if (check) {
            if (!hashValue) {
                throw new Error("--check 模式需要提供哈希参数")
            }
            const matched = await compare(answer, hashValue)
            console.log(matched ? "true" : "false")
            process.exit(matched ? 0 : 1)
        }
        const result = await hash(answer, rounds)
        console.log(result)
    } catch (error) {
        console.error(`[hash-answer] 错误: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
    }
}

await main()
