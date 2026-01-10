import * as THREE from "three"
import { BaseSkill } from "../BaseSkill"
import { VoxelEngine } from "../VoxelEngine"
import { LeveledSkillField } from "../../../data"
import { Monster } from "../../types"

// 幻象实体接口
interface Phantom {
    mesh: THREE.Object3D
    life: number
    radius: number
    damage: number
}

// --- 赛琪 技能 E: 抽茧成梦 / 逐光 ---
export class SaiqiSkillE extends BaseSkill {
    private phantoms: Phantom[] = []
    private COST = 30
    private PHANTOM_RADIUS = 6
    private PHANTOM_DURATION = 5

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[]
    ) {
        super(engine, "抽茧成梦")
        this.COST = this.fields.find(f => f.名称 === "神智消耗")?.值 || 30
        this.PHANTOM_RADIUS = this.fields.find(f => f.名称 === "[幻象]效果半径")?.值 || 6
    }

    protected onCast(): void {
        const isBrokenCocoon = this.engine.activeBuffs.has("破茧")
        const stats = this.engine.playerStats

        if (stats.currentSanity < this.COST) {
            this.engine.spawnFloatingText("神智不足", this.engine.getPlayerPosition(), "#FF0000")
            return
        }
        stats.currentSanity -= this.COST

        // 冲刺
        const forward = this.engine.getForwardVector()
        this.engine.applyDash(forward.multiplyScalar(this.engine.m2u(20)), 0.2) // Fast dash

        if (isBrokenCocoon) {
            // [逐光] Chase Light
            // 射出8发投射物
            const projectileCount = 8
            for (let i = 0; i < projectileCount; i++) {
                // 随机选择一个目标
                const target = this.engine.monsters.find(
                    m => !m.isDead && m.position.distanceTo(this.engine.getPlayerPosition()) < this.engine.m2u(20)
                )
                if (!target) {
                    // 没有目标时，向前进方向发射投射物
                    const spread = (Math.random() - 0.5) * 1.0
                    const dir = forward
                        .clone()
                        .applyAxisAngle(new THREE.Vector3(0, 1, 0), spread)
                        .normalize()
                    this.spawnProjectile(
                        this.engine
                            .getPlayerPosition()
                            .clone()
                            .add(new THREE.Vector3(0, 2, 0)),
                        dir,
                        null
                    )
                } else {
                    // 更新中处理的跟踪行为很复杂，目前先直接射击
                    const dir = target.position.clone().sub(this.engine.getPlayerPosition()).normalize()
                    const spread = (Math.random() - 0.5) * 0.5
                    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread)
                    this.spawnProjectile(
                        this.engine
                            .getPlayerPosition()
                            .clone()
                            .add(new THREE.Vector3(0, 2, 0)),
                        dir,
                        target
                    )
                }
            }
            this.engine.spawnFloatingText("逐光", this.engine.getPlayerPosition(), "#00FF00")
        } else {
            // [抽茧成梦]
            // 在当前位置创建幻影
            const pos = this.engine.getPlayerPosition().clone()
            // 目前使用一个简单的方框作为虚拟视觉效果，颜色为绿色
            const geometry = new THREE.BoxGeometry(1, 2, 1)
            const material = new THREE.MeshBasicMaterial({ color: 0x90ee90, transparent: true, opacity: 0.5 })
            const mesh = new THREE.Mesh(geometry, material)
            mesh.position.copy(pos)
            // 调整大小以匹配体素单位近似值
            mesh.scale.set(this.engine.m2u(0.5), this.engine.m2u(1.5), this.engine.m2u(0.5))

            // 将幻影添加到场景中
            this.engine.addToScene(mesh)

            const damage = 100 // 简化的伤害计算从字段中获取

            this.phantoms.push({
                mesh,
                life: this.PHANTOM_DURATION,
                radius: this.engine.m2u(this.PHANTOM_RADIUS),
                damage: damage,
            })

            this.engine.spawnFloatingText("幻象", pos, "#00FF00")
        }
    }

    private spawnProjectile(_start: THREE.Vector3, _dir: THREE.Vector3, target: Monster | null) {
        if (target) {
            this.applyDamage(target, "逐光")
        } else {
            //
        }
    }

    protected onUpdate(dt: number): void {
        // 累加1秒
        for (let i = this.phantoms.length - 1; i >= 0; i--) {
            const p = this.phantoms[i]
            p.life -= dt

            // 旋转幻影
            p.mesh.rotation.y += dt

            if (p.life <= 0) {
                this.explodePhantom(p)
                this.engine.removeFromScene(p.mesh)
                this.phantoms.splice(i, 1)
            }
        }
    }

    private explodePhantom(p: Phantom) {
        // 对半径内的敌人造成伤害
        this.engine.monsters.forEach(m => {
            if (!m.isDead && m.position.distanceTo(p.mesh.position) < p.radius) {
                this.applyDamage(m, "幻象爆炸")
            }
        })
    }
}

