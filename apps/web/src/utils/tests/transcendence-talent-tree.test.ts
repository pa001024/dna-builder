import { describe, expect, it } from "vitest"
import { type DnaSeasonTalent, talents } from "@/data/d/dnaseasonprogress.data"
import {
    buildTalentTreeLayout,
    centerTalentTreeOn,
    clampTalentTreeZoom,
    computeTalentMatchSet,
    fitTalentTreeBoundsScale,
    screenToWorld,
    shouldApplyTalentTreeGesture,
    shouldZoomTalentTreeWheel,
    TALENT_NODE_TIER_SIZE,
    TALENT_TREE_MARGIN,
    TalentTreeClickGate,
    TalentTreeGesture,
    talentEdgeOpacity,
    talentNodeOpacity,
    talentTreeCanvasZoom,
    talentTreeContentSize,
    talentTreePanToScroll,
    talentTreeScrollToPan,
    worldToScreen,
    zoomTalentTreeAt,
} from "@/utils/transcendence-talent-tree"

const EXPECTED = [
    { stage: 1, edges: 119, depth: 51, multiParent: 18, width: 9080, height: 480 },
    { stage: 2, edges: 132, depth: 47, multiParent: 27, width: 8440, height: 760 },
    { stage: 3, edges: 136, depth: 49, multiParent: 35, width: 8760, height: 760 },
]

function treeTalents(stage: number) {
    return talents.filter(talent => talent.stageId === stage)
}

/** 构造最小可解析的天赋节点，用于非对称/非零边界夹具 */
function makeTalent(id: number, position: [number, number], overrides: Partial<DnaSeasonTalent> = {}): DnaSeasonTalent {
    return {
        id,
        stageId: 1,
        kind: 2,
        maxLevel: 1,
        name: `talent-${id}`,
        desc: "",
        icon: "",
        position,
        effects: [],
        ...overrides,
    }
}

