<script lang="ts" setup>
import {
    AmbientLight,
    AxesHelper,
    Color,
    DirectionalLight,
    Euler,
    GridHelper,
    Group,
    InstancedMesh,
    LoadingManager,
    Matrix4,
    Mesh,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import {
    dirnamePosix,
    resolveBundleFileUrl,
    resolveSceneResourceUrl,
    type SceneBundleData,
    type SceneInstanceManifest,
    type SceneManifest,
} from "@/utils/umap-scene"
import { buildInstanceMatrix, collectSceneMeshPrimitives } from "@/utils/umap-viewer"

interface Props {
    manifest: SceneManifest | null
    bundleData: SceneBundleData | null
}

const props = defineProps<Props>()

const canvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLElement>()
const loadError = ref("")
const loading = ref(false)
const stats = computed(() => {
    if (!props.manifest) return []
    return [
        { label: "区域", value: `${props.manifest.regionId} ${props.manifest.regionName}` },
        { label: "唯一网格", value: props.manifest.meshes.length },
        { label: "实例", value: props.manifest.instances.length },
    ]
})

let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let contentRoot: Group | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrameId = 0
let axesHelper: AxesHelper | null = null
let gridHelper: GridHelper | null = null
let lastFrameTime = 0
let isPointerLooking = false
let lookYaw = 0
let lookPitch = 0
let lookDistance = 1200
let lastPointerX = 0
let lastPointerY = 0
const bundleObjectUrlCache = new Map<string, string>()
const pressedKeys = new Set<string>()
const forwardVector = new Vector3()
const rightVector = new Vector3()
const upVector = new Vector3(0, 1, 0)
const movementVector = new Vector3()
const cameraEuler = new Euler(0, 0, 0, "YXZ")

const BASE_FREE_LOOK_SPEED = 110
const SPRINT_MULTIPLIER = 5
const MOUSE_LOOK_SENSITIVITY = 0.0025
const MAX_LOOK_PITCH = Math.PI / 2 - 0.01

/**
 * 初始化 Three.js 场景。
 */
function setupRenderer() {
    if (!canvasRef.value || !containerRef.value) return

    renderer = new WebGLRenderer({
        canvas: canvasRef.value,
        antialias: true,
        alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(new Color("#061018"), 1)

    scene = new Scene()
    camera = new PerspectiveCamera(50, 1, 1, 500000)
    camera.position.set(780, 520, 780)

    const ambientLight = new AmbientLight("#dcefff", 1.15)
    const directionalLight = new DirectionalLight("#ffffff", 1.35)
    directionalLight.position.set(3000, 6000, 2000)
    const fillLight = new DirectionalLight("#8fc2ff", 0.8)
    fillLight.position.set(-4000, 3500, -2500)
    axesHelper = new AxesHelper(120)
    gridHelper = new GridHelper(600, 30, "#32506f", "#183047")
    scene.add(ambientLight, directionalLight, fillLight, axesHelper, gridHelper)

    contentRoot = new Group()
    scene.add(contentRoot)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enableRotate = false
    controls.enablePan = false
    controls.target.set(0, 160, 0)

    updateRendererSize()
    startRenderLoop()
}

/**
 * 根据容器尺寸更新相机与画布。
 */
function updateRendererSize() {
    if (!renderer || !camera || !containerRef.value) return

    const width = Math.max(containerRef.value.clientWidth, 1)
    const height = Math.max(containerRef.value.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
}

/**
 * 启动渲染循环。
 */
function startRenderLoop() {
    lastFrameTime = performance.now()

    const render = (currentTime: number) => {
        if (!renderer || !scene || !camera) return
        updateKeyboardMovement((currentTime - lastFrameTime) / 1000)
        lastFrameTime = currentTime
        controls?.update()
        renderer.render(scene, camera)
        animationFrameId = window.requestAnimationFrame(render)
    }

    animationFrameId = window.requestAnimationFrame(render)
}

/**
 * 清理旧模型资源。
 */
function clearContentRoot() {
    if (!contentRoot) return
    contentRoot.traverse(object => {
        const geometry = (object as any).geometry
        if (geometry?.dispose) geometry.dispose()

        const material = (object as any).material
        if (Array.isArray(material)) {
            for (const item of material) item?.dispose?.()
        } else {
            material?.dispose?.()
        }
    })
    contentRoot.clear()
    revokeBundleObjectUrls()
}

/**
 * 释放按需创建的包内 object URL。
 */
function revokeBundleObjectUrls() {
    for (const url of bundleObjectUrlCache.values()) {
        URL.revokeObjectURL(url)
    }
    bundleObjectUrlCache.clear()
}

/**
 * 加载 manifest 中的所有 mesh 资源，并按实例变换摆放。
 */
async function rebuildSceneFromManifest() {
    if (!props.manifest || !contentRoot) {
        clearContentRoot()
        return
    }

    clearContentRoot()
    loadError.value = ""
    loading.value = true

    try {
        const instancesByMeshId = new Map<string, SceneInstanceManifest[]>()

        for (const instance of props.manifest.instances) {
            const currentInstances = instancesByMeshId.get(instance.meshId) || []
            currentInstances.push(instance)
            instancesByMeshId.set(instance.meshId, currentInstances)
        }

        for (const mesh of props.manifest.meshes) {
            const meshInstances = instancesByMeshId.get(mesh.id)
            if (!meshInstances?.length) continue

            const gltf = await loadSceneAsset(mesh.asset)
            const primitives = collectSceneMeshPrimitives(gltf.scene, mesh.asset)
            appendInstancedMeshes(contentRoot, mesh.id, primitives, meshInstances)
        }
    } catch (error) {
        console.error("加载导出场景失败", error)
        loadError.value = error instanceof Error ? error.message : "未知错误"
    } finally {
        loading.value = false
    }
}

/**
 * 按 mesh primitive 批量创建 InstancedMesh，避免四万多个 clone 压垮主线程。
 */
function appendInstancedMeshes(targetRoot: Group, meshId: string, primitives: Array<{ mesh: Mesh; matrix: Matrix4 }>, instances: SceneInstanceManifest[]) {
    for (const [primitiveIndex, primitive] of primitives.entries()) {
        const instancedMesh = new InstancedMesh(primitive.mesh.geometry, primitive.mesh.material, instances.length)
        instancedMesh.name = `${meshId}#${primitiveIndex}`
        instancedMesh.castShadow = false
        instancedMesh.receiveShadow = false
        instancedMesh.matrixAutoUpdate = false

        for (const [instanceIndex, instance] of instances.entries()) {
            const worldMatrix = buildInstanceMatrix(instance).multiply(primitive.matrix)
            instancedMesh.setMatrixAt(instanceIndex, worldMatrix)
        }

        instancedMesh.instanceMatrix.needsUpdate = true
        targetRoot.add(instancedMesh)
    }
}

/**
 * 按资源类型加载单个 mesh，兼容 glb 与带外部依赖的 gltf。
 */
async function loadSceneAsset(assetPath: string) {
    const normalizedAssetPath = assetPath.replace(/\\/g, "/")
    const fileUrl = resolveBundleFileUrl(props.bundleData, bundleObjectUrlCache, normalizedAssetPath)
    if (!fileUrl) {
        throw new Error(`缺少场景资源: ${normalizedAssetPath}`)
    }

    const manager = new LoadingManager()
    manager.setURLModifier(requestedUrl => resolveSceneResourceUrl(props.bundleData, bundleObjectUrlCache, normalizedAssetPath, requestedUrl))

    const loader = new GLTFLoader(manager)
    loader.setMeshoptDecoder(MeshoptDecoder)
    if (normalizedAssetPath.endsWith(".gltf")) {
        const gltfText = await fetch(fileUrl).then(async response => {
            if (!response.ok) {
                throw new Error(`读取 glTF 失败: ${normalizedAssetPath}`)
            }
            return response.text()
        })
        return new Promise<any>((resolvePromise, rejectPromise) => {
            loader.parse(gltfText, `${dirnamePosix(normalizedAssetPath)}/`, resolvePromise, rejectPromise)
        })
    }

    return loader.loadAsync(fileUrl)
}

/**
 * 从当前相机姿态同步自由视角角度，避免首次拖动产生跳变。
 */
function syncLookAnglesFromCamera() {
    if (!camera || !controls) return
    cameraEuler.setFromQuaternion(camera.quaternion, "YXZ")
    lookYaw = cameraEuler.y
    lookPitch = cameraEuler.x
    lookDistance = Math.max(camera.position.distanceTo(controls.target), 1)
}

/**
 * 记录键盘按下状态，供自由视角移动使用。
 */
function handleKeyDown(event: KeyboardEvent) {
    if (event.repeat) return
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return

    const normalizedKey = normalizeControlKey(event.key)
    if (!normalizedKey) return

    pressedKeys.add(normalizedKey)
    if (normalizedKey === "space" || normalizedKey === "ctrl") {
        event.preventDefault()
    }
}

/**
 * 清除键盘按下状态，避免失焦后持续漂移。
 */
function handleKeyUp(event: KeyboardEvent) {
    const normalizedKey = normalizeControlKey(event.key)
    if (!normalizedKey) return
    pressedKeys.delete(normalizedKey)
}

/**
 * 页面失焦时重置按键状态，防止键位卡死。
 */
function handleWindowBlur() {
    pressedKeys.clear()
    isPointerLooking = false
}

/**
 * 将不同浏览器键值归一成统一控制键。
 */
function normalizeControlKey(rawKey: string) {
    const key = rawKey.toLowerCase()
    if (["w", "a", "s", "d"].includes(key)) return key
    if (key === "shift") return "shift"
    if (key === " " || key === "spacebar" || key === "space") return "space"
    if (key === "control" || key === "ctrl") return "ctrl"
    return ""
}

/**
 * 用相机朝向驱动自由视角平移。
 */
function updateKeyboardMovement(deltaSeconds: number) {
    if (!camera || !controls || deltaSeconds <= 0) return
    if (pressedKeys.size === 0) return

    forwardVector.set(0, 0, 0)
    rightVector.set(0, 0, 0)
    movementVector.set(0, 0, 0)

    camera.getWorldDirection(forwardVector)
    if (forwardVector.lengthSq() > 0) {
        forwardVector.normalize()
    }

    rightVector.crossVectors(forwardVector, upVector)
    rightVector.y = 0
    if (rightVector.lengthSq() > 0) {
        rightVector.normalize()
    }

    if (pressedKeys.has("w")) movementVector.add(forwardVector)
    if (pressedKeys.has("s")) movementVector.sub(forwardVector)
    if (pressedKeys.has("d")) movementVector.add(rightVector)
    if (pressedKeys.has("a")) movementVector.sub(rightVector)
    if (pressedKeys.has("space")) movementVector.y += 1
    if (pressedKeys.has("ctrl")) movementVector.y -= 1

    if (movementVector.lengthSq() === 0) return

    const targetDistance = camera.position.distanceTo(controls.target)
    const movementSpeed = Math.max(BASE_FREE_LOOK_SPEED, targetDistance * 0.08) * (pressedKeys.has("shift") ? SPRINT_MULTIPLIER : 1)
    movementVector.normalize().multiplyScalar(movementSpeed * deltaSeconds)

    camera.position.add(movementVector)
    controls.target.add(movementVector)
}

/**
 * 鼠标按下后进入自由视角观察模式。
 */
function handlePointerDown(event: PointerEvent) {
    if (!(event.target instanceof HTMLCanvasElement)) return
    if (event.button !== 0 && event.button !== 2) return

    syncLookAnglesFromCamera()
    isPointerLooking = true
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    event.preventDefault()
}

/**
 * 鼠标抬起时退出观察模式。
 */
function handlePointerUp() {
    isPointerLooking = false
}

/**
 * 鼠标拖动时直接旋转相机自身，而不是围绕场景目标点公转。
 */
function handlePointerMove(event: PointerEvent) {
    if (!camera || !controls || !isPointerLooking) return

    const deltaX = event.clientX - lastPointerX
    const deltaY = event.clientY - lastPointerY
    lastPointerX = event.clientX
    lastPointerY = event.clientY

    lookYaw -= deltaX * MOUSE_LOOK_SENSITIVITY
    lookPitch -= deltaY * MOUSE_LOOK_SENSITIVITY
    lookPitch = Math.min(MAX_LOOK_PITCH, Math.max(-MAX_LOOK_PITCH, lookPitch))

    camera.rotation.set(lookPitch, lookYaw, 0, "YXZ")
    camera.getWorldDirection(forwardVector)
    controls.target.copy(camera.position).add(forwardVector.multiplyScalar(lookDistance))
}

/**
 * 禁止右键菜单，避免右键观察时弹出浏览器菜单。
 */
function handleContextMenu(event: MouseEvent) {
    event.preventDefault()
}

onMounted(() => {
    setupRenderer()
    if (containerRef.value) {
        resizeObserver = new ResizeObserver(() => {
            updateRendererSize()
        })
        resizeObserver.observe(containerRef.value)
    }
    canvasRef.value?.addEventListener("pointerdown", handlePointerDown)
    canvasRef.value?.addEventListener("contextmenu", handleContextMenu)
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleWindowBlur)
})

onUnmounted(() => {
    if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
    }
    resizeObserver?.disconnect()
    pressedKeys.clear()
    isPointerLooking = false
    canvasRef.value?.removeEventListener("pointerdown", handlePointerDown)
    canvasRef.value?.removeEventListener("contextmenu", handleContextMenu)
    window.removeEventListener("pointermove", handlePointerMove)
    window.removeEventListener("pointerup", handlePointerUp)
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
    window.removeEventListener("blur", handleWindowBlur)
    controls?.dispose()
    renderer?.dispose()
})

watch(
    () => [props.manifest, props.bundleData],
    () => {
        void rebuildSceneFromManifest()
    },
    { immediate: true }
)
</script>

<template>
    <div class="flex h-full min-h-0 flex-col">
        <div class="grid gap-3 border-b border-base-300 bg-base-200/80 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div class="flex flex-wrap items-center gap-3 text-xs text-base-content/70">
                <span v-for="item in stats" :key="item.label" class="rounded-full bg-base-100 px-3 py-1">
                    {{ item.label }} {{ item.value }}
                </span>
            </div>
            <div class="text-xs text-base-content/60">数据源：`scene.umapscene` 单文件包</div>
        </div>

        <div ref="containerRef" class="relative min-h-0 flex-1 overflow-hidden bg-[#061018]">
            <canvas ref="canvasRef" class="block h-full w-full" />

            <div class="pointer-events-none absolute left-4 top-4 rounded-xl bg-black/35 px-3 py-2 text-[11px] text-slate-200/85">
                拖动鼠标转向 · WASD / Ctrl / Space 移动
            </div>

            <div
                v-if="!manifest && !loading"
                class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300/80"
            >
                选择 `.umapscene` 单文件后会在这里加载真实 3D 场景
            </div>

            <div v-if="loading" class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300/80">
                正在加载 3D 场景...
            </div>

            <div
                v-if="loadError"
                class="absolute right-4 top-4 max-w-md rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-xs text-error"
            >
                {{ loadError }}
            </div>
        </div>
    </div>
</template>
