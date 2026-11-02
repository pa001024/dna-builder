<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { type GraphEdge, type GraphNode, type GraphShot, L } from "../../content/types"
import { clamp01, easeInOutCubic, easeOutCubic, progressAt } from "./motion"

const props = defineProps<{ shot: GraphShot; time: number; duration: number }>()
const tr = useHelpText()

/** 画布内部坐标系：帮助舞台固定 1280×720，扣掉 56/76 内边距与 1px 边框后即为此尺寸 */
const CANVAS_W = 1126
const CANVAS_H = 606
/** 节点卡片宽 15%，端口圆点正好在左右 x ± 7.5% 处 */
const NODE_HALF_PCT = 7.5
const NODE_ROW_H = 16
const NODE_PAD_BOTTOM = 4

const NODE_KIND_LABELS = {
    input: L("输入节点", "輸入節點", "Input node", "入力ノード", "입력 노드", "Nœud d'entrée"),
    calc: L("计算节点", "計算節點", "Calculation node", "計算ノード", "계산 노드", "Nœud de calcul"),
    output: L("输出节点", "輸出節點", "Output node", "出力ノード", "출력 노드", "Nœud de sortie"),
}

const TX = {
    untitled: L("未命名图", "未命名圖", "Untitled graph", "無題の図", "제목 없는 그래프", "Graphe sans titre"),
    palette: L("节点库", "節點庫", "Nodes", "ノード", "노드", "Nœuds"),
    canvas: L("画布", "畫布", "Canvas", "キャンバス", "캔버스", "Canevas"),
    perf: L("性能", "效能", "Perf", "パフォーマンス", "성능", "Perf"),
    nodeList: L("节点列表", "節點列表", "Node list", "ノード一覧", "노드 목록", "Liste des nœuds"),
    newGraph: L("新建", "新增", "New", "新規", "새로 만들기", "Nouveau"),
    switchGraph: L("切换图", "切換圖", "Switch", "切替", "전환", "Changer"),
    autoSave: L("自动保存", "自動儲存", "Auto save", "自動保存", "자동 저장", "Auto"),
    showAll: L("显示全部", "顯示全部", "Show all", "全体表示", "전체 보기", "Tout voir"),
    importLabel: L("导入", "匯入", "Import", "読込", "가져오기", "Importer"),
    exportLabel: L("导出", "匯出", "Export", "書出", "내보내기", "Exporter"),
    browse: L("浏览", "瀏覽", "Browse", "閲覧", "둘러보기", "Parcourir"),
    ai: "AI",
    share: L("分享", "分享", "Share", "共有", "공유", "Partager"),
    save: L("保存", "儲存", "Save", "保存", "저장", "Enregistrer"),
    deleteLabel: L("删除", "刪除", "Delete", "削除", "삭제", "Supprimer"),
    outputWord: L("输出", "輸出", "output", "出力", "출력", "sortie"),
    inputWord: L("输入", "輸入", "input", "入力", "입력", "entrée"),
    searchNodes: L("搜索可连接的节点", "搜尋可連接的節點", "Search connectable nodes", "接続可能なノードを検索", "연결 가능한 노드 검색", "Rechercher un nœud connectable"),
    calcNodes: L("计算节点", "計算節點", "Calculation nodes", "計算ノード", "계산 노드", "Nœuds de calcul"),
    buildSources: L("构筑来源", "構築來源", "Build sources", "構築ソース", "빌드 소스", "Sources de build"),
    coreNode: L("核心节点", "核心節點", "Core node", "コアノード", "코어 노드", "Nœud central"),
    targetFunction: L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible"),
    charInput: L("角色输入", "角色輸入", "Character input", "キャラ入力", "캐릭터 입력", "Entrée personnage"),
    modInput: L("MOD 输入", "MOD 輸入", "MOD input", "MOD 入力", "MOD 입력", "Entrée MOD"),
    buffAllies: L("BUFF 与队友", "BUFF 與隊友", "BUFF & allies", "BUFF と味方", "BUFF와 동료", "BUFF et alliés"),
    jsonBuild: L("JSON构筑", "JSON構築", "JSON build", "JSON 構築", "JSON 빌드", "Build JSON"),
    onlineBuild: L("在线构筑", "線上構築", "Online build", "オンライン構築", "온라인 빌드", "Build en ligne"),
    portChar: L("角色", "角色", "character", "キャラ", "캐릭터", "personnage"),
    portCharFilter: L("角色过滤", "角色過濾", "character filter", "キャラ絞込", "캐릭터 필터", "filtre personnage"),
    dagEval: L("DAG 求值", "DAG 求值", "DAG evaluation", "DAG 評価", "DAG 평가", "Évaluation DAG"),
    nodesWord: L("节点", "節點", "nodes", "ノード", "노드", "nœuds"),
    edgesWord: L("连线", "連線", "edges", "接続", "연결", "liens"),
    requestsWord: L("请求", "請求", "requests", "リクエスト", "요청", "requêtes"),
    tooMany: L("输入组合过多", "輸入組合過多", "too many input combinations", "入力組み合わせ過多", "입력 조합 과다", "trop de combinaisons"),
    skipEval: L("跳过求值", "跳過求值", "evaluation skipped", "評価をスキップ", "평가 건너뜀", "évaluation ignorée"),
    clear: L("清空", "清空", "Clear", "クリア", "비우기", "Vider"),
    syncCost: L("同步耗时", "同步耗時", "Sync time", "同期時間", "동기 시간", "Temps sync"),
    syncCalls: L("同步次数", "同步次數", "Sync calls", "同期回数", "동기 횟수", "Appels sync"),
    workerCost: L("Worker 耗时", "Worker 耗時", "Worker time", "Worker 時間", "Worker 시간", "Temps Worker"),
    requestCount: L("请求数", "請求數", "Requests", "リクエスト数", "요청 수", "Requêtes"),
    syncPhase: L("同步阶段", "同步階段", "Sync phases", "同期フェーズ", "동기 단계", "Phases sync"),
    workerRequest: L("Worker 请求", "Worker 請求", "Worker requests", "Worker リクエスト", "Worker 요청", "Requêtes Worker"),
    nodeCalls: L("节点调用", "節點呼叫", "Node calls", "ノード呼出", "노드 호출", "Appels de nœuds"),
    linkSync: L("连线同步", "連線同步", "Edge sync", "接続同期", "연결 동기", "Sync des liens"),
    paramSync: L("参数同步", "參數同步", "Param sync", "パラメータ同期", "매개변수 동기", "Sync des paramètres"),
    buildEval: L("构筑求值", "構築求值", "Build evaluation", "構築評価", "빌드 평가", "Évaluation du build"),
    panels: L("面板", "面板", "Panels", "パネル", "패널", "Panneaux"),
    wasmTable: L("WASM 建表", "WASM 建表", "WASM tables", "WASM テーブル", "WASM 테이블", "Tables WASM"),
    workerEvalHint: L("Worker 构筑求值", "Worker 構築求值", "Worker build evaluation", "Worker 構築評価", "Worker 빌드 평가", "Évaluation Worker du build"),
}

