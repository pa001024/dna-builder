import * as THREE from "three"
import { VoxelData, PlayerStats, Monster, GameSettings, FloatingText } from "../types"
import { Generators } from "../utils/voxelGenerators"
import { BaseSkill } from "./BaseSkill"
import { CharBuild, LeveledMonster, DynamicMonster } from "../../data/index"
import { SkillRegistry } from "./SkillRegistry"

export class VoxelEngine {
    private container: HTMLElement
    private scene: THREE.Scene
    private camera: THREE.OrthographicCamera
    private renderer: THREE.WebGLRenderer
    private clock: THREE.Clock
    private animationId: number | null = null

    // -- 公共状态（供技能使用） --
    public playerStats: PlayerStats
    public monsters: Monster[] = []
    public activeBuffs: Map<string, number> = new Map()
    public gravityEnabled: boolean = true // Control gravity for flight

    // Weapon State
    private skillWeaponOverrideMelee: string | null = null
    private skillWeaponOverrideRanged: string | null = null

    // -- 常量 --
    // 1米 = 10引擎单位。
    // 假设角色约12单位高（约1.2米女孩），所以10单位=1米是合理的比例。
    private readonly METER_SCALE = 10.0
    // 地图大小
    private readonly MAP_SIZE = 400
    private readonly MAP_HALF_SIZE = 200

    // -- 内部状态 --
    private projectiles: any[] = []
    private floatingTexts: FloatingText[] = []
    private playerMesh: THREE.Group
    private weaponMesh: THREE.Group // 新增：武器模型
    private playerVelocity: THREE.Vector3 = new THREE.Vector3()
    private isGrounded = true
    private dashTimer = 0
    private dirLight: THREE.DirectionalLight // 保存光照引用以跟随玩家

    // 攻击动画状态
    private isAttacking = false
    private attackTimer = 0
    private readonly ATTACK_DURATION = 0.3

    // 射击状态 (自动连射)
    private isFiring = false
    private fireTimer = 0

    // 技能
    private skillE: BaseSkill
    private skillQ: BaseSkill

    private sanityRegenTimer = 0
    private chargeAttackTime = 0

    // 输入
    private keys: Record<string, boolean> = {}
    private mouse = new THREE.Vector2()
    private mouseWorld = new THREE.Vector3()

    // 回调函数
    private onStatsUpdate: (stats: PlayerStats) => void
    private onMonstersUpdate: (monsters: Monster[]) => void
    private onTextUpdate: (texts: FloatingText[]) => void
    private onDpsUpdate: (dps: number, total: number) => void

    private totalDamage = 0
    private startTime = 0

    public settings: GameSettings = {
        monsterCount: 5,
        monsterId: 6001001,
        monsterLevel: 1,
        spawnType: "random",
        autoLevelUp: false,
        autoLevelInterval: 30,
        spawnInterval: 5,
        sanityRegenAmount: 7,
        sanityRegenInterval: 3,
    }
    private lastSpawnTime = 0
    private lastLevelUpTime = 0

    getCharModel() {
        const nameMap: Record<string, string> = {
            赛琪: "Saiqi",
            黎瑟: "Lise",
        }
        const charName = nameMap[this.charBuild.char.名称] || "Default"
        const generator = (Generators as any)[charName] || Generators.Default
        return generator()
    }

    getWeaponModel() {
        const nameMap: Record<string, string> = {
            赛琪: "SaiqiWeapon",
        }
        const weaponName = nameMap[this.charBuild.char.名称] || "DefaultWeapon"
        const generator = (Generators as any)[weaponName] || Generators.DefaultWeapon
        return generator()
    }

    constructor(
        container: HTMLElement,
        public charBuild: CharBuild,
        onStatsUpdate: (stats: PlayerStats) => void,
        onMonstersUpdate: (monsters: Monster[]) => void,
        onTextUpdate: (texts: FloatingText[]) => void,
        onDpsUpdate: (dps: number, total: number) => void,
    ) {
        this.container = container
        this.onStatsUpdate = onStatsUpdate
        this.onMonstersUpdate = onMonstersUpdate
        this.onTextUpdate = onTextUpdate
        this.onDpsUpdate = onDpsUpdate
        this.clock = new THREE.Clock()

        const attrs = this.charBuild.attrs

        // 状态
        this.playerStats = {
            maxHP: attrs.生命,
            currentHP: attrs.生命,
            maxShield: attrs.护盾,
            currentShield: attrs.护盾,
            maxSanity: attrs.神智,
            currentSanity: attrs.神智,
            electricEnergy: 0,
            attack: attrs.攻击,
            defense: attrs.防御,
            moveSpeed: 15,
            activeBuffs: [],
        }
        this.startTime = Date.now()

        // ThreeJS 设置
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x202030)

