/**
 * import-title-frame —— 从游戏 pak 直读生成称号框（TitleFrame）渲染数据。
 *
 * 与旧的 `generate-title-frame-render.mjs` 不同，本脚本不再依赖 FModel 的
 * 半成品 JSON 导出，而是通过 fmodel-cli（CUE4Parse）直接读取 pak：
 *
 *   1. 读 `EM/Content/Script/Datas/TitleFrame.lua`（已反编译）拿到
 *      「称号框 ID → WidgetBlueprint」权威映射；
 *   2. 对每个 WBP 调 `read`，解析控件树（SizeBox / Overlay / OverlaySlot /
 *      Image / ScaleBox / TextBlock）与三段动画（In / Loop / Normal）；
 *   3. 对每个 MaterialInstanceConstant 画笔调 `inspect`，取出材质的
 *      BlendMode、贴图参数与标量参数，并挑出主贴图；
 *   4. 对所有用到的贴图调 `export-tex` 导出 PNG，再用 Bun.Image 转成 WebP
 *      落到 `public/imgs/titleframe/`；
 *   5. 产出 `src/data/generated/title-frame.generated.ts`。
 *
 * 前置条件（可用环境变量覆盖）：
 *   FMODEL_CLI        fmodel-cli.exe 路径
 *   TITLE_FRAME_LUA   反编译后的 TitleFrame.lua 路径
 *   TITLE_FRAME_CACHE CLI 原始输出的缓存目录（默认 .tmp/titleframe-cache）
 *
 * 用法：
 *   bun tools/import-title-frame.ts                # 增量导入
 *   bun tools/import-title-frame.ts --force        # 忽略缓存与已有 WebP
 *   bun tools/import-title-frame.ts --frames 07_1,09_1
 *   bun tools/import-title-frame.ts --probe        # 只打印材质解析结果，不落盘
 */

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type {
    TitleFrameAlignH,
    TitleFrameAlignV,
    TitleFrameAnimation,
    TitleFrameBlend,
    TitleFrameCurve,
    TitleFrameDef,
    TitleFrameLayer,
    TitleFrameLayerTrack,
    TitleFrameTextStyle,
    TitleFrameTransformCurves,
} from "../src/data/title-frame"
import { unionBounds } from "../src/data/title-frame"

const ROOT_DIR = path.resolve(import.meta.dir, "..")
const CLI = process.env.FMODEL_CLI ?? "D:/dev/fmodel-mcp/Cli/bin/publish/fmodel-cli.exe"
const TITLE_FRAME_LUA = process.env.TITLE_FRAME_LUA ?? "D:/dev/dna-unpack/lua/EM/Content/Script/Datas/TitleFrame.lua"
const CACHE_DIR = process.env.TITLE_FRAME_CACHE ?? path.join(ROOT_DIR, ".tmp", "titleframe-cache")
const OUTPUT_DATA = path.join(ROOT_DIR, "src", "data", "generated", "title-frame.generated.ts")
/**
 * 贴图清单：webp 文件名 → 游戏内包路径。
 *
 * 称号框贴图遇到同名冲突会被改写成带父目录前缀的名字（如 13_T_PersonalInfo_Title_13_08.webp），
 * 靠 basename 已经反查不回源 PNG。这里把映射落盘，tools/webp-import.ts 读它来补齐这些引用。
 */
const OUTPUT_TEXTURE_MANIFEST = path.join(ROOT_DIR, "src", "data", "generated", "title-frame-textures.json")
const OUTPUT_IMAGES = path.join(ROOT_DIR, "public", "imgs", "titleframe")

/** 动画时间轴刻度：UMG 默认 60000 tick / 秒。 */
const DEFAULT_TICK_RESOLUTION = 60000

const args = process.argv.slice(2)
const FORCE = args.includes("--force")
const PROBE = args.includes("--probe")

/**
 * 读取 `--key value` 形式的命令行参数。
 * @param key 参数名
 * @returns 参数值，缺省时 undefined
 */
function getArgValue(key: string): string | undefined {
    const index = args.indexOf(key)
    return index >= 0 ? args[index + 1] : undefined
}

const onlyFrames = (getArgValue("--frames") ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)

// ---------------------------------------------------------------------------
// fmodel-cli 调用与缓存
// ---------------------------------------------------------------------------

/**
 * 调用 fmodel-cli 并解析其 stdout JSON。
 * @param cliArgs 子命令与参数
 * @returns 解析后的 JSON 对象
 */
function runCli(cliArgs: string[]): Record<string, any> {
    const result = spawnSync(CLI, cliArgs, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
    if (result.error) throw result.error
    const stdout = (result.stdout ?? "").trim()
    if (!stdout) throw new Error(`fmodel-cli ${cliArgs.join(" ")} 无输出：${result.stderr ?? ""}`)
    const parsed = JSON.parse(stdout) as Record<string, any>
    if (parsed.ok !== true) throw new Error(`fmodel-cli ${cliArgs.join(" ")} 失败：${JSON.stringify(parsed).slice(0, 500)}`)
    return parsed
}

/**
 * 缓存文件名：把包路径转成安全的扁平文件名。
 * @param kind 缓存类别
 * @param pkg 包路径
 * @returns 缓存文件的绝对路径
 */
function cachePathFor(kind: string, pkg: string): string {
    return path.join(CACHE_DIR, `${kind}__${pkg.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`)
}

/**
 * 读取（带缓存）某个包的导出对象 JSON。
 * @param pkg 包路径，例如 `EM/Content/.../WBP_PersonalInfo_Title_07_1`
 * @returns 导出对象数组
 */
function readPackage(pkg: string): Record<string, any>[] {
    const cacheFile = cachePathFor("read", pkg)
    if (!FORCE && fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    }
    const payload = runCli(["read", pkg])
    const objects = payload.objects as Record<string, any>[]
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(objects), "utf8")
    return objects
}

/** 材质摘要。 */
interface MaterialSummary {
    parent: string | null
    blendMode: string | null
    textures: { name: string | null; objectName: string | null; objectPath: string | null }[]
    scalars: { name: string | null; value: number }[]
    vectors: { name: string | null; r: number; g: number; b: number; a: number }[]
}

/**
 * 读取（带缓存）材质实例摘要。
 * @param pkg 材质包路径
 * @returns 材质摘要
 */
function inspectMaterial(pkg: string): MaterialSummary {
    const cacheFile = cachePathFor("mi", pkg)
    if (!FORCE && fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    }
    const payload = runCli(["inspect", pkg])
    const summary = (payload.objects as MaterialSummary[])[0]
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(summary), "utf8")
    return summary
}

/**
 * 导出贴图 PNG（带缓存），返回 PNG 绝对路径与尺寸。
 * @param pkg 贴图包路径
 * @returns PNG 路径与宽高
 */
function exportTexture(pkg: string): { pngPath: string; width: number; height: number } {
    const cacheFile = cachePathFor("tex", pkg)
    if (!FORCE && fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    }
    const payload = runCli(["export-tex", pkg])
    const info = { pngPath: String(payload.outputPath), width: Number(payload.width), height: Number(payload.height) }
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(info), "utf8")
    return info
}

// ---------------------------------------------------------------------------
// 包路径工具
// ---------------------------------------------------------------------------

/**
 * 从 `MaterialInstanceConstant'Pkg/X.MI_Name'` 取出叶名。
 * @param ref 形如 `Type'Path.Name'` 的引用
 * @returns 叶名
 */
function refLeaf(ref: string | undefined): string {
    const inner = /'([^']+)'$/.exec(ref ?? "")?.[1]
    if (!inner) return ref ?? ""
    const dot = inner.lastIndexOf(".")
    return dot >= 0 ? inner.slice(dot + 1) : inner
}

/**
 * 取出引用里的完整对象路径（不含类型名与引号）。
 * @param ref 形如 `Type'Path.Name'` 的引用
 * @returns 完整对象路径
 */
function refPath(ref: string | undefined): string {
    return /'([^']+)'$/.exec(ref ?? "")?.[1] ?? ""
}

