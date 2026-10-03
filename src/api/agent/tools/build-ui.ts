/**
 * 配装页 UI 工具：把 {@link build-ui-driver} 的 DOM 操作包成模型可调用的工具。
 *
 * 每个工具的返回值都是「刚做完的事 + 界面当前状态提示」，模型据此决定下一步，
 * 不需要靠记忆猜界面变成什么样了。
 */

import type { AgentTool } from "@/api/agent/tool"
import {
    type BuildUiTarget,
    clickBuildTarget,
    pressBuildKey,
    readBuildPage,
    scrollBuildTarget,
    selectBuildOption,
    typeBuildText,
} from "@/utils/build-ui-driver"

/**
 * @description 把模型的定位参数收敛成驱动需要的形态。
 * @param args 工具参数
 * @returns 定位参数
 */
function toTarget(args: Record<string, unknown>): BuildUiTarget {
    const nth = Number(args.nth)

    return {
        ...(args.ref ? { ref: `${args.ref}`.trim() } : {}),
        ...(args.selector ? { selector: `${args.selector}`.trim() } : {}),
        ...(args.label ? { label: `${args.label}`.trim() } : {}),
        ...(Number.isFinite(nth) && nth > 0 ? { nth } : {}),
        ...(args.scope ? { scope: args.scope as BuildUiTarget["scope"] } : {}),
    }
}

/**
 * @description 校验定位参数至少给了一个。
 * @param target 定位参数
 * @returns 错误信息；合法时返回空串
 */
function missingTarget(target: BuildUiTarget): string {
    return target.ref || target.selector || target.label ? "" : "必须给出 ref、selector 或 label 之一来指定目标"
}

/**
 * @description 构造 read_page 工具：读取配装页当前可操作的界面结构。
 * @returns 工具
 */
export function createReadPageTool(): AgentTool<never> {
    return {
        definition: {
            name: "read_page",
            description:
                "读取配装页当前可见可操作的结构：列出按钮 / 输入框 / 下拉框 / 表达式编辑器 / 滑块等控件，每项带 ref、类型、名称与当前值，并给出伤害结果与目标函数等关键数值。\n" +
                "读取配置（武器 / 魔之楔 / 魔灵 / BUFF / 等级 / 目标函数）优先用 run_code 的 build.state()，本工具用于确认界面状态与定位控件。\n" +
                "每次点击或输入后再调用一次确认结果。\n" +
                "ref 只在本次快照内有效——页面重绘后必须重新读取。\n" +
                "scope 默认 auto：有弹层（自动配装 / MOD 选择等）时读弹层，否则读整页；也可用 page / sidebar / main / dialog 指定。\n" +
                'contains 只在控件名称里筛选，用于在长页面里快速定位某类控件（例如 contains="MOD"）。',
            parameters: {
                type: "object",
                properties: {
                    scope: { type: "string", enum: ["auto", "page", "sidebar", "main", "dialog"] },
                    maxNodes: { type: "integer", description: "返回控件数量上限，默认 80，最大 240" },
                    contains: { type: "string", description: "可选，只保留名称里包含该关键词的控件" },
                    withSummary: { type: "boolean", description: "是否同时给出伤害结果与目标函数，默认 true" },
                },
            },
        },

        execute(args) {
            return {
                content: readBuildPage({
                    scope: (args.scope as ReadScope) ?? "auto",
                    maxNodes: Number(args.maxNodes) || undefined,
                    contains: args.contains ? `${args.contains}` : undefined,
                    withSummary: args.withSummary === undefined ? true : args.withSummary === true,
                }),
            }
        },
    }
}

/** read_page 接受的作用域取值。 */
type ReadScope = "auto" | "page" | "sidebar" | "main" | "dialog"

/**
 * @description 构造 click 工具：点击配装页上的控件。
 * @returns 工具
 */
export function createClickTool(): AgentTool<never> {
    return {
        definition: {
            name: "click_ui",
            description:
                "点击配装页上的按钮 / 开关 / 标签页 / 选项项。用 read_page 拿到的 ref 最稳，也可用 selector（[data-agent=...] 锚点）或 label（控件名称）。\n" +
                "同名控件有多个时用 nth 指定第几个（从 1 开始）。\n" +
                "点开的是下拉框时会把候选项一并返回，可直接接着用 select_ui 或 read_page 操作弹层。\n" +
                "⚠️ 顶栏（分享 / 简洁模式 / 对比 / 保存方案 / 重置）不对外开放，点击会报错：它们会切换视图或离开配装页。切角色用 run_code 的 build.char()，恢复默认用 build.reset()。",
            parameters: {
                type: "object",
                properties: {
                    ref: { type: "string", description: "read_page 给出的引用，例如 e12" },
                    selector: { type: "string", description: "可选，CSS 选择器或 [data-agent=*] 锚点" },
                    label: { type: "string", description: "可选，控件名称，支持包含匹配" },
                    nth: { type: "integer", description: "可选，多个命中时取第几个，默认 1" },
                    scope: { type: "string", enum: ["auto", "page", "sidebar", "main", "dialog"] },
                    settle: { type: "integer", description: "点击后等待界面落定的毫秒数，默认 160" },
                },
            },
        },

        async execute(args) {
            const target = toTarget(args)
            const invalid = missingTarget(target)

            if (invalid) {
                return { content: JSON.stringify({ error: invalid }), isError: true }
            }

            const result = await clickBuildTarget({ ...target, settle: Number(args.settle) || undefined })

            return { content: result }
        },
    }
}

/**
 * @description 构造 type_text 工具：向输入框或表达式编辑器里打字。
 * @returns 工具
 */
