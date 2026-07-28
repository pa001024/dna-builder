export interface IconTicket {
    id: number
    name: string
    desc: string
    func: string
    icon: string
    level: number
    rarity: number
    accessKey?: string[]
}

export const iconticketData: IconTicket[] = [
    {
        id: 1001,
        name: "深境罗盘·探险",
        desc: "追随灾厄的脚步，寻觅倾覆世界的力量，以罗盘指引前进的方向。\n可用于进入深境委托。",
        func: "用于进入深境委托",
        icon: "T_Resource_Coin_Zaie",
        level: 100,
        rarity: 5,
        accessKey: ["Forging"],
    },
    {
        id: 1002,
        name: "深境罗盘·扼守",
        desc: "追随灾厄的脚步，寻觅倾覆世界的力量，以罗盘指引前进的方向。\n可用于进入深境委托。",
        func: "用于进入深境委托",
        icon: "T_Resource_Coin_Zaie01",
        level: 100,
        rarity: 5,
        accessKey: ["Forging"],
    },
]
export const iconticketMap = new Map(iconticketData.map(ticket => [ticket.id, ticket]))

export default iconticketData
