import {
    DoubleSide,
    NoColorSpace,
    type Group,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    Quaternion,
    SRGBColorSpace,
    Vector3,
} from "three"
import type { SceneInstanceManifest } from "./umap-scene"

const WORLD_UNIT_SCALE = 0.01
const tempInstanceObject = new Object3D()

/**
 * UMap 预览器的统一兜底材质。
 */
export const fallbackMaterial = new MeshStandardMaterial({
    color: "#b7c7d6",
    emissive: "#182028",
    metalness: 0.05,
    roughness: 0.92,
})

/**
 * 提取资源场景内所有可渲染 Mesh，并保留相对根节点的局部矩阵。
 */
export function collectSceneMeshPrimitives(root: Group, assetPath?: string) {
    normalizeRenderableMaterials(root, assetPath)
    root.updateMatrixWorld(true)

    const rootInverseMatrix = root.matrixWorld.clone().invert()
    const primitives: Array<{ mesh: Mesh; matrix: Matrix4 }> = []

    root.traverse(object => {
        if (!(object instanceof Mesh) || !object.geometry) return

        const localMatrix = rootInverseMatrix.clone().multiply(object.matrixWorld)
        primitives.push({
            mesh: object,
            matrix: localMatrix,
        })
    })

    return primitives
}

/**
 * 将 Unreal 实例变换映射到 Three.js 矩阵。
 */
export function buildInstanceMatrix(instance: SceneInstanceManifest) {
    if (instance.q) {
        return convertUeMatrixToThreeMatrix(instance.p, instance.q, instance.s)
    }

    const [x, y, z] = instance.p
    const [pitch, yaw, roll] = instance.r || [0, 0, 0]
    const [sx, sy, sz] = instance.s

    tempInstanceObject.position.set(x * WORLD_UNIT_SCALE, z * WORLD_UNIT_SCALE, -y * WORLD_UNIT_SCALE)
    tempInstanceObject.rotation.set(degreesToRadians(roll), degreesToRadians(-yaw), degreesToRadians(pitch), "XYZ")
    tempInstanceObject.scale.set(sx, sz, sy)
    tempInstanceObject.updateMatrix()
    return tempInstanceObject.matrix.clone()
}

/**
 * 将 Unreal 坐标系下的 TRS 转为 Three.js 矩阵。
 */
function convertUeMatrixToThreeMatrix(
    position: [number, number, number],
    quaternion: [number, number, number, number],
    scale: [number, number, number]
) {
    const ueMatrix = new Matrix4().compose(
        new Vector3(position[0] * WORLD_UNIT_SCALE, position[1] * WORLD_UNIT_SCALE, position[2] * WORLD_UNIT_SCALE),
        new Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]),
        new Vector3(scale[0], scale[1], scale[2])
    )

    const basisMatrix = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1)
    const inverseBasisMatrix = basisMatrix.clone().invert()
    return basisMatrix.clone().multiply(ueMatrix).multiply(inverseBasisMatrix)
}

/**
 * 角度转弧度。
 */
function degreesToRadians(value: number) {
    return (value * Math.PI) / 180
}

/**
 * 将导出后不可见或过暗的材质统一替换为可见材质。
 */
function normalizeRenderableMaterials(root: Group, assetPath?: string) {
    root.traverse(object => {
        if (!(object instanceof Mesh)) return
        object.castShadow = false
        object.receiveShadow = false

        const material = object.material
        if (Array.isArray(material)) {
            object.material = material.map(item => normalizeRenderableMaterial(item, assetPath))
            return
        }

        object.material = normalizeRenderableMaterial(material, assetPath)
    })
}

/**
 * 优先保留 glTF 原材质，只对明显不可见的材质做兜底。
 */
