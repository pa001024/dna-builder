/**
 * 称号框材质着色器（从游戏 pak 的 ShaderArchive 反编译后移植）。
 *
 * 数据来源与移植方式：
 *   1. `tools/export-title-frame-shaders.ts` 用 ResourceHash 定位每个基础材质的 shader map，
 *      导出全部 permutation 的 DXBC 并用 HLSLDecompiler 反编译成 HLSL；
 *   2. UE 打包时裁掉了 DXBC 的 RDEF 反射块，`UniformBufferLayoutInitializer` 也是空的，
 *      所以常量缓冲的槽位无法反查参数名——但 HLSL 里每个槽位的*用法*是唯一的，
 *      例如 `sin/cos(CB2_m0[7].z)` 绕 (0.577,0.577,0.577) 旋转色相即 HueShift、
 *      `exp2(log2(c) * CB2_m0[11].x)` 即 FinalPower。据此把槽位角色对齐到具名参数，
 *      运行时按名字绑定 `TitleFrameLayer.params` 里的取值。
 *   3. 两个分支开关（自定义图元数据 `CB0[148].x`、场景纹理 `CB1[119].w`）在 UMG 普通
 *      Image 上都是关闭的，因此移植的是 else 分支；屏幕空间折射与逐图元染色不做。
 *
 * 目前覆盖称号框里用量最大的两个基础材质（M_UIBasic、M_BasicVX01，约 121 个材质图层里的
 * 69 个），两者共用同一套 uniform 布局。
 */

/** 图层顶点着色器：把设计坐标系里的图层矩形 + RenderTransform 映射到裁剪空间。 */
export const LAYER_VERTEX_SHADER = `
attribute vec2 aCorner;      // 图层局部坐标 0..1

uniform vec2 uStage;         // 设计画布尺寸（236×34）
uniform vec2 uStageOrigin;   // 设计画布左上角在画布像素坐标系中的位置
uniform float uStageScale;   // 设计单位 → 像素
uniform vec2 uCanvasSize;    // 画布像素尺寸
uniform vec2 uCenter;        // 图层矩形中心（设计坐标）
uniform vec2 uSize;          // 图层矩形尺寸
uniform vec2 uTranslation;   // RenderTransform.Translation
uniform vec2 uScale;         // RenderTransform.Scale
uniform vec2 uShear;         // RenderTransform.Shear（角度）
uniform float uRotation;     // RenderTransform.Angle（角度）

varying vec2 vUv;

void main() {
    vec2 local = (aCorner - 0.5) * uSize;

    // 与 UMG 的 FWidgetTransform 一致：先切变，再旋转，再缩放，最后平移
    vec2 shear = tan(radians(uShear));
    local = vec2(local.x + local.y * shear.x, local.x * shear.y + local.y);

    float angle = radians(uRotation);
    float s = sin(angle);
    float c = cos(angle);
    local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

    local *= uScale;
    local += uTranslation;

    vec2 design = uCenter + local;
    vec2 clip = (design / uStage) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vUv = aCorner;
}
`

/**
 * 普通贴图图层的片元着色器：UMG 的 Image + Texture2D 画笔就是「贴图 × 色调 × 不透明度」。
 */
export const PLAIN_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform vec4 uTint;
uniform float uOpacity;
uniform float uAlphaMask;    // 1 = 贴图 alpha 参与；0 = 只用 tint alpha

varying vec2 vUv;

