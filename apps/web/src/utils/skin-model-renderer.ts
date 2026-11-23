import {
    AdditiveBlending,
    AnimationMixer,
    Box3,
    BufferAttribute,
    type BufferGeometry,
    ClampToEdgeWrapping,
    Color,
    DataTexture,
    DepthTexture,
    DirectionalLight,
    DoubleSide,
    EquirectangularReflectionMapping,
    HemisphereLight,
    LinearFilter,
    LinearToneMapping,
    LoopRepeat,
    Mesh,
    MeshBasicMaterial,
    MeshDepthMaterial,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    NoColorSpace,
    type Object3D,
    OrthographicCamera,
    PCFShadowMap,
    PerspectiveCamera,
    PlaneGeometry,
    PMREMGenerator,
    RepeatWrapping,
    RGBADepthPacking,
    Scene,
    ShaderMaterial,
    type Skeleton,
    SkinnedMesh,
    Sphere,
    SRGBColorSpace,
    Texture,
    UnsignedIntType,
    Vector2,
    Vector3,
    Vector4,
    WebGLRenderer,
    WebGLRenderTarget,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
    eyeUvChannelFromParent,
    type LinearRgb,
    normalizeSkinMaterial,
    resolveHairModelDye,
    resolveSkinModelColor,
    resolveSkinModelFresnel,
    type SkinMaterialMetadata,
    type SkinModelMetadata,
    swatchTable,
    validateSkinModelMetadata,
} from "./skin-model"
import { SKIN_TOON_RAMP_PNG } from "./skin-toon-ramp"
import { createWaterWaveMaterial, WATER_WAVE_TEXTURES } from "./skin-water-material"

/** 数据包里的色板表，转成渲染器要的索引表；发布包与本地 GLB 都不再内嵌色板。 */
async function dyeSwatches(): Promise<Record<string, { linear: LinearRgb; fresnel?: number }>> {
    const { skinColorizeSwatches } = await import("@/data/d/skin-colorize.data")
    return swatchTable(skinColorizeSwatches)
}

/**
 * @description ramp 行号兜底：材质没带 `RampRow`（或带的是装饰行）时按材质身份取有效曲线行。
 * 实测图集里 21/27/29~31 是无效形状（数值先升后降到 0，不是明暗曲线），
 * 行形状分类见 `.docs/skin-toon-render/shader-facts.md`。
 * 皮肤 6 = 暖肤色、脸 1 = 暖肤色、布料 12 = 暗部抬高的阶跃、头发 0 = 中性线性。
 *
 * 头发必须走行 0：`M_Player_Hair_V10` 的材质被导出器归到 `base`（它用贴图当基色、
 * 不是 `Hair_Tint` 的染色遮罩），若按脸套行 1，行 1 暗端是 (204,155,139) 的暖色，
 * 乘到蓝发上会把 R 抬起来、B 压下去，头发整片发灰（实测饱和度 0.51 的贴图渲染成 0.28）。
 * 图集里有一类「装饰行」：横轴走到 x=1 时是纯黑（游戏只在一条很窄的带里采样，永远碰不到右端）。
 * 我们按全区间采样会直接把最受光的区域乘成黑色——头发整片消失就是这么来的。判据是 `x=1` 处为黑：
 * 实测 20/21/25/26/27/28/29/30/31 都是这种行（0–19 全部收在 253/255）。
 */
const INVALID_RAMP_ROWS = new Set([20, 21, 25, 26, 27, 28, 29, 30, 31])

/**
 * @description 头发判定。导出器的 kind 只认 `Hair_Tint`/`HairPart`，菲娜的主发片
 * （`Feina_Hair_SM`，parent 是 `M_Player_Hair_V10`）会落到兜底 `base`，所以网格名也要认。
 */
function isHairMaterial(data: SkinMaterialMetadata, meshName = ""): boolean {
    if (data.kind === "hair" || data.kind === "hairPart") return true
    if ((data.parent ?? "").includes("M_Player_Hair")) return true
    return /hair/i.test(meshName)
}

function defaultRampRow(data: SkinMaterialMetadata): number {
    if (isHairMaterial(data)) return 0
    if (data.kind === "stocking") return 6
    if (data.kind === "base") return 1
    return 12
}

/**
 * @description 皮肤材质判定：`stocking` 是 `M_Player_Skin`（身体皮肤），`base` 是脸。
 * 游戏这两类走 shading model 5（次表面），暗部要靠暖色散射提亮，不能像布料那样压到底。
 * `base` 是导出器的兜底类型，头发也会落进来，所以必须再排掉头发：
 * 发丝既不该吃皮肤那层暖色散射，也不该被剥掉 65% 高光（头发的观感几乎全靠高光）。
 */
/**
 * @description 表情叠加层判定：材质父级是 `M_Player_FaceExpres`。
 * 这层画的是眉毛/睫毛/嘴，UV 要靠材质向量 `UVScale` 从脸贴图里取另一块区域（见 createMaterial）。
 * 没带 `UVScale` 的（导出缺参数）没法定位，硬画只会得到嘴上一道白条，只能关掉。
 */
function isExpressionOverlay(data: SkinMaterialMetadata | undefined): boolean {
    return !!data && (data.parent ?? "").includes("FaceExpres")
}

/**
 * @description 特效拖尾判定：材质父级挂在 `.../Effect/Materials/...` 下（如 `M_SimpleEffectTrail_SK`）。
 */
function isEffectMaterial(data: SkinMaterialMetadata): boolean {
    return /\/Effect\/Materials\//.test(data.parent ?? "")
}

/** 程序化噪声：拖尾没有贴图可采，流动感只能用 UV 上的一层值噪声代替。 */
const EFFECT_NOISE_GLSL = `
float effHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float effNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(effHash(i), effHash(i + vec2(1.0, 0.0)), u.x),
               mix(effHash(i + vec2(0.0, 1.0)), effHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`

function isSkinMaterial(data: SkinMaterialMetadata, meshName = ""): boolean {
    if (isHairMaterial(data, meshName)) return false
    return data.kind === "stocking" || data.kind === "base"
}

/**
 * @description case 14 收尾曲线只属于丝绸类布料（`M_Player_Silk/SilkTran/Energy_ShopSkin`）。
 * 羽片 `M_Player_Wing` 和公告板 `M_Player_Billboard` 是各自独立的着色器，套上这条曲线
 * 会把白羽压成一片平白（实测白羽蒙皮 p50 直接顶到 249）。
 */
function isClothToneMaterial(data: SkinMaterialMetadata): boolean {
    const parent = data.parent ?? ""
    if (parent.includes("Wing") || parent.includes("Billboard")) return false
    return data.kind === "packed" || data.kind === "weapon"
}

/** 五官卡片的蒙皮骨：眉/眼睑/眼线/眼球/牙/舌/下颌。 */
const FACE_FEATURE_BONE = /Brow|Lid|EyeLine|Eye_SK|Teeth|Tongue|Jaw/

/** 一张贴图在某套 UV 上的平均亮度（按网格顶点采样）。 */
function meanLuminance(image: CanvasImageSource & { width: number; height: number }, uv: BufferAttribute): number {
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext("2d")
    if (!context) return 0
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, image.width, image.height).data
    const step = Math.max(1, Math.floor(uv.count / 400))
    let sum = 0
    let count = 0
    for (let i = 0; i < uv.count; i += step) {
        const x = Math.min(image.width - 1, Math.max(0, Math.round((((uv.getX(i) % 1) + 1) % 1) * image.width)))
        const y = Math.min(image.height - 1, Math.max(0, Math.round((((uv.getY(i) % 1) + 1) % 1) * image.height)))
        const offset = (y * image.width + x) * 4
        sum += 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]
        count++
    }
    return count ? sum / count : 0
}

/**
 * @description 判定这张网格是不是脸上的五官叠加卡片，以及该用哪套 UV 取色。
 * 眉毛/眼睑/唇这些卡片的蒙皮权重几乎全在面部控制骨上（脸壳只有 ~25%），据此认层。
 * 取色 UV 随材质版本变：V11 把五官画在脸贴图下缘的色板带上（UV0），V14 画在 UV1 指向的区域。
 * 两种材质名都叫 `M_Player_Face*`，只能按数据判：五官（睫毛/眉/唇）比皮肤暗，
 * 所以「UV1 明显比 UV0 暗」时才切到 UV1，否则保持 UV0。
 */
function pickFaceOverlayUv(mesh: Mesh, source: Mesh["material"]): 0 | 1 | undefined {
    const material = Array.isArray(source) ? source[0] : source
    const data = material?.userData?.dnaColorize as SkinMaterialMetadata | undefined
    if (data?.kind !== "base" || !(data.parent ?? "").includes("M_Player_Face")) return undefined
    if (!(mesh instanceof SkinnedMesh)) return undefined
    const uv0 = mesh.geometry.getAttribute("uv")
    const uv1 = mesh.geometry.getAttribute("uv1")
    const skinIndex = mesh.geometry.getAttribute("skinIndex")
    const skinWeight = mesh.geometry.getAttribute("skinWeight")
    const image = (material as MeshStandardMaterial).map?.image as (CanvasImageSource & { width: number; height: number }) | undefined
    if (!uv0 || !uv1 || !skinIndex || !skinWeight || !image?.width) return undefined
    const bones = mesh.skeleton.bones
    let weighted = 0
    let feature = 0
    for (let i = 0; i < skinIndex.count; i++) {
        if (!skinWeight.getX(i)) continue
        weighted++
        if (FACE_FEATURE_BONE.test(bones[skinIndex.getX(i)]?.name ?? "")) feature++
    }
    if (!weighted || feature / weighted < 0.5) return undefined
    return meanLuminance(image, uv1) < meanLuminance(image, uv0) * 0.9 ? 1 : 0
}

const COMMON_SHADER = `uniform vec3 dnaColors[6];
uniform vec3 dnaEmission;
uniform vec3 dnaDark;
uniform vec3 dnaLight;
uniform float dnaFresnel;
uniform float dnaControl;
uniform float dnaEmissionStrength;
uniform vec3 dnaEmission2;
uniform vec3 dnaEmission3;
uniform float dnaHasEmission;
uniform float dnaWaterTailOpacity;
uniform float dnaWaterTime;
uniform sampler2D dnaTailMask;
uniform sampler2D dnaTailRipple;
uniform sampler2D dnaTailGlow;
uniform sampler2D dnaTailStars;
uniform vec4 dnaTailGlowUv;
uniform vec3 dnaTailTint;
uniform float dnaTailGlowWidth;
uniform float dnaTailGlowGain;
uniform float dnaTailNormalTiling;
uniform float dnaTailNormalStrength;
uniform float dnaQuantize;
uniform float dnaNormalStrength;
uniform float dnaWingDye;
uniform float dnaExprUv;
uniform sampler2D dnaBase;
uniform sampler2D dnaNormal;
uniform sampler2D dnaEmitMap;
uniform sampler2D dnaMaskMap;
uniform sampler2D dnaDyeMap;
uniform vec4 dnaEyeAtlas;
uniform float dnaToonOn;
uniform float dnaToonClamp;
uniform vec3 dnaToonLightColor;
uniform float dnaClothTone;
uniform float dnaHairRamp;
uniform float dnaToneScale;
uniform vec3 dnaToonSky;
uniform float dnaRampRow;
uniform float dnaToonSkin;
uniform float dnaSkinShadow;
uniform float dnaToonSpec;
uniform sampler2D dnaToonRamp;
uniform vec3 dnaToonLightDir;
uniform float dnaHairSaturation;
uniform float dnaHairColorPow;
uniform vec2 dnaHairAoRange;
uniform vec3 dnaHairAoTint;
uniform float dnaHairLightGain;
varying vec2 vDnaUv;
varying vec2 vDnaUv1;
varying vec2 vDnaEyeUv;
varying float vDnaStocking;
varying float vDnaVertexAlpha;
vec3 dnaLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float dnaLinear1(float c) {
    return c < 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 dnaRamp(float x) {
    vec3 tint = mix(dnaColors[0], dnaColors[1], clamp(x, 0.0, 1.0));
    tint = mix(tint, dnaColors[2], clamp(x - 1.0, 0.0, 1.0));
    tint = mix(tint, dnaColors[3], clamp(x - 2.0, 0.0, 1.0));
    tint = mix(tint, dnaColors[4], clamp(x - 3.0, 0.0, 1.0));
    tint = mix(tint, dnaColors[5], clamp(x - 4.0, 0.0, 1.0));
    return tint;
}
float dnaZone(float g) {
    return mix(g, floor(g * 6.0) / 6.0, dnaQuantize) * (5.0 + dnaQuantize);
}
float dnaNormalWeight(vec3 normalSample) {
    return clamp(normalSample.z, 0.0, 1.0);
}
vec3 dnaPart(vec3 c) {
    vec3 linear = dnaLinear(c);
    vec3 tinted = linear.r * dnaColors[0] + linear.g * dnaColors[1] + linear.b * dnaColors[2];
    return mix(linear, tinted, dnaControl);
}
vec3 dnaPacked(vec3 c, float weight) {
    vec3 linear = dnaLinear(c);
    return mix(linear, c.r * dnaRamp(dnaZone(c.g)), weight);
}
vec3 dnaWing(vec3 base, vec4 dye) {
    vec3 linear = dnaLinear(base);
    return mix(linear, base.r * dnaRamp(dnaZone(dye.g)), dnaLinear1(dye.r));
}
vec3 dnaWeapon(vec3 base, vec3 mask) {
    vec3 tint = mask.r * dnaColors[0] + mask.g * dnaColors[1] + mask.b * dnaColors[2];
    return dnaLinear(base) * mix(vec3(1.0), tint, dnaControl);
}
`

