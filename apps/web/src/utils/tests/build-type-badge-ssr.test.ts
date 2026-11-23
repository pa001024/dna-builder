import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createInstance, type i18n as I18n } from "i18next"
import i18nextVue from "i18next-vue"
import { beforeAll, describe, expect, it } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import BuildTypeBadge from "@/components/BuildTypeBadge.vue"

/**
 * U140：构筑卡片「普通 / 升华」徽章 SSR 与六语言键。
 * DOBBuildShow 自身依赖 store / 网络，这里渲染徽章组件，并对卡片接线做源码断言。
 */

const LOCALES = ["en", "fr", "ja", "ko", "zh-CN", "zh-TW"] as const

/** 读取指定语言的翻译文件 */
function readTranslation(locale: string): Record<string, any> {
    return JSON.parse(
        readFileSync(fileURLToPath(new URL(`../../../public/i18n/${locale}/translation.json`, import.meta.url)), "utf8")
    )
}

const translation = readTranslation("zh-CN")

let i18n: I18n
beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({ lng: "zh-CN", fallbackLng: false, resources: { "zh-CN": { translation } } })
})

/** 渲染徽章（未传类型时组件应不输出） */
async function renderBadge(buildType?: "normal" | "transcend"): Promise<string> {
    const app = createSSRApp(defineComponent({ render: () => h(BuildTypeBadge, { buildType }) }))
    app.use(i18nextVue, { i18next: i18n })

    return renderToString(app)
}

describe("U140 构筑类型徽章", () => {
    it("普通构筑不渲染标记", async () => {
        const html = await renderBadge("normal")

        expect(html).not.toContain("data-build-type")
        expect(html).not.toContain("普通")
        expect(html).not.toContain("升华")
    })

    it("升华构筑渲染「升华」徽章（badge-secondary）", async () => {
        const html = await renderBadge("transcend")

        expect(html).toContain("data-build-type")
        expect(html).toContain("badge badge-sm badge-secondary")
        expect(html).toContain("升华")
        expect(html).not.toContain("普通")
    })

    it("概要尚未解析（无类型）时不渲染徽章", async () => {
        const html = await renderBadge(undefined)

        expect(html).not.toContain("data-build-type")
        expect(html).not.toContain("普通")
    })
})

describe("U140 六语言键", () => {
    it("build-info 的类型与筛选文案在 6 种语言下齐全", () => {
        const expected: Record<(typeof LOCALES)[number], { normal: string; transcend: string; all: string }> = {
            en: { normal: "Normal", transcend: "Transcendence", all: "All" },
            fr: { normal: "Normal", transcend: "Transcendance", all: "Tout" },
            ja: { normal: "通常", transcend: "昇華", all: "すべて" },
            ko: { normal: "일반", transcend: "초월", all: "전체" },
            "zh-CN": { normal: "普通", transcend: "升华", all: "全部" },
            "zh-TW": { normal: "普通", transcend: "昇華", all: "全部" },
        }
        for (const locale of LOCALES) {
            const group = readTranslation(locale)["build-info"]
            expect(group?.type_normal, `${locale} type_normal`).toBe(expected[locale].normal)
            expect(group?.type_transcend, `${locale} type_transcend`).toBe(expected[locale].transcend)
            expect(group?.filter_all, `${locale} filter_all`).toBe(expected[locale].all)
        }
    })
})

describe("U140 DOBBuildShow 接线", () => {
    const source = readFileSync(fileURLToPath(new URL("../../components/DOBBuildShow.vue", import.meta.url)), "utf8")

    it("卡片渲染 BuildTypeBadge，并优先取后端 info（本地配置相反时仍以后端为准）", () => {
        expect(source).toContain("<BuildTypeBadge")
        expect(source).toContain(':build-type="buildSummary(build.id)?.buildType"')
        expect(source).toContain("buildType: build.info?.buildType")
        // 保存仍走旧形状 mutation，编辑后的徽章由本地 summary 判定（见 U140-fix5 取舍）
        expect(source).not.toContain("result.info?.buildType")
    })

    it("筛选切换把 buildType 传入查询并重置分页；不支持时禁用控件", () => {
        expect(source).toContain('data-build-type-filter')
        expect(source).toContain(':disabled="!buildTypeSupported"')
        expect(source).toContain('$t("build-info.filter_all")')
        expect(source).toContain("buildType: buildTypeFilter.value || undefined")
        expect(source).toContain("function handleBuildTypeSelect")
        expect(source).toContain("fetchBuilds(0)")
        expect(source).toContain("totalCount.value = result.buildsCount")
    })

    it("徽章组件只引用升华文案（普通不展示标记）", () => {
        const badge = readFileSync(fileURLToPath(new URL("../../components/BuildTypeBadge.vue", import.meta.url)), "utf8")

        expect(badge).toContain('t("build-info.type_transcend")')
        expect(badge).not.toContain('t("build-info.type_normal")')
        expect(badge).toContain('buildType === \'transcend\'')
    })
})

describe("U140-fix5 查询文档", () => {
    /** 截取两个导出之间的内容（生成文档是按导出名排列的） */
    function blockOf(source: string, startName: string, endName: string): string {
        const start = source.indexOf(`export const ${startName}`)
        expect(start, startName).toBeGreaterThanOrEqual(0)
        const end = source.indexOf(`export const ${endName}`)
        expect(end, endName).toBeGreaterThan(start)
        return source.slice(start, end)
    }

    it("builds / buildsCount 恢复 BuildType 过滤与 info 选择；updateBuild 保持旧形状", () => {
        const queries = readFileSync(fileURLToPath(new URL("../../api/gen/api-queries.ts", import.meta.url)), "utf8")
        const mutations = readFileSync(fileURLToPath(new URL("../../api/gen/api-mutations.ts", import.meta.url)), "utf8")

        const builds = blockOf(queries, "buildsQuery", "buildsCountQuery")
        expect(builds).toContain("$buildType: BuildType")
        expect(builds).toContain("buildType: $buildType")
        expect(builds).toContain("info {")
        expect(builds).toContain("buildType")

        const count = blockOf(queries, "buildsCountQuery", "recommendedBuildsQuery")
        expect(count).toContain("$buildType: BuildType")
        expect(count).toContain("buildType: $buildType")

        // 旧服务端上线前保存仍会失败，故 mutation 不请求新字段
        const update = blockOf(mutations, "updateBuildMutation", "deleteBuildMutation")
        expect(update).not.toContain("BuildType")
        expect(update).not.toContain("buildType")
        expect(update).not.toContain("info {")
    })
})
