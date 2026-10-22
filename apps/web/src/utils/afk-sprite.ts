/**
 * 官方浮窗动画的纯计算部分：帧索引、摆放与背景平铺。
 *
 * 与「小小狩月人」的实现口径一致（`AFKSupport/Res/Runtime/manifest.json` + `display.json`），
 * 独立成纯函数便于单测；组件只负责取图与绘制。
 */

/** 一个动画状态（与官方 manifest 同结构）。 */
export type AfkSpriteState = {
    path: string
    frameWidth: number
    frameHeight: number
    columns: number
    frameCount: number
    fps: number
    startFrame: number
    facesLeft: boolean
}

/** 角色的皮肤表。 */
export type AfkSpriteCharacter = {
    name: string
    defaultSkin: string
    skins: Record<string, { states: Record<string, AfkSpriteState> }>
}

/** 怪物条目：官方怪物没有皮肤，直接是状态表。 */
export type AfkSpriteMonster = {
    name: string
    states: Record<string, AfkSpriteState>
}

/** 背景的一层（官方 manifest 的 `layers` 条目）。 */
export type AfkBackgroundLayer = {
    path: string
    /** 绘制层级：数值越大越靠下（官方按 z 降序、Ground 最后绘制） */
    z: number
    /** 该层在清单里的名义 top（官方实际不使用，改按地面高度统一缩放） */
    top?: number
    /** 该层在清单里的名义高度（官方实际不使用） */
    height?: number
    /** 每帧滚动像素（官方 30ms 一帧） */
    speed: number
    /** 战斗时是否仍滚动（官方实际只用全局条件） */
    scrollInCombat?: boolean
    /** 缩放方式：uniform / height / width */
    fit?: string
}

/** 一个场景。 */
export type AfkBackgroundScene = {
    name?: string
    layers: Record<string, AfkBackgroundLayer>
}

/** 运行时清单里用到的那部分。 */
export type AfkSpriteManifest = {
    defaultCharacter: string
    characters: Record<string, AfkSpriteCharacter>
    monsters: Record<string, AfkSpriteMonster>
    backgrounds: Record<string, AfkBackgroundScene>
}

/** 雪碧图上的帧矩形。 */
export type AfkSpriteFrame = {
    x: number
    y: number
    width: number
    height: number
}

/**
 * 管道状态 → 官方动画状态名。
 * @param state `character` 事件里的 state
 * @returns 动画状态名
 */
export function afkSpriteStateName(state: string): string {
    if (state === "combat") return "Attack"
    if (state === "death" || state === "dead") return "Death"
    return "Run"
}

/**
 * 取角色某个状态的分片；缺失时回退 Run，再回退到任一状态。
 * @param character 角色
 * @param state 动画状态名
 * @returns 分片；角色没有可用分片时为 null
 */
export function afkSpriteSheet(character: AfkSpriteCharacter | null, state: string): AfkSpriteState | null {
    if (!character) return null
    const skin = character.skins[character.defaultSkin] ?? Object.values(character.skins)[0]
    if (!skin) return null
    return skin.states[state] ?? skin.states.Run ?? Object.values(skin.states)[0] ?? null
}

/**
 * 取怪物的某个动作分片；缺失时回退 Run。
 * @param monster 怪物
 * @param action 动作
 * @returns 分片；怪物为空时返回 null
 */
export function afkMonsterSheet(monster: AfkSpriteMonster | null, action: string): AfkSpriteState | null {
    if (!monster) return null
    return monster.states[action] ?? monster.states.Run ?? Object.values(monster.states)[0] ?? null
}

/**
 * 按已播放时长算当前帧在雪碧图上的矩形。
 * @param sheet 分片
 * @param elapsedMs 已播放毫秒
 * @param once 只播一遍（Death 等）：播完停在最后一帧，不回绕
 * @returns 帧矩形
 */
export function afkSpriteFrame(sheet: AfkSpriteState, elapsedMs: number, once = false): AfkSpriteFrame {
    const columns = Math.max(1, sheet.columns)
    const frameCount = Math.max(1, sheet.frameCount)
    const raw = Math.floor((elapsedMs / 1000) * sheet.fps)
    const index = once ? Math.min(raw, frameCount - 1) : raw % frameCount
    return {
        x: (index % columns) * sheet.frameWidth,
        y: (sheet.startFrame + Math.floor(index / columns)) * sheet.frameHeight,
        width: sheet.frameWidth,
        height: sheet.frameHeight,
    }
}

