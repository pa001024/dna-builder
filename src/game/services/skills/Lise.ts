import * as THREE from "three"
import { BaseSkill, distanceToSegment } from "../BaseSkill"
import { VoxelEngine } from "../VoxelEngine"
import { LeveledSkillField } from "../../../data/leveled/LeveledSkill"

// --- Lise 技能 E: 快速出击 ---
// 逻辑: 向前冲刺（以米为单位的距离），对路径上的所有敌人造成伤害（以米为单位的宽度）。
export class LiseSkillE extends BaseSkill {
    private DASH_DISTANCE_M = 20
    private DASH_WIDTH_M = 3
    private COST = 20

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[],
    ) {
        super(engine, "快速出击")
        this.COST = this.fields.find((f) => f.名称 === "神智消耗")?.值 || 20
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
        const dashForceUnits = this.engine.m2u(this.DASH_DISTANCE_M)

        const playerRot = this.engine.getPlayerRotation()
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRot)

        // 添加速度（冲量）
        this.engine.addPlayerVelocity(forward.clone().multiplyScalar(dashForceUnits))

        // 2. Buff Logic
        let buffed = false
        if (stats.electricEnergy >= 30) {
            stats.electricEnergy -= 30
            this.engine.addBuff("过载", 9.0)
            this.engine.spawnFloatingText("过载!", this.engine.getPlayerPosition(), "#FFFF00")
            buffed = true
        }

        // 3. 范围路径逻辑（基于米）
        const startPos = this.engine.getPlayerPosition().clone()
        const endPos = startPos.clone().add(forward.clone().multiplyScalar(this.engine.m2u(this.DASH_DISTANCE_M)))
        const hitRadiusUnits = this.engine.m2u(this.DASH_WIDTH_M / 2) // 半径是宽度的一半

        // 遍历所有怪物，检查它们是否在路径上
        this.engine.monsters.forEach((m) => {
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
    private reactionTimer: number = 0
    private electricChargeMap = new Map<string, { type: "POS" | "NEG"; timeLeft: number }>()

    private readonly COST = 10
    private readonly DRAIN_PER_SEC = 20
    private readonly BURST_RADIUS_M = 4 // 4米
    private readonly ATTRACT_RANGE_M = 5 // 5米

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[],
    ) {
        super(engine, "涡旋电场")
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
        this.reactionTimer = 0

        // 初始范围爆发
        const playerPos = this.engine.getPlayerPosition()
        const burstRadiusUnits = this.engine.m2u(this.BURST_RADIUS_M)

        this.engine.monsters.forEach((m) => {
            if (m.position.distanceTo(playerPos) < burstRadiusUnits) {
                this.applyDamage(m)
            }
        })
    }

    protected onUpdate(dt: number): void {
        // 清理映射表
        for (const [id, charge] of this.electricChargeMap.entries()) {
            charge.timeLeft -= dt
            if (charge.timeLeft <= 0) this.electricChargeMap.delete(id)
        }

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
        this.reactionTimer += dt
        const playerPos = this.engine.getPlayerPosition()

        // 活动区域半径检查
        const fieldRadiusUnits = this.engine.m2u(this.BURST_RADIUS_M)

        // 1. 每秒: 持续伤害 + 电荷应用
        if (this.timer >= 1.0) {
            this.timer = 0
            const targets = this.engine.monsters.filter((m) => !m.isDead && m.position.distanceTo(playerPos) < fieldRadiusUnits)

            if (targets.length > 0) {
                // 优先选择无电荷的目标
                let target = targets.find((m) => !this.electricChargeMap.has(m.id))
                if (!target) target = targets[Math.floor(Math.random() * targets.length)]

                if (target) {
                    // 持续伤害
                    this.applyDamage(target, "选取敌人伤害")

                    // 电荷逻辑
                    const chargeType = Math.random() > 0.5 ? "POS" : "NEG"
                    const existing = this.electricChargeMap.get(target.id)

                    if (existing && existing.type === chargeType) {
                        existing.timeLeft = 6
                        this.engine.spawnFloatingText(
                            "刷新",
                            target.position.clone().add(new THREE.Vector3(0, 4, 0)),
                            chargeType === "POS" ? "#FF4444" : "#4444FF",
                        )
                    } else if (!existing) {
                        this.electricChargeMap.set(target.id, { type: chargeType, timeLeft: 6 })
                        this.engine.spawnFloatingText(
                            chargeType === "POS" ? "+" : "-",
                            target.position.clone().add(new THREE.Vector3(0, 4, 0)),
                            chargeType === "POS" ? "#FF0000" : "#0000FF",
                        )
                    }
                }
            }
        }

        // 2. 每3秒: 反应
        if (this.reactionTimer >= 3.0) {
            this.reactionTimer = 0
            this.triggerReaction()
        }
    }

    private triggerReaction() {
        // 过滤活着的带电怪物
        const charged = this.engine.monsters.filter((m) => !m.isDead && this.electricChargeMap.has(m.id))
        const pos = charged.filter((m) => this.electricChargeMap.get(m.id)?.type === "POS")
        const neg = charged.filter((m) => this.electricChargeMap.get(m.id)?.type === "NEG")

        const usedIds = new Set<string>()
        const attractRangeUnits = this.engine.m2u(this.ATTRACT_RANGE_M)

        // 尝试配对
        pos.forEach((p) => {
            if (usedIds.has(p.id)) return
            // 在范围内寻找附近的负电荷
            const partner = neg.find((n) => !usedIds.has(n.id) && n.position.distanceTo(p.position) < attractRangeUnits)

            if (partner) {
                usedIds.add(p.id)
                usedIds.add(partner.id)

                // 拉到一起
                const midpoint = p.position.clone().add(partner.position).multiplyScalar(0.5)
                midpoint.y = 0

                // 瞬间移动（视觉效果）
                p.position.lerp(midpoint, 0.8)
                partner.position.lerp(midpoint, 0.8)

                // 伤害
                this.applyDamage(p, "[电荷]伤害")
                this.applyDamage(partner, "[电荷]伤害")
                this.engine.spawnFloatingText("吸引", midpoint.add(new THREE.Vector3(0, 5, 0)), "#FFFFFF")
            } else {
                // 单独过载
                this.applyDamage(p, "[电荷]伤害")
            }
        })
    }
}
