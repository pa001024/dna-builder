/**
 * @author        木炭 <woodcoal@qq.com>
 * @date          2025-09-01 06:28:18
 * Copyright © 木炭 (WOODCOAL) All rights reserved
 */

import { createPlugin, debounce, isObj } from "../libs"
import type { ActionName, CodeJarProInstance } from "../types"

/** 配置 */
export type PluginOptions = {
    show: boolean
}

/**
 * 行号插件
 * @param editor 编辑器实例
 * @param show 是否显示行号
 */
function create(cjp: CodeJarProInstance, config?: PluginOptions) {
    // 一个内部变量，用于存储行号元素的引用
    const { editor, options, id } = cjp

    config = {
        show: true,
        ...config,
    }

    const CONTAINER_ID = `${id}-line-numbers`
    const LINENUMBER_NAME = "codejarpro-line-numbers"

    // 缓存背景颜色
    let background = ""
    let padding = ""

    /** 获取行号元素 */
    const getElement = () => {
        // 查找编辑器区域
        let container = document.getElementById(CONTAINER_ID)

        // 非行号模式不能返回元素
        if (!config.show) {
            if (container) {
                // 还原编辑器样式
                // editor.style.flexGrow = '0';

                const originalParent = container.parentNode!
                originalParent.insertBefore(editor, container)
                originalParent.removeChild(container)
                container.remove()
            }

            return null
        }

        // 不存在创建
        if (!container) {
            container = document.createElement("div")
            container.id = CONTAINER_ID
            container.style.display = "flex"
            container.style.flexDirection = "row-reverse"
            container.style.alignItems = "flex-start"
            container.style.textOverflow = "ellipsis"
            container.style.whiteSpace = "nowrap"
            container.style.setProperty("--cjp-ln-space", "0.5rem")
            container.style.setProperty("--cjp-ln-border", "1px solid #ddd")
            container.style.setProperty("--cjp-ln-opacity", "0.5")

            // 修改编辑器样式
            editor.style.flexGrow = "1"

            // 替换掉原来的 editor，并将 editor 放入 container 里
            editor.parentElement!.insertBefore(container, editor)
            container.appendChild(editor)
        }

        // 查找行号元素
        let el = container.querySelector(`.${LINENUMBER_NAME}`) as HTMLDivElement
        let wrap: HTMLElement
        if (el) {
            wrap = el.parentElement!
        } else {
            // 编辑器默认样式
            wrap = document.createElement("div")
            wrap.style.display = "block"
            wrap.style.display = "block"
            wrap.style.textAlign = "right"
            wrap.style.userSelect = "none"

            // 创建行号元素
            el = document.createElement("div")
            el.className = LINENUMBER_NAME
            el.style.paddingLeft = "var(--cjp-ln-space)"
            el.style.paddingRight = "var(--cjp-ln-space)"
            el.style.overflow = "hidden"
            el.style.borderRight = "var(--cjp-ln-border)"
            el.style.opacity = "var(--cjp-ln-opacity)"
            el.innerHTML = "<div>1</div>"

            wrap.appendChild(el)
            container.appendChild(wrap)
        }

        return { container, lineNumbers: el, lineWrap: wrap }
    }

    /** 刷新状态，及修改编辑器主题时调用 */
    const refresh = () => {
        // 还原编辑器之前的状态
        const container = document.getElementById(CONTAINER_ID)
        if (!container) return

        const css = getComputedStyle(container)
        // 背景不还原，防止覆盖主题中的背景
        // editor.style.background = cacheTheme.background;
        editor.style.borderRadius = css.borderRadius
        editor.style.border = css.border
        editor.style.borderRadius = css.borderRadius
        editor.style.boxShadow = css.boxShadow
        editor.style.margin = css.margin
        editor.style.padding = padding

        // 清除缓存背景
        background = ""
        padding = ""

        return container
    }

    /** 更新行号 */
    const update = (code: string) => {
        const el = getElement()
        if (!el) return

        const { container, lineNumbers, lineWrap } = el

        // 背景改变，则需要重新调整样式效果

        const css = getComputedStyle(editor)
        if (background !== css.backgroundColor) {
            background = css.backgroundColor

            padding = css.padding

            container.style.background = css.background
            container.style.borderRadius = css.borderRadius
            container.style.border = css.border
            container.style.borderRadius = css.borderRadius
            container.style.boxShadow = css.boxShadow
            container.style.margin = css.margin

            container.style.padding = padding
            container.style.paddingLeft = "0"
            lineWrap.style.marginRight = css.paddingLeft

            // editor.style.background = background;
            editor.style.borderRadius = "unset"
            editor.style.border = "none"
            editor.style.borderRadius = "none"
            editor.style.boxShadow = "none"
            editor.style.margin = "auto"
            editor.style.padding = "0"

            lineNumbers.style.color = css.color
            lineNumbers.style.font = css.font
        }

        // 行号处理
        const lines = code.replace(/\r\n/g, "\n").split("\n")
        // 移除最后的空值
        if (lines.length > 1 && lines[lines.length - 1] === "") {
            lines.pop()
        }

        const totalLines = lines.length
        const lineHeights = Array(totalLines)

        // 对于自动换行的代码需要特殊处理
        if (cjp.options.wrap) {
            // 1. 创建一个看不见的 mirror 元素
            const mirror = document.createElement("div")

            // 2. 复制关键样式
            const style = window.getComputedStyle(editor)
            mirror.style.fontFamily = style.fontFamily
            mirror.style.fontSize = style.fontSize
            mirror.style.lineHeight = style.lineHeight
            mirror.style.width = style.width
            mirror.style.padding = style.padding
            mirror.style.tabSize = style.tabSize

            mirror.style.overflowWrap = "break-word"
            mirror.style.wordBreak = "break-all"
            mirror.style.whiteSpace = "pre-wrap"

            // 把它藏到屏幕外
            mirror.style.position = "absolute"
            mirror.style.left = "-9999px"

            // 3. 把每一行代码用 div 包裹后放入 mirror
            mirror.innerHTML = lines.map(line => `<div>${line || " "}</div>`).join("")

            // 4. 把 mirror 添加到 DOM 中，让浏览器计算它的高度
            document.body.appendChild(mirror)

            // 5. 测量并收集每一行的高度
            const children = Array.from(mirror.children) as HTMLElement[]
            children.forEach((child, index) => {
                lineHeights[index] = child.offsetHeight
            })

            // 6. 测量完毕，销毁 mirror
            document.body.removeChild(mirror)
        }

        const currentLineElements = lineNumbers.children
        const currentLineCount = currentLineElements.length

        // 1. 如果新行数比现在多，就添加缺少的行
        if (totalLines > currentLineCount) {
            const fragment = document.createDocumentFragment()
            for (let i = currentLineCount; i < totalLines; i++) {
                const lineElement = document.createElement("div")
                lineElement.textContent = `${i + 1}`
                fragment.appendChild(lineElement)
            }
            lineNumbers.appendChild(fragment)
        }

        // 2. 如果新行数比现在少，就移除多余的行
        if (totalLines < currentLineCount) {
            for (let i = currentLineCount - 1; i >= totalLines; i--) {
                lineNumbers.removeChild(currentLineElements[i])
            }
        }

        // 3. 更新所有行的高度（如果需要）
        for (let i = 0; i < totalLines; i++) {
            const lineElement = currentLineElements[i] as HTMLElement
            const height = lineHeights[i]
            if (height && lineElement.style.height !== `${height}px`) {
                lineElement.style.height = `${height}px`
            } else {
                lineElement.style.removeProperty("height")
            }
        }

        // // 生成新的行号 HTML
        // let lineNumbersContent = '';
        // for (let i = 0; i < lineHeights.length; i++) {
        // 	if (lineHeights[i]) {
        // 		lineNumbersContent += `<div style="height: ${lineHeights[i]}px">${i + 1}</div>`;
        // 	} else {
        // 		lineNumbersContent += `<div>${i + 1}</div>`;
        // 	}
        // }

        // // 更新行号
        // lineNumbers.innerHTML = lineNumbersContent;

        // 重新调整行高度
        lineNumbers.style.height = css.height
    }

    /** 销毁 */
    const destroy = () => {
        // 刷新并还原编辑器样式，返回容器元素
        const container = refresh()
        if (!container) return

        const originalParent = container.parentNode!
        originalParent.insertBefore(editor, container)
        originalParent.removeChild(container)
        container.remove()

        background = ""
    }

    // 创建一个防抖版的行号更新函数，防止在快速拖拽时频繁触发
    const delayUpdate = options.debounce.highlight ?? 300
    const debounceUpdate = delayUpdate ? debounce(update, delayUpdate) : update

    /** 监听事件 */
    const onAction = (params: {
        /** 操作名称 */
        name: ActionName

        /** 编辑器当前代码 */
        code: string

        /** 事件对象 */
        event?: Event
    }) => {
        const { name = "", code = "" } = params

        // setContent之后立刻更新
        if (name === "setContent") return update(code)
        if (["highlight", "resize"].includes(name))
            // 更新行号
            return debounceUpdate(code)

        // 添加滚动监控事件
        if (name === "scroll") {
            if (config.show) {
                const el = getElement()
                if (!el || !el.lineNumbers) return
                el.lineNumbers.scrollTop = editor.scrollTop
            }
        }

        if (name === "refresh") {
            // 检查是否来自主题修改
            const css = getComputedStyle(editor)
            if (css.backgroundColor !== background) {
                refresh()
            }
        }
    }

    return {
        name: "LineNumbers",
        onAction,
        updateConfig: (opts: PluginOptions) => {
            if (!isObj(opts)) return
            config.show = !!opts.show

            if (config.show) {
                cjp.refresh()
            } else {
                destroy()
            }
        },
        destroy,
    }
}

export const LineNumbers = createPlugin(create)
export default LineNumbers

/** 插件类型 */
export type LineNumbersPlugin = ReturnType<typeof LineNumbers>
