<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watchEffect } from "vue"

//#region UI
import { useUIStore } from "../store/ui"

const ui = useUIStore()

// 工具类型定义
type ToolType = "select" | "brush" | "delete"

// 内容块接口定义
interface TimelineItem {
    id: string
    trackIndex: number
    startTime: number
    duration: number
    label: string
    color: string
    lv?: number
    props?: any
    isSelected: boolean
}

// 血量曲线点接口定义
interface HealthPoint {
    id: string
    time: number
    value: number
}

// 时间轨道接口定义
interface TimelineTrack {
    id: string
    index: number
    name: string
}

// 状态管理
const currentTool = ref<ToolType>("select")
const tracks = reactive<TimelineTrack[]>([
    {
        id: "track-0",
        index: 0,
        name: "技能",
    },
    {
        id: "track-1",
        index: 1,
        name: "BUFF",
    },
])
const trackHeight = ref(60)
const items = reactive<TimelineItem[]>([])
const healthPoints = reactive<HealthPoint[]>([])
const isDragging = ref(false)
const currentDragPreview = ref<HTMLElement | null>(null)
const dragOffset = reactive({ x: 0, y: 0 })
const selectedItems = reactive<TimelineItem[]>([])
const isSelecting = ref(false)
const selectionStart = reactive({ x: 0, y: 0 })
const selectionEnd = reactive({ x: 0, y: 0 })
const dragStartTime = ref(0)
const dragStartTrackIndex = ref(0)
const isMovingBetweenTracks = ref(false)
const hoveredItemId = ref<string | null>(null)
const timelineScale = ref(100) // 每个时间单位的像素数
const timelineStartTime = ref(0)
const timelineEndTime = ref(300) // 默认5分钟时间轴
const isBuff = ref(false)
const showHealthCurve = ref(true) // 是否显示血量曲线

// 轨道编辑状态
const editingTrackIndex = ref<number>(-1)
const editTrackName = ref<string>("")

// 血量曲线编辑状态
const isDraggingHealthPoint = ref(false)
const dragHealthPointIndex = ref(-1)

// 血量曲线悬停状态
const isHovering = ref(false)
const hoverX = ref(0)
const hoverY = ref(0)
const tooltipX = ref(0)
const tooltipY = ref(0)
const hoverTime = ref(0)
const hoverHealthValue = ref(0)
const chartHeight = ref(80) // 图表高度
const padding = ref(0)

// 血量曲线容器引用
const healthCurveContainerRef = ref<HTMLElement | null>(null)

// 工具选择方法
const selectTool = (tool: ToolType) => {
    currentTool.value = tool
    // 清除选择状态
    selectedItems.forEach(item => {
        const found = items.find(i => i.id === item.id)
        if (found) found.isSelected = false
    })
    selectedItems.length = 0
}

// 添加新轨道
const addTrack = (name?: string) => {
    try {
        // 输入参数验证
        if (name !== undefined && typeof name !== "string") {
            console.error("添加轨道失败：轨道名称必须是字符串类型")
            return -1
        }

        // 限制轨道数量，防止性能问题
        const MAX_TRACKS = 50
        if (tracks.length >= MAX_TRACKS) {
            ui.showErrorMessage(`轨道数量已达到上限 (${MAX_TRACKS})，无法添加更多轨道！`)
            return -1
        }

        const newIndex = tracks.length
        const trackNumber = newIndex + 1

        // 验证名称唯一性
        const trackName = name?.trim() || `轨道 ${trackNumber}`
        const nameExists = tracks.some(track => track.name === trackName)

        if (nameExists) {
            ui.showErrorMessage(`轨道名称 "${trackName}" 已存在，请使用其他名称！`)
            return -1
        }

        // 添加新轨道
        tracks.push({
            id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 增强ID唯一性
            index: newIndex,
            name: trackName,
        })

        // 自动选中新添加的轨道
        selectedTrackIndex.value = newIndex

        return newIndex // 返回新轨道的索引
    } catch (error) {
        console.error("添加轨道过程中发生错误:", error)
        ui.showErrorMessage("添加轨道失败，请重试")
        return -1
    }
}

// 删除轨道
const removeTrack = (trackIndex: number) => {
    try {
        // 输入参数验证
        if (typeof trackIndex !== "number" || trackIndex < 0 || trackIndex >= tracks.length) {
            console.error("删除轨道失败：无效的轨道索引", trackIndex)
            return false
        }

        if (tracks.length <= 1) {
            ui.showErrorMessage("不能删除最后一个轨道！")
            return false // 至少保留一条轨道
        }

        // 删除该轨道上的所有项目
        const filteredItems = items.filter(item => item.trackIndex !== trackIndex)
        items.splice(0, items.length, ...filteredItems)

        // 重新排序剩余轨道
        tracks.splice(trackIndex, 1)
        tracks.forEach((track, index) => {
            track.index = index
        })

        // 更新所有轨道索引大于被删除轨道的项目
        items.forEach(item => {
            if (item.trackIndex > trackIndex) {
                item.trackIndex--
            }
        })

        // 清除选中轨道
        if (selectedTrackIndex.value === trackIndex) {
            selectedTrackIndex.value = -1
        } else if (selectedTrackIndex.value > trackIndex) {
            selectedTrackIndex.value--
        }

        return true
    } catch (error) {
        console.error("删除轨道过程中发生错误:", error)
        ui.showErrorMessage("删除轨道失败，请重试")
        return false
    }
}

// 重命名轨道
const renameTrack = (trackIndex: number, newName: string) => {
    try {
        // 输入参数验证
        if (typeof trackIndex !== "number") {
            console.error("重命名轨道失败：轨道索引必须是数字类型")
            return false
        }

        if (typeof newName !== "string") {
            console.error("重命名轨道失败：轨道名称必须是字符串类型")
            return false
        }

        if (trackIndex < 0 || trackIndex >= tracks.length) {
            console.error("重命名轨道失败：轨道索引超出有效范围")
            return false
        }

        // 验证名称
        const trimmedName = newName.trim()
        if (!trimmedName) {
            ui.showErrorMessage("轨道名称不能为空！")
            return false
        }

        // 限制名称长度
        if (trimmedName.length > 30) {
            ui.showErrorMessage("轨道名称不能超过30个字符！")
            return false
        }

        // 检查名称是否重复
        const nameExists = tracks.some((track, idx) => idx !== trackIndex && track.name === trimmedName)

        if (nameExists) {
            ui.showErrorMessage("已存在相同名称的轨道！")
            return false
        }

        tracks[trackIndex].name = trimmedName
        return true
    } catch (error) {
        console.error("重命名轨道过程中发生错误:", error)
        ui.showErrorMessage("重命名轨道失败，请重试")
        return false
    }
}

// 开始编辑轨道名称
const startEditTrackName = (trackIndex: number, event: MouseEvent) => {
    event.stopPropagation()
    editingTrackIndex.value = trackIndex
    editTrackName.value = tracks[trackIndex].name

    // 下一个事件循环聚焦输入框
    setTimeout(() => {
        const input = document.querySelector(`#track-name-input-${trackIndex}`) as HTMLInputElement
        if (input) {
            input.focus()
            input.select()
        }
    }, 0)
}

// 完成编辑轨道名称
const finishEditTrackName = () => {
    if (editingTrackIndex.value >= 0) {
        renameTrack(editingTrackIndex.value, editTrackName.value)
    }
    editingTrackIndex.value = -1
}

// 向上移动轨道
const moveTrackUp = (trackIndex: number) => {
    if (trackIndex <= 0)
        return // 已经是第一个轨道
        // 交换轨道
    ;[tracks[trackIndex], tracks[trackIndex - 1]] = [tracks[trackIndex - 1], tracks[trackIndex]]

    // 更新轨道索引
    tracks[trackIndex].index = trackIndex
    tracks[trackIndex - 1].index = trackIndex - 1

    // 更新轨道上的项目索引
    items.forEach(item => {
        if (item.trackIndex === trackIndex) {
            item.trackIndex = trackIndex - 1
        } else if (item.trackIndex === trackIndex - 1) {
            item.trackIndex = trackIndex
        }
    })

    // 更新选中轨道索引
    if (selectedTrackIndex.value === trackIndex) {
        selectedTrackIndex.value = trackIndex - 1
    } else if (selectedTrackIndex.value === trackIndex - 1) {
        selectedTrackIndex.value = trackIndex
    }
}