function nodeHeaderHeight(node: GraphNode): number {
    return node.subtitle ? 43 : 31
}

function nodeRowCount(node: GraphNode): number {
    return Math.max(node.inputs?.length ?? 0, node.outputs?.length ?? 0)
}

function nodeHeight(node: GraphNode): number {
    return nodeHeaderHeight(node) + nodeRowCount(node) * NODE_ROW_H + NODE_PAD_BOTTOM
}

function nodeEnterStyle(node: GraphNode, index: number) {
    const at = node.at ?? 0.35 + index * 0.22
    const p = easeOutCubic(progressAt(props.time, at, 0.5))
    return {
        opacity: p,
        transform: `translateY(${(1 - p) * 10}px) scale(${0.96 + p * 0.04})`,
    }
}

interface Point {
    x: number
    y: number
}

/** 端口圆点中心：x 在卡片左右边缘（±7.5%），y 在端口行的垂直中心（+1px 卡片边框） */
function portAnchor(node: GraphNode, index: number, side: "input" | "output"): Point {
    const top = (node.y / 100) * CANVAS_H - nodeHeight(node) / 2
    return {
        x: ((node.x + (side === "output" ? NODE_HALF_PCT : -NODE_HALF_PCT)) / 100) * CANVAS_W,
        y: top + 1 + nodeHeaderHeight(node) + index * NODE_ROW_H + NODE_ROW_H / 2,
    }
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const mt = 1 - t
    return {
        x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
        y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
    }
}

function cubicLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
    let length = 0
    let previous = p0
    for (let step = 1; step <= 48; step++) {
        const point = cubicPoint(p0, p1, p2, p3, step / 48)
        length += Math.hypot(point.x - previous.x, point.y - previous.y)
        previous = point
    }
    return length
}

interface EdgeRender {
    edge: GraphEdge
    index: number
    d: string
    color: string
    length: number
    startAt: number
    p0: Point
    p1: Point
    p2: Point
    p3: Point
}

const edgeRenders = computed<EdgeRender[]>(() => {
    return (props.shot.edges ?? []).flatMap((edge, index) => {
        const from = props.shot.nodes[edge.from]
        const to = props.shot.nodes[edge.to]
        if (!from || !to) return []
        const p0 = portAnchor(from, edge.fromPort ?? 0, "output")
        const p3 = portAnchor(to, edge.toPort ?? 0, "input")
        const direction = p3.x >= p0.x ? 1 : -1
        const curve = Math.max(48, Math.min(150, Math.abs(p3.x - p0.x) * 0.48)) * direction
        const p1 = { x: p0.x + curve, y: p0.y }
        const p2 = { x: p3.x - curve, y: p3.y }
        const color = edge.color ?? from.outputs?.[edge.fromPort ?? 0]?.color ?? from.color
        return [
            {
                edge,
                index,
                d: `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}, ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`,
                color,
                length: cubicLength(p0, p1, p2, p3),
                // 节点先落位，连线随后画出；数据里的 at 只是下限
                startAt: Math.max(edge.at ?? 0.9 + index * 0.2, (from.at ?? 0) + 0.32, (to.at ?? 0) + 0.32),
                p0,
                p1,
                p2,
                p3,
            },
        ]
    })
})

function edgeProgress(render: EdgeRender): number {
    return easeOutCubic(progressAt(props.time, render.startAt, 0.65))
}

function edgeDash(render: EdgeRender): string {
    return `${render.length + 1} ${render.length + 1}`
}

function edgeOffset(render: EdgeRender): number {
    return (render.length + 1) * (1 - edgeProgress(render))
}

function isEdgeLive(render: EdgeRender): boolean {
    return edgeProgress(render) >= 0.999
}

/** 运行场景沿贝塞尔曲线移动的数据点，位置由场景时间确定，可安全 seek */
function edgePulse(render: EdgeRender): Point | null {
    if (props.shot.phase !== "run") return null
    if (!isEdgeLive(render)) return null
    const elapsed = props.time - render.startAt
    if (elapsed < 0.5) return null
    const t = (elapsed * 0.32 + render.index * 0.19) % 1
    return cubicPoint(render.p0, render.p1, render.p2, render.p3, t)
}

const edgePulses = computed(() =>
    edgeRenders.value.flatMap(render => {
        const point = edgePulse(render)
        return point ? [{ render, point }] : []
    })
)

function edgeMidpoint(render: EdgeRender): Point {
    return cubicPoint(render.p0, render.p1, render.p2, render.p3, 0.5)
}

