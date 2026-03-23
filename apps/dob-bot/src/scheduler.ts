import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"
import { logDob } from "./log.ts"
import { callStructuredResponses } from "./openai-responses.ts"

export const SchedulerBriefSchema = z.object({
    kind: z.enum(["code_change", "review_followup", "clarification_needed"]),
    objective: z.string(),
    constraints: z.array(z.string()).default([]),
    file_hints: z.array(z.string()).default([]),
    clarification_question: z.string().nullable().optional(),
})

export type SchedulerBrief = z.infer<typeof SchedulerBriefSchema>

export type SchedulerConfig = {
    apiKey: string
    baseUrl: string
    model: string
    fallbackModel: string
    temperature: number
    maxTokens: number
}

/**
 * 用 Responses API 把自然语言整理成代码任务摘要。
 * @param {SchedulerConfig} config
 * @param {string} issueTitle
 * @param {string} issueBody
 * @param {string} instruction
 * @returns {Promise<SchedulerBrief>}
 */
export async function buildSchedulerBrief(
    config: SchedulerConfig,
    issueTitle: string,
    issueBody: string,
    instruction: string
): Promise<SchedulerBrief> {
    return await invokeWithFallback(config, issueTitle, issueBody, instruction, [config.model, config.fallbackModel].filter(Boolean))
}

/**
 * 带 fallback 的调度层调用。
 * @param {SchedulerConfig} config
 * @param {string} issueTitle
 * @param {string} issueBody
 * @param {string} instruction
 * @param {string[]} models
 * @returns {Promise<SchedulerBrief>}
 */
async function invokeWithFallback(
    config: SchedulerConfig,
    issueTitle: string,
    issueBody: string,
    instruction: string,
    models: string[]
): Promise<SchedulerBrief> {
    let lastError: unknown = null
    for (const modelName of models) {
        try {
            logDob("scheduler.try_model", {
                model: modelName,
                issueTitle,
                instruction,
            })
            const brief = await callStructuredResponses(
                {
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    model: modelName,
                    temperature: config.temperature,
                    maxOutputTokens: config.maxTokens,
                    debugLabel: "scheduler",
                },
                new SystemMessage(
                    [
                        "你是 dob-bot 的调度层。",
                        "你的职责是把 issue / 评论里的自然语言整理成一个简洁、可执行的代码任务摘要。",
                        "不要输出代码，不要给出补丁，不要猜测具体文件内容。",
                        "如果任务明显是代码修改，kind 选 code_change。",
                        "如果任务是回应 review，kind 选 review_followup。",
                        "如果信息不足以开始改代码，kind 选 clarification_needed；objective 填你对任务的简短理解，constraints 和 file_hints 用空数组，clarification_question 填一个简短问题。",
                    ].join("\n")
                ),
                new HumanMessage(
                    [
                        `Issue 标题: ${issueTitle}`,
                        `Issue 正文: ${issueBody}`,
                        `@dob-bot 后面的指令: ${instruction}`,
                        "请输出一个简洁摘要，给后续 codex 执行层使用。",
                    ].join("\n\n")
                ),
                SchedulerBriefSchema,
                "dob_bot_scheduler_brief"
            )
            logDob("scheduler.result", {
                model: modelName,
                brief,
            })
            return {
                ...brief,
                clarification_question: brief.clarification_question?.trim() ? brief.clarification_question : null,
            }
        } catch (error) {
            lastError = error
            logDob("scheduler.error", {
                model: modelName,
                error: error instanceof Error ? error.message : String(error),
            })
            console.error(`scheduler 模型 ${modelName} 失败，尝试 fallback...`, error)
        }
    }

    throw lastError instanceof Error ? lastError : new Error("scheduler 调用失败")
}
