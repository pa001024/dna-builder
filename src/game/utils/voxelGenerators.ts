/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
    // 黎瑟 (Lise) - 闪电风格的角色
    Lise: (): VoxelData[] => {
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
            setBlock(map, -1, y, 0, 0xffccaa)
            setBlock(map, 1, y, 0, 0xffccaa)
        }

        // Skirt/Shorts (Dark Purple/Black)
        for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) setBlock(map, x, 6, z, 0x330033)

        // Torso (White Shirt + Jacket)
        for (let y = 7; y < 11; y++) {
            for (let x = -1; x <= 1; x++) setBlock(map, x, y, 0, COLORS.WHITE)
        }
        // Jacket Open
        for (let y = 7; y < 10; y++) {
            setBlock(map, -2, y, 0, 0x330033)
            setBlock(map, 2, y, 0, 0x330033)
        }

        // Head
        const HY = 12
        for (let x = -2; x <= 2; x++)
            for (let y = 0; y < 4; y++)
                for (let z = -2; z <= 2; z++) {
                    setBlock(map, x, HY + y, z, 0xffccaa)
                }

        // Hair (Silver/Blue)
        const hairColor = 0xccccff
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
        setBlock(map, -1, HY + 1, 2, 0x00ffff)
        setBlock(map, 1, HY + 1, 2, 0x00ffff)

        // Halo/Accessory
        setBlock(map, -3, HY + 5, 0, COLORS.GOLD)
        setBlock(map, 3, HY + 5, 0, COLORS.GOLD)

        // Weapon: Floating Drones (Visual only, logic separate)
        setBlock(map, -4, 8, 2, 0x888888)
        setBlock(map, 4, 8, 2, 0x888888)

        return Array.from(map.values())
    },

    // 基础怪物 - 机械卫兵
    RobotGuard: (level: number): VoxelData[] => {
        const map = new Map<string, VoxelData>()
        const color = level > 50 ? 0xff0000 : 0x555555
        const eyeColor = level > 50 ? 0xffff00 : 0xff0000

        // Wheel/Base
        for (let x = -2; x <= 2; x++)
            for (let z = -2; z <= 2; z++) {
                if (Math.abs(x) + Math.abs(z) < 4) setBlock(map, x, 0, z, 0x222222)
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
            setBlock(map, -3, y, 0, 0x888888)
            setBlock(map, 3, y, 0, 0x888888)
        }

        return Array.from(map.values())
    },

    // 弹射物
    Projectile: (): VoxelData[] => {
        return [
            { x: 0, y: 0, z: 0, color: 0x00ffff },
            { x: 0, y: 0, z: -1, color: 0xffffff },
            { x: 0, y: 0, z: 1, color: 0xffffff },
            { x: -1, y: 0, z: 0, color: 0xffffff },
            { x: 1, y: 0, z: 0, color: 0xffffff },
        ]
    },
}
