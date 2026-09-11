/**
 * 称号框（TitleFrame）渲染数据模型与运行时工具。
 *
 * 数据由 `tools/import-title-frame.ts` 从游戏 pak 直读生成到
 * `src/data/generated/title-frame.generated.ts`，本文件只提供类型定义与
 * 与 UE 对齐的采样 / 布局算法，便于单元测试。
 */

/** UE 阻尼曲线插值模式（ERichCurveInterpMode）。 */
export const INTERP_CONSTANT = 0
export const INTERP_LINEAR = 1
export const INTERP_CUBIC = 2
export const INTERP_CUBIC_BREAK = 3

/** 单条动画曲线：times 与 values 一一对应，时间单位为毫秒。 */
export interface TitleFrameCurve {
    readonly times: readonly number[]
    readonly values: readonly number[]
    /** 每个关键帧的插值模式，长度与 times 相同；缺省按线性处理 */
    readonly interp?: readonly number[]
}

/** 一个图层的 2D 变换曲线集合（对应 UMG 的 2D Transform Track）。 */
export interface TitleFrameTransformCurves {
    readonly translateX?: TitleFrameCurve
    readonly translateY?: TitleFrameCurve
    readonly rotation?: TitleFrameCurve
    readonly scaleX?: TitleFrameCurve
    readonly scaleY?: TitleFrameCurve
    readonly shearX?: TitleFrameCurve
    readonly shearY?: TitleFrameCurve
}

/** 单个图层在某个动画里的轨道。 */
export interface TitleFrameLayerTrack {
    /** 渲染不透明度轨道（RenderOpacity） */
    readonly opacity?: TitleFrameCurve
    /** 2D 变换轨道 */
    readonly transform?: TitleFrameTransformCurves
    /** 材质标量参数轨道（参数名 → 曲线） */
    readonly scalars?: Readonly<Record<string, TitleFrameCurve>>
}

/** 一段动画（In / Loop / Normal）。 */
export interface TitleFrameAnimation {
    /** 动画时长（毫秒），来自 MovieScene 的 PlaybackRange */
    readonly durationMs: number
    /** 图层名 → 轨道 */
    readonly tracks: Readonly<Record<string, TitleFrameLayerTrack>>
}

/** 水平对齐（对应 EHorizontalAlignment）。 */
export type TitleFrameAlignH = "fill" | "left" | "center" | "right"
/** 垂直对齐（对应 EVerticalAlignment）。 */
export type TitleFrameAlignV = "fill" | "top" | "center" | "bottom"

/** 贴图混色方式，由材质 BlendMode 推导。 */
export type TitleFrameBlend = "normal" | "add" | "multiply"

/** 一个图层（UMG 里的一张 Image）。 */
export interface TitleFrameLayer {
    /** 控件名，与动画轨道的 key 对应 */
    readonly key: string
    /** 贴图 URL（public/imgs/titleframe 下） */
    readonly src: string
    /**
     * 材质里各贴图参数名 → 贴图 URL。
     *
     * 一个材质的像素着色器可能采样多张贴图（主贴图 + 扰动图 + 遮罩…），
     * 移植着色器时按参数名取；`src` 只是其中的主贴图，供普通贴图路径使用。
     */
    readonly textures?: Readonly<Record<string, string>>
    /**
     * 叠加在主贴图上的 alpha 遮罩贴图（按顺序相乘）。
     *
     * 游戏里的 VX 材质写的是「MainTex 提供颜色、Mask/Mask2 提供形状」，
     * 例如 `MainTex` 是一张 4×4 纯白、`Mask` 才是真正的花纹。
     * 这里用 CSS mask 相乘来还原这一层乘法。
     */
    readonly masks: readonly string[]
    /** 贴图原始尺寸 */
    readonly textureWidth: number
    readonly textureHeight: number
    /** Brush.ImageSize —— 控件期望尺寸 */
    readonly width: number
    readonly height: number
    readonly alignH: TitleFrameAlignH
    readonly alignV: TitleFrameAlignV
    /** OverlaySlot.Padding：[left, top, right, bottom] */
    readonly padding: readonly number[]
    /** 控件级 RenderTransform（静态），[X, Y] */
    readonly translation: readonly number[]
    readonly scale: readonly number[]
    readonly shear: readonly number[]
    readonly rotation: number
    /** 控件级渲染不透明度（RenderOpacity 属性） */
    readonly opacity: number
    /** 贴图色调（Brush.TintColor）[r, g, b, a]，null 表示默认白色 */
    readonly tint: readonly number[] | null
    readonly blend: TitleFrameBlend
    /**
     * 材质具名参数的实际取值（基础材质默认值 + 材质实例覆写）。
     *
     * 键是 UE 里的参数名（`MainColor`、`Opacity`、`Main_U_Tiling`…），值与 HLSL 中的
     * 算式一一对应；移植着色器时按名字绑定，无需依赖常量缓冲的槽位顺序
     * （打包时把 uniform 反射裁掉了，槽位无法反查）。
     */
    readonly params?: Readonly<Record<string, number | readonly number[]>>
    /** 材质父级路径，仅用于排查 */
    readonly material?: string
}

