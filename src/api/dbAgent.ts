/**
 * 资料检索 Agent 的装配层。
 *
 * 检索工具集（见 `src/api/agent/tools/db-retrieval.ts`）与循环机制
 * （见 `src/api/agent/kernel.ts`）各自独立，本文件只负责把一次运行需要的东西
 * 装配进通用内核：工具清单（随 RAG 开关缓存）、系统提示词、工具展示名（i18n）、
 * 以及 ask_user 挂起问答的格式化与校验。装配完直接交出内核，调用方
 * （`useDBChat`）按内核的原生方法驱动，不再包一层转发。
 *
 * 线协议由 `agent/config.ts` 的 `createAgentTransport` 按端点能力选择：
 * DeepSeek 官方与服务端反代走 Messages（工具调用是协议级字段，不受上游文本解析器可靠性影响），
 * 只有 OpenAI 兼容入口的网关走 Chat Completions。
 */

import type { AgentUpstreamConfig } from "@/api/agent/config"
import { AgentKernel } from "@/api/agent/kernel"
import type { AgentTool } from "@/api/agent/tool"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import type { OpenAIConfig } from "@/api/openai"
import { renderDBAgentSystemPrompt } from "@/shared/dbAgentSystemPrompt"
import { agentToolLabel } from "@/utils/agent-chat"
import type { AskUserRequest } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { isRagEnabled } from "@/utils/rag/enabled"

/**
 * 允许的最大工具调用轮数，防止模型陷入无休止检索。
 *
 * `ask_user` 挂起会占用一轮（回答后从下一轮继续）：这样循环必然推进，
 * 不会出现「模型一直提问、轮次永不前进」的死循环。
 */
const MAX_TOOL_ROUNDS = 30

/**
 * 单次回答触达输出上限后允许自动续写的次数。
 *
 * 上游在触达 max_tokens 时会以 `finish_reason === "length"` 收流，正文停在半句上；
 * 续写把这半句当作助手消息回灌，再要一段后续。3 次约等于三倍输出长度，
 * 既足够收尾一份结果清单，也能在模型反复话痨时及时收敛。
 */
const MAX_CONTINUATIONS = 3

/**
 * @description 装配资料检索 Agent：把工具集、提示词与挂起问答绑定进通用内核。
 * @param config AI 配置（来自设置页，可缺省；缺省时只给空密钥，真正的拦截在内核 run() 里提示）
 * @returns 可直接驱动的通用 Agent 内核
 */
export function createDbAgent(config: Partial<OpenAIConfig> = {}): AgentKernel<AskUserRequest> {
    /** 上一次装配工具时的开关取值：开关没变就不重建，避免每轮都造一遍工具对象 */
    let cachedRag: boolean | null = null
    let cachedTools: AgentTool<AskUserRequest>[] = []

    /**
     * @description 按当前的上下文检索增强开关取工具清单。
     * @returns 本次运行的工具清单
     */
    const resolveTools = (): AgentTool<AskUserRequest>[] => {
        const ragEnabled = isRagEnabled()

        if (cachedRag !== ragEnabled) {
            cachedRag = ragEnabled
            cachedTools = createDbRetrievalTools<AskUserRequest>({ ragEnabled, story: true, askUser: true })
        }

        return cachedTools
    }

    return new AgentKernel<AskUserRequest>({
        name: "DBAgent",
        config: config as Partial<AgentUpstreamConfig>,
        tools: resolveTools,
        systemPrompt: () => renderDBAgentSystemPrompt({ ragEnabled: isRagEnabled() }),
        maxToolRounds: MAX_TOOL_ROUNDS,
        maxContinuations: MAX_CONTINUATIONS,
        label: agentToolLabel,
        formatAnswer: formatAskUserResponse as (request: AskUserRequest, answer: unknown) => string,
        hasAnswer: hasAskAnswer as (request: AskUserRequest, answer: unknown) => boolean,
    })
}