const activePane = computed(() => (props.shot.phase === "perf" ? "perf" : "palette"))
const paletteGroups = computed(() => props.shot.palette ?? [])

function groupReveal(index: number): number {
    return easeOutCubic(progressAt(props.time, 0.7 + index * 0.1, 0.32))
}

function isGroupHot(index: number): boolean {
    if (props.shot.phase !== "palette") return false
    const start = 1.2 + index * 0.55
    return props.time >= start && props.time < start + 0.95
}

const dragGhost = computed(() => {
    if (props.shot.phase !== "palette") return null
    const node = props.shot.nodes[0]
    if (!node) return null
    const start = 1.9
    const end = 3.3
    if (props.time < start || props.time > end) return null
    const p = easeInOutCubic(progressAt(props.time, start, end - start))
    const opacity = clamp01(progressAt(props.time, start, 0.18)) * (1 - clamp01(progressAt(props.time, end - 0.18, 0.18)))
    return {
        x: 10 + (node.x - 10) * p,
        y: 32 + (node.y - 32) * p,
        opacity,
        node,
    }
})

const menuProgress = computed(() => (props.shot.menu ? easeOutCubic(progressAt(props.time, 4.4, 0.4)) : 0))

const runVisible = computed(() => easeOutCubic(progressAt(props.time, 1, 0.5)))
const runProgress = computed(() => easeOutCubic(progressAt(props.time, 1.2, 2.2)))
const runNodeCount = computed(() => props.shot.nodes.length)
const runEdgeCount = computed(() => props.shot.edges?.length ?? 0)

const outputNode = computed(() => {
    const index = props.shot.output?.node
    return index == null ? null : (props.shot.nodes[index] ?? null)
})

const outputProgress = computed(() => easeOutCubic(progressAt(props.time, 2.7, 0.5)))

const outputStyle = computed(() => {
    const node = outputNode.value
    if (!node) {
        return {
            right: "16px",
            bottom: "16px",
            opacity: outputProgress.value,
            transform: `translateY(${(1 - outputProgress.value) * 8}px)`,
        }
    }
    return {
        left: `${node.x}%`,
        top: `calc(${node.y}% + ${nodeHeight(node) / 2 + 10}px)`,
        opacity: outputProgress.value,
        transform: `translateX(-50%) translateY(${(1 - outputProgress.value) * 8}px)`,
    }
})

const perfSyncRows = [
    { label: TX.linkSync, value: "12.4ms", ratio: 1 },
    { label: TX.paramSync, value: "6.8ms", ratio: 0.55 },
]

const perfWorkerRows = [
    { label: TX.buildEval, value: "3× · 268.4ms", ratio: 1 },
    { label: TX.panels, value: "2× · 43.6ms", ratio: 0.16 },
    { label: TX.wasmTable, value: "1× · 18.2ms", ratio: 0.07 },
]

const perfNodeRows = [
    { label: TX.coreNode, value: "3× · 156.4ms", ratio: 1, hot: true },
    { label: TX.targetFunction, value: "3× · 12.4ms", ratio: 0.08, hot: false },
    { label: TX.charInput, value: "3× · 3.2ms", ratio: 0.02, hot: false },
    { label: TX.modInput, value: "3× · 2.8ms", ratio: 0.018, hot: false },
    { label: TX.buffAllies, value: "3× · 2.1ms", ratio: 0.013, hot: false },
]

function perfBar(ratio: number, delay: number) {
    const grow = easeOutCubic(progressAt(props.time, delay, 0.5))
    return { width: `${Math.max(3, ratio * 100 * grow)}%` }
}
</script>

