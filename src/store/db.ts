import type { EntityTable, TypedDB, Version } from "dexie"
import Dexie from "dexie"
import type { ChatImage } from "@/utils/chat-image"
export const db = new Dexie("dna") as unknown as TypedDB<DB>
declare module "dexie" {
    interface DBTable {
        id: number | string
    }
    type TypedDB<T extends { [k in keyof T]: DBTable }> = TypedDexie<T> & {
        [k in keyof T]: EntityTable<
            T[k],
            "id" // primary key "id" (for the typings only)
        >
    }

    type Schema<T> = {
        [k in keyof T]: string
    }

    interface TypedDexie<T> extends Dexie {
        version(versionNumber: number): TypedVersion<T>
    }

    interface TypedVersion<T> extends Version {
        stores(schema: Schema<T>): Version
    }
}

export interface Mod {
    id: number
    entity: string
    name: string
    files: string[]
    addTime: number
    size: number
    pic: string
}

export type UMod = Omit<Mod, "id">

export interface CustomEntity {
    id: number
    name: string
    icon: string
}

export type UCustomEntity = Omit<CustomEntity, "id">

/**
 * 已保存的游戏账号（cachedLogin 登录缓存）。
 */
export interface GameAccount {
    id: number
    name: string
    /** cachedLogin 文件内容 */
    content: string
    /** 添加时间戳 */
    addTime: number
    /** 最近使用时间戳 */
    lastUsed: number
}

export type UGameAccount = Omit<GameAccount, "id">

export interface EntityMod {
    id: number
    entity: string
    modid: number
}

export type UEntityMod = Omit<EntityMod, "id">

/**
 * 独立（standalone）分类下多选启用的 MOD 记录，一条表示一个已启用的 MOD。
 * 与 entityMods（单选，一个实体仅一个）不同，独立分类允许多个 MOD 同时启用。
 */
export interface EntityModMulti {
    id: number
    entity: string
    modid: number
}

export type UEntityModMulti = Omit<EntityModMulti, "id">

/**
 * 已下载的分享 MOD 记录：把在线商店的发布与本地导入的 MOD 关联起来，
 * 供商店卡片显示「已下载 / 可更新」状态，并在更新时先移除旧版本再导入新版本。
 * 主键即分享发布的 id（GameMod.id），一个发布只保留一条记录（记录最近一次安装的版本）。
 */
export interface InstalledShareMod {
    id: string
    /** 安装时的版本 id（对应 GameModVersion.id）。 */
    versionId: string
    /** 安装时的版本号标签（展示用，如 1.0.0）。 */
    version: string
    /** 安装时的压缩包大小（字节），版本信息缺失时用于兜底判断更新。 */
    fileSize: number
    /** 安装时该发布的 updateAt，远端重新上传后与当前值不一致即视为有新版本。 */
    modUpdateAt: number
    /** 安装时写入本地 MOD 列表的名称。 */
    localName: string
    /** 本地 MOD 所属实体/分类（独立分类为 STANDALONE_ENTITY）。 */
    entity: string
    /** 安装时间戳。 */
    installedAt: number
}

export type UInstalledShareMod = Omit<InstalledShareMod, "id">

/** 独立（standalone）分类使用的固定实体名称。 */
export const STANDALONE_ENTITY = "独立"

// AI对话相关接口
export interface Conversation {
    id: number
    name: string
    createdAt: number
    updatedAt: number
}

export type UConversation = Omit<Conversation, "id">

/**
 * 资料检索 Agent 在单条回复中发起的工具调用记录。
 * 与 src/api/dbAgent.ts 的 DBAgentToolTrace 结构保持一致（结构化类型可直接赋值）。
 */
export interface MessageToolTrace {
    /** 工具调用 ID */
    id: string
    /** 工具名 */
    name: string
    /** 工具展示名 */
    label: string
    /** 调用参数 */
    args: Record<string, unknown>
    /** 结果摘要 */
    summary: string
    /** 执行状态 */
    status: "running" | "done" | "error"
}

/**
 * 资料检索 Agent 单条回复中的一段思考内容。
 *
 * 一次运行可能产生多段思考（多轮工具调用之间各一段），每段折叠展示，
 * 其后的工具调用保持可见，形成「思考 → 检索 → 思考 → 检索 → 回答」的过程流。
 * 与 src/api/dbAgent.ts 的 DBAgentReasoningSegment 结构保持一致。
 */
export interface MessageReasoning {
    /** 思考内容 */
    text: string
    /** 该段思考后续发起的工具调用 id（用于把工具条挂到对应思考之后） */
    toolCallIds: string[]
}