export function createTypeTool(): AgentTool<never> {
    return {
        definition: {
            name: "type_ui",
            description:
                "向配装页的输入框、下拉搜索框或目标函数表达式编辑器输入文本。支持原生 input / textarea、reka-ui Combobox 的搜索框与 CodeMirror 表达式编辑器。\n" +
                "clear 默认 true（替换原有内容）；要追加内容传 false。submit 为 true 时输入后按回车。\n" +
                "写完目标函数后要确认结果：再用 read_page 看伤害结果与校验提示。",
            parameters: {
                type: "object",
                properties: {
                    ref: { type: "string", description: "read_page 给出的引用" },
                    selector: { type: "string", description: "可选，CSS 选择器，目标函数固定锚点是 [data-agent='target-function']" },
                    label: { type: "string", description: "可选，控件名称" },
                    nth: { type: "integer", description: "可选，多个命中时取第几个" },
                    scope: { type: "string", enum: ["auto", "page", "sidebar", "main", "dialog"] },
                    text: { type: "string", description: "要输入的文本" },
                    clear: { type: "boolean", description: "是否先清空，默认 true" },
                    submit: { type: "boolean", description: "是否回车提交，默认 false" },
                },
                required: ["text"],
            },
        },

        async execute(args) {
            const target = toTarget(args)
            const invalid = missingTarget(target)

            if (invalid) {
                return { content: JSON.stringify({ error: invalid }), isError: true }
            }

            const text = `${args.text ?? ""}`

            if (!text.trim()) {
                return { content: JSON.stringify({ error: "text 不能为空" }), isError: true }
            }

            const result = await typeBuildText({
                ...target,
                text,
                clear: args.clear === undefined ? true : args.clear === true,
                submit: args.submit === true,
            })

            return { content: result }
        },
    }
}

/**
 * @description 构造 select_option 工具：在下拉框里选中某个选项。
 * @returns 工具
 */
export function createSelectOptionTool(): AgentTool<never> {
    return {
        definition: {
            name: "select_ui",
            description:
                "在配装页的下拉选择器里选中某个选项（Select 触发器与 Combobox 搜索框都支持）：自动展开下拉 → 按名称匹配选项 → 点击。\n" +
                "匹配不到时会返回该下拉的全部可选项，照着再调一次即可。",
            parameters: {
                type: "object",
                properties: {
                    ref: { type: "string", description: "read_page 给出的引用" },
                    selector: { type: "string", description: "可选，CSS 选择器" },
                    label: { type: "string", description: "可选，下拉框名称或当前值" },
                    nth: { type: "integer", description: "可选，多个命中时取第几个" },
                    scope: { type: "string", enum: ["auto", "page", "sidebar", "main", "dialog"] },
                    option: { type: "string", description: "要选中的选项文案，例如「80%」「角色等级60」" },
                    search: { type: "boolean", description: "下拉带搜索框时是否先把选项文案打进搜索框过滤，默认按控件形态自动判断" },
                },
                required: ["option"],
            },
        },

        async execute(args) {
            const target = toTarget(args)
            const invalid = missingTarget(target)

            if (invalid) {
                return { content: JSON.stringify({ error: invalid }), isError: true }
            }

            const option = `${args.option ?? ""}`.trim()

            if (!option) {
                return { content: JSON.stringify({ error: "option 不能为空" }), isError: true }
            }

            const result = await selectBuildOption({
                ...target,
                option,
                search: args.search === true ? true : undefined,
            })

            return { content: result }
        },
    }
}

/**
 * @description 构造 press_key 工具：向聚焦或指定控件派发按键。
 * @returns 工具
 */
export function createPressKeyTool(): AgentTool<never> {
    return {
        definition: {
            name: "press_key",
            description: "向配装页当前聚焦的控件（或指定控件）按键，例如 Enter / Escape / Backspace。不给目标时发给当前聚焦元素。",
            parameters: {
                type: "object",
                properties: {
                    key: { type: "string", description: "键名，例如 Enter / Escape / Backspace / Tab" },
                    ref: { type: "string", description: "可选，read_page 给出的引用" },
                    selector: { type: "string", description: "可选，CSS 选择器" },
                    label: { type: "string", description: "可选，控件名称" },
                },
                required: ["key"],
            },
        },

        async execute(args) {
            const key = `${args.key ?? ""}`.trim()

            if (!key) {
                return { content: JSON.stringify({ error: "key 不能为空" }), isError: true }
            }

            return { content: await pressBuildKey({ ...toTarget(args), key }) }
        },
    }
}

/**
 * @description 构造 scroll_to 工具：把控件滚进可视区域。
 * @returns 工具
 */
export function createScrollTool(): AgentTool<never> {
    return {
        definition: {
            name: "scroll_ui",
            description: "把配装页上的控件滚动到可视区域。被折叠或长列表里的控件点不动时先滚过去再操作。",
            parameters: {
                type: "object",
                properties: {
                    ref: { type: "string", description: "read_page 给出的引用" },
                    selector: { type: "string", description: "可选，CSS 选择器" },
                    label: { type: "string", description: "可选，控件名称" },
                    nth: { type: "integer", description: "可选，多个命中时取第几个" },
                    scope: { type: "string", enum: ["auto", "page", "sidebar", "main", "dialog"] },
                },
            },
        },

        execute(args) {
            const target = toTarget(args)
            const invalid = missingTarget(target)

            if (invalid) {
                return { content: JSON.stringify({ error: invalid }), isError: true }
            }

            return { content: scrollBuildTarget(target) }
        },
    }
}
