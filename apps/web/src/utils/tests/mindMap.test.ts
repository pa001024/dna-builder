import { describe, expect, it } from "vitest"
import {
    cloneMindMapTree,
    collectMindMapSubtreeIds,
    countMindMapNodes,
    createMindMapNode,
    createMindMapTree,
    findMindMapNode,
    isMindMapDescendant,
    MIND_MAP_LAYOUTS,
    type MindMapNode,
    measureMindMapText,
    normalizeMindMapTree,
    readLayoutMeta,
    resolveMindMapStyles,
} from "@/utils/mindMap"
import { layoutFishbone, layoutTimeline } from "@/utils/mindMapCustomLayouts"
import { balanceMindMapSides, buildMindMapEdgePath, layoutMindMap, MIND_MAP_BOX } from "@/utils/mindMapLayout"

/** 测试用测量函数：固定字号下按字符宽度估算，避免依赖 canvas */
function measure(node: MindMapNode, style: { fontSize: number }) {
    const width = Math.max(MIND_MAP_BOX.minWidth, node.text.length * style.fontSize * 0.7 + MIND_MAP_BOX.paddingX * 2)
    return { lines: [node.text], width, height: style.fontSize * 1.35 + MIND_MAP_BOX.paddingY * 2 }
}

/** 简化版树布局函数：按层级向右展开、兄弟纵向排开，用于验证装配逻辑 */
function fakeTreeLayout(tree: any, options: { getWidth: (n: any) => number; getHeight: (n: any) => number }) {
    const visit = (node: any, x: number, y: number, depth: number): any => {
        const width = options.getWidth(node)
        const height = options.getHeight(node)
        const children = (node.children ?? []) as any[]
        let cursor = y
        const laidChildren = children.map((child: any) => {
            const laid = visit(child, x + width + MIND_MAP_BOX.hGap, cursor, depth + 1)
            cursor += laid.subtreeHeight + MIND_MAP_BOX.vGap
            return laid
        })
        const subtreeHeight = Math.max(height, cursor - y - MIND_MAP_BOX.vGap)
        const laid = { id: node.id, x, y, width, height, children: laidChildren, subtreeHeight }
        return laid
    }
    return visit(tree, 0, 0, 0)
}

function makeTree(): MindMapNode {
    return {
        id: "root",
        text: "中心",
        children: [
            {
                id: "a",
                text: "分支A",
                children: [
                    { id: "a1", text: "A1", children: [] },
                    { id: "a2", text: "A2", children: [] },
                ],
            },
            { id: "b", text: "分支B", children: [] },
            { id: "c", text: "分支C", children: [] },
        ],
    }
}

describe("mindMap 树模型", () => {
    it("创建与统计", () => {
        const tree = makeTree()
        expect(countMindMapNodes(tree)).toBe(6)
        expect(createMindMapTree("中心").children).toHaveLength(0)
        expect(createMindMapNode("节点").id).toHaveLength(8)
    })

    it("按 id 查找与父级", () => {
        const found = findMindMapNode(makeTree(), "a1")
        expect(found?.parent?.id).toBe("a")
        expect(found?.index).toBe(0)
        expect(findMindMapNode(makeTree(), "missing")).toBeNull()
    })

    it("后代判定用于阻止成环", () => {
        const tree = makeTree()
        expect(isMindMapDescendant(tree, "a", "a1")).toBe(true)
        expect(isMindMapDescendant(tree, "a1", "a")).toBe(false)
        expect(isMindMapDescendant(tree, "b", "a")).toBe(false)
    })

    it("子树 id 集合", () => {
        const ids = collectMindMapSubtreeIds(makeTree(), "a")
        expect([...ids].sort()).toEqual(["a", "a1", "a2"])
    })

    it("克隆会重新生成 id 且保留结构", () => {
        const clone = cloneMindMapTree(makeTree())
        expect(clone.id).not.toBe("root")
        expect(countMindMapNodes(clone)).toBe(6)
    })

    it("规范化丢弃无效节点", () => {
        const normalized = normalizeMindMapTree({ label: "根", children: [{ foo: 1 }, { text: "有效" }] })
        expect(normalized?.text).toBe("根")
        expect(normalized?.children).toHaveLength(1)
        expect(normalizeMindMapTree(null)).toBeNull()
    })

    it("样式沿父级继承", () => {
        const tree = makeTree()
        tree.children[0].color = "#ff0000"
        tree.children[0].fontSize = 20
        const styles = resolveMindMapStyles(tree, 14, "#0000ff")
        expect(styles.get("root")?.color).toBe("#0000ff")
        expect(styles.get("a")?.color).toBe("#ff0000")
        expect(styles.get("a1")?.color).toBe("#ff0000")
        expect(styles.get("a1")?.fontSize).toBe(20)
        expect(styles.get("b")?.color).toBe("#0000ff")
    })
})

