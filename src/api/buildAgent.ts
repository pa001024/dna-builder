import { AIMessage, type BaseMessage, HumanMessage, type MessageContent, SystemMessage, ToolMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { useLocalStorage } from "@vueuse/core"
import { createAgent, tool } from "langchain"
import type { Ref } from "vue"
import { z } from "zod"
import { renderBuildAgentSystemPrompt } from "@/shared/buildAgentSystemPrompt"
import type { CharSettings, useCharSettings } from "../composables/useCharSettings"
import {
    buffData,
    CharBuild,
    charData,
    effectMap,
    LeveledChar,
    LeveledMod,
    type LeveledSkill,
    type LeveledSkillField,
    LeveledSkillWeapon,
    type LeveledWeapon,
    type ModTypeKey,
    modData,
    weaponData,
    weaponMap,
} from "../data"
import type { useInvStore } from "../store/inv"
import type { OpenAIConfig } from "./openai"

type EffectSourceType = "mod" | "weapon"

type EffectTarget = {
    sourceType: EffectSourceType
    id: number
    名称: string
    特效名称: string
    特效描述: string
    特效限定?: string
    特效最大等级: number
    额外信息: Record<string, unknown>
}

/**
 * 角色配装AI Agent
 * 用于智能配置角色MOD、BUFF等
 */
export class BuildAgent {
    private model: ChatOpenAI
    private agent: ReturnType<typeof createAgent>
    private contextMessages: BaseMessage[] = []
    private isStreaming = false

    constructor(
        private config: OpenAIConfig,
        public charSettings: ReturnType<typeof useCharSettings>,
        public selectedChar: Ref<string>,
        public inv: ReturnType<typeof useInvStore>
    ) {
        this.model = this.createChatModel()
        this.agent = this.createAgentRunner()
        this.resetContext()
    }

    /**
     * 获取系统提示词
     */
    private getSystemPrompt(): string {
        return renderBuildAgentSystemPrompt()
    }

    /**
     * 创建 LangChain ChatOpenAI 实例
     * @returns ChatOpenAI 模型实例
     */
    private createChatModel(): ChatOpenAI {
        return new ChatOpenAI({
            apiKey: this.config.api_key,
            model: this.config.default_model,
            temperature: this.config.default_temperature,
            maxTokens: this.config.default_max_tokens,
            timeout: this.config.timeout,
            maxRetries: this.config.max_retries,
            modelKwargs: {
                parallel_tool_calls: true,
            },
            configuration: {
                baseURL: this.config.base_url,
            },
        })
    }

    /**
     * 创建 createAgent 执行器
     * @returns Agent 实例
     */
    private createAgentRunner() {
        return createAgent({
            model: this.model,
            tools: this.getTools(),
            version: "v2",
        })
    }

    /**
     * 重置上下文，只保留最新系统提示词
     */
    private resetContext(): void {
        this.contextMessages = [new SystemMessage(this.getSystemPrompt())]
    }

    /**
     * 同步上下文中的系统提示词
     * @param reset 是否重置历史上下文
     */
    private syncSystemPrompt(reset = false): void {
        if (reset || this.contextMessages.length === 0) {
            this.resetContext()
            return
        }
        this.contextMessages[0] = new SystemMessage(this.getSystemPrompt())
    }

    /**
     * 将工具参数/结果格式化为可读文本
     * @param value 任意工具数据
     * @returns 可展示文本
     */
    private formatToolValue(value: unknown): string {
        if (typeof value === "string") {
            return value
        }
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return String(value)
        }
    }

    /**
     * 解析工具参数，兼容对象和JSON字符串
     * @param rawArgs 原始参数
     * @returns 规范化后的参数对象
     */
    private parseToolArgs(rawArgs: unknown): Record<string, unknown> {
        if (typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)) {
            return rawArgs as Record<string, unknown>
        }
        if (typeof rawArgs === "string") {
            try {
                const parsed = JSON.parse(rawArgs)
                if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>
                }
            } catch {
                return {}
            }
        }
        return {}
    }

    /**
     * 根据tool_call_id反查工具名称
     * @param messages 当前消息列表
     * @param toolCallId 工具调用ID
     * @returns 工具名称
     */
    private resolveToolNameByCallId(messages: BaseMessage[], toolCallId: string): string {
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]
            if (!(message instanceof AIMessage)) {
                continue
            }
            const matched = (message.tool_calls || []).find(toolCall => toolCall.id === toolCallId)
            if (matched?.name) {
                return matched.name
            }
        }
        return toolCallId
    }

    /**
     * 分词关键词，支持空格、逗号、顿号、分号、竖线分隔
     * @param keywords 关键词原始文本
     * @returns 去重后的关键词数组（小写）
     */
    private parseKeywords(keywords?: string): string[] {
        if (!keywords) {
            return []
        }
        const tokens = keywords
            .split(/[\s,，、;；|]+/)
            .map(token => token.trim().toLowerCase())
            .filter(Boolean)
        return Array.from(new Set(tokens))
    }

    /**
     * 规范化MOD类型参数，兼容 skillWeaponMods 别名
     * @param rawTypes 原始类型数组
     * @returns 规范化后的类型数组
     */
    private normalizeModTypes(rawTypes?: string[]): ModTypeKey[] {
        if (!Array.isArray(rawTypes)) {
            return []
        }

        const normalized = rawTypes
            .map(type => (type === "skillWeaponMods" ? "skillMods" : type))
            .filter(
                (type): type is ModTypeKey => type === "charMods" || type === "meleeMods" || type === "rangedMods" || type === "skillMods"
            )

        return Array.from(new Set(normalized))
    }

    /**
     * 获取当前角色属性
     * @returns 当前角色属性，缺失时返回 "any"
     */
    private getCurrentCharacterElement(): string {
        return charData.find(char => char.名称 === this.selectedChar.value)?.属性 || "any"
    }

    /**
     * 统一归一化文本数组参数（支持数组与逗号分隔字符串）
     * @param raw 原始参数
     * @returns 归一化后的文本数组（小写去重）
     */
    private normalizeTextArray(raw?: string[] | string): string[] {
        if (!raw) {
            return []
        }
        const values = Array.isArray(raw) ? raw : this.parseKeywords(raw)
        return Array.from(new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean)))
    }

    /**
     * 统一归一化数值数组参数（支持单值与数组）
     * @param raw 原始参数
     * @returns 归一化后的整数数组
     */
    private normalizeNumberArray(raw?: number[] | number): number[] {
        if (raw === undefined) {
            return []
        }
        const values = Array.isArray(raw) ? raw : [raw]
        return Array.from(new Set(values.filter(value => Number.isFinite(value)).map(value => Math.floor(value))))
    }

    /**
     * 判断文本是否匹配任一关键词（包含匹配）
     * @param text 文本
     * @param keywords 关键词集合
     * @returns 是否匹配
     */
    private matchKeywords(text: string, keywords: string[]): boolean {
        if (keywords.length === 0) {
            return true
        }
        const normalizedText = text.toLowerCase()
        return keywords.some(keyword => normalizedText.includes(keyword))
    }

    /**
     * 解析 MOD 对应的特效信息
     * @param mod MOD 数据
     * @returns 特效信息，不存在时返回 null
     */
    private getModEffectMeta(mod: (typeof modData)[number]): {
        name: string
        description: string
        limit?: string
        maxLevel: number
    } | null {
        const effect = effectMap.get(mod.名称)
        if (!effect) {
            return null
        }

        const effectQuality = typeof effect.品质 === "string" ? effect.品质 : undefined
        if (effectQuality && effectQuality !== mod.品质) {
            return null
        }

        return {
            name: effect.名称,
            description: effect.描述 || "",
            limit: effect.限定,
            maxLevel: Math.max(1, typeof effect.mx === "number" ? Math.floor(effect.mx) : 1),
        }
    }

    /**
     * 解析武器对应的特效信息
     * @param weaponId 武器ID
     * @returns 特效信息，不存在时返回 null
     */
    private getWeaponEffectMeta(weaponId: number): {
        name: string
        description: string
        limit?: string
        maxLevel: number
    } | null {
        const weapon = weaponMap.get(weaponId)
        if (!weapon) {
            return null
        }
        const effect = effectMap.get(weapon.名称)
        if (!effect) {
            return null
        }
        return {
            name: effect.名称,
            description: effect.描述 || "",
            limit: effect.限定,
            maxLevel: Math.max(1, typeof effect.mx === "number" ? Math.floor(effect.mx) : 1),
        }
    }

    /**
     * 判断特效是否适配当前角色属性
     * @param effectLimit 特效限定属性
     * @param currentElement 当前角色属性
     * @returns 是否可用
     */
    private isEffectAvailable(effectLimit: string | undefined, currentElement: string): boolean {
        return !effectLimit || currentElement === "any" || effectLimit === currentElement
    }

    /**
     * 获取武器特效原始配置等级（不做属性限定校验）
     * @param weaponId 武器ID
     * @returns 原始配置等级
     */
    private getWeaponRawEffectLevel(weaponId: number): number {
        const rawLevel = this.inv.wLv[weaponId]
        return typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : 0
    }

    /**
     * 将等级限制在合法范围内
     * @param level 目标等级
     * @param maxLevel 最大等级
     * @returns 归一化后的等级
     */
    private clampEffectLevel(level: number, maxLevel: number): number {
        if (!Number.isFinite(level)) {
            return 0
        }
        return Math.max(0, Math.min(maxLevel, Math.floor(level)))
    }

    /**
     * 采集可操作的特效目标（支持按MOD/武器及名称批量筛选）
     * @param params 查询参数
     * @returns 特效目标列表
     */
    private collectEffectTargets(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
    }): EffectTarget[] {
        const sourceType = params.sourceType || "all"
        const modIdSet = new Set(this.normalizeNumberArray(params.modIds))
        const weaponIdSet = new Set(this.normalizeNumberArray(params.weaponIds))
        const modNameKeywords = this.normalizeTextArray(params.modNames)
        const weaponNameKeywords = this.normalizeTextArray(params.weaponNames)
        const effectNameKeywords = this.normalizeTextArray(params.effectNames)

        const hasModSourceFilter = modIdSet.size > 0 || modNameKeywords.length > 0
        const hasWeaponSourceFilter = weaponIdSet.size > 0 || weaponNameKeywords.length > 0
        const includeModsByDefault = !hasWeaponSourceFilter || hasModSourceFilter || effectNameKeywords.length > 0
        const includeWeaponsByDefault = !hasModSourceFilter || hasWeaponSourceFilter || effectNameKeywords.length > 0

        const targets: EffectTarget[] = []

        if (sourceType !== "weapon" && includeModsByDefault) {
            modData.forEach(mod => {
                const effectMeta = this.getModEffectMeta(mod)
                if (!effectMeta) {
                    return
                }
                if (modIdSet.size > 0 && !modIdSet.has(mod.id)) {
                    return
                }
                if (modNameKeywords.length > 0 && !this.matchKeywords(mod.名称, modNameKeywords)) {
                    return
                }
                if (effectNameKeywords.length > 0 && !this.matchKeywords(effectMeta.name, effectNameKeywords)) {
                    return
                }
                targets.push({
                    sourceType: "mod",
                    id: mod.id,
                    名称: mod.名称,
                    特效名称: effectMeta.name,
                    特效描述: effectMeta.description,
                    特效限定: effectMeta.limit,
                    特效最大等级: effectMeta.maxLevel,
                    额外信息: {
                        品质: mod.品质,
                        类型: mod.类型,
                        系列: mod.系列,
                        属性: mod.属性,
                    },
                })
            })
        }

        if (sourceType !== "mod" && includeWeaponsByDefault) {
            weaponData.forEach(weapon => {
                const effectMeta = this.getWeaponEffectMeta(weapon.id)
                if (!effectMeta) {
                    return
                }
                if (weaponIdSet.size > 0 && !weaponIdSet.has(weapon.id)) {
                    return
                }
                if (weaponNameKeywords.length > 0 && !this.matchKeywords(weapon.名称, weaponNameKeywords)) {
                    return
                }
                if (effectNameKeywords.length > 0 && !this.matchKeywords(effectMeta.name, effectNameKeywords)) {
                    return
                }
                targets.push({
                    sourceType: "weapon",
                    id: weapon.id,
                    名称: weapon.名称,
                    特效名称: effectMeta.name,
                    特效描述: effectMeta.description,
                    特效限定: effectMeta.limit,
                    特效最大等级: effectMeta.maxLevel,
                    额外信息: {
                        武器类型: weapon.类型[0],
                        类别: weapon.类型[1],
                        伤害类型: weapon.伤害类型,
                    },
                })
            })
        }

        const dedupedTargets = new Map<string, EffectTarget>()
        targets.forEach(target => {
            dedupedTargets.set(`${target.sourceType}:${target.id}`, target)
        })
        return Array.from(dedupedTargets.values())
    }

    /**
     * 归一化工具调用上下文，清理不成对的 tool_call / tool_result
     * 说明：
     * - 若出现孤立 ToolMessage（没有匹配的 tool_call_id），会被丢弃
     * - 若出现未完成的 tool_call（缺少工具结果），会移除对应的 AI 工具调用消息
     */
    private normalizeToolCallContext(): void {
        const normalized: BaseMessage[] = []
        const pendingToolCallIds = new Set<string>()

        for (const message of this.contextMessages) {
            if (message instanceof AIMessage) {
                pendingToolCallIds.clear()
                for (const toolCall of message.tool_calls || []) {
                    if (toolCall.id) {
                        pendingToolCallIds.add(toolCall.id)
                    }
                }
                normalized.push(message)
                continue
            }

            if (message instanceof ToolMessage) {
                const toolCallId = message.tool_call_id
                if (toolCallId && pendingToolCallIds.has(toolCallId)) {
                    pendingToolCallIds.delete(toolCallId)
                    normalized.push(message)
                }
                continue
            }

            if (pendingToolCallIds.size > 0) {
                const lastMessage = normalized.at(-1)
                if (lastMessage instanceof AIMessage && (lastMessage.tool_calls?.length || 0) > 0) {
                    normalized.pop()
                }
                pendingToolCallIds.clear()
            }
            normalized.push(message)
        }

        if (pendingToolCallIds.size > 0) {
            const lastMessage = normalized.at(-1)
            if (lastMessage instanceof AIMessage && (lastMessage.tool_calls?.length || 0) > 0) {
                normalized.pop()
            }
        }

        if (normalized.length === 0 || !(normalized[0] instanceof SystemMessage)) {
            this.resetContext()
            return
        }
        this.contextMessages = normalized
    }

    /**
     * 获取工具定义
     */
    private getTools() {
        return [
            tool(async ({ action, buffName, level }) => this.handleToolCall("setBuff", { action, buffName, level }), {
                name: "setBuff",
                description: "添加或移除BUFF",
                schema: z.object({
                    action: z.enum(["add", "remove"]),
                    buffName: z.string().describe("BUFF名称"),
                    level: z.number().optional(),
                }),
            }),
            tool(async ({ modType, slotIndex, modId, level }) => this.handleToolCall("setMod", { modType, slotIndex, modId, level }), {
                name: "setMod",
                description: "设置指定位置的MOD",
                schema: z.object({
                    modType: z.enum(["角色", "近战", "远程", "同律"]),
                    slotIndex: z.number(),
                    modId: z.number(),
                    level: z.number().optional(),
                }),
            }),
            tool(async ({ charName, level, skillLevel }) => this.handleToolCall("queryCharData", { charName, level, skillLevel }), {
                name: "queryCharData",
                description: "查询角色详细数据",
                schema: z.object({
                    charName: z.string().optional(),
                    level: z.number().optional(),
                    skillLevel: z.number().optional(),
                }),
            }),
            tool(
                async ({ element, modType, series, keywords, hasEffect, effectName, effectEnabled, effectAvailable }) =>
                    this.handleToolCall("queryModData", {
                        element,
                        modType,
                        series,
                        keywords,
                        hasEffect,
                        effectName,
                        effectEnabled,
                        effectAvailable,
                    }),
                {
                    name: "queryModData",
                    description: "查询MOD数据，支持按属性、类型、系列、关键词与特效状态筛选",
                    schema: z.object({
                        element: z.string().optional(),
                        modType: z.string().optional(),
                        series: z.string().optional(),
                        keywords: z.string().optional(),
                        hasEffect: z.boolean().optional(),
                        effectName: z.string().optional(),
                        effectEnabled: z.boolean().optional(),
                        effectAvailable: z.boolean().optional(),
                    }),
                }
            ),
            tool(async ({ buffName }) => this.handleToolCall("queryBuffData", { buffName }), {
                name: "queryBuffData",
                description: "查询BUFF数据",
                schema: z.object({
                    buffName: z.string().optional(),
                }),
            }),
            tool(async ({ weaponType, category }) => this.handleToolCall("queryWeaponData", { weaponType, category }), {
                name: "queryWeaponData",
                description: "查询武器数据",
                schema: z.object({
                    weaponType: z.string().optional(),
                    category: z.string().optional(),
                }),
            }),
            tool(async ({ baseName, targetFunction }) => this.handleToolCall("setBaseAndTargetFunction", { baseName, targetFunction }), {
                name: "setBaseAndTargetFunction",
                description: "设置当前计算技能(baseName)与目标函数表达式(targetFunction)",
                schema: z
                    .object({
                        baseName: z.string().optional(),
                        targetFunction: z.string().optional(),
                    })
                    .refine(data => Boolean(data.baseName || data.targetFunction), {
                        message: "至少需要提供 baseName 或 targetFunction",
                    }),
            }),
            tool(async () => this.handleToolCall("getCurrentConfig", {}), {
                name: "getCurrentConfig",
                description: "获取当前角色配置信息",
                schema: z.object({}),
            }),
            tool(
                async ({ modIds, modNames, weaponIds, weaponNames, effectNames, sourceType, enabledOnly, limit }) =>
                    this.handleToolCall("queryEffectConfig", {
                        modIds,
                        modNames,
                        weaponIds,
                        weaponNames,
                        effectNames,
                        sourceType,
                        enabledOnly,
                        limit,
                    }),
                {
                    name: "queryEffectConfig",
                    description: "批量查询MOD/武器特效当前配置（支持按名称、ID、特效名筛选）",
                    schema: z.object({
                        modIds: z.union([z.number(), z.array(z.number())]).optional(),
                        modNames: z.union([z.string(), z.array(z.string())]).optional(),
                        weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
                        weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
                        effectNames: z.union([z.string(), z.array(z.string())]).optional(),
                        sourceType: z.enum(["all", "mod", "weapon"]).optional(),
                        enabledOnly: z.boolean().optional(),
                        limit: z.number().int().min(1).max(200).optional(),
                    }),
                }
            ),
            tool(
                async ({ modIds, modNames, weaponIds, weaponNames, effectNames, sourceType, mode, level }) =>
                    this.handleToolCall("setEffectConfig", {
                        modIds,
                        modNames,
                        weaponIds,
                        weaponNames,
                        effectNames,
                        sourceType,
                        mode,
                        level,
                    }),
                {
                    name: "setEffectConfig",
                    description: "批量设置MOD/武器特效等级（启用、关闭、切换、指定等级）",
                    schema: z.object({
                        modIds: z.union([z.number(), z.array(z.number())]).optional(),
                        modNames: z.union([z.string(), z.array(z.string())]).optional(),
                        weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
                        weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
                        effectNames: z.union([z.string(), z.array(z.string())]).optional(),
                        sourceType: z.enum(["all", "mod", "weapon"]).optional(),
                        mode: z.enum(["enable", "disable", "toggle", "set"]).optional(),
                        level: z.number().int().min(0).optional(),
                    }),
                }
            ),
            tool(
                async ({ useInv, includeTypes, preserveTypes, includeMelee, includeRanged, fixedMelee, fixedRanged, enableLog, apply }) =>
                    this.handleToolCall("autoBuild", {
                        useInv,
                        includeTypes,
                        preserveTypes,
                        includeMelee,
                        includeRanged,
                        fixedMelee,
                        fixedRanged,
                        enableLog,
                        apply,
                    }),
                {
                    name: "autoBuild",
                    description: "自动构建最优MOD配置（参数与AutoBuild面板一致）",
                    schema: z.object({
                        useInv: z.boolean().optional(),
                        includeTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
                        preserveTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
                        includeMelee: z.boolean().optional(),
                        includeRanged: z.boolean().optional(),
                        fixedMelee: z.boolean().optional(),
                        fixedRanged: z.boolean().optional(),
                        enableLog: z.boolean().optional(),
                        apply: z.boolean().optional(),
                    }),
                }
            ),
        ]
    }

    /**
     * 处理工具调用
     */
    private async handleToolCall(functionName: string, rawArgs: unknown): Promise<string> {
        console.log("工具调用:", functionName, rawArgs)
        const parsedArgs = this.parseToolArgs(rawArgs)

        const setBuffSchema = z.object({
            action: z.enum(["add", "remove"]),
            buffName: z.string().min(1),
            level: z.number().optional(),
        })
        const setModSchema = z.object({
            modType: z.enum(["角色", "近战", "远程", "同律"]),
            slotIndex: z.number(),
            modId: z.number(),
            level: z.number().optional(),
        })
        const queryCharDataSchema = z
            .object({
                charName: z.string().optional(),
                level: z.number().optional(),
                skillLevel: z.number().optional(),
            })
            .optional()
        const queryModDataSchema = z.object({
            element: z.string().optional(),
            modType: z.string().optional(),
            series: z.string().optional(),
            keywords: z.string().optional(),
            hasEffect: z.boolean().optional(),
            effectName: z.string().optional(),
            effectEnabled: z.boolean().optional(),
            effectAvailable: z.boolean().optional(),
        })
        const queryBuffDataSchema = z.object({
            buffName: z.string().optional(),
        })
        const queryWeaponDataSchema = z.object({
            weaponType: z.string().optional(),
            category: z.string().optional(),
        })
        const setBaseAndTargetFunctionSchema = z
            .object({
                baseName: z.string().optional(),
                targetFunction: z.string().optional(),
            })
            .refine(data => Boolean(data.baseName || data.targetFunction), {
                message: "至少需要提供 baseName 或 targetFunction",
            })
        const queryEffectConfigSchema = z.object({
            modIds: z.union([z.number(), z.array(z.number())]).optional(),
            modNames: z.union([z.string(), z.array(z.string())]).optional(),
            weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
            weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
            effectNames: z.union([z.string(), z.array(z.string())]).optional(),
            sourceType: z.enum(["all", "mod", "weapon"]).optional(),
            enabledOnly: z.boolean().optional(),
            limit: z.number().int().min(1).max(200).optional(),
        })
        const setEffectConfigSchema = z.object({
            modIds: z.union([z.number(), z.array(z.number())]).optional(),
            modNames: z.union([z.string(), z.array(z.string())]).optional(),
            weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
            weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
            effectNames: z.union([z.string(), z.array(z.string())]).optional(),
            sourceType: z.enum(["all", "mod", "weapon"]).optional(),
            mode: z.enum(["enable", "disable", "toggle", "set"]).optional(),
            level: z.number().int().min(0).optional(),
        })
        const autoBuildSchema = z.object({
            useInv: z.boolean().optional(),
            includeTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
            preserveTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
            includeMelee: z.boolean().optional(),
            includeRanged: z.boolean().optional(),
            fixedMelee: z.boolean().optional(),
            fixedRanged: z.boolean().optional(),
            enableLog: z.boolean().optional(),
            apply: z.boolean().optional(),
        })

        switch (functionName) {
            case "setBuff": {
                const args = setBuffSchema.parse(parsedArgs)
                return this.setBuff(args.action, args.buffName, args.level)
            }
            case "setMod": {
                const args = setModSchema.parse(parsedArgs)
                return this.setMod(args.modType, args.slotIndex, args.modId, args.level)
            }
            case "queryCharData": {
                const args = queryCharDataSchema.parse(parsedArgs)
                return this.queryCharData(args)
            }
            case "queryModData": {
                const args = queryModDataSchema.parse(parsedArgs)
                return this.queryModData(args)
            }
            case "queryBuffData": {
                const args = queryBuffDataSchema.parse(parsedArgs)
                return this.queryBuffData(args.buffName)
            }
            case "queryWeaponData": {
                const args = queryWeaponDataSchema.parse(parsedArgs)
                return this.queryWeaponData(args)
            }
            case "setBaseAndTargetFunction": {
                const args = setBaseAndTargetFunctionSchema.parse(parsedArgs)
                return this.setBaseAndTargetFunction(args)
            }
            case "queryEffectConfig": {
                const args = queryEffectConfigSchema.parse(parsedArgs)
                return this.queryEffectConfig(args)
            }
            case "setEffectConfig": {
                const args = setEffectConfigSchema.parse(parsedArgs)
                return this.setEffectConfig(args)
            }
            case "getCurrentConfig":
                return this.getCurrentConfig()
            case "autoBuild": {
                const args = autoBuildSchema.parse(parsedArgs)
                return this.autoBuild(args)
            }
            default:
                return `未知工具: ${functionName}`
        }
    }

    /**
     * 工具实现: 设置BUFF
     */
    private setBuff(action: string, buffName: string, level?: number): string {
        const index = this.charSettings.value.buffs.findIndex((b: any) => b[0] === buffName)

        if (action === "add") {
            if (index > -1) {
                return `BUFF ${buffName} 已存在`
            }
            const buff = buffData.find(b => b.名称 === buffName)
            if (!buff) {
                return `未找到BUFF: ${buffName}`
            }
            this.charSettings.value.buffs.push([buffName, level || 1])
            return `已添加BUFF: ${buffName}${level ? ` (等级${level})` : ""}`
        } else {
            if (index === -1) {
                return `BUFF ${buffName} 不存在`
            }
            this.charSettings.value.buffs.splice(index, 1)
            return `已移除BUFF: ${buffName}`
        }
    }

    /**
     * 工具实现: 设置MOD
     */
    private setMod(modType: "角色" | "近战" | "远程" | "同律", slotIndex: number, modId: number, level?: number): string {
        let mod: LeveledMod
        try {
            mod = new LeveledMod(modId, level ?? 10)
        } catch {
            return `MOD ${modId} 无效`
        }

        const typeKeyMap = {
            角色: "charMods",
            近战: "meleeMods",
            远程: "rangedMods",
            同律: "skillWeaponMods",
        } as const

        const typeKey = typeKeyMap[modType]
        if (!typeKey) {
            return `无效的MOD类型: ${modType}`
        }

        const maxSlots = modType === "同律" ? 4 : 8
        if (slotIndex < 0 || slotIndex >= maxSlots) {
            return `无效的槽位索引: ${slotIndex}（范围: 0-${maxSlots - 1}）`
        }

        this.charSettings.value[typeKey][slotIndex] = [mod.id, level || 1]
        return `已在${modType}槽位${slotIndex}设置MOD: ${mod.名称}${level ? ` (等级${level})` : ""}`
    }

    /**
     * 工具实现: 查询角色数据
     */
    private queryCharData(params?: { charName?: string; level?: number; skillLevel?: number }): string {
        if (params?.charName) {
            const char = charData.find(c => c.名称 === params.charName)
            if (!char) {
                return `未找到角色: ${params.charName}`
            }
            const level = this.normalizeLevel(
                params.level,
                this.selectedChar.value === char.名称 ? this.charSettings.value.charLevel : 80,
                1,
                80
            )
            const skillLevel = this.normalizeLevel(
                params.skillLevel,
                this.selectedChar.value === char.名称 ? this.charSettings.value.charSkillLevel : 10,
                1,
                12
            )
            return JSON.stringify(this.buildCharDetail(char.名称, level, skillLevel), null, 2)
        }

        return JSON.stringify(
            charData.map(c => ({
                id: c.id,
                名称: c.名称,
                属性: c.属性,
                阵营: c.阵营,
                精通: c.精通,
                标签: c.标签,
                技能数量: c.技能.length,
                同律武器数量: c.同律武器?.length || 0,
            })),
            null,
            2
        )
    }

    /**
     * 规范化等级参数并限制范围
     * @param level 原始等级参数
     * @param fallback 默认等级
     * @param min 最小值
     * @param max 最大值
     * @returns 规范化后的等级
     */
    private normalizeLevel(level: number | undefined, fallback: number, min: number, max: number): number {
        const target = typeof level === "number" && Number.isFinite(level) ? level : fallback
        return Math.max(min, Math.min(max, Math.floor(target)))
    }

    /**
     * 规范化数值，避免返回过长小数
     * @param value 原始数值
     * @returns 规范化后的数值
     */
    private normalizeNumber(value: number): number {
        if (Number.isInteger(value)) {
            return value
        }
        return Number.parseFloat(value.toFixed(4))
    }

    /**
     * 构建武器摘要，避免直接序列化为 [object Object]
     * @param weapon 武器对象
     * @returns 可读的武器摘要
     */
    private buildWeaponSummary(weapon: LeveledWeapon) {
        return {
            id: weapon.id,
            名称: weapon.名称,
            类型: weapon.类型,
            类别: weapon.类别,
            伤害类型: weapon.伤害类型,
            等级: weapon.等级,
            精炼: weapon.精炼,
            基础攻击: this.normalizeNumber(weapon.基础攻击),
            效果: weapon.效果,
        }
    }

    /**
     * 从技能字段中提取额外数值（削韧/延迟/卡肉/取消/连段/段数）
     * @param field 技能字段
     * @returns 额外数值对象（仅包含存在的字段）
     */
    private extractSkillFieldExtras(field: LeveledSkillField): Record<string, number> {
        const rawField = field as unknown as Record<string, unknown>
        const maybeExtras: Record<string, unknown> = {
            削韧: rawField.削韧,
            延迟: rawField.延迟,
            卡肉: rawField.卡肉,
            取消: rawField.取消,
            连段: rawField.连段,
            段数: rawField.段数,
        }

        const extras: Record<string, number> = {}
        for (const [key, value] of Object.entries(maybeExtras)) {
            if (typeof value === "number" && Number.isFinite(value)) {
                extras[key] = this.normalizeNumber(value)
            }
        }
        return extras
    }

    /**
     * 组装技能字段详情（仅展示层数据，不返回底层结构）
     * @param field 技能字段
     * @returns 技能字段详情
     */
    private buildSkillFieldDetail(field: LeveledSkillField) {
        const extras = this.extractSkillFieldExtras(field)
        return {
            名称: field.名称,
            数值: this.normalizeNumber(field.值),
            数值2: field.值2 !== undefined ? this.normalizeNumber(field.值2) : undefined,
            属性影响: field.影响 ? field.影响.split(",").filter(Boolean) : [],
            格式: field.格式 || "",
            基准属性: field.基础 || "",
            额外数值: extras,
        }
    }

    /**
     * 组装技能详情（排除技能底层数据）
     * @param skill 角色技能
     * @returns 技能详情
     */
    private buildSkillDetail(skill: LeveledSkill) {
        return {
            名称: skill.名称,
            类型: skill.类型,
            描述: skill.描述 || "",
            冷却: skill.skillData.cd || 0,
            术语解释: skill.术语解释 || {},
            字段详情: skill.getFieldsWithAttr().map(field => this.buildSkillFieldDetail(field)),
            子技能: (skill.skillData.子技能 || []).map(subSkill => ({
                名称: subSkill.名称 || "",
                类型: subSkill.类型,
                描述: subSkill.描述 || "",
                冷却: subSkill.cd || 0,
            })),
        }
    }

    /**
     * 组装角色详情数据（对齐详情页展示，不包含技能底层结构）
     * @param charName 角色名称
     * @param level 角色等级
     * @param skillLevel 技能等级
     * @returns 角色详情对象
     */
    private buildCharDetail(charName: string, level: number, skillLevel: number) {
        const baseChar = charData.find(c => c.名称 === charName)
        if (!baseChar) {
            return {
                error: `未找到角色: ${charName}`,
            }
        }

        const leveledChar = new LeveledChar(charName, level)
        const leveledSkillWeapons = (baseChar.同律武器 || []).map(weapon => new LeveledSkillWeapon(weapon, skillLevel, level))

        return {
            角色信息: {
                id: baseChar.id,
                名称: baseChar.名称,
                属性: baseChar.属性,
                阵营: baseChar.阵营 || "",
                精通: baseChar.精通,
                别名: baseChar.别名 || "",
                版本: baseChar.版本 || "",
                标签: baseChar.标签 || [],
            },
            查询参数: {
                角色等级: level,
                技能等级: skillLevel,
                是否当前角色: this.selectedChar.value === baseChar.名称,
            },
            基础属性: {
                攻击: this.normalizeNumber(leveledChar.基础攻击),
                生命: this.normalizeNumber(leveledChar.基础生命),
                防御: this.normalizeNumber(leveledChar.基础防御),
                护盾: this.normalizeNumber(leveledChar.基础护盾),
                最大神智: this.normalizeNumber(leveledChar.基础神智),
            },
            八十级基准属性: {
                攻击: this.normalizeNumber(baseChar.基础攻击),
                生命: this.normalizeNumber(baseChar.基础生命),
                防御: this.normalizeNumber(baseChar.基础防御),
                护盾: this.normalizeNumber(baseChar.基础护盾),
                最大神智: this.normalizeNumber(baseChar.基础神智),
            },
            加成属性: baseChar.加成 || {},
            溯源: baseChar.溯源 || [],
            技能详情: leveledChar.技能.map(skill => this.buildSkillDetail(skill)),
            同律武器详情: leveledSkillWeapons.map(weapon => ({
                名称: weapon.名称,
                类型: weapon._originalWeaponData.类型,
                伤害类型: weapon.伤害类型,
                基础属性: {
                    攻击: this.normalizeNumber(weapon.基础攻击),
                    暴击: this.normalizeNumber(weapon._originalWeaponData.暴击 || 0),
                    暴伤: this.normalizeNumber(weapon._originalWeaponData.暴伤 || 0),
                    触发: this.normalizeNumber(weapon._originalWeaponData.触发 || 0),
                },
            })),
        }
    }

    /**
     * 工具实现: 查询MOD数据
     */
    private queryModData(params: {
        element?: string
        modType?: string
        series?: string
        keywords?: string
        hasEffect?: boolean
        effectName?: string
        effectEnabled?: boolean
        effectAvailable?: boolean
    }): string {
        let mods = modData
        const currentElement = this.getCurrentCharacterElement()

        /**
         * 获取 MOD 的特效状态摘要
         * @param mod MOD 数据
         * @returns 特效摘要，不存在时返回 null
         */
        const getEffectSummary = (mod: (typeof modData)[number]) => {
            const effectMeta = this.getModEffectMeta(mod)
            if (!effectMeta) {
                return null
            }
            const currentConfigLevel = this.inv.getBuffLv(mod.id)
            const availableForCurrentChar = this.isEffectAvailable(effectMeta.limit, currentElement)
            return {
                名称: effectMeta.name,
                描述: effectMeta.description,
                限定: effectMeta.limit || "",
                当前配置等级: currentConfigLevel,
                当前生效等级: availableForCurrentChar ? currentConfigLevel : 0,
                最大等级: effectMeta.maxLevel,
                是否启用: currentConfigLevel > 0,
                当前角色可用: availableForCurrentChar,
            }
        }

        if (params.element) {
            mods = mods.filter(m => m.属性 === params.element)
        }
        if (params.modType) {
            mods = mods.filter(m => m.类型 === params.modType)
        }
        if (params.series) {
            mods = mods.filter(m => m.系列 === params.series)
        }
        if (typeof params.hasEffect === "boolean") {
            mods = mods.filter(mod => Boolean(getEffectSummary(mod)) === params.hasEffect)
        }
        if (params.effectName) {
            const effectNameKeywords = this.parseKeywords(params.effectName)
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                const effectText = `${effectSummary.名称} ${effectSummary.描述}`.toLowerCase()
                return effectNameKeywords.some(keyword => effectText.includes(keyword))
            })
        }
        if (typeof params.effectEnabled === "boolean") {
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                return effectSummary.是否启用 === params.effectEnabled
            })
        }
        if (typeof params.effectAvailable === "boolean") {
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                return effectSummary.当前角色可用 === params.effectAvailable
            })
        }
        if (params.keywords) {
            const keywords = this.parseKeywords(params.keywords)
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                const searchableText = [
                    mod.名称,
                    mod.效果 ?? "",
                    mod.系列 ?? "",
                    mod.属性 ?? "",
                    mod.类型 ?? "",
                    effectSummary?.名称 ?? "",
                    effectSummary?.描述 ?? "",
                ]
                    .join(" ")
                    .toLowerCase()
                return keywords.some(keyword => searchableText.includes(keyword))
            })
        }

        // 限制返回数量
        const results = mods.slice(0, 20).map(mod => {
            const effectSummary = getEffectSummary(mod)
            return {
                ...mod,
                有特效: Boolean(effectSummary),
                特效: effectSummary,
            }
        })

        return JSON.stringify(
            {
                total: mods.length,
                当前角色属性: currentElement,
                results,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 批量查询MOD/武器特效配置
     */
    private queryEffectConfig(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
        enabledOnly?: boolean
        limit?: number
    }): string {
        const currentElement = this.getCurrentCharacterElement()
        const targets = this.collectEffectTargets(params)
        const limit = params.limit ?? 50

        const targetStates = targets
            .map(target => {
                const currentConfigLevel =
                    target.sourceType === "mod" ? this.inv.getBuffLv(target.id) : this.getWeaponRawEffectLevel(target.id)
                const availableForCurrentChar = this.isEffectAvailable(target.特效限定, currentElement)
                const currentEffectiveLevel =
                    target.sourceType === "mod"
                        ? availableForCurrentChar
                            ? currentConfigLevel
                            : 0
                        : this.inv.getWBuffLv(target.id, currentElement)

                return {
                    来源类型: target.sourceType === "mod" ? "MOD" : "武器",
                    id: target.id,
                    名称: target.名称,
                    特效名称: target.特效名称,
                    特效描述: target.特效描述,
                    特效限定: target.特效限定 || "",
                    当前配置等级: currentConfigLevel,
                    当前生效等级: currentEffectiveLevel,
                    最大等级: target.特效最大等级,
                    是否启用: currentConfigLevel > 0,
                    当前角色可用: availableForCurrentChar,
                    ...target.额外信息,
                }
            })
            .filter(state => (params.enabledOnly ? state.是否启用 : true))

        return JSON.stringify(
            {
                当前角色: this.selectedChar.value,
                当前角色属性: currentElement,
                total: targetStates.length,
                results: targetStates.slice(0, limit),
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 批量设置MOD/武器特效配置
     */
    private setEffectConfig(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
        mode?: "enable" | "disable" | "toggle" | "set"
        level?: number
    }): string {
        const mode = params.mode || "enable"
        const currentElement = this.getCurrentCharacterElement()
        const targets = this.collectEffectTargets(params)

        if (targets.length === 0) {
            return JSON.stringify(
                {
                    mode,
                    message: "未找到可操作的特效目标，请检查MOD/武器名称、ID或特效名称。",
                },
                null,
                2
            )
        }

        const results = targets.map(target => {
            const previousLevel = target.sourceType === "mod" ? this.inv.getBuffLv(target.id) : this.getWeaponRawEffectLevel(target.id)
            const maxLevel = target.特效最大等级
            const levelFromParams = typeof params.level === "number" ? params.level : maxLevel

            let nextLevel = previousLevel
            if (mode === "enable") {
                nextLevel = this.clampEffectLevel(levelFromParams, maxLevel)
                if (nextLevel <= 0) {
                    nextLevel = maxLevel
                }
            } else if (mode === "disable") {
                nextLevel = 0
            } else if (mode === "toggle") {
                nextLevel = previousLevel > 0 ? 0 : this.clampEffectLevel(levelFromParams, maxLevel)
                if (previousLevel <= 0 && nextLevel <= 0) {
                    nextLevel = maxLevel
                }
            } else if (mode === "set") {
                nextLevel = this.clampEffectLevel(levelFromParams, maxLevel)
            }

            if (target.sourceType === "mod") {
                this.inv.setBuffLv(target.id, nextLevel)
            } else {
                this.inv.setWBuffLv(target.id, nextLevel)
            }

            const effectiveLevel =
                target.sourceType === "mod"
                    ? this.isEffectAvailable(target.特效限定, currentElement)
                        ? nextLevel
                        : 0
                    : this.inv.getWBuffLv(target.id, currentElement)

            return {
                来源类型: target.sourceType === "mod" ? "MOD" : "武器",
                id: target.id,
                名称: target.名称,
                特效名称: target.特效名称,
                操作: mode,
                变更前等级: previousLevel,
                变更后等级: nextLevel,
                当前生效等级: effectiveLevel,
                最大等级: maxLevel,
                当前角色可用: this.isEffectAvailable(target.特效限定, currentElement),
            }
        })

        return JSON.stringify(
            {
                mode,
                currentLevel: typeof params.level === "number" ? params.level : undefined,
                total: results.length,
                results,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 查询BUFF数据
     */
    private queryBuffData(buffName?: string): string {
        if (buffName) {
            const buffs = buffData.filter(b => b.名称.includes(buffName))
            return JSON.stringify(buffs, null, 2)
        }
        return JSON.stringify(
            buffData.map(b => ({
                名称: b.名称,
                描述: b.描述,
                限定: b.限定,
            })),
            null,
            2
        )
    }

    /**
     * 工具实现: 查询武器数据
     */
    private queryWeaponData(params: { weaponType?: string; category?: string }): string {
        let weapons = weaponData

        if (params.weaponType) {
            weapons = weapons.filter(w => w.类型[0] === params.weaponType)
        }
        if (params.category) {
            weapons = weapons.filter(w => w.类型[1] === params.category)
        }

        return JSON.stringify(
            {
                total: weapons.length,
                results: weapons.slice(0, 20),
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 设置计算技能与目标函数
     * @param params 目标参数
     * @returns 设置结果
     */
    private setBaseAndTargetFunction(params: { baseName?: string; targetFunction?: string }): string {
        const currentSettings = this.charSettings.value
        const currentBuild = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, currentSettings)
        const fallbackBaseName = currentSettings.baseName || currentBuild.charSkills[0]?.名称 || ""
        const requestedBaseName = params.baseName?.trim()
        const requestedTargetFunction = params.targetFunction?.trim()
        const nextBaseName = requestedBaseName ?? fallbackBaseName
        const nextTargetFunction =
            requestedTargetFunction === undefined ? currentSettings.targetFunction : requestedTargetFunction || "伤害"

        const probeSettings = {
            ...currentSettings,
            baseName: nextBaseName,
            targetFunction: nextTargetFunction,
        }
        const probeBuild = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, probeSettings)
        const availableSkillNames = probeBuild.allSkills.map(skill => skill.名称)

        if (requestedBaseName && !availableSkillNames.includes(requestedBaseName)) {
            return JSON.stringify(
                {
                    error: `无效的 baseName: ${requestedBaseName}`,
                    message: "请使用 getCurrentConfig 返回的可用技能名称。",
                    可用技能: availableSkillNames,
                },
                null,
                2
            )
        }

        const targetFunctionError = probeBuild.validateAST(nextTargetFunction)
        if (targetFunctionError) {
            return JSON.stringify(
                {
                    error: "目标函数表达式校验失败",
                    targetFunction: nextTargetFunction,
                    reason: targetFunctionError,
                },
                null,
                2
            )
        }

        this.charSettings.value = {
            ...currentSettings,
            baseName: nextBaseName,
            targetFunction: nextTargetFunction,
        }

        const finalBuild = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, this.charSettings.value)
        const targetPreview = finalBuild.calculateTargetFunction(finalBuild.calculateWeaponAttributes())

        return JSON.stringify(
            {
                message: "已更新计算技能与目标函数",
                当前配置: {
                    baseName: this.charSettings.value.baseName,
                    targetFunction: this.charSettings.value.targetFunction,
                    baseWithTarget: finalBuild.baseWithTarget,
                },
                目标函数预估值: Number.isFinite(targetPreview) ? Number(targetPreview.toFixed(4)) : targetPreview,
                可用技能: availableSkillNames,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 获取当前配置
     */
    private getCurrentConfig(): string {
        const build = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, this.charSettings.value)
        const baseName = this.charSettings.value.baseName || build.charSkills[0]?.名称 || ""
        const targetFunction = this.charSettings.value.targetFunction || "伤害"
        const targetFunctionError = build.validateAST(targetFunction)
        const targetPreview = build.calculateTargetFunction(build.calculateWeaponAttributes())
        const rst = {
            角色: this.selectedChar.value,
            等级: this.charSettings.value.charLevel,
            计算技能: baseName,
            目标函数: targetFunction,
            目标函数校验: targetFunctionError || "通过",
            目标函数标识符: build.getIdentifierNames(targetFunction),
            目标函数预估值: Number.isFinite(targetPreview) ? Number(targetPreview.toFixed(4)) : targetPreview,
            可用技能: build.allSkills.map(skill => skill.名称),
            角色MOD: this.charSettings.value.charMods.filter(m => m !== null).map(m => new LeveledMod(m[0], m[1]).toString()),
            近战MOD: this.charSettings.value.meleeMods.filter(m => m !== null).map(m => new LeveledMod(m[0], m[1]).toString()),
            远程MOD: this.charSettings.value.rangedMods.filter(m => m !== null).map(m => new LeveledMod(m[0], m[1]).toString()),
            同律MOD: this.charSettings.value.skillWeaponMods.filter(m => m !== null).map(m => new LeveledMod(m[0], m[1]).toString()),
            BUFF列表: this.charSettings.value.buffs.map(b => b[0]),
        }
        return JSON.stringify(rst, null, 2)
    }

    /**
     * 工具实现: 自动构建
     */
    private autoBuild(params: {
        useInv?: boolean
        includeTypes?: Array<ModTypeKey | "skillWeaponMods">
        preserveTypes?: Array<ModTypeKey | "skillWeaponMods">
        includeMelee?: boolean
        includeRanged?: boolean
        fixedMelee?: boolean
        fixedRanged?: boolean
        enableLog?: boolean
        apply?: boolean
    }): string {
        const autoBuildSetting = useLocalStorage("autobuild.setting", {
            useInv: true, // 使用用户库存
            includeTypes: [] as Array<ModTypeKey | "skillWeaponMods">, // 包含的MOD类型
            preserveTypes: [] as Array<ModTypeKey | "skillWeaponMods">, // 保留的MOD类型
            includeMelee: false, // 包含近战武器
            includeRanged: false, // 包含远程武器
        })

        const includeTypes = this.normalizeModTypes(params.includeTypes ?? autoBuildSetting.value.includeTypes)
        const preserveTypes = this.normalizeModTypes(params.preserveTypes ?? autoBuildSetting.value.preserveTypes)
        const useInv = params.useInv ?? autoBuildSetting.value.useInv
        const includeMelee =
            params.includeMelee ?? (typeof params.fixedMelee === "boolean" ? !params.fixedMelee : autoBuildSetting.value.includeMelee)
        const includeRanged =
            params.includeRanged ?? (typeof params.fixedRanged === "boolean" ? !params.fixedRanged : autoBuildSetting.value.includeRanged)
        const fixedMelee = typeof params.fixedMelee === "boolean" ? params.fixedMelee : !includeMelee
        const fixedRanged = typeof params.fixedRanged === "boolean" ? params.fixedRanged : !includeRanged
        const enableLog = params.enableLog ?? true
        const apply = params.apply ?? false

        const build = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, this.charSettings.value)
        const final = {
            includeTypes,
            preserveTypes,
            fixedMelee,
            fixedRanged,
            enableLog,
            modOptions: this.inv.getModsWithCount(useInv, includeTypes),
            meleeOptions: this.inv.getMeleeWeapons(useInv, build.char.属性),
            rangedOptions: this.inv.getRangedWeapons(useInv, build.char.属性),
        }
        const { newBuild, log, iter } = build.autoBuild(final)
        if (apply) {
            console.log("apply", newBuild)
            this.charSettings.value = {
                ...this.charSettings.value,
                charMods: newBuild.charMods.map(m => (m !== null ? [m.modId, m.level] : null)),
                meleeMods: newBuild.meleeMods.map(m => (m !== null ? [m.modId, m.level] : null)),
                rangedMods: newBuild.rangedMods.map(m => (m !== null ? [m.modId, m.level] : null)),
                skillWeaponMods: newBuild.skillMods.map(m => (m !== null ? [m.modId, m.level] : null)),
                meleeWeapon: newBuild.meleeWeapon.id,
                meleeWeaponLevel: newBuild.meleeWeapon.等级,
                meleeWeaponRefine: newBuild.meleeWeapon.精炼,
                rangedWeapon: newBuild.rangedWeapon.id,
                rangedWeaponLevel: newBuild.rangedWeapon.等级,
                rangedWeaponRefine: newBuild.rangedWeapon.精炼,
            }
        }
        return JSON.stringify(
            {
                自动构建参数: {
                    useInv,
                    includeTypes,
                    preserveTypes,
                    includeMelee,
                    includeRanged,
                    fixedMelee,
                    fixedRanged,
                    enableLog,
                    apply,
                },
                迭代次数: iter,
                目标函数结果: newBuild.calculate(),
                推荐武器: {
                    近战: this.buildWeaponSummary(newBuild.meleeWeapon),
                    远程: this.buildWeaponSummary(newBuild.rangedWeapon),
                },
                推荐MOD: newBuild.mods.map(mod => mod.toString()),
                日志: log,
            },
            null,
            2
        )
    }
    /**
     * 获取更新后的配置
     */
    public getUpdatedSettings(): { charSettings: any; selectedChar: string } {
        return {
            charSettings: this.charSettings.value,
            selectedChar: this.selectedChar.value,
        }
    }

    /**
     * 将输入消息转换为 LangChain 消息对象
     * @param userMessages 输入消息
     * @returns LangChain 消息列表
     */
    private toLangChainMessages(userMessages: Array<{ role: string; content: string }>): BaseMessage[] {
        const messages: BaseMessage[] = []
        for (const message of userMessages) {
            if (message.role === "user") {
                messages.push(new HumanMessage(message.content))
            } else if (message.role === "assistant") {
                messages.push(new AIMessage(message.content))
            } else if (message.role === "system") {
                messages.push(new SystemMessage(message.content))
            }
        }
        return messages
    }

    /**
     * 提取 AIMessage 的文本内容
     * @param content AIMessage内容
     * @returns 纯文本
     */
    private extractMessageText(content: MessageContent): string {
        if (typeof content === "string") {
            return content
        }
        if (!Array.isArray(content)) {
            return ""
        }
        return content
            .map(part => {
                if (typeof part === "string") {
                    return part
                }
                if ("type" in part && part.type === "text" && typeof part.text === "string") {
                    return part.text
                }
                return ""
            })
            .join("")
    }

    /**
     * 以 createAgent 流式执行并处理工具事件
     * @param onChunk 流式内容回调
     * @returns 更新后的消息上下文
     */
    private async invokeWithTools(onChunk: (chunk: string, type?: "reasoning" | "content" | "tool") => void): Promise<BaseMessage[]> {
        const stream = await this.agent.stream(
            {
                messages: this.contextMessages,
            },
            {
                streamMode: "values",
            }
        )

        let latestMessages = this.contextMessages
        let processedMessageCount = this.contextMessages.length

        for await (const rawChunk of stream as AsyncIterable<unknown>) {
            const chunk = rawChunk as { messages?: BaseMessage[] }
            if (!Array.isArray(chunk.messages) || chunk.messages.length === 0) {
                continue
            }
            latestMessages = chunk.messages
            const newMessages = latestMessages.slice(processedMessageCount)
            processedMessageCount = latestMessages.length

            for (const message of newMessages) {
                if (message instanceof AIMessage) {
                    const toolCalls = message.tool_calls || []
                    for (const toolCall of toolCalls) {
                        onChunk(`[工具调用] ${toolCall.name}\n参数:\n${this.formatToolValue(toolCall.args)}\n`, "tool")
                    }

                    if (toolCalls.length === 0) {
                        const content = this.extractMessageText(message.content)
                        if (content.trim()) {
                            onChunk(content, "content")
                        }
                    }
                    continue
                }

                if (message instanceof ToolMessage) {
                    const toolResult = this.extractMessageText(message.content)
                    const toolName = this.resolveToolNameByCallId(latestMessages, message.tool_call_id)
                    console.log("工具返回:", toolName, toolResult)
                    onChunk(`[工具返回] ${toolName}\n${toolResult}\n`, "tool")
                }
            }
        }

        return latestMessages
    }

    /**
     * 流式对话（LangChain实现）
     */
    public async streamChat(
        userMessages: Array<{ role: string; content: string }>,
        onChunk: (chunk: string, type?: "reasoning" | "content" | "tool") => void
    ): Promise<void> {
        if (this.isStreaming) {
            throw new Error("当前已有进行中的自动化流程，请稍后再试")
        }

        this.isStreaming = true
        this.syncSystemPrompt()
        this.normalizeToolCallContext()
        this.contextMessages.push(...this.toLangChainMessages(userMessages))

        try {
            this.contextMessages = await this.invokeWithTools(onChunk)
        } finally {
            this.isStreaming = false
        }
    }

    /**
     * 更新系统提示词（当角色切换时）
     */
    public updateSystemPrompt(charSettings: CharSettings, selectedChar: string): void {
        const isCharacterChanged = this.selectedChar.value !== selectedChar
        this.charSettings.value = charSettings
        this.selectedChar.value = selectedChar

        if (this.isStreaming) {
            return
        }
        this.syncSystemPrompt(isCharacterChanged)
    }
}
