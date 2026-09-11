/**
 * 称号框的 WebGL 图层合成器。
 *
 * UMG 的称号框是一叠 Image：每张按 OverlaySlot 的对齐/Padding 摆放、再叠加 RenderTransform，
 * 材质图层走反编译移植过来的像素着色器。这里把同一套几何与材质在 GPU 上重放：
 *
 *   - 每个图层画一个纹理四边形，顶点变换复刻 UMG 的「切变 → 旋转 → 缩放 → 平移」；
 *   - 普通贴图图层用 plain 程序（贴图 × 色调 × 不透明度，再乘 Mask 链）；
 *   - 材质图层用移植后的 uiVx 程序，按参数名绑定 `TitleFrameLayer.params`；
 *   - 混合模式按材质的 BlendMode 设置：Translucent → 普通 alpha，Additive → 加法。
 *
 * 文字仍然交给 DOM 叠在画布上，避免在着色器里做字体排版。
 */

import {
    computeLayerRect,
    resolveAnimation,
    sampleCurve,
    type TitleFrameDef,
    type TitleFrameLayer,
    type TitleFrameLayerTrack,
} from "@/data/title-frame"
import {
    BIRD_FRAGMENT_SHADER,
    LAYER_VERTEX_SHADER,
    MATERIAL_FRAGMENT_SHADER,
    MATERIAL_PARAM_DEFAULTS,
    type MaterialProgram,
    PLAIN_FRAGMENT_SHADER,
    programFor,
} from "@/data/title-frame-material"

/**
 * 编译一个着色器。
 * @param gl WebGL 上下文
 * @param type 着色器类型
 * @param source GLSL 源码
 * @returns 编译好的着色器
 */
function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)
    if (!shader) throw new Error("createShader 失败")
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`着色器编译失败：${log}`)
    }
    return shader
}

/**
 * 链接一个程序。
 * @param gl WebGL 上下文
 * @param vertexSource 顶点着色器
 * @param fragmentSource 片元着色器
 * @returns 链接好的程序
 */
function link(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
    const program = gl.createProgram()
    if (!program) throw new Error("createProgram 失败")
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, "aCorner")
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program)
        gl.deleteProgram(program)
        throw new Error(`着色器链接失败：${log}`)
    }
    return program
}

/**
 * 建立 1×1 占位纹理。
 *
 * 遮罩缺失时用白色（等价于不做遮罩），主贴图尚未加载完时用全透明——
 * 否则会先闪一帧纯白。
 *
 * @param gl WebGL 上下文
 * @param rgba 像素颜色
 * @returns 占位纹理
 */
function createPlaceholder(gl: WebGLRenderingContext, rgba: [number, number, number, number]): WebGLTexture {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
}

/** 渲染一帧需要的输入。 */
export interface FrameRenderInput {
    readonly frame: TitleFrameDef
    /** 画布像素尺寸（已含 devicePixelRatio） */
    readonly canvasWidth: number
    readonly canvasHeight: number
    /** 设计单位 → 像素（含 dpr） */
    readonly stageScale: number
    /** 设计画布左上角在画布中的像素位置 */
    readonly stageOrigin: readonly [number, number]
    /** 动画播放时间（毫秒） */
    readonly elapsedMs: number
    readonly loop: boolean
}

/**
 * 创建渲染器；WebGL 不可用时返回 null，调用方回退到 DOM 渲染。
 * @param canvas 目标画布
 * @returns 渲染器实例或 null
 */
export function createFrameRenderer(canvas: HTMLCanvasElement): FrameRenderer | null {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true })
    if (!gl) return null
    try {
        return new FrameRenderer(gl)
    } catch (error) {
        console.error("称号框 WebGL 渲染器初始化失败", error)
        return null
    }
}

/** 称号框的 GPU 渲染器。 */
export class FrameRenderer {
    private readonly gl: WebGLRenderingContext
    private readonly programs: Record<MaterialProgram, WebGLProgram>
    private readonly quad: WebGLBuffer
    private readonly white: WebGLTexture
    private readonly transparent: WebGLTexture
    private readonly textures = new Map<string, WebGLTexture>()
    private readonly pending = new Set<string>()
    /** 贴图加载完成后的回调：组件用它补一帧，静态快照模式尤其需要 */
    onTextureLoad: (() => void) | null = null

