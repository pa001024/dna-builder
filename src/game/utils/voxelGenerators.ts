import { VoxelData } from "../types"
import { COLORS } from "./voxelConstants"

// Helper to prevent overlapping voxels
function setBlock(map: Map<string, VoxelData>, x: number, y: number, z: number, color: number) {
    const rx = Math.round(x)
    const ry = Math.round(y)
    const rz = Math.round(z)
    const key = `${rx},${ry},${rz}`
    map.set(key, { x: rx, y: ry, z: rz, color })
}

export const Generators = {
    // 默认
    Default: (): VoxelData[] => {
        const map = new Map<string, VoxelData>()
        // const OX = 0, OY = 0, OZ = 0;

        // Boots (Dark w/ Lightning trim)
        for (let y = 0; y < 3; y++) {
            setBlock(map, -1, y, 0, COLORS.BLACK)
            setBlock(map, 1, y, 0, COLORS.BLACK)
        }
        setBlock(map, -1, 1, 1, COLORS.TALON) // Gold trim
        setBlock(map, 1, 1, 1, COLORS.TALON)

        // Legs (Skin)
        for (let y = 3; y < 6; y++) {
            setBlock(map, -1, y, 0, COLORS.SKIN)
            setBlock(map, 1, y, 0, COLORS.SKIN)
        }

        // Skirt/Shorts (Dark Purple/Black)
        for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) setBlock(map, x, 6, z, COLORS.DARK_PURPLE)

        // Torso (White Shirt + Jacket)
        for (let y = 7; y < 11; y++) {
            for (let x = -1; x <= 1; x++) setBlock(map, x, y, 0, COLORS.WHITE)
        }
        // Jacket Open
        for (let y = 7; y < 10; y++) {
            setBlock(map, -2, y, 0, COLORS.DARK_PURPLE)
            setBlock(map, 2, y, 0, COLORS.DARK_PURPLE)
        }

        // Head
        const HY = 12
        for (let x = -2; x <= 2; x++)
            for (let y = 0; y < 4; y++)
                for (let z = -2; z <= 2; z++) {
                    setBlock(map, x, HY + y, z, COLORS.SKIN)
                }

        // Hair (Silver/Blue)
        const hairColor = COLORS.SILVER_BLUE
        for (let x = -3; x <= 3; x++)
            for (let z = -3; z <= 3; z++) {
                setBlock(map, x, HY + 4, z, hairColor) // Top
                if (x === -3 || x === 3 || z === -3) {
                    // Sides/Back
                    for (let y = 0; y < 5; y++) setBlock(map, x, HY + y, z, hairColor)
                }
            }
        // Twin Tails
        for (let y = 0; y < 8; y++) {
            setBlock(map, -4, HY + 2 - y, -1, hairColor)
            setBlock(map, 4, HY + 2 - y, -1, hairColor)
        }

        // Eyes
        setBlock(map, -1, HY + 1, 2, COLORS.CYAN)
        setBlock(map, 1, HY + 1, 2, COLORS.CYAN)

        // Halo/Accessory
        setBlock(map, -3, HY + 5, 0, COLORS.GOLD)
        setBlock(map, 3, HY + 5, 0, COLORS.GOLD)

        // Weapon: Floating Drones (Visual only, logic separate)
        setBlock(map, -4, 8, 2, COLORS.GRAY)
        setBlock(map, 4, 8, 2, COLORS.GRAY)

        return Array.from(map.values())
    },

    // 角色Lise - 蓝白头发，军装风格
    Lise: (): VoxelData[] => {
        const map = new Map<string, VoxelData>()
        const HY = 12 // 头部基准高度

        // --- 基础身体结构 ---
        // 头部 (肤色)
        for (let x = -2; x <= 2; x++)
            for (let y = 0; y < 4; y++)
                for (let z = -2; z <= 2; z++) {
                    setBlock(map, x, HY + y, z, COLORS.SKIN)
                }

        // --- 头发和角 ---
        const hairColor = COLORS.SILVER_BLUE // 蓝白色头发
        const hornColor = COLORS.BLUE_HORN // 蓝色角

        // 头顶头发
        for (let x = -3; x <= 3; x++)
            for (let z = -3; z <= 3; z++) {
                setBlock(map, x, HY + 4, z, hairColor)
            }

        // 两侧和背面头发
        for (let x = -3; x <= 3; x++)
            for (let z = -3; z <= 3; z++) {
                if (x === -3 || x === 3 || z === -3) {
                    for (let y = 0; y < 4; y++) {
                        setBlock(map, x, HY + y, z, hairColor)
                    }
                }
            }

        // 角状装饰
        // 左侧角
        setBlock(map, -3, HY + 3, 1, hornColor)
        setBlock(map, -4, HY + 4, 1, hornColor)
        setBlock(map, -4, HY + 5, 0, hornColor)
        // 右侧角
        setBlock(map, 3, HY + 3, 1, hornColor)
        setBlock(map, 4, HY + 4, 1, hornColor)
        setBlock(map, 4, HY + 5, 0, hornColor)

        // --- 面部特征 ---
        // 眼睛 (蓝色)
        setBlock(map, -1, HY + 1, 2, COLORS.DEEP_BLUE)
        setBlock(map, 1, HY + 1, 2, COLORS.DEEP_BLUE)
        // 眉毛
        setBlock(map, -1, HY + 2, 2, COLORS.BLUE_EYEBROW)
        setBlock(map, 1, HY + 2, 2, COLORS.BLUE_EYEBROW)

        // --- 身体 (军装风格) ---
        const uniformBlue = COLORS.UNIFORM_BLUE // 蓝色军装
        const uniformGold = COLORS.GOLD // 金色装饰

        // 躯干
        for (let y = 7; y < 11; y++) {
            for (let x = -1; x <= 1; x++) {
                setBlock(map, x, y, 0, uniformBlue)
            }
        }

        // 肩章 (金色)
        setBlock(map, -2, 10, 0, uniformGold)
        setBlock(map, 2, 10, 0, uniformGold)
        setBlock(map, -2, 9, 0, uniformGold)
        setBlock(map, 2, 9, 0, uniformGold)

        // 衣领和徽章
        setBlock(map, 0, 10, 1, uniformGold) // 胸前徽章
        setBlock(map, -1, 10, 1, uniformGold)
        setBlock(map, 1, 10, 1, uniformGold)

        // 腰带
        setBlock(map, -2, 6, 0, uniformGold)
        setBlock(map, -1, 6, 0, uniformGold)
        setBlock(map, 0, 6, 0, uniformGold)
        setBlock(map, 1, 6, 0, uniformGold)
        setBlock(map, 2, 6, 0, uniformGold)

        // --- 手臂和手部 ---
        // 手臂
        for (let y = 7; y < 10; y++) {
            setBlock(map, -2, y, 0, uniformBlue)
            setBlock(map, 2, y, 0, uniformBlue)
        }

        // 手部
        setBlock(map, -2, 6, 0, 0xffccaa)
        setBlock(map, 2, 6, 0, 0xffccaa)

        // 武器 - 闪电效果
        // 左手闪电
        const lightningColor = COLORS.CYAN
        setBlock(map, -3, 6, 0, lightningColor)
        setBlock(map, -4, 6, -1, lightningColor)
        setBlock(map, -5, 5, -1, lightningColor)
        setBlock(map, -4, 5, 0, lightningColor)

        // --- 腿部和靴子 ---
        // 腿部
        for (let y = 3; y < 6; y++) {
            setBlock(map, -1, y, 0, uniformBlue)
            setBlock(map, 1, y, 0, uniformBlue)
        }

        // 靴子 (蓝色带金色装饰)
        for (let y = 0; y < 3; y++) {
            setBlock(map, -1, y, 0, uniformBlue)
            setBlock(map, 1, y, 0, uniformBlue)
        }
        // 靴子金色装饰
        setBlock(map, -1, 2, 1, uniformGold)
        setBlock(map, 1, 2, 1, uniformGold)

        // --- 裙子/军装下摆 ---
        for (let x = -2; x <= 2; x++)
            for (let z = -1; z <= 1; z++) {
                setBlock(map, x, 6, z, uniformBlue)
            }

        return Array.from(map.values())
    },

    // 武器模型 - 辉珀刃 (参考图片)
    LiseWeapon: (): VoxelData[] => {
        const map = new Map<string, VoxelData>()
        const cx = 0,
            cz = 0

        // Handle (Blue)
        for (let y = -4; y < 2; y++) {
            setBlock(map, cx, y, cz, COLORS.UNIFORM_BLUE)
        }

        // Guard/Base (White/Gold/Blue)
        // Ornate guard shape
        setBlock(map, cx, 2, cz, COLORS.SILVER)
        setBlock(map, cx, 3, cz, COLORS.GOLD) // Center gem/ring base
        setBlock(map, cx, 3, cz + 1, COLORS.CYAN) // Gem

        // Winged guard structure
        setBlock(map, cx - 1, 3, cz, COLORS.SILVER)
        setBlock(map, cx + 1, 3, cz, COLORS.SILVER)
        setBlock(map, cx - 1, 4, cz, COLORS.SILVER)
        setBlock(map, cx + 1, 4, cz, COLORS.SILVER)
        setBlock(map, cx - 2, 5, cz, COLORS.SILVER)
        setBlock(map, cx + 2, 5, cz, COLORS.SILVER)

        // Shaft (Silver spiraling with gems)
        for (let y = 4; y < 16; y++) {
            setBlock(map, cx, y, cz, COLORS.SILVER)

            // Spiral detail / Segmentation
            const phase = y % 3
            if (phase === 0) {
                // Bulge/Segment
                setBlock(map, cx + 1, y, cz, COLORS.WHITE)
                setBlock(map, cx - 1, y, cz, COLORS.WHITE)
                setBlock(map, cx, y, cz + 1, COLORS.WHITE)
                setBlock(map, cx, y, cz - 1, COLORS.WHITE)
                // Small gems embedded
                if (y % 6 === 0) setBlock(map, cx, y, cz + 1, COLORS.CYAN)
            }
        }

        // Tip (Sharp, tapering)
        for (let y = 16; y < 22; y++) {
            setBlock(map, cx, y, cz, COLORS.SILVER)
        }
        // Very tip
        setBlock(map, cx, 22, cz, COLORS.CYAN)

        return Array.from(map.values())
    },

    // 基础怪物 - 机械卫兵
    RobotGuard: (level: number): VoxelData[] => {
        const map = new Map<string, VoxelData>()
        const color = level > 50 ? COLORS.RED : 0x555555
        const eyeColor = level > 50 ? COLORS.YELLOW : COLORS.RED

        // Wheel/Base
        for (let x = -2; x <= 2; x++)
            for (let z = -2; z <= 2; z++) {
                if (Math.abs(x) + Math.abs(z) < 4) setBlock(map, x, 0, z, COLORS.DARK_GRAY)
            }

        // Body
        for (let y = 1; y < 8; y++) {
            for (let x = -2; x <= 2; x++)
                for (let z = -2; z <= 2; z++) {
                    if (Math.abs(x) < 2 || Math.abs(z) < 2) setBlock(map, x, y, z, color)
                }
        }

        // Eye
        setBlock(map, 0, 6, 2, eyeColor)
        setBlock(map, -1, 6, 2, eyeColor)
        setBlock(map, 1, 6, 2, eyeColor)

        // Arms
        for (let y = 3; y < 6; y++) {
            setBlock(map, -3, y, 0, COLORS.GRAY)
            setBlock(map, 3, y, 0, COLORS.GRAY)
        }

        return Array.from(map.values())
    },

    // 弹射物
    Projectile: (): VoxelData[] => {
        return [
            { x: 0, y: 0, z: 0, color: COLORS.CYAN },
            { x: 0, y: 0, z: -1, color: COLORS.WHITE },
            { x: 0, y: 0, z: 1, color: COLORS.WHITE },
            { x: -1, y: 0, z: 0, color: COLORS.WHITE },
            { x: 1, y: 0, z: 0, color: COLORS.WHITE },
        ]
    },
}
