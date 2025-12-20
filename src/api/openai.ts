import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"

// 智谱AI OpenAI兼容API接口
// 参考: https://docs.bigmodel.cn/cn/guide/develop/openai/introduction

// 智谱AI配置
export interface OpenAIConfig {
    api_key: string
    base_url: string
    timeout: number
    max_retries: number
    default_model: string
    default_temperature: number
    default_max_tokens: number
    system_prompt: string
}

// 默认配置
const DEFAULT_CONFIG: OpenAIConfig = {
    api_key: "",
    base_url: "https://open.bigmodel.cn/api/paas/v4/",
    timeout: 30000,
    max_retries: 3,
    default_model: "glm-4.6v-flash",
    default_temperature: 0.6,
    default_max_tokens: 1024,
    system_prompt: `## 角色定位

你是接入《二重螺旋》游戏的自动化操作 AI Agent，需通过调用指定工具（image_grab 截图分析、run_script 执行脚本实现鼠标键盘的控制），实现游戏核心流程的自动化执行，包括但不限于跑图探索、战斗攻坚、资源收集、角色养成等场景。
### 核心目标

优先完成高效资源积累：聚焦委托密函获取、魔之楔刷取、武器材料采集（优先 “无尽” 标签副本），兼顾角色突破与技能升级需求；
保障操作流畅性：遵循游戏立体移动与战斗机制，规避无效操作，提升任务完成效率；
规避养成误区：合理分配转移模块、魔之楔强化资源，避免低效率副本（如素材迁移关卡）。

### 游戏核心机制认知

#### 1. 基础操作映射（必须严格遵循）

移动：W/A/S/D 控制方向，鼠标控制视角
战斗：
鼠标左键 = 近战攻击（长按 = 蓄力攻击，跳跃 + 左键 = 下落攻击，Ctrl + 左键 = 滑铲攻击）
鼠标右键 = 远程攻击（部分场景长按可延长滞空 / 滑翔）
E = 角色E技能
Q = 角色Q技能
左 Shift = 闪避（可储存 2 次，按住方向键 = 定向冲刺）
螺旋飞跃 = 按键盘4，支持垂直攀升与长距离位移
交互：鼠标左键点击 NPC / 传送点 / 宝箱（需通过 imagegrab 识别交互图标）
武器切换：预设快捷键（默认 1 = 近战 / 2 = 远程，可通过 keyboardsend 执行）
#### 2. 核心系统规则

魔之楔/角色/武器养成：如果用户没有指定，不要默认培养升级任何东西，只根据用户需求进行培养。
副本优先级：探险/无尽＞金币副本＞魔之楔副本（无限刷），主线任务（1-44 级）优先解锁功能。
多倍委托手册：如果用户没有指定，不要使用

### 工具调用规则

#### 1. image_grab 截图分析职责
实时识别场景类型：战斗（敌人位置 / 血量条）、探索（传送点 / 解谜元素 / 交互 NPC）、副本结算（奖励类型识别）；
关键视觉判断：
识别 “无尽” 副本标签、委托任务类型（规避迁移关卡）；
检测敌人攻击预警（红色范围标识）、自身血量 / 神智值（蓝量）状态；
定位交互图标（NPC 对话气泡、宝箱、传送点高亮标识）。

#### 2. run_script 执行AHKv2脚本
可执行的脚本命令：
除标准AHK命令如Send/Click/MouseMove等
额外提供以下函数：
wait_color(x: number, y: number, color: string, tolerance: number = 10, timeout: number = 5000)：等待指定坐标的颜色变化，支持 RGB 颜色值（如 FF0000 表示红色），容差范围默认 10，超时时间默认 5 秒。
mover(x: number, y: number, duration: number = 40)：模拟鼠标移动相对坐标（如 mover(100, -200) 表示向右移动 100 像素，向上移动 200 像素），默认移动 40 毫秒。

#### 3. 决策逻辑优先级
场景判断：通过 image_grab 确认当前是战斗 / 探索 / 养成界面，匹配对应操作流程；
风险规避：战斗中通过 image_grab 识别敌人攻击范围，用 Shift 闪避 + 螺旋飞跃脱离危险区域；
资源取舍：委托任务优先选择 10 次保底高阶奖励（角色碎片 / 武器设计稿），材料采集优先 “无尽” 副本；
异常处理：若截图识别到 “兑换失败”“副本超时” 提示，通过 run_script 返回主城，重新规划目标。

### 安全限制
禁止高频重复点击同一位置（避免触发游戏防作弊机制）；
武器铸造需确认材料齐全（2 个利刃药剂 / 爆弹 + 对应部件）后再执行
魔之楔强化前需检查同品质素材数量，禁止过度消耗核心资源。
`,
}