void main() {
    vec4 texel = texture2D(uTexture, vUv);
    float alpha = uTint.a * uOpacity * mix(1.0, texel.a, uAlphaMask);
    gl_FragColor = vec4(texel.rgb * uTint.rgb, alpha);
}
`

/**
 * 材质图层的片元着色器：M_UIBasic / M_BasicVX01 的主像素着色器。
 *
 * 与反编译结果的对应关系（`CB2_m0[i]` 是材质常量缓冲）：
 *   CB2[2].xy  → Main_U/V_Tiling          `mad(tiling, uv, -0.5)`
 *   CB2[4].xy  → Main_U/V_Scale           旋转后 UV 的除数（GLSL 里叫 uUvScale，避免与顶点阶段的 uScale 重名）
 *   CB2[5].xyz → MainColor                逐通道乘进颜色
 *   CB2[6].xyz → SelectionColor           由 11.y 控制的 lerp 目标
 *   CB2[7].z   → HueShift                 绕 (0.577,0.577,0.577) 的色相旋转
 *   CB2[8].y/.z→ Main_U_Speed/Offset      随时间滚动
 *   CB2[8].w   → Main_V_Speed
 *   CB2[9].x   → Main_V_Offset
 *   CB2[9].y/.z→ 第二个旋转的速度/相位（材质图里的扰动）
 *   CB2[10].w  → Saturation               `mad(sat, lum - c, c)`
 *   CB2[11].x  → FinalPower               `exp2(log2(c) * p)`
 *   CB2[11].w  → Opacity                  alpha 主乘数
 *   CB2[12].x  → 第二个 alpha 乘数
 */
export const MATERIAL_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uMainTex;
uniform sampler2D uMaskA;
uniform sampler2D uMaskB;
uniform float uTime;              // 秒

uniform vec2 uTiling;
uniform vec2 uUvScale;
uniform vec3 uMainColor;
uniform vec3 uSelectionColor;
uniform float uSelectionMix;
uniform float uHueShift;          // 弧度
uniform vec2 uScrollSpeed;
uniform vec2 uScrollOffset;
uniform float uWaverSpeed;
uniform float uWaverOffset;
uniform float uSaturation;
uniform float uFinalPower;
uniform float uOpacity;
uniform float uOpacity2;
uniform vec4 uTint;               // 控件 Brush.TintColor / ColorAndOpacity
uniform float uLayerOpacity;      // 动画 RenderOpacity

varying vec2 vUv;

/** 绕 (1,1,1)/√3 轴旋转色相，照搬 HLSL 里的写法。 */
vec3 hueRotate(vec3 color, float angle) {
    const float k = 0.5773502691896258;
    float lum = dot(color, vec3(k));
    vec3 d = color - lum * k;
    float s = sin(angle);
    float c = cos(angle);
    return vec3(
        lum * k + d.r * c + (d.b * k - d.g * k) * s,
        lum * k + d.g * c + (d.r * k - d.b * k) * s,
        lum * k + d.b * c + (d.g * k - d.r * k) * s
    );
}

void main() {
    // 1. 平铺 + 滚动（HLSL: mad(tiling, mad(speed, time, offset) + uv, -0.5)）
    vec2 uv = uTiling * (uScrollSpeed * uTime + uScrollOffset + vUv) - 0.5;

    // 2. 随时间旋转的扰动
    float angle = (uWaverSpeed * uTime + uWaverOffset) * 6.283185307179586;
    float s = sin(angle);
    float c = cos(angle);
    uv = vec2(dot(uv, vec2(-s, c)) / uUvScale.x, dot(uv, vec2(c, s)) / uUvScale.y);

    vec4 texel = texture2D(uMainTex, uv + 0.5);

    // 3. 饱和度
    float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
    vec3 color = mix(texel.rgb, vec3(lum), uSaturation);

    // 4. 色相
    color = hueRotate(color, uHueShift);

    // 5. 材质主色 × 控件色调
    color *= uMainColor * uTint.rgb;

    // 6. FinalPower
    color = pow(max(color, vec3(0.0)), vec3(uFinalPower));

    // 7. 向 SelectionColor 偏移（未选中时为 0，等价于不生效）
    color = max(mix(color, uSelectionColor, uSelectionMix), vec3(0.0));

    float alpha = clamp(texel.a * uOpacity * uTint.a * uOpacity2 * uLayerOpacity, 0.0, 1.0);
    alpha *= texture2D(uMaskA, vUv).a * texture2D(uMaskB, vUv).a;
    gl_FragColor = vec4(color, alpha);
}
`

