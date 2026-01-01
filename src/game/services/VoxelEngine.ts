/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three"
import { VoxelData, PlayerStats, Monster, Faction, GameSettings, FloatingText } from "../types"
import { Generators } from "../utils/voxelGenerators"
import { BaseSkill } from "./BaseSkill"
import { CharBuild, LeveledMonster } from "../../data"
import { SkillRegistry } from "./SkillRegistry"
import { DynamicMonster } from "../../data/leveled/LeveledMonster"

export class VoxelEngine {
    private container: HTMLElement
    private scene: THREE.Scene
    private camera: THREE.OrthographicCamera
    private renderer: THREE.WebGLRenderer
    private clock: THREE.Clock
    private animationId: number | null = null

    // -- PUBLIC STATE (For Skills) --
    public playerStats: PlayerStats
    public monsters: Monster[] = []
    public activeBuffs: Map<string, number> = new Map()

    // -- CONSTANTS --
    // 1 Meter = 10 Engine Units.
    // Assuming Character is approx 12 units high (~1.2m girl), so 10 units = 1 meter is reasonable scale.
    private readonly METER_SCALE = 10.0

    // -- INTERNAL STATE --
    private projectiles: any[] = []
    private floatingTexts: FloatingText[] = []
    private playerMesh: THREE.Group
    private playerVelocity: THREE.Vector3 = new THREE.Vector3()
    private isGrounded = true

    // Skills
    private skillE: BaseSkill
    private skillQ: BaseSkill

    private sanityRegenTimer = 0
    private chargeAttackTime = 0

    // Input
    private keys: Record<string, boolean> = {}
    private mouse = new THREE.Vector2()
    private mouseWorld = new THREE.Vector3()

    // Callbacks
    private onStatsUpdate: (stats: PlayerStats) => void
    private onMonstersUpdate: (monsters: Monster[]) => void
    private onTextUpdate: (texts: FloatingText[]) => void
    private onDpsUpdate: (dps: number, total: number) => void

    private totalDamage = 0
    private startTime = 0

    public settings: GameSettings = {
        monsterCount: 5,
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

        // Stats
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

        // Environment
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambientLight)
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
        dirLight.position.set(20, 50, 30)
        dirLight.castShadow = true
        dirLight.shadow.mapSize.set(2048, 2048)
        dirLight.shadow.camera.left = -50
        dirLight.shadow.camera.right = 50
        dirLight.shadow.camera.top = 50
        dirLight.shadow.camera.bottom = -50
        this.scene.add(dirLight)

