import type { InputState } from "../types"

/**
 * 输入系统回调接口
 */
export interface InputCallbacks {
    onMeleeAttack: () => void
    onRangedAttack: () => void
    onSkillE: () => void
    onSkillQ: () => void
}

/**
 * 输入系统 - 处理键盘和鼠标输入
 */
export class InputSystem {
    /**
     * 设置事件监听器
     */
    static setupListeners(canvas: HTMLCanvasElement, inputState: InputState, callbacks: InputCallbacks): () => void {
        // 键盘按下事件
        const handleKeyDown = (e: KeyboardEvent) => {
            inputState.keys[e.key] = true

            // 技能键 E
            if (e.key === "e" || e.key === "E") {
                callbacks.onSkillE()
            }

            // 技能键 Q
            if (e.key === "q" || e.key === "Q") {
                callbacks.onSkillQ()
            }
        }

        // 键盘抬起事件
        const handleKeyUp = (e: KeyboardEvent) => {
            inputState.keys[e.key] = false
        }

        // 鼠标移动事件
        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect()
            inputState.mousePosition = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            }
        }

        // 鼠标按下事件
        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 0) {
                // 左键 - 近战攻击
                inputState.isMouseDown.left = true
                callbacks.onMeleeAttack()
            }
            if (e.button === 2) {
                // 右键 - 远程攻击
                inputState.isMouseDown.right = true
                callbacks.onRangedAttack()
            }
        }

        // 鼠标抬起事件
        const handleMouseUp = (e: MouseEvent) => {
            if (e.button === 0) {
                inputState.isMouseDown.left = false
            }
            if (e.button === 2) {
                inputState.isMouseDown.right = false
            }
        }

        // 禁用右键菜单
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
        }

        // 注册事件监听器
        window.addEventListener("keydown", handleKeyDown)
        window.addEventListener("keyup", handleKeyUp)
        canvas.addEventListener("mousemove", handleMouseMove)
        canvas.addEventListener("mousedown", handleMouseDown)
        window.addEventListener("mouseup", handleMouseUp)
        canvas.addEventListener("contextmenu", handleContextMenu)

        // 返回清理函数
        return () => {
            window.removeEventListener("keydown", handleKeyDown)
            window.removeEventListener("keyup", handleKeyUp)
            canvas.removeEventListener("mousemove", handleMouseMove)
            canvas.removeEventListener("mousedown", handleMouseDown)
            window.removeEventListener("mouseup", handleMouseUp)
            canvas.removeEventListener("contextmenu", handleContextMenu)
        }
    }
}