describe("buildTalentTreeLayout", () => {
    for (const expected of EXPECTED) {
        it(`stage ${expected.stage} 节点/边/深度与上游一致`, () => {
            const layout = buildTalentTreeLayout(treeTalents(expected.stage))

            expect(layout.nodes).toHaveLength(100)
            expect(layout.edges).toHaveLength(expected.edges)
            expect(layout.roots).toHaveLength(1)
            expect(layout.cycles).toHaveLength(0)
            expect(Math.max(...layout.nodes.map(node => node.depth))).toBe(expected.depth)
            expect(layout.nodes.filter(node => node.parentIds.length > 1)).toHaveLength(expected.multiParent)
            expect(new Set(layout.edges.map(edge => `${edge.from}:${edge.to}`)).size).toBe(expected.edges)
        })

        it(`stage ${expected.stage} 画布边界含 100px 边距`, () => {
            const layout = buildTalentTreeLayout(treeTalents(expected.stage))

            expect(layout.bounds.width).toBe(expected.width)
            expect(layout.bounds.height).toBe(expected.height)
            expect(layout.bounds.offsetX).toBe(TALENT_TREE_MARGIN)
            expect(layout.bounds.offsetY).toBe(
                TALENT_TREE_MARGIN + Math.max(0, -Math.min(...treeTalents(expected.stage).map(talent => talent.position[1])))
            )
        })
    }

    it("y 轴按 UMG 画布向下：固定 id 断言（符号翻转为 -1 会失败）", () => {
        const layout = buildTalentTreeLayout(treeTalents(1))
        const root = layout.nodeMap.get(100001)!
        const top = layout.nodeMap.get(100002)!
        const bottom = layout.nodeMap.get(100007)!

        // 上游 IconLoc：根 0、100002 为 -140、100007 为 +140
        expect(root.talent.position[1]).toBe(0)
        expect(top.talent.position[1]).toBe(-140)
        expect(bottom.talent.position[1]).toBe(140)
        expect(layout.bounds.offsetY).toBe(240)

        expect(root.y).toBe(240)
        expect(top.y).toBe(100)
        expect(bottom.y).toBe(380)
        expect(top.y).toBeLessThan(bottom.y)
    })

    it("坐标映射：画布坐标 = 原始坐标 + 边距偏移", () => {
        const layout = buildTalentTreeLayout(treeTalents(1))
        const target = layout.nodeMap.get(100002)!

        expect(target.rawX).toBe(320)
        expect(target.rawY).toBe(-140)
        expect(target.x).toBe(target.rawX + layout.bounds.offsetX)
        expect(target.y).toBe(target.rawY + layout.bounds.offsetY)
        expect(target.y).toBe(100)
    })

    it("非零 minX/minY 时只平移不缩放", () => {
        const layout = buildTalentTreeLayout([makeTalent(1, [500, -300]), makeTalent(2, [660, 100])])

        expect(layout.bounds.offsetX).toBe(TALENT_TREE_MARGIN - 500)
        expect(layout.bounds.offsetY).toBe(TALENT_TREE_MARGIN + 300)
        expect(layout.bounds.width).toBe(160 + TALENT_TREE_MARGIN * 2)
        expect(layout.bounds.height).toBe(400 + TALENT_TREE_MARGIN * 2)
        expect(layout.nodeMap.get(1)!.x).toBe(100)
        expect(layout.nodeMap.get(1)!.y).toBe(100)
        expect(layout.nodeMap.get(2)!.x).toBe(260)
        expect(layout.nodeMap.get(2)!.y).toBe(500)
    })

    it("节点档位：菱形与方形三档（按类型与连接度）", () => {
        const layout = buildTalentTreeLayout(treeTalents(1))
        const tiers = new Set(layout.nodes.map(node => node.tier))

        expect(tiers).toEqual(new Set(["diamond", "large", "medium", "small"]))
        for (const node of layout.nodes) {
            expect(node.width).toBe(TALENT_NODE_TIER_SIZE[node.tier])
            expect(node.height).toBe(node.width)
        }
        expect(layout.nodes.filter(node => node.tier === "diamond")).toHaveLength(11)
        expect(layout.nodes.filter(node => node.width > node.height)).toHaveLength(0)
    })

    it("连线为父节点中心到子节点中心", () => {
        const layout = buildTalentTreeLayout(treeTalents(1))

        for (const edge of layout.edges) {
            const parent = layout.nodeMap.get(edge.from)!
            const child = layout.nodeMap.get(edge.to)!

            expect(edge.x1).toBe(parent.x)
            expect(edge.y1).toBe(parent.y)
            expect(edge.x2).toBe(child.x)
            expect(edge.y2).toBe(child.y)
        }
    })

    it("多父节点保留全部入边", () => {
        const layout = buildTalentTreeLayout(treeTalents(2))
        const multi = layout.nodes.find(node => node.parentIds.length === 5)

        expect(multi).toBeTruthy()
        expect(layout.edges.filter(edge => edge.to === multi!.talent.id)).toHaveLength(5)
    })

    it("只有 parentIds 也能生成边", () => {
        const layout = buildTalentTreeLayout([makeTalent(1, [0, 0]), makeTalent(2, [160, 0], { parentIds: [1] })])

        expect(layout.edges).toHaveLength(1)
        expect(layout.edges[0]).toMatchObject({ from: 1, to: 2 })
    })

    it("只有 unlockChildren 也能生成边", () => {
        const layout = buildTalentTreeLayout([makeTalent(1, [0, 0], { unlockChildren: [2] }), makeTalent(2, [160, 0])])

        expect(layout.edges).toHaveLength(1)
        expect(layout.edges[0]).toMatchObject({ from: 1, to: 2 })
    })

    it("两表重复描述同一条边时只输出一条", () => {
        const layout = buildTalentTreeLayout([makeTalent(1, [0, 0], { unlockChildren: [2] }), makeTalent(2, [160, 0], { parentIds: [1] })])

        expect(layout.edges).toHaveLength(1)
        expect(layout.nodeMap.get(2)!.parentIds).toEqual([1])
    })

    it("异常引用不崩溃且不产生边", () => {
        const source = treeTalents(1)
        const broken = [source[0], { ...source[1], parentIds: [], unlockChildren: [999999999] }]
        const layout = buildTalentTreeLayout(broken)

        expect(layout.nodes).toHaveLength(2)
        expect(layout.edges).toHaveLength(0)
    })

    it("环数据有记录且不死循环", () => {
        const source = treeTalents(1)
        const first = { ...source[0], parentIds: [source[1].id] }
        const second = { ...source[1], parentIds: [source[0].id] }
        const layout = buildTalentTreeLayout([first, second])

        expect(layout.cycles.length).toBeGreaterThan(0)
        expect(layout.nodes).toHaveLength(2)
    })
})