describe("mindMap 布局", () => {
    it("七种布局都有元信息", () => {
        expect(MIND_MAP_LAYOUTS.map(item => item.kind)).toEqual(["mindmap", "logic", "brace", "org", "tree", "timeline", "fishbone"])
        expect(readLayoutMeta("unknown").kind).toBe("mindmap")
    })

    it("布局元信息声明连线走向", () => {
        expect(readLayoutMeta("mindmap").edgeRouting).toBe("horizontal")
        expect(readLayoutMeta("logic").edgeRouting).toBe("horizontal")
        expect(readLayoutMeta("brace").edgeRouting).toBe("horizontal")
        expect(readLayoutMeta("org").edgeRouting).toBe("vertical")
        expect(readLayoutMeta("tree").edgeRouting).toBe("horizontal")
        expect(readLayoutMeta("timeline").edgeRouting).toBe("auto")
        expect(readLayoutMeta("fishbone").edgeRouting).toBe("fishbone")
    })

    it("左右分配按子树规模均衡", () => {
        const sides = balanceMindMapSides(makeTree().children)
        expect(sides).toHaveLength(3)
        // 权重最大的分支先落右侧，剩余两个分到左侧
        expect(sides.filter(side => side === "right")).toHaveLength(1)
        // 单个分支默认落在右侧
        expect(balanceMindMapSides([makeTree().children[1]])[0]).toBe("right")
    })

    it("布局结果覆盖全部可见主题并给出包围盒", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        const result = layoutMindMap(tree, readLayoutMeta("logic"), styles, measure, { "compact-box": fakeTreeLayout })
        expect(result.nodes).toHaveLength(6)
        expect(result.bounds.width).toBeGreaterThan(0)
        expect(result.bounds.height).toBeGreaterThan(0)
    })

    it("折叠主题不展开子级", () => {
        const tree = makeTree()
        tree.children[0].collapsed = true
        const styles = resolveMindMapStyles(tree)
        const result = layoutMindMap(tree, readLayoutMeta("logic"), styles, measure, { "compact-box": fakeTreeLayout })
        expect(result.nodes.map(node => node.id).sort()).toEqual(["a", "b", "c", "root"])
    })

    it("布局函数缺失时退化为纵向堆叠", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        const result = layoutMindMap(tree, readLayoutMeta("tree"), styles, measure, {})
        expect(result.nodes).toHaveLength(6)
        expect(result.bounds.height).toBeGreaterThan(0)
    })

    it("鱼骨图与时间轴产出全部可见主题", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        expect(layoutFishbone(tree, styles, measure).nodes).toHaveLength(6)
        expect(layoutTimeline(tree, styles, measure).nodes).toHaveLength(6)
    })

    it("鱼骨图根主题垂直居中于上下两侧主刺之间", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        const result = layoutFishbone(tree, styles, measure)
        const root = result.nodes.find(node => node.id === "root")!
        const center = root.y + root.height / 2
        expect(center).toBeGreaterThan(result.bounds.minY)
        expect(center).toBeLessThan(result.bounds.maxY)
    })

    it("鱼骨图主刺沿脊柱向右排布并上下交替", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        const result = layoutFishbone(tree, styles, measure)
        const root = result.nodes.find(node => node.id === "root")!
        const ribA = result.nodes.find(node => node.id === "a")!
        const ribB = result.nodes.find(node => node.id === "b")!
        const ribC = result.nodes.find(node => node.id === "c")!
        const spineY = root.y + root.height / 2
        expect(ribA.x).toBeLessThan(ribB.x)
        expect(ribB.x).toBeLessThan(ribC.x)
        expect(ribA.y + ribA.height).toBeLessThan(spineY)
        expect(ribB.y).toBeGreaterThan(spineY)
        expect(ribC.y + ribC.height).toBeLessThan(spineY)
    })

    it("鱼骨图与时间轴节点互不重叠", () => {
        const tree = makeTree()
        const styles = resolveMindMapStyles(tree)
        for (const result of [layoutFishbone(tree, styles, measure), layoutTimeline(tree, styles, measure)]) {
            for (let i = 0; i < result.nodes.length; i++) {
                for (let j = i + 1; j < result.nodes.length; j++) {
                    const a = result.nodes[i]
                    const b = result.nodes[j]
                    const overlapX = a.x < b.x + b.width && b.x < a.x + a.width
                    const overlapY = a.y < b.y + b.height && b.y < a.y + a.height
                    expect(overlapX && overlapY).toBe(false)
                }
            }
        }
    })
})

