import { AIClient, OpenAIConfig } from "./openai"
import { charData, modData, buffData, weaponData, CharBuild, ModTypeKey, LeveledMod } from "../data"
import type {
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionToolMessageParam,
} from "openai/resources/index.mjs"
import type { CharSettings, useCharSettings } from "../composables/useCharSettings"
import type { useInvStore } from "../store/inv"
import type { Ref } from "vue"
import { useLocalStorage } from "@vueuse/core"

/**
 * 角色配装AI Agent
 * 用于智能配置角色MOD、BUFF等
 */
export class BuildAgent {
    private client: AIClient

    constructor(
        private config: OpenAIConfig,
        public charSettings: ReturnType<typeof useCharSettings>,
        public selectedChar: Ref<string>,
        public inv: ReturnType<typeof useInvStore>
    ) {
        this.client = new AIClient({
            ...config,
            system_prompt: this.getSystemPrompt(),
        })
    }

    /**
     * 获取系统提示词
     */
    private getSystemPrompt(): string {
        return `## 角色定位
你是《二重螺旋》游戏的配装助手AI，专门帮助玩家优化角色MOD配置以最大化伤害输出。

### 当前状态
- 当前角色: ${this.selectedChar}
- 角色等级: ${this.charSettings.value.charLevel}
- 目标函数: ${this.charSettings.value.targetFunction}

### 核心能力
1. 理解玩家需求并调用工具自动设置角色、MOD、BUFF等配置
2. 基于游戏机制提供最优配装建议
3. 查询游戏数据（角色、MOD、BUFF、武器等信息）
4. 调用autobuild自动计算最优配置

### 可用工具
- setCharacter: 切换角色
- setBuff: 添加/移除BUFF
- setMod: 设置MOD（需要指定位置和等级）
- queryCharData: 查询角色数据
- queryModData: 查询MOD数据（支持按属性、类型、系列筛选, 默认返回当前配置下可装备的MOD）
- queryBuffData: 查询BUFF数据
- queryWeaponData: 查询武器数据
- getCurrentConfig: 获取当前配置信息
- autoBuild: 自动构建最优配置

### 工具使用规则
1. **必须通过工具来修改配置**，不要直接猜测
2. 查询数据后再给用户建议
3. 设置MOD时要考虑：
   - 属性匹配（MOD属性需与角色/武器属性一致）
   - 系列互斥（同一系列MOD只能装备一个，除非是契约者系列）
   - 名称互斥（某些MOD不能同时装备）
   - 库存限制（实际可用的MOD数量）
4. 优先使用autoBuild工具来计算最优配置

### 配置优化原则
1. 优先提升目标函数（伤害、总伤、暴击伤害、每秒伤害等）
2. 考虑MOD之间的联动和加成
3. 注意属性和系列匹配
4. 考虑武器类型（近战/远程）和伤害类型的匹配

### MOD装备规则
- 角色MOD: 8个槽位，必须与角色属性匹配
- 近战MOD: 8个槽位，必须与武器类别/伤害类型匹配
- 远程MOD: 8个槽位，必须与武器类别/伤害类型匹配
- 同律MOD: 4个槽位，必须与同律武器类型匹配
- 同一系列的MOD只能装备一个（契约者系列除外）
- 某些MOD有装备互斥，不能同时装备

### 回复风格
- 简洁明了，直接给出配置方案
- 说明配置思路和优化要点
- 解释为什么要选择某些MOD/BUFF
- 如需更多信息，主动询问玩家
- 使用中文回复

### 角色别名
- 赛琪: 蝴蝶
- 丽蓓卡: 水母
- 妮弗尔夫人: 夫人
- 黎瑟: 女警

### 示例对话
用户: "赛琪在带扶疏的情况下伤害最大化的MOD要怎么配"
AI: 我来帮你分析赛琪带扶疏的最优配置。让我先查询相关信息...
[调用setCharacter切换到赛琪]
[调用getCurrentConfig获取当前配置]
[调用queryCharData获取赛琪属性]
[调用queryBuffData查询扶疏相关BUFF]
[调用setBuff添加扶疏相关BUFF]
[(可选)调用queryModData查询风属性MOD]
[调用autoBuild自动计算]
根据分析，赛琪是风属性角色，最优配置方案是...
要我帮你配置到构筑模拟器上吗?
用户确认 -> [调用autoBuild将apply设为true或setMod设置MOD]
`
    }

