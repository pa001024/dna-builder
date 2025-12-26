import { ref, type Ref } from "vue"
import {
    Engine,
    Scene,
    SceneLoader,
    UniversalCamera,
    Vector3,
    HemisphericLight,
    DirectionalLight,
    PointLight,
    ShadowGenerator,
    Color4,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    AbstractMesh,
    Matrix,
} from "@babylonjs/core"
import { AdvancedDynamicTexture, Control, TextBlock, Rectangle } from "@babylonjs/gui"
import "@babylonjs/loaders/glTF"
import { useFPSGameStore } from "../store/fpsGame"

export function useBabylonScene(canvas: Ref<HTMLCanvasElement | null>) {
    // Get store reference
    const store = useFPSGameStore()

    // Babylon.js objects
    let engine: Engine | null = null
    let scene: Scene | null = null
    let camera: UniversalCamera | null = null
    let gui: AdvancedDynamicTexture | null = null

    // Game objects
    const targets = ref<AbstractMesh[]>([])
    const bullets = ref<Mesh[]>([])
    let playerWeapon: Mesh | null = null
    let targetModel: AbstractMesh[] | null = null // Store loaded target model

    // Damage display system
    const damageTexts: Array<{ rect: Rectangle; text: TextBlock; life: number }> = []

    // Input state
    const keysPressed = ref<Set<string>>(new Set())
    let isPointerLocked = false

    // Initialize Babylon.js engine and scene
    const initBabylon = () => {
        if (!canvas.value) return

        // Create engine with antialiasing
        engine = new Engine(canvas.value, true, {
            preserveDrawingBuffer: true,
            stencil: true,
        })

        // Create scene
        scene = new Scene(engine)
        scene.clearColor = new Color4(0.95, 0.95, 0.98, 1.0) // Bright white-gray background (Warframe style)

        // Create camera (First-person)
        camera = new UniversalCamera("camera", new Vector3(0, 1.7, 0), scene)
        camera.attachControl(canvas.value, true)
        camera.speed = 0.15
        camera.angularSensibility = 2000 - store.mouseSensitivity * 100000
        camera.applyGravity = true
        camera.checkCollisions = true
        camera.ellipsoid = new Vector3(0.5, 1, 0.5)

        // Setup Warframe-style lighting (clean white/bright environment)
        // Main directional light (bright white)
        const mainLight = new DirectionalLight("mainLight", new Vector3(-1, -2, -1), scene)
        mainLight.position = new Vector3(20, 40, 20)
        mainLight.intensity = 1.0
        mainLight.diffuse = new Color3(1.0, 1.0, 1.0) // Pure white light

        // Fill light for soft shadows
        const fillLight = new HemisphericLight("fillLight", new Vector3(0, 1, 0), scene)
        fillLight.intensity = 0.6
        fillLight.diffuse = new Color3(0.95, 0.95, 1.0) // Cool white ambient
        fillLight.groundColor = new Color3(0.7, 0.7, 0.75) // Slightly darker ground

        // Rim light for glowing edge effect
        const rimLight = new DirectionalLight("rimLight", new Vector3(0, 0.5, 1), scene)
        rimLight.position = new Vector3(-10, 20, -10)
        rimLight.intensity = 0.4
        rimLight.diffuse = new Color3(1.0, 1.0, 1.0) // White rim light

        // Point lights for ambient glow effects
        const ambientGlow1 = new HemisphericLight("ambientGlow1", new Vector3(1, 0, 1), scene)
        ambientGlow1.intensity = 0.3
        ambientGlow1.diffuse = new Color3(0.7, 0.8, 1.0) // Slight blue tint

        // Shadow generator with soft shadows
        const shadowGenerator = new ShadowGenerator(2048, mainLight)
        shadowGenerator.useBlurExponentialShadowMap = true
        shadowGenerator.blurKernel = 32
        shadowGenerator.transparencyShadow = true

        // Create ground with white platform material
        const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene)
        const groundMat = createToonMaterial(scene, new Color3(0.92, 0.92, 0.95)) // White-gray
        ground.material = groundMat
        ground.receiveShadows = true
        ground.checkCollisions = true

        // Create platform with glowing edges
        createPlatformWithGlow(scene, shadowGenerator)

        // Create weapon model
        createWeapon(scene)

        // Load target model
        loadTargetModel(scene, shadowGenerator)

        // Initialize GUI
        initGUI()

        // Setup event listeners
        setupInputHandlers()

        // Start render loop
        engine.runRenderLoop(() => {
            if (scene && store.isPlaying) {
                scene.render()
                updateGameLogic()
            }
        })

        // Handle resize
        window.addEventListener("resize", handleResize)
    }

    const createPlatformWithGlow = (scene: Scene, shadowGenerator: ShadowGenerator) => {
        // Create main raised platform
        const platformSize = 20
        const platformHeight = 0.5
        const platform = MeshBuilder.CreateBox(
            "platform",
            {
                width: platformSize,
                height: platformHeight,
                depth: platformSize,
            },
            scene,
        )
        platform.position.set(0, platformHeight / 2, 0)

        const platformMat = createToonMaterial(scene, new Color3(0.96, 0.96, 0.98))
        platform.material = platformMat
        platform.receiveShadows = true
        platform.checkCollisions = true

        // Create glowing edge strips (neon glow effect)
        const glowColor = new Color3(0.4, 0.6, 1.0) // Cyan-blue glow
        const edgeWidth = 0.15
        const edgeHeight = 0.6

        const glowMat = new StandardMaterial("glowEdgeMat", scene)
        glowMat.diffuseColor = glowColor
        glowMat.emissiveColor = glowColor.scale(1.5) // Strong glow
        glowMat.alpha = 0.9

        // Create 4 edge strips around the platform
        const edges = [
            // North edge
            {
                name: "edge_north",
                width: platformSize,
                height: edgeHeight,
                depth: edgeWidth,
                x: 0,
                z: -platformSize / 2 + edgeWidth / 2,
            },
            // South edge
            {
                name: "edge_south",
                width: platformSize,
                height: edgeHeight,
                depth: edgeWidth,
                x: 0,
                z: platformSize / 2 - edgeWidth / 2,
            },
            // East edge
            {
                name: "edge_east",
                width: edgeWidth,
                height: edgeHeight,
                depth: platformSize,
                x: platformSize / 2 - edgeWidth / 2,
                z: 0,
            },
            // West edge
            {
                name: "edge_west",
                width: edgeWidth,
                height: edgeHeight,
                depth: platformSize,
                x: -platformSize / 2 + edgeWidth / 2,
                z: 0,
            },
        ]

        edges.forEach((edge) => {
            const edgeMesh = MeshBuilder.CreateBox(
                edge.name,
                {
                    width: edge.width,
                    height: edge.height,
                    depth: edge.depth,
                },
                scene,
            )
            edgeMesh.position.set(edge.x, edgeHeight / 2, edge.z)
            edgeMesh.material = glowMat
            shadowGenerator.addShadowCaster(edgeMesh)
        })

        // Add point lights near edges for glow effect
        const edgeLight1 = new PointLight("edgeLight1", new Vector3(platformSize / 2, 2, platformSize / 2), scene)
        edgeLight1.intensity = 0.6
        edgeLight1.diffuse = new Color3(0.5, 0.7, 1.0)

        const edgeLight2 = new PointLight("edgeLight2", new Vector3(-platformSize / 2, 2, -platformSize / 2), scene)
        edgeLight2.intensity = 0.6
        edgeLight2.diffuse = new Color3(0.5, 0.7, 1.0)

        // Create corner pillars with glow
        const pillarSize = 0.8
        const pillarHeight = 4
        const pillarMat = createToonMaterial(scene, new Color3(0.94, 0.94, 0.96))

        const pillarGlowMat = new StandardMaterial("pillarGlowMat", scene)
        pillarGlowMat.diffuseColor = glowColor
        pillarGlowMat.emissiveColor = glowColor.scale(1.2)

        const corners = [
            { x: platformSize / 2, z: platformSize / 2 },
            { x: platformSize / 2, z: -platformSize / 2 },
            { x: -platformSize / 2, z: platformSize / 2 },
            { x: -platformSize / 2, z: -platformSize / 2 },
        ]

        corners.forEach((corner, i) => {
            // Main pillar
            const pillar = MeshBuilder.CreateBox(
                `pillar_${i}`,
                {
                    width: pillarSize,
                    height: pillarHeight,
                    depth: pillarSize,
                },
                scene,
            )
            pillar.position.set(corner.x, pillarHeight / 2, corner.z)
            pillar.material = pillarMat
            pillar.checkCollisions = true
            shadowGenerator.addShadowCaster(pillar)

            // Glowing ring around pillar top
            const ring = MeshBuilder.CreateTorus(
                `pillar_ring_${i}`,
                {
                    diameter: pillarSize * 1.2,
                    thickness: 0.1,
                },
                scene,
            )
            ring.position.set(corner.x, pillarHeight, corner.z)
            ring.rotation.x = Math.PI / 2
            ring.material = pillarGlowMat
        })
    }

    const createWeapon = (scene: Scene) => {
        // Simple box as weapon placeholder
        playerWeapon = MeshBuilder.CreateBox("weapon", { width: 0.1, height: 0.1, depth: 0.4 }, scene)
        playerWeapon.position.set(0.3, -0.3, 0.8)
        playerWeapon.parent = camera

        const weaponMat = new StandardMaterial("weaponMat", scene)
        weaponMat.diffuseColor = new Color3(0.2, 0.2, 0.2)
        weaponMat.emissiveColor = new Color3(0.1, 0.1, 0.1)
        playerWeapon.material = weaponMat
    }

    // Create Genshin-style cartoon shading material (Toon/Cel Shading)
    const createToonMaterial = (scene: Scene, baseColor: Color3) => {
        const material = new StandardMaterial(`toon_${baseColor.r}_${baseColor.g}_${baseColor.b}`, scene)

        // Enable cell shading style
        material.diffuseColor = baseColor
        material.specularColor = new Color3(0.3, 0.3, 0.3) // Moderate specular
        material.emissiveColor = new Color3(0, 0, 0)

        // Rough material for cartoon look
        material.roughness = 0.8

        return material
    }

    // Create skill effect materials with卡通 style
    const createSkillToonMaterial = (scene: Scene, skillColor: Color3) => {
        const material = new StandardMaterial("skill_toon", scene)

        // Bright, saturated colors for skills
        material.diffuseColor = skillColor
        material.emissiveColor = skillColor.scale(0.8)
        material.alpha = 0.85

        // Disable specular for glowing effect
        material.specularColor = new Color3(0, 0, 0)

        return material
    }

    const loadTargetModel = async (scene: Scene, shadowGenerator: ShadowGenerator) => {
        try {
            // Load the training dummy model from public folder
            const result = await SceneLoader.ImportMeshAsync(null, "/models/", "DamagedHelmet.glb", scene)

            // Store the model for cloning
            targetModel = result.meshes

            // Scale and position the model appropriately for a target
            result.meshes.forEach((mesh: AbstractMesh) => {
                if (mesh.name !== "__root__") {
                    mesh.scaling = new Vector3(0.5, 0.5, 0.5)
                    mesh.receiveShadows = true

                    // Apply toon material to target model
                    const toonMat = createToonMaterial(scene, new Color3(0.7, 0.65, 0.6)) // Neutral target color
                    mesh.material = toonMat

                    shadowGenerator.addShadowCaster(mesh)
                }
            })

            console.log("Target model loaded successfully")
        } catch (error) {
            console.warn("Failed to load target model, using primitive fallback:", error)
            targetModel = null
        }
    }

    const initGUI = () => {
        if (!scene || !camera) return

        gui = AdvancedDynamicTexture.CreateFullscreenUI("UI")

        // Crosshair
        const crosshair = new Rectangle("crosshair")
        crosshair.width = "20px"
        crosshair.height = "20px"
        crosshair.cornerRadius = 10
        crosshair.color = "white"
        crosshair.thickness = 2
        crosshair.background = "transparent"
        gui.addControl(crosshair)

        // HUD - Ammo
        const ammoText = new TextBlock("ammo", "30 / 90")
        ammoText.color = "white"
        ammoText.fontSize = 24
        ammoText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT
        ammoText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
        ammoText.paddingRight = "20px"
        ammoText.paddingBottom = "20px"
        gui.addControl(ammoText)

        // HUD - Health
        const healthText = new TextBlock("health", "HP: 100")
        healthText.color = "#00ff00"
        healthText.fontSize = 24
        healthText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        healthText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
        healthText.paddingLeft = "20px"
        healthText.paddingBottom = "20px"
        gui.addControl(healthText)

        // HUD - Score
        const scoreText = new TextBlock("score", "Score: 0")
        scoreText.color = "white"
        scoreText.fontSize = 24
        scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        scoreText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        scoreText.paddingTop = "20px"
        gui.addControl(scoreText)
    }

    const updateGUI = () => {
        if (!gui) return

        const ammoText = gui.getControlByName("ammo") as TextBlock
        const healthText = gui.getControlByName("health") as TextBlock
        const scoreText = gui.getControlByName("score") as TextBlock

        if (ammoText) {
            ammoText.text = `${store.currentAmmo} / ${store.reserveAmmo}`
        }
        if (healthText) {
            healthText.text = `HP: ${store.playerHealth}`
            healthText.color = store.playerHealth > 50 ? "#00ff00" : store.playerHealth > 25 ? "#ffff00" : "#ff0000"
        }
        if (scoreText) {
            scoreText.text = `Score: ${store.score}`
        }
    }

    const setupInputHandlers = () => {
        if (!canvas.value || !scene) return

        // Keyboard events
        canvas.value.addEventListener("keydown", (e) => {
            keysPressed.value.add(e.code)

            // Reload
            if (e.code === "KeyR") {
                store.reload()
            }

            // Pause
            if (e.code === "Escape") {
                if (store.isPlaying) {
                    store.pauseGame()
                } else if (store.isPaused) {
                    store.resumeGame()
                }
            }
        })

        canvas.value.addEventListener("keyup", (e) => {
            keysPressed.value.delete(e.code)
        })

        // Skill keys Q and E
        canvas.value.addEventListener("keydown", (e) => {
            if (!store.isPlaying) return

            if (e.code === "KeyQ") {
                if (store.useSkill1()) {
                    executeSkill1()
                }
            }
            if (e.code === "KeyE") {
                if (store.useSkill2()) {
                    executeSkill2()
                }
            }
        })

        // Mouse click for shooting
        canvas.value.addEventListener("click", () => {
            if (!isPointerLocked && store.isPlaying) {
                canvas.value?.requestPointerLock()
            } else if (store.isPlaying) {
                shoot()
            }
        })

        // Pointer lock change
        document.addEventListener("pointerlockchange", () => {
            isPointerLocked = document.pointerLockElement === canvas.value
        })

        // Mouse movement for camera
        canvas.value.addEventListener("mousemove", (e) => {
            if (isPointerLocked && camera && store.isPlaying) {
                camera.rotation.y += e.movementX * store.mouseSensitivity
                camera.rotation.x += e.movementY * store.mouseSensitivity
                // Clamp vertical rotation
                camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x))
            }
        })
    }

    const updateGameLogic = () => {
        if (!camera || !scene) return

        // Movement
        const speed = 0.15
        const forward = camera.getDirection(Vector3.Forward())
        const right = camera.getDirection(Vector3.Right())

        if (keysPressed.value.has("KeyW")) {
            camera.position.addInPlace(forward.scale(speed))
        }
        if (keysPressed.value.has("KeyS")) {
            camera.position.addInPlace(forward.scale(-speed))
        }
        if (keysPressed.value.has("KeyA")) {
            camera.position.addInPlace(right.scale(-speed))
        }
        if (keysPressed.value.has("KeyD")) {
            camera.position.addInPlace(right.scale(speed))
        }

        // Update GUI
        updateGUI()

        // Spawn targets
        if (Math.random() < 0.01 && targets.value.length < 10) {
            spawnTarget()
        }

        // Update bullets
        updateBullets()
    }

    const spawnTarget = () => {
        if (!scene) return

        let target: AbstractMesh

        if (targetModel) {
            // Clone the loaded 3D model
            const clones: AbstractMesh[] = []
            targetModel.forEach((mesh: AbstractMesh) => {
                if (mesh.name !== "__root__") {
                    const clone = mesh.clone(`target_${Date.now()}_${mesh.name}`, null)
                    if (clone) {
                        clones.push(clone as AbstractMesh)
                    }
                }
            })
            // Use the first clone as the main target for game logic
            target = clones[0] || MeshBuilder.CreateSphere("target_fallback", { diameter: 1 }, scene)
        } else {
            // Fallback to primitive sphere with toon material
            target = MeshBuilder.CreateSphere("target", { diameter: 1 }, scene)
            const targetMat = createToonMaterial(scene, new Color3(0.65, 0.6, 0.55)) // Neutral gray-brown
            target.material = targetMat
        }

        const x = (Math.random() - 0.5) * 40
        const z = (Math.random() - 0.5) * 40
        target.position.set(x, 1, z)

        // Add metadata for game logic - scale health with character level
        const charLevel = store.selectedCharacter?.基础攻击 || 100
        const targetHealth = Math.ceil(3 + charLevel / 50)
        target.metadata = { health: targetHealth, maxHealth: targetHealth, points: 10, isModel: !!targetModel }

        targets.value.push(target)
    }

    const shoot = () => {
        if (!scene || !camera || !store.shoot()) return

        // Create bullet with toon-style material
        const bullet = MeshBuilder.CreateSphere("bullet", { diameter: 0.1 }, scene)
        bullet.position = camera.position.clone()
        const direction = camera.getDirection(Vector3.Forward())
        bullet.metadata = { direction, speed: 2, life: 100 }

        // Apply glowing toon material to bullet
        const bulletMat = createSkillToonMaterial(scene, new Color3(1.0, 0.9, 0.5)) // Golden bullet
        bullet.material = bulletMat

        bullets.value.push(bullet)

        // Weapon recoil animation
        if (playerWeapon) {
            playerWeapon.rotation.x -= 0.1
            setTimeout(() => {
                if (playerWeapon) {
                    playerWeapon.rotation.x += 0.1
                }
            }, 50)
        }
    }

    const updateBullets = () => {
        bullets.value.forEach((bullet, index) => {
            if (!bullet.metadata) return

            const { direction, speed } = bullet.metadata
            bullet.position.addInPlace(direction.scale(speed))
            bullet.metadata.life = (bullet.metadata.life as number) - 1

            // Check collision with targets
            targets.value.forEach((target: any, targetIndex: number) => {
                if (bullet.intersectsMesh(target, false)) {
                    // Hit!
                    if (target.metadata) {
                        // Calculate damage using CharBuild
                        const damage = store.calculateDamage() // Normal attack
                        const isCrit = Math.random() < 0.2 // 20% crit chance

                        target.metadata.health -= damage
                        store.recordDamage(damage)

                        // Show damage number
                        createDamageNumber(target.position.clone(), damage, false, isCrit)

                        if (target.metadata.health <= 0) {
                            // Destroy target and all its cloned meshes
                            if (target.metadata.isModel) {
                                // Dispose all related clones
                                targets.value.forEach((t) => {
                                    if (t.metadata && t.name.startsWith(target.name.split("_").slice(0, 2).join("_"))) {
                                        t.dispose()
                                    }
                                })
                                // Clear all targets with same base name
                                const baseName = target.name.split("_").slice(0, 2).join("_")
                                targets.value = targets.value.filter((t) => !t.name.startsWith(baseName))
                            } else {
                                target.dispose()
                                targets.value.splice(targetIndex, 1)
                            }
                            store.addScore(target.metadata.points)
                        }
                    }

                    // Destroy bullet
                    bullet.dispose()
                    bullets.value.splice(index, 1)

                    // Create impact effect
                    createImpactEffect(bullet.position.clone())
                }
            })

            // Remove bullet if life expired
            if (bullet.metadata.life <= 0) {
                bullet.dispose()
                bullets.value.splice(index, 1)
            }
        })
    }

    const createImpactEffect = (position: Vector3) => {
        if (!scene) return

        // Simple particle effect
        const particle = MeshBuilder.CreateSphere("particle", { diameter: 0.2 }, scene)
        particle.position = position
        const particleMat = new StandardMaterial("particleMat", scene)
        particleMat.emissiveColor = new Color3(1, 1, 0)
        particle.material = particleMat

        // Animate and remove
        let scale = 1
        let alpha = 1

        const animate = () => {
            scale += 0.1
            alpha -= 0.1
            particle.scaling.set(scale, scale, scale)
            particleMat.alpha = alpha

            if (alpha <= 0) {
                particle.dispose()
            } else {
                requestAnimationFrame(animate)
            }
        }
        animate()
    }

    // Create floating damage number
    const createDamageNumber = (position: Vector3, damage: number, isSkill = false, isCrit = false) => {
        if (!gui || !scene || !camera) return

        // Create rectangle container for better positioning
        const rect = new Rectangle()
        rect.width = "100px"
        rect.height = "50px"
        rect.cornerRadius = 5
        rect.thickness = 0
        rect.background = isSkill ? "rgba(255, 100, 0, 0.3)" : "rgba(255, 255, 255, 0.2)"

        // Create text block
        const text = new TextBlock()
        text.text = damage.toString()
        text.color = isCrit ? "#ff4444" : isSkill ? "#ff8800" : "#ffffff"
        text.fontSize = isCrit ? 28 : isSkill ? 24 : 20
        text.fontWeight = "bold"
        text.width = "100%"
        text.height = "100%"
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
        text.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER

        rect.addControl(text)
        if (gui) {
            gui.addControl(rect)
        }

        // Convert 3D position to screen coordinates
        const screenPos = Vector3.Project(
            position,
            Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(engine!.getRenderWidth(), engine!.getRenderHeight()),
        )

        rect.left = screenPos.x
        rect.top = screenPos.y

        // Animate floating up and fade out
        let life = 60 // frames
        let offsetY = 0

        const animateDamage = () => {
            life--
            offsetY += 1.5

            // Update position
            rect.top = screenPos.y - offsetY

            // Fade out
            rect.alpha = life / 60

            if (life <= 0) {
                if (gui) {
                    gui.removeControl(rect)
                }
                rect.dispose()
                const index = damageTexts.findIndex((d) => d.rect === rect)
                if (index > -1) damageTexts.splice(index, 1)
            } else {
                requestAnimationFrame(animateDamage)
            }
        }
        animateDamage()

        damageTexts.push({ rect, text, life })
    }

    // Skill 1: Q - 日食/月猎 (Area damage skill) with cartoon style
    const executeSkill1 = () => {
        if (!scene || !camera) return

        const char = store.selectedCharacter
        if (!char) return

        // Get character attribute for skill color
        const isLight = char.属性 === "光"
        const skillColor = isLight ? new Color3(1, 0.9, 0.3) : new Color3(0.6, 0.3, 1)

        // Create skill sphere with toon material at player position
        const skillSphere = MeshBuilder.CreateSphere("skill1_sphere", { diameter: 0.5 }, scene)
        skillSphere.position = camera.position.clone()

        // Use cartoon-style glowing material
        const skillMat = createSkillToonMaterial(scene, skillColor)
        skillMat.alpha = 0.9
        skillSphere.material = skillMat

        // Animate skill expansion
        let radius = 0.5
        const maxRadius = 6 // Skill range from data

        const animateSkill = () => {
            radius += 0.5
            skillSphere.scaling.set(radius, radius, radius)

            // Check collision with targets
            targets.value.forEach((target: any, targetIndex: number) => {
                if (skillSphere.intersectsMesh(target, false)) {
                    // Hit all targets in range - only once per target
                    if (target.metadata && !target.metadata.hitBySkill1) {
                        target.metadata.hitBySkill1 = true

                        // Calculate skill damage
                        const damage = store.calculateDamage(0) // Q skill
                        target.metadata.health -= damage
                        store.recordDamage(damage)

                        // Show damage number
                        createDamageNumber(target.position.clone(), damage, true, false)

                        if (target.metadata.health <= 0) {
                            if (target.metadata.isModel) {
                                targets.value.forEach((t) => {
                                    if (t.metadata && t.name.startsWith(target.name.split("_").slice(0, 2).join("_"))) {
                                        t.dispose()
                                    }
                                })
                                const baseName = target.name.split("_").slice(0, 2).join("_")
                                targets.value = targets.value.filter((t) => !t.name.startsWith(baseName))
                            } else {
                                target.dispose()
                                targets.value.splice(targetIndex, 1)
                            }
                            store.addScore(20)
                        }
                    }
                }
            })

            // Fade out
            skillMat.alpha -= 0.05

            if (skillMat.alpha <= 0 || radius > maxRadius) {
                skillSphere.dispose()
            } else {
                requestAnimationFrame(animateSkill)
            }
        }
        animateSkill()
    }

    // Skill 2: E - 雾海安魂 (Ultimate - Massive AOE) with cartoon style
    const executeSkill2 = () => {
        if (!scene || !camera) return

        const char = store.selectedCharacter
        if (!char) return

        const isLight = char.属性 === "光"
        const skillColor = isLight ? new Color3(1, 1, 0.5) : new Color3(0.8, 0.4, 1)

        // Create multiple expanding waves for ultimate effect with toon materials
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (!scene || !camera) return

                const wave = MeshBuilder.CreateTorus(`skill2_wave_${i}`, { diameter: 10, thickness: 0.5 }, scene)
                wave.position = camera.position.clone()
                wave.rotation.x = Math.PI / 2

                // Use cartoon-style glowing material
                const waveMat = createSkillToonMaterial(scene, skillColor)
                waveMat.alpha = 0.95
                wave.material = waveMat

                let waveRadius = 2
                const maxWaveRadius = 15 // Ultimate has bigger range

                const animateWave = () => {
                    waveRadius += 0.8
                    wave.scaling.set(waveRadius / 10, 1, waveRadius / 10)
                    waveMat.alpha -= 0.03

                    // Check collision with all targets in range
                    targets.value.forEach((target: any, targetIndex: number) => {
                        const distance = Vector3.Distance(wave.position, target.position)
                        if (distance < waveRadius / 2) {
                            if (target.metadata && !target.metadata.hitByWave[i]) {
                                target.metadata.hitByWave = target.metadata.hitByWave || []
                                target.metadata.hitByWave[i] = true

                                // Calculate ultimate damage
                                const damage = store.calculateDamage(1) // E skill
                                target.metadata.health -= damage
                                store.recordDamage(damage)

                                // Show damage number
                                createDamageNumber(target.position.clone(), damage, true, true)

                                if (target.metadata.health <= 0) {
                                    if (target.metadata.isModel) {
                                        targets.value.forEach((t) => {
                                            if (t.metadata && t.name.startsWith(target.name.split("_").slice(0, 2).join("_"))) {
                                                t.dispose()
                                            }
                                        })
                                        const baseName = target.name.split("_").slice(0, 2).join("_")
                                        targets.value = targets.value.filter((t) => !t.name.startsWith(baseName))
                                    } else {
                                        target.dispose()
                                        targets.value.splice(targetIndex, 1)
                                    }
                                    store.addScore(30)
                                }
                            }
                        }
                    })

                    if (waveMat.alpha <= 0 || waveRadius > maxWaveRadius) {
                        wave.dispose()
                    } else {
                        requestAnimationFrame(animateWave)
                    }
                }
                animateWave()
            }, i * 200)
        }
    }

    const handleResize = () => {
        engine?.resize()
    }

    const cleanup = () => {
        window.removeEventListener("resize", handleResize)

        // Dispose all meshes
        targets.value.forEach((t) => t.dispose())
        bullets.value.forEach((b) => b.dispose())

        // Dispose scene and engine
        scene?.dispose()
        engine?.dispose()

        gui?.dispose()
    }

    return {
        initBabylon,
        cleanup,
        targets,
        bullets,
    }
}
