import { createApp, h, ref } from "vue"
import ExprInput from "@/components/ExprInput.vue"

/** 内置宏名集合（与 ASTHelp 编辑器一致，用于验证宏高亮） */
const macros = new Set(["总伤", "DPS"])

/**
 * 生成一行对照展示用的容器。
 * @param label 左侧说明文字
 * @param children 右侧子节点
 * @returns 行容器 VNode
 */
const Row = (label: string, children: unknown[]) =>
    h("div", { style: "margin:14px 0;display:flex;align-items:center;gap:12px" }, [
        h("div", { style: "width:150px;color:#888;font-size:12px" }, label),
        ...(children as never[]),
    ])

const App = {
    setup() {
        const value = ref("攻击 + 近战::攻击! + max(总伤, 防御)")
        const empty = ref("")
        return () =>
            h("div", { style: "padding:20px;max-width:900px" }, [
                h("h3", {}, "原生 input（基准）"),
                Row("目标函数", [
                    h("label", { class: "input input-sm input-primary text-sm flex justify-between", style: "width:460px" }, [
                        h("input", { class: "grow", value: value.value, readonly: true }),
                        h("div", { class: "flex items-center" }, [h("span", { innerHTML: "&times;" })]),
                    ]),
                ]),
                Row("自定义变量", [
                    h("input", {
                        class: "min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary",
                        style: "width:320px",
                        value: value.value,
                        readonly: true,
                    }),
                ]),
                h("h3", {}, "ExprInput（CodeMirror）"),
                Row("目标函数", [
                    h("label", { class: "input input-sm input-primary text-sm flex justify-between", style: "width:460px" }, [
                        h(ExprInput, {
                            class: "grow",
                            modelValue: value.value,
                            "onUpdate:modelValue": (v: string) => (value.value = v),
                            fontSize: "14px",
                            lineHeight: "20px",
                            macros,
                            placeholder: "表达式",
                            "data-expr-drop": "target-function",
                        }),
                        h("div", { class: "flex items-center" }, [h("span", { innerHTML: "&times;" })]),
                    ]),
                ]),
                Row("自定义变量", [
                    h(ExprInput, {
                        class: "min-w-0 flex-1",
                        style: "width:320px",
                        modelValue: value.value,
                        "onUpdate:modelValue": (v: string) => (value.value = v),
                        variant: "underline",
                        fontSize: "13px",
                        lineHeight: "19.5px",
                        macros,
                        placeholder: "表达式",
                        "data-expr-drop": "custom-variable:0",
                    }),
                ]),
                Row("空值占位", [
                    h("label", { class: "input input-sm input-primary text-sm flex justify-between", style: "width:460px" }, [
                        h(ExprInput, {
                            class: "grow",
                            modelValue: empty.value,
                            "onUpdate:modelValue": (v: string) => (empty.value = v),
                            fontSize: "14px",
                            lineHeight: "20px",
                            placeholder: "表达式",
                        }),
                    ]),
                ]),
            ])
    },
}

createApp(App).mount("#app")
