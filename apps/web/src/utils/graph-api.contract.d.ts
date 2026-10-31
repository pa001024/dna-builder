/**
 * 节点图助手的代码沙箱接口。
 *
 * 与配装助手的 `build` 对象同构：`run_code` 里只有一个全局对象 `graph`，
 * 下面的声明就是它的全部能力（写代码前先看它，不要凭记忆猜方法名）。
 *
 * 覆盖范围与节点编辑器页面的工具栏能力对齐：查看图结构、增删节点与连线、
 * 改节点数据、触发求值、导入导出、本地保存。凡是这里有的方法，都不要试图
 * 用界面点击去完成（v1 不提供画布点击工具）。
 *
 * 全部方法都是**异步**的，一律 `await`。
 */

/** 一次写操作的结果：成功与否 + 中文描述，便于在同一段代码里自检 */
export interface ApiResult {
    ok: boolean
    /** 失败原因（ok 为 false 时有值） */
    error?: string
    /** 做了什么的中文描述 */
    message: string
}

/** 添加节点的返回：成功时带新节点 id */
export interface AddNodeResult extends ApiResult {
    /** 新节点 id（ok 为 true 时有值） */
    id?: string
}

/** 连线的返回：成功时带新边 id */
export interface ConnectResult extends ApiResult {
    /** 新边 id（ok 为 true 时有值） */
    edgeId?: string
}

/** 图上的一个节点（data 为节点面板数据的纯数据快照） */
export interface GraphNodeView {
    id: string
    /** 节点类型，如 char-input / core-calc / damage-output（用 types() 查全表） */
    type: string
    label: string
    x: number
    y: number
    data: Record<string, unknown>
}

/** 图上的一条边 */
export interface GraphEdgeView {
    id: string
    source: string
    sourceHandle?: string | null
    target: string
    targetHandle?: string | null
}

/** 当前图全貌 */
export interface GraphState {
    name: string
    nodes: GraphNodeView[]
    edges: GraphEdgeView[]
    nodeCount: number
    edgeCount: number
}

/** 可创建的节点类型 */
export interface GraphNodeTypeInfo {
    type: string
    label: string
    category: string
    description?: string
}

/** 求值后仍报错的节点 */
export interface GraphNodeError {
    id: string
    type: string
    label: string
    error: string
}

/**
 * 节点图助手的沙箱接口。
 *
 * 两档写法：
 * - 语义档：`addNode` / `connect` / `updateNode` 这些方法，填类型与 id 即可，适合常规改图。
 * - 自由档：`export()` 拿完整 JSON 随意改写 → `import(json)` 落回画布，适合批量重排与迁移。
 */
export interface GraphApi {
    /** 列出所有可创建的节点类型（含中文名与分类，addNode 前先查它） */
    types(): Promise<GraphNodeTypeInfo[]>
    /** 一次拿全图：名称、全部节点（含面板数据）与全部连线 */
    state(): Promise<GraphState>
    /**
     * 添加一个节点。
     * @param type 节点类型（types() 里的 type，如 "char-input"）
     * @param options x/y 画布坐标（缺省自动顺排）；data 节点面板初始数据（缺省空）
     */
    addNode(type: string, options?: { x?: number; y?: number; data?: Record<string, unknown> }): Promise<AddNodeResult>
    /**
     * 合并更新节点面板数据（只传要改的字段）。
     * @param id 节点 id
     * @param data 要合并的字段
     */
    updateNode(id: string, data: Record<string, unknown>): Promise<ApiResult>
    /**
     * 删除节点（与其相连的边一并删除）。
     * @param id 节点 id
     */
    removeNode(id: string): Promise<ApiResult>
    /**
     * 连接两个端口（按端口类型校验，失败会告诉原因）。
     * @param source 输出端节点 id
     * @param target 输入端节点 id
     * @param sourceHandle 输出端口 id（缺省自动按类型推断）
     * @param targetHandle 输入端口 id（缺省自动按类型推断）
     */
    connect(source: string, target: string, sourceHandle?: string, targetHandle?: string): Promise<ConnectResult>
    /**
     * 删除一条边。
     * @param edgeId 边 id
     */
    disconnect(edgeId: string): Promise<ApiResult>
    /** 清空整张图（节点与边全删，可撤销） */
    clear(): Promise<ApiResult>
    /**
     * 触发全图重新求值并返回当前报错汇总。
     *
     * 求值在后台 worker 跑，返回时给出的是「已落定的报错 + 本次触发的节点数」；
     * 细粒度数值去对应节点的输出端口看，或再调一次 state() 读 data.result。
     */
    evaluate(): Promise<{ ok: boolean; evaluated: number; errors: GraphNodeError[] }>
    /**
     * 从 JSON 文本载入整图（覆盖当前画布，可撤销）。
     * @param json export() 导出的文本，或 { nodes[], edges[], name? } 结构
     */
    import(json: string): Promise<ApiResult>
    /** 导出当前图为 JSON 文本（含节点、边与图名） */
    export(): Promise<{ name: string; json: string; nodeCount: number; edgeCount: number }>
    /**
     * 保存当前图到本地（与工具栏「保存」同入口）。
     * @param name 图名（缺省用当前图名）
     */
    save(name?: string): Promise<ApiResult & { graphId?: number }>
    /** 本轮沙箱调用过的操作记录（调试用） */
    log(): Promise<string[]>
}
