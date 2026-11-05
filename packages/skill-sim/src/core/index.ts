/**
 * 确定性 sim core 公共 API（U4）。
 *
 * 最小用法：
 * ```ts
 * const sim = createSimulation({ duration: 60, seed: 1, actors: [...], enemies: [...] })
 * sim.schedule(0.5, { kind: "damage", actorId: "a", skillField: "伤害", target: { kind: "primary" }, amount: 100 })
 * const result = sim.run()   // { frames, events, summary }
 * ```
 */

export * from "./buffs"
export * from "./clock"
export * from "./oracle"
export * from "./rng"
export * from "./simulation"
export * from "./targeting"
export * from "./types"
