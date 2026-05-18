import fs from "node:fs"
import path from "node:path"

const SOURCE_DIR =
    process.env.TITLE_FRAME_SOURCE_DIR || "D:/dev/dna-unpack/Fmodel/Output/Exports/EM/Content/UI/WBP/PersonalInfo/Widget/Title/Title"
const OUTPUT_FILE = process.env.TITLE_FRAME_OUTPUT || "src/data/generated/title-frame-render.generated.ts"

const FRAME_FILES = {
    "07_1": "WBP_PersonalInfo_Title_07_1.json",
    "07_2": "WBP_PersonalInfo_Title_07_2.json",
    "07_3": "WBP_PersonalInfo_Title_07_3.json",
    "07_4": "WBP_PersonalInfo_Title_07_4.json",
    "07_5": "WBP_PersonalInfo_Title_07_5.json",
    "09_1": "WBP_PersonalInfo_Title_09_1.json",
    "09_2": "WBP_PersonalInfo_Title_09_2.json",
    "09_3": "WBP_PersonalInfo_Title_09_3.json",
    "09_4": "WBP_PersonalInfo_Title_09_4.json",
    "09_5": "WBP_PersonalInfo_Title_09_5.json",
}

const RESOURCE_FALLBACK = {
    "07_1": "/imgs/rank/T_PersonalInfo_Title_03.webp",
    "07_2": "/imgs/rank/T_PersonalInfo_Title_12.webp",
    "07_3": "/imgs/rank/T_PersonalInfo_Title_07_3.webp",
    "07_4": "/imgs/rank/T_PersonalInfo_Title_07_4.webp",
    "07_5": "/imgs/rank/T_PersonalInfo_Title_07_5.webp",
    "09_1": "/imgs/rank/T_PersonalInfo_Title_03.webp",
    "09_2": "/imgs/rank/T_PersonalInfo_Title_03.webp",
    "09_3": "/imgs/rank/T_PersonalInfo_Title_09_3.webp",
    "09_4": "/imgs/rank/T_PersonalInfo_Title_09_4.webp",
    "09_5": "/imgs/rank/T_PersonalInfo_Title_09_5.webp",
}

const RESOURCE_SRC_MAP = {
    T_PersonalInfo_Title_01: "/imgs/rank/T_PersonalInfo_Title_01.webp",
    T_PersonalInfo_Title_03: "/imgs/rank/T_PersonalInfo_Title_03.webp",
    T_PersonalInfo_Title_07: "/imgs/rank/T_PersonalInfo_Title_07.webp",
    T_PersonalInfo_Title_12: "/imgs/rank/T_PersonalInfo_Title_12.webp",
    T_PersonalInfo_Title_13: "/imgs/rank/T_PersonalInfo_Title_13.webp",
    T_PersonalInfo_Title_21: "/imgs/rank/T_PersonalInfo_Title_21.webp",
    T_PersonalInfo_Title_22: "/imgs/rank/T_PersonalInfo_Title_22.webp",
    T_PersonalInfo_Title_23: "/imgs/rank/T_PersonalInfo_Title_23.webp",
    T_PersonalInfo_Title_24: "/imgs/rank/T_PersonalInfo_Title_24.webp",
    T_PersonalInfo_Title_25: "/imgs/rank/T_PersonalInfo_Title_25.webp",
    T_PersonalInfo_Title_26: "/imgs/rank/T_PersonalInfo_Title_26.webp",
    T_PersonalInfo_Title_27: "/imgs/rank/T_PersonalInfo_Title_27.webp",
    T_PersonalInfo_Title_28: "/imgs/rank/T_PersonalInfo_Title_28.webp",
    T_PersonalInfo_Title_29: "/imgs/rank/T_PersonalInfo_Title_29.webp",
    T_PersonalInfo_Title_30: "/imgs/rank/T_PersonalInfo_Title_30.webp",
    T_PersonalInfo_Title_31: "/imgs/rank/T_PersonalInfo_Title_31.webp",
    T_PersonalInfo_Title_32: "/imgs/rank/T_PersonalInfo_Title_32.webp",
    T_PersonalInfo_Title_33: "/imgs/rank/T_PersonalInfo_Title_33.webp",
    T_PersonalInfo_Title_34: "/imgs/rank/T_PersonalInfo_Title_34.webp",
    T_PersonalInfo_Title_07_3: "/imgs/rank/T_PersonalInfo_Title_07_3.webp",
    T_PersonalInfo_Title_07_4: "/imgs/rank/T_PersonalInfo_Title_07_4.webp",
    T_PersonalInfo_Title_07_5: "/imgs/rank/T_PersonalInfo_Title_07_5.webp",
}

