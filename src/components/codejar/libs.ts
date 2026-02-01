/**
 * @author        木炭 <woodcoal@qq.com>
 * @date          2025-09-01 07:49:58
 * Copyright © 木炭 (WOODCOAL) All rights reserved
 */

import type { CodeJarProInstance, IPlugin } from "./types"

/**
 * 检查是否为函数
 * @param fn 要检查的变量
 * @returns 如果是函数则返回 true，否则返回 false
 */
export const isFn = (fn: any): fn is Function => fn && typeof fn === "function"

/**
 * 检查是否为对象
 * @param obj 要检查的变量
 * @returns 如果是对象则返回 true，否则返回 false
 */
export const isObj = (obj: any): obj is object => obj && typeof obj === "object"

/**
 * 防抖函数
 * @param cb 要执行的回调函数
 * @param wait 延迟时间（毫秒）
 */
export function debounce(cb: any, wait: number) {
    let timeout = 0
    return (...args: any) => {
        clearTimeout(timeout)
        timeout = window.setTimeout(() => cb(...args), wait)
    }
}

/**
 * 遍历一个元素下的所有子孙节点
 * @param editor 要遍历的根元素
 * @param visitor 访问者函数，对每个节点执行。如果返回 'stop'，则停止遍历。
 */
export function visit(editor: HTMLElement, visitor: (el: Node) => "stop" | undefined) {
    const queue: Node[] = [] // 使用队列实现深度优先遍历
    if (editor.firstChild) queue.push(editor.firstChild)
    let el = queue.pop()
    while (el) {
        if (visitor(el) === "stop") break
        // 注意这里的顺序，先 nextSibling 后 firstChild，实现深度优先
        if (el.nextSibling) queue.push(el.nextSibling)
        if (el.firstChild) queue.push(el.firstChild)
        el = queue.pop()
    }
}

/**
 * 从错误信息中解析出行号和列号
 * 不同的浏览器和编辑器给的错误信息格式不一样，但通常会包含行号或位置信息
 * 比如：`SyntaxError: Unexpected token , in JSON at position 123`
 * 或者：`SyntaxError: JSON.parse: unexpected end of data at line 2 column 5 of the JSON data`
 * @param message 错误信息
 * @param content 编辑器内的完整文本，用于 position 计算
 * @returns 返回行列数据
 */
export function parseErrorPosition(message: string, content: string) {
    // Chrome/Edge: "Unexpected token ... at position X"
    let match = message.match(/at position (\d+)/)
    if (match) {
        const pos = parseInt(match[1], 10)
        const textBeforeError = content.substring(0, pos)
        const lines = textBeforeError.split("\n")
        const line = lines.length
        const column = lines[lines.length - 1].length + 1
        return { line, column }
    }

    // Firefox: "... at line X column Y"
    match = message.match(/line (\d+) column (\d+)/)
    if (match) {
        return { line: parseInt(match[1], 10), column: parseInt(match[2], 10) }
    }

    return {}
}

/**
 * 创建插件
 * @param options 插件选项
 * @param options.cjp CodeJarPro 实例
 * @param options.config 插件配置
 * @param options.createFn 插件生成回调函数
 * @returns
 */
export function createPlugin<
    T extends object = any,
    P extends Omit<IPlugin<T>, "enabled"> & { enabled?: boolean | (() => boolean) } = IPlugin<T> & {
        enabled?: boolean | (() => boolean)
    },
>(createFn: (cjp: CodeJarProInstance, config?: T) => P) {
    type R = P & {
        enabled: boolean | (() => boolean)
    }

    return (cjp: CodeJarProInstance, config?: T) => {
        const { id = "" } = cjp

        /** 操作列表 */
        const plugins = new Map<string, R>()

        /** 返回指定操作 */
        if (plugins.has(id)) return plugins.get(id)!

        /** 创建操作 */
        const data = createFn(cjp, config)
        const plugin: R = {
            ...data,
            enabled: isFn(data.enabled) || data.enabled === false ? data.enabled : true,
        }

        /** 检查是否启用 */
        plugins.set(id, plugin)

        return plugin
    }
}
