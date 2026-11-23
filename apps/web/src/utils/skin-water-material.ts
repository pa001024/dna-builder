import { DoubleSide, MeshBasicMaterial, type Texture, Vector3, Vector4 } from "three"
import type { SkinMaterialMetadata } from "./skin-model"

export const WATER_WAVE_TEXTURES = {
    Noise_Tex: "T_TurbulenceXy001_Mask",
    Noise2_Tex: "T_TurbulenceXy001_Mask",
    Color_Tex: "T_TurbulenceYb040_D",
    InSide_Tex: "T_TrailZd001_Mask",
    Base_Tex: "T_TurbulenceYb001_Mask",
    Dissolve_Tex: "T_TurbulenceYb010_Mask",
    Mask_Tex: "T_MaskZZ052_Mask",
    HighLight_Tex: "T_Grandintzz002_Mask",
}

/** M_Baiheng_WaterWave 主 PS 21811_f3：纹理扰动、溶解遮罩与浪花高光，UV 滚动使用父材质的第四分量。 */
export function createWaterWaveMaterial(
    data: SkinMaterialMetadata,
    time: { value: number },
    textures: Record<string, Texture>,
    hasUv1 = true
): MeshBasicMaterial {
    const scalar = (name: string, fallback: number) => ({ value: data.scalars[name] ?? fallback })
    const vector = (name: string, fallback: [number, number, number]) => ({ value: new Vector3(...(data.vectors[name] ?? fallback)) })
    const uv = (name: string, fallback: [number, number, number, number]) => {
        const source = data.vectors[name] ?? fallback
        return { value: new Vector4(source[0], source[1], source[2], fallback[3]) }
    }
    const uniforms = {
        waterTime: time,
        waterNoiseUv: uv("Noise_UV", [5, 1, -0.15, 0.15]),
        waterNoise2Uv: uv("Noise2_UV", [4, 1, 0.2, 0.1]),
        waterColorUv: uv("Color_UV", [1.5, 0.2, -0.05, 0.05]),
        waterInsideUv: uv("Inside_UV", [2, 0.7, -0.2, 0]),
        waterBaseUv: uv("Base_UV", [5, 0.5, -0.1, 0]),
        waterDissolveUv: uv("Dissolve_UV", [5, 0.5, -0.1, 0.1]),
        waterTint: vector("尾巴染色", [0.333333, 0.555555, 1]),
        waterHighlight: vector("HighLight_Color", [2.447917, 4.149303, 5]),
        waterColorIntensity: vector("Color_Intensity", [1, 1, 1]),
        waterTexNoise: scalar("Tex_Noise_Intensity", 0.1),
        waterInsideNoise: scalar("InSide_Noise_Intensity", 0.2),
        waterBaseNoise: scalar("Base_Noise_Intensity", 0.05),
        waterDissolveNoise: scalar("Dissolve_Noise_Intensity", 0.2),
        waterMaskUv1: scalar("Use_DissolveMask_UV1", hasUv1 ? 1 : 0),
        waterDissolve: scalar("Dissolve", 0.1),
        waterEdgeWidth: scalar("DissolveEdge_Width", 0.002),
        waterSoft: scalar("Soft", 1),
        waterParticleColor: scalar("Use_ParticleColor", 0),
        waterHighlightDesaturation: scalar("HitghLightColor_Desaturation", 0.3),
        waterHighlightIntensity: scalar("HighLighColor_Intensity", 5),
        waterBaseIntensity: scalar("BaseColor_Intensity", 1.5),
        waterBaseLerp: scalar("Base_Lerp", 0.75),
        waterTexIntensity: scalar("TexIntensity", 0.5),
        waterOpacity: scalar("Opacity", 0.8),
    }
    const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true })
    material.userData.dnaColorize = data
    material.userData.dnaUniforms = uniforms
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms)
        for (const [name, texture] of Object.entries(textures)) shader.uniforms[name] = { value: texture }
        shader.vertexShader = `attribute vec2 uv1;
varying vec2 vWaterUv; varying vec2 vWaterUv1;
${shader.vertexShader}`.replace("#include <uv_vertex>", `#include <uv_vertex>\nvWaterUv = uv; vWaterUv1 = ${hasUv1 ? "uv1" : "uv"};`)
        shader.fragmentShader = `
varying vec2 vWaterUv; varying vec2 vWaterUv1;
uniform float waterTime;
uniform vec4 waterNoiseUv, waterNoise2Uv, waterColorUv, waterInsideUv, waterBaseUv, waterDissolveUv;
uniform vec3 waterTint, waterHighlight, waterColorIntensity;
uniform float waterTexNoise, waterInsideNoise, waterBaseNoise, waterDissolveNoise, waterMaskUv1;
uniform float waterDissolve, waterEdgeWidth, waterSoft, waterParticleColor, waterHighlightDesaturation, waterHighlightIntensity;
uniform float waterBaseIntensity, waterBaseLerp, waterTexIntensity, waterOpacity;
uniform sampler2D Noise_Tex, Noise2_Tex, Color_Tex, InSide_Tex, Base_Tex, Dissolve_Tex, Mask_Tex, HighLight_Tex;
vec2 waterPan(vec2 uv, vec4 transform) { return uv * transform.xy + waterTime * transform.zw; }
vec3 waterLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
${shader.fragmentShader}`.replace(
            "#include <map_fragment>",
            `
float waterNoise = texture2D(Noise_Tex, waterPan(vWaterUv, waterNoiseUv)).r;
float waterNoise2 = texture2D(Noise2_Tex, waterPan(vWaterUv, waterNoise2Uv)).r;
vec3 waterColor = waterLinear(texture2D(Color_Tex, waterPan(vWaterUv, waterColorUv) + waterNoise * waterTexNoise).rgb);
float waterInside = texture2D(InSide_Tex, waterPan(vWaterUv, waterInsideUv) + waterNoise2 * waterInsideNoise).r;
float waterBase = texture2D(Base_Tex, waterPan(vWaterUv, waterBaseUv) + waterNoise * waterBaseNoise).r;
float waterDissolveSample = texture2D(Dissolve_Tex, waterPan(vWaterUv, waterDissolveUv) + waterNoise * waterDissolveNoise).r;
float waterMask = texture2D(Mask_Tex, mix(vWaterUv, vWaterUv1, waterMaskUv1)).r;
float waterCut = mix(waterDissolveSample, waterMask, 0.15) * waterMask;
float waterCoverage = smoothstep(waterDissolve, waterDissolve + max(waterSoft * 0.1, 0.001), waterCut);
float waterEdge = (1.0 - smoothstep(0.0, max(waterEdgeWidth, 0.001), abs(waterCut - waterDissolve))) * waterBase;
float waterHighlightMask = texture2D(HighLight_Tex, vWaterUv1).r * waterBase;
vec3 waterBaseTint = mix(waterTint, vec3(1.0), waterParticleColor);
vec3 waterHighlightTint = mix(waterHighlight, vec3(1.0), waterParticleColor);
waterHighlightTint = mix(waterHighlightTint, vec3(dot(waterHighlightTint, vec3(0.3, 0.59, 0.11))), waterHighlightDesaturation);
// 原材质的 HDR 浪花强度不能直接铺在前向预览上：保留色度与强度变化，压缩到局部水光范围。
vec3 waterHighlightColor = waterHighlightTint / max(max(waterHighlightTint.r, waterHighlightTint.g), max(waterHighlightTint.b, 1.0)) * log2(1.0 + waterHighlightIntensity) * 0.35;
vec3 waterBaseColor = mix(vec3(1.0), waterColor * waterColorIntensity, waterTexIntensity) * mix(1.0, waterBase, waterBaseLerp) * waterBaseTint * waterBaseIntensity;
diffuseColor.rgb = waterBaseColor + waterHighlightColor * (waterHighlightMask + waterEdge)
    + waterInside * (1.0 - vWaterUv.x + waterColor * vWaterUv.x * 3.0);
// 脱离游戏的深度衰减/折射合成后，用局部水纹覆盖率保留透底，不能把实例的 HDR 强度 5 当整面不透明度。
float waterOpacityGain = 1.0 - exp(-max(waterOpacity, 0.0));
diffuseColor.a = clamp((waterCoverage * waterBase * waterMask + waterEdge) * waterOpacityGain, 0.0, 1.0) * (1.0 - smoothstep(0.75, 1.0, vWaterUv.y));
`
        )
    }
    material.customProgramCacheKey = () => `water-wave-${hasUv1}-${JSON.stringify(data)}`
    return material
}