// 后处理描边合成着色器：游戏 M_PP_Outline（97765_f3）的深度半边 —— 邻域世界深度差之和 → saturate(pow(diff, depthExp)) 压暗。
// 采样偏移按世界尺寸投影成像素（游戏 outLineWidth=2 渲染像素）：拉远不足一像素时深度差归零、描边自然消失；固定像素宽会远近一样粗。
const OUTLINE_SHADER = `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uCanvasSize;
uniform float uProjScale;
uniform float uWorldWidth;
uniform float uMaxWidthPx;
uniform float uExposure;
uniform float uNear;
uniform float uFar;
uniform float uDepthRel;
uniform float uDepthExp;
uniform float uStrength;
uniform float uKnee;
varying vec2 vUv;
float viewDistance(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
}
float outlineMask(vec2 uv) {
    float center = viewDistance(uv);
    float widthPx = min(uWorldWidth * (uProjScale / max(center, 1e-4)), uMaxWidthPx);
    vec2 offset = vec2(widthPx) / uCanvasSize;
    float diff = abs(viewDistance(uv + vec2(offset.x, 0.0)) - center)
               + abs(viewDistance(uv - vec2(offset.x, 0.0)) - center)
               + abs(viewDistance(uv + vec2(0.0, offset.y)) - center)
               + abs(viewDistance(uv - vec2(0.0, offset.y)) - center);
    return clamp(pow(diff / max(center * uDepthRel, 1e-4), uDepthExp), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 toneMap(vec3 c) {
    vec3 over = max(c - uKnee, vec3(0.0));
    return min(c, vec3(uKnee)) + (1.0 - uKnee) * (1.0 - exp(-over / (1.0 - uKnee)));
}
void main() {
    vec4 src = texture2D(tColor, vUv);
    float alpha = src.a;
    vec3 straight = alpha > 0.0001 ? src.rgb / alpha : vec3(0.0);
    vec3 color = toneMap(straight * uExposure);
    float edge = 0.25 * (outlineMask(vUv + vec2(-0.25, -0.25) / uCanvasSize)
                       + outlineMask(vUv + vec2( 0.25, -0.25) / uCanvasSize)
                       + outlineMask(vUv + vec2(-0.25,  0.25) / uCanvasSize)
                       + outlineMask(vUv + vec2( 0.25,  0.25) / uCanvasSize));
    color = mix(color, vec3(0.0), edge * uStrength);
    gl_FragColor = vec4(toSrgb(color) * alpha, alpha);
}
`

interface DyeMaterial {
    metadata: SkinMaterialMetadata
    uniforms: Record<string, { value: any }>
}

/** 单只眼的归一化框：UV0 模式是巩膜小方块的包围盒，位置模式是均值与最大半径。 */
interface EyeFrame {
    centerX: number
    centerY: number
    sizeX: number
    sizeY: number
}

/** 公告板卡片：展开到世界空间的相对尺寸（乘顶点色 R 得半边长，单位米）。 */
interface BillboardCard {
    size: number
    /** 展开后卡片可能超出折叠状态包围球的最大距离，用于放宽视锥剔除。 */
    extent: number
}

export class SkinModelRenderer {
    private renderer: WebGLRenderer
    private scene = new Scene()
    private camera = new PerspectiveCamera(32, 1, 0.01, 10000)
    private controls: OrbitControls
    private observer: ResizeObserver
    private model?: Object3D
    private gltf?: GLTF
    private metadata?: SkinModelMetadata
    private dyeMaterials: DyeMaterial[] = []
    private effectMaterials: { metadata: SkinMaterialMetadata; material: MeshBasicMaterial; fallback: LinearRgb }[] = []
    private textures = new Set<Texture>()
    /** 不随模型更换的贴图（PMREM 环境、ramp 图集）：换模型时保留，销毁时一起释放 */
    private sceneTextures = new Set<Texture>()
    /** 染色贴图按 GLB 索引克隆一份缓存：多张材质引同一张图时只上传一份到 GPU */
    private textureClones = new Map<number, Promise<Texture>>()
    private waterTextureClones = new Map<string, Promise<Texture>>()
    private request = 0
    /** 特效拖尾的流动时间（秒）：有拖尾材质时渲染循环会一直跑 */
    private effectTime = { value: 0 }
    private hasEffect = false
    private disposed = false
    private visible = true
    /** 画布是否拿到 MSAA：alpha-to-coverage 只在多重采样缓冲上有效。 */
    private msaa = false
    private center = new Vector3()
    /** 取景用的模型尺寸（半高 / xz 半径），距离按当前画布宽高比实时换算 */
    private fit = { halfHeight: 1, radiusXZ: 1 }
    private distance = 1
    private visibility = () => {
        if (this.playing) this.startLoop()
        else this.invalidate()
    }
    private environment: Texture
    private mixer?: AnimationMixer
    private actions: { name: string; action: import("three").AnimationAction }[] = []
    private playing = false
    private lastFrame = 0
    /** 离屏 color+depth target：描边要读深度，MSAA 的 renderbuffer 读不到深度，改用超采样抗锯齿。 */
    private outlineTarget?: WebGLRenderTarget
    private outlineMaterial?: ShaderMaterial
    private outlineScene?: Scene
    private outlineCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    private canvasWidth = 1
    private canvasHeight = 1
    /** 卡通光照的主光方向（世界空间，指向光源）。 */
    private toonLightDir = new Vector3(-3, 5, 4).normalize()
    private toonKey = new DirectionalLight(0xfff2e2, 4)
    /** 卡通 ramp 图集，全局复用一份；按行号取该材质的明暗曲线。 */
    private ramp?: Texture

    constructor(host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
        this.msaa = this.renderer.getContext().getContextAttributes()?.antialias === true
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.outputColorSpace = SRGBColorSpace
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = PCFShadowMap
        // 卡通光照下大量表面被推到 ramp 亮带。游戏实测皮肤 88% 的像素 R 通道贴顶（254），
        // 说明它几乎不做高光压缩，所以用线性 tonemap 而不是 ACES（ACES 会压暗、降饱和）。
        this.renderer.toneMapping = LinearToneMapping
        // 曝光 1.35 而不是 1.45：白羽时装 1.45 下 14% 像素贴顶（参考图 0.1%），
        // 1.35 配合下面的接触阴影才能把白色羽片的灰阶找回来。
        this.renderer.toneMappingExposure = 1.2
        this.renderer.setClearColor(0x000000, 0)
        host.append(this.renderer.domElement)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = false
        this.controls.addEventListener("change", this.invalidate)
        // 环境光只留一点点：游戏是延迟卡通光照，间接光占比极低（实测受光面 36~45% → 目标 <18%）。
        // 天空色保持中性偏冷、地面色改暖，让暗部不再是灰蓝。
        this.scene.add(new HemisphereLight(0xdfe6f2, 0x6b4a3a, 0.45))
        const key = this.toonKey
        key.position.set(-3, 5, 4)
        key.castShadow = true
        key.shadow.mapSize.set(2048, 2048)
        this.scene.add(key, key.target)
        // 卡通光照的主光方向（世界空间，指向光源）：取 key 的位置方向。
        this.toonLightDir.set(-3, 5, 4).normalize()
        const rim = new DirectionalLight(0xbfd4f0, 0.8)
        rim.position.set(3, 3, -4)
        this.scene.add(rim)
        this.environment = this.createEnvironment()
        this.scene.environment = this.environment
        this.scene.environmentIntensity = 0.15
        this.canvasWidth = Math.max(1, host.clientWidth)
        this.canvasHeight = Math.max(1, host.clientHeight)
        this.createOutlinePass()
        this.observer = new ResizeObserver(() => {
            const width = Math.max(1, host.clientWidth)
            const height = Math.max(1, host.clientHeight)
            this.renderer.setSize(width, height)
            this.camera.aspect = width / height
            this.camera.updateProjectionMatrix()
            this.canvasWidth = width
            this.canvasHeight = height
            this.resizeOutlineTarget()
            this.invalidate()
        })
        this.observer.observe(host)
        document.addEventListener("visibilitychange", this.visibility)
    }

    /** 程序化冷白环境球，给丝绸/羽毛/银饰提供 IBL，避免只靠两盏平行光的死黑高光。 */
    private createEnvironment(): Texture {
        const width = 128
        const height = 64
        const data = new Uint8Array(width * height * 4)
        for (let y = 0; y < height; y++) {
            const v = y / (height - 1)
            const horizon = Math.exp(-((v - 0.42) ** 2) / 0.02)
            const sky = 1 - v
            for (let x = 0; x < width; x++) {
                const u = x / (width - 1)
                const key = Math.exp(-((u - 0.22) ** 2 / 0.012 + (v - 0.2) ** 2 / 0.03))
                const rim = Math.exp(-((u - 0.78) ** 2 / 0.02 + (v - 0.32) ** 2 / 0.05))
                const base = 0.34 + 0.5 * sky + 0.22 * horizon
                const i = (y * width + x) * 4
                data[i] = Math.min(255, Math.round(255 * (base * 0.94 + 0.5 * key + 0.16 * rim)))
                data[i + 1] = Math.min(255, Math.round(255 * (base * 0.97 + 0.47 * key + 0.2 * rim)))
                data[i + 2] = Math.min(255, Math.round(255 * (base * 1.02 + 0.42 * key + 0.26 * rim)))
                data[i + 3] = 255
            }
        }
        const source = new DataTexture(data, width, height)
        source.mapping = EquirectangularReflectionMapping
        source.colorSpace = SRGBColorSpace
        source.needsUpdate = true
        const generator = new PMREMGenerator(this.renderer)
        const target = generator.fromEquirectangular(source).texture
        generator.dispose()
        source.dispose()
        this.sceneTextures.add(target)
        return target
    }

    private invalidate = () => {
        if (this.request || this.disposed || !this.visible || document.hidden) return
        this.request = requestAnimationFrame(() => {
            this.request = 0
            if (!this.disposed) this.render()
        })
    }

    /**
     * @description 一次完整绘制：场景 → 离屏 target（同时写深度）→ 描边合成到画布。
     * 离屏渲染时 three 不做色调映射，曝光与 sRGB 编码由合成着色器负责。
     */
    render() {
        if (this.disposed) return
        if (!this.outlineTarget || !this.outlineMaterial || !this.outlineScene) {
            this.renderer.render(this.scene, this.camera)
            return
        }
        // 相机近远裁剪面在 frameModel 里按模型尺度重设过，深度反解必须用当前值：
        // 沿用它构造时的默认值会把 3.7m 解成 37m，距离淡出直接把描边关死。
        this.outlineMaterial.uniforms.uNear.value = this.camera.near
        this.outlineMaterial.uniforms.uFar.value = this.camera.far
        // 世界尺寸 ↔ 像素 的换算：每帧跟着相机 fov / 画布尺寸走
        const canvasHeight = this.canvasHeight * this.renderer.getPixelRatio()
        this.outlineMaterial.uniforms.uCanvasSize.value.set(this.canvasWidth * this.renderer.getPixelRatio(), canvasHeight)
        this.outlineMaterial.uniforms.uProjScale.value = (canvasHeight * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360)
        // 像素上限按 CSS 像素算：uCanvasSize 是 device 像素，画面上 1px = pixelRatio 个 device 像素。
        // 实测可见带宽 ≈ 上限 + 0~1 个 device 像素（轮廓边缘的半透明 AA），1.5 CSS px 画面约 2–3px。
        this.outlineMaterial.uniforms.uMaxWidthPx.value = 1.5 * Math.max(1, this.renderer.getPixelRatio())
        this.renderer.setRenderTarget(this.outlineTarget)
        this.renderer.render(this.scene, this.camera)
        this.renderer.setRenderTarget(null)
        this.renderer.render(this.outlineScene, this.outlineCamera)
    }