/**
 * 角色在画布上的摆放：水平居中，底部贴边（官方 anchorY = 1）。
 * @param canvasWidth 画布逻辑宽度
 * @param canvasHeight 画布逻辑高度
 * @param size 角色显示边长
 * @returns 左上角坐标
 */
export function afkSpritePlacement(canvasWidth: number, canvasHeight: number, size: number) {
    return { x: (canvasWidth - size) / 2, y: canvasHeight - size }
}

/**
 * 背景层的平铺位置：按地面图高度等比缩放到画布高度后横向重复。
 * @param imageWidth 原图宽度
 * @param imageHeight 原图高度
 * @param canvasWidth 画布逻辑宽度
 * @param canvasHeight 画布逻辑高度
 * @param offset 累计滚动距离
 * @param speed 该层速度系数
 * @returns 每块贴图的 left 坐标
 */
export function afkBackgroundTiles(
    imageWidth: number,
    imageHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    offset: number,
    speed: number
) {
    if (imageHeight <= 0 || imageWidth <= 0) {
        return { tileWidth: 0, tiles: [] as { left: number; mirrored: boolean }[] }
    }
    const tileWidth = imageWidth * (canvasHeight / imageHeight)
    const shift = (offset * speed) % tileWidth
    // 官方用的是 ImageBrush 的平铺（TileMode），不做镜像：
    // 镜像会让每块贴图左右翻转，滚动跨块时整幅画面「跳」一下
    const tiles: { left: number }[] = []
    for (let x = shift - tileWidth; x < canvasWidth; x += tileWidth) {
        tiles.push({ left: x })
    }
    return { tileWidth, tiles }
}

/** 一张背景层贴图的原图尺寸。 */
export type AfkBackgroundSize = { width: number; height: number }

/** 一层背景算好的绘制参数（官方 InitializeScene 的落位结果）。 */
export type AfkBackgroundLayerLayout = {
    id: string
    path: string
    speed: number
    /** 缩放后的目标高度 */
    height: number
    /** 平铺单元宽度 */
    tileWidth: number
    /** 顶部坐标 */
    top: number
}

/**
 * 背景层的落位，口径与官方 `InitializeScene` 一致：
 *
 * 以 Ground 层的原图像素高度为基准，整幅画布高度 / 地面高度得到统一缩放；
 * 每层按自己的原图高度乘该缩放，再底对齐（非地面层再抬 `midBottomOffset * 缩放`）。
 * 绘制顺序为非 Ground 层按 z 降序，Ground 最后。
 * @param layers 场景的层表
 * @param sizes 各层原图尺寸（未加载的层会被跳过）
 * @param canvasWidth 画布逻辑宽度
 * @param canvasHeight 画布逻辑高度
 * @param midBottomOffset 官方 display.json 的 midBottomOffset
 * @returns 由下到上的绘制清单
 */
export function afkBackgroundLayout(
    layers: Record<string, AfkBackgroundLayer>,
    sizes: Record<string, AfkBackgroundSize | undefined>,
    canvasWidth: number,
    canvasHeight: number,
    midBottomOffset = 0
): AfkBackgroundLayerLayout[] {
    const ground = layers.Ground
    const groundSize = ground ? sizes.Ground : undefined
    const uniformScale = groundSize && groundSize.height > 0 ? canvasHeight / groundSize.height : 1
    const ordered = Object.entries(layers)
        .filter(([id]) => id !== "Ground")
        .sort((a, b) => b[1].z - a[1].z)
    if (ground) ordered.push(["Ground", ground])
    const result: AfkBackgroundLayerLayout[] = []
    for (const [id, layer] of ordered) {
        const size = sizes[id]
        if (!size || size.width <= 0 || size.height <= 0) continue
        let tileWidth = size.width * uniformScale
        let height = size.height * uniformScale
        const fit = layer.fit ?? "uniform"
        if (fit === "width") {
            const scale = canvasWidth / size.width
            tileWidth = canvasWidth
            height = size.height * scale
        } else if (fit === "height" || fit === "uniform") {
            tileWidth = size.width * uniformScale
            height = size.height * uniformScale
        }
        const offset = id === "Ground" ? 0 : midBottomOffset * uniformScale
        result.push({
            id,
            path: layer.path,
            speed: layer.speed,
            height,
            tileWidth,
            top: canvasHeight - height - offset,
        })
    }
    return result
}