        const planeGeo = new THREE.PlaneGeometry(200, 200)
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x333344 })
        const ground = new THREE.Mesh(planeGeo, planeMat)
        ground.rotation.x = -Math.PI / 2
        ground.receiveShadow = true
        this.scene.add(ground)
        this.scene.add(new THREE.GridHelper(200, 20, 0x444455, 0x444455))

        // Player
        this.playerMesh = this.createVoxelMesh(Generators.Lise())
        this.playerMesh.position.y = 0
        this.scene.add(this.playerMesh)

        // 初始化技能
        const skills = charBuild.char.技能
        if (skills.length < 2) {
            throw new Error("角色必须有至少2个技能")
        }
        this.skillE = new (SkillRegistry.get(skills[0].id))(this, skills[0].getFieldsWithAttr(attrs))
        this.skillQ = new (SkillRegistry.get(skills[1].id))(this, skills[1].getFieldsWithAttr(attrs))

        // Events
        window.addEventListener("keydown", this.onKeyDown)
        window.addEventListener("keyup", this.onKeyUp)
        window.addEventListener("mousedown", this.onMouseDown)
        window.addEventListener("mouseup", this.onMouseUp)
        window.addEventListener("mousemove", this.onMouseMove)
        // window.addEventListener("contextmenu", (e) => e.preventDefault())

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

    // --- UNIT CONVERSION ---
    public m2u(meters: number): number {
        return meters * this.METER_SCALE
    }

    public u2m(units: number): number {
        return units / this.METER_SCALE
    }

    // --- INTERFACE FOR SKILLS ---
    public getPlayerPosition(): THREE.Vector3 {
        return this.playerMesh.position
    }

    public getPlayerRotation(): number {
        return this.playerMesh.rotation.y
    }

    public addPlayerVelocity(v: THREE.Vector3) {
        this.playerVelocity.add(v)
    }

    public addElectricEnergy(amount: number) {
        this.playerStats.electricEnergy = Math.min(this.playerStats.electricEnergy + amount, 100)
    }

    public addBuff(name: string, duration: number) {
        this.activeBuffs.set(name, duration)
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

        // Construct a compatible DynamicMonster object for CharBuild
        const adapter = {
            id: parseInt(target.id) || 1001001,
            名称: target.name,
            阵营: target.faction as Faction | undefined,
            攻击: target.attack,
            防御: target.defense,
            生命: target.maxHP,
            护盾: target.maxShield,
            战姿: 0,
            currentHP: target.currentHP,
            currentShield: target.currentShield,
            currentWarPose: 0,
            等级: target.level,
        } as DynamicMonster // Cast to any to bypass strict type checking against LeveledMonster class methods

        // Use CharBuild to calculate damage
        // Note: calculateRandomDamage modifies the adapter's HP/Shield.
        const dmg = this.charBuild.calculateRandomDamage(skillName, adapter)

        // Update real target stats based on adapter changes
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
        }
    }

    // --- INTERNAL HELPER ---
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

    // --- 输入处理 ---
    private onKeyDown = (e: KeyboardEvent) => {
        this.keys[e.code] = true

        if (e.code === "Space" && this.isGrounded) {
            this.playerVelocity.y = this.m2u(4) // Jump approx 4 meters high logic? No, jump logic is usually impulse driven. Keep raw for jump or tune.
            this.isGrounded = false
        }
        if (e.code === "KeyE") this.skillE.tryCast()
        if (e.code === "KeyQ") this.skillQ.tryCast()
    }

    private onKeyUp = (e: KeyboardEvent) => (this.keys[e.code] = false)

    private onMouseDown = (e: MouseEvent) => {
        if (e.button === 0) {
            this.performMeleeAttack()
        } else if (e.button === 2) {
            this.chargeAttackTime = Date.now()
        }
    }

    private onMouseUp = (e: MouseEvent) => {
        if (e.button === 2) {
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
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerMesh.rotation.y)
        const rangeUnits = this.m2u(2.5) // 2.5米范围
        const hitCenter = this.playerMesh.position.clone().add(forward.multiplyScalar(rangeUnits / 2))

        this.monsters.forEach((m) => {
            if (m.position.distanceTo(hitCenter) < rangeUnits) {
                this.applySkillDamage(m, "普通攻击")
                this.addElectricEnergy(2)
            }
        })
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
            velocity: targetDir.multiplyScalar(this.m2u(15)), // Speed: 15m/s
            life: 2.0,
            charge: chargeTime,
        })
    }

    // --- GAME LOOP ---

    private spawnMonster() {
        const angle = Math.random() * Math.PI * 2
        const radiusUnits = this.settings.spawnType === "ring" ? this.m2u(10) : this.m2u(5 + Math.random() * 10)
        const x = Math.sin(angle) * radiusUnits
        const z = Math.cos(angle) * radiusUnits

        const monsterMesh = this.createVoxelMesh(Generators.RobotGuard(this.settings.monsterLevel))
        monsterMesh.position.set(x, 20, z)
        this.scene.add(monsterMesh)

        const level = this.settings.monsterLevel

        // Use LeveledMonster to calculate stats for the new monster based on level
        const dummyMonster = new LeveledMonster(1001001, level) // 1001001 is "生命木桩" ID, used as base

        this.monsters.push({
            id: Math.random().toString(),
            name: "Mech Guard Lv." + level,
            level: level,
            position: monsterMesh.position,
            mesh: monsterMesh,
            maxHP: dummyMonster.生命,
            currentHP: dummyMonster.生命,
            maxShield: dummyMonster.护盾 || 0,
            currentShield: dummyMonster.护盾 || 0,
            attack: dummyMonster.攻击,
            defense: dummyMonster.防御,
            faction: Faction.MONSTER,
            speed: this.m2u(3 + Math.random() * 1), // 单位速度
            isDead: false,
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

        const stopDistanceUnits = this.m2u(2) // Stop at 2m

        this.monsters.forEach((m) => {
            if (m.isDead) return

            if (m.position.y > 0) {
                m.position.y -= 20 * dt // Gravity
                if (m.position.y < 0) m.position.y = 0
            }

            m.mesh.lookAt(this.playerMesh.position.x, m.position.y, this.playerMesh.position.z)
            const dist = m.position.distanceTo(this.playerMesh.position)

            if (dist > stopDistanceUnits) {
                const dir = this.playerMesh.position.clone().sub(m.position).normalize()
                dir.y = 0
                m.position.add(dir.multiplyScalar(m.speed * dt))
            } else {
                if (Math.random() < 0.05) {
                    m.position.x += (Math.random() - 0.5) * 0.2
                    m.position.z += (Math.random() - 0.5) * 0.2
                }
            }

            if (dist < stopDistanceUnits + this.m2u(0.5)) {
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
            for (const m of this.monsters) {
                if (m.position.distanceTo(p.mesh.position) < this.m2u(0.5)) {
                    // 投射物通常使用"射击"技能名称
                    this.applySkillDamage(m, "射击")

                    hit = true
                    break
                }
            }

            if (hit || p.life <= 0) {
                this.scene.remove(p.mesh)
                this.projectiles.splice(i, 1)
            }
        }
    }

    private updatePlayer(dt: number) {
        const moveSpeed = this.m2u(5) // 5 m/s
        const inputVector = new THREE.Vector3(0, 0, 0)

        if (this.keys["KeyW"]) inputVector.z -= 1
        if (this.keys["KeyS"]) inputVector.z += 1
        if (this.keys["KeyA"]) inputVector.x -= 1
        if (this.keys["KeyD"]) inputVector.x += 1

        inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)

        const lookTarget = new THREE.Vector3(this.mouseWorld.x, this.playerMesh.position.y, this.mouseWorld.z)
        this.playerMesh.lookAt(lookTarget)

        if (inputVector.length() > 0) {
            inputVector.normalize()
            this.playerVelocity.x = inputVector.x * moveSpeed
            this.playerVelocity.z = inputVector.z * moveSpeed
        } else {
            this.playerVelocity.x *= 0.8
            this.playerVelocity.z *= 0.8
        }

        if (!this.isGrounded) {
            this.playerVelocity.y -= 50 * dt
        }

        this.playerMesh.position.add(this.playerVelocity.clone().multiplyScalar(dt))

        if (this.playerMesh.position.y < 0) {
            this.playerMesh.position.y = 0
            this.playerVelocity.y = 0
            this.isGrounded = true
        }

        const offset = new THREE.Vector3(30, 30, 30)
        this.camera.position.lerp(this.playerMesh.position.clone().add(offset), 0.1)

        // 更新技能
        this.skillE.update(dt)
        this.skillQ.update(dt)

        // 更新增益
        const buffNames: string[] = []
        for (const [name, time] of this.activeBuffs.entries()) {
            const newTime = time - dt
            if (newTime <= 0) {
                this.activeBuffs.delete(name)
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

    private updateFloatingText(dt: number) {
        this.floatingTexts.forEach((t) => {
            t.position.y += dt * 2
            t.life -= dt
            t.opacity = Math.max(0, t.life)
        })
        this.floatingTexts = this.floatingTexts.filter((t) => t.life > 0)

        this.onTextUpdate(
            this.floatingTexts.map((t) => ({
                ...t,
                screenPosition: this.getScreenPosition(t.position),
            })),
        )
    }

    private animate() {
        this.animationId = requestAnimationFrame(this.animate.bind(this))

        const dt = Math.min(this.clock.getDelta(), 0.1)
        const totalTime = (Date.now() - this.startTime) / 1000

        this.updatePlayer(dt)
        this.updateMonsters(dt)
        this.updateProjectiles(dt)
        this.updateFloatingText(dt)

        this.onDpsUpdate(Math.floor(this.totalDamage / Math.max(1, totalTime)), Math.floor(this.totalDamage))

        this.renderer.render(this.scene, this.camera)
    }

    public resize() {
        const aspect = window.innerWidth / window.innerHeight
        const d = 40
        this.camera.left = -d * aspect
        this.camera.right = d * aspect
        this.camera.top = d
        this.camera.bottom = -d
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }
}
