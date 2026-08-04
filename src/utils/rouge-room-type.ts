/**
 * 迷津房间类型（RougeLikeRoomType 表）映射。
 * 名称与图标均来自游戏 lua 数据：Script/Datas/RougeLikeRoomType.lua
 */

export interface RougeRoomTypeInfo {
    name: string
    icon: string
}

export const rougeRoomTypeMap: Record<number, RougeRoomTypeInfo> = {
    1: { name: "战斗", icon: "T_Rouge_Room01" },
    2: { name: "战斗", icon: "T_Rouge_Room04" },
    3: { name: "奇遇", icon: "T_Rouge_BlessingRoom_Event" },
    4: { name: "休整", icon: "T_Rouge_BlessingRoom_Shop" },
    5: { name: "高危战斗", icon: "T_Rouge_Room03" },
    6: { name: "战斗", icon: "T_Rouge_Room01" },
}

export function getRougeRoomTypeInfo(roomType: number): RougeRoomTypeInfo | undefined {
    return rougeRoomTypeMap[roomType]
}