/**
 * 从引用里取出父级路径（去掉最后一节叶名）。
 * @param ref 形如 `Type'Path.Name'` 的引用
 * @returns 父级路径
 */
function refOuter(ref: string | undefined): string {
    const inner = refPath(ref)
    if (!inner) return ""
    const dot = inner.lastIndexOf(".")
    return dot >= 0 ? inner.slice(0, dot) : inner
}

/**
 * 把 `EM/Content/.../Name.0` 形式的 ObjectPath 归一成包路径。
 * @param objectPath 对象路径
 * @returns 包路径
 */
function objectPathToPackage(objectPath: string | undefined): string {
    return (objectPath ?? "").replace(/\\/g, "/").replace(/\.\d+$/, "")
}

// ---------------------------------------------------------------------------
// 控件树解析
// ---------------------------------------------------------------------------

/** 归一化后的 Slot 节点。 */
interface WidgetSlot {
    type: string
    name: string
    props: Record<string, any>
    content: WidgetNode | null
}

/** 归一化后的控件节点。 */
interface WidgetNode {
    type: string
    name: string
    props: Record<string, any>
    slots: WidgetSlot[]
}

/** 以 `Name\0Outer` 为键的对象索引。 */
type ObjectIndex = Map<string, Record<string, any>>

/**
 * 建立对象索引（同名对象靠所属父级路径区分）。
 *
 * 导出对象自身没有路径字段，但 `Outer.ObjectName` 里带的是其父级的完整路径，
 * 因此 `父级路径 + 叶名` 就是该对象的完整路径，正好与其它对象引用它的方式一致。
 *
 * @param objects 包内导出对象
 * @returns 索引
 */
function buildIndex(objects: Record<string, any>[]): ObjectIndex {
    const index: ObjectIndex = new Map()
    for (const object of objects) {
        index.set(`${object.Name}\u0000${refPath(object.Outer?.ObjectName)}`, object)
    }
    return index
}

/**
 * 通过引用定位对象。
 * @param index 对象索引
 * @param ref 引用文本
 * @returns 对象，找不到时 null
 */
function resolveRef(index: ObjectIndex, ref: string | undefined): Record<string, any> | null {
    if (!ref) return null
    return index.get(`${refLeaf(ref)}\u0000${refOuter(ref)}`) ?? null
}

/**
 * 把扁平导出对象列表还原成控件树。
 * @param objects 包内导出对象
 * @returns 根控件节点，找不到时返回 null
 */
function buildWidgetTree(objects: Record<string, any>[]): WidgetNode | null {
    const index = buildIndex(objects)
    const treeObject = objects.find(object => object.Type === "WidgetTree")
    if (!treeObject) return null

    const toNode = (object: Record<string, any>): WidgetNode => {
        const slots: WidgetSlot[] = []
        for (const slotRef of object.Properties?.Slots ?? []) {
            const slotObject = resolveRef(index, slotRef.ObjectName)
            if (!slotObject) continue
            const contentObject = resolveRef(index, slotObject.Properties?.Content?.ObjectName)
            slots.push({
                type: slotObject.Type,
                name: slotObject.Name,
                props: slotObject.Properties ?? {},
                content: contentObject ? toNode(contentObject) : null,
            })
        }
        return { type: object.Type, name: object.Name, props: object.Properties ?? {}, slots }
    }

    const root = resolveRef(index, treeObject.Properties?.RootWidget?.ObjectName)
    return root ? toNode(root) : null
}

/**
 * 读取控件级 RenderTransform。
 * @param node 控件节点
 * @returns 平移/缩放/切变/旋转
 */
function readRenderTransform(node: WidgetNode): {
    translation: number[]
    scale: number[]
    shear: number[]
    rotation: number
} {
    const transform = node.props.RenderTransform ?? {}
    return {
        translation: [Number(transform.Translation?.X ?? 0), Number(transform.Translation?.Y ?? 0)],
        scale: [Number(transform.Scale?.X ?? 1), Number(transform.Scale?.Y ?? 1)],
        shear: [Number(transform.Shear?.X ?? 0), Number(transform.Shear?.Y ?? 0)],
        rotation: Number(transform.Angle ?? 0),
    }
}

/**
 * OverlaySlot 水平对齐枚举 → 内部枚举。
 *
 * 导出会省略等于 CDO 默认值的属性：`WBP_PersonalInfo_Title_12_1` 里每个槽位都显式写了
 * `HAlign_Center`，说明默认值不是 Center；再结合实机截图（未写对齐的装饰件贴在左边缘），
 * 可知 UOverlaySlot 的默认值是 `HAlign_Left` / `VAlign_Top`。
 *
 * @param value UE 枚举字符串，缺省表示默认值
 * @returns 内部枚举
 */
function mapAlignH(value: string | undefined): TitleFrameAlignH {
    if (value === "HAlign_Left") return "left"
    if (value === "HAlign_Center") return "center"
    if (value === "HAlign_Right") return "right"
    if (value === "HAlign_Fill") return "fill"
    return "left"
}

/**
 * OverlaySlot 垂直对齐枚举 → 内部枚举。
 * @param value UE 枚举字符串，缺省表示默认值
 * @returns 内部枚举
 */
function mapAlignV(value: string | undefined): TitleFrameAlignV {
    if (value === "VAlign_Top") return "top"
    if (value === "VAlign_Center") return "center"
    if (value === "VAlign_Bottom") return "bottom"
    if (value === "VAlign_Fill") return "fill"
    return "top"
}

/**
 * 读取 OverlaySlot 的 Padding（缺省为 0）。
 * @param slot Slot 节点
 * @returns [left, top, right, bottom]
 */
function readPadding(slot: WidgetSlot | null): number[] {
    const padding = slot?.props.Padding ?? {}
    return [Number(padding.Left ?? 0), Number(padding.Top ?? 0), Number(padding.Right ?? 0), Number(padding.Bottom ?? 0)]
}

/**
 * TextBlock 对齐枚举 → 内部枚举。
 * @param value UE 枚举字符串
 * @returns 内部枚举
 */
function mapJustify(value: string | undefined): "left" | "center" | "right" {
    if (value === "ETextJustify::Left") return "left"
    if (value === "ETextJustify::Right") return "right"
    return "center"
}

/**
 * 读取 RenderOpacity。
 * @param node 控件节点
 * @returns 不透明度
 */
function readOpacity(node: WidgetNode): number {
    return node.props.RenderOpacity === undefined ? 1 : Number(node.props.RenderOpacity)
}

/**
 * 读取画笔色调：Brush.TintColor 与 ColorAndOpacity 相乘。
 * @param node 控件节点
 * @returns [r, g, b, a]，两者都缺省时返回 null
 */
function readTint(node: WidgetNode): number[] | null {
    const brush = node.props.Brush?.TintColor?.SpecifiedColor
    const color = node.props.ColorAndOpacity?.SpecifiedColor
    if (!brush && !color) return null
    const pick = (source: any, key: string, fallback: number) => Number(source?.[key] ?? fallback)
    return [
        pick(brush, "R", 1) * pick(color, "R", 1),
        pick(brush, "G", 1) * pick(color, "G", 1),
        pick(brush, "B", 1) * pick(color, "B", 1),
        pick(brush, "A", 1) * pick(color, "A", 1),
    ]
}

/** 画笔描述。 */
interface BrushRef {
    kind: "texture" | "material" | "none"
    pkg: string
    name: string
    tint: number[] | null
}

/**
 * 读取画笔资源。
 * @param node Image 控件
 * @returns 画笔描述
 */
function readBrush(node: WidgetNode): BrushRef {
    const resource = node.props.Brush?.ResourceObject
    const objectName = String(resource?.ObjectName ?? "")
    const pkg = objectPathToPackage(resource?.ObjectPath)
    const tint = readTint(node)
    if (objectName.startsWith("MaterialInstanceConstant")) {
        return { kind: "material", pkg, name: refLeaf(objectName), tint }
    }
    if (objectName.startsWith("Texture2D")) {
        return { kind: "texture", pkg, name: refLeaf(objectName), tint }
    }
    return { kind: "none", pkg, name: refLeaf(objectName), tint }
}

