import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createSimulation } from "../../src/core/simulation"

const CORE_DIR = join(import.meta.dir, "../../src/core")

describe("确定性约束", () => {
    test("src/core 不出现 Math.random / Date.now", () => {
        const files = readdirSync(CORE_DIR).filter(file => file.endsWith(".ts"))
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            const source = readFileSync(join(CORE_DIR, file), "utf8")
            expect({ file, random: /Math\.random\s*\(/.test(source) }).toEqual({ file, random: false })
            expect({ file, clock: /Date\.now\s*\(/.test(source) }).toEqual({ file, clock: false })
        }
    })

    test("事件序号严格单调，frames 时间严格递增", () => {
        const sim = createSimulation({
            duration: 5,
            dt: 1 / 60,
            seed: 3,
            actors: [{ id: "hero", characterId: 1 }],
            enemies: [
                { id: "e1", hp: 1000 },
                { id: "e2", hp: 1000 },
            ],
        })
        for (let i = 0; i < 50; i++) {
            sim.schedule(i * 0.1 + 0.003, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 1 })
        }
        const result = sim.run()
        const seqs = result.events.map(event => event.seq)
        expect(seqs).toEqual(seqs.slice().sort((a, b) => a - b))
        expect(new Set(seqs).size).toBe(seqs.length)
        const times = result.frames.map(frame => frame.t)
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
        const eventTimes = result.events.map(event => event.at)
        expect(eventTimes).toEqual(eventTimes.slice().sort((a, b) => a - b))
    })

    test("配置错误快速失败", () => {
        expect(() => createSimulation({ duration: 1, seed: 1, actors: [], enemies: [] })).not.toThrow()
        expect(() => createSimulation({ duration: -1, seed: 1, actors: [] })).toThrow()
        expect(() => createSimulation({ duration: 1, seed: Number.NaN, actors: [] })).toThrow()
        expect(() => createSimulation({ duration: 1, seed: 1, actors: [] })).not.toThrow()
        expect(() =>
            createSimulation({
                duration: 1,
                seed: 1,
                actors: [
                    { id: "a", characterId: 1 },
                    { id: "a", characterId: 2 },
                ],
            })
        ).toThrow()
        expect(() =>
            createSimulation({
                duration: 1,
                seed: 1,
                actors: [],
                enemies: [
                    { id: "e", hp: 1 },
                    { id: "e", hp: 1 },
                ],
            })
        ).toThrow()
    })
})
