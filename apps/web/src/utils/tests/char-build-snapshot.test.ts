import { describe, expect, it } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"

/**
 * 快照跨线程前的 JSON 洗消回归：配装页设置是深层 ref，customVariables 等数组按引用
 * 存进构筑实例，深层代理的数组直接 structuredClone/postMessage 会抛 DataCloneError
 *（`build.current` 在线上真实构筑上 30s 超时即此原因）。用非空变量表复现该形态。
 */
function buildFromReactiveSettings() {
    const settings = ref(
        normalizeCharSettings({
            ...createDefaultCharSettings(),
            baseName: "潜入夜色",
            customVariables: [
                ["[迸发射击]用时", "1.2"],
                ["[校准]用时", "[迸发射击]用时/2"],
            ],
        })
    ).value
    return createCharBuildFromSettings(3104, settings, undefined as never)
}

describe("createWorkerSnapshot", () => {
    it("响应式设置下的快照可结构化克隆", () => {
        const snapshot = createWorkerSnapshot(buildFromReactiveSettings())
        expect(() => structuredClone(snapshot)).not.toThrow()
    })

    it("洗消后的快照重建伤害一致", () => {
        const build = buildFromReactiveSettings()
        const snapshot = createWorkerSnapshot(build)
        expect(createBuildFromSnapshot(snapshot).calculate()).toBe(build.calculate())
    })
})
