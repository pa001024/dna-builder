import { describe, expect, it } from "vitest"
import {
    AFK_COMBAT_DEFAULTS,
    type AfkSpriteCharacter,
    type AfkSpriteManifest,
    afkBackgroundLayout,
    afkBackgroundTiles,
    afkSceneId,
    afkSpriteFrame,
    afkSpritePlacement,
    afkSpriteSheet,
    afkSpriteStateName,
    combatApproach,
    combatCharacterState,
    createCombat,
    mapCombatX,
    stepCombat,
} from "@/utils/afk-sprite"

const character: AfkSpriteCharacter = {
    name: "角色4103",
    defaultSkin: "4103001",
    skins: {
        "4103001": {
            states: {
                Run: {
                    path: "Character/4103/4103_Run.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: true,
                },
                Attack: {
                    path: "Character/4103/4103_Attack.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: true,
                },
            },
        },
    },
}

const manifest: AfkSpriteManifest = {
    defaultCharacter: "4103",
    characters: { "4103": character },
    monsters: {
        "10002": {
            name: "小怪10002",
            states: {
                Run: {
                    path: "Monster/10002/10002_Run.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: false,
                },
                Attack: {
                    path: "Monster/10002/10002_Attack.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: false,
                },
                Hit: {
                    path: "Monster/10002/10002_Hit.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: false,
                },
                Death: {
                    path: "Monster/10002/10002_Death.png",
                    frameWidth: 256,
                    frameHeight: 256,
                    columns: 4,
                    frameCount: 16,
                    fps: 27,
                    startFrame: 0,
                    facesLeft: false,
                },
            },
        },
    },
    backgrounds: {
        BG01: { layers: { Mid: { path: "m", z: 1, speed: 0.7 }, Ground: { path: "g", z: 2, speed: 1.2 } } },
        BG06: { layers: { Mid: { path: "m", z: 1, speed: 0.7 } } },
    },
}