// 向下移动轨道
const moveTrackDown = (trackIndex: number) => {
    if (trackIndex >= tracks.length - 1)
        return // 已经是最后一个轨道
        // 交换轨道
    ;[tracks[trackIndex], tracks[trackIndex + 1]] = [tracks[trackIndex + 1], tracks[trackIndex]]

    // 更新轨道索引
    tracks[trackIndex].index = trackIndex
    tracks[trackIndex + 1].index = trackIndex + 1

    // 更新轨道上的项目索引
    items.forEach(item => {
        if (item.trackIndex === trackIndex) {
            item.trackIndex = trackIndex + 1
        } else if (item.trackIndex === trackIndex + 1) {
            item.trackIndex = trackIndex
        }
    })

    // 更新选中轨道索引
    if (selectedTrackIndex.value === trackIndex) {
        selectedTrackIndex.value = trackIndex + 1
    } else if (selectedTrackIndex.value === trackIndex + 1) {
        selectedTrackIndex.value = trackIndex
    }
}

// 生成唯一ID
const generateId = () => {
    return "item-" + Date.now() + "-" + Math.random().toString(36).substring(2)
}

const randomColor = (() => {
    const colors = ["#3b82f6", "#ef4444", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"]
    const gen = (function* () {
        while (true) {
            for (const color of colors) {
                yield color
            }
        }
    })()
    return () => gen.next().value
})()

// 在指定位置添加项目
const addItem = (trackIndex: number, startTime: number, duration = 1, name?: string, lv?: number) => {
    // 确保开始时间不为负数，持续时间至少为0.1
    const validStartTime = Math.max(timelineStartTime.value, Math.floor(startTime))
    const validDuration = Math.max(0.1, Math.floor(duration))

    if (!name) {
        name = isBuff.value ? selectedBuff.value : targetFunction.value ? `${baseName.value}::${targetFunction.value}` : baseName.value
    }
    if (!lv && isBuff.value) {
        lv = Math.max(1, Math.min(selectedBuffLv.value, selectedBuffMaxLv.value))
    }

    const newItem: TimelineItem = {
        id: generateId(),
        trackIndex,
        startTime: validStartTime,
        duration: validDuration,
        label: name,
        color: randomColor(),
        isSelected: true,
    }
    if (lv) {
        newItem.lv = lv
        newItem.props = new LeveledBuff(name, lv).getProperties()
    } else {
        const [base] = name.split("::")
        const attr = charBuild.value.calculateAttributes()
        const skill = charBuild.value.allSkills.find(s => s.名称 === base)
        if (skill) {
            const fields = skill.getFieldsWithAttr(attr) || []
            newItem.props = fields
            // 处理召唤物
            if (skill.召唤物持续时间) {
                const v = fields.find(f => /召唤物.*持续时间/.test(f.名称))
                newItem.duration = v?.值 || 1
            }
        } else {
            console.warn(`未找到技能 ${base}`)
        }
    }

    // 清除之前的选择
    selectedItems.forEach(item => {
        const found = items.find(i => i.id === item.id)
        if (found) found.isSelected = false
    })
    selectedItems.length = 0

    items.push(newItem)
    selectedItems.push(newItem)
    return newItem
}

// 准备删除项目
const prepareDeleteItem = (item: TimelineItem) => {
    // 添加视觉标记，表示即将删除
    const element = document.querySelector(`[data-id="${item.id}"]`) as HTMLElement
    if (element) {
        // 保存原始样式以便后续恢复
        // element.style.transition = "all 0.2s ease"
        element.classList.add("animate-zoomOut")
    }

    // 动画结束后移除元素
    element.addEventListener("animationend", confirmDeleteItem)
    // 确认删除
    function confirmDeleteItem() {
        try {
            if (!item) {
                console.warn("删除确认时未找到要删除的项目")
                return
            }

            const itemId = item.id
            const index = items.findIndex(i => i.id === itemId)

            if (index !== -1) {
                // 从选中列表中移除
                const selectedIndex = selectedItems.findIndex(i => i.id === itemId)
                if (selectedIndex !== -1) {
                    selectedItems.splice(selectedIndex, 1)
                }

                const currentIndex = items.findIndex(i => i.id === itemId)
                if (currentIndex !== -1) {
                    items.splice(currentIndex, 1)
                }
            }
        } catch (error) {
            console.error("删除项目过程中发生错误:", error)
        }
    }
}

// 清除选择
const clearSelection = () => {
    try {
        selectedItems.forEach(item => {
            try {
                const found = items.find(i => i.id === item.id)
                if (found) found.isSelected = false
            } catch (itemErr) {
                console.warn("清除单个项目选中状态时出错:", itemErr)
            }
        })
        selectedItems.length = 0
    } catch (error) {
        console.error("清除选中状态时发生错误:", error)
    }
}

// 处理轨道点击
const handleTrackClick = (trackIndex: number, event?: MouseEvent) => {
    try {
        // 输入验证
        if (typeof trackIndex !== "number" || trackIndex < 0) {
            console.warn("无效的轨道索引:", trackIndex)
            return
        }

        // 如果正在编辑轨道名称，不处理点击事件
        if (editingTrackIndex.value !== -1) return

        if (event) {
            try {
                event.stopPropagation()
            } catch (e) {
                console.warn("停止事件冒泡时出错:", e)
            }
        }

        // 添加选择轨道的逻辑
        if (event && event.ctrlKey) {
            // 如果按住Ctrl键，切换轨道选中状态
            if (selectedTrackIndex.value === trackIndex) {
                selectedTrackIndex.value = -1
            } else {
                selectedTrackIndex.value = trackIndex
            }
        } else {
            // 单选模式
            selectedTrackIndex.value = trackIndex
        }

        // 清除内容块选择
        if (!isDragging.value && !isSelecting.value) {
            clearSelection()
        }
    } catch (error) {
        console.error("处理轨道点击时发生错误:", error)
    }
}

// 选中的轨道索引
const selectedTrackIndex = ref(0)

// 选择框相关变量
let selectionBaseElement = document.getElementById("track-content")!
let timelineContainer = document.getElementById("timeline-container")!

// 删除选中项目的函数
const deleteSelectedItems = () => {
    try {
        if (selectedItems.length === 0) {
            return // 没有选中的项目，直接返回
        }

        // 获取所有选中项目的ID
        const selectedIds = selectedItems.map(item => item.id)

        // 从items数组中过滤掉选中的项目
        const newItems = items.filter(item => !selectedIds.includes(item.id))

        // 清空原数组并添加剩余项目
        items.splice(0, items.length, ...newItems)

        // 清空选中状态
        clearSelection()
    } catch (error) {
        console.error("删除选中项目时发生错误:", error)
    }
}

// 键盘事件处理函数
const handleKeyDown = (event: KeyboardEvent) => {
    // 检查是否按下Delete或Backspace键
    if (event.key === "Delete" || event.key === "Backspace") {
        // 避免在输入框中删除文本时触发
        const target = event.target as HTMLElement
        if (!["INPUT", "TEXTAREA"].includes(target.tagName) && !target.isContentEditable) {
            event.preventDefault()
            deleteSelectedItems()
        }
    }
}

onMounted(() => {
    selectionBaseElement = document.getElementById("track-content")!
    timelineContainer = document.getElementById("timeline-container")!
    // IE9, Chrome, Safari, Opera
    timelineContainer.addEventListener("mousewheel", scrollHorizontally, false)
    // Firefox
    timelineContainer.addEventListener("DOMMouseScroll", scrollHorizontally, false)
    document.addEventListener("keydown", handleKeyDown)
})
onUnmounted(() => {
    // 移除事件监听器
    timelineContainer.removeEventListener("mousewheel", scrollHorizontally, false)
    timelineContainer.removeEventListener("DOMMouseScroll", scrollHorizontally, false)
    document.removeEventListener("keydown", handleKeyDown)
})

const scrollHorizontally = (event: any) => {
    try {
        event.preventDefault()
        const delta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail))
        const scrollLeft = timelineContainer.scrollLeft
        timelineContainer.scrollLeft = scrollLeft - delta * 40
    } catch (error) {
        console.error("水平滚动时发生错误:", error)
    }
}

