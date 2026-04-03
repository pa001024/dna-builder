import type { DNARoleEntity } from "dna-api"
import { describe, expect, it } from "vitest"
import { buildAbyssUploadPayload } from "./abyss-upload"

const mockRoleInfo = {
    roleInfo: {
        roleShow: {
            roleId: 123456789,
            roleChars: [
                { charId: 160101, gradeLevel: 6, unLocked: true },
                { charId: 160101, gradeLevel: 5, unLocked: true },
                { charId: 4102, gradeLevel: 6, unLocked: true },
                { charId: 4102, gradeLevel: 5, unLocked: true },
                { charId: 2401, gradeLevel: 5, unLocked: true },
                { charId: 4201, gradeLevel: 4, unLocked: true },
            ],
            closeWeapons: [
                { weaponId: 10304, skillLevel: 6, unLocked: true },
                { weaponId: 10502, skillLevel: 4, unLocked: true },
                { weaponId: 20102, skillLevel: 1, unLocked: true },
            ],
            langRangeWeapons: [
                { weaponId: 20102, skillLevel: 3, unLocked: true },
                { weaponId: 10203, skillLevel: 2, unLocked: true },
            ],
        },
        abyssInfo: {
            stars: 3,
            bestTimeVo1: {
                charIcon: "https://herobox-img.yingxiong.com/role/config/character/icon/T_Head_Zhiliu.png",
                closeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Claymore_Wangu.png",
                langRangeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Pistol_Chixing.png",
                petIcon: "https://herobox-img.yingxiong.com/role/config/pet/Head_Pet_Zijing.png",
                phantomCharIcon1: "https://herobox-img.yingxiong.com/role/config/character/icon/Head_Baiheng.png",
                phantomCharIcon2: "https://herobox-img.yingxiong.com/role/config/character/icon/T_Head_Yuming.png",
                phantomWeaponIcon1: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Swordwhip_Zeshi.png",
                phantomWeaponIcon2: "https://herobox-img.yingxiong.com/role/config/weapon/Head_Polearm_Zuiqian.png",
            },
        },
    },
} as unknown as DNARoleEntity

describe("buildAbyssUploadPayload", () => {
    it("应该把游戏信息转成可提交 payload", async () => {
        const payload = await buildAbyssUploadPayload(mockRoleInfo)

        expect(payload).not.toBeNull()
        expect(payload).toMatchObject({
            uidSha256: "15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225",
            charId: 4102,
            meleeId: 10304,
            rangedId: 20102,
            petId: 4241,
            support1: 2401,
            supportWeapon1: 10502,
            support2: 4201,
            supportWeapon2: 10203,
            stars: 3,
        })
        expect(payload?.ownedChars).toEqual([
            { charId: 160101, gradeLevel: 6 },
            { charId: 4102, gradeLevel: 6 },
            { charId: 2401, gradeLevel: 5 },
            { charId: 4201, gradeLevel: 4 },
        ])
        expect(payload?.ownedWeapons).toEqual([
            { weaponId: 10304, skillLevel: 6 },
            { weaponId: 10502, skillLevel: 4 },
            { weaponId: 20102, skillLevel: 3 },
            { weaponId: 10203, skillLevel: 2 },
        ])
    })

    it("应该把 Nanzhu 反解出的 160101 在上传时归一为 1601", async () => {
        const payload = await buildAbyssUploadPayload({
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: {
                        ...mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1,
                        charIcon: "https://herobox-img.yingxiong.com/role/config/character/icon/Head_Nanzhu.png",
                    },
                },
            },
        } as DNARoleEntity)

        expect(payload?.charId).toBe(1601)
    })

    it("应该把字符串 stars 取左侧数值上传", async () => {
        const payload = await buildAbyssUploadPayload({
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    stars: "2653/162",
                },
            },
        } as DNARoleEntity)

        expect(payload?.stars).toBe(2653)
    })
})
