import { ref, computed, onMounted, onUnmounted } from "vue"
import { useCharSettings } from "./useCharSettings"
import { CharBuild } from "../data/CharBuild"
import { LeveledChar } from "../data/leveled/LeveledChar"
import { LeveledWeapon } from "../data/leveled/LeveledWeapon"
import { LeveledMod } from "../data/leveled/LeveledMod"
import { LeveledBuff } from "../data/leveled/LeveledBuff"
import type { GameState, PlayerState } from "../game/types"
import { Player } from "../game/entities/Player"
import { Enemy } from "../game/entities/Enemy"
import { ProjectileEntity } from "../game/entities/Projectile"
import { DamageNumberEntity } from "../game/entities/DamageNumber"
import { InputSystem } from "../game/systems/InputSystem"
import { CollisionSystem } from "../game/systems/CollisionSystem"
import { SkillSystem } from "../game/systems/SkillSystem"
import { DPSMeter } from "../game/systems/DPSMeter"
import { getSkillBehaviors } from "../game/skills"
import { monsterMap } from "../data"

/**
 * 游戏逻辑 Composable
 */
export function useShooterGame(props: { characterName: string }) {
    const canvasRef = ref<HTMLCanvasElement>()
    const ctx = ref<CanvasRenderingContext2D>()
    const animationFrameId = ref<number>()
    const lastTime = ref<number>(0)
    const cleanupListeners = ref<(() => void) | null>(null)

    // 冷却时间显示(使用ref以便在游戏循环中更新)
    const eCooldownDisplay = ref(0)
    const qCooldownDisplay = ref(0)

    const canvasSize = {
        width: 800,
        height: 600,
    }

    // 加载角色设置
    const charSettings = useCharSettings(computed(() => props.characterName))

    // 创建 CharBuild 实例用于伤害计算
    const charBuild = computed(() => {
        try {
            const char = new LeveledChar(props.characterName, charSettings.value.charLevel)
            const melee = new LeveledWeapon(charSettings.value.meleeWeapon, charSettings.value.meleeWeaponLevel)
            const ranged = new LeveledWeapon(charSettings.value.rangedWeapon, charSettings.value.rangedWeaponLevel)

            // 加载 MOD
            const loadMod = (mod: [number, number] | null) => {
                if (!mod) return undefined
                return new LeveledMod(mod[0], mod[1])
            }

            const auraMod = charSettings.value.auraMod
                ? new LeveledMod(charSettings.value.auraMod, charSettings.value.charLevel)
                : undefined
            const charMods = charSettings.value.charMods.map(loadMod).filter((m): m is LeveledMod => m !== undefined)
            const meleeMods = charSettings.value.meleeMods.map(loadMod).filter((m): m is LeveledMod => m !== undefined)
            const rangedMods = charSettings.value.rangedMods.map(loadMod).filter((m): m is LeveledMod => m !== undefined)

            // 加载 Buff
            const buffs = charSettings.value.buffs.map((b) => new LeveledBuff(b[0], b[1]))

            const build = new CharBuild({
                char: char,
                melee: melee,
                ranged: ranged,
                hpPercent: charSettings.value.hpPercent,
                resonanceGain: charSettings.value.resonanceGain,
                auraMod: auraMod,
                charMods: charMods,
                meleeMods: meleeMods,
                rangedMods: rangedMods,
                skillWeaponMods: [],
                buffs: buffs,
                baseName: "",
                enemyType: charSettings.value.enemyType,
                enemyLevel: charSettings.value.enemyLevel,
                enemyResistance: charSettings.value.enemyResistance,
                enemyHpType: charSettings.value.enemyHpType,
                targetFunction: charSettings.value.targetFunction,
                skillLevel: charSettings.value.charSkillLevel,
            })

            return build
        } catch (error) {
            console.error("创建 CharBuild 失败:", error)
            return null
        }
    })

    // 初始化游戏状态
    const gameState = ref<GameState>({
        player: createPlayerState(props.characterName, charSettings.value.charLevel),
        enemies: [],
        enemy: null,
        projectiles: [],
        damageNumbers: [],
        input: {
            keys: {},
            mousePosition: { x: 400, y: 300 },
            isMouseDown: { left: false, right: false },
        },
        isPaused: false,
        isInitialized: false,
    })

    // 创建玩家实体(用于移动和渲染)
    const playerEntity = new Player()

    // 创建技能行为实例
    const skillBehaviors = computed(() => {
        const charName = props.characterName
        const behaviorsMap = getSkillBehaviors(charName)

        if (!behaviorsMap) {
            return null
        }

        const behaviors = {
            e: new behaviorsMap.E(charBuild.value!),
            q: new behaviorsMap.Q(charBuild.value!),
        }

        return behaviors
    })

    // DPS统计
    const dpsStats = ref(DPSMeter.getStats())

    /**
     * 创建玩家状态
     */
    function createPlayerState(charName: string, level: number): PlayerState {
        const char = new LeveledChar(charName, level)
        const melee = new LeveledWeapon(charSettings.value.meleeWeapon, charSettings.value.meleeWeaponLevel)
        const ranged = new LeveledWeapon(charSettings.value.rangedWeapon, charSettings.value.rangedWeaponLevel)
        const now = Date.now()

        return {
            position: { x: 400, y: 300 },
            rotation: 0,
            speed: 250,
            radius: 20,
            charData: char,
            meleeWeapon: melee,
            rangedWeapon: ranged,
            skills: char.技能,
            cooldowns: {
                e: 0.5, // 默认5秒冷却
                q: 1, // 默认8秒冷却
            },
            lastMeleeAttack: now,
            lastRangedAttack: now,
            lastSkillE: now,
            lastSkillQ: now,
        }
    }

    /**
     * 处理近战攻击
     */
    function handleMeleeAttack() {
        if (!charBuild.value || !gameState.value.enemy) return

        const now = Date.now()
        const player = gameState.value.player
        const attackSpeed = player.meleeWeapon.攻速 || player.meleeWeapon.射速 || 1
        const cooldown = 1000 / attackSpeed

        if (now - player.lastMeleeAttack < cooldown) return

        player.lastMeleeAttack = now

        // 计算伤害 - 使用角色属性
        const baseName = player.meleeWeapon.名称
        const damage = charBuild.value.calculateRandomDamage(baseName)
        const element = player.charData.属性

        // 检测近战范围内的敌人
        const attackRange = 60
        if (CollisionSystem.checkMeleeHit(gameState.value, playerEntity.position, attackRange)) {
            CollisionSystem.applyDamage(gameState.value, damage)

            // 创建伤害数字
            gameState.value.damageNumbers.push(new DamageNumberEntity(gameState.value.enemy!.position, damage, element))
        }
    }

    /**
     * 处理远程攻击
     */
    function handleRangedAttack() {
        if (!charBuild.value) return

        const now = Date.now()
        const player = gameState.value.player
        const attackSpeed = player.rangedWeapon.攻速 || player.rangedWeapon.射速 || 1
        const cooldown = 1000 / attackSpeed

        if (now - player.lastRangedAttack < cooldown) return

        player.lastRangedAttack = now

        // 计算伤害 - 使用角色属性
        const baseName = player.rangedWeapon.名称
        const damage = charBuild.value.calculateRandomDamage(baseName)
        const element = player.charData.属性

        // 计算方向
        const dx = gameState.value.input.mousePosition.x - playerEntity.position.x
        const dy = gameState.value.input.mousePosition.y - playerEntity.position.y
        const length = Math.hypot(dx, dy)
        const direction = { x: dx / length, y: dy / length }

        // 创建投射物
        gameState.value.projectiles.push(
            new ProjectileEntity(
                playerEntity.position,
                direction,
                500, // 投射物速度
                damage,
                element,
            ),
        )
    }

    /**
     * 处理技能 E
     */
    function handleSkillE() {
        if (!charBuild.value) return
        if (!skillBehaviors.value) return
        const behavior = skillBehaviors.value.e
        const success = SkillSystem.castSkill("e", behavior, gameState.value)

        if (success && behavior.type === "dash") {
            // 冲刺技能特殊处理: 移动玩家
            const dx = gameState.value.input.mousePosition.x - playerEntity.position.x
            const dy = gameState.value.input.mousePosition.y - playerEntity.position.y
            const length = Math.hypot(dx, dy)
            const direction = { x: dx / length, y: dy / length }

            // 冲刺移动
            const dashDistance = 150
            playerEntity.position.x += direction.x * dashDistance
            playerEntity.position.y += direction.y * dashDistance

            // 边界检查
            playerEntity.position.x = Math.max(20, Math.min(canvasSize.width - 20, playerEntity.position.x))
            playerEntity.position.y = Math.max(20, Math.min(canvasSize.height - 20, playerEntity.position.y))

            gameState.value.player.position = playerEntity.position
        }
    }

    /**
     * 处理技能 Q
     */
    function handleSkillQ() {
        if (!charBuild.value) return
        if (!skillBehaviors.value) return
        const behavior = skillBehaviors.value.q
        SkillSystem.castSkill("q", behavior, gameState.value)
    }

    /**
     * 选择敌人
     */
    function handleEnemySelect(enemyId: number) {
        const mobData = monsterMap.get(enemyId)
        if (!mobData) return

        const enemy = new Enemy(mobData, { x: 600, y: 300 })

        gameState.value.enemy = {
            position: enemy.position,
            rotation: enemy.rotation,
            radius: enemy.radius,
            data: enemy.data,
            level: charSettings.value.enemyLevel, // 使用设置中的敌人等级
            currentHealth: enemy.currentHealth,
            maxHealth: enemy.maxHealth,
            currentShield: enemy.currentShield,
            maxShield: enemy.maxShield,
        }
    }

    /**
     * 更新游戏状态
     */
    function update(dt: number) {
        // 更新玩家移动
        playerEntity.update(dt, gameState.value.input)
        gameState.value.player.position = playerEntity.position
        gameState.value.player.rotation = playerEntity.rotation

        // 更新冷却时间显示
        const now = Date.now()
        const player = gameState.value.player
        const behaviors = skillBehaviors.value
        if (!behaviors) return

        const eRemaining = Math.max(0, (player.lastSkillE + behaviors.e.cooldown * 1000 - now) / 1000)
        eCooldownDisplay.value = eRemaining

        const qRemaining = Math.max(0, (player.lastSkillQ + behaviors.q.cooldown * 1000 - now) / 1000)
        qCooldownDisplay.value = qRemaining

        // 更新活跃技能
        SkillSystem.updateActiveSkills(dt, gameState.value)

        // 更新DPS统计
        dpsStats.value = DPSMeter.getStats()

        // 更新投射物
        gameState.value.projectiles = gameState.value.projectiles.filter((proj) => {
            const projEntity = new ProjectileEntity(proj.position, { x: 0, y: 0 }, 0, proj.damage, proj.element)
            projEntity.position = proj.position
            projEntity.velocity = proj.velocity
            const outOfBounds = projEntity.update(dt, canvasSize.width, canvasSize.height)
            proj.position = projEntity.position
            return !outOfBounds && !proj.markedForDeletion
        })

        // 检测碰撞
        CollisionSystem.checkCollisions(gameState.value)

        // 更新伤害数字
        gameState.value.damageNumbers = gameState.value.damageNumbers.filter((dmgNum) => {
            const dmgEntity = new DamageNumberEntity(dmgNum.position, dmgNum.value, dmgNum.element)
            dmgEntity.age = dmgNum.age
            dmgEntity.position = dmgNum.position
            const alive = dmgEntity.update(dt)
            dmgNum.age = dmgEntity.age
            dmgNum.position = dmgEntity.position
            return alive
        })

        // 更新敌人位置(如果需要移动)
        // 目前敌人是静止的
    }

    /**
     * 绘制背景网格
     */
    function drawGrid(ctx: CanvasRenderingContext2D) {
        ctx.strokeStyle = "#374151"
        ctx.lineWidth = 1
        const gridSize = 50

        for (let x = 0; x <= canvasSize.width; x += gridSize) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvasSize.height)
            ctx.stroke()
        }

        for (let y = 0; y <= canvasSize.height; y += gridSize) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(canvasSize.width, y)
            ctx.stroke()
        }
    }

    /**
     * 渲染游戏
     */
    function render(context: CanvasRenderingContext2D, state: GameState) {
        // 清空画布
        context.clearRect(0, 0, canvasSize.width, canvasSize.height)

        // 绘制背景
        context.fillStyle = "#1f2937"
        context.fillRect(0, 0, canvasSize.width, canvasSize.height)

        // 绘制网格
        drawGrid(context)

        // 绘制敌人
        if (state.enemy) {
            const enemy = new Enemy(state.enemy.data, state.enemy.position)
            enemy.currentHealth = state.enemy.currentHealth
            enemy.currentShield = state.enemy.currentShield
            enemy.draw(context)
        }

        // 绘制玩家
        playerEntity.draw(context, state.player.charData.属性)

        // 绘制投射物
        state.projectiles.forEach((proj) => {
            const projEntity = new ProjectileEntity(proj.position, { x: 0, y: 0 }, 0, proj.damage, proj.element)
            projEntity.position = proj.position
            projEntity.draw(context)
        })

        // 绘制伤害数字
        state.damageNumbers.forEach((dmgNum) => {
            const dmgEntity = new DamageNumberEntity(dmgNum.position, dmgNum.value, dmgNum.element)
            dmgEntity.age = dmgNum.age
            dmgEntity.draw(context)
        })
    }

    /**
     * 游戏循环
     */
    function gameLoop(timestamp: number) {
        if (!lastTime.value) lastTime.value = timestamp
        const deltaTime = (timestamp - lastTime.value) / 1000 // 转换为秒
        lastTime.value = timestamp

        if (!gameState.value.isPaused && ctx.value) {
            update(deltaTime)
            render(ctx.value, gameState.value)
        }

        animationFrameId.value = requestAnimationFrame(gameLoop)
    }

    /**
     * 启动游戏
     */
    function start() {
        if (!canvasRef.value) return

        ctx.value = canvasRef.value.getContext("2d")!
        if (!ctx.value) {
            console.error("无法获取 Canvas 2D 上下文")
            return
        }

        // 设置输入监听
        cleanupListeners.value = InputSystem.setupListeners(canvasRef.value, gameState.value.input, {
            onMeleeAttack: handleMeleeAttack,
            onRangedAttack: handleRangedAttack,
            onSkillE: handleSkillE,
            onSkillQ: handleSkillQ,
        })

        gameState.value.isInitialized = true
        animationFrameId.value = requestAnimationFrame(gameLoop)
    }

    /**
     * 停止游戏
     */
    function stop() {
        if (animationFrameId.value) {
            cancelAnimationFrame(animationFrameId.value)
        }
        if (cleanupListeners.value) {
            cleanupListeners.value()
        }
    }

    // 组件挂载时启动
    onMounted(() => {
        // 在组件中手动调用 start
    })

    // 组件卸载时停止
    onUnmounted(() => {
        stop()
    })

    return {
        canvasRef,
        canvasSize,
        gameState,
        eCooldown: eCooldownDisplay,
        qCooldown: qCooldownDisplay,
        start,
        stop,
        handleEnemySelect,
        mobList: monsterMap.values(),
        dpsStats,
        skillBehaviors,
    }
}
