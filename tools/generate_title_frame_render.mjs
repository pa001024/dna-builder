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
}

const RESOURCE_FALLBACK = {
    "07_1": "/imgs/rank/T_PersonalInfo_Title_03.webp",
    "07_2": "/imgs/rank/T_PersonalInfo_Title_12.webp",
    "07_3": "/imgs/rank/T_PersonalInfo_Title_07_3.webp",
    "07_4": "/imgs/rank/T_PersonalInfo_Title_07_4.webp",
    "07_5": "/imgs/rank/T_PersonalInfo_Title_07_5.webp",
}

const RESOURCE_SRC_MAP = {
    T_PersonalInfo_Title_01: "/imgs/rank/T_PersonalInfo_Title_01.webp",
    T_PersonalInfo_Title_03: "/imgs/rank/T_PersonalInfo_Title_03.webp",
    T_PersonalInfo_Title_07: "/imgs/rank/T_PersonalInfo_Title_07.webp",
    T_PersonalInfo_Title_12: "/imgs/rank/T_PersonalInfo_Title_12.webp",
    T_PersonalInfo_Title_13: "/imgs/rank/T_PersonalInfo_Title_13.webp",
    T_PersonalInfo_Title_22: "/imgs/rank/T_PersonalInfo_Title_22.webp",
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
        layers.push({
            key: widgetName,
            resourceName,
            zIndex: index,
            resourceSrc: RESOURCE_SRC_MAP[resourceName] || RESOURCE_FALLBACK[frameKey],
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
        width: frameSize.width,
        height: frameSize.height,
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