export interface Message {
    id: number
    conversationId: number
    role: "user" | "assistant" | "system"
    content: string
    renderedContent?: string
    /**
     * `renderedContent` 对应的源文本快照。
     *
     * 仅用于前端渲染缓存：内容变化（流式追加）时据此判断是否需要重新渲染，
     * 不参与持久化。之所以不直接比较 `renderedContent`，
     * 是因为「源文本相同」才是复用的正确条件。
     */
    renderedContentSource?: string
    imageUrl?: string
    /**
     * 用户这条提问附带的图片（截图 / 配装面板等，Base64 内联）。
     *
     * 随消息落库是为了刷新或切换会话后还能看到自己发过什么；发给模型时
     * 只回灌最近若干轮（见 `useDBChat`），避免请求体随对话长度线性膨胀。
     */
    images?: ChatImage[]
    /** 该条回复过程中的资料检索工具调用（仅资料检索 Agent 使用） */
    toolTraces?: MessageToolTrace[]
    /** 该条回复过程中的分段思考内容（仅资料检索 Agent 使用） */
    reasonings?: MessageReasoning[]
    /**
     * 该条回复的检索过程总耗时（毫秒，仅资料检索 Agent 使用）。
     *
     * 用于过程完成后收成一行时展示「已完成 13m34s」。分多次运行
     * （ask_user 挂起后继续）时累加，不含用户作答的等待时间。
     * 历史消息可能没有这个字段，界面退化为只显示「已完成」。
     */
    processMs?: number
    /**
     * 该条回复挂起时等待用户回答的提问（仅资料检索 Agent 使用）。
     *
     * 落库是为了刷新/切换会话后仍能画出提问卡片；但 Agent 的内存上下文已经没了，
     * 因此恢复出来的卡片只能把用户的选择当作**新一轮提问**发出去，
     * 无法续跑原循环——这一区别由 useDBChat 的 `pendingAskLive` 区分。
     */
    pendingAsk?: MessagePendingAsk
    createdAt: number
}

/**
 * 落库的挂起提问（AskUserRequest 的持久化副本）。
 *
 * 单独声明而不是直接 `AskUserRequest`，是为了让 store 层保持可独立演进：
 * 提问结构改动时这里会显式报错，而不是悄悄把不兼容的数据写进 IndexedDB。
 */
export interface MessagePendingAsk {
    id: string
    title?: string
    questions: Array<{
        id: string
        header: string
        question?: string
        options: Array<{ id: string; label: string; description?: string }>
        allowCustom: boolean
        multiple: boolean
    }>
}

export type UMessage = Omit<Message, "id">

// 配装助手对话持久化接口
export interface BuildAgentChatMessage {
    role: "user" | "assistant"
    content: string
    reasoning?: string
}

export interface BuildAgentChat {
    id: string
    charName: string
    messages: BuildAgentChatMessage[]
    updatedAt: number
}

export type UBuildAgentChat = BuildAgentChat

// 节点编辑器相关接口
export interface NodeEditorGraph {
    id: number
    name: string
    nodes: any[]
    edges: any[]
    createdAt: number
    updatedAt: number
}

export type UNodeEditorGraph = Omit<NodeEditorGraph, "id">

export interface DNAUser {
    id: number
    uid: string // userId
    name: string // userName
    dev_code: string
    token: string
    server: "cn" | "global"
    kf_token: string
    refreshToken: string
    pic: string
    status: number
    isComplete: number
    isOfficial?: number
    isRegister?: number
    // userGameList: string[]
}

export type UDNAUser = Omit<DNAUser, "id">

export interface UserMapMarker {
    id: number
    mapId: number
    x: number
    y: number
    name: string
    desc?: string
    icon?: string
    categoryId?: number
    createdAt: number
    updatedAt: number
}

export type UUserMapMarker = Omit<UserMapMarker, "id">

// 道具流水记录
export interface PropFlow {
    id: number
    time: number // 时间戳
    prop_name: string // 道具名称
    category_id: string // 分类id
    category_name: string // 分类名称
    change: number // 数量变化（数值类型）
    remark: string // 备注
}

export type UPropFlow = Omit<PropFlow, "id">

export interface ScriptColorToolPoint {
    id: number
    x: number
    y: number
}

export interface ScriptColorToolImage {
    id: string
    name: string
    sourceDataUrl: string
}

export interface ScriptColorToolState {
    id: string
    images: ScriptColorToolImage[]
    imageLabels: Record<string, string>
    points: ScriptColorToolPoint[]
    pointTolerances: Record<number, number>
    pointInitialCheckColors: Record<number, string>
    pointCheckColorInputs: Record<number, string>
    pointCategoryForceChecks: Record<string, boolean>
    activeImageIndex: number
    zoomScale: number
    defaultTolerance: number
    realtimeTestCloudMode?: boolean
    updatedAt: number
}

export type UScriptColorToolState = ScriptColorToolState

interface DB {
    mods: Mod
    customEntitys: CustomEntity
    entityMods: EntityMod
    entityModsMulti: EntityModMulti
    installedShareMods: InstalledShareMod
    conversations: Conversation
    messages: Message
    buildAgentChats: BuildAgentChat
    dnaUsers: DNAUser
    userMapMarkers: UserMapMarker
    nodeEditorGraphs: NodeEditorGraph
    propFlows: PropFlow
    scriptColorToolStates: ScriptColorToolState
    gameAccounts: GameAccount
}

// 加表不需要改version!
db.version(1).stores({
    mods: "++id, entity, name",
    customEntitys: "++id, &name",
    entityMods: "++id, entity, modid",
    entityModsMulti: "++id, entity, modid",
    installedShareMods: "&id, installedAt",
    conversations: "++id, createdAt, updatedAt",
    messages: "++id, conversationId, createdAt",
    buildAgentChats: "&id, charName, updatedAt",
    dnaUsers: "++id, uid",
    userMapMarkers: "++id, mapId, createdAt",
    nodeEditorGraphs: "++id, name, createdAt, updatedAt",
    propFlows: "++id, time, prop_name, category_name",
    scriptColorToolStates: "&id, updatedAt",
    gameAccounts: "++id, name, addTime, lastUsed",
})
