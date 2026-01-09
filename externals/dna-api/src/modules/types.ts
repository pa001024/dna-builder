export interface DNARoleForToolInstance {
    id: number
    name: string
    code: string
    on: number
}

export interface DNARoleForToolInstanceInfo {
    instances: DNARoleForToolInstance[]
}

export enum PostContentType {
    TEXT = 1,
    IMAGE = 2,
    VIDEO = 5,
}

export const DNA_GAME_ID = 268
