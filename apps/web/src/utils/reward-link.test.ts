import { describe, expect, it } from "vitest"
import { charMap, draftMap, resourceMap, walnutMap } from "@/data/d"
import { charAccessoryData, hairData, headFrameData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { titleFrameData } from "@/data/d/titleframe.data"
import { getRewardDetailLink } from "./reward-link"

describe("getRewardDetailLink", () => {
    it("为角色 / 武器 / 魔之楔直接返回详情页", () => {
        expect(getRewardDetailLink("Char", 1001)).toBe("/db/char/1001")
        expect(getRewardDetailLink("Weapon", 2001)).toBe("/db/weapon/2001")
        expect(getRewardDetailLink("Mod", 3001)).toBe("/db/mod/3001")
    })

    it("资源存在时返回链接，不存在时返回空串", () => {
        const firstResource = [...resourceMap.values()][0]
        expect(getRewardDetailLink("Resource", firstResource.id)).toBe(`/db/resource/${firstResource.id}`)
        expect(getRewardDetailLink("Resource", -999999)).toBe("")
    })

    it("设计稿支持按产物 id 反查", () => {
        const firstDraft = [...draftMap.values()][0]
        expect(getRewardDetailLink("Draft", firstDraft.id)).toBe(`/db/draft/${firstDraft.id}`)
        expect(getRewardDetailLink("Draft", -999999)).toBe("")
    })

    it("饰品存在时返回链接，不存在时返回空串", () => {
        const firstAccessory = charAccessoryData[0]
        expect(getRewardDetailLink("CharAccessory", firstAccessory.id)).toBe(`/db/accessory/char/${firstAccessory.id}`)
        expect(getRewardDetailLink("CharAccessory", -999999)).toBe("")
    })

    it("旧 RewardItem 缺失的时装分支如今有链接", () => {
        expect(getRewardDetailLink("WeaponSkin", weaponSkinData[0].id)).toBe(`/db/accessory/weaponskin/${weaponSkinData[0].id}`)
        expect(getRewardDetailLink("HeadSculpture", headSculptureData[0].id)).toBe(`/db/accessory/head/${headSculptureData[0].id}`)
        expect(getRewardDetailLink("HeadFrame", headFrameData[0].id)).toBe(`/db/accessory/headframe/${headFrameData[0].id}`)
        expect(getRewardDetailLink("Hair", hairData[0].id)).toBe(`/db/accessory/hair/${hairData[0].id}`)
        expect(getRewardDetailLink("TitleFrame", titleFrameData[0].id)).toBe(`/db/accessory/titleframe/${titleFrameData[0].id}`)
        expect(getRewardDetailLink("WeaponSkin", -999999)).toBe("")
    })

    it("密函存在时返回链接", () => {
        if (walnutMap.size) {
            const firstWalnutId = [...walnutMap.keys()][0]
            expect(getRewardDetailLink("Walnut", firstWalnutId)).toBe(`/db/walnut/${firstWalnutId}`)
        }
        expect(getRewardDetailLink("Walnut", -999999)).toBe("")
    })

    it("未知类型返回空串", () => {
        expect(getRewardDetailLink("UnknownType", 1)).toBe("")
    })

    it("limit prize 的奖品类型可解析（冒烟）", () => {
        const firstCharId = [...charMap.values()][0]?.id ?? 1001
        expect(getRewardDetailLink("Char", firstCharId)).toContain("/db/char/")
    })
})