/** 贴图包路径 → 原始尺寸（导入尺寸，用于比例打分与 ImageSize 兜底）。 */
const textureSizes = new Map<string, { width: number; height: number }>()

/**
 * 读取贴图尺寸（带缓存）。纹理包很小，`read` 比 `export-tex` 快得多且不落盘。
 * @param pkg 贴图包路径
 * @returns 尺寸，读取失败时 null
 */
function readTextureSize(pkg: string): { width: number; height: number } | null {
    const cached = textureSizes.get(pkg)
    if (cached) return cached
    try {
        const objects = readPackage(pkg)
        const texture = objects.find(object => object.Type === "Texture2D" || object.Type === "Texture2DArray")
        const size = texture?.Properties?.ImportedSize
        if (!size) return null
        const info = { width: Number(size.X), height: Number(size.Y) }
        textureSizes.set(pkg, info)
        return info
    } catch {
        return null
    }
}

/**
 * 读取画笔期望尺寸（UImage 默认 32×32）。
 *
 * 所有称号框的 Image 都带 `bUsing4KImageDesign: true`：Brush.ImageSize 是按 4K 设计稿
 * 标注的，实际绘制尺寸要乘 0.5。实机截图可以验证——1.3 赛季左侧的金色环饰 ImageSize
 * 是 120，截图中在 UI 缩放 1.7 下约 100px，即 60 个设计单位，正好是一半。
 * 不做这步换算时 12_x/13_x 的底图会被当成 512×128 绘制，比其他赛季明显大一倍。
 *
 * @param node Image 控件
 * @returns 期望尺寸（已换算到实际设计单位）
 */
function readBrushSize(node: WidgetNode): { width: number; height: number } {
    const size = node.props.Brush?.ImageSize
    const width = Number(size?.X ?? 0)
    const height = Number(size?.Y ?? 0)
    const scale = node.props.bUsing4KImageDesign ? 0.5 : 1
    if (width > 0 && height > 0) return { width: width * scale, height: height * scale }
    const brush = readBrush(node)
    const natural = readTextureSize(brush.pkg)
    return {
        width: (width || natural?.width || 32) * scale,
        height: (height || natural?.height || 32) * scale,
    }
}

// ---------------------------------------------------------------------------
// 布局
// ---------------------------------------------------------------------------

/** 舞台坐标系中的矩形。 */
interface Rect {
    left: number
    top: number
    width: number
    height: number
}

/** 布局过程中收集到的图层。 */
interface LayerDraft {
    node: WidgetNode
    slot: WidgetSlot | null
    brush: BrushRef
    rect: Rect
    order: number
}

/** 布局上下文。 */
interface LayoutContext {
    layers: LayerDraft[]
    text: TitleFrameTextStyle | null
    order: number
}

/**
 * 计算控件在父级中的期望尺寸（Slate 的 DesiredSize）。
 * @param node 控件节点
 * @param parentWidth 父级宽度
 * @param parentHeight 父级高度
 * @returns 期望尺寸
 */
function measure(node: WidgetNode, parentWidth: number, parentHeight: number): { width: number; height: number } {
    switch (node.type) {
        case "SizeBox": {
            const width = Number(node.props.WidthOverride ?? 0)
            const height = Number(node.props.HeightOverride ?? 0)
            const child = node.slots[0]?.content
            const childSize = child ? measure(child, width || parentWidth, height || parentHeight) : { width: 0, height: 0 }
            return { width: width || childSize.width, height: height || childSize.height }
        }
        case "Image":
            return readBrushSize(node)
        case "TextBlock": {
            // 文字控件的实际尺寸由文本内容决定，这里用换行宽度与字号给出一个稳定近似值
            const fontSize = Number(node.props.Font?.Size ?? 15) || 15
            return { width: Number(node.props.WrapTextAt ?? 0) || 0, height: Math.ceil(fontSize * 1.4) }
        }
        case "ScaleBox": {
            const child = node.slots[0]?.content
            return child ? measure(child, parentWidth, parentHeight) : { width: 0, height: 0 }
        }
        case "Overlay": {
            let width = 0
            let height = 0
            for (const slot of node.slots) {
                if (!slot.content) continue
                const childSize = measure(slot.content, parentWidth, parentHeight)
                const padding = readPadding(slot)
                if (mapAlignH(slot.props.HorizontalAlignment) !== "fill") {
                    width = Math.max(width, childSize.width + padding[0] + padding[2])
                }
                if (mapAlignV(slot.props.VerticalAlignment) !== "fill") {
                    height = Math.max(height, childSize.height + padding[1] + padding[3])
                }
            }
            return { width, height }
        }
        case "CanvasPanel": {
            let width = 0
            let height = 0
            for (const slot of node.slots) {
                if (!slot.content) continue
                const rect = arrangeCanvasSlot(slot.props, parentWidth, parentHeight, measure(slot.content, parentWidth, parentHeight))
                width = Math.max(width, rect.left + rect.width)
                height = Math.max(height, rect.top + rect.height)
            }
            return { width, height }
        }
        default:
            return { width: 0, height: 0 }
    }
}

/**
 * 计算 CanvasPanelSlot 的子控件矩形（对齐 UMG 的锚点/偏移/对齐规则）。
 * @param slotProps CanvasPanelSlot 的属性
 * @param parentWidth 父级宽度
 * @param parentHeight 父级高度
 * @param desired 子控件期望尺寸
 * @returns 子控件矩形
 */
function arrangeCanvasSlot(
    slotProps: Record<string, any>,
    parentWidth: number,
    parentHeight: number,
    desired: { width: number; height: number }
): Rect {
    const layout = slotProps.LayoutData ?? {}
    const offsets = layout.Offsets ?? {}
    const anchors = layout.Anchors ?? {}
    const alignment = layout.Alignment ?? {}
    const minX = Number(anchors.Minimum?.X ?? 0)
    const minY = Number(anchors.Minimum?.Y ?? 0)
    const maxX = Number(anchors.Maximum?.X ?? 0)
    const maxY = Number(anchors.Maximum?.Y ?? 0)
    const offLeft = Number(offsets.Left ?? 0)
    const offTop = Number(offsets.Top ?? 0)
    const offRight = Number(offsets.Right ?? 0)
    const offBottom = Number(offsets.Bottom ?? 0)

    const stretchX = maxX > minX
    const stretchY = maxY > minY
    const width = stretchX ? parentWidth * (maxX - minX) + offRight - offLeft : offRight || desired.width
    const height = stretchY ? parentHeight * (maxY - minY) + offBottom - offTop : offBottom || desired.height
    return {
        left: parentWidth * minX + offLeft - width * Number(alignment.X ?? 0),
        top: parentHeight * minY + offTop - height * Number(alignment.Y ?? 0),
        width,
        height,
    }
}

/**
 * 递归排布控件树，收集图层与文字样式。
 * @param node 当前控件
 * @param slot 当前控件所属的 Slot（根为 null）
 * @param rect 当前控件在舞台中的矩形
 * @param ctx 收集上下文
 */
