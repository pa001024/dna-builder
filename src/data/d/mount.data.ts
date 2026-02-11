export interface Mount {
    id: number
    name: string
    des: string
    icon: string
    resourceIcon: string
    rarity: number
    sort: number
    resourceId: number
    fly?: number
    access: string[]
}

export const mountData: Mount[] = [
    {
        id: 1000,
        name: "拟真玄色狴犴",
        des: "由公尚研发的机枢载具，如同真正的玄色狴犴一般逼真。若是骑着它在烟津渡横冲直撞，定然会引来路人纷纷瞠目吧。",
        icon: "Mounts_0002",
        resourceIcon: "Icon_Mounts_0002",
        rarity: 4,
        sort: 97,
        resourceId: 49999,
        fly: 1,
        access: ["完成任务「虬先生的投资」获取"],
    },
    {
        id: 1001,
        name: "拟真太皓",
        des: "由公尚研发的机枢载具，肖似白龙神君。全华胥只有这一件，珍藏在公尚的工坊里——还好只有这一件，否则要是太皓大人满天飞，想必天礼司肯定会很不高兴，找上门来。但是公尚不以为意，一心想要量产化。让我们祝他好运。\n飞行速度提高50%,无需持有声名许可也能进行飞行。",
        icon: "Mounts_0001",
        resourceIcon: "Icon_Mounts_0001",
        rarity: 6,
        sort: 100,
        resourceId: 49998,
        access: ["棱镜商店限时兑换"],
    },
    {
        id: 1002,
        name: "银翼骑士",
        des: "不朽将逝去，如眼泪消失在雨中。",
        icon: "Mounts_0003",
        resourceIcon: "Icon_Mounts_0003",
        rarity: 5,
        sort: 99,
        resourceId: 49997,
        fly: 1,
        access: ["商店"],
    },
    {
        id: 1003,
        name: "榛子冲冲冲",
        des: "呼噜呼噜？呼噜呼噜。呼噜呼噜！",
        icon: "Mounts_0004",
        resourceIcon: "Icon_Mounts_0004",
        rarity: 4,
        sort: 98,
        resourceId: 49996,
        fly: 1,
        access: ["商店"],
    },
]
