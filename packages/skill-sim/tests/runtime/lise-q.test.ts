import { beforeAll, describe, expect, test } from "bun:test"
import type { BuffApplyEvent, BuffExpireEvent, DamageEvent, ResourceEvent, TargetSelectEvent } from "../../src/core/types"
import type { SkillRuntime } from "../../src/runtime/index"
import type { SkillBehaviorDoc } from "../../src/schema/ir"
import { validateSkillBehaviorDoc } from "../../src/schema/validation"
import { harness, loadLiseDoc } from "./helpers"

let doc: SkillBehaviorDoc

beforeAll(async () => {
    doc = await loadLiseDoc()
})

function castPilot(options: { seed?: number; recastPolicy?: "fail" | "toggle-off"; sanity?: number } = {}) {
    return harness({
        doc,
        config: {
            duration: 10,
            seed: options.seed ?? 7,
            actors: [{ id: "lise", characterId: 4101, resources: { 神智: { current: options.sanity ?? 240, max: 240 } } }],
        },
        runtime: { recastPolicy: options.recastPolicy },
    })
}

function eventSignature(runtime: SkillRuntime) {
    return runtime.simulation.events.map(event => JSON.stringify(event))
}

describe("黎瑟 Q pilot — fixture 契约", () => {
    test("fixture 通过 SkillBehaviorDoc 校验", () => {
        const result = validateSkillBehaviorDoc(doc)
        expect(result.errors).toEqual([])
    })

    test("Q 的关键字段与真实导出形状一致", () => {
        const q = doc.skills["410102"]
        expect(q.cast.costs).toEqual([
            { resource: "神智", amount: 10 },
            { resource: "神智", amount: 20, perSecond: true },
        ])
        const origins = q.phases.map(phase => phase.origin)
        expect(origins).toEqual(["authored:field-open", "authored:charge-cycle", "authored:charge-reaction"])
        // 1s 网格持续 10s：tick 相位 from 1 to 10（含）
        expect(q.phases[1].tick).toEqual({ interval: 1 })
        expect(q.phases[1].until).toBe(10)
    })
})