/**
 * 将 UE tick 转成毫秒。
 */
function ticksToMs(ticks) {
    return Math.round((ticks / 60) * 1000) / 1000
}

/**
 * 从 ObjectName 中提取实际对象名。
 */
function parseObjectName(objectName) {
    const match = /'([^']+)'$/.exec(objectName || "")
    if (!match) return objectName || ""
    const inner = match[1]
    const lastDot = inner.lastIndexOf(".")
    return lastDot >= 0 ? inner.slice(lastDot + 1) : inner
}

/**
 * 从导出对象的引用里提取外层路径。
 */
function parseOuterPath(objectName) {
    const match = /'([^']+)'$/.exec(objectName || "")
    if (!match) return ""
    const inner = match[1]
    const lastDot = inner.lastIndexOf(".")
    return lastDot >= 0 ? inner.slice(0, lastDot) : inner
}

/**
 * 从引用里提取外层提示路径。
 */
function parseOuterHint(objectName) {
    const inner = /'([^']+)'$/.exec(objectName || "")?.[1] || ""
    const colonIndex = inner.indexOf(":")
    if (colonIndex < 0) return ""
    return inner
        .slice(colonIndex + 1)
        .replace(/\.OverlaySlot_.+$/, "")
        .replace(/\.[^.]+$/, "")
}

/**
 * 读取一个导出文件。
 */
function loadFrame(filePath) {
    const text = fs.readFileSync(filePath, "utf8")
    return JSON.parse(text)
}

/**
 * 建立按类型、名称和外层路径模糊匹配的查找器。
 */
function createFinder(objects) {
    return function findObject(type, name, outerIncludes = "") {
        return objects.find(item => {
            if (item.Type !== type || item.Name !== name) return false
            if (!outerIncludes) return true
            return item.Outer?.ObjectName?.includes(outerIncludes) || false
        })
    }
}

/**
 * 取导出对象里的资源名。
 */
function getResourceName(imageObject) {
    const resourceObject = imageObject?.Properties?.Brush?.ResourceObject?.ObjectName
    if (!resourceObject) return ""
    const match = /'([^']+)'/.exec(resourceObject)
    return match ? match[1] : resourceObject
}

/**
 * 读取刷子的 tint 色值。
 */
function getBrushTintColor(imageObject) {
    const tint = imageObject?.Properties?.Brush?.TintColor?.SpecifiedColor
    if (!tint) return ""
    const alpha = Math.round((tint.A ?? 1) * 255)
    const red = Math.round((tint.R ?? 1) * 255)
    const green = Math.round((tint.G ?? 1) * 255)
    const blue = Math.round((tint.B ?? 1) * 255)
    return `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(4))})`
}

/**
 * 读取刷子的原始尺寸。
 */
function getBrushImageSize(imageObject) {
    const imageSize = imageObject?.Properties?.Brush?.ImageSize
    return {
        width: imageSize?.X || 0,
        height: imageSize?.Y || 0,
    }
}

/**
 * 读取静态渲染位移。
 */
function getRenderTranslation(imageObject) {
    const translation = imageObject?.Properties?.RenderTransform?.Translation
    return {
        x: translation?.X || 0,
        y: translation?.Y || 0,
    }
}

/**
 * 读取静态渲染缩放。
 */
function getRenderScale(imageObject) {
    const scale = imageObject?.Properties?.RenderTransform?.Scale
    return {
        x: scale?.X || 1,
        y: scale?.Y || 1,
    }
}

/**
 * 读取 OverlaySlot 的布局数据。
 */
