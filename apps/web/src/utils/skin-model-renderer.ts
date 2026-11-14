import {
    AnimationMixer,
    Box3,
    BufferAttribute,
    type BufferGeometry,
    DataTexture,
    DirectionalLight,
    DoubleSide,
    EquirectangularReflectionMapping,
    HemisphereLight,
    LoopRepeat,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    NoColorSpace,
    type Object3D,
    PerspectiveCamera,
    PMREMGenerator,
    Scene,
    SkinnedMesh,
    Sphere,
    SRGBColorSpace,
    Texture,
    Vector3,
    Vector4,
    WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
    eyeUvChannelFromParent,
    type LinearRgb,
    resolveHairModelDye,
    resolveSkinModelColor,
    resolveSkinModelFresnel,
    type SkinMaterialMetadata,
    type SkinModelMetadata,
    swatchTable,
    validateSkinModelMetadata,
} from "./skin-model"

/** 数据包里的色板表，转成渲染器要的索引表；发布包与本地 GLB 都不再内嵌色板。 */
async function dyeSwatches(): Promise<Record<string, { linear: LinearRgb; fresnel?: number }>> {
    const { skinColorizeSwatches } = await import("@/data/d/skin-colorize.data")
    return swatchTable(skinColorizeSwatches)
}

const COMMON_SHADER = `uniform vec3 dnaColors[6];
uniform vec3 dnaEmission;
uniform vec3 dnaDark;
uniform vec3 dnaLight;
uniform float dnaFresnel;
uniform float dnaControl;
uniform float dnaEmissionStrength;
uniform float dnaHasEmission;
uniform float dnaQuantize;
uniform float dnaNormalStrength;
uniform float dnaWingDye;
uniform sampler2D dnaBase;
uniform sampler2D dnaNormal;
uniform sampler2D dnaEmitMap;
uniform sampler2D dnaMaskMap;
uniform sampler2D dnaDyeMap;
uniform vec4 dnaEyeAtlas;
varying vec2 vDnaUv;
varying vec2 vDnaUv1;
varying vec2 vDnaEyeUv;
varying float vDnaStocking;
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
vec3 dnaPacked(vec3 c, float weight) {
    // 游戏里底图按 sRGB 采样（硬件解码成线性），着色器再 1.055*c^(1/2.4)-0.055 编码回来，
    // 两者相消后色号/亮度就是贴图里写死的原始字节；只有未染色部分用线性颜色参与光照。
    vec3 linear = dnaLinear(c);
    return mix(linear, c.r * dnaRamp(dnaZone(c.g)), weight);
}
vec3 dnaWing(vec3 base, vec4 dye) {
    // Wing 着色器（BodyDN / 羽翼）色号与权重都取 时装BaseClor_2U 遮罩：G 是色号、R 是覆盖权重。
    vec3 linear = dnaLinear(base);
    return mix(linear, base.r * dnaRamp(dnaZone(dye.g)), dnaLinear1(dye.r));
}
float dnaNormalWeight(vec3 normalSample) {
    vec2 xy = normalSample.xy * 2.0 - 1.0;
    return sqrt(max(0.0, 1.0 - min(dot(xy, xy), 1.0)));
}
vec3 dnaPart(vec3 c) {
    vec3 linear = dnaLinear(c);
    vec3 tinted = linear.r * dnaColors[0] + linear.g * dnaColors[1] + linear.b * dnaColors[2];
    return mix(linear, tinted, dnaControl);
}
vec3 dnaWeapon(vec3 base, vec3 mask) {
    vec3 tint = mask.r * dnaColors[0] + mask.g * dnaColors[1] + mask.b * dnaColors[2];
    return dnaLinear(base) * mix(vec3(1.0), tint, dnaControl);
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
    private textures = new Set<Texture>()
    /** 染色贴图按 GLB 索引克隆一份缓存：多张材质引同一张图时只上传一份到 GPU */
    private textureClones = new Map<number, Promise<Texture>>()
    private request = 0
    private disposed = false
    private visible = true
    /** 画布是否拿到 MSAA：alpha-to-coverage 只在多重采样缓冲上有效。 */
    private msaa = false
    private center = new Vector3()
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

    constructor(host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
        this.msaa = this.renderer.getContext().getContextAttributes()?.antialias === true
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.outputColorSpace = SRGBColorSpace
        this.renderer.setClearColor(0x000000, 0)
        host.append(this.renderer.domElement)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = false
        this.controls.addEventListener("change", this.invalidate)
        this.scene.add(new HemisphereLight(0xe8edff, 0x555044, 2))
        const key = new DirectionalLight(0xfff5e8, 2.8)
        key.position.set(-3, 5, 4)
        this.scene.add(key)
        const rim = new DirectionalLight(0xc7e2ff, 1.2)
        rim.position.set(3, 3, -4)
        this.scene.add(rim)
        this.environment = this.createEnvironment()
        this.scene.environment = this.environment
        this.scene.environmentIntensity = 0.55
        this.observer = new ResizeObserver(() => {
            const width = Math.max(1, host.clientWidth)
            const height = Math.max(1, host.clientHeight)
            this.renderer.setSize(width, height)
            this.camera.aspect = width / height
            this.camera.updateProjectionMatrix()
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
        this.textures.add(target)
        return target
    }

    private invalidate = () => {
        if (this.request || this.disposed || !this.visible || document.hidden) return
        this.request = requestAnimationFrame(() => {
            this.request = 0
            if (!this.disposed) this.renderer.render(this.scene, this.camera)
        })
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
        this.mixer?.update(delta)
        this.renderer.render(this.scene, this.camera)
        this.request = requestAnimationFrame(this.tick)
    }

    private startLoop() {
        if (this.disposed) return
        if (this.request) cancelAnimationFrame(this.request)
        this.lastFrame = 0
        this.request = requestAnimationFrame(this.tick)
    }

    async load(url: string): Promise<SkinModelMetadata | undefined> {
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
        for (const mesh of meshes) {
            const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const hasUv1 = mesh.geometry.getAttribute("uv1") !== undefined
            // 贴图依赖已被 parser 缓存成 Promise，并行只省掉串行 await 的时间
            const converted = await Promise.all(
                original.map(material => {
                    const data = material.userData.dnaColorize as SkinMaterialMetadata | undefined
                    if (data?.version !== 1) throw new Error(`Missing dye material metadata: ${material.name}`)
                    return this.createMaterial(data, material as MeshStandardMaterial, hasUv1, mesh.name)
                })
            )
            for (const material of original) {
                for (const value of Object.values(material)) {
                    if (!(value instanceof Texture)) continue
                    // 直接复用原材质的贴图（无染色底图的 billboard/装饰件）也要开各向异性，避免远景闪烁。
                    value.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
                    this.textures.add(value)
                }
                material.dispose()
            }
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
            if (card) for (const material of Array.isArray(converted) ? converted : [converted]) this.expandBillboard(material, card, mesh)
            mesh.material = Array.isArray(mesh.material) ? converted : converted[0]
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
        const vertical = (this.camera.fov * Math.PI) / 180
        const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect)
        this.distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.08
        this.controls.minDistance = radius * 0.05
        this.controls.maxDistance = radius * 12
        this.camera.near = Math.max(radius / 1000, 0.001)
        this.camera.far = radius * 40
        this.camera.updateProjectionMatrix()
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

    /** 保留游戏编码贴图，用 Shader chunk 替换基础色和 BC7 法线；灯光仍是 Three 的近似预览。 */
    private async createMaterial(
        data: SkinMaterialMetadata,
        source: MeshStandardMaterial,
        hasUv1: boolean,
        meshName: string
    ): Promise<MeshStandardMaterial> {
        if (data.kind === "shadow") {
            const shadow = source.clone()
            shadow.depthWrite = false
            return shadow
        }
        const baseIndex = data.textures["时装BaseClor"] ?? data.textures["颜色贴图"]
        // 特效/装饰类材质没有染色底图（导出器退化成扁平色）：直接保留原始材质，
        // 走染色着色器会因为缺底图整只模型加载失败。
        if (baseIndex === undefined) return source
        const base = await this.dataTexture(baseIndex)
        const normalIndex = data.textures["法线贴图"]
        const normal =
            normalIndex === undefined ? new DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1) : await this.dataTexture(normalIndex)
        normal.needsUpdate = true
        this.textures.add(normal)
        const emitIndex = data.textures["自发光贴图"]
        const emit = emitIndex === undefined ? base : await this.dataTexture(emitIndex)
        const maskIndex = data.textures["混合贴图"]
        const mask =
            maskIndex === undefined ? new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) : await this.dataTexture(maskIndex)
        mask.needsUpdate = true
        this.textures.add(mask)
        const vector = (name: string, fallback: LinearRgb = [1, 1, 1]) => new Vector3(...(data.vectors[name] ?? fallback))
        // 羽片（wing）按父材质名判定，翼片遮罩与 2U 染色分区两处都用它。
        const wingShader = (data.parent ?? "").includes("M_Player_Wing_ShopSkin")
        // Wing 着色器的染色分区存在 2U 槽的遮罩里（不是底图）：G=色号、R=权重，按 UV1 采样。
        // 材质没覆盖 2U 时用父材质的默认白图（G=1 → 6 号色、R=1 → 全覆盖），不能退回底图算法。
        // 模型没带 UV1（旧缓存）时退回底图 UV0 的近似算法，避免整片被压成 1 号色。
        const dyeIndex = data.textures["时装BaseClor_2U"]
        const wingDye = wingShader && hasUv1
        const dyeMap =
            dyeIndex !== undefined
                ? await this.dataTexture(dyeIndex)
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
            dnaBase: { value: base },
            dnaNormal: { value: normal },
            dnaEmitMap: { value: emit },
            dnaMaskMap: { value: mask },
            dnaColors: { value: colorNames.map(name => vector(name)) },
            dnaEmission: { value: vector(data.kind === "hairPart" ? "头饰自发光染色" : "自发光颜色") },
            dnaDark: { value: vector("暗部颜色") },
            dnaLight: { value: vector("亮部颜色") },
            dnaFresnel: { value: data.scalars["菲涅尔指数"] ?? 0.62 },
            dnaControl: { value: data.scalars[data.kind === "hairPart" ? "启用染色" : "整体控制"] ?? 1 },
            dnaEmissionStrength: { value: data.scalars["自发光强度"] ?? 1 },
            // 缺少自发光贴图时必须彻底关掉该分支：退回用 base 会把整片 albedo 当自发光，
            // 配合 15+ 的强度会把羽片、袖纱压成发白的方块。
            dnaHasEmission: { value: emitIndex === undefined ? 0 : 1 },
            dnaQuantize: { value: data.scalars["使用UV1"] ?? 0 },
            dnaNormalStrength: { value: data.scalars["法线强度"] ?? 1 },
            dnaDyeMap: { value: dyeMap },
            dnaWingDye: { value: wingDye ? 1 : 0 },
        }
        // 眼睛材质：虹膜底图画在哪套 UV 上逐角色不同（V10/V11 在 UV0，V14 在 UV1），
        // 由导出器实测后写进元数据。取错那套只能看到一圈巩膜。
        const eye = data.kind === "eye"
        // 虹膜在图集每格内的位置由导出器从贴图量得（圆心 xy、外缘半径 z、瞳孔半径 w）。
        // 每个角色的瞳孔形状都不同（圆形/竖缝/星芒），所以不能写死某一张贴图的数值。
        const atlas = data.eyeAtlas
        uniforms.dnaEyeAtlas = {
            value: new Vector4(atlas?.center[0] ?? 0.5, atlas?.center[1] ?? 0.5, atlas?.radius ?? 0.4785, atlas?.pupil?.radius ?? 0),
        }
        const silkIndex = data.textures["丝绸混合贴图"]
        const silk = data.kind === "packed" && silkIndex !== undefined
        // 游戏丝绸的 `_Aniso_M` 与 three 的 anisotropyMap 同口径：RG 是切空间方向、B 是强度。
        const silkMap = silkIndex === undefined ? undefined : await this.dataTexture(silkIndex)
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
        const common = {
            name: source.name,
            map: base,
            normalMap: normal,
            // 顶点色在游戏里是遮罩（丝袜/自发光分区），不参与 albedo 相乘。
            vertexColors: false,
            metalness: data.scalars["金属度"] ?? 0,
            // 能量层/薄纱走灰度 alpha 混合：保留 alphaTest 会把墨迹、纱网硬切成洞。
            alphaTest: energyCutout || silkTran ? 0 : source.alphaTest,
            // 皮肤网格的躯干/上臂三角形绕序与腿部相反，单面剔除会把胸口、上臂整片裁掉。
            side: data.kind === "stocking" ? DoubleSide : source.side,
            transparent: source.transparent || energyCutout || silkTran,
            depthWrite: !energyCutout && !silkTran,
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
                  specularIntensity: data.scalars["AnisotropySpecularScale"] ?? 0.5,
                  anisotropy: data.scalars["Anisotropy"] ?? 0,
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
varying vec2 vDnaUv; varying vec2 vDnaUv1; varying vec2 vDnaEyeUv; varying float vDnaStocking;
${shader.vertexShader}`.replace(
                "#include <uv_vertex>",
                // 顶点色是游戏里的分区遮罩（G=丝袜覆盖），不是 albedo 相乘项；用平滑过渡避免 UV 岛边界硬边。
                `#include <uv_vertex>
vDnaUv = uv; vDnaUv1 = uv1; vDnaEyeUv = dnaEyeUv; vDnaStocking = smoothstep(0.15, 0.85, dnaMask.g);`
            )
            let map = "vec4 dnaSample = texture2D(dnaBase, vDnaUv); diffuseColor *= vec4(dnaLinear(dnaSample.rgb), dnaSample.a);"
            if (data.kind === "packed" || data.kind === "weapon")
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                ${wingMask || billboardMask ? "dnaSample.a = dnaSample.b;" : ""}
                vec3 dnaDyed = dnaWingDye > 0.5
                    ? dnaWing(dnaSample.rgb, texture2D(dnaDyeMap, vDnaUv1))
                    : dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));
                ${energyCutout ? "dnaSample.a *= dnaSample.b * texture2D(dnaMaskMap, vDnaUv).r;" : ""}
                diffuseColor *= vec4(dnaDyed, dnaSample.a);`
            if (data.kind === "packed" && data.textures["丝绸混合贴图"] !== undefined)
                map = `
                vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                // 丝绸与其它部位共用同一套色带：色号来自底图线性 G，染色 1~6 全参与。
                // 早先把缎面/蕾丝硬编码成染色1/染色6，2~5 号位怎么选都不变色。
                // 薄纱（SilkTran）的染色覆盖取混合贴图 G 的花纹遮罩，花纹外是白色底布：
                // 底图 RGB 只是色号/亮度的编码载体，直接拿来当基色会在纱面上压出灰紫色，
                // 整片纱染色后远看又只剩一片色块（SP15 结丝夜行的白/红染色最明显）。
                ${
                    silkTran
                        ? `vec3 dnaSilk = mix(
                    vec3(dnaLinear1(dnaSample.r)),
                    dnaSample.r * dnaRamp(dnaZone(dnaSample.g)),
                    smoothstep(0.45, 0.8, texture2D(dnaMaskMap, vDnaUv).g)
                );`
                        : "vec3 dnaSilk = dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));"
                }
                // 底图 B 是丝绸层的剪影：躯干、手套、鞋处处为 1，腿部只沿荆棘/蛛网细线为 1、其余为 0。
                // 细线在贴图里是抗锯齿的半透明边，阈值取高（0.35~0.55）会把线芯之外全裁掉，
                // 只剩断续的碎点；按线芯的覆盖率裁（0.08~0.25）才连成游戏里那种实心网纹。
                diffuseColor.rgb = dnaSilk;
                ${silkCutout ? (silkTran ? "diffuseColor.a *= dnaSample.b * 0.55;" : "diffuseColor.a *= smoothstep(0.08, 0.25, dnaSample.b);") : ""}
                `
            if (data.kind === "weapon")
                map =
                    "vec4 dnaSample = texture2D(dnaBase, vDnaUv); vec4 dnaMaskSample = texture2D(dnaMaskMap, vDnaUv); diffuseColor *= vec4(dnaWeapon(dnaSample.rgb, vec3(dnaMaskSample.g)), dnaSample.a);"
            if (data.kind === "hair")
                // 底图是红色 ramp 索引，不是 albedo；混进红色会把头发染成橙色。
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                vec3 dnaHair = dnaSample.r * dnaColors[0] + dnaSample.g * dnaColors[1] + dnaSample.b * dnaColors[2];
                diffuseColor *= vec4(dnaHair, dnaSample.a);`
            if (data.kind === "hairPart")
                map = "vec4 dnaSample = texture2D(dnaBase, vDnaUv); diffuseColor *= vec4(dnaPart(dnaSample.rgb), dnaSample.a);"
            if (eye)
                // 眼球是一颗球：底图 UV0 只覆盖巩膜，虹膜花纹在 UV1 上（游戏 PS 用 TEXCOORD.zw 采样）。
                // 旧导出包没有 UV1 时用 eyeUv() 按仿射补出的 dnaEyeUv。
                map = `vec4 dnaIris = texture2D(dnaBase, vDnaEyeUv);
                diffuseColor *= vec4(dnaLinear(dnaIris.rgb), dnaIris.a);`
            shader.fragmentShader =
                COMMON_SHADER +
                shader.fragmentShader.replace("#include <map_fragment>", map).replace(
                    "#include <normal_fragment_maps>",
                    `
                    vec4 dnaNormalSample = texture2D(dnaNormal, vDnaUv);
                    vec2 dnaXY = dnaNormalSample.rg * 2.0 - 1.0;
                    dnaXY *= dnaNormalStrength;
                    vec3 dnaN = normalize(vec3(dnaXY, sqrt(max(0.0, 1.0 - dot(dnaXY, dnaXY)))));
                    normal = normalize(tbn * dnaN);
                `
                )
            if (data.kind === "stocking")
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    `
                    float dnaNV = max(dot(normal, normalize(vViewPosition)), 0.0);
                    float dnaFacing = clamp(1.0 - (pow(max(1.0 - dnaNV, 0.0001), dnaFresnel) * 1.27 - 0.27), 0.0, 1.0);
                    dnaFacing = min(dnaFacing, ${data.scalars["高光范围"] ?? 0.08});
                    vec4 dnaKnitSample = texture2D(dnaMaskMap, vDnaUv);
                    // 混合贴图 B 是丝袜/编织的覆盖遮罩（与本作其它材质 B=剪影的约定一致），G 只是覆盖区内的花纹；
                    // 只按 G 判定会在 G 饱和的皮肤上把整片裸露皮肤压成暗部色（逐光追雪的 G≈0.98）。
                    float dnaCoverage = smoothstep(0.35, 0.55, dnaKnitSample.b);
                    float dnaPattern = smoothstep(0.62, 0.9, dnaKnitSample.g) * dnaCoverage;
                    vec3 dnaStock = diffuseColor.rgb * mix(dnaLight, dnaDark, max(dnaFacing, dnaPattern));
                    // R 是编织层的 AO 凹缝，只在覆盖区里衰减亮度：裸皮区的 R 可能为 0（领口、拼接缝），
                    // 无条件相乘会把脖子、胸口压成纯黑。
                    dnaStock *= mix(vec3(1.0), vec3(dnaKnitSample.r), vDnaStocking * dnaCoverage);
                    // 覆盖区外是裸皮：直接保留底图颜色。脸部走另一套材质（base）不套这层亮部/暗部染色，
                    // 若整片都乘亮部颜色，脸和身体的肤色会对不上（逐光追雪的脸偏白、脖子偏粉）。
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
                    // 图集第 3 格（u>=2）是眼角装饰片，游戏靠 SDF 遮罩把它们藏在眼睑后面。
                    // 我们不做 SDF，按巩膜处理——套虹膜曲线会在眼角浮出一块发白的矩形。
                    if (vDnaEyeUv.x >= 2.0) {
                        totalEmissiveRadiance = dnaEyeSclera;
                    } else {
                    float dnaEyeLum = dot(dnaEyeBase, vec3(0.3, 0.59, 0.11));
                    // 每格一只眼：虹膜圆心与半径由导出器从该角色的贴图量得（dnaEyeAtlas.xy/z）。
                    vec2 dnaEyeC = vec2(fract(vDnaEyeUv.x), vDnaEyeUv.y) - dnaEyeAtlas.xy;
                    float dnaEyeR = length(dnaEyeC) / dnaEyeAtlas.z;

                    // ① 虹膜底色：负斜率曲线（抬暗部、收亮部）。参考图虹膜三环几乎同色，
                    // 对比全在瞳孔与高光上，曲线做成正斜率会让整只眼糊成一片灰。
                    vec3 dnaEyeIris = dnaEyeBase * (1.445 - 0.593 * dnaEyeLum * dnaEyeLum) * vec3(1.06, 0.95, 0.99);
                    // ② 角膜缘（虹膜外缘那圈深色）：参考图里它比贴图暗约 1.6 倍，且环更宽。
                    dnaEyeIris *= mix(1.0, 0.60, smoothstep(0.78, 0.88, dnaEyeR) * (1.0 - smoothstep(1.00, 1.08, dnaEyeR)));
                    // ③ 瞳孔：用「贴图相对暗度 × 半径」联合遮罩。只用亮度会误伤外环（贴图里
                    // 外环比瞳孔只亮 2.6 倍），只用半径则画不出星芒/竖缝这些逐角色不同的形态。
                    float dnaEyeDark = 1.0 - clamp(dnaEyeLum / 0.54, 0.0, 1.0);
                    float dnaEyePupil = smoothstep(0.30, 0.60, dnaEyeDark) * (1.0 - smoothstep(0.55, 0.85, dnaEyeR));
                    dnaEyeIris *= 1.0 - 0.90 * dnaEyePupil;
                    // ④ 上眼睑阴影：参考图虹膜上半被压到下半的约 1/4，贴图里没有这条信息，
                    // 只能按虹膜内的纵坐标补。
                    dnaEyeIris *= mix(0.20, 0.81, smoothstep(0.12, 0.50, 0.5 + 0.5 * dnaEyeC.y / dnaEyeAtlas.z));
                    // 游戏 PS 还会叠一层 matcap 高光，但 T_Matcap19 是上半亮、下半全黑的硬边贴图，
                    // 任何穹面映射都会在虹膜中央压出一条横贯整只眼的直线；贴图自带的亮斑已够用。
                    totalEmissiveRadiance = mix(dnaEyeSclera, dnaEyeIris, 1.0 - smoothstep(0.98, 1.10, dnaEyeR));
                    }
                `
                    )
                    .replace(
                        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
                        "vec3 outgoingLight = totalEmissiveRadiance;"
                    )
            } else
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    `
                totalEmissiveRadiance += dnaLinear1(texture2D(dnaEmitMap, vDnaUv).r) * dnaEmission * dnaEmissionStrength * dnaHasEmission;
            `
                )
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <roughnessmap_fragment>",
                `
                    float roughnessFactor = roughness;
                    ${data.kind === "stocking" ? "roughnessFactor = mix(roughnessFactor, " + (data.scalars["丝袜粗糙度"] ?? 0.75) + ", vDnaStocking);" : ""}
                `
            )
        }
        // 剪裁开关会进着色器源码，同一份材质元数据在帽子与身体上必须编译成两个程序。
        material.customProgramCacheKey = () => `dna-${JSON.stringify(data)}-${silkCutout ? 1 : 0}-${energyCutout ? 1 : 0}`
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
            uniforms.dnaFresnel.value = resolveSkinModelFresnel(this.metadata, ids, data.scalars["菲涅尔指数"] ?? 0.62)
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
        this.invalidate()
    }

    resetCamera() {
        this.controls.target.copy(this.center)
        const aspect = Math.min(1, this.camera.aspect)
        this.camera.position.copy(this.center)
        this.camera.position.z += this.distance / aspect
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
        model.traverse(object => {
            if (!(object instanceof Mesh)) return
            object.geometry.dispose()
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                for (const value of Object.values(material)) if (value instanceof Texture) this.textures.add(value)
                material.dispose()
            }
        })
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
        this.renderer.dispose()
        this.renderer.domElement.remove()
        this.dyeMaterials = []
    }
}
