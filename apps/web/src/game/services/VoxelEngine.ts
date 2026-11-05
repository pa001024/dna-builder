import { createRng, type Rng } from "dna-builder-skill-sim/core"
import * as THREE from "three"
import { type CharBuild, LeveledMonsterHelper } from "@/data/index"
import { EventView } from "../sim/event-view"
import { buffName, type CompiledManifest } from "../sim/manifest-loader"
import { loadSkillManifest } from "../sim/manifest-source"
import { SimDriver } from "../sim/sim-driver"
import type { FloatingText, GameSettings, Monster, PlayerStats, VoxelData } from "../types"
import { Generators } from "../utils/voxelGenerators"

/** 永久增益在 HUD 圆环上的显示时长 */
const PERMANENT_BUFF_SECONDS = 9999

/**
 * Three.js 视图层：场景 / 输入 / 相机 / 怪物模型 / 飘字 / HUD 数据。
 *
 * 战斗逻辑全部在 `SimDriver`（core `Simulation` + `SkillRuntime`）：本类只把按键与命中判定
 * 翻译成命令，再把 `SimEvent[]` 与 `FrameSample` 映射成视觉与 HUD 状态。
 */
export class VoxelEngine {
    private container: HTMLElement
    private scene: THREE.Scene
    private camera: THREE.OrthographicCamera
    private renderer: THREE.WebGLRenderer
    private clock: THREE.Clock
    private animationId: number | null = null

    // -- 公共状态（供 HUD 使用） --
    public playerStats: PlayerStats
    public monsters: Monster[] = []
    public gravityEnabled: boolean = true // Control gravity for flight

    // -- 常量 --
    // 1米 = 10引擎单位。
    private readonly METER_SCALE = 10.0
    private readonly MAP_SIZE = 400
    private readonly MAP_HALF_SIZE = 200

    // -- 内部状态 --
    private projectiles: any[] = []
    private floatingTexts: FloatingText[] = []
    private playerMesh: THREE.Group
    private weaponMesh: THREE.Group
    private playerVelocity: THREE.Vector3 = new THREE.Vector3()
    private isGrounded = true
    private dashTimer = 0
    private dirLight: THREE.DirectionalLight

    // 攻击动画状态
    private isAttacking = false
    private attackTimer = 0
    private readonly ATTACK_DURATION = 0.3

    // 射击状态 (自动连射)
    private isFiring = false
    private fireTimer = 0

    // 模拟
    private readonly manifest: CompiledManifest
    private readonly driver: SimDriver
    private readonly view: EventView
    private readonly rng: Rng
    private readonly monsterById = new Map<string, Monster>()
    private castPulse = 0
    private chargeAttackTime = 0
    private castRing: THREE.Mesh
    private markerMeshes = new Map<string, THREE.Mesh>()
    private markerGeometry: THREE.RingGeometry
    private markerMaterial: THREE.MeshBasicMaterial
    private nextMonsterSeq = 1
    private nextTextSeq = 1

    // 输入
    private keys: Record<string, boolean> = {}
    private mouse = new THREE.Vector2()
    private mouseWorld = new THREE.Vector3()