function getOverlaySlotLayout(slotObject) {
    const props = slotObject?.Properties || {}
    const padding = props.Padding || {}
    return {
        horizontalAlignment: props.HorizontalAlignment || undefined,
        verticalAlignment: props.VerticalAlignment || undefined,
        padding: {
            left: padding.Left ?? 0,
            top: padding.Top ?? 0,
            right: padding.Right ?? 0,
            bottom: padding.Bottom ?? 0,
        },
    }
}

/**
 * 解析资源名到本地图片路径，优先使用真实同名资源。
 */
function resolveResourceSrc(resourceName) {
    if (!resourceName) return ""
    if (RESOURCE_SRC_MAP[resourceName]) return RESOURCE_SRC_MAP[resourceName]

    const miMatch = /^MI_PersonalInfo_Title_(\d+)$/.exec(resourceName)
    if (miMatch) {
        const fallbackName = `T_PersonalInfo_Title_${miMatch[1]}`
        if (RESOURCE_SRC_MAP[fallbackName]) return RESOURCE_SRC_MAP[fallbackName]
        return `/imgs/rank/${fallbackName}.webp`
    }

    if (/^T_PersonalInfo_Title_(\d+(_\d+)?)$/.test(resourceName)) {
        return `/imgs/rank/${resourceName}.webp`
    }

    return RESOURCE_FALLBACK["09_1"]
}

/**
 * 判断当前资源是否应按 mask 层渲染。
 */
function isMaskResource(resourceName) {
    return resourceName.startsWith("MI_PersonalInfo_Title_")
}

/**
 * 读取 SizeBox 的真实尺寸。
 */
function getFrameSize(objects) {
    const sizeBox = objects.find(item => item.Type === "SizeBox" && item.Name === "SizeBox_0")
    return {
        width: sizeBox?.Properties?.WidthOverride || 0,
        height: sizeBox?.Properties?.HeightOverride || 0,
    }
}

/**
 * 解析曲线点。
 */
function extractCurvePoints(curve) {
    const times = curve?.Times || []
    const values = curve?.Values || []
    return times.map((time, index) => ({
        timeMs: ticksToMs(time.Value),
        value: values[index]?.Value ?? 0,
    }))
}

/**
 * 解析 2D Transform section。
 */
function extractTransform(section) {
    const props = section?.Properties || {}
    return {
        translateX: extractCurvePoints(props.Translation),
        translateY: extractCurvePoints(props["Translation[1]"]),
        rotation: extractCurvePoints(props.Rotation),
        scaleX: extractCurvePoints(props.Scale),
        scaleY: extractCurvePoints(props["Scale[1]"]),
        shearX: extractCurvePoints(props.Shear),
        shearY: extractCurvePoints(props["Shear[1]"]),
    }
}

/**
 * 解析材质参数曲线。
 */
function extractMaterial(section) {
    const result = {}
    for (const item of section?.Properties?.ScalarParameterNamesAndCurves || []) {
        result[item.ParameterName] = extractCurvePoints(item.ParameterCurve)
    }
    return result
}

/**
 * 按动画绑定读取对应轨道。
 */
function extractLayerAnimation(scene, bind, findObject) {
    const objectBinding = scene?.Properties?.ObjectBindings?.find(item => item.ObjectGuid === bind.AnimationGuid)
    if (!objectBinding) return null

    const animation = {
        guid: bind.AnimationGuid,
        opacity: [],
        transform: null,
        material: null,
    }

    for (const trackRef of objectBinding.Tracks || []) {
        const trackType = /([A-Za-z0-9]+)'/.exec(trackRef.ObjectName)?.[1] || ""
        const trackName = parseObjectName(trackRef.ObjectName)
        const outerPath = parseOuterPath(trackRef.ObjectName)
        const track = findObject(trackType, trackName, outerPath)
        if (!track) continue

        if (track.Type === "MovieSceneFloatTrack" && track.Properties?.PropertyBinding?.PropertyName === "RenderOpacity") {
            const sectionRef = track.Properties?.Sections?.[0]
            const sectionName = parseObjectName(sectionRef?.ObjectName || "")
            const section = findObject("MovieSceneFloatSection", sectionName, outerPath)
            if (section) animation.opacity = extractCurvePoints(section.Properties.FloatCurve)
        }

        if (track.Type === "MovieScene2DTransformTrack") {
            const sectionRef = track.Properties?.Sections?.[0]
            const sectionName = parseObjectName(sectionRef?.ObjectName || "")
            const section = findObject("MovieScene2DTransformSection", sectionName, outerPath)
            if (section) animation.transform = extractTransform(section)
        }

        if (track.Type === "MovieSceneWidgetMaterialTrack") {
            const sectionRef = track.Properties?.Sections?.[0]
            const sectionName = parseObjectName(sectionRef?.ObjectName || "")
            const section = findObject("MovieSceneParameterSection", sectionName, outerPath)
            if (section) animation.material = extractMaterial(section)
        }
    }

    return animation
}