// AI客户端类 - 统一配置管理和对话上下文
export class AIClient {
    private client: OpenAI | null = null
    private config: OpenAIConfig
    private messages: ChatCompletionMessageParam[] = []
    private isStreamInterrupted: boolean = false

    /**
     * 创建AI客户端实例
     * @param config 智谱AI配置
     */
    constructor(config: Partial<OpenAIConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.validateConfig()
        this.createClient()
        if (this.config.system_prompt) {
            this.addMessage({
                role: "system",
                content: this.config.system_prompt,
            })
        }
    }

    /**
     * 中断流式对话
     */
    public interruptStream(): void {
        this.isStreamInterrupted = true
    }

    /**
     * 验证配置参数
     */
    private validateConfig(): void {
        if (!this.config.api_key || this.config.api_key.trim() === "") {
            throw new Error("API密钥不能为空")
        }
    }

    /**
     * 创建OpenAI客户端实例
     */
    private createClient(): void {
        this.client = new OpenAI({
            apiKey: this.config.api_key,
            baseURL: this.config.base_url,
            timeout: this.config.timeout,
            maxRetries: this.config.max_retries,
            dangerouslyAllowBrowser: true,
        })
    }

    /**
     * 更新配置
     * @param newConfig 新配置
     */
    public updateConfig(newConfig: Partial<OpenAIConfig>): void {
        this.config = { ...this.config, ...newConfig }
        this.validateConfig()
        this.createClient()
    }

    /**
     * 获取当前配置
     */
    public getConfig(): OpenAIConfig {
        return { ...this.config }
    }

    /**
     * 添加消息到对话上下文
     * @param message 消息
     */
    public addMessage(message: ChatCompletionMessageParam): void {
        this.messages.push(message)
    }

    /**
     * 清除对话上下文
     */
    public clearContext(): void {
        this.messages = this.messages.length > 0 ? [this.messages[0]] : []
    }

    /**
     * 移除指定数量的消息（从末尾开始）
     * @param count 要移除的消息数量
     */
    public removeLastMessages(count: number): void {
        this.messages = this.messages.slice(0, this.messages.length - count)
    }

    /**
     * 发送聊天消息
     * @param message 消息内容
     * @param options 可选参数
     * @returns 聊天响应
     */
    public async chat(
        message: string,
        options?: {
            model?: string
            temperature?: number
            max_tokens?: number
            clearContext?: boolean
        },
    ): Promise<string> {
        try {
            if (!this.client) {
                throw new Error("客户端未初始化")
            }

            const model = options?.model || this.config.default_model
            const temperature = options?.temperature || this.config.default_temperature
            const max_tokens = options?.max_tokens || this.config.default_max_tokens

            // 清除上下文（如果需要）
            if (options?.clearContext) {
                this.clearContext()
            }
            // 构建消息数组
            this.addMessage({
                role: "user",
                content: message,
            })

            const completion = await this.client.chat.completions.create({
                model,
                messages: this.messages,
                temperature,
                max_tokens,
            })

            if (!completion.choices || completion.choices.length === 0) {
                throw new Error("API返回数据格式错误")
            }

            const response = completion.choices[0].message.content || ""

            // 更新上下文
            this.addMessage({
                role: "assistant",
                content: response,
            })

            return response
        } catch (error) {
            console.error("聊天请求失败:", error)
            if (error instanceof Error) {
                throw error
            }
            throw new Error("聊天请求失败，请检查网络连接和API配置")
        }
    }

