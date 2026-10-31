/**
 * 节点图助手的装配层。
 *
 * 与配装助手共用同一套内核（`src/api/agent/kernel.ts`）与同一套上游凭证策略，
 * 差别只在工具集与提示词：
 *
 * 1. **代码执行**（首选）：一段沙箱脚本里读写节点图、查数据、跑求值，
 *    多步改动一次调用就完成，不必为每次改动来回一趟；
 * 2. **资料检索子集**：与配装同一口径（角色 / 武器 / 魔之楔 / 魔灵 / 怪物 / 伤害机制），
 *    剧情、版本新增这类与算伤害无关的一律不暴露。
 *
 * v1 不提供画布点击工具：图结构改动（增删节点与连线、改节点数据）全部走 `graph`
 * 接口完成，覆盖了工具栏能做的事；视图缩放、框选这类纯视图操作留给用户。
 */

import type { AgentUpstreamConfig } from "@/api/agent/config"
import { AgentKernel } from "@/api/agent/kernel"
import { getAgentSkillRegistry } from "@/api/agent/skills/registry"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import { createRunGraphCodeTool } from "@/api/agent/tools/graph-code"
import { DB_RETRIEVAL_PROFILES } from "@/api/agent/tools/retrieval-modules"
import { createSkillTools } from "@/api/agent/tools/skill-files"
import { renderGraphAgentSystemPrompt } from "@/shared/graphAgentSystemPrompt"
import { renderSkillPromptSection } from "@/shared/skill-prompt"
import { agentToolLabel } from "@/utils/agent-chat"
import type { AskUserRequest } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { isRagEnabled } from "@/utils/rag/enabled"

/**
 * 允许的最大工具轮数。
 *
 * 与配装助手同预算：搭图天然比纯检索多轮（读图 → 加节点 → 连线 → 求值复核），
 * 但仍必须有上限：超过之后不再执行新工具，模型会收到「额度已用尽」的结果并被要求收尾。
 */
const MAX_TOOL_ROUNDS = 40

/** 单次回答触达输出上限后允许自动续写的次数 */
const MAX_CONTINUATIONS = 3

/**
 * @description 装配节点图助手：把工具集、提示词与挂起问答绑定进通用内核。
 * @param config 上游配置（含输出上限等设置页偏好，可缺省；缺省时只给空密钥，真正的拦截在内核 run() 里提示）
 * @returns 可直接驱动的通用 Agent 内核
 */
export function createGraphAgent(config: Partial<AgentUpstreamConfig> = {}): AgentKernel<AskUserRequest> {
    /**
     * 组装本轮的工具集：run_code 排在最前（模型先想到「写一段代码一次做完」，而不是逐个操作）。
     * 技能工具面跟随服务端下发的技能清单，没有技能时不声明（提示词侧同步整段省略）。
     *
     * 检索走 build profile：节点图算的也是配装伤害，「角色 + 武器 + 魔之楔 + 魔灵 + 敌人 + 伤害机制」
     * 之外用不上，暴露出来只会让模型在检索面上铺开浪费轮次。
     */
    function buildTools() {
        return [
            createRunGraphCodeTool(),
            ...createDbRetrievalTools<AskUserRequest>({
                ...DB_RETRIEVAL_PROFILES.build,
                ragEnabled: isRagEnabled(),
            }),
            ...(getAgentSkillRegistry().isAvailable() ? createSkillTools<AskUserRequest>() : []),
        ]
    }

    return new AgentKernel<AskUserRequest>({
        name: "GraphAgent",
        config,
        tools: buildTools,
        systemPrompt: () => renderGraphAgentSystemPrompt({ ragEnabled: isRagEnabled() }),
        // 技能清单走 meta_user 前缀消息（system-reminder 包裹），不进系统提示词本体
        metaUserPrefix: () => renderSkillPromptSection(getAgentSkillRegistry().getPromptSkills()),
        maxToolRounds: MAX_TOOL_ROUNDS,
        maxContinuations: MAX_CONTINUATIONS,
        label: agentToolLabel,
        formatAnswer: formatAskUserResponse as (request: AskUserRequest, answer: unknown) => string,
        hasAnswer: hasAskAnswer as (request: AskUserRequest, answer: unknown) => boolean,
    })
}
