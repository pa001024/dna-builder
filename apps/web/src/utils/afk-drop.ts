/**
 * 小窗掉落贴图的物理模拟（纯计算，便于单测）。
 *
 * 物品从怪物位置爆出，受重力下落，落地按衰减系数弹几下后停住，
 * 一直留在原地直到副本完成事件把它清掉。
 */

/** 重力加速度（逻辑像素 / 秒²）。 */
export const AFK_DROP_GRAVITY = 1400
/** 每次落地的速度保留比例。 */
export const AFK_DROP_RESTITUTION = 0.42
/** 弹跳次数上限。 */
export const AFK_DROP_MAX_BOUNCES = 3
/** 低于这个下落速度就判定停住。 */
export const AFK_DROP_MIN_BOUNCE_SPEED = 90

/** 一颗掉落贴图。 */
export type AfkDropParticle = {
    /** 唯一键 */
    key: number
    /** 图标路径（主窗口解析好写回状态） */
    icon: string
    /** 左上角坐标 */
    x: number
    y: number
    /** 速度（像素 / 秒） */
    vx: number
    vy: number
    /** 边长 */
    size: number
    /** 旋转角度（度） */
    rotation: number
    /** 角速度（度 / 秒） */
    spin: number
    /** 已弹跳次数 */
    bounces: number
    /** 是否已停在地上 */
    resting: boolean
    /** 落地高度（左上角 y 的上限） */
    groundY: number
}

/** 生成一颗掉落的参数。 */
export type AfkDropSpawn = {
    key: number
    icon: string
    /** 爆出点（中心坐标） */
    x: number
    y: number
    size: number
    groundY: number
    /** 随机源，便于单测 */
    random?: () => number
}

/**
 * 生成一颗掉落：朝斜上方爆出，带随机旋转。
 * @param spawn 生成参数
 * @returns 掉落粒子
 */
export function createAfkDrop(spawn: AfkDropSpawn): AfkDropParticle {
    const random = spawn.random ?? Math.random
    return {
        key: spawn.key,
        icon: spawn.icon,
        x: spawn.x - spawn.size / 2,
        y: spawn.y - spawn.size / 2,
        // 左右各散开一点，纵向统一向上爆
        vx: (random() - 0.5) * 180,
        vy: -(220 + random() * 160),
        size: spawn.size,
        rotation: 0,
        spin: (random() - 0.5) * 900,
        bounces: 0,
        resting: false,
        groundY: spawn.groundY,
    }
}

/**
 * 推进一步物理模拟：重力、左右边界、落地弹跳与停住。
 * @param particle 掉落粒子（原地修改）
 * @param dt 步长（秒）
 * @param width 活动区域右边界
 * @param left 活动区域左边界
 */
export function stepAfkDrop(particle: AfkDropParticle, dt: number, width: number, left = 0): void {
    if (particle.resting) return
    particle.vy += AFK_DROP_GRAVITY * dt
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.rotation += particle.spin * dt
    const maxX = width - particle.size
    if (particle.x < left) {
        particle.x = left
        particle.vx = Math.abs(particle.vx) * 0.6
    } else if (particle.x > maxX) {
        particle.x = maxX
        particle.vx = -Math.abs(particle.vx) * 0.6
    }
    if (particle.y < particle.groundY) return
    particle.y = particle.groundY
    if (particle.bounces >= AFK_DROP_MAX_BOUNCES || Math.abs(particle.vy) < AFK_DROP_MIN_BOUNCE_SPEED) {
        particle.resting = true
        particle.vx = 0
        particle.vy = 0
        particle.rotation = 0
        return
    }
    particle.vy = -Math.abs(particle.vy) * AFK_DROP_RESTITUTION
    particle.vx *= 0.7
    particle.bounces++
}

/**
 * 掉落是否全部停稳（停稳后可以停掉动画循环）。
 * @param particles 掉落列表
 * @returns 全部停住时为 true
 */
export function afkDropsAtRest(particles: AfkDropParticle[]): boolean {
    return particles.every(particle => particle.resting)
}
