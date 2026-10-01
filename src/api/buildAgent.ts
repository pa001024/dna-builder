/**
 * 配装 Agent。
 *
 * 与资料检索 Agent 共用同一套内核（`src/api/agent/kernel.ts`）与同一套上游凭证策略，
 * 差别只在工具集与提示词：
 *
 * 1. **UI 工具**（首选）：直接读取配装页、点击控件、往输入框打字，和真人操作完全等价；
 * 2. **资料检索子集**：把资料库的角色 / 武器 / 魔之楔 / 魔灵 / 怪物 / 伤害机制检索带进来，
 *    剧情、版本新增这类与配装无关的一律不暴露；
 * 3. **直接数据 / 直接改配置工具**（兜底）：批量核对特效、跑一整套自动求解这类
 *    用界面做代价过高的动作才走这条。
 */

import i18next from "i18next"
import type { Ref } from "vue"
import type { AgentUpstreamConfig } from "@/api/agent/config"
import type { AgentHistoryMessage } from "@/api/agent/kernel"
import { type AgentCallbacks, AgentKernel, type AgentRunResult } from "@/api/agent/kernel"
import { BuildToolHost, createBuildDirectTools } from "@/api/agent/tools/build-direct"
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
    read_page: "读取配装页",
    click_ui: "点击控件",
    type_ui: "输入文本",
    select_ui: "选择选项",
    press_key: "按键",
    scroll_ui: "滚动定位",
    setBuff: "设置BUFF",
    setMod: "设置MOD",
    queryCharData: "查询角色数据",
    queryModData: "查询MOD数据",
    queryBuffData: "查询BUFF数据",
    queryWeaponData: "查询武器数据",
    queryEffectConfig: "查询特效配置",
    setEffectConfig: "设置特效配置",
    setBaseAndTargetFunction: "设置计算方式",
    getCurrentConfig: "读取当前配置",
    autoBuild: "自动配装",
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
    private readonly host: BuildToolHost

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
        this.host = new BuildToolHost(charSettings, selectedChar, inv)

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
     * UI 工具排在最前：模型先想到「像用户一样操作界面」，而不是跳过界面直接改数据。
     * @returns 工具列表
     */
    private buildTools() {
        return [
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
            ...createBuildDirectTools(this.host),
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
        this.host.charSettings = charSettings
        this.host.selectedChar = selectedChar
    }

    /** 中断当前流式输出。 */
    public interrupt(): void {
        this.kernel.interrupt()
    }

    /**
     * 跑一轮：流式输出 + 多轮工具调用（工具可能操作配装页界面）。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @returns 回复、工具痕迹与思考分段
     */
    public async run(history: readonly AgentHistoryMessage[], callbacks: AgentCallbacks = {}): Promise<AgentRunResult<AskUserRequest>> {
        return this.kernel.run(history, callbacks)
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