describe("afk sprite helpers", () => {
    it("把管道状态映射到官方动画名", () => {
        expect(afkSpriteStateName("combat")).toBe("Attack")
        expect(afkSpriteStateName("death")).toBe("Death")
        expect(afkSpriteStateName("idle")).toBe("Run")
        expect(afkSpriteStateName("unknown")).toBe("Run")
    })

    it("缺状态时回退 Run，没有角色时返回 null", () => {
        expect(afkSpriteSheet(character, "Death")?.path).toContain("Run")
        expect(afkSpriteSheet(character, "Attack")?.path).toContain("Attack")
        expect(afkSpriteSheet(null, "Run")).toBeNull()
    })

    it("按 fps 与列数切帧并循环", () => {
        const sheet = character.skins["4103001"].states.Run
        // 第 0 帧
        expect(afkSpriteFrame(sheet, 0)).toEqual({ x: 0, y: 0, width: 256, height: 256 })
        // 27fps 下第 3 帧：仍在第一行
        expect(afkSpriteFrame(sheet, (3 / 27) * 1000)).toEqual({ x: 3 * 256, y: 0, width: 256, height: 256 })
        // 4 列：索引 5 → 列 1 行 1
        expect(afkSpriteFrame(sheet, (5 / 27) * 1000)).toEqual({ x: 256, y: 256, width: 256, height: 256 })
        // 一圈之后回到第 0 帧
        expect(afkSpriteFrame(sheet, (16 / 27) * 1000)).toEqual({ x: 0, y: 0, width: 256, height: 256 })
    })

    it("一次性动画（Death）播完停在最后一帧，不回绕", () => {
        const sheet = character.skins["4103001"].states.Run
        // 恰好播满一圈：普通动画回绕到首帧，一次性动画停在末帧
        expect(afkSpriteFrame(sheet, (16 / 27) * 1000)).toEqual({ x: 0, y: 0, width: 256, height: 256 })
        expect(afkSpriteFrame(sheet, (16 / 27) * 1000, true)).toEqual({ x: 3 * 256, y: 3 * 256, width: 256, height: 256 })
        // 超过一圈也不会闪回首帧
        expect(afkSpriteFrame(sheet, 5000, true)).toEqual({ x: 3 * 256, y: 3 * 256, width: 256, height: 256 })
    })

    it("角色水平居中、底部贴边", () => {
        expect(afkSpritePlacement(1098, 118, 118)).toEqual({ x: 490, y: 0 })
        expect(afkSpritePlacement(366, 118, 128)).toEqual({ x: 119, y: -10 })
    })

    it("背景按高度等比缩放后平铺，滚动只改起点", () => {
        const tiles = afkBackgroundTiles(1500, 237, 1098, 118, 0, 1)
        const expectedWidth = 1500 * (118 / 237)
        expect(tiles.tileWidth).toBeCloseTo(expectedWidth, 5)
        expect(tiles.tiles.length).toBeGreaterThanOrEqual(2)
        expect(tiles.tiles[0]!.left).toBeLessThanOrEqual(0)
        expect(tiles.tiles.at(-1)!.left).toBeLessThan(1098)

        const scrolled = afkBackgroundTiles(1500, 237, 1098, 118, 100, 1)
        expect(scrolled.tiles[0]!.left).toBeGreaterThan(tiles.tiles[0]!.left)
    })

    it("跨块滚动时贴图位置连续，不做镜像（镜像会导致画面翻转跳变）", () => {
        const tile = 1500 * (118 / 237)
        const before = afkBackgroundTiles(1500, 237, 1098, 118, tile - 1, 1)
        const after = afkBackgroundTiles(1500, 237, 1098, 118, tile + 1, 1)
        // 跨过一块后，最左块的位置按 tileWidth 向前推一格（不会翻倍偏移）
        expect(before.tiles[0]!.left).toBeCloseTo(-1, 5)
        expect(after.tiles[0]!.left).toBeCloseTo(1 - tile, 5)
        // 每块间距恰好一个 tileWidth
        for (let i = 1; i < before.tiles.length; i++) {
            expect(before.tiles[i]!.left - before.tiles[i - 1]!.left).toBeCloseTo(tile, 5)
        }
    })

    it("战斗场景从战斗池随机，事件给的可用时优先", () => {
        const pooled: AfkSpriteManifest = {
            ...manifest,
            backgrounds: {
                BG01: { name: "BG01", layers: {} },
                BG02: { name: "BG02", layers: {} },
                BG03: { name: "BG03", layers: {} },
                BG06: { name: "BG06", layers: {} },
            },
        }
        expect(afkSceneId(pooled, "BG02", "combat")).toBe("BG02")
        // 事件给的不在战斗池（BG06 是待机场景）→ 从战斗池随机
        expect(afkSceneId(pooled, "BG06", "combat", () => 0)).toBe("BG01")
        expect(afkSceneId(pooled, "BG06", "combat", () => 0.99)).toBe("BG03")
    })

    it("待机场景用默认场景，不在待机池时回退", () => {
        expect(afkSceneId(manifest, "", "idle")).toBe("BG06")
        // 清单里没有 BG06 时退回待机池第一个可用项
        const noDefault: AfkSpriteManifest = {
            ...manifest,
            backgrounds: { BG04: { name: "BG04", layers: {} }, BG07: { name: "BG07", layers: {} } },
        }
        expect(afkSceneId(noDefault, "", "idle")).toBe("BG04")
    })

    it("背景层按地面高度统一缩放并底对齐", () => {
        const layers = {
            Ground: { path: "g", z: 1, speed: 1.2 },
            Mid: { path: "m", z: 2, speed: 0.7, fit: "uniform" },
        }
        const sizes = { Ground: { width: 200, height: 100 }, Mid: { width: 200, height: 80 } }
        const layout = afkBackgroundLayout(layers, sizes, 400, 200, 0)
        // Mid 先画、Ground 最后；高度按 200/100 放大两倍
        expect(layout.map(layer => layer.id)).toEqual(["Mid", "Ground"])
        expect(layout[0]!.height).toBe(160)
        expect(layout[0]!.tileWidth).toBe(400)
        expect(layout[0]!.top).toBe(40)
        expect(layout[1]!.height).toBe(200)
        expect(layout[1]!.top).toBe(0)
    })

    it("midBottomOffset 按同一缩放抬高非地面层", () => {
        const layers = { Ground: { path: "g", z: 1, speed: 1 }, Mid: { path: "m", z: 2, speed: 1 } }
        const sizes = { Ground: { width: 100, height: 50 }, Mid: { width: 100, height: 50 } }
        const layout = afkBackgroundLayout(layers, sizes, 300, 100, 4)
        // 缩放 2 倍后 Mid 高度刚好等于画布，midBottomOffset 再抬高 8
        expect(layout[0]!.top).toBe(-8)
        expect(layout[1]!.top).toBe(0)
    })

    it("清单缺失时没有场景", () => {
        expect(afkSceneId(null, "BG01", "idle")).toBe("")
    })
})

