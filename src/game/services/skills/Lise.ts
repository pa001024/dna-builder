import * as THREE from "three"
import type { LeveledSkillField } from "../../../data"
import type { Monster } from "../../types"
import { BaseSkill, distanceToSegment } from "../BaseSkill"
import type { VoxelEngine } from "../VoxelEngine"

// --- Lise 技能 E: 快速出击 ---
// 逻辑: 向前冲刺（以米为单位的距离），对路径上的所有敌人造成伤害（以米为单位的宽度）。
export class LiseSkillE extends BaseSkill {
    private DASH_DISTANCE_M = 5
    private DASH_WIDTH_M = 3
    private COST = 20
    private DASH_DURATION = 0.2 // 0.2 seconds dash

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[]
    ) {
        super(engine, "快速出击")
        this.COST = this.fields.find(f => f.名称 === "神智消耗")?.值 || 20
    }

    protected onCast(): void {
        const stats = this.engine.playerStats

        if (stats.currentSanity < this.COST) {
            this.engine.spawnFloatingText("神智不足", this.engine.getPlayerPosition(), "#FF0000")
            return
        }

        stats.currentSanity -= this.COST

        // 1. 移动冲量
        // 将米转换为引擎物理单位
        // Speed = Distance / Time
        const speedUnitsPerSec = this.engine.m2u(this.DASH_DISTANCE_M) / this.DASH_DURATION

        // 使用引擎计算的准确面向（朝向鼠标）
        const forward = this.engine.getForwardVector()

        // 应用冲刺
        this.engine.applyDash(forward.clone().multiplyScalar(speedUnitsPerSec), this.DASH_DURATION)

        // 2. Buff Logic
        if (stats.electricEnergy >= 30) {
            stats.electricEnergy -= 30
            this.engine.addBuff("黎瑟E", 9.0)
            this.engine.spawnFloatingText("伤害增加!", this.engine.getPlayerPosition(), "#FFFF00")
        }

        // 3. 范围路径逻辑（基于米）
        const startPos = this.engine.getPlayerPosition().clone()
        const endPos = startPos.clone().add(forward.clone().multiplyScalar(this.engine.m2u(this.DASH_DISTANCE_M)))
        const hitRadiusUnits = this.engine.m2u(this.DASH_WIDTH_M / 2) // 半径是宽度的一半

        // 遍历所有怪物，检查它们是否在路径上
        this.engine.monsters.forEach(m => {
            if (m.isDead) return

            // 检查到线段的距离
            const distUnits = distanceToSegment(m.position, startPos, endPos)

            if (distUnits < hitRadiusUnits) {
                // 命中！
                this.applyDamage(m)

                // 被动生成
                this.engine.addElectricEnergy(5)
            }
        })
    }
}

// --- Lise 技能 Q: 涡旋电场 ---
export class LiseSkillQ extends BaseSkill {
    private isActive: boolean = false
    private timer: number = 0
    private CHARGE_DURATION = 6

