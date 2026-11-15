import { describe, expect, it } from "vitest"
import type { GlbDocument } from "../../apps/web/src/utils/skin-model-glb"
import { appendUeAnimation, type UeAnimation } from "./anim"

function document(): GlbDocument {
    return {
        json: {
            asset: { version: "2.0" },
            buffers: [{ byteLength: 0 }],
            bufferViews: [],
            accessors: [],
            nodes: [{ name: "Root", rotation: [0, 0, 0, 1] }],
            scenes: [{ nodes: [0] }],
            scene: 0,
        },
        binary: new Uint8Array(),
    }
}

function animation(value: number[]): UeAnimation {
    return {
        name: "idle",
        frames: 2,
        fps: 30,
        tracks: [
            {
                name: "Root",
                positions: [],
                rotations: [
                    { frame: 0, value },
                    { frame: 1, value },
                ],
                scales: [],
            },
        ],
    }
}

/** 从生成的 accessor 读回四元数。 */
function readRotation(doc: GlbDocument, accessor: number): number[] {
    const meta = doc.json.accessors[accessor]
    const view = doc.json.bufferViews[meta.bufferView]
    const start = view.byteOffset ?? 0
    const view32 = new Float32Array(doc.binary.buffer, doc.binary.byteOffset + start, meta.count * 4)
    return Array.from(view32.slice(0, 4))
}

describe("UE animation conversion", () => {
    it("conjugates the rotation so left-handed UE poses land on the right axis", () => {
        // UE 的 (x,y,z,w) 先换轴成 (x,z,y,w)，再对 x/y/z 取反（反射作用在旋转上是共轭）。
        // 只换轴不取反会把手臂/手指转到相反一侧，是长刺的根因。
        const doc = document()
        const result = appendUeAnimation(doc, animation([0.1, 0.2, 0.3, 0.9]))
        expect(result.channels).toBe(1)
        const channel = doc.json.animations![0].channels[0]
        const rotation = readRotation(doc, doc.json.animations![0].samplers[channel.sampler].output)
        const length = Math.hypot(0.1, 0.2, 0.3, 0.9)
        expect(rotation[0]).toBeCloseTo(-0.1 / length, 6)
        expect(rotation[1]).toBeCloseTo(-0.3 / length, 6)
        expect(rotation[2]).toBeCloseTo(-0.2 / length, 6)
        expect(rotation[3]).toBeCloseTo(0.9 / length, 6)
    })

    it("keeps translation axis-swapped without negation", () => {
        const doc = document()
        const result = appendUeAnimation(doc, {
            name: "idle",
            frames: 2,
            fps: 30,
            tracks: [
                {
                    name: "Root",
                    positions: [
                        { frame: 0, value: [100, 200, 300] },
                        { frame: 1, value: [100, 200, 300] },
                    ],
                    rotations: [
                        { frame: 0, value: [0, 0, 0, 1] },
                        { frame: 1, value: [0, 0, 0, 1] },
                    ],
                    scales: [],
                },
            ],
        })
        expect(result.channels).toBeGreaterThan(0)
        const channels = doc.json.animations![0].channels
        const channel = channels.find((entry: any) => entry.target.path === "translation")
        expect(channel).toBeDefined()
        const accessor = doc.json.animations![0].samplers[channel.sampler].output
        const meta = doc.json.accessors[accessor]
        const view = doc.json.bufferViews[meta.bufferView]
        const values = new Float32Array(doc.binary.buffer, doc.binary.byteOffset + (view.byteOffset ?? 0), 3)
        // UE 厘米 → glTF 米，且 y/z 互换：(100,200,300) → (1, 3, 2)
        expect(values[0]).toBeCloseTo(1, 6)
        expect(values[1]).toBeCloseTo(3, 6)
        expect(values[2]).toBeCloseTo(2, 6)
    })
})