/** 官方 display.json 的场景分组。 */
export type AfkScenePools = {
    /** 战斗可用场景（官方 combatScenes） */
    combatScenes: string[]
    /** 待机可用场景（官方 idleScenes） */
    idleScenes: string[]
    /** 官方默认场景（官方 defaultScene） */
    defaultScene: string
}

/** 官方默认分组（display.json 的原值）。 */
export const AFK_SCENE_POOLS: AfkScenePools = {
    combatScenes: ["BG01", "BG02", "BG03"],
    idleScenes: ["BG04", "BG05", "BG06", "BG07"],
    defaultScene: "BG06",
}

/**
 * 从清单里挑场景，规则与官方 `SetCharacter` 一致：
 *
 * - 战斗：事件给的场景在战斗池里就用它，否则从战斗池随机；
 * - 待机：事件给的场景在待机池里就用它，否则回默认场景（不是随机）；
 * - 池子里有清单没有的 id 时跳过。
 * @param manifest 清单
 * @param requested 事件里的场景
 * @param state 事件里的状态
 * @param random 随机源，便于单测
 * @returns 场景 id；清单缺失时为空串
 */
export function afkSceneId(manifest: AfkSpriteManifest | null, requested: string, state: string, random: () => number = Math.random) {
    if (!manifest) return ""
    const pools = AFK_SCENE_POOLS
    const combat = pools.combatScenes.filter(id => manifest.backgrounds[id])
    const idle = pools.idleScenes.filter(id => manifest.backgrounds[id])
    if (state === "combat") {
        if (requested && combat.includes(requested)) return requested
        const pool = combat.length > 0 ? combat : Object.keys(manifest.backgrounds)
        return pool[Math.floor(random() * pool.length)] ?? ""
    }
    if (requested && idle.includes(requested)) return requested
    if (manifest.backgrounds[pools.defaultScene]) return pools.defaultScene
    if (idle.length > 0) return idle[0]!
    return Object.keys(manifest.backgrounds)[0] ?? ""
}

/** 官方 display.json 里的战斗参数。 */
export type AfkCombatParams = {
    /** 角色出生 X（官方 311，基于 366 宽的窗口） */
    characterSpawnX: number
    /** 怪物出生 X（官方 -27） */
    monsterSpawnX: number
    /** 每帧移动速度（官方 1.8） */
    moveSpeed: number
    /** 停下开打的间距（官方 37） */
    engageDistance: number
    /** 一场打完到下一场刷怪的间隔秒数（官方 0.5） */
    respawnInterval: number
}

/** 官方默认战斗参数。 */
export const AFK_COMBAT_DEFAULTS: AfkCombatParams = {
    characterSpawnX: 311,
    monsterSpawnX: -27,
    moveSpeed: 1.8,
    engageDistance: 37,
    respawnInterval: 0.5,
}

/** 战斗阶段（与官方 CombatPhase 一一对应）。 */
export type AfkCombatPhase = "idle" | "approach" | "fighting" | "monsterDeath" | "characterReset" | "waiting"

/** 怪物动作（官方只有这四个）。 */
export type AfkMonsterAction = "Run" | "Attack" | "Hit" | "Death"

/** 战斗状态机。 */
export type AfkCombatState = {
    phase: AfkCombatPhase
    /** 角色 X（官方坐标系） */
    characterX: number
    /** 怪物 X（官方坐标系） */
    monsterX: number
    /** 当前阶段已持续秒数 */
    phaseElapsed: number
    /** 角色当前动作已持续秒数（每 0.6 秒重新起手） */
    actionElapsed: number
    /** 怪物当前动作已持续秒数 */
    monsterElapsed: number
    /** 怪物动作 */
    monsterAction: AfkMonsterAction
    /** 怪物是否可见（死亡后隐藏） */
    monsterVisible: boolean
    /** 怪物死亡后定格 */
    monsterFrozen: boolean
    /** 本场怪物 id；空串表示没有 */
    monsterId: string
}

/**
 * 创建战斗状态。
 * @param monsterId 本场怪物 id
 * @param params 战斗参数
 * @returns 初始状态（待机）
 */