describe("战斗状态机", () => {
    it("接近到开打：双方相向移动，进入 fighting 后怪物攻击", () => {
        const state = createCombat("10002")
        combatApproach(state)
        expect(state.phase).toBe("approach")
        expect(combatCharacterState(state)).toBe("Run")

        // 推进足够多帧，直到相遇（官方角色 311、怪物 -27、间距 37）
        let guard = 0
        while (state.phase === "approach" && guard++ < 5000) stepCombat(state, 1 / 60)
        expect(state.phase).toBe("fighting")
        expect(state.monsterAction).toBe("Attack")
        expect(combatCharacterState(state)).toBe("Attack")
        expect(state.characterX - state.monsterX).toBeLessThanOrEqual(AFK_COMBAT_DEFAULTS.engageDistance + 2)
    })

    it("怪物按 0.6 / 1.2 / 1.8 秒切 Attack → Hit → Death，之后隐藏并重置角色", () => {
        const state = createCombat("10002")
        combatApproach(state)
        while (state.phase === "approach") stepCombat(state, 1 / 60)

        const actions: string[] = []
        let guard = 0
        while (state.phase === "fighting" && guard++ < 2000) {
            if (actions.at(-1) !== state.monsterAction) actions.push(state.monsterAction)
            stepCombat(state, 1 / 60)
        }
        expect(actions).toEqual(["Attack", "Hit", "Death"])

        // 死亡定格 0.5 秒后隐藏并进入重置
        for (let i = 0; i < 40; i++) stepCombat(state, 1 / 60)
        expect(state.monsterVisible).toBe(false)
        expect(state.phase).toBe("characterReset")
    })

    it("重置回到出生点后等待，到期自动开下一场", () => {
        const state = createCombat("10002")
        combatApproach(state)
        while (state.phase === "approach") stepCombat(state, 1 / 60)
        let guard = 0
        while (state.phase !== "waiting" && guard++ < 5000) stepCombat(state, 1 / 60)
        expect(state.phase).toBe("waiting")
        expect(state.characterX).toBeCloseTo(AFK_COMBAT_DEFAULTS.characterSpawnX, 3)

        let next = false
        guard = 0
        while (!next && guard++ < 500) next = stepCombat(state, 1 / 60)
        expect(next).toBe(true)
        expect(state.phase).toBe("approach")
        expect(state.monsterVisible).toBe(true)
    })

    it("待机时推进不动战斗", () => {
        const state = createCombat()
        expect(stepCombat(state, 0.016)).toBe(false)
        expect(state.phase).toBe("idle")
        expect(combatCharacterState(state)).toBe("Run")
    })

    it("官方坐标按画布宽度等比映射", () => {
        expect(mapCombatX(183, 366)).toBeCloseTo(183)
        expect(mapCombatX(183, 732)).toBeCloseTo(366)
    })
})