    /**
     * 获取工具定义
     */
    private getTools() {
        return [
            {
                type: "function" as const,
                function: {
                    name: "setCharacter",
                    description: "切换到指定角色",
                    parameters: {
                        type: "object",
                        properties: {
                            charName: {
                                type: "string",
                                description: "角色名称（中文名）",
                                enum: charData.map(c => c.名称),
                            },
                        },
                        required: ["charName"],
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "setBuff",
                    description: "添加或移除BUFF",
                    parameters: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: ["add", "remove"],
                                description: "操作类型: add=添加, remove=移除",
                            },
                            buffName: {
                                type: "string",
                                description: "BUFF名称",
                                enum: buffData.map(c => c.名称),
                            },
                            level: {
                                type: "number",
                                description: "BUFF等级（可选，默认为BUFF的基础等级）",
                            },
                        },
                        required: ["action", "buffName"],
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "setMod",
                    description: "设置指定位置的MOD",
                    parameters: {
                        type: "object",
                        properties: {
                            modType: {
                                type: "string",
                                enum: ["角色", "近战", "远程", "同律"],
                                description: "MOD类型",
                            },
                            slotIndex: {
                                type: "number",
                                description: "槽位索引（0-7，同律为0-3）",
                                minimum: 0,
                                maximum: 7,
                            },
                            modId: {
                                type: "number",
                                description: "MOD ID",
                            },
                            level: {
                                type: "number",
                                description: "MOD等级（可选，默认为MOD最大等级）",
                            },
                        },
                        required: ["modType", "slotIndex", "modId"],
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "queryCharData",
                    description: "查询角色数据",
                    parameters: {
                        type: "object",
                        properties: {
                            charName: {
                                type: "string",
                                description: "角色名称（中文名）（可选）",
                            },
                        },
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "queryModData",
                    description: "查询MOD数据，支持按属性、类型、系列筛选",
                    parameters: {
                        type: "object",
                        properties: {
                            element: {
                                type: "string",
                                description: "元素属性（可选）",
                                enum: ["火", "水", "雷", "风", "暗", "光"],
                            },
                            modType: {
                                type: "string",
                                description: "MOD类型（可选）",
                                enum: ["角色", "近战", "远程", "同律"],
                            },
                            series: {
                                type: "string",
                                description: "MOD系列（可选，如：扶疏、契约者等）",
                            },
                            keywords: {
                                type: "string",
                                description: "关键词搜索（可选，会在名称、属性和效果中搜索）",
                            },
                        },
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "queryBuffData",
                    description: "查询BUFF数据",
                    parameters: {
                        type: "object",
                        properties: {
                            buffName: {
                                type: "string",
                                description: "BUFF名称或关键词",
                            },
                        },
                        required: ["buffName"],
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "queryWeaponData",
                    description: "查询武器数据",
                    parameters: {
                        type: "object",
                        properties: {
                            weaponType: {
                                type: "string",
                                description: "武器类型（可选）",
                                enum: ["近战", "远程", "同律近战", "同律远程"],
                            },
                            category: {
                                type: "string",
                                description: "武器类别（可选）",
                                enum: ["单手剑", "长柄", "重剑", "双刀", "鞭刃", "太刀", "手枪", "双枪", "榴炮", "霰弹枪", "突击枪", "弓"],
                            },
                        },
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "getCurrentConfig",
                    description: "获取当前角色的配置信息（包含角色MOD数组[modId,modLevel][]、武器MOD、BUFF）",
                    parameters: {
                        type: "object",
                        properties: {},
                    },
                },
            },
            {
                type: "function" as const,
                function: {
                    name: "autoBuild",
                    description: "自动构建最优MOD配置（调用CharBuild的autoBuild方法）",
                    parameters: {
                        type: "object",
                        properties: {
                            includeTypes: {
                                type: "array",
                                items: {
                                    type: "string",
                                    enum: ["charMods", "meleeMods", "rangedMods", "skillWeaponMods"],
                                },
                                description: "需要自动构建的MOD类型数组",
                            },
                            preserveTypes: {
                                type: "array",
                                items: {
                                    type: "string",
                                    enum: ["charMods", "meleeMods", "rangedMods", "skillWeaponMods"],
                                },
                                description: "保留当前配置的MOD类型数组",
                            },
                            fixedMelee: {
                                type: "boolean",
                                description: "是否固定近战武器(默认true)",
                            },
                            fixedRanged: {
                                type: "boolean",
                                description: "是否固定远程武器(默认true)",
                            },
                            apply: {
                                type: "boolean",
                                description: "是否应用自动构建结果(默认false)",
                            },
                        },
                        required: ["includeTypes"],
                    },
                },
            },
        ] satisfies ChatCompletionTool[]
    }

    /**
     * 处理工具调用
     */
    private async handleToolCall(toolCall: ChatCompletionMessageFunctionToolCall): Promise<string> {
        const functionName = toolCall.function.name
        const args = JSON.parse(toolCall.function.arguments)
        console.log("工具调用:", functionName, args)

        switch (functionName) {
            case "setCharacter":
                return this.setCharacter(args.charName)
            case "setBuff":
                return this.setBuff(args.action, args.buffName, args.level)
            case "setMod":
                return this.setMod(args.modType, args.slotIndex, args.modId, args.level)
            case "queryCharData":
                return this.queryCharData(args.charName)
            case "queryModData":
                return this.queryModData(args)
            case "queryBuffData":
                return this.queryBuffData(args.buffName)
            case "queryWeaponData":
                return this.queryWeaponData(args)
            case "getCurrentConfig":
                return this.getCurrentConfig()
            case "autoBuild":
                return this.autoBuild(args)
            default:
                return `未知工具: ${functionName}`
        }
    }

    /**
     * 工具实现: 设置角色
     */
    private setCharacter(charName: string): string {
        this.selectedChar.value = charName

        const char = charData.find(c => c.名称 === charName)
        if (char) {
            return `已切换到角色: ${charName}
属性: ${char.属性}
精通: ${char.精通}
同律武器: ${char.同律武器 || "无"}
当前MOD配置: ${JSON.stringify(this.charSettings.value.charMods)}
`
        }
        return `未找到角色: ${charName}`
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
    private queryCharData(charName?: string): string {
        if (charName) {
            const char = charData.find(c => c.名称 === charName)
            if (!char) {
                return `未找到角色: ${charName}`
            }
            return JSON.stringify(
                {
                    名称: char.名称,
                    属性: char.属性,
                    精通: char.精通,
                    同律武器: char.同律武器,
                    技能: char.技能.map(s => s.名称),
                },
                null,
                2
            )
        }

        return JSON.stringify(
            charData.map(c => ({
                名称: c.名称,
                属性: c.属性,
                精通: c.精通,
                同律武器: c.同律武器,
            })),
            null,
            2
        )
    }

    /**
     * 工具实现: 查询MOD数据
     */
    private queryModData(params: { element?: string; modType?: string; series?: string; keywords?: string }): string {
        let mods = modData

        if (params.element) {
            mods = mods.filter(m => m.属性 === params.element)
        }
        if (params.modType) {
            mods = mods.filter(m => m.类型 === params.modType)
        }
        if (params.series) {
            mods = mods.filter(m => m.系列 === params.series)
        }
        if (params.keywords) {
            const keyword = params.keywords.toLowerCase()
            mods = mods.filter(m => m.名称.toLowerCase().includes(keyword) || (m.效果 && m.效果.toLowerCase().includes(keyword)))
        }

        // 限制返回数量
        const results = mods.slice(0, 20)

        return JSON.stringify(
            {
                total: mods.length,
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
     * 工具实现: 获取当前配置
     */
    private getCurrentConfig(): string {
        const rst = {
            角色: this.selectedChar,
            等级: this.charSettings.value.charLevel,
            目标函数: this.charSettings.value.targetFunction,
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
        includeTypes: ModTypeKey[]
        preserveTypes?: ModTypeKey[]
        fixedMelee?: boolean
        fixedRanged?: boolean
        apply?: boolean
    }): string {
        const autoBuildSetting = useLocalStorage("autobuild.setting", {
            useInv: false, // 使用用户库存
            includeTypes: [] as ModTypeKey[], // 包含的MOD类型
            preserveTypes: [] as ModTypeKey[], // 保留的MOD类型
            includeMelee: false, // 包含近战武器
            includeRanged: false, // 包含远程武器
        })
        const build = CharBuild.fromCharSetting(this.selectedChar.value, this.inv, this.charSettings.value)
        params = { ...autoBuildSetting, ...params }
        const final = {
            modOptions: this.inv.getModsWithCount(autoBuildSetting.value.useInv, autoBuildSetting.value.includeTypes),
            meleeOptions: this.inv.getMeleeWeapons(autoBuildSetting.value.useInv, build.char.属性),
            rangedOptions: this.inv.getRangedWeapons(autoBuildSetting.value.useInv, build.char.属性),
            ...params,
        }
        const result = build.autoBuild(final)
        if (params.apply) {
            this.charSettings.value.charMods = result.newBuild.charMods.map(m => (m !== null ? [m.modId, m.level] : null))
            this.charSettings.value.meleeMods = result.newBuild.meleeMods.map(m => (m !== null ? [m.modId, m.level] : null))
            this.charSettings.value.rangedMods = result.newBuild.rangedMods.map(m => (m !== null ? [m.modId, m.level] : null))
            this.charSettings.value.skillWeaponMods = result.newBuild.skillMods.map(m => (m !== null ? [m.modId, m.level] : null))
            this.charSettings.value.meleeWeapon = result.newBuild.meleeWeapon.id
            this.charSettings.value.meleeWeaponRefine = result.newBuild.meleeWeapon.精炼
            this.charSettings.value.rangedWeapon = result.newBuild.rangedWeapon.id
            this.charSettings.value.rangedWeaponRefine = result.newBuild.rangedWeapon.精炼
        }
        return `自动构建参数: ${JSON.stringify(params, null, 2)}
目标函数结果: ${result.newBuild.calculate()}
${result.newBuild.mods.map(v => v.toString()).join("\n")}`
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
     * 流式对话
     * 使用AIClient的streamChatWithTools方法
     */
    public async streamChat(
        userMessages: Array<{ role: string; content: string }>,
        onChunk: (chunk: string, type?: "reasoning" | "content") => void
    ): Promise<void> {
        // 转换消息格式
        const chatMessages: ChatCompletionMessageParam[] = userMessages.map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
        }))

        const tools = this.getTools()

        // 使用AIClient的streamChatWithTools方法
        await this.client.streamChatWithTools(
            chatMessages,
            tools,
            onChunk,
            async toolCalls => {
                // 处理工具调用
                const results: ChatCompletionToolMessageParam[] = []
                for (const toolCall of toolCalls) {
                    const result = await this.handleToolCall(toolCall)
                    results.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    })
                }

                return results
            },
            {
                model: this.config.default_model,
                temperature: this.config.default_temperature,
                max_tokens: this.config.default_max_tokens,
            }
        )
    }

    /**
     * 更新系统提示词（当角色切换时）
     */
    public updateSystemPrompt(charSettings: CharSettings, selectedChar: string): void {
        this.charSettings.value = charSettings
        this.selectedChar.value = selectedChar
        this.client.clearContext()
        this.client.addMessage({
            role: "system",
            content: this.getSystemPrompt(),
        })
    }
}
