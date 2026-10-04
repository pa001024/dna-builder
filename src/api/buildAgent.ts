/**
 * 配装 Agent。
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
 */

import i18next from "i18next"
import type { Ref } from "vue"
import type { AgentUpstreamConfig } from "@/api/agent/config"
import { type AgentCallbacks, type AgentHistoryMessage, AgentKernel, type AgentRunOptions, type AgentRunResult } from "@/api/agent/kernel"
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
import type { CharSettings } from "@/composables/useCharSettings"
import { renderBuildAgentSystemPrompt } from "@/shared/buildAgentSystemPrompt"
import type { useInvStore } from "@/store/inv"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { isRagEnabled } from "@/utils/rag/enabled"

/**
 * 配装助手能检索的条目模块。
 *
 * 配装只关心「角色 + 武器 + 魔之楔 + 魔灵 + 敌人 + 伤害机制」，其余模块（剧情、读物、
 * 钓鱼、NPC 等）即便被查到也用不上，暴露出来只会让模型在检索面上铺开浪费轮次。
 */
const BUILD_RETRIEVAL_MODULES = ["char", "weapon", "mod", "monster", "pet", "damage"] as const

/**
 * 允许的最大工具轮数。
 *
 * UI 操作天然比纯检索多轮（读 → 点 → 读 → 填），因此预算比资料检索更宽，
 * 但仍必须有上限：超过之后不再执行新工具，模型会收到「额度已用尽」的结果并被要求收尾。
 */
const MAX_TOOL_ROUNDS = 40

/** 单次回答触达输出上限后允许自动续写的次数 */
const MAX_CONTINUATIONS = 3

/** 工具展示名（界面中文标注） */
const TOOL_LABELS: Record<string, string> = {
    run_code: "执行代码",
    read_page: "读取配装页",
    click_ui: "点击控件",
    type_ui: "输入文本",
    select_ui: "选择选项",
    press_key: "按键",
    scroll_ui: "滚动定位",
}

/**
 * @description 取工具展示名：登记过的用中文，未登记的（检索工具）走原文显式翻译。
 * @param name 工具名
 * @returns 展示名
 */
function toolLabel(name: string): string {
    return TOOL_LABELS[name] ?? i18next.t(`dbAgent.tool.${name}`, { defaultValue: name })
}

/**
 * 配装 Agent 客户端。
 */
export class BuildAgent {
    private readonly kernel: AgentKernel<AskUserRequest>

    /**
     * 创建配装 Agent。
     * @param config AI 配置（缺省时只给空密钥，真正的拦截在 run() 里提示）
     * @param charSettings 当前角色构筑设置（ref）
     * @param selectedChar 当前角色名（ref）
     * @param inv 库存 store
     */
    constructor(
        config: Partial<AgentUpstreamConfig> = {},
        public charSettings: Ref<CharSettings>,
        public selectedChar: Ref<string>,
        public inv: ReturnType<typeof useInvStore>
    ) {
        this.kernel = new AgentKernel<AskUserRequest>({
            name: "BuildAgent",
            config,
            tools: () => this.buildTools(),
            systemPrompt: () => renderBuildAgentSystemPrompt({ ragEnabled: isRagEnabled() }),
            maxToolRounds: MAX_TOOL_ROUNDS,
            maxContinuations: MAX_CONTINUATIONS,
            label: toolLabel,
            formatAnswer: formatAskUserResponse as (request: AskUserRequest, answer: unknown) => string,
            hasAnswer: hasAskAnswer as (request: AskUserRequest, answer: unknown) => boolean,
        })
    }

    /**
     * @description 组装本轮的工具集。
     *
     * run_code 排在最前：模型先想到「写一段代码一次做完」，而不是逐个控件去点。
     * @returns 工具列表
     */
    private buildTools() {
        return [
            createRunCodeTool(),
            createReadPageTool(),
            createClickTool(),
            createTypeTool(),
            createSelectOptionTool(),
            createPressKeyTool(),
            createScrollTool(),
            ...createDbRetrievalTools<AskUserRequest>({
                modules: BUILD_RETRIEVAL_MODULES,
                story: false,
                ragEnabled: isRagEnabled(),
                askUser: true,
            }),
        ]
    }

    /**
     * 更新上游配置（设置项改动后调用）。
     * @param config 新的配置
     */
    public updateConfig(config: Partial<AgentUpstreamConfig>): void {
        this.kernel.updateConfig(config)
    }

    /**
     * 切换角色时同步宿主状态（ref 是共享引用，换值时重新绑定保证后续写入落在新角色上）。
     * @param charSettings 新的构筑设置
     * @param selectedChar 新的角色名
     */
    public updateHost(charSettings: Ref<CharSettings>, selectedChar: Ref<string>): void {
        this.charSettings = charSettings
        this.selectedChar = selectedChar
    }

    /** 中断当前流式输出。 */
    public interrupt(): void {
        this.kernel.interrupt()
    }

    /**
     * 跑一轮：流式输出 + 多轮工具调用（工具可能操作配装页界面）。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @param options 运行选项（显式会话 id 等）
     * @returns 回复、工具痕迹与思考分段
     */
    public async run(
        history: readonly AgentHistoryMessage[],
        callbacks: AgentCallbacks = {},
        options: AgentRunOptions = {}
    ): Promise<AgentRunResult<AskUserRequest>> {
        return this.kernel.run(history, callbacks, options)
    }

    /**
     * 回答 ask_user 后从挂起点继续。
     * @param response 用户回答
     * @param callbacks 续跑回调
     * @returns 续跑结果
     */
    public async answerAsk(response: AskUserResponse, callbacks: AgentCallbacks = {}): Promise<AgentRunResult<AskUserRequest>> {
        return this.kernel.answerPending(response, callbacks)
    }

    /**
     * 跳过当前 ask_user，回填「用户未提供信息」后继续。
     * @param callbacks 续跑回调
     * @returns 续跑结果
     */
    public async skipAsk(callbacks: AgentCallbacks = {}): Promise<AgentRunResult<AskUserRequest>> {
        return this.kernel.skipPending(callbacks)
    }

    /**
     * 当前是否有等待回答的 ask_user。
     * @returns 挂起的提问；无则 null
     */
    public getPendingAsk(): AskUserRequest | null {
        return this.kernel.getPendingAsk()?.payload ?? null
    }

    /** 丢弃挂起现场（切换会话 / 清空对话时调用）。 */
    public clearPending(): void {
        this.kernel.clearPending()
    }
}
