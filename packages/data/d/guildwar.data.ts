/**
 * 协会战（狭义公会战 GuildBoss）：强敌 / 增益 / 试炼 / 轮换 / 点数奖励 / 周阶段奖励。
 *
 * 由 `tools/import-i18n-data.ts` 从 i18n 导出的 GuildBoss.json 生成，请勿手动修改；
 * 数据更新请运行 `bun tools/import-i18n-data.ts -f GuildBoss`。
 * 文本只有简体中文一套，界面显示时经 `gt()` / `$t()` 走译文对照表。
 * 奖励只存 ID，由 Reward 解析；2900x 副本直读原表（dungeon 过滤器未收录时仅展示 ID）。
 */

/** 协会战强敌 */
export interface GuildWarBoss {
    id: number
    name: string
    desc: string
    dungeonId: number
    timeLimit: number
    hp: number
    baseRate: number
    buffs: number[]
    testTypes: number[]
}

/** 协会战增益 */
export interface GuildWarBuff {
    id: number
    buffIds: number[]
    desc: string
    icon: string
}

/** 协会战试炼 */
export interface GuildWarTest {
    id: number
    type: number
    keyword: string
    desc: string
    cond: Record<string, string>
    rule: Record<string, number>
    rate: number
}

/** 协会战轮换 */
export interface GuildWarRefresh {
    id: number
    startTime: number
    bossIds: number[]
}

/** 协会战点数奖励档 */
export interface GuildWarPointReward {
    id: number
    lv: number
    eachPoints: number
    rewards: number[]
}

/** 协会战周阶段奖励 */
export interface GuildWarWeekReward {
    stage: number
    constructionPoint: number
    reward: number
}

export const guildWarBosses: GuildWarBoss[] = [
    {
        id: 8502701,
        name: "羽化者",
        desc: "冻土中的种子，错过了温和地走入夜幕的契机。",
        dungeonId: 29001,
        timeLimit: 90,
        hp: 120000000000,
        baseRate: 9232.46,
        buffs: [1, 2, 8502],
        testTypes: [1, 2, 3],
    },
    {
        id: 8505701,
        name: "炼火的典狱长",
        desc: "帝国皇家军事监狱典狱长，她的锁链将会惩戒罪恶，她的火焰将会坚守正义。",
        dungeonId: 29002,
        timeLimit: 90,
        hp: 120000000000,
        baseRate: 9232.46,
        buffs: [1, 2, 8505],
        testTypes: [1, 2, 3],
    },
    {
        id: 8509701,
        name: "？？？",
        desc: "鲜红的帷幕之下，寒风奏响了雪国的哀歌。",
        dungeonId: 29003,
        timeLimit: 90,
        hp: 120000000000,
        baseRate: 9232.46,
        buffs: [1, 2, 8509],
        testTypes: [1, 2, 3],
    },
    {
        id: 8512701,
        name: "雪国的野兽",
        desc: "那是肆虐在雪国的野兽，摧毁了孩子们的故乡，融化了妖精的碎梦。",
        dungeonId: 29004,
        timeLimit: 90,
        hp: 120000000000,
        baseRate: 9232.46,
        buffs: [1, 2, 8512],
        testTypes: [1, 2, 3],
    },
]

export const guildWarBuffs: GuildWarBuff[] = [
    {
        id: 1,
        buffIds: [3021001],
        desc: "强敌单位防御提高3000。",
        icon: "T_Abyss_Buff_Mon_Survive01",
    },
    {
        id: 2,
        buffIds: [3021002],
        desc: "强敌单位无法被削减战姿。",
        icon: "T_Abyss_Buff_Mon_Boss",
    },
    {
        id: 8502,
        buffIds: [3021003],
        desc: "羽化者可以使用[熄光哀歌]。",
        icon: "T_Abyss_Buff_Mon_Survive02",
    },
    {
        id: 8505,
        buffIds: [3021003],
        desc: "炼火的典狱长可以使用[罪孽昭告]。",
        icon: "T_Abyss_Buff_Mon_Survive02",
    },
    {
        id: 8509,
        buffIds: [3021003],
        desc: "？？？可以使用[愤怒的咆哮]。",
        icon: "T_Abyss_Buff_Mon_Survive02",
    },
    {
        id: 8512,
        buffIds: [3021003],
        desc: "雪国的野兽可以使用[枪炮交响曲]。",
        icon: "T_Abyss_Buff_Mon_Survive02",
    },
]