    /** 超采样抗锯齿：MSAA 的深度存在 renderbuffer 里取不到，只能把整个场景放大画再缩采样。 */
    private resizeOutlineTarget() {
        const ratio = this.renderer.getPixelRatio()
        const width = Math.max(1, Math.round(this.canvasWidth * ratio))
        const height = Math.max(1, Math.round(this.canvasHeight * ratio))
        const supersample = width * height * 4 <= 4_000_000 ? 2 : 1
        const renderWidth = width * supersample
        const renderHeight = height * supersample
        if (this.outlineTarget) {
            if (this.outlineTarget.width === renderWidth && this.outlineTarget.height === renderHeight) return
            this.outlineTarget.dispose()
        }
        const depth = new DepthTexture(renderWidth, renderHeight)
        depth.type = UnsignedIntType
        this.outlineTarget = new WebGLRenderTarget(renderWidth, renderHeight, {
            depthTexture: depth,
            depthBuffer: true,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            generateMipmaps: false,
        })
        const material = this.outlineMaterial
        if (material) {
            material.uniforms.tColor.value = this.outlineTarget.texture
            material.uniforms.tDepth.value = depth
        }
    }

    /** 描边合成用的全屏三角面片；没有它时退回直接渲染（例如 target 创建失败）。 */
    private createOutlinePass() {
        const material = new ShaderMaterial({
            uniforms: {
                tColor: { value: null },
                tDepth: { value: null },
                uCanvasSize: { value: new Vector2(1, 1) },
                // 1m 远处多少画布像素（= 0.5 * 画布高 / tan(fov/2)），每帧按相机更新
                uProjScale: { value: 1 },
                // 描边宽度是世界尺寸（米）：由参考图实测「描边带宽 ≈ 角色高度 0.15%」折算，见规格 §5.4
                uWorldWidth: { value: 0.001 },
                // 采样偏移的像素上限（每帧按 pixelRatio 写回）：可见带宽 ≈ 上限 + 边缘 AA 的 1px
                uMaxWidthPx: { value: 1 },
                uExposure: { value: this.renderer.toneMappingExposure },
                uNear: { value: this.camera.near },
                uFar: { value: this.camera.far },
                // 深度跃变阈值 = 当前深度的 5%：只有真正的轮廓/遮挡跳变会触发，
                // 斜视的曲面（一个采样间隔内几厘米落差）不会被判成边缘
                uDepthRel: { value: 0.05 },
                uDepthExp: { value: 2 },
                uStrength: { value: 0.7 },
                // 高光肩部拐点（线性空间）：0.72 以上才开始压缩，正常肤色/布料的光照层次不受影响
                uKnee: { value: 0.72 },
            },
            vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader: OUTLINE_SHADER,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        })
        const scene = new Scene()
        scene.add(new Mesh(new PlaneGeometry(2, 2), material))
        this.outlineMaterial = material
        this.outlineScene = scene
        this.resizeOutlineTarget()
    }

