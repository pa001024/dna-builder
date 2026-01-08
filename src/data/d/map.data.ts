export interface DBMap {
    id: number
    n: string
    name: string
    desc?: string
    e?: string
    mapUrl: string
    icon?: string
    width?: number
    height?: number
    tileSize?: number
    floors?: DBMapFloor[]
    currentFloorIndex?: number
}

export interface DBMapFloor {
    id: number
    name: string
    pic: string
}

export interface DBMapMarker {
    id: number
    mapId: number
    x: number
    y: number
    name: string
    desc?: string
    icon?: string
    categoryId?: number
    isUserMarker: boolean // 明确标记是否为用户自定义标点
    createdAt?: number
}