describe("mindMap 连线路径", () => {
    const parent = {
        id: "p",
        x: 0,
        y: 0,
        width: 100,
        height: 30,
        lines: [],
        style: { fontSize: 14, color: "#000", bg: undefined },
        depth: 0,
    }
    it("子级在右侧时从父右中点出发", () => {
        const child = { ...parent, id: "c", x: 150, y: 100 }
        const path = buildMindMapEdgePath(parent, child, "elbow")
        expect(path.startsWith("M 100 15")).toBe(true)
    })
    it("子级在左侧时镜像", () => {
        const child = { ...parent, id: "c", x: -150, y: 100 }
        const path = buildMindMapEdgePath(parent, child, "elbow")
        expect(path.startsWith("M 0 15")).toBe(true)
    })
    it("上下布局走竖直肘形", () => {
        const child = { ...parent, id: "c", x: 50, y: 120 }
        const path = buildMindMapEdgePath(parent, child, "elbow")
        expect(path.startsWith("M 50 30")).toBe(true)
    })
    it("直线样式不含曲线指令", () => {
        const child = { ...parent, id: "c", x: 150, y: 100 }
        expect(buildMindMapEdgePath(parent, child, "straight")).not.toContain("Q")
    })
    it("纵向布局即使子级偏得很远也从父下中点出线", () => {
        const child = { ...parent, id: "c", x: 400, y: 120 }
        expect(buildMindMapEdgePath(parent, child, "elbow", "vertical").startsWith("M 50 30")).toBe(true)
    })
    it("横向布局即使子级低很多也从父侧边出线", () => {
        const child = { ...parent, id: "c", x: 150, y: 300 }
        expect(buildMindMapEdgePath(parent, child, "elbow", "horizontal").startsWith("M 100 15")).toBe(true)
    })
    it("鱼骨图从鱼头右中点沿脊柱出线", () => {
        const child = { ...parent, id: "c", x: 150, y: -100 }
        expect(buildMindMapEdgePath(parent, child, "straight", "fishbone")).toBe("M 100 15 L 200 15 L 200 -70")
    })
})

describe("mindMap 文本折行", () => {
    it("短文本单行", () => {
        const metrics = measureMindMapText("短", 14, 220)
        expect(metrics.lines).toHaveLength(1)
    })
    it("超长文本折成多行且不超过最大宽度", () => {
        const metrics = measureMindMapText("这是一段很长的主题文字用于验证折行逻辑是否生效".repeat(2), 14, 120)
        expect(metrics.lines.length).toBeGreaterThan(1)
        expect(metrics.width).toBeLessThanOrEqual(120)
        expect(metrics.height).toBeGreaterThan(metrics.lines.length * 14)
    })
    it("换行符强制分行", () => {
        const metrics = measureMindMapText("第一行\n第二行", 14, 220)
        expect(metrics.lines).toEqual(["第一行", "第二行"])
    })
})