/** 文字样式（TextBlock + 所在 ScaleBox）。 */
export interface TitleFrameTextStyle {
    /** 文字区域在舞台坐标系中的位置与尺寸 */
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly fontSize: number
    /** WrapTextAt，0 表示不换行 */
    readonly wrapAt: number
    readonly marginBottom: number
    readonly justify: "left" | "center" | "right"
    readonly color: string
}

/** 舞台坐标系中的一个矩形。 */
export interface TitleFrameRect {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
}

/** 一个称号框的完整渲染描述。 */
export interface TitleFrameDef {
    /** 稳定 key，例如 "07_2"（取自 WBP 资源名后缀） */
    readonly key: string
    /** 对应的称号框 ID（可能多个 ID 复用同一资源） */
    readonly ids: readonly number[]
    /** 设计尺寸（SizeBox 覆盖值），图层坐标以该矩形左上角为原点 */
    readonly width: number
    readonly height: number
    /**
     * 框体的可见包围盒（设计坐标系）。
     *
     * UMG 的布局尺寸只有 236×34，但真正的框面美术（512×128 的贴图）会按各自的
     * OverlaySlot 对齐方式溢出到框外，所以「显示比例」必须按这个包围盒算，
     * 而不是按布局尺寸算，否则框面会被裁掉上下两条。
     */
    readonly bounds: TitleFrameRect
    readonly text: TitleFrameTextStyle | null
    /** 绘制顺序，数组下标即 z 序 */
    readonly layers: readonly TitleFrameLayer[]
    readonly animations: {
        readonly in?: TitleFrameAnimation
        readonly loop?: TitleFrameAnimation
        readonly normal?: TitleFrameAnimation
    }
}

/** 图层在舞台坐标系中的最终矩形。 */
export interface TitleFrameLayerRect {
    readonly left: number
    readonly top: number
    readonly width: number
    readonly height: number
}

/**
 * 判断某个图层是否参与决定框体的可见包围盒。
 *
 * UMG 里框面美术（512×128 的贴图）会溢出 236×34 的布局框，而环境光效（放大 2 倍的
 * 512×256 辉光）会溢出到整屏。两者必须区分开：
 *
 *   - 横向必须完整覆盖布局框：漂浮的小装饰（花、星、环）只占一侧，不该把包围盒撑歪；
 *   - 包围盒中心不能跑出布局框：`HAlign_Left` 的 512×128 星点贴图会向右铺出 512，
 *     它只是环境特效，不代表框体；
 *   - 高度不超过布局框的 4 倍：框面美术通常在 2~3.8 倍之间，整屏辉光在 7 倍以上。
 *
 * 这样得到的包围盒正好是「看起来是那个框」的范围，辉光仍然照常向外绘制。
 *
 * @param rect 图层的设计坐标矩形
 * @param stage 布局框尺寸
 * @returns 是否参与包围盒
 */
export function contributesToBounds(rect: TitleFrameRect, stage: { width: number; height: number }): boolean {
    const coversHorizontally = rect.x <= 0 && rect.x + rect.width >= stage.width
    const centerX = rect.x + rect.width / 2
    const staysWithinStage = centerX >= 0 && centerX <= stage.width
    return coversHorizontally && staysWithinStage && rect.height <= stage.height * 4
}

/**
 * 把所有参与包围盒的矩形并起来；一个都不满足时退回布局框本身。
 *
 * @param rects 候选矩形（设计坐标）
 * @param stage 布局框尺寸
 * @param extra 额外必须包含的矩形（例如文字区域）
 * @returns 可见包围盒
 */
