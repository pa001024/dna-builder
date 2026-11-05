import type { DamageEvent, SimEvent } from "dna-builder-skill-sim/core"
import { describe, expect, it } from "vitest"
import { EventView } from "../sim/event-view"

let seq = 0

function damage(overrides: Partial<DamageEvent> = {}): DamageEvent {
    return {
        kind: "damage",
        at: 1,
        seq: seq++,
        actorId: "hero",
        targetId: "e1",
        skillField: "伤害",
        tag: "技能",
        raw: 120,
        effective: 120,
        shieldAbsorb: 0,
        hpLoss: 120,
        overkill: 0,
        hpAfter: 880,
        shieldAfter: 0,
        damageKind: "expected",
        ...overrides,
    }
}

function view(): EventView {
    return new EventView({ buffName: id => (String(id) === "410121" ? "正电荷" : undefined) })
}

describe("EventView", () => {
    it("伤害事件生成取整飘字并累计 total / perSkill", () => {
        const state = view()
        const floats = state.consume([damage({ effective: 120.7 }), damage({ skillField: "[电荷]伤害", effective: 30 })])

        expect(floats).toHaveLength(2)
        expect(floats[0]).toMatchObject({ anchor: { kind: "target", id: "e1" }, text: "120" })
        expect(state.state.damageTotal).toBeCloseTo(150.7)
        expect(state.state.perSkill["[电荷]伤害"]).toBeCloseTo(30)
    })

    it("护盾吸收且未破盾时使用护盾色", () => {
        const state = view()
        const [float] = state.consume([damage({ shieldAbsorb: 50, hpLoss: 0, effective: 50 })])
        expect(float.color).toBe("#60a5fa")
    })

    it("增益施加 / 到期映射到玩家与目标，名称取 manifest 并截首字", () => {
        const state = view()
        state.consume([
            {
                kind: "buff-apply",
                at: 0,
                seq: seq++,
                entityKind: "actor",
                entityId: "hero",
                sourceId: "hero",
                buffId: "黎瑟E",
                instanceId: 1,
                stacks: 1,
                duration: 9,
                expiresAt: 9,
                policy: "refresh",
                replaced: false,
            },
            {
                kind: "buff-apply",
                at: 1,
                seq: seq++,
                entityKind: "target",
                entityId: "e1",
                sourceId: "hero",
                buffId: 410121,
                instanceId: 2,
                stacks: 2,
                duration: 6,
                expiresAt: 7,
                policy: "refresh",
                replaced: false,
            },
        ])

        expect(state.state.playerBuffs.map(buff => buff.label)).toEqual(["黎"])
        expect(state.buffsOf("e1")[0]).toMatchObject({ buffId: "410121", label: "正", stacks: 2 })

        state.consume([
            {
                kind: "buff-expire",
                at: 7,
                seq: seq++,
                entityKind: "target",
                entityId: "e1",
                buffId: 410121,
                instanceId: 2,
                stacks: 2,
                reason: "expired",
            },
        ])
        expect(state.buffsOf("e1")).toEqual([])
    })

    it("选敌事件写入限时标记，死亡清理目标增益与标记", () => {
        const state = view()
        state.consume([
            {
                kind: "target-select",
                at: 2,
                seq: seq++,
                actorId: "hero",
                store: "charge",
                filter: "random",
                targetIds: ["e1", "e2"],
            },
        ])

        expect(state.activeMarkers(3)).toEqual(["e1", "e2"])
        expect(state.activeMarkers(5)).toEqual([])

        state.consume([
            {
                kind: "buff-apply",
                at: 2,
                seq: seq++,
                entityKind: "target",
                entityId: "e1",
                sourceId: "hero",
                buffId: 410121,
                instanceId: 3,
                stacks: 1,
                duration: 6,
                expiresAt: 8,
                policy: "refresh",
                replaced: false,
            },
            { kind: "death", at: 3, seq: seq++, targetId: "e1", killerId: "hero", skillField: "伤害" },
        ])

        expect(state.takeDeaths()).toEqual(["e1"])
        expect(state.buffsOf("e1")).toEqual([])
        expect(state.state.markers.e1).toBeUndefined()
    })

    it("cast 事件记录最近施法（供视图做施法反馈）", () => {
        const state = view()
        state.consume([
            {
                kind: "cast",
                at: 4,
                seq: seq++,
                actorId: "hero",
                skillId: 410102,
                cooldown: 2,
                readyAt: 6,
                costs: [],
            } satisfies SimEvent,
        ])
        expect(state.state.lastCast).toEqual({ skillId: 410102, at: 4 })
    })

    it("reset 清空视图状态", () => {
        const state = view()
        state.consume([damage()])
        state.reset()
        expect(state.state.damageTotal).toBe(0)
        expect(state.state.playerBuffs).toEqual([])
    })
})
