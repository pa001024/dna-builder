/**
 * 运行时公共 API（U5）。
 *
 * ```ts
 * const runtime = createSkillRuntime({ simulation, doc, actorId: "lise", recastPolicy: "toggle-off" })
 * runtime.cast(410102, 0)
 * const result = runtime.run()
 * ```
 */

export * from "./conditions"
export * from "./planner"
export * from "./runtime"
export * from "./types"
