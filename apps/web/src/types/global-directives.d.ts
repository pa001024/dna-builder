// main.ts 里 app.directive 注册的全局指令，以及模板直写的内建指令（v-html）：
// 新版 @vue/language-core 经 __VLS_directives 解析它们，需要类型层面的注册
//（否则 tsc-rs 报 TS2339；旧版 codegen 不走这条路径所以 vue-tsc 不报错）。
// 注意：`export {}` 不可删——它让本文件成为模块，其中的 declare module 才是
// 合并式增强；写成全局脚本会遮蔽整个 vue 模块（实测 2582 条报错）。
export {}

declare module "vue" {
    interface GlobalDirectives {
        vHtml: any
        vHResizeFor: any
    }
}
