import type { TitleFrameLayer } from "../title-frame/title-frame"

export function headFramePulse(layer: TitleFrameLayer, timeMs: number): number {
    const speed = layer.params?.SinSpeed
    const minimum = layer.params?.MinColor
    if (typeof speed !== "number" || typeof minimum !== "number") return 1
    return minimum + (1 - minimum) * (Math.sin((timeMs / 1000) * speed * Math.PI * 2) * 0.5 + 0.5)
}

export function headFrameUv(layer: TitleFrameLayer, prefix: string, timeMs: number) {
    const params = layer.params ?? {}
    const number = (name: string, fallback = 0): number => (typeof params[name] === "number" ? params[name] : fallback)
    const time = timeMs / 1000
    const scale = Math.max(0.001, number(`${prefix}_Scale`, 1))
    const tilingX = Math.max(0.001, number(`${prefix}_U_Tiling`, 1) / scale)
    const tilingY = Math.max(0.001, number(`${prefix}_V_Tiling`, 1) / scale)
    return {
        size: `${100 / tilingX}% ${100 / tilingY}%`,
        position: `${-(number(`${prefix}_U_Offset`) + number(`${prefix}_U_Speed`) * time) * layer.width}px ${-(number(`${prefix}_V_Offset`) + number(`${prefix}_V_Speed`) * time) * layer.height}px`,
        rotation: (number(`${prefix}_Rotation`) + number(`${prefix}_RotationSpeed`) * time) * 360,
    }
}
