import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"
import { callStructuredResponses } from "./openai-responses.ts"

export const PlannerDecisionSchema = z.object({
    action: z.enum(["direct_reply", "code_change"]),
    reply: z.string().default(""),
    objective: z.string().default(""),
    constraints: z.array(z.string()).default([]),
    file_hints: z.array(z.string()).default([]),
})

export type PlannerDecision = z.infer<typeof PlannerDecisionSchema>

export type PlannerConfig = {
    apiKey: string
    baseUrl: string
    model: string
    fallbackModel: string
    temperature: number
    maxTokens: number
}

/**
 * 决定请求是直接回复还是进入代码修改流程。
 * @param {PlannerConfig} config
 * @param {string} issueTitle
 * @param {string} issueBody
 * @param {string} instruction
 * @param {string} issueUrl
 * @returns {Promise<PlannerDecision>}
 */
export async function buildPlannerDecision(
    config: PlannerConfig,
    issueTitle: string,
    issueBody: string,
    instruction: string,
    issueUrl: string
): Promise<PlannerDecision> {
    let lastError: unknown = null
    for (const modelName of [config.model, config.fallbackModel].filter(Boolean)) {
        try {
            return await callStructuredResponses(
                {
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    model: modelName,
                    temperature: config.temperature,
                    maxOutputTokens: config.maxTokens,
                    debugLabel: "planner",
                },
                new SystemMessage(
                    [
                        "你是 dob-bot 的 planner。",
                        "你只做一件事：判断当前 @dob-bot 请求是否需要真的修改代码或做调试。",
                        "如果请求只是问答、解释、状态确认、配置说明，action 选 direct_reply，并给出 reply。",
                        "如果请求要求修改代码、调试代码、修复 bug、实现功能、提 PR，action 选 code_change。",
                        "当 action=code_change 时，reply 置空，并给出精炼 objective、constraints、file_hints。",
                        "不要输出代码，不要输出 patch。",
                    ].join("\n")
                ),
                new HumanMessage(
                    [
                        `Issue 链接: ${issueUrl}`,
                        `Issue 标题: ${issueTitle}`,
                        `Issue 正文/上下文: ${issueBody}`,
                        `@dob-bot 指令: ${instruction}`,
                    ].join("\n\n")
                ),
                PlannerDecisionSchema,
                "dob_bot_planner_decision"
            )
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error ? lastError : new Error("planner 调用失败")
}
