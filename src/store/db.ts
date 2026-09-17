import type { EntityTable, TypedDB, Version } from "dexie"
import Dexie from "dexie"
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

export interface Message {
    id: number
    conversationId: number
    role: "user" | "assistant" | "system"
    content: string
    renderedContent?: string
    imageUrl?: string
    /** 该条回复过程中的资料检索工具调用（仅资料检索 Agent 使用） */
    toolTraces?: MessageToolTrace[]
    createdAt: number
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
