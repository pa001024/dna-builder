import { describe, expect, it } from "vitest"
import { createBuffSelectContext, isBuffSelectable } from "../buffFilter"
import { buffMap, charMap } from "../d"
import type { Buff } from "../data-types"

const getBuff = (name: string): Buff => buffMap.get(name) as Buff

/**
 * 构造过滤上下文。
 * @param charName 当前主控角色名称
 * @param teamChars 助战角色名称或 id（兼容旧格式角色名，默认无）
 * @param teamWeapons 助战武器 id（默认无）
 * @param currentWeaponIds 当前角色装备武器 id（默认无）
 * @returns 过滤上下文
 */
function makeCtx(opts: {
    charName: string
    teamChars?: (string | number | "-")[]
    teamWeapons?: (number | "-")[]
    currentWeaponIds?: number[]
}) {
    const char = charMap.get(opts.charName)!
    return createBuffSelectContext({
        charElm: char.属性,
        mainIds: [char.id, ...(opts.currentWeaponIds ?? [])],
        phantomIds: [
            ...(opts.teamChars ?? []).map(v => charMap.get(v)?.id).filter((id): id is number => typeof id === "number"),
            ...(opts.teamWeapons ?? []).filter((id): id is number => typeof id === "number"),
        ],
    })
}

describe("isBuffSelectable 按助战/助战武器过滤", () => {
    it("限定自带BUFF：按 id 仅过滤当前主控角色（原有限定行为不变）", () => {
        const buff = getBuff("黎瑟E") // 限定=4101，id=4101
        // 当前角色=黎瑟 → 可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "黎瑟" }))).toBe(true)
        // 当前角色非黎瑟，黎瑟也未选为助战 → 不可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(false)
        // 当前角色非黎瑟，黎瑟虽选为助战 → 仍不可选（限定仅过滤当前角色）
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: ["黎瑟", "-"] }))).toBe(false)
    })

    it("角色来源BUFF：当前角色 或 助战角色 时可选", () => {
        const buff = getBuff("菲娜Q") // id=1801（无限定）
        // 当前角色=菲娜 → 可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "菲娜" }))).toBe(true)
        // 菲娜选为助战 → 可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: ["菲娜", "-"] }))).toBe(true)
        // 与菲娜无关 → 不可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(false)
    })

    it("助战BUFF：角色选为助战 或 为当前角色时可选", () => {
        const buff = getBuff("菲娜助战") // id=1801
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: ["菲娜", "-"] }))).toBe(true)
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(false)
        expect(isBuffSelectable(buff, makeCtx({ charName: "菲娜" }))).toBe(true)
    })

    it("teamChars 兼容旧格式角色名与新格式角色id", () => {
        const buff = getBuff("菲娜Q") // id=1801
        // 新格式：传角色 id
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: [1801, "-"] }))).toBe(true)
        // 旧格式：传角色名
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: ["菲娜", "-"] }))).toBe(true)
        // 无关 id/名称 → 不可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: [2401, "-"] }))).toBe(false)
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamChars: ["扶疏", "-"] }))).toBe(false)
    })

    it("(队友)武器BUFF：仅当助战选择该武器时可选", () => {
        const buff = getBuff("泽世的慈雨(队友)") // id=10502
        // 助战武器=10502 → 可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamWeapons: [10502, "-"] }))).toBe(true)
        // 未选该武器 → 不可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(false)
        // 仅当前角色装备 10502、助战未选 → 不可选（只看助战武器）
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", currentWeaponIds: [10502] }))).toBe(false)
    })

    it("5熔武器BUFF：仅看当前角色装备的武器", () => {
        const buff = getBuff("权火将熄5熔") // id=10399
        // 当前角色装备 10399 → 可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", currentWeaponIds: [10399] }))).toBe(true)
        // 仅助战装备 10399、当前未装备 → 不可选（只看当前角色）
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜", teamWeapons: [10399] }))).toBe(false)
        // 都未装备 → 不可选
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(false)
    })

    it("无来源id的通用BUFF始终可选", () => {
        const buff = getBuff("助战50攻") // 无 id
        expect(isBuffSelectable(buff, makeCtx({ charName: "法露茜" }))).toBe(true)
        expect(isBuffSelectable(buff, makeCtx({ charName: "赛琪" }))).toBe(true)
    })
})