describe("computeTalentMatchSet", () => {
    it("空条件命中全部节点", () => {
        const list = treeTalents(1)
        const matched = computeTalentMatchSet(list, {})

        expect(matched.size).toBe(list.length)
    })

    it("kind / maxLevel 组合筛选", () => {
        const list = treeTalents(1)
        const target = list[0]
        const matched = computeTalentMatchSet(list, { kind: target.kind, maxLevel: target.maxLevel })

        expect(matched.has(target.id)).toBe(true)
        for (const id of matched) {
            const talent = list.find(item => item.id === id)!
            expect(talent.kind).toBe(target.kind)
            expect(talent.maxLevel).toBe(target.maxLevel)
        }
    })

    it("关键词在翻译文本上匹配", () => {
        const list = treeTalents(1)
        const target = list.find(talent => talent.effects.length > 0)!
        const translated = `translated-${target.effects[0].attr}`
        const matched = computeTalentMatchSet(list, { keyword: "translated-" }, text =>
            text === target.effects[0].attr ? translated : text
        )

        expect(matched.has(target.id)).toBe(true)
    })

    it("匹配集合不改变节点几何", () => {
        const list = treeTalents(1)
        const before = buildTalentTreeLayout(list)
        const matched = computeTalentMatchSet(list, { kind: 4, keyword: list[0].name })
        const after = buildTalentTreeLayout(list)

        expect(matched.size).toBeLessThan(list.length)
        expect(after.nodes.map(node => [node.talent.id, node.x, node.y])).toEqual(
            before.nodes.map(node => [node.talent.id, node.x, node.y])
        )
    })

    it("筛选不修改输入数据（纯度）", () => {
        const list = treeTalents(1)
        const snapshot = list.map(talent => ({
            id: talent.id,
            position: [...talent.position],
            parents: [...(talent.parentIds ?? [])],
            children: [...(talent.unlockChildren ?? [])],
        }))

        computeTalentMatchSet(list, { kind: 4, keyword: "攻击" })

        expect(
            list.map(talent => ({
                id: talent.id,
                position: [...talent.position],
                parents: [...(talent.parentIds ?? [])],
                children: [...(talent.unlockChildren ?? [])],
            }))
        ).toEqual(snapshot)
    })

    it("组件渲染口径：筛选后节点数与连线条数不变，仅透明度变化", () => {
        const list = treeTalents(1)
        const layout = buildTalentTreeLayout(list)
        const matched = computeTalentMatchSet(list, { kind: 4 })

        const nodeOpacities = layout.nodes.map(node => talentNodeOpacity(matched, node.talent.id))
        const edgeOpacities = layout.edges.map(edge => talentEdgeOpacity(matched, edge.from, edge.to, edge.multiParent))

        expect(nodeOpacities).toHaveLength(100)
        expect(edgeOpacities).toHaveLength(119)
        expect(nodeOpacities.filter(value => value === 1)).toHaveLength(10)
        expect(nodeOpacities.filter(value => value < 1)).toHaveLength(90)
    })
})

describe("视口变换", () => {
    const viewport = { scale: 0.75, panX: 120, panY: -40 }

    it("worldToScreen 与 screenToWorld 互逆", () => {
        const screen = worldToScreen(viewport, 400, 260)
        const world = screenToWorld(viewport, screen.x, screen.y)

        expect(world.x).toBeCloseTo(400)
        expect(world.y).toBeCloseTo(260)
    })

    it("以锚点缩放时锚点下的世界坐标不动", () => {
        const anchor = { x: 300, y: 220 }
        const worldBefore = screenToWorld(viewport, anchor.x, anchor.y)
        const next = zoomTalentTreeAt(viewport, 1.6, anchor.x, anchor.y)
        const worldAfter = screenToWorld(next, anchor.x, anchor.y)

        expect(next.scale).toBe(1.6)
        expect(worldAfter.x).toBeCloseTo(worldBefore.x)
        expect(worldAfter.y).toBeCloseTo(worldBefore.y)
    })

    it("缩放钳制在 0.028–4", () => {
        expect(zoomTalentTreeAt(viewport, 10, 0, 0).scale).toBe(4)
        expect(zoomTalentTreeAt(viewport, 0.01, 0, 0).scale).toBe(0.028)
    })

    it("clamp 对 NaN / ±Infinity 返回合法值", () => {
        expect(clampTalentTreeZoom(Number.NaN)).toBe(0.75)
        expect(clampTalentTreeZoom(Number.POSITIVE_INFINITY)).toBe(0.75)
        expect(clampTalentTreeZoom(Number.NEGATIVE_INFINITY)).toBe(0.75)
        expect(clampTalentTreeZoom(0.5)).toBe(0.5)
    })

    it("滚轮只接受纵向为主的有限 delta", () => {
        expect(shouldZoomTalentTreeWheel(0, -120)).toBe(true)
        expect(shouldZoomTalentTreeWheel(0, 120)).toBe(true)
        expect(shouldZoomTalentTreeWheel(120, 0)).toBe(false)
        expect(shouldZoomTalentTreeWheel(-120, -30)).toBe(false)
        expect(shouldZoomTalentTreeWheel(0, 0)).toBe(false)
        expect(shouldZoomTalentTreeWheel(0, Number.NaN)).toBe(false)
    })

    it("显示全部同时受宽高约束，取较小缩放", () => {
        expect(fitTalentTreeBoundsScale(1360, 493, 9080, 480, 24)).toBeCloseTo((1360 - 48) / 9080)
        expect(fitTalentTreeBoundsScale(1360, 493, 1000, 760, 24)).toBeCloseTo((493 - 48) / 760)
        expect(fitTalentTreeBoundsScale(0, 493, 9080, 480)).toBe(0.75)
        expect(fitTalentTreeBoundsScale(1360, 0, 9080, 480)).toBe(0.75)
        expect(fitTalentTreeBoundsScale(100, 100, 100000, 100000, 24)).toBe(0.028)
    })

    it("320px 视口能装下最宽的 stage 1（9080px），更窄才会被最低缩放截断", () => {
        expect(fitTalentTreeBoundsScale(320, 600, 9080, 480, 24)).toBeCloseTo(272 / 9080)
        expect(fitTalentTreeBoundsScale(320, 600, 9080, 480, 24)).toBeGreaterThan(0.028)
        expect(fitTalentTreeBoundsScale(300, 600, 9080, 480, 24)).toBe(0.028)
    })

    it("居中根节点把根放到视口中心", () => {
        const centered = centerTalentTreeOn(500, 250, 800, 600, 0.75)
        const screen = worldToScreen(centered, 500, 250)

        expect(screen.x).toBeCloseTo(400)
        expect(screen.y).toBeCloseTo(300)
    })
})