export const guildWarTests: GuildWarTest[] = [
    {
        id: 101,
        type: 1,
        keyword: "技能伤害",
        desc: "累计造成1000次技能伤害。",
        cond: {
            DamageTag: "Skill",
        },
        rule: {
            Hit: 1000,
        },
        rate: 2000000,
    },
    {
        id: 102,
        type: 1,
        keyword: "武器伤害",
        desc: "累计造成2000次武器伤害。",
        cond: {
            DamageTag: "Weapon",
        },
        rule: {
            Hit: 2000,
        },
        rate: 2000000,
    },
    {
        id: 201,
        type: 2,
        keyword: "暴击伤害",
        desc: "累计造成2000次暴击伤害。",
        cond: {
            Extra: "Crit",
        },
        rule: {
            Hit: 2000,
        },
        rate: 2000000,
    },
    {
        id: 202,
        type: 2,
        keyword: "触发属性额外效果",
        desc: "累计触发10000次属性额外效果。",
        cond: {
            Extra: "Trigger",
        },
        rule: {
            Hit: 10000,
        },
        rate: 2000000,
    },
    {
        id: 203,
        type: 2,
        keyword: "追加伤害",
        desc: "累计造成8000次追加伤害。",
        cond: {
            Extra: "Trigger",
        },
        rule: {
            Hit: 8000,
        },
        rate: 2000000,
    },
    {
        id: 204,
        type: 2,
        keyword: "持续伤害",
        desc: "累计造成2500次持续伤害。",
        cond: {
            Extra: "Trigger",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 301,
        type: 3,
        keyword: "水属性伤害",
        desc: "累计造成2500次水属性伤害。",
        cond: {
            DamageType: "Water",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 302,
        type: 3,
        keyword: "火属性伤害",
        desc: "累计造成2500次火属性伤害。",
        cond: {
            DamageType: "Fire",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 303,
        type: 3,
        keyword: "风属性伤害",
        desc: "累计造成2500次风属性伤害。",
        cond: {
            DamageType: "Wind",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 304,
        type: 3,
        keyword: "雷属性伤害",
        desc: "累计造成2500次雷属性伤害。",
        cond: {
            DamageType: "Thunder",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 305,
        type: 3,
        keyword: "光属性伤害",
        desc: "累计造成2500次光属性伤害。",
        cond: {
            DamageType: "Light",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
    {
        id: 306,
        type: 3,
        keyword: "暗属性伤害",
        desc: "累计造成2500次暗属性伤害。",
        cond: {
            DamageType: "Dark",
        },
        rule: {
            Hit: 2500,
        },
        rate: 2000000,
    },
]

export const guildWarRefresh: GuildWarRefresh[] = [
    {
        id: 1,
        startTime: 1785704400,
        bossIds: [8502701, 8512701, 8505701],
    },
    {
        id: 2,
        startTime: 1789333200,
        bossIds: [8512701, 8502701, 8505701],
    },
    {
        id: 3,
        startTime: 1792962000,
        bossIds: [8502701, 8512701, 8505701],
    },
]

export const guildWarPointRewards: GuildWarPointReward[] = [
    {
        id: 101,
        lv: 20,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
    {
        id: 102,
        lv: 30,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
    {
        id: 103,
        lv: 40,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
    {
        id: 104,
        lv: 50,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
    {
        id: 105,
        lv: 55,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
    {
        id: 106,
        lv: 60,
        eachPoints: 800000,
        rewards: [55150, 55151, 55152, 55153, 55154],
    },
]

export const guildWarWeekRewards: GuildWarWeekReward[] = [
    {
        stage: 20,
        constructionPoint: 800,
        reward: 103004101,
    },
    {
        stage: 40,
        constructionPoint: 1000,
        reward: 103004102,
    },
    {
        stage: 60,
        constructionPoint: 1200,
        reward: 103004103,
    },
    {
        stage: 80,
        constructionPoint: 1400,
        reward: 103004104,
    },
    {
        stage: 100,
        constructionPoint: 1600,
        reward: 103004105,
    },
]
