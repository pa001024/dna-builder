import { computed, onBeforeUnmount, onMounted, type Ref, ref, watch } from "vue"
import { useAfkSprites } from "@/composables/useAfkSprites"
import { publishRunDrops } from "@/store/afkLedger"
import { patchAfkAnimState, useAfkAnimState } from "@/utils/afk-anim-state"
import { type AfkDropParticle, createAfkDrop, stepAfkDrop } from "@/utils/afk-drop"
import {
    type AfkCombatState,
    afkBackgroundLayout,
    afkMonsterSheet,
    afkSceneId,
    afkSpriteFrame,
    afkSpriteSheet,
    afkSpriteStateName,
    combatApproach,
    combatCharacterState,
    createCombat,
    mapCombatX,
    stepCombat,
} from "@/utils/afk-sprite"
import { getRewardIconUrl } from "@/utils/reward-icon"

/** 逻辑画布（官方 366×118 的倍数，实际宽高由调用方给）。 */
export type AfkAnimationOptions = {
    /** 画布逻辑宽度 */
    width: number
    /** 画布逻辑高度 */
    height: number
    /** 角色/怪物显示边长 */
    entitySize?: number
    /** 角色水平偏移比例（0 = 居中，0.22 = 偏右），0 表示按战斗坐标 */
    idleOffsetRatio?: number
    /** 是否在 combat 事件时跑官方战斗状态机 */
    combat?: boolean
}

/**
 * 狩月动画的绘制引擎：背景视差 + 角色 + 怪物 + 官方战斗状态机。
 *
 * 素材来自 `useAfkSprites()`（读游戏目录），角色由 `character` 事件切换。
 * 页头与独立小窗共用这一份实现，尺寸与摆位由调用方决定。
 * @param canvas 画布元素
 * @param options 画布尺寸与行为
 * @returns 引擎状态与错误信息
 */