function layout(node: WidgetNode, slot: WidgetSlot | null, rect: Rect, ctx: LayoutContext): void {
    switch (node.type) {
        case "CanvasPanel": {
            for (const child of node.slots) {
                if (!child.content) continue
                const childRect = arrangeCanvasSlot(child.props, rect.width, rect.height, measure(child.content, rect.width, rect.height))
                layout(
                    child.content,
                    child,
                    { left: rect.left + childRect.left, top: rect.top + childRect.top, width: childRect.width, height: childRect.height },
                    ctx
                )
            }
            return
        }
        case "SizeBox": {
            const width = Number(node.props.WidthOverride ?? 0) || rect.width
            const height = Number(node.props.HeightOverride ?? 0) || rect.height
            const child = node.slots[0]
            if (child?.content) layout(child.content, child, { left: rect.left, top: rect.top, width, height }, ctx)
            return
        }
        case "ScaleBox": {
            // ScaleBox（DownOnly）只负责把文字缩到框内，这里直接按可用区域继续下钻
            const child = node.slots[0]
            if (child?.content) layout(child.content, child, rect, ctx)
            return
        }
        case "Overlay": {
            for (const child of node.slots) {
                if (!child.content) continue
                const alignH = mapAlignH(child.props.HorizontalAlignment)
                const alignV = mapAlignV(child.props.VerticalAlignment)
                const padding = readPadding(child)
                const desired = measure(child.content, rect.width, rect.height)
                const width = alignH === "fill" ? rect.width - padding[0] - padding[2] : desired.width
                const height = alignV === "fill" ? rect.height - padding[1] - padding[3] : desired.height

                let left: number
                if (alignH === "right") left = rect.width - width - padding[2]
                else if (alignH === "center") left = (rect.width - width + padding[0] - padding[2]) / 2
                else left = padding[0]

                let top: number
                if (alignV === "bottom") top = rect.height - height - padding[3]
                else if (alignV === "center") top = (rect.height - height + padding[1] - padding[3]) / 2
                else top = padding[1]

                layout(child.content, child, { left: rect.left + left, top: rect.top + top, width, height }, ctx)
            }
            return
        }
        case "Image": {
            ctx.layers.push({ node, slot, brush: readBrush(node), rect, order: ctx.order++ })
            return
        }
        case "TextBlock": {
            const color = node.props.ColorAndOpacity?.SpecifiedColor
            const toByte = (value: number) => Math.round(Math.min(1, Math.max(0, Number(value ?? 1))) * 255)
            ctx.text = {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                fontSize: Number(node.props.Font?.Size ?? 15) || 15,
                wrapAt: Number(node.props.WrapTextAt ?? 0) || 0,
                marginBottom: Number(node.props.Margin?.Bottom ?? 0) || 0,
                justify: mapJustify(node.props.Justification),
                color: color
                    ? `rgba(${toByte(color.R)}, ${toByte(color.G)}, ${toByte(color.B)}, ${Number(Number(color.A ?? 1).toFixed(3))})`
                    : "#ffffff",
            }
            return
        }
        default:
            return
    }
}

/**
 * 找到定义舞台尺寸的 SizeBox（所有称号框都以 SizeBox 固定尺寸）。
 * @param node 控件节点
 * @returns 尺寸，找不到时 null
 */
function findStageSize(node: WidgetNode): { width: number; height: number } | null {
    if (node.type === "SizeBox") {
        const width = Number(node.props.WidthOverride ?? 0)
        const height = Number(node.props.HeightOverride ?? 0)
        if (width > 0 && height > 0) return { width, height }
    }
    for (const slot of node.slots) {
        if (!slot.content) continue
        const found = findStageSize(slot.content)
        if (found) return found
    }
    return null
}

// ---------------------------------------------------------------------------
// 动画解析
// ---------------------------------------------------------------------------

/**
 * 把 UE tick 转成毫秒。
 * @param ticks tick 数
 * @param tickResolution 每秒 tick 数
 * @returns 毫秒
 */
function ticksToMs(ticks: number, tickResolution = DEFAULT_TICK_RESOLUTION): number {
    return (ticks / tickResolution) * 1000
}

/**
 * 解析一个 FRichCurve。
 * @param raw 曲线原始 JSON
 * @returns 曲线数据，空曲线返回 undefined
 */
function parseCurve(raw: any): TitleFrameCurve | undefined {
    const rawTimes: any[] = raw?.Times ?? []
    if (rawTimes.length === 0) return undefined
    const tickResolution = Number(raw?.TickResolution?.Numerator ?? DEFAULT_TICK_RESOLUTION) || DEFAULT_TICK_RESOLUTION
    const rawValues: any[] = raw?.Values ?? []
    return {
        times: rawTimes.map(item => ticksToMs(Number(item.Value ?? 0), tickResolution)),
        values: rawValues.map(item => Number(item.Value ?? 0)),
        interp: rawValues.map(item => Number(item.InterpMode ?? 1)),
    }
}

/**
 * 解析 MovieScene2DTransformSection 的 7 条曲线。
 * @param props section 属性
 * @returns 变换曲线集合
 */
function parseTransformCurves(props: Record<string, any>) {
    return {
        translateX: parseCurve(props.Translation),
        translateY: parseCurve(props["Translation[1]"]),
        rotation: parseCurve(props.Rotation),
        scaleX: parseCurve(props.Scale),
        scaleY: parseCurve(props["Scale[1]"]),
        shearX: parseCurve(props.Shear),
        shearY: parseCurve(props["Shear[1]"]),
    }
}

/**
 * 解析单个 WBP 的三段动画。
 * @param objects 包内导出对象
 * @returns 动画标签（小写）→ 动画数据
 */
function parseAnimations(objects: Record<string, any>[]): Record<string, TitleFrameAnimation> {
    const index = buildIndex(objects)
    const result: Record<string, TitleFrameAnimation> = {}

    for (const animation of objects) {
        if (animation.Type !== "WidgetAnimation") continue
        const label = String(animation.Properties?.DisplayLabel ?? animation.Name.replace(/_INST$/, "")).toLowerCase()
        const scene = resolveRef(index, animation.Properties?.MovieScene?.ObjectName)
        if (!scene) continue

        const range = scene.Properties?.PlaybackRange?.Value
        const upper = Number(range?.UpperBound?.Value?.Value ?? 0)
        const lower = Number(range?.LowerBound?.Value?.Value ?? 0)
        const durationMs = ticksToMs(Math.max(0, upper - lower))

        const tracks: Record<string, TitleFrameLayerTrack> = {}
        for (const binding of scene.Properties?.ObjectBindings ?? []) {
            const widgetName = String(binding.BindingName ?? "")
            if (!widgetName) continue
            // 轨道接口是只读的，用局部变量拼好再整体赋值
            let opacityCurve: TitleFrameCurve | undefined
            let transformCurves: TitleFrameTransformCurves | undefined
            let scalarCurves: Record<string, TitleFrameCurve> | undefined

            for (const trackRef of binding.Tracks ?? []) {
                const trackObject = resolveRef(index, trackRef.ObjectName)
                if (!trackObject) continue
                const sectionRef = trackObject.Properties?.Sections?.[0]
                if (!sectionRef) continue
                const section = resolveRef(index, sectionRef.ObjectName)
                if (!section) continue
                const props = section.Properties ?? {}

                if (
                    trackObject.Type === "MovieSceneFloatTrack" &&
                    trackObject.Properties?.PropertyBinding?.PropertyName === "RenderOpacity"
                ) {
                    opacityCurve = parseCurve(props.FloatCurve) ?? opacityCurve
                } else if (trackObject.Type === "MovieScene2DTransformTrack") {
                    transformCurves = parseTransformCurves(props)
                } else if (trackObject.Type === "MovieSceneWidgetMaterialTrack") {
                    const scalars: Record<string, TitleFrameCurve> = {}
                    for (const entry of props.ScalarParameterNamesAndCurves ?? []) {
                        const curve = parseCurve(entry.ParameterCurve)
                        if (curve && entry.ParameterName) scalars[String(entry.ParameterName)] = curve
                    }
                    if (Object.keys(scalars).length > 0) {
                        scalarCurves = scalars
                    }
                }
            }

            if (opacityCurve || transformCurves || scalarCurves) {
                const track: TitleFrameLayerTrack = {
                    ...(opacityCurve ? { opacity: opacityCurve } : {}),
                    ...(transformCurves ? { transform: transformCurves } : {}),
                    ...(scalarCurves ? { scalars: scalarCurves } : {}),
                }
                tracks[widgetName] = track
            }
        }

        result[label] = { durationMs, tracks }
    }

    return result
}

// ---------------------------------------------------------------------------
// 材质 → 贴图/混色
// ---------------------------------------------------------------------------

