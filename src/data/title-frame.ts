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

/** 文字区域（TextBlock + 所在 ScaleBox）的布局与配色。 */
export interface TitleFrameTextStyle {
    /** 文字区域在舞台坐标系中的位置与尺寸 */
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly fontSize: number
    /** WrapTextAt，0 表示不换行 */
    readonly wrapAt: number
    /**
     * TextBlock.Margin.Bottom（保留原值供排查）。
     *
     * 注意：这不是 Slate 的布局内边距——TextBlock 的几何完全由所属 Slot 决定，
     * 渲染端不再用它做位移（游戏里的落点由 `y` + `height` 唯一确定）。
     */
    readonly marginBottom: number
    readonly justify: "left" | "center" | "right"
    readonly color: string
}

/**
 * 游戏字体 TitleBlod（`public/fonts/blod.ttf`，与游戏内 `Blod.ufont` 字节一致）的行高比例。
 *
 * 取 `(hhea.ascender - hhea.descender) / unitsPerEm = (962 + 304) / 1000`：FreeType 与
 * Chrome 用的都是这组度量，所以 `fontSize × 该比例` 就是 UE 里 TextBlock 的期望高度
 * （15px 字号 → 18.99px），也是 CSS 行盒应有的高度。文字框按这个高度测量与渲染，
 * 字形才会正好填满盒子、与游戏落在同一条基线上。
 */
export const TITLE_FONT_LINE_RATIO = 1.266

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

/** 序列帧图集（M_FlipBook）的分格参数。 */
export interface TitleFrameFlipBook {
    /** 图集行数（材质参数 `row`） */
    readonly rows: number
    /** 图集列数（材质参数 `column`） */
    readonly columns: number
    /** 每秒推进的格数（材质参数 `FPS`） */
    readonly fps: number
    /** 是否倒序播放（材质参数 `Flip` 为负） */
    readonly reverse: boolean
}

/**
 * 取出图层的序列帧分格参数。
 *
 * M_FlipBook 把 `Tex_Sequence` 当成一张 `row × column` 的图集，每帧只采样其中一格：
 * 直接把整张贴图铺进控件的话，16 格的图集会被压成 16 只小眼睛（1.4 灾厄使者右上角
 * 的眼部贴图就是这个症状）。因此渲染端必须按下标裁出一格再拉伸到控件尺寸。
 *
 * 只有材质名里带 `FlipBook` 且图集确实分格时才返回参数，其余图层按普通贴图处理。
 *
 * @param layer 图层
 * @returns 分格参数，非序列帧图层返回 null
 */
export function resolveFlipBook(layer: TitleFrameLayer): TitleFrameFlipBook | null {
    const name = layer.material?.split("/").pop() ?? ""
    if (!/flipbook/i.test(name)) return null

    const params = layer.params ?? {}
    const rows = Math.round(Number(params.row ?? 1))
    const columns = Math.round(Number(params.column ?? 1))
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows < 1 || columns < 1) return null
    // 1×1 的「图集」就是一整张图，不必走裁剪分支
    if (rows === 1 && columns === 1) return null

    const fps = Number(params.FPS ?? 1)
    return {
        rows,
        columns,
        fps: Number.isFinite(fps) && fps > 0 ? fps : 1,
        reverse: Number(params.Flip ?? 1) < 0,
    }
}

/**
 * 对一条曲线在 `[0, timeMs]` 上求积分，单位是「值·秒」。
 *
 * 序列帧的速度参数（`FPS`）会被 UMG 动画曲线驱动（1.4 灾厄使者的 `eye_1` 就是
 * `1 → 16 → 1 → 1 → 16 → 1` 的两段快放），这时「已经推进了多少格」只能由速度沿时间
 * 累加得到；直接乘当前值会让画面随关键帧跳变，且永远播不完整个图集。
 *
 * 常量插值（阶跃）取区间左值，其余按线性（梯形）近似，与 `sampleCurve` 保持一致。
 *
 * @param curve 曲线数据
 * @param timeMs 积分上限（毫秒）
 * @returns 积分值（值 × 秒）
 */
export function integrateCurve(curve: TitleFrameCurve | undefined, timeMs: number): number {
    if (!curve || curve.times.length === 0) return 0
    const end = Math.max(0, timeMs)
    if (end <= 0) return 0

    const { times, values } = curve
    // 第一个关键帧之前的区间按常量外推取值
    if (end <= times[0]) return ((values[0] ?? 0) * end) / 1000

    let area = 0
    for (let index = 0; index < times.length; index += 1) {
        const start = times[index]
        if (start >= end) break
        const nextStart = index + 1 < times.length ? times[index + 1] : Number.POSITIVE_INFINITY
        const span = Math.min(end, nextStart) - start
        if (span <= 0) continue
        const left = values[index] ?? 0
        // 常量插值在区间内保持左值；最后一个关键帧之后按常量外推
        const stepped = (curve.interp?.[index] ?? INTERP_LINEAR) === INTERP_CONSTANT
        if (stepped || !Number.isFinite(nextStart)) {
            area += left * span
            continue
        }
        // 线性段取「积分区间末端」的值做梯形，而不是下一个关键帧的值：
        // 只积到区间中途时用后者会把面积算大
        const target = values[index + 1] ?? left
        const ratio = (Math.min(end, nextStart) - start) / (nextStart - start)
        area += ((left + left + (target - left) * ratio) / 2) * span
    }
    return area / 1000
}

/**
 * 取出驱动某个序列帧图层速度的 `FPS` 参数曲线。
 *
 * @param animation 当前播放的动画段
 * @param layerKey 图层名（与动画轨道 key 一致）
 * @returns FPS 曲线，未动画时 undefined
 */
export function flipBookFpsCurve(animation: TitleFrameAnimation | null | undefined, layerKey: string): TitleFrameCurve | undefined {
    return animation?.tracks?.[layerKey]?.scalars?.FPS
}

/**
 * 计算某一时刻应当显示的是图集里的哪一格。
 *
 * 材质里的 `FPS` 是「每秒推进多少格」（16 格图集配 FPS=16 正好一秒一轮），`Flip = -1`
 * 表示倒序播放；时间轴起点与控件出现时刻对齐，因此 0 秒时正序显示第 0 格、倒序显示最后
 * 一格。传入 `fpsCurve` 时按速度积分推进——FPS 被动画驱动时只有积分才是真实格数。
 *
 * @param flipBook 分格参数
 * @param timeMs 播放时间（毫秒）
 * @param fpsCurve 覆盖 `FPS` 的动画曲线
 * @returns 单元格坐标（0 起）
 */
export function flipBookCellAt(flipBook: TitleFrameFlipBook, timeMs: number, fpsCurve?: TitleFrameCurve): { row: number; column: number } {
    const total = flipBook.rows * flipBook.columns
    const cells = fpsCurve ? integrateCurve(fpsCurve, timeMs) : (Math.max(0, timeMs) / 1000) * flipBook.fps
    const step = Math.floor(cells)
    const forward = ((step % total) + total) % total
    const index = flipBook.reverse ? total - 1 - forward : forward
    return { row: Math.floor(index / flipBook.columns), column: index % flipBook.columns }
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