    private tick = (time: number) => {
        if (this.disposed) return
        if (!this.visible || document.hidden) {
            this.request = 0
            this.lastFrame = 0
            return
        }
        const delta = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.25) : 0
        this.lastFrame = time
        this.effectTime.value = time / 1000
        this.mixer?.update(delta)
        this.render()
        this.request = requestAnimationFrame(this.tick)
    }

    private startLoop() {
        if (this.disposed) return
        if (this.request) cancelAnimationFrame(this.request)
        this.lastFrame = 0
        this.request = requestAnimationFrame(this.tick)
    }

    /**
     * @description 换模型时只清场景内容，保留 WebGL 上下文、程序缓存与 PMREM 环境：
     * 新建渲染器要重建上下文并重新链接十几个着色器程序，逐皮肤切换时这部分比下载还慢。
     */
    private clearModel() {
        this.mixer?.stopAllAction()
        this.mixer = undefined
        this.actions = []
        this.dyeMaterials = []
        this.effectMaterials = []
        this.playing = false
        this.gltf = undefined
        this.metadata = undefined
        this.hasEffect = false
        if (this.model) {
            this.scene.remove(this.model)
            this.disposeModel(this.model)
            this.model = undefined
        } else {
            for (const texture of this.textures) texture.dispose()
            this.textures.clear()
            this.textureClones.clear()
        }
    }

    async load(url: string): Promise<SkinModelMetadata | undefined> {
        this.clearModel()
        // 发布版模型走 EXT_meshopt_compression，必须显式装上解码器。
        // 用 three 自带的实现，避免为解码器再引一份运行时依赖。
        const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js")
        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        const gltf = await loader.loadAsync(url)
        if (this.disposed) {
            this.disposeModel(gltf.scene)
            return undefined
        }
        this.gltf = gltf
        this.model = gltf.scene
        const extras = gltf.parser.json.extras?.dnaColorize
        // 发布包不带色板表（各皮肤一致，只存在数据包里），缺了就从数据包补，
        // 打开本地 GLB 时同样按数据包补齐。
        this.metadata = validateSkinModelMetadata(extras && !extras.swatches ? { ...extras, swatches: await dyeSwatches() } : extras)
        const meshes: Mesh[] = []
        gltf.scene.traverse(object => {
            if (object instanceof Mesh) meshes.push(object)
        })
        // 所有网格的材质转换一起发起：贴图解码（26 张 webp）是异步的，逐个网格串行
        // 会让它们排队（实测串行 172ms / 并行 45ms）。
        const pendingMaterials = meshes.map(mesh => {
            const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const hasUv1 = mesh.geometry.getAttribute("uv1") !== undefined
            // 三的各向异性高光按几何切向算，UE 导出的网格没有 tangent 属性——不补的话
            // MeshPhysicalMaterial.anisotropy 静默失效，丝绸就只剩各向同性的哑光。
            const aniso = original[0]?.userData.dnaColorize as SkinMaterialMetadata | undefined
            if ((aniso?.scalars.Anisotropy ?? 0) > 0 && !mesh.geometry.getAttribute("tangent") && mesh.geometry.index) {
                mesh.geometry.computeTangents()
            }
            // 脸部五官卡片的取色 UV 因材质版本而异（见 pickFaceOverlayUv），每个网格单独判一次
            const overlayUv = pickFaceOverlayUv(mesh, original[0])
            return Promise.all(
                original.map(material => {
                    const data = material.userData.dnaColorize as SkinMaterialMetadata | undefined
                    if (data?.version !== 1) throw new Error(`Missing dye material metadata: ${material.name}`)
                    return this.createMaterial(data, material as MeshStandardMaterial, hasUv1, mesh.name, overlayUv)
                })
            )
        })
        for (const [index, mesh] of meshes.entries()) {
            const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const converted = await pendingMaterials[index]
            for (const material of original) {
                for (const value of Object.values(material)) {
                    if (!(value instanceof Texture)) continue
                    // 直接复用原材质的贴图（无染色底图的 billboard/装饰件）也要开各向异性，避免远景闪烁。
                    value.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
                    this.textures.add(value)
                }
                material.dispose()
            }
            // 表情层（`M_Player_FaceExpres`）是眉毛/睫毛/眼窝壁/嘴袋各自的卡片，彼此是独立连通块。
            // 整层原样保留：游戏里就是这个网格，按连通块裁剪属于破坏性改动。
            const color = mesh.geometry.getAttribute("color")
            if (color) mesh.geometry.setAttribute("dnaMask", color)
            else {
                // 没有顶点遮罩的部件不走丝袜分支。
                const mask = new Float32Array(mesh.geometry.getAttribute("position").count * 4).fill(1)
                mesh.geometry.setAttribute("dnaMask", new BufferAttribute(mask, 4))
            }
            // 眼球虹膜画在 UV0 还是 UV1 上逐角色不同（V10/V11 → UV0，V14 → UV1），
            // 由导出器实测后写进材质元数据；取错那套只能看到一圈巩膜。
            // 旧导出包没有这个字段（或整包丢了 UV1）时按材质版本号兜底。
            const eyeMaterial = original.find(
                material => (material.userData.dnaColorize as SkinMaterialMetadata | undefined)?.kind === "eye"
            )
            if (eyeMaterial) {
                const data = eyeMaterial.userData.dnaColorize as SkinMaterialMetadata
                const channel = data.eyeAtlas?.channel ?? eyeUvChannelFromParent(data.parent)
                mesh.geometry.setAttribute("dnaEyeUv", this.eyeUv(mesh.geometry, channel))
            }
            // 公告板（珍珠链、帽子上的花）是 UV 图集里的一块小卡片：四角顶点位置完全相同，
            // 只有 UV 不同，游戏在顶点着色器里按 UV 把卡片展开。不展开就是四个重合点，链子整条消失。
            const card = this.billboardCard(mesh)
            if (card)
                for (const material of Array.isArray(converted) ? converted : [converted]) {
                    // 特效拖尾是 MeshBasicMaterial，没有卡片展开这一步
                    if (material instanceof MeshStandardMaterial) this.expandBillboard(material, card, mesh)
                }
            mesh.material = Array.isArray(mesh.material) ? converted : converted[0]
            mesh.receiveShadow = true
            const surface = converted[0]
            const data = surface.userData.dnaColorize as SkinMaterialMetadata | undefined
            if (
                converted.length === 1 &&
                surface instanceof MeshStandardMaterial &&
                !surface.transparent &&
                data &&
                data.kind !== "eye" &&
                data.kind !== "shadow" &&
                !isExpressionOverlay(data) &&
                !card
            ) {
                const depth = new MeshDepthMaterial({
                    depthPacking: RGBADepthPacking,
                    map: surface.map,
                    alphaTest: surface.alphaTest,
                    side: surface.side,
                })
                // 深度 pass 复用相同的染色/剪影代码，羽片和镂空衣料不能投成完整卡片。
                depth.onBeforeCompile = (shader, renderer) => surface.onBeforeCompile(shader, renderer)
                depth.customProgramCacheKey = () => `depth-${surface.customProgramCacheKey()}`
                mesh.customDepthMaterial = depth
                mesh.castShadow = true
            }
            let parent: Object3D | null = mesh
            while (parent && !parent.userData.dnaRole) parent = parent.parent
            mesh.userData.dnaRole = parent?.userData.dnaRole ?? "character"
            if (mesh.userData.dnaRole === "weapon") mesh.visible = false
        }
        if (this.disposed) {
            this.disposeModel(gltf.scene)
            return undefined
        }
        this.scene.add(gltf.scene)
        // 帽子和身体在游戏里是两个独立组件：帽子只跟随头部骨，角色动画里针对默认头饰的
        // headparts 轨道（与帽子自己的绑定姿态不一致）不能作用到它，否则帽檐会被甩到头顶上。
        const hatBones = new Set<string>()
        for (const mesh of meshes) {
            if (!(mesh instanceof SkinnedMesh) || !/hat/i.test(mesh.name)) continue
            const weights = mesh.geometry.getAttribute("skinWeight")
            const indices = mesh.geometry.getAttribute("skinIndex")
            if (!weights || !indices) continue
            for (let vertex = 0; vertex < weights.count; vertex++)
                for (let channel = 0; channel < 4; channel++) {
                    if (!weights.getComponent(vertex, channel)) continue
                    const bone = mesh.skeleton.bones[indices.getComponent(vertex, channel)]
                    if (bone) hatBones.add(bone.name)
                }
        }
        // 面部控制骨（`face_control` / `mouth_control` 子树）在游戏里由 Kawaii 面部 ABP 每帧驱动，
        // 身体动画里那几条单帧常数轨道只是导出时残留的姿势。实测按上去会把下颌/牙往前推 ~4mm，
        // 下牙从嘴缝顶出来（变成唇下一道白条）、舌头从下巴缝露出来；丢掉这些常数轨道让它们
        // 保持绑定姿势即可，多帧的表情轨道仍然保留。
        const faceControlBones = new Set<string>()
        gltf.scene.traverse(object => {
            if (!(object instanceof SkinnedMesh)) return
            for (const bone of object.skeleton.bones) {
                if (faceControlBones.has(bone.name)) continue
                for (let node: Object3D | null = bone.parent; node; node = node.parent)
                    if (node.name === "face_control" || node.name === "mouth_control") {
                        faceControlBones.add(bone.name)
                        break
                    }
            }
        })
        if (faceControlBones.size)
            for (const clip of gltf.animations)
                clip.tracks = clip.tracks.filter(track => {
                    const separator = track.name.lastIndexOf(".")
                    if (separator < 0 || !faceControlBones.has(track.name.slice(0, separator))) return true
                    return track.times.length > 1
                })
        if (hatBones.size)
            for (const clip of gltf.animations) {
                clip.tracks = clip.tracks.filter(track => {
                    const separator = track.name.lastIndexOf(".")
                    return separator < 0 || !hatBones.has(track.name.slice(0, separator))
                })
            }
        if (gltf.animations.length) {
            this.mixer = new AnimationMixer(gltf.scene)
            this.actions = gltf.animations.map(clip => ({ name: clip.name, action: this.mixer!.clipAction(clip) }))
            this.play()
        }
        this.frameModel()
        // 首帧前置备好程序、贴图与离屏 target：否则 loading 收起后还要卡一下，
        // 玩家看到的是「进度条走完了但画面冻着」。用同步 compile 而不是 compileAsync：
        // 后者走 KHR_parallel_shader_compile 轮询，实测比同步还慢（288ms vs 23ms）。
        this.renderer.compile(this.scene, this.camera)
        for (const texture of this.textures) this.renderer.initTexture(texture)
        this.render()
        // 有特效拖尾时要保持渲染循环：流动靠时间推进，按需渲染会停在第一帧。
        if (this.hasEffect) this.startLoop()
        return this.metadata
    }

    private frameModel() {
        const bounds = new Box3()
        this.model?.traverse(object => {
            if (object instanceof Mesh && object.visible) bounds.expandByObject(object)
        })
        if (bounds.isEmpty()) return
        bounds.getCenter(this.center)
        const radius = bounds.getBoundingSphere(new Sphere()).radius
        // 取景按包围盒的**高**与 xz 半径分别算，不再按外接球：球半径把宽度也算进竖直方向，
        // 角色只占屏幕一半（实测 800×1000 画布上高度 50%），看起来像缩在远处。
        const size = bounds.getSize(new Vector3())
        let radiusXZ = 0
        for (const x of [bounds.min.x, bounds.max.x]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
                radiusXZ = Math.max(radiusXZ, Math.hypot(x - this.center.x, z - this.center.z))
            }
        }
        this.fit = { halfHeight: size.y / 2, radiusXZ }
        this.controls.minDistance = radius * 0.05
        this.controls.maxDistance = radius * 12
        this.camera.near = Math.max(radius / 1000, 0.001)
        this.camera.far = radius * 40
        this.camera.updateProjectionMatrix()
        const shadow = this.toonKey.shadow
        this.toonKey.position.copy(this.center).addScaledVector(this.toonLightDir, radius * 3)
        this.toonKey.target.position.copy(this.center)
        shadow.camera.left = shadow.camera.bottom = -radius * 1.15
        shadow.camera.right = shadow.camera.top = radius * 1.15
        shadow.camera.near = radius * 0.1
        shadow.camera.far = radius * 6
        shadow.normalBias = radius * 0.001
        shadow.bias = -0.0001
        shadow.camera.updateProjectionMatrix()
        // 描边宽度按模型尺度给：参考图实测带宽约为角色高度的 0.15%（1360px 高的角色上 2px），
        // 换算成世界宽度后与相机距离无关，拉远时自然缩小到亚像素并消失。
        if (this.outlineMaterial) this.outlineMaterial.uniforms.uWorldWidth.value = radius * 0.003
        this.resetCamera()
    }

    /**
     * 眼球虹膜 UV：游戏把虹膜图集画在哪套 UV 上逐角色不同——V10/V11 材质直接画在 UV0 上
     * （左右眼共用同一块），V14 则分画在 UV1 的 0~1 / 1~2 两格（UV0 只剩巩膜纯色区）。
     * 通道由导出器实测写进 `eyeAtlas.channel`；该通道的 UV 缺失（旧导出包）时按仿射补一份，
     * 实测在 512px 贴图上残差约 7px，与真 UV1 在视觉上无法区分。**不要**按法线做球面投影：
     * 眼球是一层扁壳加一圈外翻背壳（深度/直径只有 0.24），球面投影会把朝后的背壳也投进虹膜，
     * 整只眼变成银色金属球。
     */
    private eyeUv(geometry: BufferGeometry, channel: 0 | 1): BufferAttribute {
        const source = geometry.getAttribute(channel === 1 ? "uv1" : "uv0") as BufferAttribute | undefined
        if (source) return source
        const position = geometry.getAttribute("position") as BufferAttribute
        const uv0 = geometry.getAttribute("uv0") as BufferAttribute | undefined
        const uv = new Float32Array(position.count * 2)
        // 每只眼单独求归一化框：UV0 落在巩膜小方块里，位置框则是眼球自身的包围盒。
        const frame = this.eyeFrames(position, uv0)
        for (let vertex = 0; vertex < position.count; vertex++) {
            const side = position.getX(vertex) >= 0 ? 1 : -1
            const box = frame[side > 0 ? 1 : 0]
            let u: number
            let v: number
            if (uv0) {
                const x = (side * (uv0.getX(vertex) - box.centerX)) / box.sizeX
                const y = (uv0.getY(vertex) - box.centerY) / box.sizeY
                u = 0.5 + 0.845817 * x + 0.063637 * y + 0.00741
                v = 0.5 - 0.019985 * x + 0.878396 * y - 0.005785
            } else {
                const x = (side * (position.getX(vertex) - box.centerX)) / box.sizeX
                const y = (position.getY(vertex) - box.centerY) / box.sizeY
                u = 0.5 + 0.513083 * x - 0.057407 * y + 0.014071
                v = 0.5 - 0.025682 * x - 0.486675 * y + 0.030063
            }
            // 右眼进 tile 1：显式加 1，换成 ClampToEdge 采样器也不会采错格。
            uv[vertex * 2] = side > 0 ? u + 1 : u
            uv[vertex * 2 + 1] = v
        }
        return new BufferAttribute(uv, 2)
    }

    /**
     * @description 按 x 的符号把眼球顶点分成左右两组，各求一个归一化框。
     * UV0 模式取 UV0 的包围盒（巩膜小方块），位置模式取顶点的均值与最大半径。
     */
    private eyeFrames(position: BufferAttribute, uv0: BufferAttribute | undefined): EyeFrame[] {
        return [-1, 1].map(side => {
            const frame: EyeFrame = { centerX: 0, centerY: 0, sizeX: 1, sizeY: 1 }
            let minX = Number.POSITIVE_INFINITY
            let maxX = Number.NEGATIVE_INFINITY
            let minY = Number.POSITIVE_INFINITY
            let maxY = Number.NEGATIVE_INFINITY
            let sumX = 0
            let sumY = 0
            let count = 0
            for (let vertex = 0; vertex < position.count; vertex++) {
                if ((position.getX(vertex) >= 0 ? 1 : -1) !== side) continue
                const x = uv0 ? uv0.getX(vertex) : position.getX(vertex)
                const y = uv0 ? uv0.getY(vertex) : position.getY(vertex)
                minX = Math.min(minX, x)
                maxX = Math.max(maxX, x)
                minY = Math.min(minY, y)
                maxY = Math.max(maxY, y)
                sumX += x
                sumY += y
                count++
            }
            if (!count) return frame
            if (uv0) {
                frame.centerX = (minX + maxX) / 2
                frame.centerY = (minY + maxY) / 2
                frame.sizeX = maxX - minX
                frame.sizeY = maxY - minY
                return frame
            }
            frame.centerX = sumX / count
            frame.centerY = sumY / count
            // 位置模式的半径取到该眼最远顶点，归一化后正好落在 [-1, 1]。
            let radius = 0
            for (let vertex = 0; vertex < position.count; vertex++) {
                if ((position.getX(vertex) >= 0 ? 1 : -1) !== side) continue
                radius = Math.max(radius, Math.hypot(position.getX(vertex) - frame.centerX, position.getY(vertex) - frame.centerY))
            }
            frame.sizeX = radius
            frame.sizeY = radius
            return frame
        })
    }

    /**
     * @description 公告板卡片网格：四角顶点位置几乎重合、只有 UV 落在图集里的一小块上，
     * 游戏在顶点着色器里按 UV 把卡片展开成朝向相机的四边形。这里把每张卡的角点符号
     * 预先写进 `dnaCardCorner` 顶点属性（-1~1），并按卡片间距反推展开尺寸。
     * 不是卡片网格返回 undefined。
     */
    private billboardCard(mesh: Mesh): BillboardCard | undefined {
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        const data = material.userData.dnaColorize as SkinMaterialMetadata | undefined
        if (!(data?.parent ?? "").includes("M_Player_Billboard")) return undefined
        const uv = mesh.geometry.getAttribute("uv")
        const color = mesh.geometry.getAttribute("color")
        const position = mesh.geometry.getAttribute("position")
        if (!uv || !color || !position || position.count < 8) return undefined
        // 同一张卡的四角位置重合（误差远小于卡片间距），按位置聚类成卡片；UV 落在图集里的一小块上，
        // 角点符号就是 UV 相对这块矩形中心的偏移。不能按索引两两配对：不同皮肤的三角剖分
        // 顺序不一致（SP07/SP14 的四边形并不共享对角线），会切出错位的卡片。
        const bounds = new Box3().setFromBufferAttribute(position as BufferAttribute)
        const epsilon = Math.max(1e-5, bounds.getSize(new Vector3()).length() * 1e-4)
        const corners = new Float32Array(position.count * 2)
        const cards: number[][] = []
        for (let vertex = 0; vertex < position.count; vertex++) {
            const card = cards.find(candidate => {
                const anchor = candidate[0]
                return (
                    Math.abs(position.getX(vertex) - position.getX(anchor)) <= epsilon &&
                    Math.abs(position.getY(vertex) - position.getY(anchor)) <= epsilon &&
                    Math.abs(position.getZ(vertex) - position.getZ(anchor)) <= epsilon
                )
            })
            if (card) card.push(vertex)
            else cards.push([vertex])
        }
        for (const card of cards) {
            if (card.length < 3) return undefined
            let minU = Number.POSITIVE_INFINITY
            let maxU = Number.NEGATIVE_INFINITY
            let minV = Number.POSITIVE_INFINITY
            let maxV = Number.NEGATIVE_INFINITY
            for (const vertex of card) {
                minU = Math.min(minU, uv.getX(vertex))
                maxU = Math.max(maxU, uv.getX(vertex))
                minV = Math.min(minV, uv.getY(vertex))
                maxV = Math.max(maxV, uv.getY(vertex))
            }
            const halfU = (maxU - minU) / 2
            const halfV = (maxV - minV) / 2
            // 退化卡片（UV 全相同）在游戏里也是不可见的，保持原样即可。
            if (halfU <= 0 || halfV <= 0) continue
            for (const vertex of card) {
                corners[vertex * 2] = (uv.getX(vertex) - (minU + maxU) / 2) / halfU
                corners[vertex * 2 + 1] = (uv.getY(vertex) - (minV + maxV) / 2) / halfV
            }
        }
        // 卡片间距与自身尺寸成正比（顶点色 R 是每张卡的半径），按最近邻间距的中位数反推展开尺寸：
        // 卡片边长取间距的 0.36 倍时相邻珠子之间才留出游戏里那种细缝，取满间距会连成一串糖葫芦。
        const centers = cards.map(card => [position.getX(card[0]), position.getY(card[0]), position.getZ(card[0])])
        const ratios: number[] = []
        for (let a = 0; a < centers.length; a++) {
            const radius = Math.max(...cards[a].map(vertex => color.getX(vertex)))
            if (radius <= 0) return undefined
            let nearest = Number.POSITIVE_INFINITY
            for (let b = 0; b < centers.length; b++) {
                if (a === b) continue
                nearest = Math.min(
                    nearest,
                    Math.hypot(centers[a][0] - centers[b][0], centers[a][1] - centers[b][1], centers[a][2] - centers[b][2])
                )
            }
            if (Number.isFinite(nearest)) ratios.push(nearest / radius)
        }
        if (!ratios.length) return undefined
        ratios.sort((a, b) => a - b)
        const size = 0.18 * ratios[Math.floor(ratios.length / 2)]
        let extent = 0
        for (const card of cards) extent = Math.max(extent, Math.max(...card.map(vertex => color.getX(vertex))) * size)
        mesh.geometry.setAttribute("dnaCardCorner", new BufferAttribute(corners, 2))
        return { size, extent }
    }

    /** @description 卡片网格的顶点着色器改成「按预存的角点朝相机方向展开」，并让法线直接面向相机。 */
    private expandBillboard(material: MeshStandardMaterial, card: BillboardCard, mesh: Mesh) {
        const original = material.onBeforeCompile
        const baseKey = material.customProgramCacheKey()
        material.onBeforeCompile = (shader, renderer) => {
            original.call(material, shader, renderer)
            shader.uniforms.dnaCardSize = { value: card.size }
            shader.vertexShader = `uniform float dnaCardSize;\n${shader.vertexShader}`.replace(
                "#include <project_vertex>",
                // 视图空间展开：四角顶点位置相同，按每张卡的角点符号推出方向，
                // 半边长 = 顶点色 R（每张卡的半径）× dnaCardSize。
                `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                mvPosition.xy += dnaCardCorner * (dnaMask.r * dnaCardSize);
                gl_Position = projectionMatrix * mvPosition;`
            )
            // 卡片面向相机，切线空间就是视图空间：法线贴图的 XY 直接当视图空间方向，Z 朝相机。
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <normal_fragment_maps>",
                `vec4 dnaCardNormal = texture2D(dnaNormal, vDnaUv);
                vec2 dnaCardXY = (dnaCardNormal.rg * 2.0 - 1.0) * dnaNormalStrength;
                normal = normalize(vec3(dnaCardXY, sqrt(max(0.0, 1.0 - dot(dnaCardXY, dnaCardXY)))));`
            )
        }
        material.customProgramCacheKey = () => `${baseKey}-billboard`
        material.side = DoubleSide
        // 折叠状态下卡片是几个重合点，包围球远小于展开后的真实范围，不放大就会被视锥剔除。
        mesh.geometry.computeBoundingSphere()
        const sphere = mesh.geometry.boundingSphere
        if (sphere) sphere.radius += card.extent
    }

    private dataTexture(index: number | undefined): Promise<Texture> {
        if (index === undefined) throw new Error("Required game texture is missing")
        // clone 按索引缓存：公共贴图（引擎内置图、共享法线/混合图）被多个材质引用时只克隆、上传一份
        let cached = this.textureClones.get(index)
        if (!cached) {
            cached = this.gltf!.parser.getDependency("texture", index).then((original: Texture) => {
                this.textures.add(original)
                const texture = original.clone()
                texture.colorSpace = NoColorSpace
                texture.flipY = false
                // 各向异性过滤：远景/斜视角下花纹（纹身、蕾丝）才不会因 mip 采样闪成噪点。
                texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
                texture.needsUpdate = true
                this.textures.add(texture)
                return texture
            })
            this.textureClones.set(index, cached)
        }
        return cached
    }

    private waterTexture(name: string): Promise<Texture> {
        let texture = this.waterTextureClones.get(name)
        if (!texture) {
            texture = import("./skin-water-textures").then(
                ({ SKIN_WATER_TEXTURES }) =>
                    new Promise<Texture>((resolve, reject) => {
                        const image = new Image()
                        image.onload = () => {
                            const texture = new Texture(image)
                            texture.colorSpace = NoColorSpace
                            texture.flipY = false
                            texture.wrapS = RepeatWrapping
                            texture.wrapT = RepeatWrapping
                            texture.needsUpdate = true
                            this.sceneTextures.add(texture)
                            resolve(texture)
                        }
                        image.onerror = () => reject(new Error(`Water texture could not be decoded: ${name}`))
                        image.src = SKIN_WATER_TEXTURES[name]
                    })
            )
            this.waterTextureClones.set(name, texture)
        }
        return texture
    }

    private rampTexture(): Texture {
        if (this.ramp) return this.ramp
        const image = new Image()
        image.src = SKIN_TOON_RAMP_PNG
        const texture = new Texture(image)
        // 图集是数据不是颜色：不做 sRGB 解码，采样值直接当亮度乘子。
        texture.colorSpace = NoColorSpace
        // 行号按图片从上到下的像素行寻址，必须关掉默认的垂直翻转，
        // 否则 v=0 会取到图片底部（第 248~255 行是未使用的全白填充），所有材质都变成不压暗。
        texture.flipY = false
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.wrapS = ClampToEdgeWrapping
        texture.wrapT = ClampToEdgeWrapping
        texture.generateMipmaps = false
        image.onload = () => {
            texture.needsUpdate = true
            this.invalidate()
        }
        this.ramp = texture
        this.sceneTextures.add(texture)
        return texture
    }

    /**
     * @description 特效拖尾材质：不受光、叠加混合、双面、不写深度。
     * 颜色只取材质 `自发光颜色`（这类材质没有底图/法线），亮度压到 1 以内：
     * 材质里的 `AddTexStrength=200` 那类是给 HDR 特效管线用的，照搬会糊成一片白。
     * 流动感按材质自己的 UV 参数驱动：`MainTexUVr` 是重复次数、`MainTexUVm.z` 是滚动速度。
     */
    private createEffectMaterial(data: SkinMaterialMetadata): MeshBasicMaterial {
        const [r, g, b] = data.vectors.自发光颜色 ?? [1, 1, 1]
        const repeat = data.vectors.MainTexUVr ?? [1, 1, 0]
        const move = data.vectors.MainTexUVm ?? [0, 0, 0.25]
        const material = new MeshBasicMaterial({
            color: new Color(r, g, b),
            transparent: true,
            opacity: 0.6,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
        })
        this.effectMaterials.push({ metadata: data, material, fallback: [r, g, b] as LinearRgb })
        const uniforms = {
            uEffTime: this.effectTime,
            uEffRepeat: { value: new Vector2(repeat[0] || 1, repeat[1] || 1) },
            uEffSpeed: { value: move[2] ?? 0.25 },
        }
        material.userData.dnaColorize = data
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms)
            shader.vertexShader = `varying vec2 vEffUv;\n${shader.vertexShader}`.replace(
                "#include <uv_vertex>",
                "#include <uv_vertex>\nvEffUv = uv;"
            )
            shader.fragmentShader = `varying vec2 vEffUv;
uniform float uEffTime;
uniform vec2 uEffRepeat;
uniform float uEffSpeed;
${EFFECT_NOISE_GLSL}
${shader.fragmentShader}`.replace(
                "#include <map_fragment>",
                `#include <map_fragment>
    diffuseColor.a *= smoothstep(0.0, 0.2, vEffUv.x) * smoothstep(1.0, 0.8, vEffUv.x);
    float dnaFlow = effNoise(vEffUv * uEffRepeat + vec2(0.0, uEffTime * uEffSpeed)) * 0.65
                  + effNoise(vEffUv * (uEffRepeat * 2.0) - vec2(0.0, uEffTime * uEffSpeed * 1.7)) * 0.35;
    diffuseColor.a *= 0.2 + 0.8 * dnaFlow;
    diffuseColor.rgb *= 0.45 + 1.1 * dnaFlow;`
            )
        }
        return material
    }

    /** 保留游戏编码贴图，用 Shader chunk 替换基础色和 BC7 法线；灯光仍是 Three 的近似预览。 */
    private async createMaterial(
        data: SkinMaterialMetadata,
        source: MeshStandardMaterial,
        hasUv1: boolean,
        meshName: string,
        overlayUv: 0 | 1 | undefined = undefined
    ): Promise<MeshStandardMaterial | MeshBasicMaterial> {
        data = normalizeSkinMaterial(data)
        if (data.kind === "waterWave") {
            this.hasEffect = true
            const textures = Object.fromEntries(
                await Promise.all(
                    Object.entries(WATER_WAVE_TEXTURES).map(async ([slot, name]) => [
                        slot,
                        data.textures[slot] === undefined ? await this.waterTexture(name) : await this.dataTexture(data.textures[slot]),
                    ])
                )
            )
            const material = createWaterWaveMaterial(data, this.effectTime, textures, hasUv1)
            material.name = source.name
            return material
        }
        if (data.kind === "shadow") {
            const shadow = source.clone()
            shadow.depthWrite = false
            return shadow
        }
        const baseIndex = data.textures.时装BaseClor ?? data.textures.颜色贴图
        // 特效拖尾（`M_SimpleEffectTrail_SK` 一类，止流背后那两条飘带就是）：游戏里是叠加发光的
        // 拖尾，没有底图、没有法线，颜色全来自材质 `自发光颜色`。按普通材质走会渲染成一块不透明
        // 灰面（玩家一眼就能看出不对），所以单独走不受光的叠加混合，且不写深度、双面。
        if (isEffectMaterial(data)) {
            this.hasEffect = true
            return this.createEffectMaterial(data)
        }
        // 特效/装饰类材质没有染色底图（导出器退化成扁平色）：直接保留原始材质，
        // 走染色着色器会因为缺底图整只模型加载失败。
        if (baseIndex === undefined) return source
        // 贴图解码是装载里最重的一段（26 张 webp，串行 172ms / 并行 45ms）：
        // 先把用到的索引全部发起请求，再在各自位置 await，别让一张等一张。
        const normalIndex = data.textures.法线贴图
        const emitIndex = data.textures.自发光贴图
        const maskIndex = data.textures.混合贴图
        const dyeIndex = data.textures.时装BaseClor_2U
        const silkIndex = data.textures.丝绸混合贴图
        const decode = {
            base: this.dataTexture(baseIndex),
            normal: normalIndex === undefined ? undefined : this.dataTexture(normalIndex),
            emit: emitIndex === undefined ? undefined : this.dataTexture(emitIndex),
            mask: maskIndex === undefined ? undefined : this.dataTexture(maskIndex),
            dye: dyeIndex === undefined ? undefined : this.dataTexture(dyeIndex),
            silk: silkIndex === undefined ? undefined : this.dataTexture(silkIndex),
        }
        const base = await decode.base
        // 材质可带 `UVScale`（向量参数）：游戏用它把同一张贴图的另一块区域采到当前 UV 上，
        // 表情层 `M_Player_FaceExpres` 就是靠它从脸贴图里取眉毛/睫毛/嘴，
        // 不乘就会采到脸的皮肤区，渲染成嘴上一道白条、眼睛周围一圈白方片。
        const uvScale = data.vectors.UVScale
        const scaled = uvScale !== undefined && uvScale[0] !== 1
        // uv 会超出 [0,1]，必须重复采样；贴图是共享克隆，要单独复制一份再改 wrap。
        const wrap = (texture: Texture) => {
            if (!scaled) return texture
            const copy = texture.clone()
            copy.wrapS = RepeatWrapping
            copy.wrapT = RepeatWrapping
            copy.needsUpdate = true
            this.textures.add(copy)
            return copy
        }
        const baseMap = wrap(base)
        const normal = decode.normal === undefined ? new DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1) : await decode.normal
        normal.needsUpdate = true
        this.textures.add(normal)
        const emit = emitIndex === undefined ? base : wrap(await decode.emit!)
        const mask = maskIndex === undefined ? new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) : await decode.mask!
        mask.needsUpdate = true
        this.textures.add(mask)
        const vector = (name: string, fallback: LinearRgb = [1, 1, 1]) => new Vector3(...(data.vectors[name] ?? fallback))
        // 羽片（wing）按父材质名判定，翼片遮罩与 2U 染色分区两处都用它。
        const wingShader = (data.parent ?? "").includes("M_Player_Wing_ShopSkin")
        // Wing 着色器的染色分区存在 2U 槽的遮罩里（不是底图）：G=色号、R=权重，按 UV1 采样。
        // 材质没覆盖 2U 时用父材质的默认白图（G=1 → 6 号色、R=1 → 全覆盖），不能退回底图算法。
        // 模型没带 UV1（旧缓存）时退回底图 UV0 的近似算法，避免整片被压成 1 号色。
        const wingDye = wingShader && hasUv1
        const dyeMap =
            dyeIndex !== undefined
                ? await decode.dye!
                : (() => {
                      const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
                      white.needsUpdate = true
                      this.textures.add(white)
                      return white
                  })()
        const colorNames =
            data.kind === "hairPart"
                ? ["头饰染色1", "头饰染色2", "头饰染色3", "头饰染色1", "头饰染色2", "头饰染色3"]
                : data.kind === "hair"
                  ? ["头发染色1", "头发染色2", "头发染色3", "头发染色1", "头发染色2", "头发染色3"]
                  : Array.from({ length: 6 }, (_, i) => `染色${i + 1}`)
        const uniforms: Record<string, { value: any }> = {
            dnaBase: { value: baseMap },
            // 表情层卡片按 UV0 原样取色：脸贴图下缘那条（脸壳 UV 只用到 v≤0.744）是纯色色板，
            // 眉→蓝灰、上睫毛→近黑、唇→深棕、眼窝杯→近白（就是眼白）。乘 UVScale 会推出 [0,1]
            // 后 wrap 到皮肤区，整层变肉色，所以这一层的缩放取 1。UV1 是每岛退化的细长条，不取色。
            dnaUvScale: {
                value: new Vector2(
                    isExpressionOverlay(data) ? 1 : (uvScale?.[0] ?? 1),
                    isExpressionOverlay(data) ? 1 : (uvScale?.[1] ?? 1)
                ),
            },
            // 五官卡片用哪套 UV 取色：0=UV0（V11 材质，五官画在脸贴图下缘色板上），
            // 1=UV1（V14 材质，五官画在 UV1 指向的区域）。逐网格判定，见 pickFaceOverlayUv。
            dnaExprUv: { value: overlayUv ?? 0 },
            dnaNormal: { value: normal },
            dnaEmitMap: { value: emit },
            dnaMaskMap: { value: mask },
            dnaColors: { value: colorNames.map(name => vector(name)) },
            dnaEmission: { value: vector(data.kind === "hairPart" ? "头饰自发光染色" : "自发光颜色") },
            dnaDark: { value: vector("暗部颜色") },
            dnaLight: { value: vector("亮部颜色") },
            dnaFresnel: { value: data.scalars.菲涅尔指数 ?? 0.62 },
            dnaControl: { value: data.scalars[data.kind === "hairPart" ? "启用染色" : "整体控制"] ?? 1 },
            dnaEmissionStrength: { value: data.scalars.自发光强度 ?? 1 },
            dnaEmission2: { value: vector("自发光颜色02", data.vectors.自发光颜色 ?? [1, 1, 1]) },
            dnaEmission3: { value: vector("突破自发光", data.vectors.自发光颜色 ?? [1, 1, 1]) },
            // 缺少自发光贴图时必须彻底关掉该分支：退回用 base 会把整片 albedo 当自发光，
            // 配合 15+ 的强度会把羽片、袖纱压成发白的方块。
            dnaHasEmission: { value: emitIndex === undefined ? 0 : 1 },
            dnaWaterTailOpacity: { value: data.scalars.透明度 ?? 0.3 },
            dnaQuantize: { value: data.scalars.使用UV1 ?? 0 },
            dnaNormalStrength: { value: data.scalars.法线强度 ?? 1 },
            dnaHairSaturation: { value: data.scalars.FresnelAO_ColorPow === undefined ? 1.35 : 1.08 },
            // Hair_V10 基色的幂次来自材质，缺省 1 保持旧模型与染色遮罩兼容。
            dnaHairColorPow: { value: Math.max(0.01, data.scalars.FresnelAO_ColorPow ?? 1) },
            dnaHairAoRange: { value: new Vector2(data.scalars.FresnelAO_Smooth ?? 0, data.scalars.FresnelAO_Width ?? 1) },
            dnaHairAoTint: { value: vector("Fresnel_TintColor") },
            // 前向管线没有游戏的逐发簇间接光，用统一受光增益补偿，仍受 toon clamp 约束。
            dnaHairLightGain: { value: data.kind === "hair" || (data.parent ?? "").includes("M_Player_Hair") ? 1.6 : 1 },
            dnaDyeMap: { value: dyeMap },
            dnaWingDye: { value: wingDye ? 1 : 0 },
        }
        if (data.kind === "waterTail") {
            this.hasEffect = true
            const [mask, ripple, glow, stars] = await Promise.all([
                this.waterTexture("T_Baiheng_SP01_TailMask"),
                this.waterTexture("T_Water_N"),
                this.waterTexture("T_TranGlow"),
                this.waterTexture("T_Noise03"),
            ])
            const glowUv = data.vectors.LiquidGlowUV ?? [5, -6, 0]
            Object.assign(uniforms, {
                dnaWaterTime: this.effectTime,
                dnaTailMask: { value: mask },
                dnaTailRipple: { value: ripple },
                dnaTailGlow: { value: glow },
                dnaTailStars: { value: stars },
                dnaTailGlowUv: { value: new Vector4(glowUv[0], glowUv[1], glowUv[2], 0.3) },
                dnaTailTint: { value: vector("尾巴染色", [3.0208333, 3.7237515, 4]) },
                dnaTailGlowWidth: { value: data.scalars.流光寬度 ?? 1 },
                dnaTailGlowGain: { value: data.scalars.流光颜色亮度 ?? 1 },
                dnaTailNormalTiling: { value: data.scalars.叠加法线Till ?? 2 },
                dnaTailNormalStrength: { value: data.scalars.LiquidNormalRG_Strength ?? 0.2 },
            })
        }
        // 卡通光照（P1）：游戏是延迟光照里按 ramp 图集把 albedo 乘成亮/暗两带。
        // - 行号来自材质 `RampRow` 标量；`SV_Target_2.x` 的材质默认值就是它（皮肤 6.5/256、
        //   头发 27、脸 1.5/256），导出器已经把 scalars 一起带下来了。
        // - 横轴 = min(halfLambert(N·L), halfLambert(N·V))，见 specs/skin-toon-render.md §5.2。
        // - 眼睛是 unlit（shading model id 12），不参与；shadow 在上面已提前返回。
        const hairMaterial = isHairMaterial(data, meshName)
        const waterTail = data.kind === "waterTail"
        const toon = data.kind !== "eye" && !waterTail
        // 行号即 V 坐标：游戏直接拿 `GBufferB.x` 当 V 采样（`(RampRow + 0.5) / 256` 正好是行中心）。
        // 但材质自带的 RampRow 可能指向图集里的装饰行（头发 27 就是），那种行不是明暗曲线，
        // 用了会把整片头发压成黑色，所以只有落在有效行上才采用。
        // 头发例外：它走 case 13，只在固定的 u=0.5 采样一次（见下面的 dnaHairRamp），
        // 碰不到装饰行右端的黑段，所以声明了哪行就用哪行——菲娜头发声明 27，
        // x=0.5 处是 0.5 灰，正好是发色的压暗量；强制走 0 行会让整头偏亮。
        const declaredRow = data.scalars.RampRow
        const row = hairMaterial
            ? declaredRow !== undefined
                ? Math.round(declaredRow)
                : defaultRampRow(data)
            : declaredRow !== undefined && !INVALID_RAMP_ROWS.has(Math.round(declaredRow))
              ? Math.round(declaredRow)
              : defaultRampRow(data)
        const rampRow = toon ? (row + 0.5) / 256 : 0
        if (toon) {
            uniforms.dnaToonRamp = { value: this.rampTexture() }
            uniforms.dnaRampRow = { value: rampRow }
            // 亮带乘子上限：游戏 case 14 里对 albedo*ramp 硬 clamp 到 0.86
            uniforms.dnaToonClamp = { value: 0.86 }
            // 原版对布料类走 case 14 的收尾曲线；头发/皮肤另有专门分支（Kajiya-Kay / case 5），
            // 我们还没还原那两套，先只对布料开启，避免把发色和肤色压暗。
            // 主光颜色（线性）：实机白区 B/R = 1.07（规格 §5.2），保持这个比例即可；
            // 之前取 (0.90, 0.94, 1.10) 是 B/R = 1.22，纯黑染成 (16,16,20)、白布发紫都出在这儿。
            uniforms.dnaToonLightColor = { value: new Vector3(0.96, 0.99, 1.03) }
            // 布料走原版 case 14 的横轴/行内映射/收尾曲线；皮肤与头发另有分支（case 5 / Kajiya-Kay）
            uniforms.dnaClothTone = { value: isClothToneMaterial(data) ? 1 : 0 }
            uniforms.dnaHairRamp = { value: hairMaterial ? 1 : 0 }
            // 收尾曲线的总强度 = 1/π × 主光强度 × 受光增益（原版 `_5403`）。
            // 1/π 已并在下面的公式外，这里是标定值：按参考图子不语外套实测 a 中位 0.21 时应落在 sRGB 约 200。
            uniforms.dnaToneScale = { value: 1.7 }
            // 天空/环境光（线性）：原版 `_5913`，场景常量，整只模型同一份
            // 天空项保持中性：B 单独高一档（0.09 vs 0.08）时，纯黑染色会被抬成 (16,16,20) 的紫黑
            uniforms.dnaToonSky = { value: new Vector3(0.085, 0.085, 0.085) }
            uniforms.dnaToonOn = { value: 1 }
            // 皮肤次表面：暗部补一层暖色散射，见 §5.2 末尾的 SSS 近似
            uniforms.dnaToonSkin = { value: isSkinMaterial(data, meshName) ? 1 : 0 }
            uniforms.dnaSkinShadow = { value: data.kind === "stocking" || (data.parent ?? "").includes("M_Player_Skin") ? 1 : 0 }
            // 布料收尾曲线已含高光，头发使用固定 ramp；叠加 GGX 会冲淡染色与暗部。
            uniforms.dnaToonSpec = { value: isSkinMaterial(data, meshName) || hairMaterial || isClothToneMaterial(data) ? 0 : 1 }
            uniforms.dnaToonLightDir = { value: this.toonLightDir }
        }
        const eye = data.kind === "eye"
        // 虹膜在图集每格内的位置由导出器从贴图量得（圆心 xy、外缘半径 z、瞳孔半径 w）。
        // 每个角色的瞳孔形状都不同（圆形/竖缝/星芒），所以不能写死某一张贴图的数值。
        const atlas = data.eyeAtlas
        uniforms.dnaEyeAtlas = {
            value: new Vector4(atlas?.center?.[0] ?? 0.5, atlas?.center?.[1] ?? 0.5, atlas?.radius ?? 0.4785, atlas?.pupil?.radius ?? 0),
        }
        const silk = data.kind === "packed" && silkIndex !== undefined
        // 游戏丝绸的 `_Aniso_M` 与 three 的 anisotropyMap 同口径：RG 是切空间方向、B 是强度。
        const silkMap = silkIndex === undefined ? undefined : await decode.silk!
        // 丝绸剪影只存在于需要透出皮肤层的身体网格：帽子的底图 B 是各向异性遮罩，
        // 按剪影裁 alpha 会在帽檐上挖出大片空洞。
        const silkCutout = !/hat/i.test(meshName)
        // 能量层（贴身能量衣/纹身纹路）同样用底图 B 作剪影：B 为 0 处游戏里透空，露出皮肤。
        // 混合贴图 R 是灰度覆盖图，墨迹浓淡与半透明感都来自它，不能二值化。
        const energyCutout = silkCutout && data.kind === "packed" && (data.parent ?? "").includes("M_Player_Energy_ShopSkin")
        // 半透明丝绸（SilkTran：贴身薄纱、纱裙）和皮肤只差 0.2~0.6mm，游戏里是透明度混合的薄纱。
        // 按剪影硬裁会让整片纱压住皮肤和白色衬衣（染色后远看只剩一片色块），掠射角还会和皮肤
        // 互相遮挡闪成噪点；这里改走 alpha 混合，不透明度取底图 B 的布料覆盖率并整体压低。
        const silkTran = silkCutout && data.kind === "packed" && (data.parent ?? "").includes("M_Player_SilkTran_ShopSkin")
        // 羽片是卡片网格，真实剪影只写在底图 B 通道（alpha 恒为 1）；游戏 Wing 着色器用它做不透明遮罩，
        // 直接采样 alpha 会把整张卡片渲染成硬边矩形。
        const wingMask = !silk && wingShader
        // 公告板卡片同理：packed 版把珠子/花瓣的剪影写在底图 B（alpha 恒为 1），
        // 只有 base 版（SP15）用 alpha 通道。取错通道就是整块不透明方片，或整条链子消失。
        const billboardMask = data.kind === "packed" && (data.parent ?? "").includes("M_Player_Billboard")
        // 表情层是贴合脸皮的卡片：按贴图 alpha 做 alphaTest 会把它切成半透的灰带
        // （看起来能透过去看后面的皮肤），整层走不透明。
        const expression = isExpressionOverlay(data)
        const common = {
            name: source.name,
            map: base,
            normalMap: normal,
            // 顶点色在游戏里是遮罩（丝袜/自发光分区），不参与 albedo 相乘。
            vertexColors: false,
            metalness: data.scalars.金属度 ?? 0,
            // 薄纱走灰度 alpha 混合：保留 alphaTest 会把墨迹、纱网硬切成洞。
            alphaTest: silkTran || expression || waterTail ? 0 : energyCutout ? 0.33 : source.alphaTest,
            // 皮肤网格的躯干/上臂三角形绕序与腿部相反，单面剔除会把胸口、上臂整片裁掉。
            side: data.kind === "stocking" ? DoubleSide : source.side,
            transparent: source.transparent || silkTran || waterTail,
            forceSinglePass: waterTail || source.forceSinglePass,
            depthWrite: !silkTran && !waterTail,
            // 能量层/薄纱整体只比皮肤高零点几毫米，远景深度精度不足时会和皮肤互相遮挡闪成噪点；
            // 用多边形偏移把整层朝相机提一点，稳定压住皮肤。
            polygonOffset: energyCutout || silkTran,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
        }
        // 眼睛是贴在脸上的薄壳：底图 alpha 全为 1，但游戏里它必须压过脸部皮肤，否则眼白会被
        // 脸部网格的深度遮住。eye 走不透明渲染并给一点负向偏移，保证在脸前面。
        if (eye) {
            common.transparent = false
            common.alphaTest = 0
            common.depthWrite = true
            common.polygonOffset = true
            common.polygonOffsetFactor = -1
            common.polygonOffsetUnits = -1
        }
        // 丝绸是布料：游戏靠各向异性高光给布面光泽，直接上白色 sheen 会在帽檐这种大平面上
        // 变成一整片银白反射。改用游戏自己的 Aniso 贴图做各向异性，sheen 只留一点布面柔光。
        const material: MeshStandardMaterial = silk
            ? new MeshPhysicalMaterial({
                  ...common,
                  roughness: 0.5,
                  sheen: 0.2,
                  sheenRoughness: 0.5,
                  sheenColor: 0xf4f7ff,
                  specularIntensity: data.scalars.AnisotropySpecularScale ?? 0.5,
                  anisotropy: data.scalars.Anisotropy ?? 0,
                  ...(silkMap ? { anisotropyMap: silkMap } : {}),
              })
            : new MeshStandardMaterial({
                  ...common,
                  roughness: data.kind === "stocking" ? 0.55 : 0.8,
              })
        material.userData.dnaColorize = data
        // 远景下 alphaTest 的硬边缘会随相机移动闪成噪点：交给 MSAA 做覆盖率平滑（alpha-to-coverage），
        // 只对不透明材质启用；半透明/能量层的 alphaTest 已关掉。
        material.alphaToCoverage = this.msaa && material.alphaTest > 0 && !material.transparent
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms)
            shader.vertexShader = `attribute vec4 dnaMask; attribute vec2 uv1; attribute vec2 dnaEyeUv; attribute vec2 dnaCardCorner;
uniform vec2 dnaUvScale;
varying vec2 vDnaUv; varying vec2 vDnaUv1; varying vec2 vDnaEyeUv; varying float vDnaStocking; varying float vDnaVertexAlpha;
${shader.vertexShader}`.replace(
                "#include <uv_vertex>",
                // 顶点色是游戏里的分区遮罩（G=丝袜覆盖），不是 albedo 相乘项；用平滑过渡避免 UV 岛边界硬边。
                `#include <uv_vertex>
vDnaUv = uv * dnaUvScale; vDnaUv1 = ${waterTail && !hasUv1 ? "uv" : "uv1"}; vDnaEyeUv = dnaEyeUv; vDnaStocking = smoothstep(0.15, 0.85, dnaMask.g);
vDnaVertexAlpha = dnaMask.a;`
            )
            let map =
                "vec4 dnaSample = texture2D(dnaBase, mix(vDnaUv, vDnaUv1, dnaExprUv)); diffuseColor *= vec4(dnaLinear(dnaSample.rgb), dnaSample.a);"
            if (data.kind === "packed" || data.kind === "weapon")
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                ${wingMask || billboardMask ? "dnaSample.a = dnaSample.b;" : ""}
                vec3 dnaDyed = dnaWingDye > 0.5
                    ? dnaWing(dnaSample.rgb, texture2D(dnaDyeMap, vDnaUv1))
                    : dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));
                ${energyCutout ? "dnaSample.a *= dnaSample.b * texture2D(dnaMaskMap, vDnaUv).r;" : ""}
                diffuseColor *= vec4(dnaDyed, dnaSample.a);`
            if (data.kind === "packed" && data.textures.丝绸混合贴图 !== undefined)
                map = `
                vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                ${
                    silkTran
                        ? `vec3 dnaSilk = mix(
                    vec3(dnaLinear1(dnaSample.r)),
                    dnaSample.r * dnaRamp(dnaZone(dnaSample.g)),
                    smoothstep(0.45, 0.8, texture2D(dnaMaskMap, vDnaUv).g)
                );`
                        : "vec3 dnaSilk = dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));"
                }
                diffuseColor.rgb = dnaSilk;
                ${silkCutout ? (silkTran ? "diffuseColor.a *= dnaSample.b * 0.55;" : "diffuseColor.a *= smoothstep(0.08, 0.25, dnaSample.b);") : ""}
                `
            if (data.kind === "weapon")
                map =
                    "vec4 dnaSample = texture2D(dnaBase, vDnaUv); vec4 dnaMaskSample = texture2D(dnaMaskMap, vDnaUv); diffuseColor *= vec4(dnaWeapon(dnaSample.rgb, vec3(dnaMaskSample.g)), dnaSample.a);"
            if (data.kind === "hair")
                // 底图是染色权重，不是 albedo；颜色修正在所有头发分支汇合后只做一次。
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                vec3 dnaHair = dnaSample.r * dnaColors[0] + dnaSample.g * dnaColors[1] + dnaSample.b * dnaColors[2];
                diffuseColor *= vec4(dnaHair, dnaSample.a);`
            if (data.kind === "hairPart")
                map = "vec4 dnaSample = texture2D(dnaBase, vDnaUv); diffuseColor *= vec4(dnaPart(dnaSample.rgb), dnaSample.a);"
            if (waterTail)
                // WaterTail 主 PS（78592_f3）：固定六段色带 × R，法线 B 混合，随后做 1.1/-0.05 对比度修正。
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                float dnaTailWeight = dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb);
                diffuseColor.rgb = clamp(dnaPacked(dnaSample.rgb, dnaTailWeight) * 1.1 - 0.05, 0.0, 1.0);
                diffuseColor.a = mix(1.0, dnaSample.b, dnaTailWeight) * dnaWaterTailOpacity;`
            if (eye)
                // 眼球是一颗球：底图 UV0 只覆盖巩膜，虹膜花纹在 UV1 上（游戏 PS 用 TEXCOORD.zw 采样）。
                // 旧导出包没有 UV1 时用 eyeUv() 按仿射补出的 dnaEyeUv。
                map = `vec4 dnaIris = texture2D(dnaBase, vDnaEyeUv);
                diffuseColor *= vec4(dnaLinear(dnaIris.rgb), dnaIris.a);`
            // 头发的遮挡来自**混合贴图 R**，不是底图 alpha：反编译 `M_Player_Hair_Tint` 主 PS，
            // 底图 alpha（`T26.w`）只进 `_598` 当着色混合权重，真正决定 discard 的是
            // `T25` 的 R 通道（`_403` → `_440` → `mad(..., -0.3333) < 0`）。
            // 拿底图 alpha 裁剪（它其实是发丝深度/长度图）会在头顶挖出成片空洞；
            // 材质没覆盖混合贴图时父材质给的是白图 → 阈值恒过，游戏里头发就是一整块实体。
            if (hairMaterial && !expression)
                map += `
                diffuseColor.a = texture2D(dnaMaskMap, vDnaUv).r;`
            // base / hair / hairPart 共用颜色修正，避免染色头发重复增加饱和度。
            if (hairMaterial && !expression)
                map += `
                float dnaHairLum2 = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                diffuseColor.rgb = max(mix(vec3(dnaHairLum2), diffuseColor.rgb, dnaHairSaturation), 0.0);`
            shader.fragmentShader =
                COMMON_SHADER +
                shader.fragmentShader.replace("#include <map_fragment>", map).replace(
                    "#include <normal_fragment_maps>",
                    `
                    vec4 dnaNormalSample = texture2D(dnaNormal, vDnaUv);
                    vec2 dnaXY = dnaNormalSample.rg * 2.0 - 1.0;
                    dnaXY *= dnaNormalStrength;
                    vec3 dnaN = normalize(vec3(dnaXY, sqrt(max(0.0, 1.0 - dot(dnaXY, dnaXY)))));
                    ${
                        waterTail
                            ? `vec2 dnaRippleXY = texture2D(dnaTailRipple, vDnaUv * dnaTailNormalTiling + vec2(0.0, dnaWaterTime * -0.1)).rg * 2.0 - 1.0;
                    dnaN = normalize(dnaN + vec3(dnaRippleXY * dnaTailNormalStrength, 0.0));`
                            : ""
                    }
                    normal = normalize(tbn * dnaN);
                `
                )
            if (data.kind === "stocking")
                // 混合贴图 B 是丝袜/编织的覆盖遮罩（G 只是覆盖区内的花纹；只按 G 判定会把裸露皮肤压成暗部色），
                // R 是编织层 AO 凹缝、只在覆盖区里衰减亮度；覆盖区外保留底图颜色，避免脸和身体肤色对不上。
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    `
                    float dnaNV = max(dot(normal, normalize(vViewPosition)), 0.0);
                    float dnaFacing = clamp(1.0 - (pow(max(1.0 - dnaNV, 0.0001), dnaFresnel) * 1.27 - 0.27), 0.0, 1.0);
                    dnaFacing = min(dnaFacing, ${data.scalars.高光范围 ?? 0.08});
                    vec4 dnaKnitSample = texture2D(dnaMaskMap, vDnaUv);
                    float dnaCoverage = smoothstep(0.35, 0.55, dnaKnitSample.b);
                    float dnaPattern = smoothstep(0.62, 0.9, dnaKnitSample.g) * dnaCoverage;
                    vec3 dnaStock = diffuseColor.rgb * mix(dnaLight, dnaDark, max(dnaFacing, dnaPattern));
                    dnaStock *= mix(vec3(1.0), vec3(dnaKnitSample.r), vDnaStocking * dnaCoverage);
                    diffuseColor.rgb = mix(diffuseColor.rgb, dnaStock, vDnaStocking * dnaControl * dnaCoverage);
                `
                )
            else if (eye) {
                // 眼睛是 unlit 材质：游戏 PS 全片没有 N·L / BRDF，最终色由贴图亮度直接驱动，
                // 走 PBR 会被场景灯照成一片死白。下面四支的系数按参考图与贴图分区取色的
                // 中位色拟合，七区整体残差 RMS 约 9.6 级 sRGB（最大 19）。
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        "#include <emissivemap_fragment>",
                        `
                    vec4 dnaEyeTex = texture2D(dnaBase, vDnaEyeUv);
                    vec3 dnaEyeBase = dnaLinear(dnaEyeTex.rgb);
                    vec3 dnaEyeSclera = dnaEyeBase * 1.06 * vec3(1.06, 0.97, 0.95);
                    if (vDnaEyeUv.x >= 2.0) {
                        totalEmissiveRadiance = dnaEyeSclera;
                    } else {
                    float dnaEyeLum = dot(dnaEyeBase, vec3(0.3, 0.59, 0.11));
                    vec2 dnaEyeC = vec2(fract(vDnaEyeUv.x), vDnaEyeUv.y) - dnaEyeAtlas.xy;
                    float dnaEyeR = length(dnaEyeC) / dnaEyeAtlas.z;
                    vec3 dnaEyeIris = dnaEyeBase * (1.445 - 0.593 * dnaEyeLum * dnaEyeLum) * vec3(1.06, 0.95, 0.99);
                    dnaEyeIris *= mix(1.0, 0.60, smoothstep(0.78, 0.88, dnaEyeR) * (1.0 - smoothstep(1.00, 1.08, dnaEyeR)));
                    float dnaEyeDark = 1.0 - clamp(dnaEyeLum / 0.54, 0.0, 1.0);
                    float dnaEyePupil = smoothstep(0.30, 0.60, dnaEyeDark) * (1.0 - smoothstep(0.55, 0.85, dnaEyeR));
                    dnaEyeIris *= 1.0 - 0.90 * dnaEyePupil;
                    dnaEyeIris *= mix(0.20, 0.81, smoothstep(0.12, 0.50, 0.5 + 0.5 * dnaEyeC.y / dnaEyeAtlas.z));
                    totalEmissiveRadiance = mix(dnaEyeSclera, dnaEyeIris, 1.0 - smoothstep(0.98, 1.10, dnaEyeR));
                    }
                `
                    )
                    .replace(
                        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                        "vec3 outgoingLight = totalEmissiveRadiance;"
                    )
            } else if (waterTail) {
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        "#include <emissivemap_fragment>",
                        `
                    vec3 dnaWaterMask = texture2D(dnaTailMask, vDnaUv).rgb;
                    float dnaWaterRim = smoothstep(0.0, 1.2, 1.0 - abs(dot(normal, normalize(vViewPosition))));
                    vec2 dnaFlowUv = vDnaUv * dnaTailGlowUv.xy + dnaWaterTime * dnaTailGlowUv.zw + dnaRippleXY * dnaTailNormalStrength;
                    vec3 dnaFlowNoise = texture2D(dnaTailGlow, dnaFlowUv).rgb;
                    float dnaFlowBand = pow(max(dnaFlowNoise.r, 0.0), dnaTailGlowWidth);
                    vec3 dnaFlow = dnaFlowBand * vec3(0.24305533, 0.40509185, 0.72916669) * dnaTailGlowGain * (1.0 + dnaFlowNoise.g);
                    vec3 dnaStars = dnaLinear(texture2D(dnaTailStars, vDnaUv1 * 7.0 + vec2(0.0, dnaWaterTime * 0.1)).rgb);
                    totalEmissiveRadiance = diffuseColor.rgb + dnaWaterMask.g * 3.0
                        + (1.0 - dnaWaterMask.b) * dnaWaterRim * dnaTailTint
                        + dnaFlow * (0.2 + 0.8 * max(dot(normal, normalize((viewMatrix * vec4(-3.0, 5.0, 4.0, 0.0)).xyz)), 0.0)) * 2.0
                        + dnaWaterMask.r * dnaStars * 50.0;
                    `
                    )
                    .replace(
                        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                        "vec3 outgoingLight = totalEmissiveRadiance;"
                    )
            } else
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    // 自发光贴图本身就是**带颜色的**发光图（实测有颜色的亮像素占 100%，例：芙罗拉胸口的槽是红色
                    // 90/5/6、染 7 号色是青色）。只取 R 当标量就等于把贴图颜色丢掉、让 7 号色原样铺满，
                    // 红色槽位会被染成整块青色。这里取 RGB 再乘 7 号色：灰底（遮罩式）贴图结果不变。
                    `vec3 dnaEmitSample = dnaLinear(texture2D(dnaEmitMap, vDnaUv).rgb);
            totalEmissiveRadiance += (dnaEmitSample.r * dnaEmission + dnaEmitSample.g * dnaEmission2 + dnaEmitSample.b * dnaEmission3) * dnaEmissionStrength * dnaHasEmission;
            `
                )
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <roughnessmap_fragment>",
                `
                    float roughnessFactor = roughness;
                    ${data.kind === "stocking" ? `roughnessFactor = mix(roughnessFactor, ${data.scalars.丝袜粗糙度 ?? 0.75}, vDnaStocking);` : ""}
                `
            )
            if (toon)
                // 卡通光照：把 PBR 的四个光照分量整个换掉。
                // 游戏的 albedo 是「未光照基色」，而 three 的 diffuseColor 在 map_fragment 之后正好是它，
                // 所以这里只用 diffuseColor，不再叠加任何间接光（否则等于把环境光算两遍）。
                // 几何阴影在这里显式合成；AO 和 tonemapping 保留原通路。
                //
                // 原版：01701_f3 的 case 14 收尾（布料）、case 13 直通（头发）、case 12 unlit（眼睛）。
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <lights_fragment_end>",
                    `#include <lights_fragment_end>
                    if (dnaToonOn > 0.5) {
                        float dnaShadow = getShadowMask();
                        vec3 dnaToonV = normalize(vViewPosition);
                        vec3 dnaToonL = normalize((viewMatrix * vec4(dnaToonLightDir, 0.0)).xyz);
                        float dnaHalfL = dot(normal, dnaToonL) * 0.5 + 0.5;
                        float dnaHalfV = dot(normal, dnaToonV) * 0.5 + 0.5;
                        float dnaBand = clamp(min(dnaHalfL, dnaHalfV), 0.0, 1.0);
                        if (dnaClothTone > 0.5) dnaBand = clamp(dot(normal, dnaToonL), 0.0, 1.0);
                        float dnaRampX = dnaBand;
                        if (dnaHairRamp > 0.5) dnaRampX = 0.5;
                        vec3 dnaRampRgb = texture2D(dnaToonRamp, vec2(dnaRampX, dnaRampRow)).rgb;
                        vec3 dnaSurface = diffuseColor.rgb;
                        if (dnaHairRamp > 0.5) {
                            float dnaHairFacing = clamp((dot(normal, dnaToonV) - dnaHairAoRange.x) / max(dnaHairAoRange.y - dnaHairAoRange.x, 1e-4), 0.0, 1.0);
                            dnaHairFacing = dnaHairFacing * dnaHairFacing * (3.0 - 2.0 * dnaHairFacing) * texture2D(dnaBase, vDnaUv).a;
                            vec3 dnaHairAo = pow(max(dnaSurface, vec3(0.0)), vec3(dnaHairColorPow)) * dnaHairAoTint;
                            dnaSurface = mix(dnaHairAo, dnaSurface, dnaHairFacing);
                        }
                        vec3 dnaA = min(dnaSurface * dnaRampRgb * (dnaHairRamp > 0.5 ? dnaHairLightGain : 1.0), vec3(dnaToonClamp));
                        vec3 dnaToon = dnaA;
                        if (dnaClothTone > 0.5) {
                            float dnaLuma = max(dot(dnaA, vec3(0.299, 0.587, 0.114)), 1e-4);
                            float dnaShape = dnaLuma * (0.6 + dnaLuma * (dnaLuma * 1.5 - 0.35)) + 0.35;
                            float dnaSpec = (dnaLuma * 59.0 + sqrt(max(9.0 - dnaLuma * dnaLuma * 10127.0 + dnaLuma * 13702.0, 0.0)) - 3.0) / max(502.0 - dnaLuma * 486.0, 1.0);
                            float dnaLit = clamp(dnaBand, 0.0, 1.0);
                            float dnaBoost = 1.0 + 1.2 * dnaLit * dnaLit * (3.0 - 2.0 * dnaLit);
                            dnaToon *= ((0.5 * dnaShape * sqrt(dnaLuma) + 0.5 * max(dnaSpec, 0.0)) * dnaToneScale * dnaBoost) / dnaLuma;
                        }
                        dnaToon *= dnaToonLightColor;
                        if (dnaClothTone > 0.5) dnaToon += dnaToonSky * dnaBand;
                        if (dnaHairRamp > 0.5) {
                            float dnaHairMask = smoothstep(0.42, 0.58, dnaBand);
                            dnaToon *= mix(0.6, 1.35, dnaHairMask);
                            // Kajiya-Kay 窄高光：切空间副切线沿发丝，底图 alpha × 混合图 B 控制强度。
                            vec3 dnaHairHalf = normalize(dnaToonL + dnaToonV);
                            float dnaHairTH = dot(normalize(tbn[1]), dnaHairHalf);
                            float dnaHairSheen = pow(max(1.0 - dnaHairTH * dnaHairTH, 0.0), 48.0);
                            float dnaHairSpecMask = texture2D(dnaBase, vDnaUv).a * texture2D(dnaMaskMap, vDnaUv).b;
                            dnaToon += mix(dnaSurface, vec3(1.0), 0.35) * dnaHairSheen * dnaHairSpecMask * 0.22 * dnaShadow;
                        }
                        if (dnaToonSkin > 0.5) {
                            float dnaSssWrap = clamp((dot(normal, dnaToonL) + 0.35) / 1.35, 0.0, 1.0);
                            dnaToon += diffuseColor.rgb * vec3(1.0, 0.55, 0.42) * (1.0 - dnaSssWrap) * 0.35;
                        }
                        if (dnaSkinShadow > 0.5) {
                            // ramp 已含暖色，实机暗/亮比只作补偿目标，避免重复压暗。
                            float dnaSkinShadowWeight = 0.22 * (1.0 - smoothstep(0.45, 0.75, dnaBand));
                            dnaToon *= mix(vec3(1.0), vec3(0.97, 0.42, 0.36), dnaSkinShadowWeight);
                            dnaToon.r *= 1.08;
                        }
                        vec3 dnaShadowTint = vec3(0.55, 0.5, 0.58);
                        if (dnaToonSkin > 0.5) dnaShadowTint = dnaSkinShadow > 0.5 ? vec3(0.99, 0.88, 0.82) : vec3(1.0);
                        if (dnaHairRamp > 0.5) {
                            float dnaHairMax = max(max(dnaSurface.r, dnaSurface.g), max(dnaSurface.b, 1e-4));
                            dnaShadowTint = mix(vec3(0.35), pow(clamp(dnaSurface / dnaHairMax, 0.0, 1.0), vec3(1.5)), 0.7);
                        }
                        dnaToon *= mix(dnaShadowTint, vec3(1.0), dnaShadow);
                        reflectedLight.directDiffuse = dnaToon;
                        reflectedLight.indirectDiffuse = vec3(0.0);
                        reflectedLight.directSpecular *= dnaToonSpec;
                        reflectedLight.indirectSpecular *= dnaToonSpec;
                    }`
                )
            if (toon)
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <shadowmap_pars_fragment>",
                    "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>"
                )
        }
        // 剪裁开关会进着色器源码，同一份材质元数据在帽子与身体上必须编译成两个程序。
        material.customProgramCacheKey = () => `dna-${JSON.stringify(data)}-${silkCutout ? 1 : 0}-${energyCutout ? 1 : 0}`
        material.userData.dnaUniforms = uniforms
        this.dyeMaterials.push({ metadata: data, uniforms })
        return material
    }

    setColors(ids: number[], hairIds: number[] = []) {
        if (!this.metadata || this.disposed) return
        for (const { metadata: data, uniforms } of this.dyeMaterials) {
            const fallback = (name: string): LinearRgb => data.vectors[name] ?? [1, 1, 1]
            if (data.kind === "packed" && data.role !== "weapon") {
                uniforms.dnaColors.value.forEach((color: Vector3, i: number) =>
                    color.set(...resolveSkinModelColor(this.metadata!, ids, i + 1, fallback(`染色${i + 1}`)))
                )
            }
            if (data.kind === "weapon") {
                uniforms.dnaColors.value[0].set(...resolveSkinModelColor(this.metadata, ids, 9, fallback("染色1")))
                uniforms.dnaColors.value.slice(1).forEach((color: Vector3, index: number) => color.set(...fallback(`染色${index + 2}`)))
            }
            uniforms.dnaEmission.value.set(...fallback(data.kind === "hairPart" ? "头饰自发光染色" : "自发光颜色"))
            if (data.kind === "packed") {
                uniforms.dnaEmission.value.set(...resolveSkinModelColor(this.metadata, ids, 7, fallback("自发光颜色")))
            }
            uniforms.dnaDark.value.set(...resolveSkinModelColor(this.metadata, ids, 8, fallback("暗部颜色")))
            uniforms.dnaFresnel.value = resolveSkinModelFresnel(this.metadata, ids, data.scalars.菲涅尔指数 ?? 0.62)
            if (data.kind === "hair" || data.kind === "hairPart") {
                const dye = resolveHairModelDye(this.metadata, hairIds, {
                    hair: [fallback("头发染色1"), fallback("头发染色2"), fallback("头发染色3")],
                    hairPart: [fallback("头饰染色1"), fallback("头饰染色2"), fallback("头饰染色3")],
                    hairPartEmission: fallback("头饰自发光染色"),
                })
                const colors = data.kind === "hair" ? dye.hair : dye.hairPart
                colors.forEach((color, index) => uniforms.dnaColors.value[index].set(...color))
                if (data.kind === "hairPart") uniforms.dnaEmission.value.set(...dye.hairPartEmission)
            }
        }
        for (const effect of this.effectMaterials) {
            effect.material.color.setRGB(...resolveSkinModelColor(this.metadata, ids, 7, effect.fallback))
        }
        this.invalidate()
    }

    resetCamera() {
        const tanV = Math.tan((this.camera.fov * Math.PI) / 360)
        const aspect = Math.max(this.camera.aspect, 0.01)
        // 相机可绕 Y 轴转，水平方向用 xz 半径（而不是当前朝向的投影宽），侧视才不会裁掉。
        // 边距按「到最近表面」留 20%：角色本身有厚度，按中心距离算前胸/头发会占掉几个百分点。
        this.distance = Math.max(this.fit.halfHeight / tanV, this.fit.radiusXZ / (tanV * aspect)) * 1.2
        this.controls.target.copy(this.center)
        this.camera.position.copy(this.center)
        this.camera.position.z += this.distance
        this.controls.update()
        this.invalidate()
    }

    setVisible(visible: boolean) {
        this.visible = visible
        if (visible) {
            if (this.playing) this.startLoop()
            else this.invalidate()
        } else if (this.request) {
            cancelAnimationFrame(this.request)
            this.request = 0
            this.lastFrame = 0
        }
    }

    /** 播放 Armory 展示待机（动作幅度比战斗待机大得多），循环播放。 */
    private play() {
        if (!this.mixer || !this.actions.length) return
        const entry = this.actions.find(item => item.name.endsWith("_Armory_Idle")) ?? this.actions[0]
        this.mixer.stopAllAction()
        entry.action.reset()
        entry.action.setLoop(LoopRepeat, Infinity)
        entry.action.clampWhenFinished = false
        entry.action.play()
        this.playing = true
        this.startLoop()
    }

    private disposeModel(model: Object3D) {
        // 骨骼矩阵贴图（Skeleton.boneTexture）由 three 在首次绘制时懒创建，多边形里看不到，
        // 只 dispose 几何/材质会在每次换模型时漏掉一组（实测 8/24/32/64px 四张）。
        const skeletons = new Set<Skeleton>()
        model.traverse(object => {
            if (object instanceof SkinnedMesh) skeletons.add(object.skeleton)
            if (!(object instanceof Mesh)) return
            object.geometry.dispose()
            object.customDepthMaterial?.dispose()
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                for (const value of Object.values(material)) if (value instanceof Texture) this.textures.add(value)
                material.dispose()
            }
        })
        for (const skeleton of skeletons) skeleton.dispose()
        for (const texture of this.textures) texture.dispose()
        this.textures.clear()
        this.textureClones.clear()
    }

    dispose() {
        this.disposed = true
        this.mixer?.stopAllAction()
        this.mixer = undefined
        this.actions = []
        cancelAnimationFrame(this.request)
        this.observer.disconnect()
        document.removeEventListener("visibilitychange", this.visibility)
        this.controls.dispose()
        if (this.model) this.disposeModel(this.model)
        for (const texture of this.sceneTextures) texture.dispose()
        this.sceneTextures.clear()
        this.waterTextureClones.clear()
        this.ramp = undefined
        this.outlineTarget?.dispose()
        this.outlineMaterial?.dispose()
        this.outlineScene?.traverse(object => {
            if (object instanceof Mesh) object.geometry.dispose()
        })
        this.outlineTarget = undefined
        this.outlineMaterial = undefined
        this.outlineScene = undefined
        this.renderer.dispose()
        this.toonKey.shadow.dispose()
        this.renderer.domElement.remove()
        this.dyeMaterials = []
        this.effectMaterials = []
    }
}