    private readonly COST = 10
    private readonly DRAIN_PER_SEC = 20
    private readonly BURST_RADIUS_M = 4 // 4米
    private readonly ATTRACT_RANGE_M = 5 // 5米

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[]
    ) {
        super(engine, "涡旋电场")
        this.CHARGE_DURATION = this.fields.find(f => f.名称 === "[电荷]持续时间")?.值 || 6
    }

    protected onCast(): void {
        if (this.isActive) {
            this.isActive = false // Toggle off
            return
        }

        const stats = this.engine.playerStats
        if (stats.currentSanity < this.COST) {
            this.engine.spawnFloatingText("神智不足", this.engine.getPlayerPosition(), "#FF0000")
            return
        }

        stats.currentSanity -= this.COST
        this.isActive = true
        this.timer = 0

        // 初始范围爆发
        const playerPos = this.engine.getPlayerPosition()
        const burstRadiusUnits = this.engine.m2u(this.BURST_RADIUS_M)

        this.engine.monsters.forEach(m => {
            if (m.position.distanceTo(playerPos) < burstRadiusUnits) {
                this.applyDamage(m)
            }
        })
    }

    protected onUpdate(dt: number): void {
        // 更新怪物的电荷状态 (独立于技能激活状态)
        this.engine.monsters.forEach(m => {
            if (!m.statusEffects) return
            for (let i = m.statusEffects.length - 1; i >= 0; i--) {
                const effect = m.statusEffects[i]
                if (effect.type === "POS_CHARGE" || effect.type === "NEG_CHARGE") {
                    effect.duration -= dt
                    if (effect.duration <= 0) {
                        m.statusEffects.splice(i, 1)
                    }
                }
            }
        })

        if (!this.isActive) return

        const stats = this.engine.playerStats

        // 消耗逻辑
        stats.currentSanity -= this.DRAIN_PER_SEC * dt
        if (stats.currentSanity <= 0) {
            stats.currentSanity = 0
            this.isActive = false
            return
        }

        this.timer += dt
        const playerPos = this.engine.getPlayerPosition()

        // 活动区域半径检查
        const fieldRadiusUnits = this.engine.m2u(this.BURST_RADIUS_M)

        // 1. 每秒: 持续伤害 + 电荷应用
        if (this.timer >= 1.0) {
            this.timer = 0
            const targets = this.engine.monsters.filter(m => !m.isDead && m.position.distanceTo(playerPos) < fieldRadiusUnits)

            if (targets.length > 0) {
                // 优先选择无电荷的目标
                let target = targets.find(m => !m.statusEffects.some(e => e.type.includes("CHARGE")))
                if (!target) target = targets[Math.floor(Math.random() * targets.length)]

                if (target) {
                    // 持续伤害
                    this.applyDamage(target, "选取敌人伤害")

                    // 电荷逻辑
                    const chargeType = Math.random() > 0.5 ? "POS_CHARGE" : "NEG_CHARGE"
                    const label = chargeType === "POS_CHARGE" ? "+" : "-"
                    const color = chargeType === "POS_CHARGE" ? "#ef4444" : "#3b82f6" // Red / Blue

                    const existing = target.statusEffects.find(e => e.type.includes("CHARGE"))

                    if (existing) {
                        if (existing.type === chargeType) {
                            existing.duration = this.CHARGE_DURATION
                            this.engine.spawnFloatingText("刷新", target.position.clone().add(new THREE.Vector3(0, 4, 0)), color)
                        }
                    } else {
                        target.statusEffects.push({
                            type: chargeType,
                            label: label,
                            color: color,
                            duration: this.CHARGE_DURATION,
                            maxDuration: this.CHARGE_DURATION,
                        })
                        this.engine.spawnFloatingText(label, target.position.clone().add(new THREE.Vector3(0, 4, 0)), color)

                        // 立即触发反应（仅针对新获得电荷的单位）
                        this.triggerReactionFor(target)
                    }
                }
            }
        }
    }

    private triggerReactionFor(source: Monster) {
        const charge = source.statusEffects.find(e => e.type.includes("CHARGE"))
        if (!charge) return

        const oppositeType = charge.type === "POS_CHARGE" ? "NEG_CHARGE" : "POS_CHARGE"
        const attractRangeUnits = this.engine.m2u(this.ATTRACT_RANGE_M)

        // 寻找范围内最近的异性电荷
        let partner: Monster | undefined
        let minDist = attractRangeUnits

        for (const m of this.engine.monsters) {
            if (m === source || m.isDead) continue
            if (m.statusEffects.some(e => e.type === oppositeType)) {
                const dist = source.position.distanceTo(m.position)
                if (dist < minDist) {
                    minDist = dist
                    partner = m
                }
            }
        }

        if (partner) {
            // 吸引
            const midpoint = source.position.clone().add(partner.position).multiplyScalar(0.5)
            midpoint.y = 0
            source.position.lerp(midpoint, 0.8)
            partner.position.lerp(midpoint, 0.8)

            // 双方伤害
            this.applyDamage(source, "[电荷]伤害")
            this.applyDamage(partner, "[电荷]伤害")
            this.engine.spawnFloatingText("吸引", midpoint.add(new THREE.Vector3(0, 5, 0)), "#FFFFFF")
        } else {
            // 单独过载
            this.applyDamage(source, "[电荷]伤害")
        }
    }

    // Called when a monster dies
    public onMonsterDeath(monster: Monster) {
        if (!monster.statusEffects) return
        const charge = monster.statusEffects.find(e => e.type.includes("CHARGE"))
        if (!charge) return

        const range = this.engine.m2u(20) // 20m range to transfer

        this.engine.monsters.forEach(m => {
            // Skip the dead monster itself and other dead monsters
            if (m.isDead || m.id === monster.id) return

            if (m.position.distanceTo(monster.position) <= range) {
                const existing = m.statusEffects.find(e => e.type.includes("CHARGE"))

                if (!existing) {
                    // Spread charge with remaining duration from dead monster
                    m.statusEffects.push({ ...charge })
                    this.engine.spawnFloatingText("传递", m.position.clone().add(new THREE.Vector3(0, 4, 0)), charge.color)
                    // 传递给没有电荷的单位时立即触发一次
                    this.triggerReactionFor(m)
                } else if (existing.type === charge.type) {
                    // If same charge, extend duration if transmitted one is longer
                    if (existing.duration < charge.duration) {
                        existing.duration = charge.duration
                        this.engine.spawnFloatingText("刷新", m.position.clone().add(new THREE.Vector3(0, 4, 0)), charge.color)
                    }
                }
            }
        })
    }
}