// 开始框选
const startSelection = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (currentTool.value === "brush") {
        const rect = selectionBaseElement.getBoundingClientRect()
        // 计算相对于时间线内容区域的坐标，减去轨道名称区域的宽度(80px)
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top
        const trackIndex = Math.floor(mouseY / trackHeight.value)

        // 计算开始时间（基于时间刻度）
        const startTime = mouseX / timelineScale.value + timelineStartTime.value

        // 确保轨道索引有效
        if (trackIndex >= 0 && trackIndex < tracks.length) {
            // 添加新内容块，设置合理的默认持续时间（5秒）
            addItem(trackIndex, startTime, 1)
        }
        return
    }
    if (currentTool.value !== "select") return
    // 如果点击的是内容块、轨道标题或其他交互元素，不启动框选
    if (
        (event.target as HTMLElement).closest("[data-id]") ||
        (event.target as HTMLElement).closest(".track-header") ||
        (event.target as HTMLElement).closest(".toolbar")
    ) {
        return
    }
    isSelecting.value = true
    window.addEventListener("mouseup", endSelection)
    window.addEventListener("mousemove", updateSelection)

    const rect = selectionBaseElement.getBoundingClientRect()
    selectionStart.x = event.clientX - rect.left
    selectionStart.y = event.clientY - rect.top
    selectionEnd.x = selectionStart.x
    selectionEnd.y = selectionStart.y

    // 清除之前的选择
    if (!event.shiftKey) {
        selectedItems.forEach(item => {
            const found = items.find(i => i.id === item.id)
            if (found) found.isSelected = false
        })
        selectedItems.length = 0
    }

    // 改变鼠标样式
    document.body.classList.add("cursor-crosshair", "select-none")

    // 更新框选区域
    function updateSelection(event: MouseEvent) {
        if (!isSelecting.value || !selectionBaseElement) return

        // 始终使用同一个基准元素来计算相对坐标，确保一致性
        const rect = selectionBaseElement.getBoundingClientRect()
        selectionEnd.x = event.clientX - rect.left
        selectionEnd.y = event.clientY - rect.top
    }

    // 完成框选
    function endSelection(event: MouseEvent) {
        if (!isSelecting.value || !selectionBaseElement) return

        isSelecting.value = false
        // 使用同一个基准元素计算坐标
        const rect = selectionBaseElement.getBoundingClientRect()
        selectionEnd.x = event.clientX - rect.left
        selectionEnd.y = event.clientY - rect.top

        // 计算选择框的实际边界
        const minX = Math.min(selectionStart.x, selectionEnd.x)
        const maxX = Math.max(selectionStart.x, selectionEnd.x)
        const minY = Math.min(selectionStart.y, selectionEnd.y)
        const maxY = Math.max(selectionStart.y, selectionEnd.y)

        if (!event.shiftKey) {
            // 如果不是按住Shift多选，先清除其他选择
            selectedItems.forEach(i => {
                i.isSelected = false
            })
            selectedItems.length = 0
        }
        // 检查每个项目是否在选择框内
        items.forEach(item => {
            const itemTop = item.trackIndex * trackHeight.value // 20px 轨道名称区域
            const itemLeft = (item.startTime - timelineStartTime.value) * timelineScale.value
            const itemBottom = itemTop + trackHeight.value // 项目高度
            const itemRight = itemLeft + item.duration * timelineScale.value

            // 精确的碰撞检测，考虑重叠面积
            const overlapLeft = Math.max(itemLeft, minX)
            const overlapTop = Math.max(itemTop, minY)
            const overlapRight = Math.min(itemRight, maxX)
            const overlapBottom = Math.min(itemBottom, maxY)

            const overlapWidth = Math.max(0, overlapRight - overlapLeft)
            const overlapHeight = Math.max(0, overlapBottom - overlapTop)
            const overlapArea = overlapWidth * overlapHeight

            const isIntersecting = overlapArea > 0
            if (isIntersecting) {
                // 添加到选中列表
                if (!item.isSelected) {
                    item.isSelected = true
                    selectedItems.push(item)
                }
            }
        })

        // 恢复鼠标样式
        document.body.classList.remove("cursor-crosshair", "select-none")
        document.removeEventListener("mouseup", endSelection)
        document.removeEventListener("mousemove", updateSelection)
    }
}

// 开始调整项目大小
const startResize = (event: MouseEvent, item: TimelineItem, side: "left" | "right") => {
    event.preventDefault()

    const resizingItem = item
    const resizeSide = side
    const resizeStartPos = { x: event.clientX, y: event.clientY }
    const resizeStartValues = {
        startTime: item.startTime,
        duration: item.duration,
    }

    // 添加事件监听器
    window.addEventListener("mousemove", handleResize)
    window.addEventListener("mouseup", stopResize)

    // 防止文本选择
    document.body.classList.add("cursor-col-resize", "select-none")

    // 处理调整大小过程
    function handleResize(event: MouseEvent) {
        if (!resizingItem) return

        const mouseX = event.clientX
        const pixelDiff = mouseX - resizeStartPos.x
        const timeDiff = pixelDiff / timelineScale.value

        // 查找项目在原始数组中的引用
        const itemRef = items.find(i => i.id === resizingItem.id)
        if (!itemRef) return

        if (resizeSide === "left") {
            // 调整左侧（开始时间）
            const newStartTime = Math.max(0, resizeStartValues.startTime + timeDiff)
            const newDuration = resizeStartValues.duration - timeDiff

            // 确保持续时间为正
            if (newDuration > 0.1) {
                itemRef.startTime = +newStartTime.toFixed(3)
                itemRef.duration = +newDuration.toFixed(3)
            }
        } else if (resizeSide === "right") {
            // 调整右侧（结束时间/持续时间）
            const newDuration = Math.max(0.1, resizeStartValues.duration + timeDiff)
            itemRef.duration = +newDuration.toFixed(3)
        }
    }

    // 停止调整大小
    function stopResize() {
        // 移除事件监听器
        window.removeEventListener("mousemove", handleResize)
        window.removeEventListener("mouseup", stopResize)

        // 移除拖拽样式
        document.body.classList.remove("cursor-col-resize", "select-none")
    }
}

// 开始拖拽项目
const startDrag = (event: MouseEvent, item: TimelineItem) => {
    if (event.button !== 0) return
    // 删除工具不能拖拽
    if (currentTool.value === "delete") {
        event.preventDefault()
        return
    }

    if (selectedItems.length === 0) {
        item.isSelected = true
        selectedItems.push(item)
    } else {
        // 按住Shift选择多个项目
        if (event.shiftKey) {
            if (!item.isSelected) {
                item.isSelected = true
                selectedItems.push(item)
            }
        } else if (!item.isSelected) {
            // 如果不是多选模式，确保只有当前项被选中
            selectedItems.forEach(selected => {
                const found = items.find(i => i.id === selected.id)
                if (found) found.isSelected = false
            })
            selectedItems.length = 0
            item.isSelected = true
            selectedItems.push(item)
        }
    }

    isDragging.value = true
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffset.x = event.clientX - rect.left
    dragOffset.y = event.clientY - rect.top
    dragStartTime.value = item.startTime
    dragStartTrackIndex.value = item.trackIndex
    isMovingBetweenTracks.value = false

    const startX = event.clientX
    const startY = event.clientY
    let endX = event.clientX
    let endY = event.clientY
    // 注册全局事件监听器
    window.addEventListener("mouseup", stopDrag)
    window.addEventListener("mouseleave", stopDrag)
    window.addEventListener("contextmenu", stopDrag)
    window.addEventListener("mousemove", updateDragPreview)

    // 创建拖拽预览
    const itemElement = event.currentTarget as HTMLElement
    if (itemElement) {
        document.getElementById("drag-preview")?.remove()
        const dragPreview = itemElement.cloneNode(true) as HTMLElement
        dragPreview.id = "drag-preview"
        dragPreview.style.position = "absolute"
        dragPreview.style.pointerEvents = "none"
        dragPreview.style.opacity = "0.7"
        dragPreview.style.zIndex = "1000"
        dragPreview.style.width = `${itemElement.offsetWidth}px`
        dragPreview.style.height = `${itemElement.offsetHeight}px`
        dragPreview.style.left = `${event.clientX - dragOffset.x}px`
        dragPreview.style.top = `${event.clientY - dragOffset.y}px`
        document.body.appendChild(dragPreview)
        // 使用响应式变量存储预览元素引用，以便后续清理
        currentDragPreview.value = dragPreview
    }

    // 防止文本选择
    event.preventDefault()

    // 添加拖拽样式
    document.body.classList.add("cursor-move", "select-none")

    // 更新拖拽预览位置
    function updateDragPreview(event: MouseEvent) {
        try {
            // 记录最新的鼠标位置
            endX = event.clientX
            endY = event.clientY

            // 确保拖拽预览元素存在并且是有效的DOM元素
            if (currentDragPreview.value && document.body.contains(currentDragPreview.value)) {
                // 实时更新拖拽预览的位置，确保以鼠标指针为中心
                // const halfWidth = Math.floor(currentDragPreview.value.offsetWidth / 2)
                // const halfHeight = Math.floor(currentDragPreview.value.offsetHeight / 2)
                currentDragPreview.value.style.left = `${event.clientX - dragOffset.x}px`
                currentDragPreview.value.style.top = `${event.clientY - dragOffset.y}px`
            }
        } catch (error) {
            console.warn("更新拖拽预览位置时发生错误:", error)
            // 发生错误时立即终止拖拽
            stopDrag()
        }
    }

    // 停止拖拽项目
    function stopDrag() {
        try {
            // 如果是拖拽状态，更新项目位置
            if (isDragging.value && selectedItems.length > 0) {
                // 获取时间线元素以计算相对坐标
                const timelineElement = selectionBaseElement
                if (timelineElement) {
                    // 更新每个选中的项目
                    selectedItems.forEach(item => {
                        // 计算新的轨道索引
                        const newTrackIndex = Math.max(
                            0,
                            Math.min(tracks.length - 1, item.trackIndex + Math.floor((endY - startY) / trackHeight.value))
                        )

                        // 计算新的开始时间
                        const newStartTime = item.startTime + (endX - startX) / timelineScale.value

                        // 查找项目在原始数组中的引用
                        const itemRef = items.find(i => i.id === item.id)
                        if (itemRef) {
                            itemRef.trackIndex = newTrackIndex

                            // 确保开始时间不为负数
                            itemRef.startTime = +Math.max(0, newStartTime).toFixed(3)
                        }
                    })
                }
            }

            // 清理拖拽预览元素
            if (currentDragPreview.value && currentDragPreview.value.parentNode) {
                currentDragPreview.value.parentNode.removeChild(currentDragPreview.value)
                currentDragPreview.value = null
            }

            // 重置拖拽状态
            isDragging.value = false
            isMovingBetweenTracks.value = false

            // 移除拖拽样式
            document.body.classList.remove("cursor-move", "select-none")

            // 移除事件监听器，防止内存泄漏
            window.removeEventListener("mouseup", stopDrag)
            window.removeEventListener("mouseleave", stopDrag)
            window.removeEventListener("contextmenu", stopDrag)
            window.removeEventListener("mousemove", updateDragPreview)
        } catch (error) {
            console.warn("清理拖拽状态时发生错误:", error)
        }
    }
}

