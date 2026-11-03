<script setup lang="tsx">
import type { EdgeData, NodeData } from "@antv/g6"
import { ExtensionCategory, Graph, register, treeToGraphData } from "@antv/g6"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { ResourceTreeNode } from "@/utils/LevelUpCalculator"
import { VueNode } from "@/utils/vue-node"
import ResourceCostItem from "./ResourceCostItem.vue"

// 注册 VueNode 扩展。HMR/重复求值时 G6 会抛“已注册”错误，吞掉即可复用已有注册。
try {
    register(ExtensionCategory.NODE, "vue-node", VueNode)
} catch (error) {
    console.debug("VueNode 扩展已注册，跳过重复注册", error)
}

// 定义组件属性
const props = defineProps<{
    tree: ResourceTreeNode | null
}>()

// 图表容器和实例
const graphContainer = ref<HTMLElement | null>(null)
let graph: Graph | null = null

// 构建图表数据。整棵树一次性转换；
// 多魔之楔时 mergeResults 会在外层包一个 id 为 root 的“总资源依赖”假根（纯容器），
// 图中跳过它、直接把各魔之楔子树排成森林，避免多出一个看不懂的节点。
// 边统一从父节点右侧端口连到子节点左侧端口，否则默认连到节点中心，看起来像没连对。
function buildGraphData(tree: ResourceTreeNode | null) {
    if (!tree) return { nodes: [] as NodeData[], edges: [] as EdgeData[] }
    try {
        const forest = tree.id === "root" && Array.isArray(tree.children) ? tree.children : [tree]
        const parts = forest.map(root =>
            treeToGraphData(root as never, {
                getEdgeData: (source, target) => ({
                    source: source.id,
                    target: target.id,
                    sourcePort: "right",
                    targetPort: "left",
                }),
            })
        )
        return {
            nodes: parts.flatMap(part => part.nodes || []),
            edges: parts.flatMap(part => part.edges || []),
        }
    } catch (error) {
        console.error("资源关系图数据转换失败", error)
        return { nodes: [] as NodeData[], edges: [] as EdgeData[] }
    }
}

// 渲染图表
async function renderGraph() {
    if (!graph) return

    try {
        // 获取图表数据
        const data = buildGraphData(props.tree)
        graph.setData(data)

        // 渲染
        await graph.render()
    } catch (error) {
        console.error("资源关系图渲染失败", error)
    }
}

// 监听树数据变化，更新图表
watch(
    () => props.tree,
    () => {
        // 延迟渲染图表，确保 DOM 已就绪
        renderGraph()
    }
)

// 组件挂载时渲染图表
onMounted(() => {
    if (!graphContainer.value) return
    // 创建新图表
    graph = new Graph({
        container: graphContainer.value,
        autoFit: {
            type: "view", // 自适应类型：'view' 或 'center'
            animation: {
                // 自适应动画效果
                duration: 1000, // 动画持续时间(毫秒)
                easing: "ease-in-out", // 动画缓动函数
            },
        },
        autoResize: true,
        padding: 20,
        behaviors: [
            "drag-canvas",
            "zoom-canvas",
            // "optimize-viewport-transform",
            "drag-element",
            {
                type: "collapse-expand",
                key: "collapse-expand-1",
                trigger: "click", // 修改触发方式为单击
                animation: true, // 启用动画效果
            },
            {
                type: "hover-activate",
                key: "hover-activate-1", // 为交互指定标识符，方便动态更新
            },
        ],
        layout: {
            type: "antv-dagre",
            rankdir: "LR",
            nodesep: 2,
            ranksep: 40,
        },
        edge: {
            type: "cubic-horizontal",
            style: {
                endArrow: true,
            },
        },
        node: {
            type: "vue-node",
            style: {
                // 与节点内容 ResourceCostItem 的 w-70（280px）同宽，否则内容溢出、连线锚点看起来偏了
                size: [280, 64],
                ports: [
                    { key: "left", placement: [0, 0.5] },
                    { key: "right", placement: [1, 0.5] },
                ],
                component: (data: { name: string; amount: number; type: "Mod" | "Draft" | "Resource"; cid?: number }) => (
                    <ResourceCostItem
                        class={"w-70"}
                        name={data.name}
                        value={data.type === "Resource" ? data.amount : [data.amount, data.cid || 0, data.type]}
                    />
                ),
            },
        },
    })
    // 延迟渲染图表，确保 DOM 已就绪
    setTimeout(() => {
        renderGraph()
    }, 30)
})

// 组件卸载时清理资源
onBeforeUnmount(() => {
    if (graph) {
        graph.destroy()
        graph = null
    }
})
</script>

<template>
    <div ref="graphContainer" class="w-full h-full"></div>
</template>
