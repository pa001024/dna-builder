import { DataTexture, MeshStandardMaterial, ShaderLib, WebGLRenderer } from "three"
import { describe, expect, it } from "vitest"
import { normalizeSkinMaterial, type SkinMaterialMetadata } from "./skin-model"
import { SkinModelRenderer } from "./skin-model-renderer"

const material = (parent: string, kind: SkinMaterialMetadata["kind"] = "base"): SkinMaterialMetadata => ({
    version: 1,
    kind,
    role: "character",
    parent,
    vectors: { 自发光颜色: [0.775822, 0.057805, 0.262251] },
    scalars: { 自发光强度: 4 },
    textures: { 时装BaseClor: 0, 法线贴图: 2, 自发光贴图: 3 },
})

describe("Tint6 material compatibility", () => {
    it("recognizes already exported Katya E1 materials as six-zone packed dye", () => {
        const source = material("EM/Content/Asset/TA/Char/Materials/Tint6/M_Char_Tint6_E1.0")
        const result = normalizeSkinMaterial(source)
        expect(result.kind).toBe("packed")
        expect(result.vectors.自发光颜色02).toEqual([0, 0, 0])
        expect(result.vectors.突破自发光).toEqual([0, 0, 0])
        expect(result.vectors.自发光颜色).toEqual(source.vectors.自发光颜色)
        expect(source.kind).toBe("base")
    })
    it("maps new RGB mask parameter names without overwriting explicit colors", () => {
        const source = material("EM/Content/Asset/TA/Char/MaterialMaster/M_Char_Tint6.0", "packed")
        source.vectors.自发光颜色2 = [0.1, 0.2, 0.3]
        source.vectors.自发光颜色3 = [0.4, 0.5, 0.6]
        const result = normalizeSkinMaterial(source)
        expect(result.vectors.自发光颜色02).toEqual(source.vectors.自发光颜色2)
        expect(result.vectors.突破自发光).toEqual(source.vectors.自发光颜色3)
        expect(normalizeSkinMaterial(result)).toEqual(result)
    })
    it("leaves all legacy materials byte-for-byte equivalent", () => {
        for (const parent of ["M_Player_ShopSkin.0", "M_Player_Skin.0", "M_Player_Hair_V10.0", "M_Weapon.0", "M_Player_Tran_ShopSkin.0"]) {
            const source = material(parent, "packed")
            expect(normalizeSkinMaterial(source)).toBe(source)
        }
    })
})

