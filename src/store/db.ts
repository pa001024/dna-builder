import Dexie from "dexie"
import type { TypedDB, EntityTable, Version } from "dexie"
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

export interface EntityMod {
    id: number
    entity: string
    modid: number
}

export type UEntityMod = Omit<EntityMod, "id">

// AI对话相关接口
export interface Conversation {
    id: number
    name: string
    createdAt: number
    updatedAt: number
}

export type UConversation = Omit<Conversation, "id">

export interface Message {
    id: number
    conversationId: number
    role: "user" | "assistant" | "system"
    content: string
    renderedContent?: string
    imageUrl?: string
    createdAt: number
}

export type UMessage = Omit<Message, "id">

export interface DNAUser {
    id: number
    uid: string // userId
    name: string // userName
    dev_code: string
    token: string
    refreshToken: string
    pic: string
    status: number
    isComplete: number
    isOfficial?: number
    isRegister?: number
    // userGameList: string[]
}

export type UDNAUser = Omit<DNAUser, "id">

interface DB {
    mods: Mod
    customEntitys: CustomEntity
    entityMods: EntityMod
    conversations: Conversation
    messages: Message
    dnaUsers: DNAUser
}

// 索引列表
db.version(1).stores({
    mods: "++id, entity, name",
    customEntitys: "++id, &name",
    entityMods: "++id, entity, modid",
    conversations: "++id, createdAt, updatedAt",
    messages: "++id, conversationId, createdAt",
    dnaUsers: "++id, uid",
})
