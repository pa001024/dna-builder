import { describe, expect, it } from "vitest"
import { parseAbyssBestTimeVo1 } from "./abyss-best-time"

const mockBestTimeVo1 = {
    charIcon: "https://herobox-img.yingxiong.com/role/config/character/icon/T_Head_Zhiliu.png",
    closeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Claymore_Wangu.png",
    langRangeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Pistol_Chixing.png",
    petIcon: "https://herobox-img.yingxiong.com/role/config/pet/Head_Pet_Zijing.png",
    phantomCharIcon1: "https://herobox-img.yingxiong.com/role/config/character/icon/Head_Baiheng.png",
    phantomCharIcon2: "https://herobox-img.yingxiong.com/role/config/character/icon/T_Head_Yuming.png",
    phantomWeaponIcon1: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Swordwhip_Zeshi.png",
    phantomWeaponIcon2: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Polearm_Zuiqian.png",
}

describe("parseAbyssBestTimeVo1", () => {
    it("应该把 bestTimeVo1 的图片路径正确转换为上传 ID", () => {
        expect(parseAbyssBestTimeVo1(mockBestTimeVo1)).toEqual({
            charId: 4102,
            meleeId: 10304,
            rangedId: 20102,
            petId: 4241,
            support1: 2401,
            supportWeapon1: 10502,
            support2: 4201,
            supportWeapon2: 10203,
        })
    })

    it("应该把协战顺序归一，避免 AB 和 BA 产生不同索引", () => {
        const swapped = {
            ...mockBestTimeVo1,
            phantomCharIcon1: mockBestTimeVo1.phantomCharIcon2,
            phantomCharIcon2: mockBestTimeVo1.phantomCharIcon1,
            phantomWeaponIcon1: mockBestTimeVo1.phantomWeaponIcon2,
            phantomWeaponIcon2: mockBestTimeVo1.phantomWeaponIcon1,
        }

        expect(parseAbyssBestTimeVo1(swapped)).toEqual({
            charId: 4102,
            meleeId: 10304,
            rangedId: 20102,
            petId: 4241,
            support1: 2401,
            supportWeapon1: 10502,
            support2: 4201,
            supportWeapon2: 10203,
        })
    })

    it("应该保留 remoteImg 的特殊弓类映射规则", () => {
        expect(
            parseAbyssBestTimeVo1({
                charIcon: "https://herobox-img.yingxiong.com/role/config/character/icon/T_Head_Zhiliu.png",
                closeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Bow_Lieyan.png",
                langRangeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Bow_hugaung.png",
            })
        ).toEqual({
            charId: 4102,
            meleeId: 20601,
            rangedId: 20602,
            petId: null,
            support1: null,
            supportWeapon1: null,
            support2: null,
            supportWeapon2: null,
        })
    })

    it("应该把 Nanzhu 反解成 160101", () => {
        expect(
            parseAbyssBestTimeVo1({
                charIcon: "https://herobox-img.yingxiong.com/role/config/character/icon/Head_Nanzhu.png",
            })
        ).toMatchObject({
            charId: 160101,
        })
    })
})