describe("画布层样式（zoom 缩放 + 原生滚动）", () => {
    it("画布缩放走 zoom 数值并沿用缩放钳制", () => {
        expect(talentTreeCanvasZoom(1.5)).toBe(1.5)
        expect(talentTreeCanvasZoom(10)).toBe(4)
        expect(talentTreeCanvasZoom(0.01)).toBe(0.028)
        expect(talentTreeCanvasZoom(Number.NaN)).toBe(0.75)
    })

    it("pan 与原生滚动互逆，居中时滚动量等于世界坐标 × 缩放", () => {
        const halfWidth = 680
        const halfHeight = 300
        const centered = centerTalentTreeOn(400, 260, halfWidth * 2, halfHeight * 2, 0.75)

        expect(talentTreePanToScroll(centered.panX, centered.panY, halfWidth, halfHeight)).toEqual({
            scrollLeft: 400 * 0.75,
            scrollTop: 260 * 0.75,
        })

        const pan = talentTreeScrollToPan(120, 40, halfWidth, halfHeight)

        expect(pan).toEqual({ panX: 560, panY: 260 })
        expect(talentTreePanToScroll(pan.panX, pan.panY, halfWidth, halfHeight)).toEqual({ scrollLeft: 120, scrollTop: 40 })
    })

    it("可滚动内容包含两侧半屏留白，保证任意节点都能居中", () => {
        expect(talentTreeContentSize(9080, 480, 0.75, 680, 300)).toEqual({
            width: 9080 * 0.75 + 1360,
            height: 480 * 0.75 + 600,
        })
    })
})

describe("点击抑制与手势落盘（纯逻辑）", () => {
    const viewport = { scale: 0.75, panX: 120, panY: -40 }

    it("未拖拽时 click 不被吞掉（键盘 Enter / 轻点）", () => {
        const gate = new TalentTreeClickGate()

        expect(gate.consume()).toBe(false)
        expect(gate.consume()).toBe(false)
    })

    it("拖拽结束只吞掉紧随的一次 click，之后恢复", () => {
        const gate = new TalentTreeClickGate()

        gate.arm()
        expect(gate.consume()).toBe(true)
        expect(gate.consume()).toBe(false)
    })

    it("下一次按下复位抑制，不影响后续选择", () => {
        const gate = new TalentTreeClickGate()

        gate.arm()
        gate.reset()
        expect(gate.consume()).toBe(false)
    })

    it("单指触摸不落盘（交给原生滚动），鼠标与双指落盘", () => {
        expect(shouldApplyTalentTreeGesture("touch", 1)).toBe(false)
        expect(shouldApplyTalentTreeGesture("touch", 2)).toBe(true)
        expect(shouldApplyTalentTreeGesture("mouse", 1)).toBe(true)
        expect(shouldApplyTalentTreeGesture("pen", 1)).toBe(true)
    })

    it("单指触摸移动不改写 pan（原生滚动分支）", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 40, 60, viewport)
        const move = gesture.move(1, 140, 160, viewport)

        // 手势自身仍会算出 pan，DOM 层通过 shouldApplyTalentTreeGesture 丢弃它
        expect(shouldApplyTalentTreeGesture("touch", gesture.pointerCount)).toBe(false)
        expect(move.viewport?.panX).toBe(viewport.panX + 100)
    })

    it("触摸 tap（无移动）不 arm 抑制，click 可选中", () => {
        const gesture = new TalentTreeGesture()
        const gate = new TalentTreeClickGate()

        gesture.down(1, 40, 60, viewport)
        gesture.up(1, viewport)

        if (gesture.dragging) {
            gate.arm()
        }

        expect(gesture.dragging).toBe(false)
        expect(gate.consume()).toBe(false)
    })
})