    /**
     * 图片识别对话
     * @param imageUrl 图片URL或Base64
     * @param prompt 提示词，默认为"请详细描述这张图片"
     * @param options 可选参数
     * @returns 识别结果
     */
    public async chatWithImage(
        imageUrl: string,
        prompt: string = "请详细描述这张图片",
        options?: {
            model?: string
            temperature?: number
            max_tokens?: number
            clearContext?: boolean
        },
    ): Promise<string> {
        try {
            if (!this.client) {
                throw new Error("客户端未初始化")
            }

            const model = options?.model || this.config.default_model
            const temperature = options?.temperature || this.config.default_temperature
            const max_tokens = options?.max_tokens || this.config.default_max_tokens

            // 清除上下文（如果需要）
            if (options?.clearContext) {
                this.clearContext()
            }

            // 转换图片为Base64
            let base64Image: string
            if (imageUrl.startsWith("data:")) {
                base64Image = imageUrl
            } else {
                base64Image = await imageToBase64(imageUrl)
            }

            // 构建多模态消息
            const multimodalMessage = {
                role: "user" as const,
                content: [
                    {
                        type: "text" as const,
                        text: prompt,
                    },
                    {
                        type: "image_url" as const,
                        image_url: {
                            url: base64Image,
                        },
                    },
                ],
            }

            // 构建消息数组
            const messages = [...this.messages].map((m) => ({
                role: m.role,
                content: m.content,
            }))
            messages.push(multimodalMessage)

            const completion = await this.client.chat.completions.create({
                model,
                messages: messages as Array<ChatCompletionMessageParam>,
                temperature,
                max_tokens,
            })

            if (!completion.choices || completion.choices.length === 0) {
                throw new Error("API返回数据格式错误")
            }

            const response = completion.choices[0].message.content || ""

            // 更新上下文
            this.messages.push({
                role: "user",
                content: prompt, // 简化存储，只存文本提示
            })
            this.messages.push({
                role: "assistant",
                content: response,
            })

            return response
        } catch (error) {
            console.error("图片识别失败:", error)
            if (error instanceof Error) {
                throw error
            }
            throw new Error("图片识别失败，请检查网络连接和API配置")
        }
    }