export function useAfkAnimation(canvas: Ref<HTMLCanvasElement | null>, options: AfkAnimationOptions) {
    const { manifest, imageUrl, error } = useAfkSprites()
    // 主窗口与独立小窗读同一份 localStorage 状态，避免两边各记一套
    const animState = useAfkAnimState()
    /** 当前角色事件。 */
    const characterEvent = computed(() => animState.value.character)
    const entitySize = options.entitySize ?? options.height
    const officialWidth = 366

    const images = new Map<string, HTMLImageElement>()
    const combat = ref<AfkCombatState>(createCombat())
    /** 每层背景的滚动距离：键是「场景 id|层 id」。 */
    const layerOffsets = new Map<string, number>()
    let raf = 0
    let lastTick = 0
    /**
     * 当前动画分片的起播时刻。
     *
     * 与官方 `Animator.Load()` 一致：换分片就从第 0 帧重新开始。
     * 直接用绝对时间取帧会在换状态时从任意帧切入、看起来「闪回」。
     */
    let sheetPath = ""
    let sheetStartedAt = 0
    let monsterPath = ""
    let monsterStartedAt = 0

    /** 掉落贴图（只画当前进行中场次里的掉落）。 */
    const drops: AfkDropParticle[] = []
    /** 「掉落时刻:序号」→ 粒子：一件物品按数量铺几颗。 */
    const dropByKey = new Map<string, AfkDropParticle>()
    /** 图标缓存：同一物品反复掉落只解码一次。 */
    const dropImages = new Map<string, HTMLImageElement>()
    let dropSeq = 0
    /** 怪物最后一次可见时的中心 X（官方坐标）：掉落就从这个位置爆出。 */
    let lastMonsterX = officialWidth * 0.55

    const character = computed(() => {
        const list = manifest.value?.characters
        if (!list) return null
        const id = characterEvent.value?.id
        return (id !== undefined ? list[String(id)] : undefined) ?? list[manifest.value!.defaultCharacter] ?? null
    })

    const monsters = computed(() => manifest.value?.monsters ?? {})

    const stateName = computed(() => {
        if (combat.value.phase !== "idle") return combatCharacterState(combat.value)
        // 事件说在战斗但还没开打（清单未就绪）时按 Run 站桩，别对着空气挥刀
        if (options.combat !== false && characterEvent.value?.state === "combat") return "Run"
        return afkSpriteStateName(characterEvent.value?.state ?? "idle")
    })

    /**
     * 当前场景。
     *
     * 不能写成 computed：战斗场景是随机挑的，每次重算都会换一张背景。
     * 这里只在「角色事件 / 清单」变化时重挑一次，与官方 SetCharacter 的时机一致。
     */
    const sceneId = ref("")
    /** 上一次的角色状态：用来识别「刚进入战斗」这个时机。 */
    let lastState = ""
    watch(
        [characterEvent, manifest, () => animState.value.scene],
        () => {
            const state = characterEvent.value?.state ?? "idle"
            const requested = characterEvent.value?.scene ?? ""
            // 持久化的场景优先：刷新后接着用上次那张背景，不重新随机
            const saved = animState.value.scene
            if (saved && manifest.value?.backgrounds[saved] && !sceneId.value) {
                sceneId.value = saved
                lastState = state
                return
            }
            // 与官方一致：只有「从非战斗进入战斗」时才换战斗场景，
            // 战斗中的重复事件沿用当前背景；待机时回到默认场景
            const enteringCombat = state === "combat" && lastState !== "combat"
            lastState = state
            if (state === "combat" && !enteringCombat && sceneId.value) {
                if (requested && manifest.value?.backgrounds[requested]) sceneId.value = requested
                persistScene()
                return
            }
            sceneId.value = afkSceneId(manifest.value, requested, state)
            persistScene()
        },
        { immediate: true }
    )

    /**
     * 把当前场景写回共享状态，刷新后沿用。
     */
    function persistScene() {
        if (!sceneId.value || animState.value.scene === sceneId.value) return
        patchAfkAnimState({ scene: sceneId.value })
    }

    const sheet = computed(() => afkSpriteSheet(character.value, stateName.value))
    const monster = computed(() => monsters.value[combat.value.monsterId] ?? null)
    const monsterSheet = computed(() => afkMonsterSheet(monster.value, combat.value.monsterAction))
    const monsterVisible = computed(() => combat.value.phase !== "idle" && combat.value.monsterVisible)

    /**
     * 取贴图（首次访问异步解码后缓存）。
     * @param path 相对 Runtime 的路径
     * @returns 已解码的图片；未就绪时为 null
     */
    function image(path: string) {
        const cached = images.get(path)
        if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null
        const element = new Image()
        images.set(path, element)
        void imageUrl(path).then(url => {
            if (url) element.src = url
        })
        return null
    }

    /**
     * 随机挑一只怪物（等价官方的 GetRandom）。
     * @returns 怪物 id；清单为空时返回空串
     */
    function pickMonsterId() {
        const ids = Object.keys(monsters.value)
        return ids.length > 0 ? ids[Math.floor(Math.random() * ids.length)]! : ""
    }

    /**
     * 把当前进行中场次的掉落同步成地上的贴图。
     *
     * 掉落由账本维护在 `runDrops` 里（只含进行中的这一场），这里按数量铺粒子：
     * 每条都从怪物附近随机爆出并跑物理（打开时读到的历史掉落同样如此），不做均匀排布。
     */
    function syncDrops() {
        const visible = animState.value.runDrops
        const wanted = new Map<string, { drop: (typeof visible)[number] }>()
        for (const drop of visible) {
            if (wanted.size >= 120) break
            const copies = Math.max(1, Math.min(50, Math.floor(drop.count) || 1))
            for (let index = 0; index < copies && wanted.size < 120; index++) {
                wanted.set(`${drop.at}:${index}`, { drop })
            }
        }
        for (const [key, particle] of dropByKey) {
            if (wanted.has(key)) continue
            dropByKey.delete(key)
            const index = drops.indexOf(particle)
            if (index >= 0) drops.splice(index, 1)
        }
        for (const [key, { drop }] of wanted) {
            if (dropByKey.has(key)) continue
            const size = 18 + Math.random() * 4
            const groundY = options.height - 14 - size
            const actorLeft = ((canvas.value?.clientWidth || officialWidth) - officialWidth) / 2
            const monsterX = actorLeft + mapCombatX(lastMonsterX, officialWidth, officialWidth)
            // 一律从怪物附近随机爆出（读历史掉落也走同一套物理），不做均匀排布
            const jitter = (Math.random() - 0.5) * 48
            const particle = createAfkDrop({
                key: ++dropSeq,
                icon: getRewardIconUrl("Resource", drop.id ?? drop.name),
                x: Math.min(actorLeft + officialWidth - 12, Math.max(actorLeft + 12, monsterX + jitter)),
                y: options.height - 46 - Math.random() * 12,
                size,
                groundY,
            })
            dropByKey.set(key, particle)
            drops.push(particle)
        }
    }

    /**
     * 取（或开始加载）掉落图标。
     * @param icon 图标路径
     * @returns 已就绪的图片；未就绪时为 null
     */
    function dropImage(icon: string) {
        if (!icon) return null
        let image = dropImages.get(icon)
        if (!image) {
            image = new Image()
            image.src = icon
            dropImages.set(icon, image)
        }
        return image.complete && image.naturalWidth > 0 ? image : null
    }

    watch(
        () => animState.value.runDrops,
        () => syncDrops(),
        { deep: true, immediate: true }
    )

    /**
     * 画一帧。
     * @param now 时间戳
     */
    function draw(now: number) {
        const element = canvas.value
        const context = element?.getContext("2d")
        if (!element || !context) {
            raf = requestAnimationFrame(draw)
            return
        }
        const dt = lastTick ? Math.min(0.05, (now - lastTick) / 1000) : 0
        lastTick = now

        // 按 CSS 像素绘制：画布铺满容器，动画内容固定在 options.width 宽的居中带里
        const cssWidth = element.clientWidth || options.width
        const scale = element.width / cssWidth
        // 角色/怪物的活动范围与官方小窗一致（366 宽），在画布中央，不随画布变宽
        const actorLeft = (cssWidth - officialWidth) / 2
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, element.width, element.height)
        context.setTransform(scale, 0, 0, scale, 0, 0)

        const active = options.combat !== false && characterEvent.value?.state === "combat"
        const scene = manifest.value?.backgrounds[sceneId.value]
        if (scene) {
            // 官方只在非战斗、以及战斗的接敌/复位阶段滚动，复位阶段 4 倍速
            const scrolling = !active || combat.value.phase === "approach" || combat.value.phase === "characterReset"
            const speedMultiplier = combat.value.phase === "characterReset" ? 4 : 1
            const sizes: Record<string, { width: number; height: number }> = {}
            for (const [id, layer] of Object.entries(scene.layers)) {
                const source = image(layer.path)
                if (source) sizes[id] = { width: source.naturalWidth, height: source.naturalHeight }
            }
            // 地面尺寸未知时先不画：统一缩放没算出来，画了尺寸会跳
            if (sizes.Ground) {
                for (const layer of afkBackgroundLayout(scene.layers, sizes, cssWidth, options.height)) {
                    const source = images.get(layer.path)
                    if (!source || layer.tileWidth <= 0) continue
                    const key = `${sceneId.value}|${layer.id}`
                    let offset = layerOffsets.get(key) ?? 0
                    if (scrolling) {
                        // 官方 30ms 一帧，速度按帧计
                        offset += layer.speed * speedMultiplier * 30 * dt
                        layerOffsets.set(key, offset)
                    }
                    const shift = offset % layer.tileWidth
                    for (let x = shift - layer.tileWidth; x < cssWidth; x += layer.tileWidth) {
                        // 不取整、不镜像：亚像素连续移动才是官方 ImageBrush 平铺的观感
                        context.drawImage(source, x, layer.top, layer.tileWidth, layer.height)
                    }
                }
            }
        }
        if (active && combat.value.phase === "idle") {
            // 清单可能还没读完：拿不到怪物就先不打，避免对着空气挥刀
            const monsterId = pickMonsterId()
            if (monsterId) {
                combat.value.monsterId = monsterId
                combatApproach(combat.value)
            }
        } else if (!active && combat.value.phase !== "idle") {
            combat.value = createCombat()
        } else if (active && combat.value.phase !== "idle" && !combat.value.monsterId) {
            // 清单迟到（首次刷新后）：补一只，下一帧就能看到
            combat.value.monsterId = pickMonsterId()
        }
        if (combat.value.phase !== "idle" && stepCombat(combat.value, dt)) {
            combat.value.monsterId = pickMonsterId()
        }
        // 只记死亡地点：怪物从左侧一路走到右侧才死，掉落要落在尸体那里，不能取路径中段
        if (combat.value.phase === "monsterDeath") lastMonsterX = combat.value.monsterX

        const current = sheet.value
        const source = current ? image(current.path) : null
        if (current && current.path !== sheetPath) {
            sheetPath = current.path
            sheetStartedAt = now
        }
        if (current && source) {
            const frame = afkSpriteFrame(current, now - sheetStartedAt, stateName.value === "Death")
            const fighting = combat.value.phase !== "idle"
            const x = fighting
                ? actorLeft + mapCombatX(combat.value.characterX, officialWidth, officialWidth) - entitySize / 2
                : actorLeft + (officialWidth - entitySize) / 2 + officialWidth * (options.idleOffsetRatio ?? 0)
            context.drawImage(source, frame.x, frame.y, frame.width, frame.height, x, options.height - entitySize, entitySize, entitySize)
        }

        if (monsterVisible.value) {
            const monsterState = monsterSheet.value
            const monsterSource = monsterState ? image(monsterState.path) : null
            if (monsterState && monsterState.path !== monsterPath) {
                monsterPath = monsterState.path
                monsterStartedAt = now
            }
            if (monsterState && monsterSource) {
                // 死亡定格：停在最后一帧
                const elapsed = combat.value.monsterFrozen
                    ? monsterState.frameCount * (1000 / monsterState.fps) - 1
                    : now - monsterStartedAt
                // Death 只播一遍：播完停在最后一帧，否则刚好在冻结前回绕到首帧
                const frame = afkSpriteFrame(monsterState, elapsed, combat.value.monsterAction === "Death")
                const x = actorLeft + mapCombatX(combat.value.monsterX, officialWidth, officialWidth) - entitySize / 2
                context.drawImage(
                    monsterSource,
                    frame.x,
                    frame.y,
                    frame.width,
                    frame.height,
                    x,
                    options.height - entitySize,
                    entitySize,
                    entitySize
                )
            }
        }

        // 掉落贴图：物理推进 + 绘制（全部停稳时也照常画，避免重绘时消失）
        for (const drop of drops) stepAfkDrop(drop, dt, actorLeft + officialWidth, actorLeft)
        for (const drop of drops) {
            const source = dropImage(drop.icon)
            if (!source) continue
            context.save()
            context.translate(drop.x + drop.size / 2, drop.y + drop.size / 2)
            context.rotate((drop.rotation * Math.PI) / 180)
            context.drawImage(source, -drop.size / 2, -drop.size / 2, drop.size, drop.size)
            context.restore()
        }

        raf = requestAnimationFrame(draw)
    }

    /**
     * 同步画布像素尺寸（随容器宽度等比缩放）。
     */
    function resize() {
        const element = canvas.value
        const parent = element?.parentElement
        if (!element) return
        const width = parent?.clientWidth ?? options.width
        // 高度固定为内容高度：宽度铺满容器，内容按 options.width 居中，不随容器等比放大
        const height = options.height
        const dpr = window.devicePixelRatio || 1
        element.width = Math.round(width * dpr)
        element.height = Math.round(height * dpr)
        element.style.height = `${height}px`
        // 画布宽度变了：已摆好的掉落要按新的居中带重排，否则会停在旧坐标
        drops.length = 0
        dropByKey.clear()
        syncDrops()
    }

    /** 尺寸观察器：小窗首次显示时容器宽度才有效，单靠 window.resize 会漏掉。 */
    let observer: ResizeObserver | null = null

    onMounted(() => {
        // 打开动画时一次性读当前副本已掉落的东西，不依赖之后还会不会来事件
        void publishRunDrops()
        resize()
        lastTick = 0
        raf = requestAnimationFrame(draw)
        const parent = canvas.value?.parentElement
        if (parent) {
            observer = new ResizeObserver(() => resize())
            observer.observe(parent)
        }
        window.addEventListener("resize", resize)
    })

    onBeforeUnmount(() => {
        cancelAnimationFrame(raf)
        observer?.disconnect()
        observer = null
        window.removeEventListener("resize", resize)
    })

    return { manifest, error, combat, resize, animState }
}