/**
 * 生成一个 frame 的数据。
 */
function buildFrame(frameKey, fileName) {
    const raw = loadFrame(path.join(SOURCE_DIR, fileName))
    const objects = Object.values(raw)
    const findObject = createFinder(objects)
    const frameSize = getFrameSize(objects)

    const overlay = objects.find(item => item.Type === "Overlay" && item.Name === "Title")
    const slotRefs = overlay?.Properties?.Slots || []
    const layers = []

    for (const [index, slotRef] of slotRefs.entries()) {
        const slotName = parseObjectName(slotRef.ObjectName)
        const slot = findObject("OverlaySlot", slotName, parseOuterHint(slotRef.ObjectName))
        const widgetRef = slot?.Properties?.Content?.ObjectName || ""
        const widgetName = parseObjectName(widgetRef)
        const image = findObject("Image", widgetName, parseOuterHint(widgetRef) || "WidgetTree")
        if (!image) continue

        const resourceName = getResourceName(image)
        const maskColor = getBrushTintColor(image)
        const imageSize = getBrushImageSize(image)
        const renderTranslation = getRenderTranslation(image)
        const renderScale = getRenderScale(image)
        const slotLayout = getOverlaySlotLayout(slot)
        layers.push({
            key: widgetName,
            resourceName,
            zIndex: index,
            resourceSrc: resolveResourceSrc(resourceName) || RESOURCE_FALLBACK[frameKey],
            renderMode: isMaskResource(resourceName) ? "blend" : "image",
            maskColor: maskColor || undefined,
            imageWidth: imageSize.width,
            imageHeight: imageSize.height,
            baseTranslateX: renderTranslation.x,
            baseTranslateY: renderTranslation.y,
            baseScaleX: renderScale.x,
            baseScaleY: renderScale.y,
            slot: slotLayout,
            animations: {},
        })
    }

    const sceneByName = new Map()
    for (const item of objects) {
        if (item.Type === "MovieScene") {
            sceneByName.set(item.Name, item)
        }
    }

    const widgetAnimations = objects.filter(item => item.Type === "WidgetAnimation")
    for (const widgetAnimation of widgetAnimations) {
        const movieSceneName = parseObjectName(widgetAnimation.Properties?.MovieScene?.ObjectName || widgetAnimation.Name || "")
        const scene = sceneByName.get(movieSceneName)
        if (!scene) continue

        for (const bind of widgetAnimation.Properties?.AnimationBindings || []) {
            const layer = layers.find(item => item.key === bind.WidgetName)
            if (!layer) continue
            const animation = extractLayerAnimation(scene, bind, findObject)
            if (!animation) continue
            layer.animations[movieSceneName.toLowerCase()] = animation
        }
    }

    return {
        width: Math.max(frameSize.width, 512),
        height: Math.max(frameSize.height, 128),
        loopMs: sceneByName.get("Loop") ? ticksToMs(sceneByName.get("Loop").Properties.PlaybackRange.Value.UpperBound.Value.Value) : 0,
        introMs: sceneByName.get("In") ? ticksToMs(sceneByName.get("In").Properties.PlaybackRange.Value.UpperBound.Value.Value) : 0,
        layers,
    }
}

const result = {}
for (const [frameKey, fileName] of Object.entries(FRAME_FILES)) {
    result[frameKey] = buildFrame(frameKey, fileName)
}

const header = `/* eslint-disable */\n/* AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY. */\n`
const body = `${header}\nexport const titleFrameRenderData = ${JSON.stringify(result, null, 4)} as const\n`

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
fs.writeFileSync(OUTPUT_FILE, body, "utf8")
console.log(`generated ${OUTPUT_FILE}`)