const zoomLevel = ref(1) // 缩放级别

// 缩放级别配置
const zoomLevels = [
    { level: 0.25, pixelsPerSecond: 25 }, // 50px/s
    { level: 0.5, pixelsPerSecond: 50 }, // 50px/s
    { level: 1, pixelsPerSecond: 100 }, // 100px/s
    { level: 2, pixelsPerSecond: 200 }, // 200px/s
    { level: 4, pixelsPerSecond: 400 }, // 400px/s
    { level: 8, pixelsPerSecond: 800 }, // 800px/s
]

// 放大
const zoomIn = () => {
    const currentIndex = zoomLevels.findIndex(level => level.level === zoomLevel.value)
    if (currentIndex < zoomLevels.length - 1) {
        const nextLevel = zoomLevels[currentIndex + 1]
        zoomLevel.value = nextLevel.level
        timelineScale.value = nextLevel.pixelsPerSecond // 更新时间刻度比例
    }
}

// 缩小
const zoomOut = () => {
    const currentIndex = zoomLevels.findIndex(level => level.level === zoomLevel.value)
    if (currentIndex > 0) {
        const prevLevel = zoomLevels[currentIndex - 1]
        zoomLevel.value = prevLevel.level
        timelineScale.value = prevLevel.pixelsPerSecond // 更新时间刻度比例
    }
}

