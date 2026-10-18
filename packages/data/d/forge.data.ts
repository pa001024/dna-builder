export interface ForgeLevel {
    ForgeLevel: number
    ForgeLevelQuestId: number[]
    ForgeLevelReward: number
    HyperWeaponMaxCardLevel: number
}
export interface ForgeLevelQuest {
    id: number
    desc: string
    target: number
    targetId: number[]
    reward: number[]
}
export const forgeLevelData: ForgeLevel[] = [
    {
        ForgeLevel: 1,
        ForgeLevelQuestId: [1040800, 1040810],
        ForgeLevelReward: 104081,
        HyperWeaponMaxCardLevel: 1,
    },
    {
        ForgeLevel: 2,
        ForgeLevelQuestId: [1040801],
        ForgeLevelReward: 104082,
        HyperWeaponMaxCardLevel: 2,
    },
    {
        ForgeLevel: 3,
        ForgeLevelQuestId: [1040802, 1040812],
        ForgeLevelReward: 104083,
        HyperWeaponMaxCardLevel: 3,
    },
    {
        ForgeLevel: 4,
        ForgeLevelQuestId: [1040803],
        ForgeLevelReward: 104084,
        HyperWeaponMaxCardLevel: 4,
    },
    {
        ForgeLevel: 5,
        ForgeLevelQuestId: [1040804, 1040814],
        ForgeLevelReward: 104085,
        HyperWeaponMaxCardLevel: 5,
    },
]

export const forgeLevelQuestData: ForgeLevelQuest[] = [
    {
        id: 1040800,
        desc: "持有1把灾厄武器",
        target: 1,
        targetId: [1040800],
        reward: [1040800],
    },
    {
        id: 1040801,
        desc: "持有1把熔炼等级<H>1</>的灾厄武器",
        target: 1,
        targetId: [1040801],
        reward: [1040801],
    },
    {
        id: 1040802,
        desc: "持有1把熔炼等级<H>2</>的灾厄武器",
        target: 1,
        targetId: [1040802],
        reward: [1040802],
    },
    {
        id: 1040803,
        desc: "持有1把熔炼等级<H>3</>的灾厄武器",
        target: 1,
        targetId: [1040803],
        reward: [1040803],
    },
    {
        id: 1040804,
        desc: "持有1把熔炼等级<H>4</>的灾厄武器",
        target: 1,
        targetId: [1040804],
        reward: [1040804],
    },
    {
        id: 1040810,
        desc: "完成支线任务“铸造灾厄武器·一”",
        target: 1,
        targetId: [1040810],
        reward: [1040810],
    },
    {
        id: 1040812,
        desc: "完成支线任务“铸造灾厄武器·二”",
        target: 1,
        targetId: [1040812],
        reward: [1040812],
    },
    {
        id: 1040814,
        desc: "完成支线任务“铸造灾厄武器·三”",
        target: 1,
        targetId: [1040814],
        reward: [1040814],
    },
]