        const aspect = window.innerWidth / window.innerHeight
        const d = 40
        this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000)
        this.camera.position.set(50, 50, 50)
        this.camera.lookAt(0, 0, 0)

        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.shadowMap.enabled = true
        container.appendChild(this.renderer.domElement)

        // 环境
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambientLight)
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
        this.dirLight.position.set(20, 50, 30)
        this.dirLight.castShadow = true
        this.dirLight.shadow.mapSize.set(2048, 2048)
        this.dirLight.shadow.camera.left = -50
        this.dirLight.shadow.camera.right = 50
        this.dirLight.shadow.camera.top = 50
        this.dirLight.shadow.camera.bottom = -50
        this.scene.add(this.dirLight)
        this.scene.add(this.dirLight.target) // 添加target到场景以便移动

        const planeGeo = new THREE.PlaneGeometry(this.MAP_SIZE, this.MAP_SIZE)
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x333344 })
        const ground = new THREE.Mesh(planeGeo, planeMat)
        ground.rotation.x = -Math.PI / 2
        ground.receiveShadow = true
        this.scene.add(ground)
        this.scene.add(new THREE.GridHelper(this.MAP_SIZE, 40, 0x444455, 0x444455))

        // 玩家 (Dynamic Loading)
        this.playerMesh = this.createVoxelMesh(this.getCharModel())
        this.playerMesh.position.y = 0
        this.scene.add(this.playerMesh)

        // 武器
        this.weaponMesh = this.createVoxelMesh(this.getWeaponModel())
        this.playerMesh.add(this.weaponMesh)
        // 初始位置：右手持有，稍微向前倾斜
        this.weaponMesh.position.set(4, 6, 2) // 右手位置附近
        this.weaponMesh.rotation.x = Math.PI / 4 // 向前倾斜45度

        // 初始化技能
        const skills = charBuild.char.技能
        if (skills.length < 2) {
            throw new Error("角色必须有至少2个技能")
        }
        this.skillE = new (SkillRegistry.get(skills[0].id))(this, skills[0].getFieldsWithAttr(attrs))
        this.skillQ = new (SkillRegistry.get(skills[1].id))(this, skills[1].getFieldsWithAttr(attrs))

        // 事件
        window.addEventListener("keydown", this.onKeyDown)
        window.addEventListener("keyup", this.onKeyUp)
        window.addEventListener("mousedown", this.onMouseDown)
        window.addEventListener("mouseup", this.onMouseUp)
        window.addEventListener("mousemove", this.onMouseMove)
        container.addEventListener("contextmenu", (e) => e.preventDefault())

        this.animate()
    }

    public setSettings(settings: GameSettings) {
        this.settings = settings
    }

    public cleanup() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId)
        }
        window.removeEventListener("keydown", this.onKeyDown)
        window.removeEventListener("keyup", this.onKeyUp)
        window.removeEventListener("mousedown", this.onMouseDown)
        window.removeEventListener("mouseup", this.onMouseUp)
        window.removeEventListener("mousemove", this.onMouseMove)

        this.renderer.dispose()
        this.container.innerHTML = ""
    }

    // --- 单位转换 ---
    public m2u(meters: number): number {
        return meters * this.METER_SCALE
    }

    public u2m(units: number): number {
        return units / this.METER_SCALE
    }

    // --- 技能接口 ---
    public getPlayerPosition(): THREE.Vector3 {
        return this.playerMesh.position
    }

    public getPlayerRotation(): number {
        return this.playerMesh.rotation.y
    }

    // 获取角色面向（基于鼠标位置）
    public getForwardVector(): THREE.Vector3 {
        // 直接使用模型的世界方向，因为updatePlayer已经确保了模型朝向正确（消除了视差）
        const dir = new THREE.Vector3()
        this.playerMesh.getWorldDirection(dir)
        dir.y = 0
        if (dir.lengthSq() > 0.001) {
            dir.normalize()
        } else {
            // 回退逻辑
            dir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerMesh.rotation.y)
        }
        return dir
    }

    public addPlayerVelocity(v: THREE.Vector3) {
        this.playerVelocity.add(v)
    }

    public applyDash(velocity: THREE.Vector3, duration: number) {
        // 设置水平速度
        this.playerVelocity.x = velocity.x
        this.playerVelocity.z = velocity.z
        // 暂时重置垂直速度以实现平飞效果（如果是在空中），或者在地面滑行
        // 不再强制抬高Y轴，防止浮空bug
        this.playerVelocity.y = 0

        this.dashTimer = duration
    }

    public addElectricEnergy(amount: number) {
        this.playerStats.electricEnergy = Math.min(this.playerStats.electricEnergy + amount, 100)
    }

    public addBuff(name: string, duration: number) {
        this.activeBuffs.set(name, duration)
        // 简单处理：如果是赛琪的破茧状态，设置重力
        if (name === "破茧") {
            this.setGravity(false)
        }
    }

    public removeBuff(name: string) {
        this.activeBuffs.delete(name)
        if (name === "破茧") {
            this.setGravity(true)
        }
    }

    public setGravity(enabled: boolean) {
        this.gravityEnabled = enabled
        if (!enabled) {
            this.playerVelocity.y = 0
        }
    }

    public setWeaponVisibility(visible: boolean) {
        this.weaponMesh.visible = visible
    }

    public setSkillWeaponOverride(slot: "melee" | "ranged", weaponName: string | null) {
        if (slot === "melee") {
            this.skillWeaponOverrideMelee = weaponName
        } else {
            this.skillWeaponOverrideRanged = weaponName
        }
    }

    public getMeleeWeapon() {
        if (this.skillWeaponOverrideMelee && this.charBuild.skillWeapon?.名称 === this.skillWeaponOverrideMelee) {
            return this.charBuild.skillWeapon
        }
        return this.charBuild.meleeWeapon
    }

    public getRangedWeapon() {
        if (this.skillWeaponOverrideRanged && this.charBuild.skillWeapon?.名称 === this.skillWeaponOverrideRanged) {
            return this.charBuild.skillWeapon
        }
        return this.charBuild.rangedWeapon
    }

    public spawnFloatingText(text: string, pos: THREE.Vector3, color: string) {
        this.floatingTexts.push({
            id: Math.random().toString(),
            position: pos,
            text: text,
            color: color,
            life: 1.0,
            opacity: 1.0,
        })
    }

    public addToScene(object: THREE.Object3D) {
        this.scene.add(object)
    }

    public removeFromScene(object: THREE.Object3D) {
        this.scene.remove(object)
    }

    formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M"
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K"
        }
        return num.toString()
    }

    getElementClass(element: string): string {
        const classMap: Record<string, string> = {
            光: "#f59e0b", // amber-500
            暗: "#6b7280", // gray-500
            水: "#3b82f6", // blue-500
            火: "#ef4444", // red-500
            雷: "#8b5cf6", // violet-500
            风: "#10b981", // emerald-500
        }
        return classMap[element] || "#ffffff"
    }

    public applySkillDamage(target: Monster, skillName: string) {
        if (target.isDead) return

        // 为CharBuild构建兼容的DynamicMonster对象
        const adapter = {
            id: parseInt(target.id) || 1001001,
            n: target.name,
            f: target.faction,
            atk: target.attack,
            def: target.defense,
            hp: target.maxHP,
            es: target.maxShield,
            tn: 0,
            currentHP: target.currentHP,
            currentShield: target.currentShield,
            currentWarPose: 0,
            等级: target.level,
        } as DynamicMonster // Cast to unknown first to bypass type check

        // 使用CharBuild计算伤害
        // 注意：calculateRandomDamage会修改适配器的HP/护盾。
        this.charBuild.calculateRandomDamage(skillName, adapter)

        // 根据适配器的变化更新真实目标的状态
        const dealtShieldDmg = target.currentShield - adapter.currentShield
        const dealtHpDmg = target.currentHP - adapter.currentHP

        target.currentShield = adapter.currentShield
        target.currentHP = adapter.currentHP

        const totalDmg = dealtShieldDmg + dealtHpDmg

        const color = this.getElementClass(this.charBuild.char.属性)
        // 显示整数伤害
        const text = Math.floor(totalDmg).toString()
        this.spawnFloatingText(text, target.position.clone().add(new THREE.Vector3(0, 3, 0)), color)

        this.totalDamage += totalDmg

        if (target.currentHP <= 0) {
            target.isDead = true
            this.scene.remove(target.mesh)

            // Notify skills about death
            this.skillE.onMonsterDeath(target)
            this.skillQ.onMonsterDeath(target)
        }
    }

    // --- 内部辅助函数 ---
    private getScreenPosition(pos: THREE.Vector3): { x: number; y: number } {
        this.camera.updateMatrixWorld()
        const vec = pos.clone()
        vec.project(this.camera)
        const x = (vec.x * 0.5 + 0.5) * this.container.clientWidth
        const y = (-(vec.y * 0.5) + 0.5) * this.container.clientHeight
        return { x, y }
    }

    private createVoxelMesh(data: VoxelData[]): THREE.Group {
        const group = new THREE.Group()
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const matMap = new Map<number, THREE.MeshStandardMaterial>()
        data.forEach((v) => {
            if (!matMap.has(v.color)) {
                matMap.set(v.color, new THREE.MeshStandardMaterial({ color: v.color }))
            }
            const mesh = new THREE.Mesh(geometry, matMap.get(v.color))
            mesh.position.set(v.x, v.y, v.z)
            mesh.castShadow = true
            mesh.receiveShadow = true
            group.add(mesh)
        })
        return group
    }

    private isRangedWeapon(weapon: any): boolean {
        if (!weapon) return false
        // Check for '远程' in type or category, or if it's a SkillWeapon with '远程'
        if (Array.isArray(weapon.类型)) {
            return weapon.类型.includes("远程")
        }
        if (weapon.类型 === "远程" || weapon.类别 === "远程") return true
        return false
    }

    // --- 输入处理 ---
    private onKeyDown = (e: KeyboardEvent) => {
        this.keys[e.code] = true

        if (e.code === "Space" && this.isGrounded && this.gravityEnabled) {
            this.playerVelocity.y = this.m2u(4) // 跳跃逻辑通常是基于冲量的。保持原始值用于跳跃或调整。
            this.isGrounded = false
        }
        if (e.code === "KeyE") this.skillE.tryCast()
        if (e.code === "KeyQ") this.skillQ.tryCast()
    }

    private onKeyUp = (e: KeyboardEvent) => (this.keys[e.code] = false)

    private onMouseDown = (e: MouseEvent) => {
        // 左键
        if (e.button === 0) {
            // 检查当前激活的武器是否为远程武器（例如，替代近战武器的同律武器）
            const activeWeapon = this.getMeleeWeapon()

            if (this.isRangedWeapon(activeWeapon)) {
                this.isFiring = true
                // 如果计时器已准备就绪，请立即触发以获得响应感
                if (this.fireTimer <= 0) {
                    this.performRangedAttack(0)
                    // 重置计时器。如果武器有攻速属性，使用武器攻速。否则默认0.5秒间隔。
                    const attrs = this.charBuild.calculateWeaponAttributes(activeWeapon)
                    // 攻速属性是一个乘数（例如，1.2 意味着快 20%）。大多数远程武器的基础速度大约是 2-5 发 / 秒？
                    // 我们假设基础速度是每秒 2 发（间隔 0.5 秒），再乘以攻击速度。
                    const attackSpeed = Math.max(0.1, attrs.weapon?.攻速 || 1)
                    this.fireTimer = 0.5 / attackSpeed
                }
            } else {
                this.performMeleeAttack()
            }
        } else if (e.button === 2) {
            this.chargeAttackTime = Date.now()
        }
    }

    private onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) {
            this.isFiring = false
        } else if (e.button === 2) {
            const charge = Math.min((Date.now() - this.chargeAttackTime) / 1000, 1.5)
            this.performRangedAttack(charge)
            this.chargeAttackTime = 0
        }
    }

    private onMouseMove = (e: MouseEvent) => {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(this.mouse, this.camera)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const target = new THREE.Vector3()
        raycaster.ray.intersectPlane(plane, target)
        if (target) this.mouseWorld.copy(target)
    }

    // --- ACTIONS ---

    private performMeleeAttack() {
        if (this.isAttacking) return // Prevent spamming while animation plays

        this.isAttacking = true
        this.attackTimer = 0

        const forward = this.getForwardVector()
        const rangeUnits = this.m2u(2.5) // 2.5米范围
        const hitCenter = this.playerMesh.position.clone().add(forward.multiplyScalar(rangeUnits / 2))

        let skillName = "普通攻击"
        if (this.skillWeaponOverrideMelee) {
            skillName = this.skillWeaponOverrideMelee
        }

        this.monsters.forEach((m) => {
            if (m.position.distanceTo(hitCenter) < rangeUnits) {
                this.applySkillDamage(m, skillName)
                this.addElectricEnergy(2)
            }
        })
    }

    private performRangedAttack(chargeTime: number) {
        const startPos = this.playerMesh.position.clone().add(new THREE.Vector3(0, 2, 0))

        // 投射物应该指向鼠标点击的实际世界坐标（地面），而不是跟随角色水平朝向
        // 这样可以解决飞行时无法打中地面怪物的问题
        const targetDir = this.mouseWorld.clone().sub(startPos).normalize()

        const mesh = this.createVoxelMesh(Generators.Projectile())
        mesh.position.copy(startPos)
        mesh.lookAt(startPos.clone().add(targetDir))
        mesh.scale.set(0.5, 0.5, 0.5)

        this.scene.add(mesh)

        let aoeRadius = 0
        let skillName = "射击"

        if (this.skillWeaponOverrideRanged) {
            skillName = this.skillWeaponOverrideRanged
            // Check for Skill Weapon Mode
            if (skillName === "伊卡洛斯") {
                const q = this.skillQ as any
                if (q.shootRadius) {
                    aoeRadius = q.shootRadius
                }
            }
        }

        this.projectiles.push({
            mesh,
            velocity: targetDir.multiplyScalar(this.m2u(15)), // 速度：15米/秒
            life: 2.0,
            charge: chargeTime,
            aoeRadius: aoeRadius,
            skillName: skillName, // 将技能名称存储在投射物中
        })
    }

    // --- 游戏循环 ---

    private spawnMonster() {
        const angle = Math.random() * Math.PI * 2
        const radiusUnits = this.settings.spawnType === "ring" ? this.m2u(10) : this.m2u(5 + Math.random() * 10)
        const x = Math.sin(angle) * radiusUnits
        const z = Math.cos(angle) * radiusUnits

        const monsterMesh = this.createVoxelMesh(Generators.RobotGuard(this.settings.monsterLevel))
        monsterMesh.position.set(x, 20, z)
        this.scene.add(monsterMesh)

        const level = this.settings.monsterLevel

        // 使用LeveledMonster根据等级计算新怪物的属性
        const newMonster = new LeveledMonster(this.settings.monsterId, level) // 1001001 is "生命木桩" ID, used as base

        this.monsters.push({
            id: Math.random().toString(),
            name: newMonster.n,
            level: level,
            position: monsterMesh.position,
            mesh: monsterMesh,
            maxHP: newMonster.hp,
            currentHP: newMonster.hp,
            maxShield: newMonster.es || 0,
            currentShield: newMonster.es || 0,
            attack: newMonster.atk,
            defense: newMonster.def,
            faction: newMonster.f,
            speed: this.m2u(3 + Math.random() * 1), // 单位速度
            isDead: false,
            // AI Init
            aiState: "CHASE",
            aiActionTimer: 0,
            statusEffects: [], // Initialize statusEffects
        })
    }

    private updateMonsters(dt: number) {
        const now = this.clock.getElapsedTime()
        if (
            this.monsters.filter((m) => !m.isDead).length < this.settings.monsterCount &&
            now - this.lastSpawnTime > this.settings.spawnInterval
        ) {
            this.spawnMonster()
            this.lastSpawnTime = now
        }

        if (this.settings.autoLevelUp && now - this.lastLevelUpTime > this.settings.autoLevelInterval && this.settings.monsterLevel < 180) {
            this.settings.monsterLevel += 5
            this.lastLevelUpTime = now
            this.spawnFloatingText("Monster Level Up!", this.playerMesh.position.clone().add(new THREE.Vector3(0, 5, 0)), "#FF0000")
        }

        const chaseDistanceThreshold = this.m2u(5) // 超过5米强制追逐
        const stopDistanceThreshold = this.m2u(2.5) // 小于2.5米停止追逐，进入决策状态

        this.monsters.forEach((m) => {
            if (m.isDead) return

            // 1. 重力
            if (m.position.y > 0) {
                m.position.y -= 20 * dt
                if (m.position.y < 0) m.position.y = 0
            }

            // 2. AI 状态机更新
            m.aiActionTimer = (m.aiActionTimer || 0) - dt
            const dist = m.position.distanceTo(this.playerMesh.position)

            // 状态转换逻辑
            if (dist > chaseDistanceThreshold) {
                m.aiState = "CHASE"
            } else if (m.aiState === "CHASE" && dist <= stopDistanceThreshold) {
                // 到达玩家附近，切换到闲置/游荡决策
                m.aiState = "IDLE"
                m.aiActionTimer = 0 // 立即进行决策
            }

            // 决策逻辑 (如果在玩家附近且计时器结束)
            if (m.aiState !== "CHASE" && (m.aiActionTimer || 0) <= 0) {
                const rand = Math.random()
                if (rand < 0.6) {
                    // 60% 概率发呆
                    m.aiState = "IDLE"
                    m.aiActionTimer = 1.0 + Math.random() * 2.0 // 持续1-3秒
                } else {
                    // 40% 概率游荡
                    m.aiState = "WANDER"
                    m.aiActionTimer = 1.0 + Math.random() * 1.5 // 持续1-2.5秒
                    // 随机方向
                    const angle = Math.random() * Math.PI * 2
                    m.wanderDirection = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize()
                }
            }

            // 3. 执行行为
            if (m.aiState === "CHASE") {
                // 追逐玩家
                const dir = this.playerMesh.position.clone().sub(m.position).normalize()
                dir.y = 0
                m.position.add(dir.multiplyScalar(m.speed * dt))
                m.mesh.lookAt(this.playerMesh.position.x, m.position.y, this.playerMesh.position.z)
            } else if (m.aiState === "WANDER") {
                // 向随机方向移动
                if (m.wanderDirection) {
                    const moveSpeed = m.speed * 0.5 // 游荡速度较慢
                    m.position.add(m.wanderDirection.clone().multiplyScalar(moveSpeed * dt))
                    // 面向移动方向
                    const lookTarget = m.position.clone().add(m.wanderDirection)
                    m.mesh.lookAt(lookTarget.x, m.position.y, lookTarget.z)
                }
            } else {
                // IDLE: 原地不动，盯着玩家
                m.mesh.lookAt(this.playerMesh.position.x, m.position.y, this.playerMesh.position.z)
            }

            // 限制怪物移动范围
            m.position.x = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, m.position.x))
            m.position.z = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, m.position.z))

            // 4. 碰撞与战斗逻辑 (简单模拟)
            if (dist < this.m2u(2.5) && m.aiState !== "WANDER") {
                // 游荡时不攻击
                // 保持原有的攻击逻辑，但增加一点随机性间隔，避免每帧都在判定
                if (Math.random() < 0.01) {
                    const dmg = Math.max(0, m.attack - this.playerStats.defense)
                    if (this.playerStats.currentShield > 0) {
                        this.playerStats.currentShield = Math.max(0, this.playerStats.currentShield - dmg)
                    } else {
                        this.playerStats.currentHP = Math.max(0, this.playerStats.currentHP - dmg)
                    }
                }
            }
        })

        this.monsters = this.monsters.filter((m) => !m.isDead)
        this.onMonstersUpdate(
            this.monsters.map((m) => ({
                ...m,
                screenPosition: this.getScreenPosition(m.position),
            })),
        )
    }

    private updateProjectiles(dt: number) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i]
            p.life -= dt
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt))

            let hit = false
            let hitTarget: Monster | null = null

            for (const m of this.monsters) {
                if (m.position.distanceTo(p.mesh.position) < this.m2u(0.5)) {
                    hit = true
                    hitTarget = m
                    break
                }
            }

            if (hit && hitTarget) {
                // 检查是否为AOE技能
                if (p.aoeRadius > 0) {
                    // AOE逻辑
                    const range = this.m2u(p.aoeRadius)
                    this.monsters.forEach((m) => {
                        if (!m.isDead && m.position.distanceTo(p.mesh.position) <= range) {
                            // "射击" 触发投射物伤害逻辑
                            this.applySkillDamage(m, p.skillName)
                        }
                    })
                } else {
                    // 单体目标逻辑
                    this.applySkillDamage(hitTarget, p.skillName)
                }

                // 命中后移除投射物
                this.scene.remove(p.mesh)
                this.projectiles.splice(i, 1)
            } else if (p.life <= 0) {
                // 过期投射物移除
                this.scene.remove(p.mesh)
                this.projectiles.splice(i, 1)
            }
        }
    }

    private updatePlayer(dt: number) {
        const moveSpeed = this.m2u(5) // 5米/秒

        // 1. 处理水平移动输入
        if (this.dashTimer > 0) {
            this.dashTimer -= dt
            // 冲刺期间，X/Z速度由applyDash设定，不接受WASD输入
            // 但重力仍需在下方应用
        } else {
            const inputVector = new THREE.Vector3(0, 0, 0)

            if (this.keys["KeyW"]) inputVector.z -= 1
            if (this.keys["KeyS"]) inputVector.z += 1
            if (this.keys["KeyA"]) inputVector.x -= 1
            if (this.keys["KeyD"]) inputVector.x += 1

            if (inputVector.length() > 0) {
                inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)
                inputVector.normalize()
                this.playerVelocity.x = inputVector.x * moveSpeed
                this.playerVelocity.z = inputVector.z * moveSpeed
            } else {
                this.playerVelocity.x *= 0.8
                this.playerVelocity.z *= 0.8
            }
        }

        // 2. 面向处理（始终朝向鼠标）
        let lookTarget = new THREE.Vector3(this.mouseWorld.x, this.playerMesh.position.y, this.mouseWorld.z)

        // 飞行修正：使用玩家当前高度的平面进行射线检测，消除高度差带来的视差
        if (!this.gravityEnabled && this.playerMesh.position.y > 1) {
            const raycaster = new THREE.Raycaster()
            raycaster.setFromCamera(this.mouse, this.camera)
            // 计算平面：法线(0,1,0)，距离原点 -y (平面方程 y = playerY -> y - playerY = 0 -> normal.dot(p) + constant = 0 -> 1*y - playerY = 0)
            const playerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.playerMesh.position.y)
            const targetOnLevel = new THREE.Vector3()

            if (raycaster.ray.intersectPlane(playerPlane, targetOnLevel)) {
                lookTarget = targetOnLevel
            }
        }

        this.playerMesh.lookAt(lookTarget)

        // 3. 应用重力 (或飞行控制)
        if (this.gravityEnabled) {
            this.playerVelocity.y -= 50 * dt
        } else {
            // 飞行模式：手动升降，松手悬停
            const flySpeed = this.m2u(20)
            let targetVY = 0

            const isUp = this.keys["Space"]
            const isDown = this.keys["ShiftLeft"] || this.keys["ShiftRight"]

            if (isUp) targetVY += flySpeed
            if (isDown) targetVY -= flySpeed

            if (targetVY !== 0) {
                this.playerVelocity.y = THREE.MathUtils.lerp(this.playerVelocity.y, targetVY, 10 * dt)
            } else {
                this.playerVelocity.y = THREE.MathUtils.lerp(this.playerVelocity.y, 0, 20 * dt)
                if (Math.abs(this.playerVelocity.y) < 1.0) {
                    this.playerVelocity.y = 0
                }
            }
        }

        // 4. 更新位置
        this.playerMesh.position.add(this.playerVelocity.clone().multiplyScalar(dt))

        // 5. 地面碰撞检测与修正
        if (this.playerMesh.position.y <= 0) {
            this.playerMesh.position.y = 0
            // 如果正在下落，重置垂直速度为0
            if (this.playerVelocity.y < 0) {
                this.playerVelocity.y = 0
            }
            this.isGrounded = true
        } else {
            this.isGrounded = false
        }

        // 6. 限制玩家移动范围
        this.playerMesh.position.x = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, this.playerMesh.position.x))
        this.playerMesh.position.z = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, this.playerMesh.position.z))

        // 7. 更新摄像机和光照跟随
        const offset = new THREE.Vector3(30, 30, 30)
        this.camera.position.lerp(this.playerMesh.position.clone().add(offset), 0.1)

        // 光照跟随玩家，确保阴影始终可见
        this.dirLight.position.set(this.playerMesh.position.x + 20, 50, this.playerMesh.position.z + 30)
        this.dirLight.target.position.copy(this.playerMesh.position)

        // 8. 武器动画更新
        if (this.isAttacking) {
            this.attackTimer += dt
            if (this.attackTimer >= this.ATTACK_DURATION) {
                this.isAttacking = false
                this.attackTimer = 0
                // 复位
                this.weaponMesh.position.set(4, 6, 2)
                this.weaponMesh.rotation.x = Math.PI / 4
                this.weaponMesh.rotation.z = 0
            } else {
                const progress = this.attackTimer / this.ATTACK_DURATION
                // 简单的刺击动作
                // 向前移动 (Z轴负方向是模型的前方)
                const thrustAmt = Math.sin(progress * Math.PI) * 4 // 刺出距离
                this.weaponMesh.position.set(4, 6, 2 - thrustAmt)
                // 稍微向下旋转模拟刺击角度变化
                this.weaponMesh.rotation.x = Math.PI / 4 - Math.sin(progress * Math.PI) * 0.5
            }
        } else {
            // 闲置呼吸动画
            const breathe = Math.sin(this.clock.getElapsedTime() * 2) * 0.1
            this.weaponMesh.position.y = 6 + breathe
        }

        // 自动射击
        if (this.isFiring) {
            this.fireTimer -= dt
            if (this.fireTimer <= 0) {
                const activeWeapon = this.getMeleeWeapon()
                // 再检查一下它是否仍然处于范围内（例如状态变化）
                if (this.isRangedWeapon(activeWeapon)) {
                    this.performRangedAttack(0)
                    const attrs = this.charBuild.calculateWeaponAttributes(activeWeapon)
                    // 假设基础攻击率大约是每2秒发射1次（0.5间隔），根据攻速进行修改
                    const attackSpeed = Math.max(0.1, attrs.weapon?.攻速 || 1)
                    this.fireTimer = 0.5 / attackSpeed
                } else {
                    this.isFiring = false // 如果武器不知为何切换成了近战武器，请停止射击
                }
            }
        } else {
            // 即使未发射，冷却计时器仍在运行
            if (this.fireTimer > 0) this.fireTimer -= dt
        }

        // 更新技能
        this.skillE.update(dt)
        this.skillQ.update(dt)

        // 更新增益
        const buffNames: string[] = []
        for (const [name, time] of this.activeBuffs.entries()) {
            const newTime = time - dt
            if (newTime <= 0) {
                this.removeBuff(name)
                this.charBuild.removeBuffs([name])
            } else {
                this.activeBuffs.set(name, newTime)
                buffNames.push(name)
            }
        }
        this.playerStats.activeBuffs = buffNames

        // 神智恢复
        this.sanityRegenTimer += dt
        if (this.sanityRegenTimer >= this.settings.sanityRegenInterval) {
            this.sanityRegenTimer = 0
            if (this.playerStats.currentSanity < this.playerStats.maxSanity) {
                this.playerStats.currentSanity = Math.min(
                    this.playerStats.maxSanity,
                    this.playerStats.currentSanity + this.settings.sanityRegenAmount,
                )
            }
        }

        this.onStatsUpdate({ ...this.playerStats })
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate)

        const dt = this.clock.getDelta()

        this.updatePlayer(dt)
        this.updateMonsters(dt)
        this.updateProjectiles(dt)

        // 更新浮动文本
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i]
            t.life -= dt
            t.position.y += 3 * dt
            if (t.life <= 0) {
                this.floatingTexts.splice(i, 1)
            }
        }

        this.onTextUpdate(
            this.floatingTexts.map((t) => ({
                ...t,
                screenPosition: this.getScreenPosition(t.position),
            })),
        )

        // DPS
        const duration = (Date.now() - this.startTime) / 1000
        const dps = duration > 0 ? this.totalDamage / duration : 0
        this.onDpsUpdate(Math.floor(dps), Math.floor(this.totalDamage))

        this.renderer.render(this.scene, this.camera)
    }
    public resize() {
        const aspect = this.container.clientWidth / this.container.clientHeight
        const d = 40
        this.camera.left = -d * aspect
        this.camera.right = d * aspect
        this.camera.top = d
        this.camera.bottom = -d
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    }
}
