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
        desc: "用于开启深境探险",
        func: "深境罗盘",
        icon: "T_Resource_Coin_Zaie",
        level: 100,
        rarity: 5,
        accessKey: ["Forging"],
    },
    {
        id: 1002,
        name: "深境罗盘·探险",
        desc: "用于开启深境探险",
        func: "深境罗盘",
        icon: "T_Resource_Coin_Zaie",
        level: 90,
        rarity: 3,
    },
]
export const iconticketMap = new Map(iconticketData.map(ticket => [ticket.id, ticket]))

export default iconticketData