    /**
     * 流式对话
     * @param messages 消息数组
     * @param onChunk 数据块回调
     * @param options 可选参数
     */
    public async streamChat(
        messages: ChatCompletionMessageParam[],
        onChunk: (chunk: string) => void,
        options?: {
            model?: string
            temperature?: number
            max_tokens?: number
            clearContext?: boolean
        },
    ): Promise<void> {
        try {
            if (!this.client) {
                throw new Error("客户端未初始化")
            }

            const model = options?.model || this.config.default_model
            const temperature = options?.temperature || this.config.default_temperature
            const max_tokens = options?.max_tokens || this.config.default_max_tokens

            // 清除上下文（如果需要）
            if (options?.clearContext) {
                this.messages = []
            }

            // 构建消息数组，包含历史对话
            const allMessages = [...this.messages].map((m) => ({
                role: m.role,
                content: m.content,
            }))

            // 添加新的消息（支持文本和图片消息）
            const filteredMessages = messages
                .filter((msg) => msg.role === "user" || msg.role === "assistant" || msg.role === "system")
                .map((msg) => ({
                    role: msg.role as "user" | "assistant" | "system",
                    content: msg.content,
                }))

            // 不需要类型断言，因为filteredMessages已经是正确的类型
            allMessages.push(...filteredMessages)

            // 重置中断状态
            this.isStreamInterrupted = false

            const stream = await this.client.chat.completions.create({
                model,
                messages: allMessages as Array<ChatCompletionMessageParam>,
                temperature,
                max_tokens,
                stream: true,
            })

            let fullResponse = ""
            for await (const chunk of stream) {
                // 检查是否需要中断
                if (this.isStreamInterrupted) {
                    // 清除中断状态，以便下次使用
                    this.isStreamInterrupted = false
                    break
                }

                const content = chunk.choices[0]?.delta?.content
                if (content) {
                    fullResponse += content
                    onChunk(content)
                }
            }

            // 更新上下文
            if (filteredMessages.length > 0) {
                // 添加用户的最新消息
                const lastMessage = filteredMessages[filteredMessages.length - 1]
                if (lastMessage.role === "user") {
                    // 确保内容类型正确
                    let messageContent: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] = ""
                    if (typeof lastMessage.content === "string") {
                        messageContent = lastMessage.content
                    } else if (Array.isArray(lastMessage.content)) {
                        // 过滤掉可能的ChatCompletionContentPartRefusal类型
                        messageContent = lastMessage.content.filter(
                            (part): part is OpenAI.Chat.Completions.ChatCompletionContentPart =>
                                "type" in part && (part.type === "text" || part.type === "image_url" || part.type === "file"),
                        )
                    }

                    this.messages.push({
                        role: "user",
                        content: messageContent,
                    })

                    // 添加助手的响应
                    this.messages.push({
                        role: "assistant",
                        content: fullResponse,
                    })
                }
            }
        } catch (error) {
            console.error("流式对话失败:", error)
            if (error instanceof Error) {
                throw error
            }
            throw new Error("流式对话失败，请检查网络连接和API配置")
        }
    }

    /**
     * 从API获取可用模型列表
     * @returns 模型列表
     */
    public async getAvailableModels() {
        try {
            if (!this.client) {
                throw new Error("客户端未初始化")
            }

            const models = await this.client.models.list()
            return models.data
                .filter((model) => model.id.startsWith("glm-"))
                .map((model) => ({
                    id: model.id,
                    name: model.id,
                    owned_by: model.owned_by,
                    supportsImage: model.id.includes("4v"),
                }))
        } catch (error) {
            console.error("获取模型列表失败:", error)
            return []
        }
    }

    /**
     * 获取当前客户端实例（用于高级操作）
     */
    public getClient(): OpenAI {
        if (!this.client) {
            throw new Error("客户端未初始化")
        }
        return this.client
    }

    /**
     * 验证API密钥是否有效
     * @returns 是否有效
     */
    public async validateApiKey(): Promise<boolean> {
        try {
            if (!this.client) {
                throw new Error("客户端未初始化")
            }

            // 发送一个简单的测试请求
            await this.client.chat.completions.create({
                model: this.config.default_model || "glm-4-flash",
                messages: [
                    {
                        role: "user" as const,
                        content: "Hello",
                    },
                ],
                max_tokens: 10,
            })
            return true
        } catch (error) {
            console.error("API密钥验证失败:", error)
            return false
        }
    }
}

/**
 * 验证API密钥是否有效（兼容导出函数）
 * @param config 智谱AI配置
 * @returns 是否有效
 */
export async function validateApiKey(config: Partial<OpenAIConfig>) {
    try {
        const client = new AIClient(config)
        return await client.validateApiKey()
    } catch (error) {
        console.error("API密钥验证失败:", error)
        return false
    }
}

/**
 * 获取可用模型列表（兼容导出函数）
 * @param config 智谱AI配置
 * @returns 模型列表
 */
export async function listModels(config: Partial<OpenAIConfig>) {
    try {
        const client = new AIClient(config)
        return await client.getAvailableModels()
    } catch (error) {
        console.error("获取模型列表失败:", error)
        return []
    }
}

/**
 * 图片转Base64编码
 * @param imageUrl 图片URL或File对象
 * @returns Base64编码的字符串
 */
export const imageToBase64 = async (imageUrl: string | File): Promise<string> => {
    try {
        let dataUrl: string

        if (typeof imageUrl === "string") {
            // 如果是URL，下载图片
            const response = await fetch(imageUrl)
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`)
            }
            const blob = await response.blob()
            dataUrl = await blobToDataURL(blob)
        } else {
            // 如果是File对象
            dataUrl = await blobToDataURL(imageUrl)
        }

        return dataUrl
    } catch (error) {
        console.error("Error converting image to base64:", error)
        throw new Error("图片转换失败")
    }
}

/**
 * 将Blob转换为DataURL
 */
const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}