/** 基础材质（UMaterial）里能拿到的参数信息。 */
interface BaseMaterialInfo {
    /** 标量参数名 → 默认值 */
    scalarDefaults: Record<string, number>
    /** 向量参数名 → 默认值 [r, g, b, a] */
    vectorDefaults: Record<string, number[]>
    /** 贴图参数名 → 默认贴图包路径 */
    textureDefaults: Record<string, string>
    /** 材质里引用到的全部贴图包路径 */
    referencedTextures: string[]
}

/** 基础材质信息缓存。 */
const baseMaterialCache = new Map<string, BaseMaterialInfo | null>()

/**
 * 读取基础材质（UMaterial）的贴图参数默认值与引用贴图。
 *
 * 材质实例只记录被覆写的参数，主贴图常常来自父材质的默认值，因此必须往上追一层。
 *
 * `CachedExpressionData.Parameters` 里按参数类型分组的 `RuntimeEntries[i]` 保存
 * 参数名，而 `ScalarValues` / `VectorValues` / `TextureValues` 是与之平级的默认值数组；
 * 贴图组用「参数个数与 TextureValues 个数一致」来配对。
 *
 * @param pkg 材质包路径
 * @returns 基础材质信息，读取失败时 null
 */
function readBaseMaterial(pkg: string): BaseMaterialInfo | null {
    if (baseMaterialCache.has(pkg)) return baseMaterialCache.get(pkg) ?? null
    let info: BaseMaterialInfo | null = null
    try {
        const objects = readPackage(pkg)
        const material = objects.find(object => object.Type === "Material" || object.Type === "MaterialInstanceConstant")
        if (material) {
            const cached = material.Properties?.CachedExpressionData ?? {}
            const parameters = cached.Parameters ?? {}
            // 参数按类型分组存放：0=标量、1=向量、2=贴图，默认值数组与组的参数个数一一对应
            const scalarValues: any[] = parameters.ScalarValues ?? []
            const vectorValues: any[] = parameters.VectorValues ?? []
            const textureValues: any[] = parameters.TextureValues ?? []
            const groups = Object.keys(parameters)
                .filter(key => key.startsWith("RuntimeEntries"))
                .map(key => ({ key, params: (parameters[key]?.ParameterInfos ?? []) as any[] }))
                .filter(group => group.params.length > 0)
                .sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }))

            const scalarDefaults: Record<string, number> = {}
            const vectorDefaults: Record<string, number[]> = {}
            const textureDefaults: Record<string, string> = {}
            for (const group of groups) {
                const size = group.params.length
                if (size === textureValues.length && textureValues.length > 0) {
                    group.params.forEach((param, index) => {
                        const value = textureValues[index]
                        if (param?.Name && value?.ObjectPath) textureDefaults[String(param.Name)] = objectPathToPackage(value.ObjectPath)
                    })
                } else if (size === scalarValues.length && scalarValues.length > 0) {
                    group.params.forEach((param, index) => {
                        if (param?.Name) scalarDefaults[String(param.Name)] = Number(scalarValues[index])
                    })
                } else if (size === vectorValues.length && vectorValues.length > 0) {
                    group.params.forEach((param, index) => {
                        const value = vectorValues[index]
                        if (param?.Name && value) vectorDefaults[String(param.Name)] = [value.R, value.G, value.B, value.A]
                    })
                }
            }
            const referencedTextures: string[] = (cached.ReferencedTextures ?? [])
                .map((item: any) => objectPathToPackage(item?.ObjectPath))
                .filter(Boolean)
            info = { scalarDefaults, vectorDefaults, textureDefaults, referencedTextures }
        }
    } catch {
        info = null
    }
    baseMaterialCache.set(pkg, info)
    return info
}

/**
 * 把材质实例父级路径归一成包路径（去掉 `.0` 之类的导出下标）。
 * @param parent inspect 返回的父级路径
 * @returns 包路径，缺省时 null
 */
function parentToPackage(parent: string | null): string | null {
    if (!parent) return null
    return parent.replace(/\.\d+$/, "")
}

/** 贴图参数名优先级：分数越高越可能是「主贴图」。 */
const TEXTURE_PARAM_SCORES: [RegExp, number][] = [
    [/^(maintex|bgtex|basetex|basemap|maintex2d)$/i, 6],
    [/^(main|base|bg|tex|texture|colortex|diffusetex|emissivetex)$/i, 5],
    [/^(mask)$/i, 2],
    [/^(addtex|mask2)$/i, 3],
    [/noise|distortion|dissolve/i, 1],
]

/**
 * 计算某个贴图参数名的权重。
 * @param name 参数名
 * @returns 权重
 */
function scoreParameter(name: string): number {
    for (const [regex, score] of TEXTURE_PARAM_SCORES) {
        if (regex.test(name)) return score
    }
    return 2
}

/** 是否为称号框专用美术贴图（相对于通用 VX 遮罩/噪声）。 */
function isPersonalInfoArt(pkg: string): boolean {
    return /\/Texture\/Static\/Image\/PersonalInfo\//.test(pkg)
}

/**
 * 已移植着色器的基础材质 → 该着色器需要的贴图参数名。
 *
 * 只导出这些材质用到的贴图，避免为了几十个未移植材质把它们全部的贴图参数都抓下来。
 */
const PORTED_MATERIAL_TEXTURES: Record<string, string[]> = {
    M_UIBasic: ["MainTex", "Mask", "Mask2"],
    M_BasicVX01: ["MainTex", "Mask", "Mask2"],
    M_PersonalInfo_Title_8: ["MainTex", "DistortionTex"],
}

/** 贴图选择结果。 */
interface TextureChoice {
    /** 提供颜色的主贴图 */
    pkg: string
    parameter: string
    /** 提供形状的遮罩贴图（Mask / Mask2），按顺序相乘 */
    masks: string[]
}

/**
 * 列出某个材质实例可能的贴图候选（参数名 → 贴图包路径）。
 *
 * 父材质的参数默认值先铺底，材质实例的覆写再覆盖上去。
 *
 * @param material 材质实例摘要
 * @returns 参数名 → 贴图包路径
 */
function collectTextureCandidates(material: MaterialSummary): Map<string, string> {
    const parentPkg = parentToPackage(material.parent)
    const base = parentPkg ? readBaseMaterial(parentPkg) : null
    const candidates = new Map<string, string>()
    for (const [name, pkg] of Object.entries(base?.textureDefaults ?? {})) {
        candidates.set(name, pkg)
    }
    for (const entry of material.textures) {
        const pkg = objectPathToPackage(entry.objectPath ?? undefined)
        if (pkg && entry.name) candidates.set(String(entry.name), pkg)
    }
    return candidates
}

/**
 * 依据材质实例 + 父材质挑出该图层应绘制的贴图。
 *
 * 评分规则（从高到低）：
 *   1. 参数名语义（MainTex/BgTex 等主贴图 > AddTex/Mask > 噪声/扰动）；
 *   2. 称号框专用美术贴图优先于通用 VX 遮罩/噪声；
 *   3. 贴图宽高比与控件期望尺寸一致时加分（美术通常按贴图原始比例设置控件尺寸）。
 *
 * 另外把 `Mask` / `Mask2` 参数收集成遮罩链：这两张才是真正的形状，
 * `MainTex` 往往只是一张 4×4 纯白用来占位提供颜色（见 `TitleFrameLayer.masks`）。
 *
 * @param material 材质实例摘要
 * @param brush 控件期望尺寸，用于比例打分
 * @returns 选中的贴图、来源参数名与遮罩链
 */
