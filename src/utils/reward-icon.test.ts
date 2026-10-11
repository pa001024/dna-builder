import { describe, expect, it } from "vitest"
import { draftMap, iconticketMap, modMap, petMap, resourceMap, skinMap, walnutMap } from "@/data/d"
import { charAccessoryData, hairData, headFrameData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { titleData } from "@/data/d/title.data"
import { titleFrameData } from "@/data/d/titleframe.data"
import { EMPTY_REWARD_ICON, getRewardIconBackground, getRewardIconUrl } from "./reward-icon"

describe("getRewardIconUrl", () => {
    it("魔之楔存在时返回图标，不存在时回缺省图且不抛错", () => {
        const firstModId = [...modMap.keys()][0]
        expect(getRewardIconUrl("Mod", firstModId)).toContain("T_Mod_")
        expect(() => getRewardIconUrl("Mod", -999999)).not.toThrow()
        expect(getRewardIconUrl("Mod", -999999)).toBe(EMPTY_REWARD_ICON)
    })

    it("时装类存在时返回图标，不存在时回缺省图", () => {
        const firstSkinId = [...skinMap.keys()][0]
        expect(getRewardIconUrl("Skin", firstSkinId)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("Skin", -999999)).toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("WeaponSkin", weaponSkinData[0].id)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("CharAccessory", charAccessoryData[0].id)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("WeaponAccessory", weaponAccessoryData[0].id)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("Hair", hairData[0].id)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("HeadFrame", headFrameData[0].id)).toContain("/imgs/headframe/")
        expect(getRewardIconUrl("HeadSculpture", headSculptureData[0].id)).toContain("/imgs/webp/")
        expect(getRewardIconUrl("Title", titleData[0].id)).toContain("T_Icon_Random_Title")
        expect(getRewardIconUrl("TitleFrame", titleFrameData[0].id)).toContain("T_Icon_Random_TitleFrame")
    })

    it("资源支持 id 与名称两种查法，碎片资源反查角色头像", () => {
        const firstResource = [...resourceMap.values()][0]
        const byId = getRewardIconUrl("Resource", firstResource.id)
        expect(byId).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("Resource", firstResource.name)).toBe(byId)
        expect(getRewardIconUrl("Resource", -999999)).toBe(EMPTY_REWARD_ICON)
    })

    it("设计稿支持按产物 id 反查，密函按首个产物递归解析", () => {
        const firstDraft = [...draftMap.values()][0]
        expect(getRewardIconUrl("Draft", firstDraft.id)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("Draft", firstDraft.p)).not.toBe(EMPTY_REWARD_ICON)
        expect(getRewardIconUrl("Draft", -999999)).toBe(EMPTY_REWARD_ICON)
        if (walnutMap.size) {
            const firstWalnutId = [...walnutMap.keys()][0]
            expect(getRewardIconUrl("Walnut", firstWalnutId)).not.toBe(EMPTY_REWARD_ICON)
        }
        expect(getRewardIconUrl("Walnut", -999999)).toBe(EMPTY_REWARD_ICON)
    })

    it("深境罗盘与魔灵", () => {
        if (iconticketMap.size) {
            const firstTicketId = [...iconticketMap.keys()][0]
            expect(getRewardIconUrl("IronTicket", firstTicketId)).toContain("/imgs/res/")
        }
        expect(getRewardIconUrl("IronTicket", -999999)).toBe(EMPTY_REWARD_ICON)
        if (petMap.size) {
            const firstPetId = [...petMap.keys()][0]
            expect(getRewardIconUrl("Pet", firstPetId)).not.toBe(EMPTY_REWARD_ICON)
        }
    })

    it("未知类型回缺省图", () => {
        expect(getRewardIconUrl("UnknownType", 1)).toBe(EMPTY_REWARD_ICON)
    })
})

describe("getRewardIconBackground", () => {
    it("资源 / 饰品按自身稀有度返回底色", () => {
        const firstResource = [...resourceMap.values()][0]
        expect(getRewardIconBackground("Resource", firstResource.id)).toContain("from-")
        expect(getRewardIconBackground("Hair", hairData[0].id)).toContain("from-")
        expect(getRewardIconBackground("HeadFrame", headFrameData[0].id)).toContain("from-")
    })

    it("未知类型回默认灰底", () => {
        expect(getRewardIconBackground("UnknownType", 1)).toBe("from-gray-900/80 to-gray-100/80")
    })
})