// --- 赛琪 技能 Q: 腐草为萤 ---
export class SaiqiSkillQ extends BaseSkill {
    private isActive: boolean = false
    private DRAIN_PER_SEC = 30
    private HP_DRAIN_PER_SEC = 0.05 // 5% max HP
    private SHIELD_CONVERT_RATIO = 1.5
    private ACTIVATION_COST = 10

    public shootRadius: number = 3 // 伊卡洛斯武器的伤害半径

    // 定时器，用于累加1秒
    private drainTimer: number = 0

    constructor(
        engine: VoxelEngine,
        public fields: LeveledSkillField[]
    ) {
        super(engine, "腐草为萤")
        this.DRAIN_PER_SEC = this.fields.find(f => f.名称 === "每秒神智消耗")?.值 || 30
        this.HP_DRAIN_PER_SEC = this.fields.find(f => f.名称 === "每秒流失生命值")?.值 || 0.05
        this.SHIELD_CONVERT_RATIO = this.fields.find(f => f.名称 === "超限护盾转化比例")?.值 || 1.5
        this.ACTIVATION_COST = this.fields.find(f => f.名称 === "神智消耗")?.值 || 10
        this.shootRadius = this.fields.find(f => f.名称 === "射击伤害半径")?.值 || 3
    }

    protected onCast(): void {
        if (this.isActive) {
            this.deactivate()
        } else {
            this.activate()
        }
    }

    private activate() {
        const stats = this.engine.playerStats
        if (stats.currentSanity < this.ACTIVATION_COST) {
            this.engine.spawnFloatingText("神智不足", this.engine.getPlayerPosition(), "#FF0000")
            return
        }
        stats.currentSanity -= this.ACTIVATION_COST

        this.isActive = true
        this.drainTimer = 0
        this.engine.addBuff("破茧", 99999) // 永久生效
        this.engine.spawnFloatingText("破茧", this.engine.getPlayerPosition(), "#00FF00")

        // 增加玩家速度
        this.engine.addPlayerVelocity(new THREE.Vector3(0, this.engine.m2u(10), 0))

        // 替换武器模型为 Icarus
        if (this.engine.charBuild.skillWeapon) {
            const name = this.engine.charBuild.skillWeapon.名称
            this.engine.setSkillWeaponOverride("melee", name)
            this.engine.setSkillWeaponOverride("ranged", name)
            this.engine.spawnFloatingText(`武器替换: ${name}`, this.engine.getPlayerPosition(), "#00FFFF")
        }

        // 隐藏武器模型
        this.engine.setWeaponVisibility(false)
    }

    private deactivate() {
        this.isActive = false
        this.engine.removeBuff("破茧")
        this.engine.spawnFloatingText("解除", this.engine.getPlayerPosition(), "#CCCCCC")

        // 重置武器状态为默认
        this.engine.setSkillWeaponOverride("melee", null)
        this.engine.setSkillWeaponOverride("ranged", null)

        // 显示武器模型
        this.engine.setWeaponVisibility(true)
    }

    protected onUpdate(dt: number): void {
        if (!this.isActive) return

        const stats = this.engine.playerStats
        const hpThreshold = stats.maxHP * 0.15

        // 累加定时器
        this.drainTimer += dt

        // 每秒钟执行一次逻辑
        if (this.drainTimer >= 1.0) {
            this.drainTimer -= 1.0 // 重置定时器，保持余数

            // 1. 如果生命值大于15%，消耗生命值并转换为护盾。不消耗神智。
            // 2. 如果生命值小于等于15%，消耗神智。

            if (stats.currentHP > hpThreshold) {
                // 消耗生命值（百分比），转换为护盾
                // 确保在逻辑中不会立即低于阈值，尽管检查在上面
                const drain = Math.floor(stats.maxHP * this.HP_DRAIN_PER_SEC)

                stats.currentHP -= drain

                const gain = Math.floor(drain * this.SHIELD_CONVERT_RATIO)
                stats.currentShield += gain
            } else {
                // 消耗神智（固定每秒消耗）
                const drain = Math.floor(this.DRAIN_PER_SEC)
                stats.currentSanity -= drain

                if (stats.currentSanity <= 0) {
                    stats.currentSanity = 0
                    this.deactivate()
                }
            }
        }
    }
}