describe("WaterTail material compatibility", () => {
    it("renders the cached tail as translucent unlit packed color and keeps clothing dyes out", async () => {
        const texture = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
        const viewer = Object.assign(Object.create(SkinModelRenderer.prototype), {
            textures: new Set(),
            dyeMaterials: [],
            effectMaterials: [],
            dataTexture: async () => texture,
            waterTexture: async () => texture,
            effectTime: { value: 0 },
            invalidate: () => {},
            metadata: { swatches: { 1001: { linear: [1, 0, 0] } }, allowedStockingIds: [] },
        })
        const data = material("EM/Content/Asset/TA/Char/Materials/Part/Special/M_Player_Part_WaterTail.0")
        data.scalars.透明度 = 0.3
        const source = new MeshStandardMaterial({ alphaTest: 0.3333, transparent: true })
        const result = await viewer.createMaterial(data, source, true, "Baiheng_SP01_Part01_SM")
        expect(result.alphaTest).toBe(0)
        expect(result.transparent).toBe(true)
        expect(result.depthWrite).toBe(false)
        expect(result.forceSinglePass).toBe(true)
        const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }
        result.onBeforeCompile(shader, Object.create(WebGLRenderer.prototype))
        expect(shader.fragmentShader).toContain("dnaPacked(dnaSample.rgb, dnaTailWeight) * 1.1 - 0.05")
        expect(shader.fragmentShader).toContain("mix(1.0, dnaSample.b, dnaTailWeight) * dnaWaterTailOpacity")
        expect(shader.fragmentShader).toContain("vec3 outgoingLight = totalEmissiveRadiance;")
        expect(shader.fragmentShader).not.toContain("if (dnaToonOn > 0.5)")
        expect(shader.fragmentShader).toContain("texture2D(dnaTailMask, vDnaUv)")
        expect(shader.fragmentShader).toContain("dnaWaterTime * dnaTailGlowUv.zw")
        expect(shader.fragmentShader).toContain("dnaLinear(texture2D(dnaTailStars")
        const uniforms = result.userData.dnaUniforms
        const originalColors = uniforms.dnaColors.value.map((color: { toArray(): number[] }) => color.toArray())
        viewer.setColors([1001, 1001, 1001, 1001, 1001, 1001, 1001])
        expect(uniforms.dnaColors.value.map((color: { toArray(): number[] }) => color.toArray())).toEqual(originalColors)
        expect(uniforms.dnaWaterTailOpacity.value).toBe(0.3)
        source.dispose()
        result.dispose()
        texture.dispose()
    })
    it("decodes cached Fushu tails with the fixed shader ramp instead of raw RGB or clothing dyes", () => {
        const source = material("EM/Content/Asset/TA/Char/Materials/Part/Special/M_Player_Part_WaterTail.0")
        const result = normalizeSkinMaterial(source)
        expect(result.kind).toBe("waterTail")
        expect(Array.from({ length: 6 }, (_, i) => result.vectors[`染色${i + 1}`])).toEqual([
            [0, 0, 0],
            [0.19798213, 0.23551302, 0.38020834],
            [0.17029703, 0.165625, 0.2],
            [0.06911901, 0.12149695, 0.25520799],
            [0, 0, 0],
            [0, 0, 0],
        ])
        expect(result.vectors.自发光颜色).toEqual(source.vectors.自发光颜色)
        expect(result.textures).toBe(source.textures)
        expect(source.kind).toBe("base")
        expect(source.vectors.染色1).toBeUndefined()
        expect(normalizeSkinMaterial(result)).toEqual(result)
    })
    it("recognizes parents without an object suffix and leaves other water materials untouched", () => {
        expect(normalizeSkinMaterial(material("/Game/Asset/TA/Char/Materials/Part/Special/M_Player_Part_WaterTail")).kind).toBe("waterTail")
        for (const parent of ["M_Player_Part_Water.0", "M_Player_Part_WaterTailExtra.0", "M_Translucent.0"]) {
            const source = material(`/Game/Asset/TA/Char/Materials/Part/Special/${parent}`)
            expect(normalizeSkinMaterial(source)).toBe(source)
        }
    })
})

describe("WaterWave inherited materials", () => {
    it("replaces the cached opaque white fallback with an animated masked transparent material", async () => {
        const texture = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1)
        const viewer = Object.assign(Object.create(SkinModelRenderer.prototype), {
            waterTexture: async () => texture,
            effectTime: { value: 1 },
        })
        const data = material("EM/Content/Asset/Effect/MaterialBase/Water/M_Baiheng_WaterWave.0")
        data.textures = {}
        data.scalars.Opacity = 5
        const source = new MeshStandardMaterial({ color: 0xffffff })
        const result = await viewer.createMaterial(data, source, true, "Baiheng_SP01_Part01_SM")
        expect(result).not.toBe(source)
        expect(result.type).toBe("MeshBasicMaterial")
        expect(result.transparent).toBe(true)
        expect(result.depthWrite).toBe(false)
        expect(result.userData.dnaColorize.kind).toBe("waterWave")
        expect(result.forceSinglePass).toBe(true)
        expect(viewer.hasEffect).toBe(true)
        const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} }
        result.onBeforeCompile(shader, Object.create(WebGLRenderer.prototype))
        expect(shader.fragmentShader).toContain("texture2D(Mask_Tex, mix(vWaterUv, vWaterUv1, waterMaskUv1))")
        expect(shader.fragmentShader).toContain("waterCoverage * waterBase * waterMask + waterEdge")
        expect(shader.fragmentShader).toContain("1.0 - exp(-max(waterOpacity, 0.0))")
        expect(shader.fragmentShader).toContain("mix(waterTint, vec3(1.0), waterParticleColor)")
        expect(shader.fragmentShader).toContain("waterTime * transform.zw")
        expect(result.userData.dnaUniforms.waterOpacity.value).toBe(5)
        source.dispose()
        result.dispose()
        texture.dispose()
    })
    it("does not classify unrelated water or trail materials as Baiheng WaterWave", () => {
        const source = material("/Game/Asset/Effect/MaterialBase/Water/M_Baiheng_WaterWaveExtra.0")
        expect(normalizeSkinMaterial(source)).toBe(source)
    })
})
