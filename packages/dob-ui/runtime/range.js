/**
 * range 进度同步（渐进增强）。
 *
 * daisyUI 的滑块进度画在滑块头的超长内阴影上，高度恒等于滑块头，做不出「细轨 + 同高进度」；
 * dob-ui 改为在轨道上用渐变绘制进度，这里负责把 input 的 value 同步成 `--range-progress`（0~1）。
 *
 * 使用：应用启动时调用一次 `initRangeProgress()`。未调用时轨道只有基准色、不显示进度，
 * 滑块仍可正常拖动（纯 CSS 优雅降级）。
 */

/** 需要同步进度的滑杆选择器 */
const RANGE_SELECTOR = "input.range"

/** 原生 value 访问器：用于拦截 v-model 这类程序化赋值 */
const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")

/** 全局只初始化一次（重复调用会重复挂 observer / 监听器） */
let initialized = false

/**
 * 把滑杆当前值换算成 0~1 写入 `--range-progress`。
 * @param el 滑杆元素
 */
function syncRange(el) {
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const value = Number(el.value)
    const progress = max > min ? (value - min) / (max - min) : 0
    el.style.setProperty("--range-progress", String(Math.min(1, Math.max(0, progress))))
}

/**
 * 接管单个滑杆：初次同步，并拦截程序化 value 赋值。
 * @param el 滑杆元素
 */
function enhanceRange(el) {
    if (el.dataset.dobRange === "1") return
    el.dataset.dobRange = "1"

    // Vue 的 v-model 写的是 value 属性（DOM property），不会触发 input 事件；
    // 在实例上包一层访问器即可覆盖「拖拽」与「程序化赋值」两种来源。
    try {
        Object.defineProperty(el, "value", {
            configurable: true,
            get() {
                return valueDescriptor.get.call(this)
            },
            set(next) {
                valueDescriptor.set.call(this, next)
                syncRange(this)
            },
        })
    } catch {
        // 环境不允许改写实例属性时退回仅事件同步
    }

    syncRange(el)
}

/**
 * 初始化 range 进度同步：扫描现有滑杆、监听后续挂载与 min/max 变化、监听拖拽事件。
 * @param root 观察根节点（默认整个文档）
 */
export function initRangeProgress(root = document) {
    if (initialized || !valueDescriptor) return
    initialized = true
    const container = root instanceof Document ? root.body : root
    if (!container) return

    /**
     * 扫描并接管节点自身与后代中的滑杆。
     * @param node 新增节点
     */
    const scan = node => {
        if (!(node instanceof Element)) return
        if (node.matches(RANGE_SELECTOR)) enhanceRange(node)
        node.querySelectorAll?.(RANGE_SELECTOR).forEach(enhanceRange)
    }

    container.querySelectorAll(RANGE_SELECTOR).forEach(enhanceRange)

    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes") {
                if (record.target instanceof HTMLInputElement && record.target.matches(RANGE_SELECTOR)) syncRange(record.target)
                continue
            }
            record.addedNodes.forEach(scan)
        }
    })
    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["min", "max"],
    })

    root.addEventListener(
        "input",
        event => {
            const target = event.target
            if (target instanceof HTMLInputElement && target.matches(RANGE_SELECTOR)) syncRange(target)
        },
        true
    )
}