    // 回调函数
    private onStatsUpdate: (stats: PlayerStats) => void
    private onMonstersUpdate: (monsters: Monster[]) => void
    private onTextUpdate: (texts: FloatingText[]) => void
    private onDpsUpdate: (dps: number, total: number) => void

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
        onDpsUpdate: (dps: number, total: number) => void
    ) {
        this.container = container
        this.onStatsUpdate = onStatsUpdate
        this.onMonstersUpdate = onMonstersUpdate
        this.onTextUpdate = onTextUpdate
        this.onDpsUpdate = onDpsUpdate
        this.clock = new THREE.Clock()

        const attrs = this.charBuild.attrs

        // 状态（战斗数值随后由帧采样覆盖）
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

        this.manifest = loadSkillManifest()
        this.view = new EventView({
            buffName: buffId => buffName(this.manifest, buffId),
            damageColor: () => this.getElementClass(this.charBuild.char.属性),
        })
        this.driver = new SimDriver({
            manifest: this.manifest,
            characterId: this.charBuild.char.id,
            charBuild: this.charBuild,
            seed: 1337,
            regen: () => ({ amount: this.settings.sanityRegenAmount, interval: this.settings.sanityRegenInterval }),
        })
        this.rng = createRng(20261105)

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
        this.scene.add(this.dirLight.target)

        const planeGeo = new THREE.PlaneGeometry(this.MAP_SIZE, this.MAP_SIZE)
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x333344 })
        const ground = new THREE.Mesh(planeGeo, planeMat)
        ground.rotation.x = -Math.PI / 2
        ground.receiveShadow = true
        this.scene.add(ground)
        this.scene.add(new THREE.GridHelper(this.MAP_SIZE, 40, 0x444455, 0x444455))

        // 玩家
        this.playerMesh = this.createVoxelMesh(this.getCharModel())
        this.playerMesh.position.y = 0
        this.scene.add(this.playerMesh)

        // 武器
        this.weaponMesh = this.createVoxelMesh(this.getWeaponModel())
        this.playerMesh.add(this.weaponMesh)
        this.weaponMesh.position.set(4, 6, 2)
        this.weaponMesh.rotation.x = Math.PI / 4

        // 施法 / 选敌通用标记
        this.castRing = new THREE.Mesh(
            new THREE.RingGeometry(this.m2u(0.6), this.m2u(1.0), 32),
            new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
        )
        this.castRing.rotation.x = -Math.PI / 2
        this.castRing.visible = false
        this.scene.add(this.castRing)
        this.markerGeometry = new THREE.RingGeometry(this.m2u(0.7), this.m2u(1.0), 24)
        this.markerMaterial = new THREE.MeshBasicMaterial({
            color: 0xfacc15,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        })

        // 事件
        window.addEventListener("keydown", this.onKeyDown)
        window.addEventListener("keyup", this.onKeyUp)
        window.addEventListener("mousedown", this.onMouseDown)
        window.addEventListener("mouseup", this.onMouseUp)
        window.addEventListener("mousemove", this.onMouseMove)
        container.addEventListener("contextmenu", e => e.preventDefault())

        this.animate()
    }

    public setSettings(settings: GameSettings) {
        this.settings = settings
    }

    public cleanup() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
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

    // --- 位置 / 输入接口 ---
    public getPlayerPosition(): THREE.Vector3 {
        return this.playerMesh.position
    }

    public getForwardVector(): THREE.Vector3 {
        const dir = new THREE.Vector3()
        this.playerMesh.getWorldDirection(dir)
        dir.y = 0
        if (dir.lengthSq() > 0.001) {
            dir.normalize()
        } else {
            dir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerMesh.rotation.y)
        }
        return dir
    }

    public addPlayerVelocity(v: THREE.Vector3) {
        this.playerVelocity.add(v)
    }

    public applyDash(velocity: THREE.Vector3, duration: number) {
        this.playerVelocity.x = velocity.x
        this.playerVelocity.z = velocity.z
        this.playerVelocity.y = 0
        this.dashTimer = duration
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

    public spawnFloatingText(text: string, pos: THREE.Vector3, color: string) {
        this.floatingTexts.push({
            id: `${this.nextTextSeq++}`,
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
            return `${(num / 1000000).toFixed(1)}M`
        }
        if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K`
        }
        return num.toString()
    }

    getElementClass(element: string): string {
        const classMap: Record<string, string> = {
            光: "#f59e0b",
            暗: "#6b7280",
            水: "#3b82f6",
            火: "#ef4444",
            雷: "#8b5cf6",
            风: "#10b981",
        }
        return classMap[element] || "#ffffff"
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
        data.forEach(v => {
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
            this.playerVelocity.y = this.m2u(4)
            this.isGrounded = false
        }
        if (e.code === "KeyE") this.castSlot("E")
        if (e.code === "KeyQ") this.castSlot("Q")
    }

    private onKeyUp = (e: KeyboardEvent) => (this.keys[e.code] = false)

    private onMouseDown = (e: MouseEvent) => {
        if (e.button === 0) {
            const activeWeapon = this.charBuild.meleeWeapon
            if (this.isRangedWeapon(activeWeapon)) {
                this.isFiring = true
                if (this.fireTimer <= 0) {
                    this.performRangedAttack(0)
                    const attrs = this.charBuild.calculateWeaponAttributes(activeWeapon)
                    const attackSpeed = Math.max(0.1, attrs.weapon?.攻速 || 1)
                    this.fireTimer = 0.5 / attackSpeed
                }
            } else {
                this.performMeleeAttack()
            }
        } else if (e.button === 2) {
            this.chargeAttackTime = this.driver.now
        }
    }

    private onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) {
            this.isFiring = false
        } else if (e.button === 2) {
            const charge = Math.min(this.driver.now - this.chargeAttackTime, 1.5)
            this.performRangedAttack(Math.max(0, charge))
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

    // --- 技能 ---

    private castSlot(slot: "E" | "Q") {
        const outcome = this.driver.castSlot(slot)
        if (!outcome.ok) {
            this.spawnFloatingText(outcome.message ?? "无法施放", this.playerMesh.position.clone(), "#ff6666")
            return
        }
        this.castPulse = 0.3
        this.castRing.position.copy(this.playerMesh.position)
        this.castRing.position.y = 0.1
        this.castRing.visible = true
        this.castRing.scale.setScalar(1)
        ;(this.castRing.material as THREE.MeshBasicMaterial).opacity = 0.8
    }

    // --- ACTIONS ---

    private performMeleeAttack() {
        if (this.isAttacking) return

        this.isAttacking = true
        this.attackTimer = 0

        const forward = this.getForwardVector()
        const rangeUnits = this.m2u(2.5)
        const hitCenter = this.playerMesh.position.clone().add(forward.multiplyScalar(rangeUnits / 2))

        const hitIds: string[] = []
        this.monsters.forEach(m => {
            if (m.isDead) return
            if (m.position.distanceTo(hitCenter) < rangeUnits) hitIds.push(m.id)
        })
        if (hitIds.length > 0) this.driver.dealDamage("普通攻击", hitIds)
    }

    private performRangedAttack(chargeTime: number) {
        const startPos = this.playerMesh.position.clone().add(new THREE.Vector3(0, 2, 0))
        const targetDir = this.mouseWorld.clone().sub(startPos).normalize()

        const mesh = this.createVoxelMesh(Generators.Projectile())
        mesh.position.copy(startPos)
        mesh.lookAt(startPos.clone().add(targetDir))
        mesh.scale.set(0.5, 0.5, 0.5)

        this.scene.add(mesh)

        this.projectiles.push({
            mesh,
            velocity: targetDir.multiplyScalar(this.m2u(15)),
            life: 2.0,
            charge: chargeTime,
            skillName: "射击",
        })
    }

    // --- 游戏循环 ---

    private nextSimTime(offset = 0): number {
        return this.driver.now + offset
    }

    private spawnMonster() {
        const angle = this.rng.next() * Math.PI * 2
        const radiusUnits = this.settings.spawnType === "ring" ? this.m2u(10) : this.m2u(5 + this.rng.next() * 10)
        const x = Math.sin(angle) * radiusUnits
        const z = Math.cos(angle) * radiusUnits

        const monsterMesh = this.createVoxelMesh(Generators.RobotGuard(this.settings.monsterLevel))
        monsterMesh.position.set(x, 20, z)
        this.scene.add(monsterMesh)

        const level = this.settings.monsterLevel
        const newMonster = LeveledMonsterHelper.fromId(this.settings.monsterId, level)
        const id = `m${this.nextMonsterSeq++}`

        const monster: Monster = {
            id,
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
            speed: this.m2u(3 + this.rng.next() * 1),
            isDead: false,
            aiState: "CHASE",
            aiActionTimer: 0,
            attackTimer: 0,
            statusEffects: [],
        }
        const accepted = this.driver.spawnEnemy({
            id,
            level,
            hp: newMonster.hp,
            shield: newMonster.es || 0,
            def: newMonster.def,
            position: { x: this.u2m(x), y: this.u2m(z) },
            meta: { monsterId: this.settings.monsterId, faction: newMonster.f },
        })
        if (!accepted) {
            this.scene.remove(monsterMesh)
            return
        }
        this.monsters.push(monster)
        this.monsterById.set(id, monster)
    }

    private removeMonster(id: string) {
        const monster = this.monsterById.get(id)
        if (!monster) return
        this.scene.remove(monster.mesh)
        this.monsterById.delete(id)
        this.monsters = this.monsters.filter(item => item.id !== id)
    }

    private updateMonsters(dt: number) {
        const now = this.nextSimTime()
        if (this.monsters.length < this.settings.monsterCount && now - this.lastSpawnTime > this.settings.spawnInterval) {
            this.spawnMonster()
            this.lastSpawnTime = now
        }

        if (this.settings.autoLevelUp && now - this.lastLevelUpTime > this.settings.autoLevelInterval && this.settings.monsterLevel < 180) {
            this.settings.monsterLevel += 5
            this.lastLevelUpTime = now
            this.spawnFloatingText("Monster Level Up!", this.playerMesh.position.clone().add(new THREE.Vector3(0, 5, 0)), "#FF0000")
        }

        const chaseDistanceThreshold = this.m2u(5)
        const stopDistanceThreshold = this.m2u(2.5)

        this.monsters.forEach(m => {
            if (m.isDead) return

            if (m.position.y > 0) {
                m.position.y -= 20 * dt
                if (m.position.y < 0) m.position.y = 0
            }

            m.aiActionTimer = (m.aiActionTimer || 0) - dt
            const dist = m.position.distanceTo(this.playerMesh.position)

            if (dist > chaseDistanceThreshold) {
                m.aiState = "CHASE"
            } else if (m.aiState === "CHASE" && dist <= stopDistanceThreshold) {
                m.aiState = "IDLE"
                m.aiActionTimer = 0
            }

            if (m.aiState !== "CHASE" && (m.aiActionTimer || 0) <= 0) {
                const rand = this.rng.next()
                if (rand < 0.6) {
                    m.aiState = "IDLE"
                    m.aiActionTimer = 1.0 + this.rng.next() * 2.0
                } else {
                    m.aiState = "WANDER"
                    m.aiActionTimer = 1.0 + this.rng.next() * 1.5
                    const angle = this.rng.next() * Math.PI * 2
                    m.wanderDirection = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize()
                }
            }

            if (m.aiState === "CHASE") {
                const dir = this.playerMesh.position.clone().sub(m.position).normalize()
                dir.y = 0
                m.position.add(dir.multiplyScalar(m.speed * dt))
                m.mesh.lookAt(this.playerMesh.position.x, m.position.y, this.playerMesh.position.z)
            } else if (m.aiState === "WANDER") {
                if (m.wanderDirection) {
                    const moveSpeed = m.speed * 0.5
                    m.position.add(m.wanderDirection.clone().multiplyScalar(moveSpeed * dt))
                    const lookTarget = m.position.clone().add(m.wanderDirection)
                    m.mesh.lookAt(lookTarget.x, m.position.y, lookTarget.z)
                }
            } else {
                m.mesh.lookAt(this.playerMesh.position.x, m.position.y, this.playerMesh.position.z)
            }

            m.position.x = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, m.position.x))
            m.position.z = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, m.position.z))

            // 近身攻击：固定 1 秒节奏（旧版是每帧 1% 概率），伤害走模拟
            m.attackTimer = Math.max(0, (m.attackTimer ?? 0) - dt)
            if (dist < this.m2u(2.5) && m.aiState !== "WANDER" && (m.attackTimer ?? 0) <= 0) {
                m.attackTimer = 1
                this.driver.damagePlayer(Math.max(0, m.attack - this.playerStats.defense))
            }
        })
    }

    /** 在帧采样 / 事件映射之后推送，保证 HP、护盾与状态效果同帧可见 */
    private emitMonsters() {
        this.onMonstersUpdate(
            this.monsters.map(m => ({
                ...m,
                screenPosition: this.getScreenPosition(m.position),
            }))
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
                if (m.isDead) continue
                if (m.position.distanceTo(p.mesh.position) < this.m2u(0.5)) {
                    hit = true
                    hitTarget = m
                    break
                }
            }

            if (hit && hitTarget) {
                this.driver.dealDamage(p.skillName, [hitTarget.id])
                this.scene.remove(p.mesh)
                this.projectiles.splice(i, 1)
            } else if (p.life <= 0) {
                this.scene.remove(p.mesh)
                this.projectiles.splice(i, 1)
            }
        }
    }

    private updatePlayer(dt: number) {
        const moveSpeed = this.m2u(5)

        if (this.dashTimer > 0) {
            this.dashTimer -= dt
        } else {
            const inputVector = new THREE.Vector3(0, 0, 0)

            if (this.keys.KeyW) inputVector.z -= 1
            if (this.keys.KeyS) inputVector.z += 1
            if (this.keys.KeyA) inputVector.x -= 1
            if (this.keys.KeyD) inputVector.x += 1

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

        let lookTarget = new THREE.Vector3(this.mouseWorld.x, this.playerMesh.position.y, this.mouseWorld.z)

        if (!this.gravityEnabled && this.playerMesh.position.y > 1) {
            const raycaster = new THREE.Raycaster()
            raycaster.setFromCamera(this.mouse, this.camera)
            const playerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.playerMesh.position.y)
            const targetOnLevel = new THREE.Vector3()

            if (raycaster.ray.intersectPlane(playerPlane, targetOnLevel)) {
                lookTarget = targetOnLevel
            }
        }

        this.playerMesh.lookAt(lookTarget)

        if (this.gravityEnabled) {
            this.playerVelocity.y -= 50 * dt
        } else {
            const flySpeed = this.m2u(20)
            let targetVY = 0

            const isUp = this.keys.Space
            const isDown = this.keys.ShiftLeft || this.keys.ShiftRight

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

        this.playerMesh.position.add(this.playerVelocity.clone().multiplyScalar(dt))

        if (this.playerMesh.position.y <= 0) {
            this.playerMesh.position.y = 0
            if (this.playerVelocity.y < 0) {
                this.playerVelocity.y = 0
            }
            this.isGrounded = true
        } else {
            this.isGrounded = false
        }

        this.playerMesh.position.x = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, this.playerMesh.position.x))
        this.playerMesh.position.z = Math.max(-this.MAP_HALF_SIZE, Math.min(this.MAP_HALF_SIZE, this.playerMesh.position.z))

        const offset = new THREE.Vector3(30, 30, 30)
        this.camera.position.lerp(this.playerMesh.position.clone().add(offset), 0.1)

        this.dirLight.position.set(this.playerMesh.position.x + 20, 50, this.playerMesh.position.z + 30)
        this.dirLight.target.position.copy(this.playerMesh.position)

        if (this.isAttacking) {
            this.attackTimer += dt
            if (this.attackTimer >= this.ATTACK_DURATION) {
                this.isAttacking = false
                this.attackTimer = 0
                this.weaponMesh.position.set(4, 6, 2)
                this.weaponMesh.rotation.x = Math.PI / 4
                this.weaponMesh.rotation.z = 0
            } else {
                const progress = this.attackTimer / this.ATTACK_DURATION
                const thrustAmt = Math.sin(progress * Math.PI) * 4
                this.weaponMesh.position.set(4, 6, 2 - thrustAmt)
                this.weaponMesh.rotation.x = Math.PI / 4 - Math.sin(progress * Math.PI) * 0.5
            }
        } else {
            const breathe = Math.sin(this.clock.getElapsedTime() * 2) * 0.1
            this.weaponMesh.position.y = 6 + breathe
        }

        if (this.isFiring) {
            this.fireTimer -= dt
            if (this.fireTimer <= 0) {
                const activeWeapon = this.charBuild.meleeWeapon
                if (this.isRangedWeapon(activeWeapon)) {
                    this.performRangedAttack(0)
                    const attrs = this.charBuild.calculateWeaponAttributes(activeWeapon)
                    const attackSpeed = Math.max(0.1, attrs.weapon?.攻速 || 1)
                    this.fireTimer = 0.5 / attackSpeed
                } else {
                    this.isFiring = false
                }
            }
        } else if (this.fireTimer > 0) {
            this.fireTimer -= dt
        }
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate)

        const dt = Math.min(this.clock.getDelta(), 0.25)

        this.updatePlayer(dt)

        // 会话到点先重建，再处理刷怪 / 走位，避免怪物只存在于视图而没有模拟实体
        if (this.driver.finished) {
            this.driver.restart(this.monsters.map(m => this.enemyInitFor(m)))
            this.view.reset()
            this.spawnFloatingText("模拟会话已重置", this.playerMesh.position.clone().add(new THREE.Vector3(0, 5, 0)), "#66ccff")
        }

        this.updateMonsters(dt)
        this.updateProjectiles(dt)

        this.driver.syncPositions(
            { x: this.u2m(this.playerMesh.position.x), y: this.u2m(this.playerMesh.position.z) },
            this.monsters.map(m => ({ id: m.id, position: { x: this.u2m(m.position.x), y: this.u2m(m.position.z) } }))
        )
        this.driver.advance(dt)
        this.applySimEvents(this.driver.drainEvents())
        this.applyFrame(this.driver.latestFrame())
        this.updateMarkers()
        this.updateCastRing(dt)
        this.emitMonsters()

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i]
            t.life -= dt
            t.position.y += 3 * dt
            if (t.life <= 0) {
                this.floatingTexts.splice(i, 1)
            }
        }

        this.onTextUpdate(
            this.floatingTexts.map(t => ({
                ...t,
                screenPosition: this.getScreenPosition(t.position),
            }))
        )

        const total = this.view.state.damageTotal
        const duration = Math.max(this.driver.now, 1e-6)
        this.onDpsUpdate(Math.floor(total / duration), Math.floor(total))
        this.onStatsUpdate({ ...this.playerStats })

        this.renderer.render(this.scene, this.camera)
    }

    private enemyInitFor(monster: Monster) {
        return {
            id: monster.id,
            level: monster.level,
            hp: monster.maxHP,
            shield: monster.maxShield,
            def: monster.defense,
            position: { x: this.u2m(monster.position.x), y: this.u2m(monster.position.z) },
            meta: { monsterId: this.settings.monsterId, faction: monster.faction },
        }
    }

    private applySimEvents(events: ReturnType<SimDriver["drainEvents"]>) {
        if (events.length === 0) return
        const floats = this.view.consume(events)
        for (const spec of floats) {
            const position =
                spec.anchor.kind === "actor"
                    ? this.playerMesh.position.clone().add(new THREE.Vector3(0, 3, 0))
                    : this.monsterById
                          .get(spec.anchor.id)
                          ?.position.clone()
                          .add(new THREE.Vector3(0, 3, 0))
            if (!position) continue
            this.floatingTexts.push({
                id: `${this.nextTextSeq++}`,
                position,
                text: spec.text,
                color: spec.color,
                life: 1.0,
                opacity: 1.0,
            })
        }
        for (const id of this.view.takeDeaths()) this.removeMonster(id)
    }

    private applyFrame(frame: ReturnType<SimDriver["latestFrame"]>) {
        if (!frame) return

        const actor = frame.actors.find(sample => sample.actorId === this.driver.actorId)
        if (actor) {
            const hp = actor.resources["生命"]
            const shield = actor.resources["护盾"]
            const sanity = actor.resources["神智"]
            const energy = actor.resources["电能量"]
            this.playerStats.currentHP = hp?.current ?? this.playerStats.currentHP
            this.playerStats.maxHP = hp?.max ?? this.playerStats.maxHP
            this.playerStats.currentShield = shield?.current ?? this.playerStats.currentShield
            this.playerStats.maxShield = shield?.max ?? this.playerStats.maxShield
            this.playerStats.currentSanity = sanity?.current ?? this.playerStats.currentSanity
            this.playerStats.maxSanity = sanity?.max ?? this.playerStats.maxSanity
            this.playerStats.electricEnergy = energy?.current ?? 0
        }

        for (const sample of frame.targets) {
            const monster = this.monsterById.get(sample.targetId)
            if (!monster) continue
            monster.currentHP = sample.hp
            monster.maxHP = sample.maxHp
            monster.currentShield = sample.shield
            monster.maxShield = Math.max(monster.maxShield, sample.shield)
            monster.isDead = !sample.alive
        }

        const now = this.driver.now
        for (const monster of this.monsters) {
            monster.statusEffects = this.view.buffsOf(monster.id).map(buff => ({
                type: buff.buffId,
                label: buff.label,
                color: buff.color,
                duration: Number.isFinite(buff.expiresAt) ? Math.max(0, buff.expiresAt - now) : PERMANENT_BUFF_SECONDS,
                maxDuration: Number.isFinite(buff.duration) ? buff.duration : PERMANENT_BUFF_SECONDS,
            }))
        }
        this.playerStats.activeBuffs = this.view.state.playerBuffs.map(buff => buff.label)
    }

    private updateMarkers() {
        const active = new Set(this.view.activeMarkers(this.driver.now))
        for (const [id, mesh] of this.markerMeshes) {
            if (active.has(id) && this.monsterById.has(id)) continue
            this.scene.remove(mesh)
            this.markerMeshes.delete(id)
        }
        for (const id of active) {
            const monster = this.monsterById.get(id)
            if (!monster) continue
            let mesh = this.markerMeshes.get(id)
            if (!mesh) {
                mesh = new THREE.Mesh(this.markerGeometry, this.markerMaterial)
                mesh.rotation.x = -Math.PI / 2
                this.scene.add(mesh)
                this.markerMeshes.set(id, mesh)
            }
            mesh.position.set(monster.position.x, 0.15, monster.position.z)
        }
    }

    private updateCastRing(dt: number) {
        if (this.castPulse <= 0) {
            this.castRing.visible = false
            return
        }
        this.castPulse -= dt
        const material = this.castRing.material as THREE.MeshBasicMaterial
        material.opacity = Math.max(0, this.castPulse / 0.3) * 0.8
        this.castRing.scale.setScalar(1 + (0.3 - this.castPulse) * 3)
        if (this.castPulse <= 0) this.castRing.visible = false
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