    constructor(gl: WebGLRenderingContext) {
        this.gl = gl
        this.programs = {
            plain: link(gl, LAYER_VERTEX_SHADER, PLAIN_FRAGMENT_SHADER),
            uiVx: link(gl, LAYER_VERTEX_SHADER, MATERIAL_FRAGMENT_SHADER),
            titleBird: link(gl, LAYER_VERTEX_SHADER, BIRD_FRAGMENT_SHADER),
        }
        this.white = createPlaceholder(gl, [255, 255, 255, 255])
        this.transparent = createPlaceholder(gl, [0, 0, 0, 0])

        const quad = gl.createBuffer()
        if (!quad) throw new Error("createBuffer 失败")
        this.quad = quad
        gl.bindBuffer(gl.ARRAY_BUFFER, quad)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.enable(gl.BLEND)
        gl.disable(gl.DEPTH_TEST)
    }

    /**
     * 渲染一帧。
     * @param input 帧数据与画布参数
     */
    render(input: FrameRenderInput): void {
        const gl = this.gl
        gl.viewport(0, 0, input.canvasWidth, input.canvasHeight)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)

        const sample = resolveAnimation(input.frame, input.elapsedMs, input.loop)

        for (const layer of input.frame.layers) {
            const kind = programFor(layer.material)
            const program = this.programs[kind]
            gl.useProgram(program)

            const track = sample.animation?.tracks[layer.key]
            this.setGeometry(program, layer, input, track)
            this.setTint(program, layer)
            this.bindTexture(program, "uMaskA", layer.masks[0] ?? "")
            this.bindTexture(program, "uMaskB", layer.masks[1] ?? "")

            const opacity = Math.max(0, Math.min(1, layer.opacity * sampleCurve(track?.opacity, sample.timeMs, 1)))
            if (kind === "uiVx") {
                this.bindTexture(program, "uMainTex", layer.src)
                this.setMaterialUniforms(program, layer, sample.timeMs / 1000, opacity)
            } else if (kind === "titleBird") {
                this.bindTexture(program, "uMainTex", layer.textures?.MainTex ?? layer.src)
                this.bindTexture(program, "uDistortionTex", layer.textures?.DistortionTex ?? "")
                this.setBirdUniforms(program, layer, sample.timeMs / 1000, opacity)
            } else {
                this.bindTexture(program, "uTexture", layer.src)
                this.uniform1f(program, "uAlphaMask", 1)
                this.uniform1f(program, "uOpacity", opacity)
            }

            this.setBlend(layer)
            gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
        gl.useProgram(null)
    }

    /**
     * 设置顶点变换：图层矩形 + （动画轨道优先的）RenderTransform。
     * @param program 目标程序
     * @param layer 图层
     * @param input 帧输入
     * @param track 该图层在当前动画里的轨道
     */
    private setGeometry(
        program: WebGLProgram,
        layer: TitleFrameLayer,
        input: FrameRenderInput,
        track: TitleFrameLayerTrack | undefined
    ): void {
        const rect = computeLayerRect(layer, input.frame.width, input.frame.height)
        const transform = track?.transform
        const time = input.elapsedMs
        const pick = (curve: { times: readonly number[]; values: readonly number[] } | undefined, fallback: number) =>
            curve ? sampleCurve(curve, time, fallback) : fallback

        this.uniform2f(program, "uStage", input.frame.width, input.frame.height)
        this.uniform2f(program, "uStageOrigin", input.stageOrigin[0], input.stageOrigin[1])
        this.uniform1f(program, "uStageScale", input.stageScale)
        this.uniform2f(program, "uCanvasSize", input.canvasWidth, input.canvasHeight)
        this.uniform2f(program, "uCenter", rect.left + rect.width / 2, rect.top + rect.height / 2)
        this.uniform2f(program, "uSize", rect.width, rect.height)
        this.uniform2f(
            program,
            "uTranslation",
            pick(transform?.translateX, layer.translation[0]),
            pick(transform?.translateY, layer.translation[1])
        )
        this.uniform2f(program, "uScale", pick(transform?.scaleX, layer.scale[0]), pick(transform?.scaleY, layer.scale[1]))
        this.uniform2f(program, "uShear", pick(transform?.shearX, layer.shear[0]), pick(transform?.shearY, layer.shear[1]))
        this.uniform1f(program, "uRotation", pick(transform?.rotation, layer.rotation))
    }

