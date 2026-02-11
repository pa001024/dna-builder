import Fuse from "fuse.js"
import { t } from "i18next"
import { charMap } from "@/data/d"
import { abyssDungeons } from "@/data/d/abyss.data"
import { charAccessoryData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import achievementData from "@/data/d/achievement.data"
import charData from "@/data/d/char.data"
import draftData from "@/data/d/draft.data"
import dungeonData from "@/data/d/dungeon.data"
import dynQuestData from "@/data/d/dynquest.data"
import { fishingSpots, fishs } from "@/data/d/fish.data"
import { hardBossMap } from "@/data/d/hardboss.data"
import modData from "@/data/d/mod.data"
import monsterData from "@/data/d/monster.data"
import partyTopicData from "@/data/d/partytopic.data"
// import npcData from "@/data/d/npc.data"
import petData, { petEntrys } from "@/data/d/pet.data"
import questChainData from "@/data/d/questchain.data"
import { RaidDungeon } from "@/data/d/raid.data"
import { regionMap } from "@/data/d/region.data"
import shopData from "@/data/d/shop.data"
import { subRegionMap } from "@/data/d/subregion.data"
import titleData from "@/data/d/title.data"
import walnutData from "@/data/d/walnut.data"
import weaponData from "@/data/d/weapon.data"
import { getAbyssDungeonGroup, getAbyssDungeonLevel, getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
import { getPinyin, getPinyinFirst } from "@/utils/pinyin-utils"

interface DBSearchEntry extends DBGlobalSearchOption {
    searchText: string
    pinyinFull: string
    pinyinFirst: string
}

export interface DBGlobalSearchOption {
    id: string
    title: string
    subtitle?: string
    typeLabel: string
    path: string
}

export interface GlobalSearchPageItem {
    name: string
    path: string
    desc: string
}

/**
 * 全局数据库搜索服务：负责构建索引并提供查询能力。
 */
export class GlobalSearchService {
    private readonly fuse: Fuse<DBSearchEntry>

    constructor() {
        const entries = this.buildSearchEntries()
        this.fuse = this.createFuse(entries)
    }

    /**
     * 执行全局检索并返回排序后的候选项。
     */
    search(query: string, limit = 50): DBGlobalSearchOption[] {
        const keyword = query.trim()
        if (!keyword) {
            return []
        }

        return this.fuse
            .search(keyword, { limit })
            .map((result, index) => ({
                id: result.item.id,
                title: result.item.title,
                subtitle: result.item.subtitle,
                typeLabel: result.item.typeLabel,
                path: result.item.path,
                index,
            }))
            .sort((a, b) => this.getTypePriority(a.typeLabel) - this.getTypePriority(b.typeLabel) || a.index - b.index)
            .map(({ index: _index, ...option }) => option)
    }

    /**
     * 清洗字段，避免索引中出现空值。
     */
    private cleanParts(parts: Array<string | number | undefined | null>): string[] {
        return parts.filter(v => v !== undefined && v !== null && String(v).trim() !== "").map(v => String(v))
    }

    /**
     * 构建统一搜索条目并预计算拼音字段。
     */
    private buildSearchEntry(option: DBGlobalSearchOption, extraParts: Array<string | number | undefined | null>): DBSearchEntry {
        const parts = this.cleanParts([option.title, option.subtitle, ...extraParts])
        const searchText = parts.join(" ")

        return {
            ...option,
            searchText,
            pinyinFull: getPinyin(searchText),
            pinyinFirst: getPinyinFirst(searchText),
        }
    }

    /**
     * 生成全库搜索索引，不同数据类型采用不同字段规则。
     */
    private buildSearchEntries(): DBSearchEntry[] {
        const entries: DBSearchEntry[] = []

        entries.push(
            ...charAccessoryData.map(accessory =>
                this.buildSearchEntry(
                    {
                        id: `char-accessory:${accessory.id}`,
                        title: accessory.name,
                        subtitle: `饰品 ID: ${accessory.id} | 角色饰品`,
                        typeLabel: t("database.accessory"),
                        path: `/db/accessory/char/${accessory.id}`,
                    },
                    [accessory.id, accessory.name, accessory.desc, accessory.unlock, accessory.rarity, accessory.icon]
                )
            )
        )

        entries.push(
            ...weaponAccessoryData.map(accessory =>
                this.buildSearchEntry(
                    {
                        id: `weapon-accessory:${accessory.id}`,
                        title: accessory.name,
                        subtitle: `饰品 ID: ${accessory.id} | 武器饰品`,
                        typeLabel: t("database.accessory"),
                        path: `/db/accessory/weapon/${accessory.id}`,
                    },
                    [accessory.id, accessory.name, accessory.desc, accessory.unlock, accessory.rarity, accessory.icon]
                )
            )
        )

        entries.push(
            ...weaponSkinData.map(accessory =>
                this.buildSearchEntry(
                    {
                        id: `weapon-skin:${accessory.id}`,
                        title: accessory.name,
                        subtitle: `饰品 ID: ${accessory.id} | 武器皮肤`,
                        typeLabel: t("database.accessory"),
                        path: `/db/accessory/skin/${accessory.id}`,
                    },
                    [accessory.id, accessory.name, accessory.desc, accessory.unlock, accessory.rarity, accessory.icon]
                )
            )
        )

        entries.push(
            ...charData.map(char =>
                this.buildSearchEntry(
                    {
                        id: `char:${char.id}`,
                        title: t(char.名称),
                        subtitle: `ID:${char.id} | 属性:${char.属性 || "-"} | 阵营:${char.阵营 || "-"} | 精通:${(char.精通 || []).join("/") || "-"}`,
                        typeLabel: t("database.char"),
                        path: `/db/char/${char.id}`,
                    },
                    [char.id, char.别名, char.属性, char.版本, char.阵营, ...(char.标签 || []), ...(char.精通 || [])]
                )
            )
        )

        entries.push(
            ...weaponData.map(weapon =>
                this.buildSearchEntry(
                    {
                        id: `weapon:${weapon.id}`,
                        title: t(weapon.名称),
                        subtitle: `ID:${weapon.id} | 分类:${weapon.类型.join("/")} | 伤害:${weapon.伤害类型}`,
                        typeLabel: t("database.weapon"),
                        path: `/db/weapon/${weapon.id}`,
                    },
                    [weapon.id, weapon.伤害类型, ...weapon.类型, weapon.攻击, weapon.暴击, weapon.暴伤, weapon.触发]
                )
            )
        )

        entries.push(
            ...modData.map(mod =>
                this.buildSearchEntry(
                    {
                        id: `mod:${mod.id}`,
                        title: `${t(mod.系列)}${t(mod.名称)}`,
                        subtitle: `ID:${mod.id} | 类型:${mod.类型} | 品质:${mod.品质}${mod.属性 ? ` | 属性:${mod.属性}` : ""}`,
                        typeLabel: t("database.mod"),
                        path: `/db/mod/${mod.id}`,
                    },
                    [mod.id, mod.名称, mod.系列, mod.类型, mod.品质, mod.属性, mod.限定, mod.版本, mod.极性, mod.耐受]
                )
            )
        )

        entries.push(
            ...monsterData
                .filter(monster => monster.id >= 2000000)
                .map(monster =>
                    this.buildSearchEntry(
                        {
                            id: `monster:${monster.id}`,
                            title: t(monster.n),
                            subtitle: `ID:${monster.id} | 阵营:${monster.f ?? "-"} | HP:${monster.hp} | ATK:${monster.atk}`,
                            typeLabel: t("database.monster"),
                            path: `/db/monster/${monster.id}`,
                        },
                        [monster.id, monster.f, monster.t, monster.hp, monster.atk, monster.def, monster.es]
                    )
                )
        )

        entries.push(
            ...dungeonData.map(dungeon =>
                this.buildSearchEntry(
                    {
                        id: `dungeon:${dungeon.id}`,
                        title: getDungeonName(dungeon),
                        subtitle: `ID:${dungeon.id} | 类型:${getDungeonType(dungeon.t).label} | Lv.${dungeon.lv}`,
                        typeLabel: t("database.dungeon"),
                        path: `/db/dungeon/${dungeon.id}`,
                    },
                    [
                        dungeon.id,
                        dungeon.n,
                        dungeon.desc,
                        dungeon.lv,
                        dungeon.t,
                        dungeon.e,
                        getDungeonType(dungeon.t).label,
                        getDungeonRewardNames(dungeon),
                    ]
                )
            )
        )

        entries.push(
            ...abyssDungeons.map(dungeon => {
                const charName = dungeon.cid ? charMap.get(dungeon.cid)?.名称 : undefined
                const title = `${dungeon.sn || "深渊"} ${charName || ""} #${getAbyssDungeonLevel(dungeon)}`.trim()

                return this.buildSearchEntry(
                    {
                        id: `abyss:${dungeon.id}`,
                        title,
                        subtitle: `深渊 ID: ${dungeon.id}`,
                        typeLabel: t("database.abyss_dungeon"),
                        path: `/db/abyss/${dungeon.id}`,
                    },
                    [dungeon.id, dungeon.sn, charName, getAbyssDungeonGroup(dungeon), getAbyssDungeonLevel(dungeon)]
                )
            })
        )

        entries.push(
            ...Object.values(RaidDungeon).map(raid => {
                const dungeonName = dungeonData.find(item => item.id === raid.DungeonId)?.n || `副本 ${raid.DungeonId}`

                return this.buildSearchEntry(
                    {
                        id: `rank:${raid.DungeonId}`,
                        title: t(dungeonName),
                        subtitle: `天梯赛副本 ID: ${raid.DungeonId}`,
                        typeLabel: t("database.rank"),
                        path: "/db/rank",
                    },
                    [raid.DungeonId, raid.DifficultyLevel, raid.RaidSeason, raid.BaseRaidPoint, raid.FomulaId, ...(raid.RaidBuffID || [])]
                )
            })
        )

        entries.push(
            ...draftData.map(draft =>
                this.buildSearchEntry(
                    {
                        id: `draft:${draft.id}`,
                        title: draft.n,
                        subtitle: `图纸 ID: ${draft.id}`,
                        typeLabel: t("database.draft"),
                        path: `/db/draft/${draft.id}`,
                    },
                    [draft.id, draft.t, draft.r, draft.v, draft.c, draft.d, draft.p]
                )
            )
        )

        entries.push(
            ...petData.map(pet =>
                this.buildSearchEntry(
                    {
                        id: `pet:${pet.id}`,
                        title: pet.名称,
                        subtitle: `魔灵 ID: ${pet.id}`,
                        typeLabel: t("database.pet"),
                        path: `/db/pet/${pet.id}`,
                    },
                    [pet.id, pet.类型, pet.品质, pet.最大等级, pet.捕获经验]
                )
            )
        )

        entries.push(
            ...petEntrys.map(entry =>
                this.buildSearchEntry(
                    {
                        id: `pet-entry:${entry.id}`,
                        title: entry.name,
                        subtitle: `魔灵潜质 ID: ${entry.id}`,
                        typeLabel: t("魔灵潜质"),
                        path: "/db/pet",
                    },
                    [entry.id, entry.r, entry.desc]
                )
            )
        )

        entries.push(
            ...walnutData.map(walnut =>
                this.buildSearchEntry(
                    {
                        id: `walnut:${walnut.id}`,
                        title: walnut.名称,
                        subtitle: `密函 ID: ${walnut.id}`,
                        typeLabel: t("database.walnut"),
                        path: `/db/walnut/${walnut.id}`,
                    },
                    [walnut.id, walnut.类型, walnut.稀有度, ...(walnut.获取途径 || [])]
                )
            )
        )

        entries.push(
            ...titleData.map(title =>
                this.buildSearchEntry(
                    {
                        id: `title:${title.id}`,
                        title: title.name,
                        subtitle: `称号 ID: ${title.id}`,
                        typeLabel: t("database.title_data"),
                        path: `/db/title/${title.id}`,
                    },
                    [title.id, title.name, title.src, title.suf ? "后缀" : "前缀"]
                )
            )
        )

        entries.push(
            ...fishs.map(fish =>
                this.buildSearchEntry(
                    {
                        id: `fish:${fish.id}`,
                        title: fish.name,
                        subtitle: `鱼 ID: ${fish.id}`,
                        typeLabel: "鱼",
                        path: `/db/fish/${fish.id}`,
                    },
                    [fish.id, fish.level, fish.icon]
                )
            )
        )

        entries.push(
            ...fishingSpots.map(spot =>
                this.buildSearchEntry(
                    {
                        id: `fishspot:${spot.id}`,
                        title: spot.name,
                        subtitle: `钓鱼点 ID: ${spot.id}`,
                        typeLabel: "钓鱼点",
                        path: `/db/fishspot/${spot.id}`,
                    },
                    [spot.id, spot.fishCountLimit, ...(spot.fishIds || [])]
                )
            )
        )

        entries.push(
            ...shopData.map(shop =>
                this.buildSearchEntry(
                    {
                        id: `shop:${shop.id}`,
                        title: shop.name,
                        subtitle: `商店 ID: ${shop.id}`,
                        typeLabel: t("database.shop"),
                        path: `/db/shop/${shop.id}`,
                    },
                    [
                        shop.id,
                        ...shop.mainTabs.map(tab => tab.name),
                        ...shop.mainTabs.flatMap(tab => tab.subTabs.map(subTab => subTab.name)),
                    ]
                )
            )
        )

        entries.push(
            ...dynQuestData.map(quest => {
                const regionName = regionMap.get(quest.regionId)?.name
                const subRegionName = subRegionMap.get(quest.subRegionId)?.name

                return this.buildSearchEntry(
                    {
                        id: `dynquest:${quest.id}`,
                        title: quest.name,
                        subtitle: `委托 ID: ${quest.id}`,
                        typeLabel: t("database.dynquest"),
                        path: `/db/dynquest/${quest.id}`,
                    },
                    [quest.id, regionName, subRegionName, quest.chance, ...(quest.level || []), quest.completeNum]
                )
            })
        )

        entries.push(
            ...Array.from(hardBossMap.values()).map(boss =>
                this.buildSearchEntry(
                    {
                        id: `hardboss:${boss.id}`,
                        title: boss.name,
                        subtitle: `梦魇残声 ID: ${boss.id}`,
                        typeLabel: t("database.hard_boss"),
                        path: `/db/hardboss/${boss.id}`,
                    },
                    [boss.id, boss.desc, ...boss.diff.map(v => v.lv)]
                )
            )
        )

        entries.push(
            ...questChainData.map(questChain =>
                this.buildSearchEntry(
                    {
                        id: `questchain:${questChain.id}`,
                        title: questChain.name,
                        subtitle: `任务剧情 ID: ${questChain.id}`,
                        typeLabel: t("database.questchain"),
                        path: `/db/questchain/${questChain.id}`,
                    },
                    [questChain.id, questChain.chapterName, questChain.chapterNumber, questChain.episode, questChain.type, questChain.main]
                )
            )
        )

        entries.push(
            ...partyTopicData.map(partyTopic => {
                const charName = charMap.get(partyTopic.charId)?.名称
                const conditionQuestChain = partyTopic.conditionId
                    ? questChainData.find(questChain => questChain.id === partyTopic.conditionId)
                    : undefined

                return this.buildSearchEntry(
                    {
                        id: `partytopic:${partyTopic.id}`,
                        title: partyTopic.name,
                        subtitle: `光阴集 ID: ${partyTopic.id}${charName ? ` | 角色:${charName}` : ""}`,
                        typeLabel: t("database.partytopic"),
                        path: `/db/partytopic/${partyTopic.id}`,
                    },
                    [
                        partyTopic.id,
                        partyTopic.charId,
                        partyTopic.name,
                        partyTopic.desc,
                        partyTopic.memoryName,
                        partyTopic.memoryDesc,
                        partyTopic.reward,
                        partyTopic.conditionId,
                        charName,
                        conditionQuestChain?.name,
                        ...Object.keys(partyTopic.consume || {}),
                    ]
                )
            })
        )

        entries.push(
            ...achievementData.map(achievement =>
                this.buildSearchEntry(
                    {
                        id: `achievement:${achievement.id}`,
                        title: t(achievement.名称),
                        subtitle: `成就 ID: ${achievement.id} | 分类:${t(achievement.分类)} | 版本:${achievement.版本}`,
                        typeLabel: t("database.achievement"),
                        path: `/db/achievement/${achievement.id}`,
                    },
                    [
                        achievement.id,
                        achievement.名称,
                        achievement.描述,
                        achievement.分类,
                        achievement.版本,
                        ...Object.keys(achievement.奖励),
                    ]
                )
            )
        )

        // entries.push(
        //     ...npcData
        //         .filter(npc => npc.name)
        //         .map(npc =>
        //             this.buildSearchEntry(
        //                 {
        //                     id: `npc:${npc.id}`,
        //                     title: npc.name || `NPC ${npc.id}`,
        //                     subtitle: `ID:${npc.id}${npc.camp ? ` | 阵营:${npc.camp}` : ""}${npc.type ? ` | 类型:${npc.type}` : ""}`,
        //                     typeLabel: "NPC",
        //                     path: `/db/npc/${npc.id}`,
        //                 },
        //                 [npc.id, npc.camp, npc.type, npc.charId, npc.icon]
        //             )
        //         )
        // )

        return entries
    }

    /**
     * 创建 Fuse 搜索器，保持与原页面一致的权重配置。
     */
    private createFuse(entries: DBSearchEntry[]): Fuse<DBSearchEntry> {
        return new Fuse(entries, {
            threshold: 0.34,
            ignoreLocation: true,
            minMatchCharLength: 1,
            keys: [
                { name: "title", weight: 2.4 },
                { name: "subtitle", weight: 1.2 },
                { name: "searchText", weight: 1.6 },
                { name: "pinyinFirst", weight: 1.4 },
                { name: "pinyinFull", weight: 1.0 },
            ],
        })
    }

    /**
     * 调整候选优先级：NPC始终置于最后，避免压过角色条目。
     */
    private getTypePriority(typeLabel: string): number {
        if (typeLabel === t("database.weapon") || typeLabel === t("database.mod") || typeLabel === t("database.role")) {
            return -1
        }
        if (typeLabel === t("database.draft")) {
            return 0
        }
        return typeLabel === t("database.npc") ? 1 : 0
    }
}
