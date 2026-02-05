<script setup lang="tsx">
import type { EdgeData, NodeData } from "@antv/g6"
import { ExtensionCategory, Graph, register, treeToGraphData } from "@antv/g6"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { ResourceTreeNode } from "@/data/LevelUpCalculator"
import { VueNode } from "@/utils/vue-node"

// 注册 VueNode 扩展
register(ExtensionCategory.NODE, "vue-node", VueNode)

// 定义组件属性
const props = defineProps<{
    tree: ResourceTreeNode | null
}>()

// 图表容器和实例
const graphContainer = ref<HTMLElement | null>(null)
let graph: Graph | null = null

// 构建图表数据
function buildGraphData(tree: ResourceTreeNode | null) {
    if (!tree) return { nodes: [] as NodeData[], edges: [] as EdgeData[] }
    const childData = tree.children?.map(child => treeToGraphData(child)) || []
    return {
        nodes: [
            ...childData.flatMap(data =>
                (data.nodes || []).map(node => {
                    return {
                        ...node,
                        // style: {
                        //     collapsed: node.depth! > 0,
                        // },
                    }
                })
            ),
        ],
        edges: [...childData.flatMap(data => data.edges || [])],
    }
}

// 渲染图表
async function renderGraph() {
    if (!graph) return

    // 获取图表数据
    const data = buildGraphData(props.tree)
    console.log(data)
    graph.setData(data)

    // 渲染
    await graph.render()
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
            nodesep: 10,
            ranksep: 80,
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
                size: [256, 64],
                ports: [
                    { key: "left", placement: [0, 0.5] },
                    { key: "right", placement: [1, 0.5] },
                ],
                component: (data: { name: string; amount: number; type: "Mod" | "Draft" | "Resource"; cid?: number }) => (
                    <ResourceCostItem
                        class={"w-64"}
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