export function unionBounds(
    rects: readonly TitleFrameRect[],
    stage: { width: number; height: number },
    extra: readonly TitleFrameRect[] = []
): TitleFrameRect {
    const picked = rects.filter(rect => contributesToBounds(rect, stage))
    const source = picked.length > 0 ? [...picked, ...extra] : [{ x: 0, y: 0, ...stage }, ...extra]
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const rect of source) {
        minX = Math.min(minX, rect.x)
        minY = Math.min(minY, rect.y)
        maxX = Math.max(maxX, rect.x + rect.width)
        maxY = Math.max(maxY, rect.y + rect.height)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * 按 OverlaySlot 的对齐 + Padding 计算图层在父级中的矩形。
 *
 * 对应 Slate `SOverlay` 的排布规则：Fill 时尺寸被 Padding 内缩（负值即外扩），
 * 非 Fill 时使用控件期望尺寸；Center 时按 `(父尺寸 - 尺寸 + padStart - padEnd) / 2` 偏移。
 *
 * @param layer 图层
 * @param parentWidth 父级宽度（设计单位）
 * @param parentHeight 父级高度（设计单位）
 * @returns 图层矩形
 */
export function computeLayerRect(layer: TitleFrameLayer, parentWidth: number, parentHeight: number): TitleFrameLayerRect {
    const [padLeft, padTop, padRight, padBottom] = layer.padding

    const width = layer.alignH === "fill" ? parentWidth - padLeft - padRight : layer.width
    const height = layer.alignV === "fill" ? parentHeight - padTop - padBottom : layer.height

    let left: number
    switch (layer.alignH) {
        case "right":
            left = parentWidth - width - padRight
            break
        case "center":
            left = (parentWidth - width + padLeft - padRight) / 2
            break
        default:
            left = padLeft
            break
    }

    let top: number
    switch (layer.alignV) {
        case "bottom":
            top = parentHeight - height - padBottom
            break
        case "center":
            top = (parentHeight - height + padTop - padBottom) / 2
            break
        default:
            top = padTop
            break
    }

    return { left, top, width, height }
}

/**
 * 采样一条 UE 曲线。
 *
 * @param curve 曲线数据
 * @param timeMs 采样时间（毫秒，已在动画区间内）
 * @param fallback 曲线为空时的返回值
 * @returns 采样值
 */
export function sampleCurve(curve: TitleFrameCurve | undefined, timeMs: number, fallback: number): number {
    if (!curve || curve.times.length === 0) return fallback

    const times = curve.times
    const values = curve.values

    if (times.length === 1 || timeMs <= times[0]) return values[0]
    const last = times.length - 1
    if (timeMs >= times[last]) return values[last]

    let low = 0
    let high = last
    while (high - low > 1) {
        const mid = (low + high) >> 1
        if (times[mid] <= timeMs) low = mid
        else high = mid
    }

    const t0 = times[low]
    const t1 = times[high]
    const v0 = values[low]
    const v1 = values[high]
    if (t1 <= t0) return v1

    const mode = curve.interp?.[low] ?? INTERP_LINEAR
    const alpha = (timeMs - t0) / (t1 - t0)
    // 常量插值在区间内保持左值；其余模式统一按线性处理（UMG 默认关键帧为 Auto，
    // 视觉差异极小，且游戏内曲线绝大多数为线性/阶跃）。
    if (mode === INTERP_CONSTANT) return v0
    return v0 + (v1 - v0) * alpha
}

/**
 * 把播放时间折叠进循环区间。
 *
 * @param timeMs 当前播放时间
 * @param durationMs 动画时长
 * @returns 区间内时间
 */
export function wrapTime(timeMs: number, durationMs: number): number {
    if (durationMs <= 0) return 0
    const wrapped = timeMs % durationMs
    return wrapped < 0 ? wrapped + durationMs : wrapped
}

/** 当前应使用的动画与其中的时间。 */
export interface TitleFrameSampleState {
    readonly animation: TitleFrameAnimation | null
    readonly timeMs: number
}

/**
 * 依据组件播放时钟推导当前应处于哪段动画。
 *
 * 游戏内逻辑：载入时播放一次 `In`，`In` 结束触发循环播放 `Loop`。
 *
 * @param frame 称号框定义
 * @param elapsedMs 自开始播放以来的时间
 * @param loop 是否循环播放（false 时 `In` 结束后停在末尾）
 * @returns 当前动画与时间
 */
export function resolveAnimation(frame: TitleFrameDef, elapsedMs: number, loop: boolean): TitleFrameSampleState {
    const intro = frame.animations.in
    const introMs = intro?.durationMs ?? 0

    if (intro && elapsedMs < introMs) {
        return { animation: intro, timeMs: elapsedMs }
    }

    const loopAnimation = frame.animations.loop ?? frame.animations.normal ?? null
    if (!loopAnimation) {
        return { animation: intro ?? null, timeMs: intro ? introMs : 0 }
    }

    const rest = elapsedMs - introMs
    if (!loop) return { animation: loopAnimation, timeMs: loopAnimation.durationMs }
    return { animation: loopAnimation, timeMs: wrapTime(rest, loopAnimation.durationMs) }
}
