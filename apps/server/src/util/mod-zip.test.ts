import { describe, expect, it } from "bun:test"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { coverExtFromMime, inspectModZip, isGameModCategory, resolveModManifest, supplementModZip, validateModZip } from "./mod-zip"

/**
 * 构造一个最小可用的测试 zip。
 * @param entries 路径到内容（字符串或字节）的映射。
 * @returns zip 字节。
 */
function makeZip(entries: Record<string, string | Uint8Array>): Uint8Array {
    const mapped: Record<string, Uint8Array> = {}
    for (const [path, content] of Object.entries(entries)) {
        mapped[path] = typeof content === "string" ? strToU8(content) : content
    }
    return zipSync(mapped, { level: 6 })
}

describe("mod-zip 工具", () => {
    describe("inspectModZip", () => {
        it("应解析包内 mod.json 与 preview.png", () => {
            const zip = makeZip({
                "mod.json": JSON.stringify({ name: "测试MOD", category: "char", entity: "洛可可" }),
                "preview.png": new Uint8Array([1, 2, 3]),
                "Pak/Mod_P.pak": "pak-bytes",
            })
            const result = inspectModZip(zip)
            expect(result.manifest?.name).toBe("测试MOD")
            expect(result.manifest?.category).toBe("char")
            expect(result.hasPreview).toBe(true)
            expect(result.previewBytes?.length).toBe(3)
            expect(result.entries["Pak/Mod_P.pak"]).toBeDefined()
        })

        it("大小写不敏感查找根目录 mod.json 与 preview.png", () => {
            const zip = makeZip({
                "MOD.JSON": JSON.stringify({ name: "A" }),
                "PREVIEW.PNG": new Uint8Array([9]),
            })
            const result = inspectModZip(zip)
            expect(result.manifest?.name).toBe("A")
            expect(result.hasPreview).toBe(true)
        })

        it("缺失 mod.json / preview.png 时返回空清单", () => {
            const zip = makeZip({ "Pak/a.pak": "x" })
            const result = inspectModZip(zip)
            expect(result.manifest).toBeNull()
            expect(result.hasPreview).toBe(false)
            expect(result.previewBytes).toBeNull()
        })

        it("应检测包内 .pak 文件（大小写不敏感）", () => {
            const zip = makeZip({ "Pak/Mod_P.PAK": "pak-bytes" })
            expect(inspectModZip(zip).hasPak).toBe(true)
            expect(inspectModZip(makeZip({ "preview.png": "x" })).hasPak).toBe(false)
        })

        it("mod.json 为非法 JSON 时返回 null", () => {
            const zip = makeZip({ "mod.json": "{not json" })
            expect(inspectModZip(zip).manifest).toBeNull()
        })
    })

    describe("validateModZip", () => {
        it("含 .pak 的合法 zip 校验通过", () => {
            const zip = makeZip({ "Pak/a.pak": "content" })
            expect(validateModZip(zip)).toBeNull()
        })

        it("不含 .pak 的 zip 校验失败并给出格式提示", () => {
            const zip = makeZip({ "mod.json": JSON.stringify({ name: "x" }) })
            const error = validateModZip(zip)
            expect(error).toContain(".pak")
        })

        it("非法 zip 校验失败", () => {
            expect(validateModZip(new Uint8Array([1, 2, 3]))).toContain("ZIP")
        })
    })

    describe("resolveModManifest", () => {
        it("表单字段优先于包内 mod.json", () => {
            const manifest = resolveModManifest(
                { name: "表单名", category: "weapon", entity: "审判" },
                { name: "包内名", category: "char", entity: "洛可可", description: "包内描述" },
                "anything.zip"
            )
            expect(manifest.name).toBe("表单名")
            expect(manifest.category).toBe("weapon")
            expect(manifest.entity).toBe("审判")
            expect(manifest.description).toBe("包内描述")
        })

        it("未指定分类与实体时归入 standalone（独立）", () => {
            const manifest = resolveModManifest({}, null, "my-mod.zip")
            expect(manifest.category).toBe("standalone")
            expect(manifest.entity).toBe("")
        })

        it("名称回退到文件名", () => {
            const manifest = resolveModManifest({}, null, "My_Cool_Mod.zip")
            expect(manifest.name).toBe("My Cool Mod")
        })

        it("非法分类回退为 standalone", () => {
            const manifest = resolveModManifest({ category: "bad-category" }, null, "x.zip")
            expect(manifest.category).toBe("standalone")
        })

        it("合并前置依赖列表", () => {
            const manifest = resolveModManifest({ requires: ["base-pack"] }, { requires: ["old"] }, "x.zip")
            expect(manifest.requires).toEqual(["base-pack"])
        })
    })

    describe("supplementModZip", () => {
        it("缺失 mod.json 时自动补入并保留原有文件", () => {
            const zip = makeZip({ "Pak/a.pak": "content" })
            const manifest = resolveModManifest({}, null, "mod.zip")
            const result = supplementModZip(zip, manifest)
            const entries = unzipSync(result)
            expect(entries["Pak/a.pak"]).toBeDefined()
            const modJson = JSON.parse(strFromU8(entries["mod.json"]))
            expect(modJson.category).toBe("standalone")
            expect(modJson.name).toBe("mod")
        })

        it("缺失 preview.png 时补入用户封面", () => {
            const zip = makeZip({ "Pak/a.pak": "content" })
            const manifest = resolveModManifest({}, null, "mod.zip")
            const result = supplementModZip(zip, manifest, { bytes: new Uint8Array([10, 11]), mime: "image/png" })
            const entries = unzipSync(result)
            expect(Array.from(entries["preview.png"])).toEqual([10, 11])
        })

        it("已有 preview.png 时不覆盖用户封面", () => {
            const original = new Uint8Array([1, 2, 3])
            const zip = makeZip({ "preview.png": original, "Pak/a.pak": "content" })
            const manifest = resolveModManifest({}, null, "mod.zip")
            const result = supplementModZip(zip, manifest, { bytes: new Uint8Array([10, 11]), mime: "image/png" })
            const entries = unzipSync(result)
            expect(Array.from(entries["preview.png"])).toEqual([1, 2, 3])
        })

        it("已存在 mod.json 时用生效清单覆盖关键字段", () => {
            const zip = makeZip({ "mod.json": JSON.stringify({ name: "旧名" }) })
            const manifest = resolveModManifest({ name: "新名", category: "char", entity: "洛可可" }, null, "mod.zip")
            const result = supplementModZip(zip, manifest)
            const entries = unzipSync(result)
            const modJson = JSON.parse(strFromU8(entries["mod.json"]))
            expect(modJson.name).toBe("新名")
            expect(modJson.category).toBe("char")
            expect(modJson.entity).toBe("洛可可")
        })
    })

    describe("辅助函数", () => {
        it("coverExtFromMime 根据 MIME 返回扩展名", () => {
            expect(coverExtFromMime("image/png")).toBe("png")
            expect(coverExtFromMime("image/jpeg")).toBe("jpg")
            expect(coverExtFromMime("image/webp")).toBe("webp")
            expect(coverExtFromMime("application/octet-stream")).toBe("png")
        })

        it("isGameModCategory 校验分类", () => {
            expect(isGameModCategory("char")).toBe(true)
            expect(isGameModCategory("standalone")).toBe(true)
            expect(isGameModCategory("other")).toBe(true)
            expect(isGameModCategory("weapon")).toBe(true)
            expect(isGameModCategory("bad")).toBe(false)
            expect(isGameModCategory(undefined)).toBe(false)
        })
    })
})
