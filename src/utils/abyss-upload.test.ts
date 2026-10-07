import type { DNARoleEntity } from "dna-api"
import { describe, expect, it } from "vitest"
import {
    buildAbyssCalamityOverrides,
    buildAbyssUploadPayload,
    detectMissingAbyssWeaponSlots,
    getCalamityWeaponOptions,
} from "./abyss-upload"

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
            stars: 160,
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
            stars: 160,
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

    it("应该映射无 Head 前缀的灾厄远程武器图片", async () => {
        const payload = await buildAbyssUploadPayload({
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: {
                        ...mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1,
                        langRangeWeaponIcon: "https://herobox-img.yingxiong.com/role/config/weapon/jicijuexiang.png",
                    },
                },
            },
        } as DNARoleEntity)

        expect(payload?.rangedId).toBe(20599)
    })

    it("灾厄武器候选应各按槽位返回 2 把", () => {
        expect(getCalamityWeaponOptions("melee").map(item => item.weaponId)).toEqual([10299, 10399])
        expect(getCalamityWeaponOptions("ranged").map(item => item.weaponId)).toEqual([20298, 20599])
    })

    it("langRangeWeaponIcon 缺失时应判定为远程灾厄武器槽位", () => {
        const { langRangeWeaponIcon: _omit, ...rest } = mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1
        const role = {
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: rest,
                },
            },
        } as unknown as DNARoleEntity

        const missing = detectMissingAbyssWeaponSlots(role)
        expect(missing.map(item => item.slot)).toEqual(["ranged"])
        expect(missing[0]?.options.map(item => item.weaponId)).toEqual([20298, 20599])
    })

    it("closeWeaponIcon 缺失时应判定为近战灾厄武器槽位", () => {
        const { closeWeaponIcon: _omit, ...rest } = mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1
        const role = {
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: rest,
                },
            },
        } as unknown as DNARoleEntity

        const missing = detectMissingAbyssWeaponSlots(role)
        expect(missing.map(item => item.slot)).toEqual(["melee"])
        expect(missing[0]?.options.map(item => item.weaponId)).toEqual([10299, 10399])
    })

    it("图标齐全时不应判定出缺失槽位", () => {
        expect(detectMissingAbyssWeaponSlots(mockRoleInfo)).toEqual([])
    })

    it("协战武器图标缺失时应判定为协战槽位且候选包含全部 4 把灾厄武器", () => {
        const { phantomWeaponIcon1: _omit, ...rest } = mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1
        const role = {
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: rest,
                },
            },
        } as unknown as DNARoleEntity

        const missing = detectMissingAbyssWeaponSlots(role)
        expect(missing.map(item => item.slot)).toEqual(["support1"])
        expect(missing[0]?.options.map(item => item.weaponId)).toEqual([10299, 10399, 20298, 20599])
        expect(missing[0]?.options.map(item => item.weaponType)).toEqual(["melee", "melee", "ranged", "ranged"])
    })

    it("主控与两把协战武器同时缺失时按主控→协战1→协战2 顺序列出", () => {
        const {
            closeWeaponIcon: _melee,
            phantomWeaponIcon1: _s1,
            phantomWeaponIcon2: _s2,
            ...rest
        } = mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1
        const role = {
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: rest,
                },
            },
        } as unknown as DNARoleEntity

        expect(detectMissingAbyssWeaponSlots(role).map(item => item.slot)).toEqual(["melee", "support1", "support2"])
    })

    it("协战角色本身缺失时不应要求补选其武器", () => {
        const { phantomCharIcon2: _char, phantomWeaponIcon2: _weapon, ...rest } = mockRoleInfo.roleInfo.abyssInfo.bestTimeVo1
        const role = {
            ...mockRoleInfo,
            roleInfo: {
                ...mockRoleInfo.roleInfo,
                abyssInfo: {
                    ...mockRoleInfo.roleInfo.abyssInfo,
                    bestTimeVo1: rest,
                },
            },
        } as unknown as DNARoleEntity

        expect(detectMissingAbyssWeaponSlots(role)).toEqual([])
    })

    it("应支持用弹窗选择结果覆盖协战武器 id", async () => {
        const payload = await buildAbyssUploadPayload(mockRoleInfo, { supportWeapon1: 20298, supportWeapon2: 10399 })
        expect(payload?.supportWeapon1).toBe(20298)
        expect(payload?.supportWeapon2).toBe(10399)
        expect(payload?.meleeId).toBe(10304)
        expect(payload?.rangedId).toBe(20102)
    })

    it("buildAbyssCalamityOverrides 应把槽位选择映射为对应上传字段", () => {
        expect(buildAbyssCalamityOverrides({ melee: 10299, ranged: 20298, support1: 10399, support2: 20599 })).toEqual({
            meleeId: 10299,
            rangedId: 20298,
            supportWeapon1: 10399,
            supportWeapon2: 20599,
        })
        expect(buildAbyssCalamityOverrides({ support2: 20599 })).toEqual({ supportWeapon2: 20599 })
        expect(buildAbyssCalamityOverrides({})).toEqual({})
    })

    it("应支持用弹窗选择结果覆盖灾厄武器 id", async () => {
        const payload = await buildAbyssUploadPayload(mockRoleInfo, { rangedId: 20298 })
        expect(payload?.rangedId).toBe(20298)
        expect(payload?.meleeId).toBe(10304)
    })

    it("应该拒绝低于 160 的 stars", async () => {
        await expect(
            buildAbyssUploadPayload({
                ...mockRoleInfo,
                roleInfo: {
                    ...mockRoleInfo.roleInfo,
                    abyssInfo: {
                        ...mockRoleInfo.roleInfo.abyssInfo,
                        stars: "159/162",
                    },
                },
            } as DNARoleEntity)
        ).rejects.toThrow("stars 非法")
    })
})