function normalizeRenderableMaterial(material: any, assetPath?: string) {
    if (!shouldFallbackToVisibleMaterial(material)) {
        if (material.map) {
            material.map.colorSpace = SRGBColorSpace
            material.map.needsUpdate = true
        }
        if (material.alphaMap) {
            material.alphaMap.needsUpdate = true
        }
        if (material.emissiveMap) {
            material.emissiveMap.colorSpace = SRGBColorSpace
            material.emissiveMap.needsUpdate = true
        }
        if ("color" in material && material.color?.setRGB) {
            material.color.setRGB(1, 1, 1)
        }
        if (shouldDeriveAlphaMapFromAuxiliaryTexture(assetPath, material)) {
            const auxiliaryAlphaMap = (material.metalnessMap || material.roughnessMap)?.clone?.()
            if (auxiliaryAlphaMap) {
                auxiliaryAlphaMap.colorSpace = NoColorSpace
                auxiliaryAlphaMap.needsUpdate = true
                material.alphaMap = auxiliaryAlphaMap
                material.metalnessMap = null
                material.roughnessMap = null
                material.metalness = 0
                material.roughness = 1
            }
        }
        if (shouldDeriveAlphaMapFromBaseColor(assetPath, material)) {
            material.alphaMap = material.map.clone()
            material.alphaMap.colorSpace = NoColorSpace
            material.alphaMap.needsUpdate = true
        }
        if ("transparent" in material && material.alphaMap && !(material.alphaTest > 0)) {
            material.transparent = true
        }
        if (shouldForceAlphaCutout(assetPath, material)) {
            material.alphaTest = Math.max(material.alphaTest || 0, 0.33)
            material.side = DoubleSide
            material.depthWrite = true
        }
        if ("transparent" in material && material.alphaTest > 0) {
            material.transparent = false
        }
        if ("depthWrite" in material && material.transparent) {
            material.depthWrite = material.alphaTest > 0
        }
        if ("envMapIntensity" in material && typeof material.envMapIntensity === "number" && material.envMapIntensity <= 0) {
            material.envMapIntensity = 0.35
        }
        if ("metalness" in material && typeof material.metalness === "number" && material.metalness < 0) {
            material.metalness = 0
        }
        if ("roughness" in material && typeof material.roughness === "number" && material.roughness <= 0) {
            material.roughness = 1
        }
        if ("needsUpdate" in material) {
            material.needsUpdate = true
        }
        return material
    }

    const nextMaterial = fallbackMaterial.clone()
    nextMaterial.name = material?.name || "FallbackMaterial"
    nextMaterial.vertexColors = Boolean(material?.vertexColors)
    nextMaterial.transparent = Boolean(material?.transparent || material?.alphaMap || material?.alphaTest > 0)
    nextMaterial.opacity = typeof material?.opacity === "number" ? material.opacity : 1
    nextMaterial.side = material?.side ?? nextMaterial.side
    nextMaterial.depthWrite = typeof material?.depthWrite === "boolean" ? material.depthWrite : !nextMaterial.transparent
    nextMaterial.alphaTest = typeof material?.alphaTest === "number" ? material.alphaTest : 0
    if (material?.map) nextMaterial.map = material.map
    if (material?.alphaMap) nextMaterial.alphaMap = material.alphaMap
    if (material?.emissiveMap) nextMaterial.emissiveMap = material.emissiveMap
    if (material?.normalMap) nextMaterial.normalMap = material.normalMap
    if (material?.aoMap) nextMaterial.aoMap = material.aoMap
    if (material?.roughnessMap) nextMaterial.roughnessMap = material.roughnessMap
    if (material?.metalnessMap) nextMaterial.metalnessMap = material.metalnessMap
    if (material?.color?.getHexString) {
        const hex = `#${material.color.getHexString()}`
        if (hex !== "#000000") {
            nextMaterial.color = material.color.clone()
        }
    }
    if (shouldDeriveAlphaMapFromAuxiliaryTexture(assetPath, nextMaterial)) {
        const auxiliaryAlphaMap = (nextMaterial.metalnessMap || nextMaterial.roughnessMap)?.clone?.()
        if (auxiliaryAlphaMap) {
            auxiliaryAlphaMap.colorSpace = NoColorSpace
            auxiliaryAlphaMap.needsUpdate = true
            nextMaterial.alphaMap = auxiliaryAlphaMap
            nextMaterial.metalnessMap = null
            nextMaterial.roughnessMap = null
            nextMaterial.metalness = 0
            nextMaterial.roughness = 1
        }
    }
    if (shouldDeriveAlphaMapFromBaseColor(assetPath, nextMaterial)) {
        const derivedAlphaMap = nextMaterial.map?.clone()
        if (derivedAlphaMap) {
            derivedAlphaMap.colorSpace = NoColorSpace
            derivedAlphaMap.needsUpdate = true
            nextMaterial.alphaMap = derivedAlphaMap
        }
    }
    if (shouldForceAlphaCutout(assetPath, material)) {
        nextMaterial.alphaTest = Math.max(nextMaterial.alphaTest, 0.33)
        nextMaterial.side = DoubleSide
        nextMaterial.depthWrite = true
    }
    if (nextMaterial.alphaTest > 0) {
        nextMaterial.transparent = false
    }
    return nextMaterial
}

/**
 * 仅在材质几乎没有可用信息时才回退到统一可见材质。
 */
function shouldFallbackToVisibleMaterial(material: any) {
    if (!material) return true
    if (material.map || material.emissiveMap || material.normalMap || material.roughnessMap || material.metalnessMap || material.aoMap) {
        return false
    }
    if (material.emissive?.getHex && material.emissive.getHex() !== 0x000000) {
        return false
    }
    if (material.color?.getHex) {
        const colorHex = material.color.getHex()
        return colorHex === 0x000000
    }
    return false
}

/**
 * UModel 导出的部分植物卡片材质会丢失 glTF alphaMode，运行时需要补回 alpha cutout。
 */
function shouldForceAlphaCutout(assetPath: string | undefined, material: any) {
    const normalizedAssetPath = (assetPath || "").toLowerCase()
    const materialName = String(material?.name || "").toLowerCase()
    const looksLikePlantCard =
        /\/plants\/|_vin|_bus|_gra|_mos|vine|bush|grass|moss/.test(normalizedAssetPath) ||
        /vin|bush|grass|moss|leaf|plant/.test(materialName)

    return looksLikePlantCard && Boolean(material?.map)
}

/**
 * UModel 的植物遮罩贴图经常只有 RGB，没有 alpha 通道，需要把同一张图同时作为 alphaMap 使用。
 */
function shouldDeriveAlphaMapFromBaseColor(assetPath: string | undefined, material: any) {
    return (
        shouldForceAlphaCutout(assetPath, material) && !material?.alphaMap && Boolean(material?.map) && Number(material?.alphaTest || 0) > 0
    )
}

/**
 * 导出器会暂时把遮罩贴图挂到 ORM 槽位，运行时再转回 alphaMap。
 */
function shouldDeriveAlphaMapFromAuxiliaryTexture(assetPath: string | undefined, material: any) {
    return (
        shouldForceAlphaCutout(assetPath, material) &&
        !material?.alphaMap &&
        Number(material?.alphaTest || 0) > 0 &&
        Boolean(material?.metalnessMap || material?.roughnessMap)
    )
}