function chooseTexture(material: MaterialSummary, brush: { width: number; height: number }): TextureChoice | null {
    const candidates = collectTextureCandidates(material)
    const brushAspect = brush.width > 0 && brush.height > 0 ? brush.width / brush.height : 0

    let best: { name: string; pkg: string } | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const [name, pkg] of candidates) {
        const size = textureSizes.get(pkg)
        let score = scoreParameter(name) * 100 + (isPersonalInfoArt(pkg) ? 20 : 0)
        if (size && brushAspect > 0 && size.height > 0) {
            const ratio = size.width / size.height / brushAspect
            if (ratio > 0.92 && ratio < 1.08) score += 30
        }
        if (score > bestScore) {
            bestScore = score
            best = { name, pkg }
        }
    }

    // 遮罩只取材质实例自己覆写的 Mask / Mask2：父材质上挂的默认遮罩（往往是通用
    // 装饰图）并不代表每个实例都想裁剪形状，例如 MI_PersonalInfo_Title_7_BG 系列的
    // 父材质带了一张圆环 Mask，但两块底图都应当是完整横幅。
    const masks: string[] = []
    for (const entry of material.textures) {
        if (entry.name !== "Mask" && entry.name !== "Mask2") continue
        const pkg = objectPathToPackage(entry.objectPath ?? undefined)
        if (pkg && !masks.includes(pkg)) masks.push(pkg)
    }

    if (best) return { pkg: best.pkg, parameter: best.name, masks }

    const base = readBaseMaterial(parentToPackage(material.parent) ?? "")
    const art = (base?.referencedTextures ?? []).find(pkg => isPersonalInfoArt(pkg))
    if (art) return { pkg: art, parameter: "(referenced)", masks }
    const any = base?.referencedTextures?.[0]
    return any ? { pkg: any, parameter: "(referenced)", masks } : null
}

/**
 * 汇总某个材质实例的具名参数取值：基础材质默认值铺底，材质实例的覆写覆盖上去。
 *
 * 移植着色器时按参数名绑定即可，不需要常量缓冲的槽位顺序——打包把 uniform 反射裁掉了，
 * 槽位无法反查，但参数名与取值在材质资源里是完整的。
 *
 * @param material 材质实例摘要
 * @returns 参数名 → 数值或 [r, g, b, a]
 */
function collectMaterialParams(material: MaterialSummary): Record<string, number | number[]> {
    const parentPkg = parentToPackage(material.parent)
    const base = parentPkg ? readBaseMaterial(parentPkg) : null
    const params: Record<string, number | number[]> = {}
    Object.assign(params, base?.scalarDefaults ?? {})
    Object.assign(params, base?.vectorDefaults ?? {})
    for (const scalar of material.scalars ?? []) {
        if (scalar.name) params[String(scalar.name)] = Number(scalar.value)
    }
    for (const vector of material.vectors ?? []) {
        if (vector.name) params[String(vector.name)] = [vector.r, vector.g, vector.b, vector.a]
    }
    return params
}

/**
 * 材质混合模式 → 渲染混色策略。
 * @param blendMode UE BlendMode 枚举
 * @returns 内部混色枚举
 */
function mapBlendMode(blendMode: string | null): TitleFrameBlend {
    if (blendMode === "BLEND_Additive" || blendMode === "BLEND_AdditiveComposite") return "add"
    if (blendMode === "BLEND_Modulate") return "multiply"
    return "normal"
}

// ---------------------------------------------------------------------------
// 贴图导出
// ---------------------------------------------------------------------------

/**
 * 为所有贴图分配不冲突的 webp 文件名（同名不同目录时用父目录前缀区分）。
 * @param packages 用到的贴图包路径集合
 * @returns 包路径 → 文件名
 */
function assignTextureFileNames(packages: Set<string>): Map<string, string> {
    const names = new Map<string, string>()
    const byBase = new Map<string, string[]>()
    for (const pkg of packages) {
        const base = path.posix.basename(pkg)
        byBase.set(base, [...(byBase.get(base) ?? []), pkg])
    }
    for (const [base, list] of byBase) {
        if (list.length === 1) {
            names.set(list[0], `${base}.webp`)
            continue
        }
        for (const pkg of list) {
            const segments = pkg.split("/")
            names.set(pkg, `${segments[segments.length - 2] ?? "misc"}_${base}.webp`)
        }
    }
    return names
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/** TitleFrame.lua 解析结果。 */
interface TitleFrameEntry {
    id: number
    widget: string
}

/**
 * 解析反编译后的 TitleFrame.lua，得到 ID → WBP 映射。
 * @returns 映射列表
 */
function parseTitleFrameLua(): TitleFrameEntry[] {
    if (!fs.existsSync(TITLE_FRAME_LUA)) {
        throw new Error(`未找到 ${TITLE_FRAME_LUA}，请设置 TITLE_FRAME_LUA 指向反编译后的 TitleFrame.lua`)
    }
    const source = fs.readFileSync(TITLE_FRAME_LUA, "utf8")
    const entries: TitleFrameEntry[] = []
    const blockRegex = /\[(\d+)\]\s*=\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null
    while ((match = blockRegex.exec(source))) {
        const widget = /FramePath\s*=\s*"([^"]+)"/.exec(match[2])?.[1].match(/WBP_PersonalInfo_Title_[A-Za-z0-9_]+/)?.[0]
        if (widget) entries.push({ id: Number(match[1]), widget })
    }
    return entries
}

/**
 * 把 WBP 资源名转成稳定的 frame key，例如 `WBP_PersonalInfo_Title_07_2` → `07_2`。
 * @param widget WBP 资源名
 * @returns frame key
 */
function widgetToKey(widget: string): string {
    return widget.replace(/^WBP_PersonalInfo_Title_/, "")
}

/**
 * WBP 资源名 → 包路径。
 * @param widget WBP 资源名
 * @returns 包路径
 */
function widgetToPackage(widget: string): string {
    return `EM/Content/UI/WBP/PersonalInfo/Widget/Title/Title/${widget}`
}

/** 生成文件头部注释。 */
const GENERATED_HEADER = `/**
 * 本文件由 \`bun tools/import-title-frame.ts\` 从游戏 pak 生成，请勿手工修改。
 *
 * 数据来源：
 *   - 控件树/动画：EM/Content/UI/WBP/PersonalInfo/Widget/Title/Title/WBP_PersonalInfo_Title_*
 *   - ID 映射：EM/Content/Script/Datas/TitleFrame.lua
 *   - 材质参数：对应 MaterialInstanceConstant 的 inspect 结果
 *   - 贴图：public/imgs/titleframe/*.webp
 */
`

/** 合法标识符：可以作为对象字面量的裸键。 */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/
/** 与 biome.json 的 lineWidth 保持一致，用于决定数组是否折行。 */
const LINE_WIDTH = 140

/**
 * 把数据序列化成 Biome 风格的 TypeScript 字面量。
 *
 * 与 `JSON.stringify` 的差别：合法标识符的键不加引号、多行结构带尾逗号、
 * 纯量数组在行宽内保持单行。这样生成结果与 `biome format` 的输出一致，
 * 重新生成不会产生无谓的全文件改动。
 *
 * @param value 数据
 * @param depth 当前缩进层级
 * @returns TypeScript 字面量文本
 */
function toTsLiteral(value: unknown, depth = 0): string {
    const pad = "    ".repeat(depth)
    const innerPad = "    ".repeat(depth + 1)

    if (value === null || value === undefined) return "null"
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    if (typeof value === "string") return JSON.stringify(value)

    if (Array.isArray(value)) {
        if (value.length === 0) return "[]"
        const isScalarArray = value.every(item => item === null || ["number", "string", "boolean"].includes(typeof item))
        if (isScalarArray) {
            const parts = value.map(item => toTsLiteral(item, depth + 1))
            const single = `[${parts.join(", ")}]`
            if ((innerPad + single).length <= LINE_WIDTH) return single
            // Biome 对纯量数组按行宽「填充折行」，每行末尾都带逗号
            const lines: string[] = []
            let current = ""
            for (const part of parts) {
                const candidate = current ? `${current} ${part},` : `${innerPad}${part},`
                if (candidate.length > LINE_WIDTH && current) {
                    lines.push(current)
                    current = `${innerPad}${part},`
                } else {
                    current = candidate
                }
            }
            if (current) lines.push(current)
            return `[\n${lines.join("\n")}\n${pad}]`
        }
        const items = value.map(item => `${innerPad}${toTsLiteral(item, depth + 1)}`)
        return `[\n${items.join(",\n")},\n${pad}]`
    }

    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
    if (entries.length === 0) return "{}"
    const lines = entries.map(([key, item]) => {
        const renderedKey = IDENTIFIER_RE.test(key) ? key : JSON.stringify(key)
        return `${innerPad}${renderedKey}: ${toTsLiteral(item, depth + 1)}`
    })
    return `{\n${lines.join(",\n")},\n${pad}}`
}