describe("黎瑟 Q pilot — 事件序列", () => {
    test("10 次 tick：1s 网格，每次 select + buff-apply + 伤害 + 神智消耗", () => {
        const { runtime } = castPilot()
        const cast = runtime.cast(410102, 0)
        expect(cast).toMatchObject({ ok: true, invocations: 14 })
        expect(cast.castEndAt).toBe(0.45)
        expect(cast.endsAt).toBe(10)
        expect(cast.sustained).toEqual([{ resource: "神智", amount: 20, perSecond: true }])
        const result = runtime.run()

        const selects = result.events.filter(
            (event): event is TargetSelectEvent => event.kind === "target-select" && event.store === "chargeTarget"
        )
        expect(selects.map(event => Number(event.at.toFixed(3)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        expect(selects.every(event => event.targetIds.length === 1)).toBe(true)

        const charges = result.events.filter(
            (event): event is BuffApplyEvent => event.kind === "buff-apply" && (event.buffId === 410121 || event.buffId === 410122)
        )
        expect(charges).toHaveLength(10)
        for (let index = 0; index < 10; index++) {
            const tick = index + 1
            const select = selects[index]
            const charge = charges[index]
            expect(Number(charge.at.toFixed(3))).toBe(tick)
            expect(charge.entityId).toBe(select.targetIds[0])
            expect(charge.duration).toBe(6)
        }
        // 极性由 seed 决定：两种都出现
        expect(new Set(charges.map(event => event.buffId))).toEqual(new Set([410121, 410122]))

        const drains = result.events.filter((event): event is ResourceEvent => event.kind === "resource" && event.resource === "神智")
        // 施法 10 + 每 tick 20 × 10
        expect(drains.filter(event => event.at === 0)).toHaveLength(1)
        expect(drains.filter(event => event.at > 0)).toHaveLength(10)
        expect(drains.filter(event => event.at > 0).every(event => event.delta === -20)).toBe(true)
    })

    test("初始爆发：3 个敌人都命中一次，随后电场爆发 buff 挂到 self", () => {
        const { runtime } = castPilot()
        runtime.cast(410102, 0)
        const result = runtime.run()
        const burst = result.events.filter((event): event is DamageEvent => event.kind === "damage" && event.skillField === "伤害")
        expect(burst.map(event => event.targetId)).toEqual(["e1", "e2", "e3"])
        const selfBuffs = result.events.filter(
            (event): event is BuffApplyEvent => event.kind === "buff-apply" && event.entityKind === "actor"
        )
        expect(selfBuffs.map(event => event.buffId)).toEqual([410111, 410123])
        expect(selfBuffs[0]).toMatchObject({ duration: 10 })
    })

    test("电荷到期：buff-expire 在 施加 + 6s 出现", () => {
        const { runtime } = castPilot()
        runtime.cast(410102, 0)
        const result = runtime.run()
        const charges = result.events.filter(
            (event): event is BuffApplyEvent => event.kind === "buff-apply" && (event.buffId === 410121 || event.buffId === 410122)
        )
        const expires = result.events.filter(
            (event): event is BuffExpireEvent =>
                event.kind === "buff-expire" && (event.buffId === 410121 || event.buffId === 410122) && event.reason === "expired"
        )
        // 每次刷新都会推迟到期：按 (entityId, instanceId) 取最后一次施加的 expiresAt
        const lastExpiry = new Map<string, number>()
        for (const charge of charges) lastExpiry.set(`${charge.entityId}|${charge.instanceId}`, charge.expiresAt)
        for (const expire of expires) {
            expect(expire.at).toBe(lastExpiry.get(`${expire.entityId}|${expire.instanceId}`) ?? -1)
        }
        expect(expires.length).toBeGreaterThan(0)
        // 未在模拟内被刷新且到期时刻 <= 10 的实例必须产生 expire
        const expected = [...lastExpiry.values()].filter(at => at <= 10 + 1e-9).length
        expect(expires.length).toBe(expected)
    })

    test("电荷反应：3s 间隔选正/负电荷目标并结算 [电荷]伤害", () => {
        const { runtime } = castPilot()
        runtime.cast(410102, 0)
        const result = runtime.run()
        const reactionTicks = result.events.filter(
            (event): event is TargetSelectEvent => event.kind === "target-select" && event.store === "positiveCharge"
        )
        expect(reactionTicks.map(event => Number(event.at.toFixed(3)))).toEqual([3, 6, 9])
        const chargeDamage = result.events.filter(
            (event): event is DamageEvent => event.kind === "damage" && event.skillField === "[电荷]伤害"
        )
        expect(chargeDamage.length).toBeGreaterThan(0)
        expect(chargeDamage.every(event => event.at % 3 === 0)).toBe(true)
    })

    test("神智耗尽后停止：资源不足时 tick 仍按 IR 执行（IR 未建模 RemoveWhenSpZero）", () => {
        // 神智 240：施法 10 + 10 tick × 20 = 210，剩 30 —— 本 IR 没有「神智为 0 则移除 buff」
        const { runtime } = castPilot({ sanity: 60 })
        runtime.cast(410102, 0)
        const result = runtime.run()
        const drains = result.events.filter((event): event is ResourceEvent => event.kind === "resource" && event.resource === "神智")
        expect(drains.at(-1)).toMatchObject({ after: 0 })
        // 资源已为 0，但 IR 的 tick 没有资源门槛 —— 记录为已知差异（见报告 / README）
        expect(drains.filter(event => event.at > 0).length).toBe(10)
    })

    test("toggle-off：二次施放取消后续 tick，不再扣神智", () => {
        const { simulation, runtime } = castPilot({ recastPolicy: "toggle-off" })
        expect(runtime.cast(410102, 0).ok).toBe(true)
        while (simulation.now < 3) simulation.step()
        const off = runtime.cast(410102, 3)
        expect(off).toMatchObject({ ok: true, toggledOff: true })
        simulation.run()
        const selects = simulation.events.filter(
            (event): event is TargetSelectEvent => event.kind === "target-select" && event.store === "chargeTarget"
        )
        expect(selects.map(event => Number(event.at.toFixed(3)))).toEqual([1, 2, 3])
        expect(runtime.active()).toEqual([])
    })
})

describe("黎瑟 Q pilot — 确定性", () => {
    test("同 seed 两次运行：事件与帧逐位一致", () => {
        const first = castPilot()
        first.runtime.cast(410102, 0)
        const firstResult = first.runtime.run()
        const second = castPilot()
        second.runtime.cast(410102, 0)
        const secondResult = second.runtime.run()
        expect(eventSignature(first.runtime)).toEqual(eventSignature(second.runtime))
        expect(JSON.stringify(firstResult.frames)).toBe(JSON.stringify(secondResult.frames))
        expect(firstResult.summary).toEqual(secondResult.summary)
    })

    test("不同 seed 极性序列不同，但结构与时长一致", () => {
        const a = castPilot({ seed: 7 })
        a.runtime.cast(410102, 0)
        a.runtime.run()
        const b = castPilot({ seed: 8 })
        b.runtime.cast(410102, 0)
        b.runtime.run()
        const polarity = (runtime: SkillRuntime) =>
            runtime.simulation.events
                .filter(
                    (event): event is BuffApplyEvent => event.kind === "buff-apply" && (event.buffId === 410121 || event.buffId === 410122)
                )
                .map(event => event.buffId)
        expect(polarity(a.runtime)).not.toEqual(polarity(b.runtime))
        expect(polarity(a.runtime)).toHaveLength(10)
        expect(polarity(b.runtime)).toHaveLength(10)
    })

    test("无 Math.random / Date.now / data-index 依赖", async () => {
        const dir = new URL("../../src/runtime/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
        const files = [...new Bun.Glob("*.ts").scanSync({ cwd: dir })]
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            const source = await Bun.file(`${dir}/${file}`).text()
            expect({ file, random: /Math\.random\s*\(/.test(source) }).toEqual({ file, random: false })
            expect({ file, clock: /Date\.now\s*\(/.test(source) }).toEqual({ file, clock: false })
            expect({ file, dataIndex: /pipeline\/data-index/.test(source) }).toEqual({ file, dataIndex: false })
            expect({ file, pipeline: /from\s+["']\.\.\/pipeline/.test(source) }).toEqual({ file, pipeline: false })
        }
    })
})

describe("黎瑟 Q pilot — 性能", () => {
    test("10s / 3 敌人 / 1s tick 的耗时", () => {
        const { runtime } = castPilot()
        const started = performance.now()
        runtime.cast(410102, 0)
        const result = runtime.run()
        const elapsed = performance.now() - started
        // 记录实测值（不做硬性门禁之外的抖动断言；60s / 单角色目标 < 200ms）
        console.log(`[perf] lise-q pilot 10s: ${elapsed.toFixed(2)}ms, events=${result.events.length}, frames=${result.frames.length}`)
        expect(result.summary.totalDamage).toBeGreaterThan(0)
        expect(elapsed).toBeLessThan(500)
    })

    test("60s 同构负载（每 1s tick 全时长）< 200ms", () => {
        const longDoc = structuredClone(doc)
        longDoc.skills["410102"].phases[1].until = 60
        longDoc.skills["410102"].phases[2].until = 60
        longDoc.buffs["410111"].duration = 60
        longDoc.buffs["410123"].duration = 60
        longDoc.skills["410102"].cast.costs = [{ resource: "神智", amount: 10 }]
        const long = harness({
            doc: longDoc,
            config: {
                duration: 60,
                seed: 7,
                actors: [{ id: "lise", characterId: 4101, resources: { 神智: { current: 100_000, max: 100_000 } } }],
            },
        })
        const started = performance.now()
        long.runtime.cast(410102, 0)
        long.runtime.run()
        const elapsed = performance.now() - started
        console.log(
            `[perf] lise-q pilot 60s: ${elapsed.toFixed(2)}ms, frames=${long.simulation.frames.length}, events=${long.simulation.events.length}`
        )
        expect(elapsed).toBeLessThan(200)
        expect(long.simulation.events.filter(event => event.kind === "target-select").length).toBeGreaterThan(60)
    })
})