<template>
    <div class="help-graph-shot">
        <div class="help-graph-canvas" :class="{ 'help-graph-canvas--perf': shot.phase === 'perf' }">
            <!-- 连线画在节点下层；端口圆点在节点卡片边缘，与路径端点严格重合 -->
            <svg class="help-graph-svg" :viewBox="`0 0 ${CANVAS_W} ${CANVAS_H}`" preserveAspectRatio="none" aria-hidden="true">
                <g v-for="render in edgeRenders" :key="render.index">
                    <path
                        class="help-graph-edge__halo"
                        :d="render.d"
                        fill="none"
                        :stroke="render.color"
                        stroke-width="5"
                        vector-effect="non-scaling-stroke"
                        stroke-linecap="round"
                        :style="{ opacity: edgeProgress(render) * 0.18 }"
                    />
                    <path
                        class="help-graph-edge"
                        :class="{ 'is-live': isEdgeLive(render) }"
                        :d="render.d"
                        fill="none"
                        :stroke="render.color"
                        stroke-width="1.8"
                        vector-effect="non-scaling-stroke"
                        stroke-linecap="round"
                        :stroke-dasharray="edgeDash(render)"
                        :stroke-dashoffset="edgeOffset(render)"
                        :style="{ opacity: edgeProgress(render) > 0 ? 0.96 : 0 }"
                    />
                    <text
                        v-if="render.edge.label"
                        class="help-graph-edge__label"
                        :x="edgeMidpoint(render).x"
                        :y="edgeMidpoint(render).y"
                        text-anchor="middle"
                        dominant-baseline="middle"
                    >
                        {{ tr(render.edge.label) }}
                    </text>
                </g>
                <circle
                    v-for="pulse in edgePulses"
                    :key="`pulse-${pulse.render.index}`"
                    class="help-graph-edge__pulse"
                    :cx="pulse.point.x"
                    :cy="pulse.point.y"
                    r="2.4"
                    :fill="pulse.render.color"
                />
            </svg>

            <!-- 节点卡片：图标 / 类型 / 标题 / 输入输出端口与端口名 -->
            <div
                v-for="(node, index) in shot.nodes"
                :key="index"
                class="help-graph-node-anchor"
                :style="{ left: `${node.x}%`, top: `${node.y}%` }"
            >
                <div
                    class="help-graph-node"
                    :style="{ height: `${nodeHeight(node)}px`, '--node-color': node.color, ...nodeEnterStyle(node, index) }"
                >
                    <div class="help-graph-node__head" :style="{ height: `${nodeHeaderHeight(node)}px` }">
                        <div class="help-graph-node__meta">
                            <span class="help-graph-node__dot" />
                            <Icon v-if="node.icon" :icon="node.icon" class="help-graph-node__icon" />
                            <span class="help-graph-node__kind">{{ tr(node.kindLabel ?? NODE_KIND_LABELS[node.kind]) }}</span>
                        </div>
                        <div class="help-graph-node__title">{{ tr(node.title) }}</div>
                        <div v-if="node.subtitle" class="help-graph-node__subtitle">{{ tr(node.subtitle) }}</div>
                    </div>
                    <div class="help-graph-node__ports">
                        <div
                            v-for="row in nodeRowCount(node)"
                            :key="row"
                            class="help-graph-port-row"
                            :style="{ top: `${nodeHeaderHeight(node) + (row - 1) * NODE_ROW_H}px` }"
                        >
                            <span
                                v-if="node.inputs?.[row - 1]"
                                class="help-graph-port help-graph-port--in"
                                :style="{ '--port-color': node.inputs?.[row - 1]?.color }"
                            >
                                <span class="help-graph-port__dot" />
                                <span class="help-graph-port__label">{{ tr(node.inputs?.[row - 1]?.label) }}</span>
                            </span>
                            <span
                                v-if="node.outputs?.[row - 1]"
                                class="help-graph-port help-graph-port--out"
                                :style="{ '--port-color': node.outputs?.[row - 1]?.color }"
                            >
                                <span class="help-graph-port__label">{{ tr(node.outputs?.[row - 1]?.label) }}</span>
                                <span class="help-graph-port__dot" />
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 顶部工具栏精简版：图名 / 新建 / 切换图 / 自动保存 / 显示全部 / 导入导出 / 浏览 / AI / 分享 / 保存 / 删除 -->
            <div class="help-graph-toolbar">
                <span class="help-graph-tool-btn help-graph-tool-btn--icon" :title="tr(TX.palette)">
                    <Icon icon="ri:contract-left-line" class="help-graph-tool-icon" />
                </span>
                <span class="help-graph-graph-name">{{ tr(shot.title ?? TX.untitled) }}</span>
                <span class="help-graph-tool-btn">
                    <Icon icon="ri:add-line" class="help-graph-tool-icon" />
                    {{ tr(TX.newGraph) }}
                </span>
                <span class="help-graph-tool-btn">
                    <Icon icon="ri:exchange-line" class="help-graph-tool-icon" />
                    {{ tr(TX.switchGraph) }}
                </span>
                <span class="help-graph-autosave">
                    <span class="help-graph-autosave__check"><Icon icon="ri:check-line" class="help-graph-tool-icon" /></span>
                    {{ tr(TX.autoSave) }}
                </span>
                <span class="help-graph-toolbar__group">
                    <span class="help-graph-tool-btn">
                        <Icon icon="ri:focus-3-line" class="help-graph-tool-icon" />
                        {{ tr(TX.showAll) }}
                    </span>
                    <span class="help-graph-tool-btn">
                        <Icon icon="ri:upload-2-line" class="help-graph-tool-icon" />
                        {{ tr(TX.importLabel) }}
                    </span>
                    <span class="help-graph-tool-btn">
                        <Icon icon="ri:download-2-line" class="help-graph-tool-icon" />
                        {{ tr(TX.exportLabel) }}
                    </span>
                    <span class="help-graph-tool-btn">
                        <Icon icon="ri:share-line" class="help-graph-tool-icon" />
                        {{ tr(TX.browse) }}
                    </span>
                    <span class="help-graph-tool-btn">
                        <Icon icon="ri:robot-2-line" class="help-graph-tool-icon" />
                        {{ TX.ai }}
                    </span>
                    <span class="help-graph-tool-btn" :class="{ 'help-graph-tool-btn--accent': shot.phase === 'share' }">
                        <Icon icon="ri:upload-cloud-line" class="help-graph-tool-icon" />
                        {{ tr(TX.share) }}
                    </span>
                    <span class="help-graph-tool-btn help-graph-tool-btn--accent">
                        <Icon icon="ri:save-fill" class="help-graph-tool-icon" />
                        {{ tr(TX.save) }}
                    </span>
                    <span class="help-graph-tool-btn help-graph-tool-btn--danger">
                        <Icon icon="ri:delete-bin-2-fill" class="help-graph-tool-icon" />
                        {{ tr(TX.deleteLabel) }}
                    </span>
                </span>
            </div>

            <!-- 左侧栏：节点库 / 画布 / 性能；性能场景真实切到性能页 -->
            <aside class="help-graph-sidebar">
                <div class="help-graph-tabs">
                    <span class="help-graph-tab" :class="{ 'is-active': activePane === 'palette' }">{{ tr(TX.palette) }}</span>
                    <span class="help-graph-tab">{{ tr(TX.canvas) }}</span>
                    <span class="help-graph-tab" :class="{ 'is-active': activePane === 'perf' }">{{ tr(TX.perf) }}</span>
                </div>

                <div v-if="activePane === 'palette'" class="help-graph-panel">
                    <div class="help-graph-panel__title">
                        <Icon icon="ri:node-tree" class="help-graph-tool-icon" />
                        {{ tr(TX.nodeList) }}
                        <b>34</b>
                    </div>
                    <div
                        v-for="(group, index) in paletteGroups"
                        :key="index"
                        class="help-graph-group"
                        :class="{ 'is-hot': isGroupHot(index) }"
                        :style="{ '--group-color': group.color, opacity: groupReveal(index) }"
                    >
                        <div class="help-graph-group__head">
                            <span class="help-graph-group__dot" />
                            <Icon v-if="group.icon" :icon="group.icon" class="help-graph-group__icon" />
                            <span>{{ tr(group.label) }}</span>
                        </div>
                        <div v-for="(item, itemIndex) in group.items ?? []" :key="itemIndex" class="help-graph-item">
                            <span class="help-graph-item__dash" />
                            <span class="help-graph-item__label">{{ tr(item) }}</span>
                        </div>
                    </div>
                </div>

                <div v-else-if="activePane === 'perf'" class="help-graph-panel help-graph-perf">
                    <div class="help-graph-panel__title">
                        <Icon icon="ri:speed-line" class="help-graph-tool-icon" />
                        {{ tr(TX.perf) }}
                        <span class="help-graph-perf__clear">{{ tr(TX.clear) }}</span>
                    </div>
                    <div class="help-graph-perf__stats">
                        <div class="help-graph-perf__stat">
                            <span>{{ tr(TX.syncCost) }}</span>
                            <b>31.2ms</b>
                        </div>
                        <div class="help-graph-perf__stat">
                            <span>{{ tr(TX.syncCalls) }}</span>
                            <b>12</b>
                        </div>
                        <div class="help-graph-perf__stat">
                            <span>{{ tr(TX.workerCost) }}</span>
                            <b>330.6ms</b>
                        </div>
                        <div class="help-graph-perf__stat">
                            <span>{{ tr(TX.requestCount) }}</span>
                            <b>6</b>
                        </div>
                    </div>

                    <div class="help-graph-perf__section">{{ tr(TX.syncPhase) }}</div>
                    <div v-for="(row, index) in perfSyncRows" :key="`sync-${index}`" class="help-graph-perf__row">
                        <div class="help-graph-perf__row-head">
                            <span>{{ tr(row.label) }}</span>
                            <span>{{ row.value }}</span>
                        </div>
                        <div class="help-graph-perf__bar"><i :style="perfBar(row.ratio, 1.1 + index * 0.12)" /></div>
                    </div>

                    <div class="help-graph-perf__section">{{ tr(TX.workerRequest) }}</div>
                    <div v-for="(row, index) in perfWorkerRows" :key="`worker-${index}`" class="help-graph-perf__row">
                        <div class="help-graph-perf__row-head">
                            <span>{{ tr(row.label) }}</span>
                            <span>{{ row.value }}</span>
                        </div>
                        <div class="help-graph-perf__bar"><i :style="perfBar(row.ratio, 1.5 + index * 0.14)" /></div>
                    </div>

                    <div class="help-graph-perf__section">{{ tr(TX.nodeCalls) }} <span>5</span></div>
                    <div
                        v-for="(row, index) in perfNodeRows"
                        :key="`node-${index}`"
                        class="help-graph-perf__row"
                        :class="{ 'is-hot': row.hot && time >= 5.1 }"
                    >
                        <div class="help-graph-perf__row-head">
                            <span>{{ tr(row.label) }}</span>
                            <span>{{ row.value }}</span>
                        </div>
                        <div class="help-graph-perf__bar"><i :style="perfBar(row.ratio, 1.9 + index * 0.12)" /></div>
                    </div>
                </div>
            </aside>

            <!-- 从节点库拖入节点的拖影 -->
            <div
                v-if="dragGhost"
                class="help-graph-drag"
                :style="{
                    left: `${dragGhost.x}%`,
                    top: `${dragGhost.y}%`,
                    opacity: dragGhost.opacity,
                    '--node-color': dragGhost.node.color,
                }"
            >
                <Icon v-if="dragGhost.node.icon" :icon="dragGhost.node.icon" class="help-graph-tool-icon" />
                <span>{{ tr(dragGhost.node.title) }}</span>
            </div>

            <!-- 端口拖到空白后的连接菜单：只列兼容类型候选 -->
            <div v-if="shot.menu && menuProgress > 0" class="help-graph-menu" :style="{ opacity: menuProgress, transform: `translateY(${(1 - menuProgress) * 8}px)` }">
                <div class="help-graph-menu__head">
                    <span class="help-graph-menu__dot" :style="{ background: '#22c55e' }" />
                    <span>{{ tr(TX.portChar) }} {{ tr(TX.outputWord) }}</span>
                    <Icon icon="ri:close-line" class="help-graph-tool-icon help-graph-menu__close" />
                </div>
                <div class="help-graph-menu__search">
                    <Icon icon="ri:search-line" class="help-graph-tool-icon" />
                    <span>{{ tr(TX.searchNodes) }}</span>
                </div>
                <div class="help-graph-menu__body">
                    <div class="help-graph-menu__group">{{ tr(TX.calcNodes) }}</div>
                    <div class="help-graph-menu__item">
                        <Icon icon="ri:cpu-line" class="help-graph-menu__icon" />
                        <span class="help-graph-menu__label">{{ tr(TX.coreNode) }}</span>
                        <span class="help-graph-menu__tag">{{ tr(TX.inputWord) }} {{ tr(TX.portChar) }}</span>
                    </div>
                    <div class="help-graph-menu__group">{{ tr(TX.buildSources) }}</div>
                    <div class="help-graph-menu__item">
                        <Icon icon="ri:file-code-line" class="help-graph-menu__icon" />
                        <span class="help-graph-menu__label">{{ tr(TX.jsonBuild) }}</span>
                        <span class="help-graph-menu__tag">{{ tr(TX.inputWord) }} {{ tr(TX.portChar) }}</span>
                    </div>
                    <div class="help-graph-menu__item">
                        <Icon icon="ri:cloud-line" class="help-graph-menu__icon" />
                        <span class="help-graph-menu__label">{{ tr(TX.onlineBuild) }}</span>
                        <span class="help-graph-menu__tag">{{ tr(TX.inputWord) }} {{ tr(TX.portCharFilter) }}</span>
                    </div>
                </div>
            </div>

            <!-- 运行场景：DAG 求值状态与 64 组上限 -->
            <div v-if="shot.phase === 'run'" class="help-graph-run" :style="{ opacity: runVisible, transform: `translateY(${(1 - runVisible) * 8}px)` }">
                <div class="help-graph-run__head">
                    <Icon icon="ri:cpu-line" class="help-graph-tool-icon" />
                    {{ tr(TX.dagEval) }}
                    <span class="help-graph-run__pill">Worker</span>
                </div>
                <div class="help-graph-run__rows">
                    <span>{{ tr(TX.nodesWord) }} <b>{{ runNodeCount }}</b></span>
                    <span>{{ tr(TX.edgesWord) }} <b>{{ runEdgeCount }}</b></span>
                    <span>{{ tr(TX.requestsWord) }} <b>3</b></span>
                </div>
                <div class="help-graph-run__bar"><i :style="{ width: `${runProgress * 100}%` }" /></div>
                <div class="help-graph-run__cap">MAX_BUILD_COMBINATIONS · 64</div>
                <div class="help-graph-run__formula">4 × 4 × 4 = 64</div>
                <div class="help-graph-run__warn">&gt; 64 · {{ tr(TX.tooMany) }} · {{ tr(TX.skipEval) }}</div>
            </div>

            <!-- 输出结果锚定在目标函数节点下方 -->
            <div v-if="shot.output" class="help-graph-output" :style="outputStyle">
                <div class="help-graph-output__label">{{ tr(shot.output.label) }}</div>
                <div class="help-graph-output__value">{{ shot.output.value }}</div>
                <div class="help-graph-output__hint">{{ tr(shot.output.hint ?? TX.workerEvalHint) }}</div>
            </div>
        </div>
    </div>
</template>