/**
 * 渲染生成文件内容。
 * @param frames 称号框数据
 * @param idToKey ID → key 映射
 * @returns 文件文本
 */
function renderGeneratedFile(frames: Record<string, TitleFrameDef>, idToKey: Record<number, string>): string {
    return `${GENERATED_HEADER}
import type { TitleFrameDef } from "@/data/title-frame"

/** 全部称号框数据，key 为 WBP 资源名后缀（如 "07_2"）。 */
export const titleFrames: Record<string, TitleFrameDef> = ${toTsLiteral(frames)}

/** 称号框 ID → \`titleFrames\` 的 key。 */
export const titleFrameIdToKey: Record<number, string> = ${toTsLiteral(idToKey)}
`
}

/**
 * 主入口：解析映射 → 读包 → 解析材质与贴图 → 落盘。
 */
async function main(): Promise<void> {
    if (!fs.existsSync(CLI)) throw new Error(`未找到 fmodel-cli：${CLI}`)

    const entries = parseTitleFrameLua()
    const idsByWidget = new Map<string, number[]>()
    for (const entry of entries) {
        idsByWidget.set(entry.widget, [...(idsByWidget.get(entry.widget) ?? []), entry.id])
    }

    let widgets = [...idsByWidget.keys()].sort()
    if (onlyFrames.length > 0) {
        widgets = widgets.filter(widget => onlyFrames.includes(widgetToKey(widget)))
    }
    console.log(`称号框资源：${widgets.length} 个 WBP，共 ${entries.length} 个 ID`)

    // 阶段一：读取所有 WBP，收集图层草稿与材质/贴图清单
    interface Draft {
        widget: string
        objects: Record<string, any>[]
        tree: WidgetNode
    }
    const drafts: Draft[] = []
    const materialPackages = new Set<string>()
    const texturePackages = new Set<string>()

    for (const widget of widgets) {
        let objects: Record<string, any>[]
        try {
            objects = readPackage(widgetToPackage(widget))
        } catch (error) {
            // TitleFrame.lua 会包含尚未投放 / 已下线的称号框，pak 里查不到时跳过即可
            console.warn(`  ! ${widget} 读取失败，跳过：${error instanceof Error ? error.message.slice(0, 160) : error}`)
            continue
        }
        const tree = buildWidgetTree(objects)
        if (!tree) {
            console.warn(`  ! ${widget} 未找到控件树，跳过`)
            continue
        }
        drafts.push({ widget, objects, tree })
        for (const node of collectImages(tree)) {
            const brush = readBrush(node)
            if (brush.kind === "material") materialPackages.add(brush.pkg)
            if (brush.kind === "texture") texturePackages.add(brush.pkg)
        }
    }

    // 阶段二：解析材质，收集所有候选贴图并读取尺寸（尺寸参与贴图打分）
    console.log(`材质 ${materialPackages.size} 个，WBP 直引贴图 ${texturePackages.size} 张`)
    const materials = new Map<string, MaterialSummary>()
    const candidatePackages = new Set<string>(texturePackages)
    for (const pkg of materialPackages) {
        const summary = inspectMaterial(pkg)
        materials.set(pkg, summary)
        for (const candidate of collectTextureCandidates(summary).values()) candidatePackages.add(candidate)
    }
    console.log(`候选贴图 ${candidatePackages.size} 张，读取尺寸…`)
    for (const pkg of candidatePackages) readTextureSize(pkg)

    // 阶段三：排布图层（贴图选择需要控件期望尺寸，因此必须先布局）
    interface LaidOutLayer {
        frameKey: string
        widget: string
        item: LayerDraft
        brush: { width: number; height: number }
        resolved: ResolvedLayer
    }
    const laidOut: LaidOutLayer[] = []
    const stages = new Map<string, { width: number; height: number; text: TitleFrameTextStyle | null }>()
    const animationByWidget = new Map<string, Record<string, TitleFrameAnimation>>()

    for (const draft of drafts) {
        const stage = findStageSize(draft.tree) ?? measure(draft.tree, 0, 0)
        const ctx: LayoutContext = { layers: [], text: null, order: 0 }
        layout(draft.tree, null, { left: 0, top: 0, width: stage.width, height: stage.height }, ctx)
        const key = widgetToKey(draft.widget)
        stages.set(key, { width: stage.width, height: stage.height, text: ctx.text })
        animationByWidget.set(key, parseAnimations(draft.objects))

        for (const item of ctx.layers) {
            const brush = readBrushSize(item.node)
            const resolved = resolveLayer(item, materials, brush)
            if (!resolved) {
                console.warn(`  ! ${draft.widget} 图层 ${item.node.name} 无法解析贴图，已跳过`)
                continue
            }
            texturePackages.add(resolved.texturePackage)
            for (const mask of resolved.maskPackages) texturePackages.add(mask)
            for (const extra of Object.values(resolved.texturePackages)) texturePackages.add(extra)
            laidOut.push({ frameKey: key, widget: draft.widget, item, brush, resolved })
        }
    }

    if (PROBE) {
        for (const laid of laidOut) {
            const summary = materials.get(laid.item.brush.pkg)
            if (!summary) continue
            const size = textureSizes.get(laid.resolved.texturePackage)
            console.log(
                `  ${laid.frameKey}/${laid.item.node.name} brush=${laid.brush.width}×${laid.brush.height} ` +
                    `[${summary.blendMode}] parent=${parentToPackage(summary.parent) ?? "-"}\n` +
                    `      → ${path.posix.basename(laid.resolved.texturePackage)} (${laid.resolved.blend}) ` +
                    `tex=${size ? `${size.width}×${size.height}` : "?"}\n` +
                    `      params: ${summary.textures.map(entry => `${entry.name}=${path.posix.basename(objectPathToPackage(entry.objectPath ?? ""))}`).join(", ")}`
            )
        }
        console.log("probe 模式结束，未写入任何文件")
        return
    }

    // 阶段四：导出用到的贴图并转成 WebP
    const textureFileNames = assignTextureFileNames(texturePackages)
    console.log(`导出贴图 ${texturePackages.size} 张 → ${path.relative(ROOT_DIR, OUTPUT_IMAGES)}`)
    for (const pkg of texturePackages) {
        const exported = exportTexture(pkg)
        textureSizes.set(pkg, { width: exported.width, height: exported.height })
        const fileName = textureFileNames.get(pkg)
        if (!fileName) continue
        const destPath = path.join(OUTPUT_IMAGES, fileName)
        if (FORCE || !fs.existsSync(destPath)) {
            fs.mkdirSync(OUTPUT_IMAGES, { recursive: true })
            await new Bun.Image(exported.pngPath).webp({ quality: 100, lossless: true }).write(destPath)
        }
    }

    // 清理上一轮生成、这次已不再使用的贴图，避免 public/imgs/titleframe 里留下孤儿文件
    const keepNames = new Set(textureFileNames.values())
    if (fs.existsSync(OUTPUT_IMAGES)) {
        for (const file of fs.readdirSync(OUTPUT_IMAGES)) {
            if (keepNames.has(file)) continue
            fs.rmSync(path.join(OUTPUT_IMAGES, file))
            console.log(`  - 移除未再使用的贴图 ${file}`)
        }
    }

    // 写下贴图清单，供 webp-import 反查源 PNG（新文件名带前缀，basename 对不上）
    const manifest = Object.fromEntries([...textureFileNames].map(([pkg, fileName]) => [fileName, pkg]))
    fs.writeFileSync(OUTPUT_TEXTURE_MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, "utf8")
    console.log(`贴图清单 ${textureFileNames.size} 条 → ${path.relative(ROOT_DIR, OUTPUT_TEXTURE_MANIFEST)}`)

    // 阶段五：组装最终数据
    const frames: Record<string, TitleFrameDef> = {}
    const layersByFrame = new Map<string, TitleFrameLayer[]>()
    for (const laid of laidOut) {
        const fileName = textureFileNames.get(laid.resolved.texturePackage)
        if (!fileName) continue
        const masks = laid.resolved.maskPackages.map(pkg => textureFileNames.get(pkg)).filter((name): name is string => Boolean(name))
        if (laid.resolved.maskPackages.some(pkg => !textureFileNames.has(pkg))) {
            console.warn(`  ! ${laid.frameKey}/${laid.item.node.name} 有遮罩贴图未导出，已忽略`)
        }
        const size = textureSizes.get(laid.resolved.texturePackage) ?? { width: 0, height: 0 }
        const transform = readRenderTransform(laid.item.node)
        const list = layersByFrame.get(laid.frameKey) ?? []
        list.push({
            key: laid.item.node.name,
            src: `/imgs/titleframe/${fileName}`,
            masks: masks.map(name => `/imgs/titleframe/${name}`),
            textures: Object.fromEntries(
                Object.entries(laid.resolved.texturePackages)
                    .map(([param, pkg]) => [param, textureFileNames.get(pkg)])
                    .filter(([, name]) => Boolean(name))
                    .map(([param, name]) => [param, `/imgs/titleframe/${name}`])
            ),
            textureWidth: size.width,
            textureHeight: size.height,
            width: laid.brush.width,
            height: laid.brush.height,
            alignH: laid.resolved.alignH,
            alignV: laid.resolved.alignV,
            padding: laid.resolved.padding,
            translation: transform.translation,
            scale: transform.scale,
            shear: transform.shear,
            rotation: transform.rotation,
            opacity: readOpacity(laid.item.node),
            tint: laid.item.brush.tint,
            blend: laid.resolved.blend,
            params: laid.resolved.params,
            material: laid.resolved.material,
        })
        layersByFrame.set(laid.frameKey, list)
    }

    for (const draft of drafts) {
        const key = widgetToKey(draft.widget)
        const stage = stages.get(key)
        if (!stage) continue
        const animations = animationByWidget.get(key) ?? {}
        const layers = layersByFrame.get(key) ?? []
        const bounds = unionBounds(
            laidOut
                .filter(laid => laid.frameKey === key)
                .map(laid => applyStaticTransform(laid.item.rect, readRenderTransform(laid.item.node))),
            { width: stage.width, height: stage.height },
            stage.text ? [{ x: stage.text.x, y: stage.text.y, width: stage.text.width, height: stage.text.height }] : []
        )
        frames[key] = {
            key,
            ids: idsByWidget.get(draft.widget) ?? [],
            width: stage.width,
            height: stage.height,
            bounds,
            text: stage.text,
            layers,
            animations: { in: animations.in, loop: animations.loop, normal: animations.normal },
        }
        console.log(
            `  · ${key} 布局 ${stage.width}×${stage.height} 可见框 ${bounds.width}×${bounds.height} 图层 ${layers.length}` +
                `${stage.text ? " + 文字" : ""}` +
                ` 动画 ${Object.entries(animations)
                    .map(([label, value]) => `${label}:${Math.round(value.durationMs)}ms`)
                    .join(" ")}`
        )
    }

    // 只为成功导入的称号框建立 ID 映射：TitleFrame.lua 里可能存在 pak 中不存在的
    // 未投放条目（例如 WBP_PersonalInfo_Title_14_1），这些 ID 交由调用方回退处理。
    const idToKey: Record<number, string> = {}
    for (const frame of Object.values(frames)) {
        for (const id of frame.ids) idToKey[id] = frame.key
    }

    fs.mkdirSync(path.dirname(OUTPUT_DATA), { recursive: true })
    fs.writeFileSync(OUTPUT_DATA, renderGeneratedFile(frames, idToKey), "utf8")
    console.log(`已写入 ${path.relative(ROOT_DIR, OUTPUT_DATA)}（${Object.keys(frames).length} 个称号框）`)
}