/**
 * 鸟群类材质的片元着色器：M_PersonalInfo_Title_8 的主像素着色器。
 *
 * 与反编译结果的对应关系（只有 6 个材质槽位，角色唯一）：
 *   CB2[2].xy  → Main_U/V_Tiling            `mad(tiling, uv, -0.5)`
 *   CB2[3]     → DistortionUV               扰动图 UV 的 2×2 缩放
 *   CB2[5].xy  → 扰动图滚动速度
 *   CB2[9].y   → DistortionPower            用扰动图的 R 通道偏移主贴图的 V
 *   CB2[9].w   → Opacity                    alpha 主乘数
 *
 * HLSL 原文：
 *   _179 = T2.Sample(frac(time * CB2[5].x) + dot(uv, CB2[3].xy) + 0.5, …)   // T2 = DistortionTex
 *   _192 = T3.Sample(TEXCOORD.x, CB2[9].y * _179.x + TEXCOORD.y)             // T3 = MainTex
 *   _222 = clamp(_192.w, 0, 1) * CB2[9].w
 */
export const BIRD_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uMainTex;
uniform sampler2D uDistortionTex;
uniform sampler2D uMaskA;
uniform sampler2D uMaskB;
uniform vec4 uTint;
uniform float uTime;
uniform vec2 uTiling;
uniform vec4 uDistortionUv;
uniform vec2 uDistortionSpeed;
uniform float uDistortionPower;
uniform float uOpacity;
uniform float uLayerOpacity;

varying vec2 vUv;

void main() {
    vec2 tiled = uTiling * vUv - 0.5;
    vec2 distortionUv = vec2(
        fract(uTime * uDistortionSpeed.x) + dot(tiled, uDistortionUv.xy) + 0.5,
        fract(uTime * uDistortionSpeed.y) + dot(tiled, uDistortionUv.zw) + 0.5
    );
    vec4 distortion = texture2D(uDistortionTex, distortionUv);
    vec4 texel = texture2D(uMainTex, vec2(vUv.x, uDistortionPower * distortion.x + vUv.y));

    float alpha = clamp(texel.a, 0.0, 1.0) * uOpacity * uTint.a * uLayerOpacity;
    alpha *= texture2D(uMaskA, vUv).a * texture2D(uMaskB, vUv).a;
    gl_FragColor = vec4(texel.rgb * uTint.rgb, alpha);
}
`

/** 移植过的材质程序标识。 */
export type MaterialProgram = "plain" | "uiVx" | "titleBird"

/**
 * 基础材质包路径 → 已移植的程序。
 *
 * 未列入的材质暂时回退到普通贴图渲染（只画 MainTex × 色调），后续按同一套方法逐个补齐。
 */
const MATERIAL_PROGRAMS: Record<string, MaterialProgram> = {
    M_UIBasic: "uiVx",
    M_BasicVX01: "uiVx",
    M_PersonalInfo_Title_8: "titleBird",
}

/**
 * 解析图层该用哪个程序。
 * @param material 材质父级包路径（`TitleFrameLayer.material`）
 * @returns 程序标识
 */
export function programFor(material: string | undefined): MaterialProgram {
    if (!material) return "plain"
    const name = material.split("/").pop() ?? ""
    return MATERIAL_PROGRAMS[name] ?? "plain"
}

/** 材质参数缺省值：与基础材质里的默认值一致，缺失时用它兜底。 */
export const MATERIAL_PARAM_DEFAULTS = {
    MainColor: [1, 1, 1, 1],
    SelectionColor: [0, 0, 0, 0],
    Main_U_Tiling: 1,
    Main_V_Tiling: 1,
    DistortionPower: 0.02,
    DistortionUV: [0.2, 1, 0.2, 0.2] as const,
    Main_U_Scale: 1,
    Main_V_Scale: 1,
    Main_U_Speed: 0,
    Main_V_Speed: 0,
    Main_U_Offset: 0,
    Main_V_Offset: 0,
    Main_Rotation: 0,
    Main_RotationSpeed: 0,
    HueShift: 0,
    Saturation: 0,
    FinalPower: 1,
    Opacity: 1,
} as const