    /** 设置控件级色调。 */
    private setTint(program: WebGLProgram, layer: TitleFrameLayer): void {
        const tint = layer.tint ?? [1, 1, 1, 1]
        this.uniform4f(program, "uTint", tint[0], tint[1], tint[2], tint[3])
    }

    /**
     * 材质图层的 uniform：按参数名绑定，缺失时用基础材质默认值兜底。
     * @param program 材质程序
     * @param layer 图层
     * @param timeSeconds 动画时间（秒）
     * @param layerOpacity 图层的动画不透明度
     */
    private setMaterialUniforms(program: WebGLProgram, layer: TitleFrameLayer, timeSeconds: number, layerOpacity: number): void {
        const params = layer.params ?? {}
        const defaults = MATERIAL_PARAM_DEFAULTS as Record<string, number | readonly number[]>
        const number = (name: string): number => {
            const value = params[name] ?? defaults[name]
            return typeof value === "number" ? value : 0
        }
        const vector = (name: string): readonly number[] => {
            const value = params[name] ?? defaults[name]
            return Array.isArray(value) ? value : [1, 1, 1, 1]
        }

        this.uniform1f(program, "uTime", timeSeconds)
        this.uniform2f(program, "uTiling", number("Main_U_Tiling"), number("Main_V_Tiling"))
        this.uniform2f(program, "uUvScale", number("Main_U_Scale"), number("Main_V_Scale"))
        const main = vector("MainColor")
        const selection = vector("SelectionColor")
        this.uniform3f(program, "uMainColor", main[0], main[1], main[2])
        this.uniform3f(program, "uSelectionColor", selection[0], selection[1], selection[2])
        // SelectionColor 的混合系数是引擎注入的表达式槽位，材质资源里没有对应参数；未选中时为 0
        this.uniform1f(program, "uSelectionMix", 0)
        this.uniform1f(program, "uHueShift", number("HueShift"))
        this.uniform2f(program, "uScrollSpeed", number("Main_U_Speed"), number("Main_V_Speed"))
        this.uniform2f(program, "uScrollOffset", number("Main_U_Offset"), number("Main_V_Offset"))
        this.uniform1f(program, "uWaverSpeed", number("Main_RotationSpeed"))
        this.uniform1f(program, "uWaverOffset", number("Main_Rotation"))
        this.uniform1f(program, "uSaturation", number("Saturation"))
        this.uniform1f(program, "uFinalPower", number("FinalPower"))
        this.uniform1f(program, "uOpacity", number("Opacity"))
        this.uniform1f(program, "uOpacity2", 1)
        this.uniform1f(program, "uLayerOpacity", layerOpacity)
    }

    /**
     * 鸟群材质的 uniform：具名贴图与扰动参数。
     * @param program 材质程序
     * @param layer 图层
     * @param timeSeconds 动画时间（秒）
     * @param layerOpacity 图层的动画不透明度
     */
    private setBirdUniforms(program: WebGLProgram, layer: TitleFrameLayer, timeSeconds: number, layerOpacity: number): void {
        const params = layer.params ?? {}
        const defaults = MATERIAL_PARAM_DEFAULTS as Record<string, number | readonly number[]>
        const number = (name: string): number => {
            const value = params[name] ?? defaults[name]
            return typeof value === "number" ? value : 0
        }
        const vector = (name: string): readonly number[] => {
            const value = params[name] ?? defaults[name]
            return Array.isArray(value) ? value : [0, 0, 0, 0]
        }

        const distortionUv = vector("DistortionUV")
        this.uniform1f(program, "uTime", timeSeconds)
        this.uniform2f(program, "uTiling", number("Main_U_Tiling"), number("Main_V_Tiling"))
        this.uniform4f(program, "uDistortionUv", distortionUv[0], distortionUv[1], distortionUv[2], distortionUv[3])
        // 扰动图的滚动速度不是具名参数（材质图里的常量），先固定为 0
        this.uniform2f(program, "uDistortionSpeed", 0, 0)
        this.uniform1f(program, "uDistortionPower", number("DistortionPower"))
        this.uniform1f(program, "uOpacity", number("Opacity"))
        this.uniform1f(program, "uLayerOpacity", layerOpacity)
    }