// 格式化时间显示
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    const hours = Math.floor(mins / 60)

    const remainingMinutes = mins % 60

    if (hours > 0) {
        return `${hours}:${remainingMinutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`
    }
    if (mins > 0) {
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`
    }
    return `${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`
}

const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    if (mins > 0) {
        return `${mins}:${secs}.${ms.toString().padStart(3, "0")}s`
    }
    if (ms === 0) {
        return `${secs}s`
    }
    return `${secs * 1000 + ms}ms`
}

// 计算血量曲线的SVG路径
const healthCurvePath = computed(() => {
    if (healthPoints.length === 0) return ""

    // 排序血量点
    const sortedPoints = [...healthPoints].sort((a, b) => a.time - b.time)

    // 使用与模板相同的高度值
    const svgHeight = chartHeight.value

    // 生成路径
    let path = `M ${(sortedPoints[0].time - timelineStartTime.value) * timelineScale.value} ${svgHeight - (sortedPoints[0].value / 100) * svgHeight}`

    for (let i = 1; i < sortedPoints.length; i++) {
        const point = sortedPoints[i]
        const x = (point.time - timelineStartTime.value) * timelineScale.value
        const y = svgHeight - (point.value / 100) * svgHeight // 血量值映射到SVG高度范围
        path += ` L ${x} ${y}`
    }

    return path
})

// 计算血量曲线填充路径
const healthCurveFillPath = computed(() => {
    if (healthPoints.length === 0) return ""

    // 排序血量点
    const sortedPoints = [...healthPoints].sort((a, b) => a.time - b.time)
    const svgHeight = chartHeight.value
    const containerWidth = 300 * timelineScale.value

    const firstPoint = sortedPoints[0]
    const lastPoint = sortedPoints[sortedPoints.length - 1]

    // 计算第一个点和最后一个点的y坐标
    const firstY = svgHeight - (firstPoint.value / 100) * svgHeight
    const lastY = svgHeight - (lastPoint.value / 100) * svgHeight

    // 生成填充路径
    let path = ""

    if (sortedPoints.length === 1) {
        // 只有一个点时，生成水平线
        path = `M 0 ${firstY} L ${containerWidth} ${firstY}`
    } else {
        // 多个点时，从第一个点水平向左扩展到x=0，然后沿着曲线绘制，最后从最后一个点水平向右扩展到x=containerWidth
        path = `M 0 ${firstY} L ${(firstPoint.time - timelineStartTime.value) * timelineScale.value} ${firstY}`

        for (let i = 1; i < sortedPoints.length; i++) {
            const point = sortedPoints[i]
            const x = (point.time - timelineStartTime.value) * timelineScale.value
            const y = svgHeight - (point.value / 100) * svgHeight
            path += ` L ${x} ${y}`
        }

        path += ` L ${containerWidth} ${lastY}`
    }

    // 闭合路径
    path += ` L ${containerWidth} ${svgHeight} L 0 ${svgHeight} Z`

    return path
})

// 添加血量点
const addHealthPoint = (time: number, value: number) => {
    // 确保血量值在0-100范围内
    const validValue = Math.max(0, Math.min(100, value))
    const validTime = Math.max(timelineStartTime.value, Math.min(timelineEndTime.value, time))

    healthPoints.push({
        id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        time: validTime,
        value: validValue,
    })
    // 按时间排序
    healthPoints.sort((a, b) => a.time - b.time)
}

// 清除血量曲线
const clearHealthCurve = () => {
    healthPoints.splice(0, healthPoints.length)
}

// 生成示例血量曲线
const generateSampleHealthCurve = () => {
    clearHealthCurve()
    // 生成一个简单的波动曲线
    for (let time = 0; time <= timelineEndTime.value; time += 5) {
        const value = 50 + 40 * Math.sin(time * 0.1) + Math.random() * 10
        addHealthPoint(time, value)
    }
}

// 处理鼠标进入
const handleHealthCurveMouseEnter = () => {
    isHovering.value = true
}

// 处理鼠标移动
const handleHealthCurveMouseMove = (event: MouseEvent) => {
    if (!healthCurveContainerRef.value) return

    const rect = healthCurveContainerRef.value.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    hoverX.value = x
    hoverY.value = y

    // 计算tooltip位置
    tooltipX.value = x + 10
    tooltipY.value = y - 10

    // 计算悬停位置对应的时间
    const containerWidth = rect.width
    const time = (x / containerWidth) * (timelineEndTime.value - timelineStartTime.value) + timelineStartTime.value
    hoverTime.value = time

    // 计算悬停位置对应的血量值
    // 找到最接近的两个点，计算插值
    if (healthPoints.length > 0) {
        // 按时间排序
        const sortedPoints = [...healthPoints].sort((a, b) => a.time - b.time)

        // 找到第一个时间大于悬停时间的点
        let index = sortedPoints.findIndex(point => point.time > time)

        if (index === 0) {
            // 悬停在第一个点之前
            hoverHealthValue.value = sortedPoints[0].value
        } else if (index === -1) {
            // 悬停在最后一个点之后
            hoverHealthValue.value = sortedPoints[sortedPoints.length - 1].value
        } else {
            // 计算两点之间的插值
            const prevPoint = sortedPoints[index - 1]
            const nextPoint = sortedPoints[index]
            const ratio = (time - prevPoint.time) / (nextPoint.time - prevPoint.time)
            hoverHealthValue.value = prevPoint.value + (nextPoint.value - prevPoint.value) * ratio
        }
    }
}

// 处理鼠标离开
const handleHealthCurveMouseLeave = () => {
    isHovering.value = false
}

// 开始拖动血量点
const startDragHealthPoint = (event: MouseEvent, index: number) => {
    event.preventDefault()
    event.stopPropagation() // 阻止事件冒泡，避免触发点击创建新节点
    isDraggingHealthPoint.value = true
    dragHealthPointIndex.value = index

    // 添加全局事件监听器
    window.addEventListener("mousemove", handleHealthPointMouseMove)
    window.addEventListener("mouseup", handleHealthPointMouseUp)
}

// 处理血量点拖动
const handleHealthPointMouseMove = (event: MouseEvent) => {
    if (!isDraggingHealthPoint.value || dragHealthPointIndex.value === -1) return

    // 使用血量曲线容器计算位置
    const healthElement = healthCurveContainerRef.value
    if (!healthElement) return

    const rect = healthElement.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const containerWidth = rect.width
    const containerHeight = rect.height || 80 // 使用实际容器高度，默认为80px

    // 计算时间和血量值
    const time = (x / containerWidth) * (timelineEndTime.value - timelineStartTime.value) + timelineStartTime.value
    const value = Math.max(0, Math.min(100, 100 - (y / containerHeight) * 100))

    // 获取当前拖动的点
    const draggedPoint = healthPoints[dragHealthPointIndex.value]
    // 更新点的时间和值
    draggedPoint.time = +time.toFixed(2)
    draggedPoint.value = Math.round(value)

    // 手动处理排序，确保dragHealthPointIndex始终指向正确的点
    let newIndex = dragHealthPointIndex.value

    // 向左移动（时间减小）
    while (newIndex > 0 && healthPoints[newIndex].time < healthPoints[newIndex - 1].time) {
        // 交换元素
        ;[healthPoints[newIndex], healthPoints[newIndex - 1]] = [healthPoints[newIndex - 1], healthPoints[newIndex]]
        newIndex--
    }

    // 向右移动（时间增加）
    while (newIndex < healthPoints.length - 1 && healthPoints[newIndex].time > healthPoints[newIndex + 1].time) {
        // 交换元素
        ;[healthPoints[newIndex], healthPoints[newIndex + 1]] = [healthPoints[newIndex + 1], healthPoints[newIndex]]
        newIndex++
    }

    // 更新dragHealthPointIndex到新位置
    dragHealthPointIndex.value = newIndex
}

// 结束拖动血量点
const handleHealthPointMouseUp = () => {
    isDraggingHealthPoint.value = false
    dragHealthPointIndex.value = -1

    // 移除全局事件监听器
    window.removeEventListener("mousemove", handleHealthPointMouseMove)
    window.removeEventListener("mouseup", handleHealthPointMouseUp)
}

// 处理点击添加血量点
const handleAddHealthPoint = (event: MouseEvent) => {
    // 如果正在拖动，不添加新节点
    if (isDraggingHealthPoint.value) {
        return
    }

    const target = event.currentTarget as HTMLElement
    if (!target) return

    // 检查事件是否来自血量点本身，避免点击血量点时添加新节点
    if ((event.target as HTMLElement).tagName === "circle") {
        return
    }

    const rect = target.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const time = (x / containerWidth) * (timelineEndTime.value - timelineStartTime.value) + timelineStartTime.value
    const value = Math.max(0, Math.min(100, 100 - (y / containerHeight) * 100))

    addHealthPoint(+time.toFixed(2), Math.round(value))
}

// 删除血量点
const deleteHealthPoint = (id: string) => {
    const index = healthPoints.findIndex(point => point.id === id)
    if (index !== -1) {
        healthPoints.splice(index, 1)
    }
}

// 计算可见刻度
const visibleTimeMarks = computed(() => {
    const marks = []
    // 以秒为单位，根据缩放级别调整刻度密度
    let step = 1 // 默认每秒一个刻度

    // 根据缩放级别智能调整刻度密度
    if (zoomLevel.value < 1) {
        step = 2 // 每5秒一个刻度
    } else if (zoomLevel.value > 2) {
        step = 0.5 // 每0.5秒一个刻度
    }

    const start = Math.floor(timelineStartTime.value / step) * step
    const end = Math.ceil(timelineEndTime.value / step) * step

    for (let time = start; time <= end; time += step) {
        // 确定主刻度和次刻度
        const isMajor = time % 5 === 0 // 每5秒一个主刻度
        marks.push({
            time,
            isMajor,
            position: (time - timelineStartTime.value) * timelineScale.value,
            // 格式化时间显示
            label: formatTime(time),
        })
    }

    return marks
})

// 重置视图
const resetView = () => {
    zoomLevel.value = 1
    timelineScale.value = 100 // 重置时间刻度比例
    timelineStartTime.value = 0
    timelineEndTime.value = 300
}

//#endregion
//#region 游戏
import { useLocalStorage } from "@vueuse/core"
import { groupBy } from "lodash-es"
import { useCharSettings } from "../composables/useCharSettings"
import { buffData, CharBuild, charData, LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../data"
import { useInvStore } from "../store/inv"
import { useTimeline } from "../store/timeline"
import { formatProp, formatSkillProp } from "../util"

const inv = useInvStore()
const charOptions = charData.map(char => ({ value: char.名称, label: char.名称, elm: char.属性, icon: LeveledChar.url(char.icon) }))
const selectedChar = useLocalStorage("selectedChar", "赛琪")
const charSettings = useCharSettings(selectedChar)
const baseName = ref(charSettings.value.baseName)
const targetFunction = ref("")
const charBuild = computed(() => {
    const char = new LeveledChar(selectedChar.value, charSettings.value.charLevel)
    return new CharBuild({
        char,
        auraMod: new LeveledMod(charSettings.value.auraMod),
        charMods: charSettings.value.charMods.filter(mod => mod !== null).map(m => new LeveledMod(m[0], m[1], inv.getBuffLv(m[0]))),
        meleeMods: charSettings.value.meleeMods.filter(mod => mod !== null).map(m => new LeveledMod(m[0], m[1], inv.getBuffLv(m[0]))),
        rangedMods: charSettings.value.rangedMods.filter(mod => mod !== null).map(m => new LeveledMod(m[0], m[1], inv.getBuffLv(m[0]))),
        skillMods: charSettings.value.skillWeaponMods.filter(mod => mod !== null).map(m => new LeveledMod(m[0], m[1], inv.getBuffLv(m[0]))),
        skillLevel: charSettings.value.charSkillLevel,
        buffs: charSettings.value.buffs
            .map(v => {
                try {
                    const b = new LeveledBuff(v[0], v[1])
                    return b
                } catch (error) {
                    console.error(error)
                    charSettings.value.buffs = charSettings.value.buffs.filter(b => b[0] !== v[0])
                    return null
                }
            })
            .filter(b => b !== null),
        melee: new LeveledWeapon(
            charSettings.value.meleeWeapon,
            charSettings.value.meleeWeaponRefine,
            charSettings.value.meleeWeaponLevel,
            inv.getWBuffLv(charSettings.value.meleeWeapon, char.属性)
        ),
        ranged: new LeveledWeapon(
            charSettings.value.rangedWeapon,
            charSettings.value.rangedWeaponRefine,
            charSettings.value.rangedWeaponLevel,
            inv.getWBuffLv(charSettings.value.rangedWeapon, char.属性)
        ),
        baseName: charSettings.value.baseName,
        imbalance: charSettings.value.imbalance,
        hpPercent: charSettings.value.hpPercent,
        resonanceGain: charSettings.value.resonanceGain,
        enemyId: charSettings.value.enemyId,
        enemyLevel: charSettings.value.enemyLevel,
        enemyResistance: charSettings.value.enemyResistance,
        targetFunction: charSettings.value.targetFunction,
    })
})
const buffOptions = computed(() =>
    buffData
        .filter(buff => !buff.限定 || buff.限定 === selectedChar.value || buff.限定 === charBuild.value.char.属性)
        .map(v => ({
            mx: v.mx,
            label: v.名称,
        }))
)
const selectedBuff = ref("")
const selectedBuffLv = ref(1)
const selectedBuffMaxLv = computed(() => buffOptions.value.find(buff => buff.label === selectedBuff.value)?.mx || 1)
const baseOptions = computed(() => [
    ...charBuild.value.allSkills.map(skill => ({ value: skill.名称, label: `${skill.名称}`, type: skill.类型 })),
])
watchEffect(() => {
    if (baseName.value && !baseOptions.value.some(base => base.value === baseName.value)) {
        // 切换角色自动选择第一个基础属性
        baseName.value = baseOptions.value[0].value
    }
})
const timelineData = useTimeline(selectedChar)
const currentTimelineName = ref("")
const getTimelineItems = () => {
    const raw = items.map(item =>
        item.lv
            ? {
                  i: item.trackIndex,
                  n: item.label,
                  t: item.startTime,
                  d: item.duration,
                  l: item.lv,
              }
            : {
                  i: item.trackIndex,
                  n: item.label,
                  t: item.startTime,
                  d: item.duration,
              }
    )
    raw.sort((a, b) => a.i - b.i || a.t - b.t)
    return raw
}
const loadTimeline = (index: number) => {
    const raw = timelineData.value[index].items
    const trackNames = timelineData.value[index].tracks
    const hpData = timelineData.value[index].hp || []
    currentTimelineName.value = timelineData.value[index].name
    items.length = 0
    tracks.length = 0
    healthPoints.length = 0

    // 加载轨道
    tracks.push(
        ...trackNames.map((name, index) => ({
            id: `track-${index}`,
            index,
            name,
        }))
    )

    // 加载项目
    raw.forEach(item => {
        addItem(item.i, item.t, item.d, item.n, item.l)
    })

    // 加载血量曲线，转换为HealthPoint格式
    hpData.forEach(([time, value]) => {
        healthPoints.push({
            id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            time,
            value,
        })
    })
    // 按时间排序
    healthPoints.sort((a, b) => a.time - b.time)
}
const addTimeline = () => {
    const newName = `${selectedChar.value}${(~~(Math.random() * 1e6)).toString(36)}`
    currentTimelineName.value = newName
    timelineData.value.push({
        name: newName,
        tracks: tracks.map(track => track.name),
        items: getTimelineItems(),
        hp: healthPoints.map(point => [point.time, point.value] as [number, number]),
    })
}
const editingTimelineIndex = ref(-1)
const editTimelineName = ref("")
const saveTimeline = (index: number) => {
    timelineData.value[index].items = getTimelineItems()
    timelineData.value[index].tracks = tracks.map(track => track.name)
    timelineData.value[index].hp = healthPoints.map(point => [point.time, point.value] as [number, number])
}
const renameTimeline = (index: number) => {
    editTimelineName.value = timelineData.value[index].name
    editingTimelineIndex.value = index
    nextTick(() => {
        const element = document.getElementById(`timeline-name-input-${index}`) as HTMLInputElement
        element.focus()
    })
}
const deleteTimeline = (index: number) => {
    timelineData.value.splice(index, 1)
}
const finishEditTimelineName = () => {
    if (editingTimelineIndex.value !== -1) {
        if (!editTimelineName.value) {
            return
        }
        // 检查重名
        if (baseOptions.value.some(base => base.value === editTimelineName.value)) {
            ui.showErrorMessage(`时间线名称不能与技能名称相同`)
            return
        }
        // 检查非法符号 ()+-*/.
        if (/[()+\-*/.]/.test(editTimelineName.value)) {
            ui.showErrorMessage(`时间线名称不能包含 ()+-*/. 等符号`)
            return
        }
        timelineData.value[editingTimelineIndex.value].name = editTimelineName.value
        editingTimelineIndex.value = -1
    }
}
const exportTimelineJson = () => {
    const newName = currentTimelineName.value || `${selectedChar.value}${(~~(Math.random() * 1e6)).toString(36)}`
    const json = JSON.stringify({
        name: newName,
        tracks: tracks.map(track => track.name),
        items: getTimelineItems(),
        hp: healthPoints.map(point => [point.time, point.value]),
    })
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${newName}.json`
    a.click()
    URL.revokeObjectURL(url)
}
const importTimelineJson = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.click()
    input.addEventListener("change", e => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.readAsText(file)
            reader.onload = async () => {
                try {
                    const json = JSON.parse(reader.result as string)
                    if (json.name) {
                        currentTimelineName.value = json.name
                        // 检查重名
                        const index = timelineData.value.findIndex(item => item.name === json.name)
                        const val = {
                            name: json.name,
                            tracks: json.tracks,
                            items: json.items,
                            hp: json.hp || [],
                        }
                        if (index !== -1) {
                            if (!(await ui.showDialog("确认覆盖", `时间线 ${json.name} 已存在，是否覆盖？`))) {
                                return
                            }
                            timelineData.value[index] = val
                            loadTimeline(index)
                        } else {
                            timelineData.value.push(val)
                            loadTimeline(timelineData.value.length - 1)
                        }
                    }
                } catch (error) {
                    console.error("导入JSON失败", error)
                }
            }
        }
    })
}
// #endregion
</script>
<template>
    <div class="flex flex-col h-full bg-base-300">
        <!-- 顶部工具栏 -->
        <div class="flex items-center justify-between p-2 px-4 border-b border-base-300 bg-base-300 shadow-md">
            <div class="flex items-center space-x-6">
                <!-- 工具选择按钮组 -->
                <div class="flex bg-base-300/50 backdrop-blur-sm rounded-lg overflow-hidden shadow-lg shrink-0 cursor-pointer">
                    <div
                        class="px-3 sm:px-4 py-2 flex items-center justify-center transition-all duration-200 relative"
                        :class="
                            currentTool === 'select'
                                ? 'bg-blue-600 text-white shadow-inner shadow-blue-700/30'
                                : 'bg-base-300 hover:bg-base-content/50 text-base-content/80 hover:text-white'
                        "
                        title="选择模式"
                        @click="selectTool('select')"
                    >
                        <Icon icon="ri:drag-move-line" class="h-5 w-5" />
                        <div v-if="currentTool === 'select'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    </div>
                    <div
                        class="px-3 sm:px-4 py-2 flex items-center justify-center transition-all duration-200 relative"
                        :class="
                            currentTool === 'brush'
                                ? 'bg-green-600 text-white shadow-inner shadow-green-700/30'
                                : 'bg-base-300 hover:bg-base-content/50 text-base-content/80 hover:text-base-100'
                        "
                        title="画笔模式"
                        @click="selectTool('brush')"
                    >
                        <Icon icon="ri:edit-line" class="h-5 w-5" />
                        <div v-if="currentTool === 'brush'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />
                    </div>
                    <div
                        class="px-3 sm:px-4 py-2 flex items-center justify-center transition-all duration-200 relative"
                        :class="
                            currentTool === 'delete'
                                ? 'bg-red-600 text-white shadow-inner shadow-red-700/30'
                                : 'bg-base-300 hover:bg-base-content/50 text-base-content/80 hover:text-base-100'
                        "
                        title="删除模式"
                        @click="selectTool('delete')"
                    >
                        <Icon icon="ri:delete-bin-line" class="h-5 w-5" />
                        <div v-if="currentTool === 'delete'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400" />
                    </div>
                </div>
            </div>
            <!-- 游戏数据关联 -->
            <div class="flex items-center px-4 gap-2">
                <Select v-model="selectedChar" class="inline-flex justify-between input input-bordered input-sm">
                    <template v-for="charWithElm in groupBy(charOptions, 'elm')" :key="charWithElm[0].elm">
                        <SelectLabel class="p-2 text-sm font-semibold text-primary">
                            {{ charWithElm[0].elm }}
                        </SelectLabel>
                        <SelectGroup>
                            <SelectItem v-for="char in charWithElm" :key="char.value" :value="char.value">
                                {{ char.label }}
                            </SelectItem>
                        </SelectGroup>
                    </template>
                </Select>
                <label class="label">
                    <span class="label-text text-sm font-semibold text-secondary whitespace-nowrap">BUFF</span>
                    <input v-model="isBuff" type="checkbox" class="toggle toggle-secondary" />
                </label>
                <div v-if="isBuff" class="p-2 flex w-50 items-center gap-2">
                    <Select
                        v-model="selectedBuff"
                        class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                    >
                        <SelectItem v-for="buff in buffOptions" :key="buff.label" :value="buff.label">
                            {{ buff.label }}
                        </SelectItem>
                    </Select>
                    <Select
                        v-if="selectedBuffMaxLv > 1"
                        v-model="selectedBuffLv"
                        class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                    >
                        <SelectItem v-for="lv in selectedBuffMaxLv" :key="lv" :value="lv">
                            {{ lv }}
                        </SelectItem>
                    </Select>
                </div>
                <div v-else class="p-2 flex items-center gap-2">
                    <Select v-model="baseName" class="input input-bordered input-sm">
                        <template v-for="baseWithType in groupBy(baseOptions, 'type')" :key="baseWithType[0].type">
                            <SelectLabel class="p-2 text-sm font-semibold text-primary">
                                {{ baseWithType[0].type }}
                            </SelectLabel>
                            <SelectGroup>
                                <SelectItem v-for="base in baseWithType" :key="base.value" :value="base.value">
                                    {{ base.label }}
                                </SelectItem>
                            </SelectGroup>
                        </template>
                    </Select>
                    <Combobox
                        v-model="targetFunction"
                        type="text"
                        placeholder="伤害"
                        :options="
                            (charBuild.allSkills.find(s => s.名称 === baseName)?.字段 || []).map(f => ({
                                label: f.名称,
                                value: f.名称,
                            }))
                        "
                        class="w-32"
                    />
                </div>
            </div>
            <!-- 右侧操作按钮 -->
            <div class="flex space-x-3 ml-auto items-center">
                <div class="tooltip tooltip-bottom" data-tip="BUFF只会对同一轨道或其上方的技能生效">
                    <button class="btn btn-sm btn-square btn-circle">?</button>
                </div>
                <!-- 血量曲线控制 -->
                <div class="flex items-center gap-2">
                    <label class="label">
                        <span class="label-text text-sm font-semibold text-secondary whitespace-nowrap">血量曲线</span>
                        <input v-model="showHealthCurve" type="checkbox" class="toggle toggle-secondary" />
                    </label>
                    <button class="btn btn-xs btn-secondary" @click="generateSampleHealthCurve">生成示例</button>
                    <button v-if="healthPoints.length > 0" class="btn btn-xs btn-error" @click="clearHealthCurve">清除</button>
                </div>
                <div class="p-2 font-orbitron">{{ zoomLevel }}x</div>
                <div class="btn btn-ghost btn-square border-0" title="缩小" @click="zoomOut">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="btn btn-ghost btn-square border-0" title="放大" @click="zoomIn">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fill-rule="evenodd"
                            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                </div>
                <div class="btn btn-ghost btn-square border-0" title="重置视图" @click="resetView">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fill-rule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clip-rule="evenodd"
                        />
                    </svg>
                </div>

                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-primary btn-sm">
                        <span class="font-medium text-sm">加载/保存</span>
                    </div>
                    <div tabindex="0" class="card card-sm dropdown-content bg-base-100 rounded-box z-1 w-80 shadow-sm">
                        <div class="card-body space-y-2">
                            <h2 class="card-title">保存方案</h2>
                            <ul>
                                <li
                                    v-for="(item, index) in timelineData"
                                    :key="item.name"
                                    class="p-2 flex items-center gap-2 rounded-md"
                                    :class="{ 'bg-base-300': item.name === currentTimelineName }"
                                >
                                    <input
                                        v-if="editingTimelineIndex === index"
                                        :id="`timeline-name-input-${index}`"
                                        v-model="editTimelineName"
                                        class="bg-base-200 px-2 py-0.5 text-sm w-24 sm:w-36"
                                        @blur="finishEditTimelineName"
                                        @keyup.enter="finishEditTimelineName"
                                        @keyup.escape="editingTimelineIndex = -1"
                                    />
                                    <span
                                        v-else
                                        class="font-medium text-sm link link-primary link-hover"
                                        title="点击加载"
                                        @click="loadTimeline(index)"
                                    >
                                        {{ item.name }}
                                    </span>
                                    <div
                                        class="ml-auto btn btn-xs btn-ghost btn-square border-0"
                                        title="重命名"
                                        @click="renameTimeline(index)"
                                    >
                                        <Icon icon="ri:pencil-fill" class="h-4 w-4" />
                                    </div>
                                    <div class="btn btn-xs btn-ghost btn-square border-0" title="保存" @click="saveTimeline(index)">
                                        <Icon icon="ri:save-fill" class="h-4 w-4" />
                                    </div>
                                    <div class="btn btn-xs btn-ghost btn-square border-0" title="删除" @click="deleteTimeline(index)">
                                        <Icon icon="ri:delete-bin-2-fill" class="h-4 w-4" />
                                    </div>
                                </li>
                            </ul>
                            <div class="btn btn-primary" @click="addTimeline()">新建方案</div>
                            <div class="w-full join flex gap-2">
                                <div class="btn flex-1" @click="exportTimelineJson()">导出JSON</div>
                                <div class="btn flex-1" @click="importTimelineJson()">加载JSON</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 时间线容器 -->
        <div class="flex-1 flex overflow-x-hidden overflow-y-auto">
            <!-- 轨道 -->
            <div class="flex-none flex flex-col w-64 sm:w-80 mt-16 relative" :style="{ minHeight: `${tracks.length * trackHeight}px` }">
                <div
                    class="absolute -top-14 left-4 px-6 py-3 hover:bg-base-200 rounded-lg transition-all duration-200 flex items-center space-x-1 transform hover:scale-[1.03] hover:shadow-lg shrink-0 cursor-pointer"
                    @click="addTrack()"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fill-rule="evenodd"
                            d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <span class="font-medium text-sm">添加轨道</span>
                </div>
                <!-- 轨道列表 -->
                <div
                    v-for="track in tracks"
                    :key="track.id"
                    :style="{ top: `${track.index * trackHeight}px` }"
                    class="absolute left-0 right-0 h-15 border-b border-base-300 transition-all duration-200"
                    :class="{
                        'bg-gray-850': selectedTrackIndex === track.index,
                        'bg-transparent': selectedTrackIndex !== track.index,
                    }"
                >
                    <!-- 轨道名称 -->
                    <div
                        class="absolute left-0 top-0 bottom-0 w-64 sm:w-80 flex items-center px-3 sm:px-4 transition-all duration-200"
                        :class="
                            selectedTrackIndex === track.index
                                ? 'border-r border-blue-600 bg-blue-900/30'
                                : 'border-r border-gray-700 bg-base-300'
                        "
                        @click="e => handleTrackClick(track.index, e)"
                    >
                        <div class="flex items-center justify-between w-full">
                            <div class="flex flex-col">
                                <!-- 轨道名称编辑 -->
                                <template v-if="editingTrackIndex === track.index">
                                    <input
                                        :id="`track-name-input-${track.index}`"
                                        v-model="editTrackName"
                                        class="bg-base-200 px-2 py-0.5 text-sm w-24 sm:w-36"
                                        @blur="finishEditTrackName"
                                        @keyup.enter="finishEditTrackName"
                                        @keyup.escape="editingTrackIndex = -1"
                                    />
                                </template>
                                <template v-else>
                                    <span
                                        :class="selectedTrackIndex === track.index ? 'text-blue-400' : 'text-base-content/80'"
                                        class="cursor-pointer hover:underline truncate max-w-24 sm:max-w-36"
                                        @dblclick="e => startEditTrackName(track.index, e)"
                                    >
                                        {{ track.name }}
                                    </span>
                                </template>
                                <span class="text-xs text-gray-500 mt-1 hidden sm:inline">
                                    {{ items.filter(item => item.trackIndex === track.index).length }} 项
                                </span>
                            </div>
                            <div class="flex items-center space-x-1">
                                <!-- 移动轨道按钮 -->
                                <button
                                    class="text-gray-500 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-all duration-200 transform hover:scale-110"
                                    :disabled="track.index === 0"
                                    :class="{ 'opacity-30 cursor-not-allowed': track.index === 0 }"
                                    @click.stop="moveTrackUp(track.index)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path
                                            fill-rule="evenodd"
                                            d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                </button>
                                <button
                                    class="text-gray-500 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-all duration-200 transform hover:scale-110"
                                    :disabled="track.index === tracks.length - 1"
                                    :class="{ 'opacity-30 cursor-not-allowed': track.index === tracks.length - 1 }"
                                    @click.stop="moveTrackDown(track.index)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path
                                            fill-rule="evenodd"
                                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 011.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                </button>
                                <!-- 删除轨道按钮 -->
                                <button
                                    v-if="tracks.length > 1"
                                    class="text-gray-500 hover:text-red-500 p-1 rounded-full hover:bg-red-700/30 transition-all duration-200 transform hover:scale-110"
                                    @click.stop="removeTrack(track.index)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path
                                            fill-rule="evenodd"
                                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex-1 flex flex-col">
                <div
                    id="timeline-container"
                    class="flex-1 flex flex-col overflow-x-auto"
                    :style="{ minHeight: `${80 + tracks.length * trackHeight}px` }"
                >
                    <!-- 时间刻度 -->
                    <div class="h-16 flex-none relative border-b border-gray-700 top-0" :style="{ width: `${300 * timelineScale}px` }">
                        <!-- 时间刻度线 -->
                        <div
                            v-for="mark in visibleTimeMarks"
                            :key="`time-mark-${mark.time}`"
                            :style="{ left: `${mark.position}px` }"
                            class="absolute top-0 w-0.5"
                            :class="mark.isMajor ? 'h-full border-r border-gray-700' : 'h-1/2 border-r border-gray-600'"
                        />

                        <!-- 时间标签 -->
                        <div
                            v-for="mark in visibleTimeMarks.filter(m => m.isMajor)"
                            :key="`time-label-${mark.time}`"
                            :style="{ left: `${mark.position + 10}px` }"
                            class="absolute bottom-1 text-xs text-gray-400 whitespace-nowrap"
                        >
                            {{ mark.label }}
                        </div>
                    </div>

                    <!-- 轨道内容 -->
                    <div
                        id="track-content"
                        class="flex-1 min-h-125 relative"
                        :style="{ width: `${300 * timelineScale}px` }"
                        @mousedown="startSelection"
                    >
                        <!-- 轨道上的项目 -->
                        <ContextMenu v-for="item in items" :key="item.id">
                            <template #menu>
                                <ContextMenuItem
                                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                    @click="prepareDeleteItem(item)"
                                >
                                    删除
                                </ContextMenuItem>
                            </template>
                            <FullTooltip side="bottom">
                                <template #tooltip>
                                    <div v-if="item.props && !item.lv" class="flex flex-col">
                                        <div class="text-md text-neutral-500 p-2">
                                            {{ item.label }}
                                        </div>
                                        <div
                                            v-for="(val, index) in item.props"
                                            :key="index"
                                            class="flex flex-col group hover:bg-base-200 rounded-md p-2"
                                        >
                                            <div class="flex justify-between items-center gap-4 text-sm">
                                                <div class="text-xs text-neutral-500">
                                                    {{ val.名称 }}
                                                </div>
                                                <div class="font-medium text-primary">
                                                    {{ formatSkillProp(val.名称, val) }}
                                                </div>
                                            </div>
                                            <div
                                                v-if="val.属性影响"
                                                class="justify-between items-center gap-4 text-sm flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                                            >
                                                <div class="text-xs text-neutral-500">属性影响</div>
                                                <div class="text-xs ml-auto font-medium text-neutral-500">技能{{ val.属性影响 }}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-if="item.props && item.lv" class="flex flex-col">
                                        <div class="text-md text-neutral-500 p-2">
                                            {{ item.label }}
                                        </div>
                                        <div
                                            v-for="(val, prop) in item.props"
                                            :key="prop"
                                            class="flex flex-col group hover:bg-base-200 rounded-md p-2"
                                        >
                                            <div class="flex justify-between items-center gap-4 text-sm">
                                                <div class="text-xs text-neutral-500">
                                                    {{ prop }}
                                                </div>
                                                <div class="font-medium text-primary">
                                                    {{ formatProp(prop as any, val) }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                                <div
                                    :data-id="item.id"
                                    class="absolute h-8 rounded-md flex items-center cursor-move transition-all duration-200 hover:shadow-lg hover:z-20 transform hover:-translate-y-0.5"
                                    :class="{
                                        'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900 shadow-md z-30 hover:z-31':
                                            item.isSelected,
                                        'opacity-80 hover:opacity-100': !item.isSelected,
                                        'scale-110 rotate-1 z-40': isDragging && selectedItems.some(selected => selected.id === item.id),
                                    }"
                                    :style="{
                                        top: `${item.trackIndex * trackHeight + 5}px`,
                                        left: `${(item.startTime - timelineStartTime) * timelineScale + 5}px`,
                                        width: `${item.duration * timelineScale}px`,
                                        height: `${trackHeight - 10}px`,
                                        backgroundColor: item.color,
                                        transitionProperty: isDragging ? 'none' : 'all',
                                        boxShadow: item.isSelected ? '0 2px 12px rgba(59, 130, 246, 0.5)' : 'none',
                                        userSelect: 'none',
                                        transformOrigin: 'center',
                                    }"
                                    @mousedown.stop="e => startDrag(e, item)"
                                    @click.stop="currentTool === 'delete' && prepareDeleteItem(item)"
                                    @mouseenter="hoveredItemId = item.id"
                                    @mouseleave="hoveredItemId = null"
                                >
                                    <!-- 左侧拖拽区域 -->
                                    <div
                                        class="group absolute left-0 top-0 h-full w-3 cursor-col-resize z-50 flex items-center justify-center hover:bg-white/10 rounded-l-md transition-colors duration-150"
                                        :title="'拖拽调整开始时间'"
                                        @mousedown.stop="e => startResize(e, item, 'left')"
                                    >
                                        <span class="text-white opacity-0 group-hover:opacity-100 text-sm transition-opacity duration-150">
                                            <Icon icon="ri:expand-left-line" />
                                        </span>
                                    </div>

                                    <!-- 右侧拖拽区域 -->
                                    <div
                                        class="group absolute right-0 top-0 h-full w-3 cursor-col-resize z-50 flex items-center justify-center hover:bg-white/10 rounded-r-md transition-colors duration-150"
                                        :title="'拖拽调整持续时间'"
                                        @mousedown.stop="e => startResize(e, item, 'right')"
                                    >
                                        <span class="text-white opacity-0 group-hover:opacity-100 text-sm transition-opacity duration-150">
                                            <Icon icon="ri:expand-right-line" />
                                        </span>
                                    </div>

                                    <!-- 项目内容 -->
                                    <div class="px-1 w-full">
                                        <span class="text-xs font-medium text-white truncate flex flex-col items-center w-full">
                                            {{ item.label }}
                                            <span v-if="hoveredItemId === item.id" class="text-[10px] text-white/70 mt-0.5 hidden sm:block">
                                                {{ formatTime(item.startTime) }} / {{ formatDuration(item.duration) }}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </FullTooltip>
                        </ContextMenu>

                        <!-- 框选指示器 -->
                        <div
                            v-if="isSelecting"
                            :style="{
                                left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
                                top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
                                width: `${Math.abs(selectionEnd.x - selectionStart.x)}px`,
                                height: `${Math.abs(selectionEnd.y - selectionStart.y)}px`,
                                boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
                                backdropFilter: 'blur(1px)',
                            }"
                            class="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none z-20"
                        />
                    </div>
                </div>

                <!-- 独立的血量曲线区域 -->
                <div
                    ref="healthCurveContainerRef"
                    class="h-20 border-t border-gray-700 overflow-x-auto cursor-crosshair"
                    :style="{ width: '100%' }"
                    @click="handleAddHealthPoint"
                    @mouseenter.passive="handleHealthCurveMouseEnter()"
                    @mousemove.passive="handleHealthCurveMouseMove($event)"
                    @mouseleave.passive="handleHealthCurveMouseLeave()"
                >
                    <div class="relative h-full" :style="{ width: `${300 * timelineScale}px` }">
                        <svg class="w-full h-full">
                            <!-- 背景网格 -->
                            <defs>
                                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#374151" stroke-width="0.5" />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3" />

                            <!-- 血量曲线填充 -->
                            <path v-if="healthPoints.length > 0" :d="healthCurveFillPath" fill="#ef444420" />

                            <!-- 血量曲线 -->
                            <path
                                v-if="healthPoints.length > 0"
                                :d="healthCurvePath"
                                fill="none"
                                stroke="#ef4444"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />

                            <!-- 血量点标记 -->
                            <circle
                                v-for="(point, index) in healthPoints"
                                :key="`health-point-${index}`"
                                :cx="(point.time - timelineStartTime) * timelineScale"
                                :cy="chartHeight - (point.value / 100) * chartHeight"
                                r="5"
                                fill="#ef4444"
                                stroke="white"
                                stroke-width="2"
                                class="cursor-move hover:fill-red-500"
                                @mousedown="startDragHealthPoint($event, index)"
                                @contextmenu.prevent="deleteHealthPoint(point.id)"
                            />

                            <!-- 鼠标悬停垂直线 -->
                            <line
                                v-if="isHovering"
                                class="pointer-events-none"
                                x1="0"
                                :y1="padding"
                                x2="0"
                                :y2="padding + chartHeight"
                                :style="{
                                    transform: `translate(${hoverX}px, 0px)`,
                                }"
                                stroke="#3498db"
                                stroke-width="1"
                                stroke-dasharray="2,2"
                            />

                            <!-- 工具提示 -->
                            <g
                                v-if="isHovering"
                                class="pointer-events-none"
                                :style="{
                                    transform: `translate(${tooltipX}px, ${tooltipY - 20}px)`,
                                }"
                            >
                                <!-- 工具提示背景 -->
                                <rect
                                    x="0"
                                    y="0"
                                    width="120"
                                    height="50"
                                    rx="4"
                                    ry="4"
                                    fill="rgba(0, 0, 0, 0.8)"
                                    stroke="#e0e0e0"
                                    stroke-width="1"
                                />
                                <!-- 血量数值 -->
                                <text x="5" y="20" font-size="12" fill="#ffffff">血量: {{ hoverHealthValue.toFixed(2) }}%</text>
                                <!-- 时间数值 -->
                                <text x="5" y="40" font-size="12" fill="#ffffff">时间: {{ hoverTime.toFixed(2) }}s</text>
                            </g>
                        </svg>
                        <div class="absolute top-1 left-2 text-xs text-red-400 font-semibold">血量</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