describe("TalentTreeGesture（点击与拖拽分流）", () => {
    const viewport = { scale: 0.75, panX: 120, panY: -40 }

    it("单指按下不请求指针捕获（否则 click 会被重定向到容器，节点点不开）", () => {
        const gesture = new TalentTreeGesture()
        const down = gesture.down(1, 40, 60, viewport)

        expect(down.capture).toBeUndefined()
        expect(gesture.dragging).toBe(false)
    })

    it("轻点（未超过阈值）不算拖拽，click 仍归属节点", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 40, 60, viewport)
        const move = gesture.move(1, 42, 61, viewport)
        const up = gesture.up(1, viewport)

        expect(move.capture).toBeUndefined()
        expect(gesture.dragging).toBe(false)
        expect(up.release).toBe(1)
    })

    it("越过阈值后请求捕获并标记拖拽，拖拽后的 click 被吞掉", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 40, 60, viewport)
        const move = gesture.move(1, 80, 60, viewport)

        expect(gesture.dragging).toBe(true)
        expect(move.capture).toBe(1)
        expect(move.viewport?.panX).toBe(viewport.panX + 40)
        expect(move.viewport?.panY).toBe(viewport.panY)
    })

    it("拖拽结束后下一次按下重置为可点击", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 0, 0, viewport)
        gesture.move(1, 60, 0, viewport)
        gesture.up(1, viewport)

        const second = gesture.down(1, 10, 10, viewport)

        expect(second.capture).toBeUndefined()
        expect(gesture.dragging).toBe(false)
    })

    it("双指按下请求捕获，移动时按双指距离缩放", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 0, 0, viewport)
        const second = gesture.down(2, 100, 0, viewport)
        expect(second.capture).toBe(2)

        const move = gesture.move(2, 200, 0, viewport)
        expect(move.viewport?.scale).toBeCloseTo(viewport.scale * 2)
        expect(gesture.dragging).toBe(true)
    })

    it("双指同向平移：双指中点位移会带动画布平移", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 0, 0, viewport)
        gesture.down(2, 100, 0, viewport)
        const startWorld = screenToWorld(viewport, 50, 0)

        gesture.move(1, 20, 30, viewport)
        const move = gesture.move(2, 120, 30, viewport)
        const endWorld = screenToWorld(move.viewport!, 70, 30)

        expect(move.viewport!.scale).toBeCloseTo(viewport.scale)
        expect(endWorld.x).toBeCloseTo(startWorld.x)
        expect(endWorld.y).toBeCloseTo(startWorld.y)
        expect(move.viewport!.panX).toBeCloseTo(viewport.panX + 20)
        expect(move.viewport!.panY).toBeCloseTo(viewport.panY + 30)
    })

    it("轻点触发选中：down→up 全程 dragging 为 false，节点 click 会走到 select", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(7, 30, 40, viewport)
        const move = gesture.move(7, 31, 41, viewport)
        gesture.up(7, viewport)

        expect(move.viewport).toBeDefined()
        expect(gesture.dragging).toBe(false)
    })

    it("拖拽后的 click 被抑制，下一次按下恢复", () => {
        const gesture = new TalentTreeGesture()

        gesture.down(1, 0, 0, viewport)
        gesture.move(1, 80, 0, viewport)
        expect(gesture.dragging).toBe(true)
        gesture.up(1, viewport)

        // click 事件在 pointerup 之后紧邻触发，此时仍应视为拖拽
        expect(gesture.dragging).toBe(true)

        gesture.down(1, 10, 10, viewport)
        expect(gesture.dragging).toBe(false)
    })
})
