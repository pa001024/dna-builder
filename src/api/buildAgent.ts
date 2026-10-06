/**
 * 配装 Agent 的装配层。
 *
 * 与资料检索 Agent 共用同一套内核（`src/api/agent/kernel.ts`）与同一套上游凭证策略，
 * 差别只在工具集与提示词：
 *
 * 1. **代码执行**（首选）：一段沙箱脚本里读写构筑、查数据、跑计算，
 *    多步改动一次调用就完成，不必为每次改动来回一趟；
 * 2. **UI 工具**（兜底）：读取配装页、点击控件、往输入框打字，用于接口层尚未覆盖的控件；
 * 3. **资料检索子集**：把资料库的角色 / 武器 / 魔之楔 / 魔灵 / 怪物 / 伤害机制检索带进来，
 *    剧情、版本新增这类与配装无关的一律不暴露。
 *
 * 早期版本还有一组「直接改配置」工具（setMod / setBuff / autoBuild 等），它们已全部
 * 收进沙箱接口的 `build` 对象：同样的能力用一次 run_code 就能批量完成，工具面也更窄。
 * 沙箱接口由宿主组件（AIChatDialog）通过 `setBuildApi` 注册，本文件不再持有任何宿主引用。
 */

import type { AgentUpstreamConfig } from "@/api/agent/config"
import { AgentKernel } from "@/api/agent/kernel"
import { getAgentSkillRegistry } from "@/api/agent/skills/registry"
import { createRunCodeTool } from "@/api/agent/tools/build-code"
import {
    createClickTool,
    createPressKeyTool,
    createReadPageTool,
    createScrollTool,
    createSelectOptionTool,
    createTypeTool,
} from "@/api/agent/tools/build-ui"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import { DB_RETRIEVAL_PROFILES } from "@/api/agent/tools/retrieval-modules"
import { createSkillTools } from "@/api/agent/tools/skill-files"
import { renderBuildAgentSystemPrompt } from "@/shared/buildAgentSystemPrompt"
import { renderSkillPromptSection } from "@/shared/skill-prompt"
import { agentToolLabel } from "@/utils/agent-chat"
import type { AskUserRequest } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { isRagEnabled } from "@/utils/rag/enabled"

/**
 * 允许的最大工具轮数。
 *
 * UI 操作天然比纯检索多轮（读 → 点 → 读 → 填），因此预算比资料检索更宽，
 * 但仍必须有上限：超过之后不再执行新工具，模型会收到「额度已用尽」的结果并被要求收尾。
 */
const MAX_TOOL_ROUNDS = 40

/** 单次回答触达输出上限后允许自动续写的次数 */
const MAX_CONTINUATIONS = 3

/**
 * @description 装配配装 Agent：把工具集、提示词与挂起问答绑定进通用内核。
 * @param config 上游配置（含输出上限等设置页偏好，可缺省；缺省时只给空密钥，真正的拦截在内核 run() 里提示）
 * @returns 可直接驱动的通用 Agent 内核
 */
export function createBuildAgent(config: Partial<AgentUpstreamConfig> = {}): AgentKernel<AskUserRequest> {
    /**
     * 组装本轮的工具集：run_code 排在最前（模型先想到「写一段代码一次做完」，而不是逐个控件去点）。
     * 技能工具面跟随服务端下发的技能清单，没有技能时不声明（提示词侧同步整段省略）。
     *
     * 检索子集走 build profile：配装只关心「角色 + 武器 + 魔之楔 + 魔灵 + 敌人 + 伤害机制」，
     * 其余模块（剧情、读物、钓鱼、NPC 等）即便被查到也用不上，暴露出来只会让模型在检索面上铺开浪费轮次。
     */
    function buildTools() {
        return [
            createRunCodeTool(),
            createReadPageTool(),
            createClickTool(),
            createTypeTool(),
            createSelectOptionTool(),
            createPressKeyTool(),
            createScrollTool(),
            ...createDbRetrievalTools<AskUserRequest>({
                ...DB_RETRIEVAL_PROFILES.build,
                ragEnabled: isRagEnabled(),
            }),
            ...(getAgentSkillRegistry().isAvailable() ? createSkillTools<AskUserRequest>() : []),
        ]
    }

    return new AgentKernel<AskUserRequest>({
        name: "BuildAgent",
        config,
        tools: buildTools,
        systemPrompt: () => renderBuildAgentSystemPrompt({ ragEnabled: isRagEnabled() }),
        // 技能清单走 meta_user 前缀消息（system-reminder 包裹），不进系统提示词本体
        metaUserPrefix: () => renderSkillPromptSection(getAgentSkillRegistry().getPromptSkills()),
        maxToolRounds: MAX_TOOL_ROUNDS,
        maxContinuations: MAX_CONTINUATIONS,
        label: agentToolLabel,
        formatAnswer: formatAskUserResponse as (request: AskUserRequest, answer: unknown) => string,
        hasAnswer: hasAskAnswer as (request: AskUserRequest, answer: unknown) => boolean,
    })
}