/**
 * 把图层矩形按控件的静态 RenderTransform 变换一次。
 *
 * RenderTransform 以控件中心为轴心，所以缩放不改变中心点，只需重算宽高与左上角。
 *
 * @param rect 布局得到的矩形
 * @param transform 控件的静态变换
 * @returns 变换后的矩形
 */
function applyStaticTransform(
    rect: Rect,
    transform: { translation: number[]; scale: number[] }
): { x: number; y: number; width: number; height: number } {
    const width = Math.abs(rect.width * transform.scale[0])
    const height = Math.abs(rect.height * transform.scale[1])
    const centerX = rect.left + rect.width / 2 + transform.translation[0]
    const centerY = rect.top + rect.height / 2 + transform.translation[1]
    return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}

/**
 * 递归收集控件树里的所有 Image 节点。
 * @param node 控件节点
 * @returns Image 节点列表
 */
function collectImages(node: WidgetNode): WidgetNode[] {
    const result: WidgetNode[] = []
    const walk = (current: WidgetNode) => {
        if (current.type === "Image") result.push(current)
        for (const slot of current.slots) {
            if (slot.content) walk(slot.content)
        }
    }
    walk(node)
    return result
}

/** 解析后的图层信息。 */
interface ResolvedLayer {
    texturePackage: string
    /** 参与遮罩相乘的贴图包路径 */
    maskPackages: string[]
    /** 具名贴图参数 → 贴图包路径（仅已移植材质填充） */
    texturePackages: Record<string, string>
    textureWidth: number
    textureHeight: number
    blend: TitleFrameBlend
    params: Record<string, number | number[]>
    material?: string
    alignH: TitleFrameAlignH
    alignV: TitleFrameAlignV
    padding: number[]
}

/**
 * 把图层草稿解析成可渲染信息（贴图 + 混色 + 布局）。
 * @param layer 图层草稿
 * @param materials 材质摘要表
 * @param brush 控件期望尺寸，用于在多个候选贴图间按比例择优
 * @returns 解析结果，无法解析时返回 null
 */
function resolveLayer(
    layer: LayerDraft,
    materials: Map<string, MaterialSummary>,
    brush: { width: number; height: number }
): ResolvedLayer | null {
    const padding = readPadding(layer.slot)
    const alignH = mapAlignH(layer.slot?.props.HorizontalAlignment)
    const alignV = mapAlignV(layer.slot?.props.VerticalAlignment)

    const build = (pkg: string, maskPackages: string[], blend: TitleFrameBlend, material?: MaterialSummary): ResolvedLayer => {
        const size = textureSizes.get(pkg) ?? { width: 0, height: 0 }
        // 已移植的材质额外带上它需要的具名贴图，着色器按参数名绑定
        const texturePackages: Record<string, string> = {}
        if (material) {
            const baseName = (parentToPackage(material.parent) ?? "").split("/").pop() ?? ""
            const wanted = PORTED_MATERIAL_TEXTURES[baseName]
            if (wanted) {
                const candidates = collectTextureCandidates(material)
                for (const name of wanted) {
                    const found = candidates.get(name)
                    if (found) texturePackages[name] = found
                }
            }
        }
        return {
            texturePackage: pkg,
            maskPackages,
            texturePackages,
            textureWidth: size.width,
            textureHeight: size.height,
            blend,
            params: material ? collectMaterialParams(material) : {},
            material: material?.parent ?? undefined,
            alignH,
            alignV,
            padding,
        }
    }

    if (layer.brush.kind === "texture") return build(layer.brush.pkg, [], "normal")
    if (layer.brush.kind === "material") {
        const material = materials.get(layer.brush.pkg)
        if (!material) return null
        const choice = chooseTexture(material, brush)
        if (!choice) return null
        return build(
            choice.pkg,
            choice.masks.filter(pkg => pkg !== choice.pkg),
            mapBlendMode(material.blendMode),
            material
        )
    }
    return null
}

await main()