    /**
     * 按材质的 BlendMode 设置混合。
     * @param layer 图层
     */
    private setBlend(layer: TitleFrameLayer): void {
        const gl = this.gl
        if (layer.blend === "add") gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
        else if (layer.blend === "multiply") gl.blendFunc(gl.DST_COLOR, gl.ZERO)
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }

    /**
     * 取贴图；首次遇到会异步加载，加载完成前先返回白纹理。
     * @param url 贴图地址
     * @returns GPU 纹理
     */
    private texture(url: string): WebGLTexture {
        const cached = this.textures.get(url)
        if (cached) return cached
        if (!this.pending.has(url)) {
            this.pending.add(url)
            const image = new Image()
            image.crossOrigin = "anonymous"
            image.onload = () => {
                const gl = this.gl
                const texture = gl.createTexture()
                if (!texture) return
                gl.bindTexture(gl.TEXTURE_2D, texture)
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
                // WebGL 的纹理原点在左下，不翻转的话整张贴图会上下颠倒；
                // 顶点阶段已经让 vUv.y = 0 对应屏幕上方，这里必须同步翻转。
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                this.textures.set(url, texture)
                this.pending.delete(url)
                this.onTextureLoad?.()
            }
            image.onerror = () => this.pending.delete(url)
            image.src = url
        }
        return this.transparent
    }

    /**
     * 绑定贴图到固定纹理单元。
     * @param program 目标程序
     * @param name uniform 名
     * @param url 贴图地址，空字符串表示绑定白纹理
     */
    private bindTexture(program: WebGLProgram, name: string, url: string): void {
        const gl = this.gl
        const location = gl.getUniformLocation(program, name)
        if (!location) return
        const isMain = name === "uMainTex" || name === "uTexture"
        // 纹理单元按 uniform 名固定分配：主贴图 0、MaskA 1、MaskB 2、扰动图 3。
        // 之前 uMaskB 与 uDistortionTex 都落到 2 号单元，后绑定的会覆盖前者，
        // 导致鸟群图层的 alpha 被噪声图的 alpha 乘掉。
        const unit = isMain ? 0 : name === "uMaskA" ? 1 : name === "uMaskB" ? 2 : 3
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, url ? this.texture(url) : isMain ? this.transparent : this.white)
        gl.uniform1i(location, unit)
    }

    private uniform1f(program: WebGLProgram, name: string, value: number): void {
        const location = this.gl.getUniformLocation(program, name)
        if (location) this.gl.uniform1f(location, value)
    }

    private uniform2f(program: WebGLProgram, name: string, x: number, y: number): void {
        const location = this.gl.getUniformLocation(program, name)
        if (location) this.gl.uniform2f(location, x, y)
    }

    private uniform3f(program: WebGLProgram, name: string, x: number, y: number, z: number): void {
        const location = this.gl.getUniformLocation(program, name)
        if (location) this.gl.uniform3f(location, x, y, z)
    }

    private uniform4f(program: WebGLProgram, name: string, x: number, y: number, z: number, w: number): void {
        const location = this.gl.getUniformLocation(program, name)
        if (location) this.gl.uniform4f(location, x, y, z, w)
    }

    /** 释放 GPU 资源。 */
    dispose(): void {
        const gl = this.gl
        for (const texture of this.textures.values()) gl.deleteTexture(texture)
        this.textures.clear()
        gl.deleteTexture(this.white)
        gl.deleteTexture(this.transparent)
        gl.deleteBuffer(this.quad)
        for (const program of Object.values(this.programs)) gl.deleteProgram(program)
    }
}