export function createCombat(monsterId = "", params: AfkCombatParams = AFK_COMBAT_DEFAULTS): AfkCombatState {
    return {
        phase: "idle",
        characterX: params.characterSpawnX,
        monsterX: params.monsterSpawnX,
        phaseElapsed: 0,
        actionElapsed: 0,
        monsterElapsed: 0,
        monsterAction: "Run",
        monsterVisible: false,
        monsterFrozen: false,
        monsterId,
    }
}

/**
 * 进入「接近」阶段：双方从出生点往中间走。
 * @param state 状态（原地修改）
 * @param params 战斗参数
 */
export function combatApproach(state: AfkCombatState, params: AfkCombatParams = AFK_COMBAT_DEFAULTS) {
    state.phase = "approach"
    state.phaseElapsed = 0
    state.actionElapsed = 0
    state.monsterElapsed = 0
    state.monsterAction = "Run"
    state.monsterVisible = true
    state.monsterFrozen = false
    state.characterX = params.characterSpawnX
    state.monsterX = params.monsterSpawnX
}

/**
 * 推进一步战斗状态机（与官方 `UpdateCombat` 同序）。
 *
 * 阶段：approach → fighting → monsterDeath → characterReset → waiting → approach …
 * fighting 里怪物按 0.6s / 1.2s / 1.8s 切 Attack / Hit / Death；角色每 0.6s 重新起手一次。
 * @param state 状态（原地修改）
 * @param dt 距上一帧的秒数
 * @param params 战斗参数
 * @returns 是否刚结束一场（需要换下一只怪物）
 */
export function stepCombat(state: AfkCombatState, dt: number, params: AfkCombatParams = AFK_COMBAT_DEFAULTS) {
    if (state.phase === "idle") return false
    const step = Math.max(0, Math.min(0.1, dt))
    let nextMonster = false

    switch (state.phase) {
        case "approach": {
            state.characterX -= params.moveSpeed * step * 60
            state.monsterX += params.moveSpeed * step * 60
            if (state.characterX - state.monsterX <= params.engageDistance) {
                state.phase = "fighting"
                state.phaseElapsed = 0
                state.actionElapsed = 0
                state.monsterElapsed = 0
                state.monsterAction = "Attack"
            }
            break
        }
        case "fighting": {
            state.phaseElapsed += step
            state.monsterElapsed += step
            state.actionElapsed += step
            const action: AfkMonsterAction = state.phaseElapsed < 0.6 ? "Attack" : state.phaseElapsed < 1.2 ? "Hit" : "Death"
            if (action !== state.monsterAction) {
                state.monsterAction = action
                state.monsterElapsed = 0
            }
            // 角色每 0.6 秒重新起手
            if (state.actionElapsed >= 0.6) state.actionElapsed -= 0.6
            if (state.phaseElapsed >= 1.8) {
                state.phase = "monsterDeath"
                state.phaseElapsed = 0
                state.monsterFrozen = true
            }
            break
        }
        case "monsterDeath": {
            state.phaseElapsed += step
            if (state.phaseElapsed >= 0.5) {
                state.monsterVisible = false
                state.phase = "characterReset"
                state.phaseElapsed = 0
                state.actionElapsed = 0
            }
            break
        }
        case "characterReset": {
            state.characterX += params.moveSpeed * 2.5 * step * 60
            state.actionElapsed += step
            if (state.characterX >= params.characterSpawnX) {
                state.characterX = params.characterSpawnX
                state.phase = "waiting"
                state.phaseElapsed = 0
            }
            break
        }
        case "waiting": {
            state.phaseElapsed += step
            if (state.phaseElapsed >= params.respawnInterval) {
                combatApproach(state, params)
                nextMonster = true
            }
            break
        }
    }
    return nextMonster
}

/**
 * 角色在该阶段使用的动画名。
 * @param state 战斗状态
 * @returns Attack / Run / Death
 */
export function combatCharacterState(state: AfkCombatState): string {
    if (state.phase === "fighting" || state.phase === "monsterDeath") return "Attack"
    if (state.phase === "idle") return "Run"
    return "Run"
}

/**
 * 把官方坐标映射到实际画布（官方窗口宽 366）。
 * @param x 官方 X
 * @param canvasWidth 画布逻辑宽度
 * @param officialWidth 官方窗口宽度
 * @returns 画布 X
 */
export function mapCombatX(x: number, canvasWidth: number, officialWidth = 366) {
    return (x * canvasWidth) / officialWidth
}
