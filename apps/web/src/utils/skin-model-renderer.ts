import {
    AnimationMixer,
    Box3,
    DataTexture,
    DirectionalLight,
    DoubleSide,
    EquirectangularReflectionMapping,
    HemisphereLight,
    LoopOnce,
    LoopRepeat,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    NoColorSpace,
    type Object3D,
    PerspectiveCamera,
    PMREMGenerator,
    Scene,
    Sphere,
    SRGBColorSpace,
    Texture,
    Vector3,
    WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
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
varying vec2 vDnaUv;
varying vec2 vDnaUv1;
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
    material: MeshStandardMaterial
    metadata: SkinMaterialMetadata
    uniforms: Record<string, { value: any }>
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
    private request = 0
    private disposed = false
    private visible = true
    private center = new Vector3()
    private distance = 1
    private cameraDirection = new Vector3()
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
            const converted = []
            for (const material of original) {
                const data = material.userData.dnaColorize as SkinMaterialMetadata | undefined
                if (data?.version !== 1) throw new Error(`Missing dye material metadata: ${material.name}`)
                converted.push(
                    await this.createMaterial(data, material as MeshStandardMaterial, mesh.geometry.getAttribute("uv1") !== undefined)
                )
                for (const value of Object.values(material)) if (value instanceof Texture) this.textures.add(value)
                material.dispose()
            }
            const color = mesh.geometry.getAttribute("color")
            if (color) mesh.geometry.setAttribute("dnaMask", color)
            else {
                // 没有顶点遮罩的部件不走丝袜分支。
                const { BufferAttribute } = await import("three")
                const mask = new Float32Array(mesh.geometry.getAttribute("position").count * 4).fill(1)
                mesh.geometry.setAttribute("dnaMask", new BufferAttribute(mask, 4))
            }
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

    private async dataTexture(index: number | undefined): Promise<Texture> {
        if (index === undefined) throw new Error("Required game texture is missing")
        const original: Texture = await this.gltf!.parser.getDependency("texture", index)
        this.textures.add(original)
        const texture = original.clone()
        texture.colorSpace = NoColorSpace
        texture.flipY = false
        texture.needsUpdate = true
        this.textures.add(texture)
        return texture
    }

    /** 保留游戏编码贴图，用 Shader chunk 替换基础色和 BC7 法线；灯光仍是 Three 的近似预览。 */
    private async createMaterial(data: SkinMaterialMetadata, source: MeshStandardMaterial, hasUv1: boolean): Promise<MeshStandardMaterial> {
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
        // Wing 着色器的染色分区存在 2U 槽的遮罩里（不是底图）：G=色号、R=权重，按 UV1 采样。
        // 材质没覆盖 2U 时用父材质的默认白图（G=1 → 6 号色、R=1 → 全覆盖），不能退回底图算法。
        // 模型没带 UV1（旧缓存）时退回底图 UV0 的近似算法，避免整片被压成 1 号色。
        const wingShader = (data.parent ?? "").includes("M_Player_Wing_ShopSkin")
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
        const uniforms = {
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
        const silk = data.kind === "packed" && data.textures["丝绸混合贴图"] !== undefined
        // 羽片是卡片网格，真实剪影只写在底图 B 通道（alpha 恒为 1）；游戏 Wing 着色器用它做不透明遮罩，
        // 直接采样 alpha 会把整张卡片渲染成硬边矩形。
        const wingMask = !silk && (data.parent ?? "").includes("M_Player_Wing_ShopSkin")
        const common = {
            name: source.name,
            map: base,
            normalMap: normal,
            // 顶点色在游戏里是遮罩（丝袜/自发光分区），不参与 albedo 相乘。
            vertexColors: false,
            metalness: data.scalars["金属度"] ?? 0,
            alphaTest: source.alphaTest,
            // 皮肤网格的躯干/上臂三角形绕序与腿部相反，单面剔除会把胸口、上臂整片裁掉。
            side: data.kind === "stocking" ? DoubleSide : source.side,
            transparent: source.transparent,
        }
        // 丝绸是布料，用物理材质的 sheen 补上游戏里靠各向异性高光给出的布面光泽。
        const material: MeshStandardMaterial = silk
            ? new MeshPhysicalMaterial({
                  ...common,
                  roughness: 0.42,
                  sheen: 1,
                  sheenRoughness: 0.3,
                  sheenColor: 0xf4f7ff,
                  specularIntensity: 0.9,
              })
            : new MeshStandardMaterial({
                  ...common,
                  roughness: data.kind === "stocking" ? 0.55 : 0.8,
              })
        material.userData.dnaColorize = data
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms)
            shader.vertexShader =
                `attribute vec4 dnaMask; attribute vec2 uv1; varying vec2 vDnaUv; varying vec2 vDnaUv1; varying float vDnaStocking;\n${shader.vertexShader}`.replace(
                    "#include <uv_vertex>",
                    // 顶点色是游戏里的分区遮罩（G=丝袜覆盖），不是 albedo 相乘项；用平滑过渡避免 UV 岛边界硬边。
                    "#include <uv_vertex>\nvDnaUv = uv; vDnaUv1 = uv1; vDnaStocking = smoothstep(0.15, 0.85, dnaMask.g);"
                )
            let map = "vec4 dnaSample = texture2D(dnaBase, vDnaUv); diffuseColor *= vec4(dnaLinear(dnaSample.rgb), dnaSample.a);"
            if (data.kind === "packed" || data.kind === "weapon")
                map = `vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                ${wingMask ? "dnaSample.a = dnaSample.b;" : ""}
                vec3 dnaDyed = dnaWingDye > 0.5
                    ? dnaWing(dnaSample.rgb, texture2D(dnaDyeMap, vDnaUv1))
                    : dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));
                diffuseColor *= vec4(dnaDyed, dnaSample.a);`
            if (data.kind === "packed" && data.textures["丝绸混合贴图"] !== undefined)
                map = `
                vec4 dnaSample = texture2D(dnaBase, vDnaUv);
                // 丝绸与其它部位共用同一套色带：色号来自底图线性 G，染色 1~6 全参与。
                // 早先把缎面/蕾丝硬编码成染色1/染色6，2~5 号位怎么选都不变色。
                vec3 dnaSilk = dnaPacked(dnaSample.rgb, dnaNormalWeight(texture2D(dnaNormal, vDnaUv).rgb));
                // 底图 B 是丝绸层的剪影：躯干、手套、鞋处处为 1，腿部只沿荆棘藤蔓为 1、其余为 0。
                // 覆盖率直接进 alpha，交给 alphaTest 丢弃：腿部非藤蔓处不渲染，露出下面的皮肤层。
                diffuseColor.rgb = dnaSilk;
                diffuseColor.a *= smoothstep(0.35, 0.55, dnaSample.b);
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
                    // 混合贴图 G 是编织/藤蔓覆盖率（皮肤≈0.6、网纹≈0.72、藤蔓≥0.8），并入暗部权重；
                    // R 是 AO 凹缝，只作亮度衰减。B 通道恒 0，不能按 vec3 整体线性化使用。
                    float dnaPattern = smoothstep(0.62, 0.9, dnaKnitSample.g);
                    vec3 dnaStock = diffuseColor.rgb * mix(dnaLight, dnaDark, max(dnaFacing, dnaPattern));
                    dnaStock *= mix(vec3(1.0), vec3(dnaKnitSample.r), vDnaStocking);
                    diffuseColor.rgb = mix(diffuseColor.rgb, dnaStock, vDnaStocking * dnaControl);
                `
                )
            else
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    `
                totalEmissiveRadiance += texture2D(dnaEmitMap, vDnaUv).r * dnaEmission * dnaEmissionStrength * dnaHasEmission;
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
        material.customProgramCacheKey = () => `dna-${JSON.stringify(data)}`
        this.dyeMaterials.push({ material, metadata: data, uniforms })
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
        this.cameraDirection.set(0, 0, 1)
        this.camera.position.copy(this.center).add(this.cameraDirection.multiplyScalar(this.distance / aspect))
        this.controls.update()
        this.invalidate()
    }

    showWeapon(weapon: boolean) {
        this.model?.traverse(object => {
            if (object instanceof Mesh) object.visible = (object.userData.dnaRole === "weapon") === weapon
        })
        this.frameModel()
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

    get animationNames(): string[] {
        return this.actions.map(entry => entry.name)
    }

    /** 播放指定片段；未指定时优先 Armory 展示待机，动作幅度比战斗待机大得多。 */
    play(name?: string, loop = true) {
        if (!this.mixer || !this.actions.length) return false
        const entry = name
            ? this.actions.find(item => item.name === name)
            : (this.actions.find(item => item.name.endsWith("_Armory_Idle")) ?? this.actions[0])
        if (!entry) return false
        this.mixer.stopAllAction()
        entry.action.reset()
        entry.action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
        entry.action.clampWhenFinished = !loop
        entry.action.play()
        this.playing = true
        this.startLoop()
        return true
    }

    stop() {
        this.playing = false
        this.mixer?.stopAllAction()
        if (this.request) {
            cancelAnimationFrame(this.request)
            this.request = 0
            this.lastFrame = 0
        }
        this.invalidate()
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
