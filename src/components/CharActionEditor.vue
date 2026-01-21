<script setup lang="ts">
import { groupBy } from "lodash-es"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { buffData, buffMap, CharBuild, LeveledBuff } from "@/data"
import { useCharSettings } from "../composables/useCharSettings"

// 动作序列项接口
interface ActionItem {
    skill: string
    duration: number
    times?: number
    buffGroupIndex?: number | "-"
    id: string
}

// 背景动作项接口
interface BackgroundActionItem {
    skill: string
    interval: number
    times?: number
    delay?: number
    buffGroupIndex?: number | "-"
    id: string
}

// 血量曲线点接口定义
interface HealthPoint {
    time: number
    value: number
    id: string
}

// 组件属性定义
const props = defineProps<{
    charName: string
    charBuild: CharBuild
}>()

// 获取角色设置
const nameRef = computed(() => props.charName)
const charSettings = useCharSettings(nameRef)

// 技能列表
const allSkills = computed(() => props.charBuild?.allSkills || [])

// 技能基础选项 - 包含type字段
const baseOptions = computed(() => [
    { value: "延迟", label: "延迟", type: "其他" },
    ...allSkills.value.map(skill => ({
        value: skill.名称,
        label: `${skill.名称}`,
        type: skill.类型,
    })),
])

// BUFF选项
const buffOptions = computed(() =>
    buffData
        .map(buff => ({
            value: new LeveledBuff(buff),
            label: buff.名称 || "",
            limit: buff.限定,
            description: buff.描述 || "",
            lv: buff.mx || 1,
        }))
        .filter(
            buff => (!buff.limit || buff.limit === props.charBuild.char.名称) && !charSettings.value.buffs.some(b => b[0] === buff.label)
        )
)

// BUFF组状态
const buffGroups = ref<[string, number][][]>(charSettings.value.actions.bgs || [])

// 监听BUFF组变化，保存到charSettings
watch(
    buffGroups,
    value => {
        charSettings.value.actions.bgs = value
    },
    { deep: true }
)

// 弹窗状态
const showBuffEditor = ref(false)
const selectedBuffGroupIndex = ref(-1)
const currentSelectedBuffs = ref<LeveledBuff[]>([])

// 当前选中的BUFF组
const currentBuffGroup = computed(() => {
    if (selectedBuffGroupIndex.value < 0 || selectedBuffGroupIndex.value >= buffGroups.value.length) {
        return []
    }
    return buffGroups.value[selectedBuffGroupIndex.value]
})

// 打开BUFF编辑器
const openBuffEditor = (index: number) => {
    selectedBuffGroupIndex.value = index
    // 将当前BUFF组转换为LeveledBuff数组
    currentSelectedBuffs.value = currentBuffGroup.value
        .map(([name, lv]) => {
            const buff = buffMap.get(name)
            return buff ? new LeveledBuff(buff, lv) : undefined
        })
        .filter((v): v is LeveledBuff => v !== undefined)
    showBuffEditor.value = true
}

// 关闭BUFF编辑器
const closeBuffEditor = () => {
    showBuffEditor.value = false
    selectedBuffGroupIndex.value = -1
    currentSelectedBuffs.value = []
}

// 添加BUFF组
const addBuffGroup = () => {
    buffGroups.value.push([])
}

// 删除BUFF组
const deleteBuffGroup = (index: number) => {
    buffGroups.value.splice(index, 1)
}

// 更新BUFF组
const updateBuffGroup = (buffs: LeveledBuff[]) => {
    if (selectedBuffGroupIndex.value < 0 || selectedBuffGroupIndex.value >= buffGroups.value.length) {
        return
    }
    // 将LeveledBuff数组转换为[name, lv]数组
    const newBuffGroup = buffs.map(buff => [buff.名称, buff.等级] as [string, number])
    buffGroups.value[selectedBuffGroupIndex.value] = newBuffGroup
    closeBuffEditor()
}

// 切换BUFF
const toggleBuff = (buff: LeveledBuff) => {
    const index = currentSelectedBuffs.value.findIndex(b => b.名称 === buff.名称)
    if (index >= 0) {
        currentSelectedBuffs.value.splice(index, 1)
    } else {
        currentSelectedBuffs.value.push(buff)
    }
}

// 设置BUFF等级
const setBuffLv = (buff: LeveledBuff, level: number) => {
    const index = currentSelectedBuffs.value.findIndex(b => b.名称 === buff.名称)
    if (index >= 0) {
        currentSelectedBuffs.value[index].等级 = level
    }
}

// 为每个动作创建临时状态，用于Select+Input的组合
const actionSkillStates = computed(() => {
    const states: Record<string, { skill: string; field: string }> = {}

    // 处理内联动作
    actions.value.forEach(action => {
        const [skill, field] = action.skill.split("::")
        states[action.id] = {
            skill: skill || "",
            field: field || "",
        }
    })

    // 处理背景动作
    backgroundActions.value.forEach(action => {
        const [skill, field] = action.skill.split("::")
        states[action.id] = {
            skill: skill || "",
            field: field || "",
        }
    })

    return states
})

// 更新动作技能表达式
const updateActionSkillExpr = (id: string, skill: string, field: string) => {
    // 更新内联动作
    const action = id.startsWith("action-") ? actions.value.find(a => a.id === id) : null
    if (action) {
        action.skill = field ? `${skill}::${field}` : skill
    }

    // 更新背景动作
    const backgroundAction = id.startsWith("background-") ? backgroundActions.value.find(a => a.id === id) : null
    if (backgroundAction) {
        backgroundAction.skill = field ? `${skill}::${field}` : skill
    }
}

// 时间轴尺寸
const timelineWidth = ref(800) // 初始值，将在挂载后动态更新
const timelineHeight = ref(150)
const timelineContainerRef = ref<HTMLElement | null>(null)
const healthCurveContainerRef = ref<HTMLElement | null>(null)

// 更新时间轴宽度
const updateTimelineWidth = () => {
    if (timelineContainerRef.value) {
        const containerWidth = timelineContainerRef.value.clientWidth
        timelineWidth.value = containerWidth // 减去16px边距
    }
}

// 组件挂载时初始化时间轴宽度并添加resize监听
onMounted(() => {
    adjustPreviewWindow(totalDuration.value || 10)
    updateTimelineWidth()

    // 使用ResizeObserver监听容器大小变化
    const observer = new ResizeObserver(updateTimelineWidth)
    if (timelineContainerRef.value) {
        observer.observe(timelineContainerRef.value)
    }

    // 组件卸载时清理
    onUnmounted(() => {
        observer.disconnect()
    })
})

const actions = ref<ActionItem[]>(
    charSettings.value.actions.i.map((action, index) => ({
        skill: action.s,
        duration: action.d,
        times: action.t,
        buffGroupIndex: action.b || "-",
        id: `action-${index}`,
    }))
)
watch(
    actions,
    value => {
        charSettings.value.actions.i = value.map(action => ({
            s: action.skill,
            d: action.duration,
            t: action.times,
            b: action.buffGroupIndex === "-" ? undefined : action.buffGroupIndex,
        }))
    },
    { deep: true }
)

const backgroundActions = ref<BackgroundActionItem[]>(
    charSettings.value.actions.b.map((action, index) => ({
        skill: action.s,
        interval: action.i,
        times: action.t,
        delay: action.d,
        buffGroupIndex: action.b || "-",
        id: `background-${index}`,
    }))
)
watch(
    backgroundActions,
    value => {
        charSettings.value.actions.b = value.map(action => ({
            s: action.skill,
            i: action.interval,
            t: action.times,
            d: action.delay,
            b: action.buffGroupIndex === "-" ? undefined : action.buffGroupIndex,
        }))
    },
    { deep: true }
)

const healthPoints = ref<HealthPoint[]>(
    charSettings.value.actions.hp.map(([time, value], index) => ({
        time,
        value,
        id: `health-${index}`,
    }))
)
watch(
    healthPoints,
    value => {
        charSettings.value.actions.hp = value.sort((a, b) => a.time - b.time).map(point => [point.time, point.value] as [number, number])
    },
    { deep: true }
)

// 计算总体时间长度
const totalDuration = computed(() => {
    return actions.value.reduce((total, action) => {
        return total + action.duration * (action.times || 1)
    }, 0)
})

// 预览窗口范围 - 初始值将在组件挂载后调整
const previewWindow = ref({
    start: 0, // 预览窗口开始时间
    end: 60, // 预览窗口结束时间
    min: 1, // 最小预览窗口大小
    max: 300, // 最大预览窗口大小
})

// 计算时间刻度比例
const timelineScale = computed(() => {
    const duration = previewWindow.value.end - previewWindow.value.start
    // 防止除以零
    return duration > 0 ? timelineWidth.value / duration : 0
})

// 调整预览窗口，确保其宽度不超过总时长
const adjustPreviewWindow = (total: number) => {
    // 确保预览窗口不超过总时长
    if (previewWindow.value.end > total) {
        previewWindow.value.end = total
    }
    // 确保预览窗口开始时间不超过结束时间
    if (previewWindow.value.start >= previewWindow.value.end) {
        previewWindow.value.start = Math.max(0, previewWindow.value.end - previewWindow.value.min)
    }
}
onMounted(() => {
    adjustPreviewWindow(totalDuration.value || 10)
})
// 监听总时长变化，自动调整预览窗口
watch(totalDuration, newTotal => {
    adjustPreviewWindow(newTotal || 10)
})

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
const chartHeight = ref(80) // h-20容器高度
const padding = ref(0)

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
    const time = (x / timelineWidth.value) * (previewWindow.value.end - previewWindow.value.start) + previewWindow.value.start
    hoverTime.value = time

    // 计算悬停位置对应的血量值
    // 找到最接近的两个点，计算插值
    if (healthPoints.value.length > 0) {
        // 按时间排序
        const sortedPoints = [...healthPoints.value].sort((a, b) => a.time - b.time)

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

// 生成示例血量曲线
const generateSampleHealthCurve = () => {
    healthPoints.value = []
    for (let time = 0; time <= totalDuration.value; time += 2) {
        const baseHealth = 80
        const variation = 20 * Math.sin(time * 0.3) + Math.random() * 10
        healthPoints.value.push({
            time,
            value: Math.max(10, Math.min(100, baseHealth + variation)),
            id: `health-${time}`,
        })
    }
}

// 添加血量点
const addHealthPoint = (time: number, value: number) => {
    healthPoints.value.push({
        time,
        value,
        id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    })
    // 按时间排序
    healthPoints.value.sort((a, b) => a.time - b.time)
}

// 删除血量点
const deleteHealthPoint = (id: string) => {
    const index = healthPoints.value.findIndex(point => point.id === id)
    if (index !== -1) {
        healthPoints.value.splice(index, 1)
    }
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

    // 使用血量曲线容器计算位置，而不是整个时间轴
    const healthElement = healthCurveContainerRef.value
    if (!healthElement) return

    const rect = healthElement.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const containerHeight = rect.height || 80 // 使用实际容器高度，默认为80px

    // 计算时间和血量值
    const time = (x / timelineWidth.value) * (previewWindow.value.end - previewWindow.value.start) + previewWindow.value.start
    const value = Math.max(0, Math.min(100, 100 - (y / containerHeight) * 100))

    // 获取当前拖动的点
    const draggedPoint = healthPoints.value[dragHealthPointIndex.value]
    // 更新点的时间和值
    draggedPoint.time = +time.toFixed(2)
    draggedPoint.value = Math.round(value)

    // 手动处理排序，确保dragHealthPointIndex始终指向正确的点
    let newIndex = dragHealthPointIndex.value

    // 向左移动（时间减小）
    while (newIndex > 0 && healthPoints.value[newIndex].time < healthPoints.value[newIndex - 1].time) {
        // 交换元素
        ;[healthPoints.value[newIndex], healthPoints.value[newIndex - 1]] = [healthPoints.value[newIndex - 1], healthPoints.value[newIndex]]
        newIndex--
    }

    // 向右移动（时间增加）
    while (newIndex < healthPoints.value.length - 1 && healthPoints.value[newIndex].time > healthPoints.value[newIndex + 1].time) {
        // 交换元素
        ;[healthPoints.value[newIndex], healthPoints.value[newIndex + 1]] = [healthPoints.value[newIndex + 1], healthPoints.value[newIndex]]
        newIndex++
    }

    // 更新dragHealthPointIndex到新位置
    dragHealthPointIndex.value = newIndex
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
    const containerHeight = rect.height // 使用实际容器高度（h-20 = 80px）
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const time = (x / timelineWidth.value) * (previewWindow.value.end - previewWindow.value.start) + previewWindow.value.start
    const value = Math.max(0, Math.min(100, 100 - (y / containerHeight) * 100))

    addHealthPoint(+time.toFixed(2), Math.round(value))
}

// 结束拖动血量点
const handleHealthPointMouseUp = () => {
    isDraggingHealthPoint.value = false
    dragHealthPointIndex.value = -1

    // 移除全局事件监听器
    window.removeEventListener("mousemove", handleHealthPointMouseMove)
    window.removeEventListener("mouseup", handleHealthPointMouseUp)
}

// 计算动作在时间轴上的位置
const actionPositions = computed(() => {
    const positions = []
    let currentTime = 0

    for (const action of actions.value) {
        // 计算总持续时间（包含循环）
        const totalDuration = action.duration * (action.times || 1)

        positions.push({
            ...action,
            startTime: currentTime,
            endTime: currentTime + totalDuration,
        })

        // 更新当前时间，实现紧密排列
        currentTime += totalDuration
    }

    return positions
})

// 计算可见的动作
const visibleActions = computed(() => {
    return actionPositions.value.filter(action => {
        return action.endTime > previewWindow.value.start && action.startTime < previewWindow.value.end
    })
})

// 计算可见的血量点
const visibleHealthPoints = computed(() => {
    return healthPoints.value.filter(point => point.time >= previewWindow.value.start && point.time <= previewWindow.value.end)
})

// 计算血量曲线路径
const healthCurvePath = computed(() => {
    if (visibleHealthPoints.value.length === 0) return ""

    // 使用固定高度80px，与h-20容器匹配
    const containerHeight = 80
    const firstPoint = visibleHealthPoints.value[0]

    // 计算第一个点的y坐标
    const firstY = containerHeight - (firstPoint.value / 100) * containerHeight

    // 生成路径
    let path = `M ${(firstPoint.time - previewWindow.value.start) * timelineScale.value} ${firstY}`

    for (let i = 1; i < visibleHealthPoints.value.length; i++) {
        const point = visibleHealthPoints.value[i]
        const x = (point.time - previewWindow.value.start) * timelineScale.value
        const y = containerHeight - (point.value / 100) * containerHeight // 血量值映射到容器高度范围
        path += ` L ${x} ${y}`
    }

    return path
})

// 计算血量曲线填充路径
const healthCurveFillPath = computed(() => {
    if (visibleHealthPoints.value.length === 0) return ""

    // 使用固定高度80px，与h-20容器匹配
    const containerHeight = 80
    const firstPoint = visibleHealthPoints.value[0]
    const lastPoint = visibleHealthPoints.value[visibleHealthPoints.value.length - 1]

    // 计算第一个点和最后一个点的y坐标
    const firstY = containerHeight - (firstPoint.value / 100) * containerHeight
    const lastY = containerHeight - (lastPoint.value / 100) * containerHeight

    // 生成填充路径
    let path = ""

    if (visibleHealthPoints.value.length === 1) {
        // 只有一个点时，生成水平线
        path = `M 0 ${firstY} L ${timelineWidth.value} ${firstY}`
    } else {
        // 多个点时，从第一个点水平向左扩展到x=0，然后沿着曲线绘制，最后从最后一个点水平向右扩展到x=timelineWidth
        path = `M 0 ${firstY} L ${(firstPoint.time - previewWindow.value.start) * timelineScale.value} ${firstY}`

        for (let i = 1; i < visibleHealthPoints.value.length; i++) {
            const point = visibleHealthPoints.value[i]
            const x = (point.time - previewWindow.value.start) * timelineScale.value
            const y = containerHeight - (point.value / 100) * containerHeight
            path += ` L ${x} ${y}`
        }

        path += ` L ${timelineWidth.value} ${lastY}`
    }

    // 闭合路径
    path += ` L ${timelineWidth.value} ${containerHeight} L 0 ${containerHeight} Z`

    return path
})

// 添加新动作
const addAction = (skill: string = "") => {
    actions.value.push({
        id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        skill,
        duration: 1,
        times: 1,
    })
}

// 删除动作
const deleteAction = (id: string) => {
    const index = actions.value.findIndex(action => action.id === id)
    if (index !== -1) {
        actions.value.splice(index, 1)
    }
}

// 上移动作
const moveActionUp = (id: string) => {
    const index = actions.value.findIndex(action => action.id === id)
    if (index > 0) {
        // 交换位置
        ;[actions.value[index], actions.value[index - 1]] = [actions.value[index - 1], actions.value[index]]
    }
}

// 下移动作
const moveActionDown = (id: string) => {
    const index = actions.value.findIndex(action => action.id === id)
    if (index < actions.value.length - 1) {
        // 交换位置
        ;[actions.value[index], actions.value[index + 1]] = [actions.value[index + 1], actions.value[index]]
    }
}

// 添加新背景动作
const addBackgroundAction = (skill: string = "") => {
    backgroundActions.value.push({
        id: `background-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        skill,
        interval: 1,
        times: 1,
        delay: 0,
    })
}

// 删除背景动作
const deleteBackgroundAction = (id: string) => {
    const index = backgroundActions.value.findIndex(action => action.id === id)
    if (index !== -1) {
        backgroundActions.value.splice(index, 1)
    }
}

// 上移背景动作
const moveBackgroundActionUp = (id: string) => {
    const index = backgroundActions.value.findIndex(action => action.id === id)
    if (index > 0) {
        // 交换位置
        ;[backgroundActions.value[index], backgroundActions.value[index - 1]] = [
            backgroundActions.value[index - 1],
            backgroundActions.value[index],
        ]
    }
}

// 下移背景动作
const moveBackgroundActionDown = (id: string) => {
    const index = backgroundActions.value.findIndex(action => action.id === id)
    if (index < backgroundActions.value.length - 1) {
        // 交换位置
        ;[backgroundActions.value[index], backgroundActions.value[index + 1]] = [
            backgroundActions.value[index + 1],
            backgroundActions.value[index],
        ]
    }
}

// 格式化时间显示
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor((seconds % 60) * 10) / 10
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`
}

// 计算可见时间刻度
const visibleTimeMarks = computed(() => {
    const marks = []
    const totalPreviewSeconds = previewWindow.value.end - previewWindow.value.start

    // 防止除以零
    if (totalPreviewSeconds <= 0) return []

    // 根据预览窗口大小调整刻度密度
    let step = 1 // 默认每秒一个刻度
    if (totalPreviewSeconds > 60) {
        step = 5 // 每5秒一个刻度
    } else if (totalPreviewSeconds < 10) {
        step = 0.5 // 每0.5秒一个刻度
    }

    // 计算最大可显示的刻度数量，防止溢出
    const maxMarks = Math.floor(timelineWidth.value / 50) // 每个刻度至少需要50px空间
    const maxStep = totalPreviewSeconds / maxMarks

    // 确保step不会太小导致刻度过多
    if (step < maxStep) {
        step = Math.ceil(maxStep * 2) / 2 // 取最接近的0.5倍数
    }

    const start = Math.ceil(previewWindow.value.start / step) * step
    const end = Math.floor(previewWindow.value.end / step) * step

    for (let time = start; time <= end; time += step) {
        const position = (time - previewWindow.value.start) * timelineScale.value
        // 只添加在可见范围内的刻度
        if (position >= 0 && position <= timelineWidth.value) {
            marks.push({
                time,
                position,
                label: formatTime(time),
            })
        }
    }

    return marks
})

// 时间轴交互状态
const isDraggingWindow = ref(false)
const isResizingLeft = ref(false)
const isResizingRight = ref(false)
const dragStartX = ref(0)
const dragStartWindow = ref({ start: 0, end: 0 })

// 处理时间轴交互
const handleTimelineMouseDown = (event: MouseEvent, area: "window" | "left" | "right") => {
    event.preventDefault()

    dragStartX.value = event.clientX
    dragStartWindow.value = { ...previewWindow.value }

    if (area === "window") {
        isDraggingWindow.value = true
    } else if (area === "left") {
        isResizingLeft.value = true
    } else if (area === "right") {
        isResizingRight.value = true
    }

    // 添加全局事件监听器
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
}

// 处理鼠标移动
const handleMouseMove = (event: MouseEvent) => {
    const deltaX = event.clientX - dragStartX.value

    // 计算总体时间轴的像素每秒比例，用于调整窗口大小
    const totalPixelPerSecond = timelineWidth.value / totalDuration.value || 1
    // 计算预览窗口内的像素每秒比例，用于拖动窗口
    const windowPixelPerSecond = timelineWidth.value / (dragStartWindow.value.end - dragStartWindow.value.start) || 1
    console.log(isDraggingWindow.value, deltaX)

    if (isDraggingWindow.value) {
        // 拖动整个窗口 - 保持窗口大小不变
        const timeDelta = deltaX / windowPixelPerSecond
        const windowSize = dragStartWindow.value.end - dragStartWindow.value.start

        // 计算新的窗口位置
        let newStart = dragStartWindow.value.start + timeDelta
        let newEnd = newStart + windowSize

        // 限制拖动范围，确保窗口不超出总时长
        if (newStart < 0) {
            // 窗口左端超出，调整到左端
            newStart = 0
            newEnd = windowSize
        } else if (newEnd > totalDuration.value) {
            // 窗口右端超出，调整到右端
            newEnd = totalDuration.value
            newStart = newEnd - windowSize
        }

        // 更新预览窗口位置，保持大小不变
        previewWindow.value.start = newStart
        previewWindow.value.end = newEnd
    } else if (isResizingLeft.value) {
        // 调整窗口左侧 - 只改变左端，保持右端不变
        const timeDelta = deltaX / totalPixelPerSecond
        let newStart = dragStartWindow.value.start + timeDelta
        const currentEnd = previewWindow.value.end

        // 限制左端范围：
        newStart = Math.max(0, newStart)
        newStart = Math.min(currentEnd - previewWindow.value.min, newStart)

        // 更新预览窗口左端
        previewWindow.value.start = newStart
    } else if (isResizingRight.value) {
        // 调整窗口右侧 - 只改变右端，保持左端不变
        const timeDelta = deltaX / totalPixelPerSecond
        const currentStart = previewWindow.value.start
        let newEnd = dragStartWindow.value.end + timeDelta

        console.log(currentStart, newEnd)
        // 限制右端范围：
        newEnd = Math.max(currentStart + previewWindow.value.min, newEnd)
        newEnd = Math.min(totalDuration.value, newEnd)

        // 更新预览窗口右端
        previewWindow.value.end = newEnd
    }
}

// 处理鼠标释放
const handleMouseUp = () => {
    isDraggingWindow.value = false
    isResizingLeft.value = false
    isResizingRight.value = false

    // 移除全局事件监听器
    window.removeEventListener("mousemove", handleMouseMove)
    window.removeEventListener("mouseup", handleMouseUp)
}
</script>

<template>
    <div class="w-full rounded-lg p-4 shadow-lg">
        <!-- 头部 -->
        <div class="flex justify-between items-center mb-4">
            <div class="flex gap-2">
                <label class="label text-sm">
                    启用动作序列
                    <input v-model="charSettings.actions.enable" type="checkbox" class="toggle toggle-secondary" />
                </label>
                <button class="btn btn-sm btn-primary" @click="addAction()">添加动作</button>
                <button class="btn btn-sm btn-secondary" @click="generateSampleHealthCurve()">生成血量曲线</button>
                <div class="text-sm opacity-50 self-center">总时长: {{ formatTime(totalDuration) }}</div>
            </div>
        </div>

        <!-- 时间轴容器 -->
        <div ref="timelineContainerRef" class="relative w-full timeline-container" :style="{ height: `${timelineHeight}px` }">
            <!-- 预览窗口范围 -->
            <div
                class="absolute top-0 bg-primary/50 h-4 cursor-move border-2 border-primary z-1"
                :style="{
                    left: `${(previewWindow.start / totalDuration) * 100}%`,
                    width: `${((previewWindow.end - previewWindow.start) / totalDuration) * 100}%`,
                }"
                @mousedown="handleTimelineMouseDown($event, 'window')"
            >
                <!-- 调整手柄 -->
                <div
                    class="absolute left-0 top-0 bottom-0 w-3 bg-primary cursor-w-resize"
                    @mousedown.stop="handleTimelineMouseDown($event, 'left')"
                ></div>
                <div
                    class="absolute right-0 top-0 bottom-0 w-3 bg-primary cursor-e-resize"
                    @mousedown.stop="handleTimelineMouseDown($event, 'right')"
                ></div>
            </div>

            <!-- 时间刻度 -->
            <div class="absolute top-0 left-0 right-0 h-6">
                <div
                    v-for="mark in visibleTimeMarks"
                    :key="`time-mark-${mark.time}`"
                    class="absolute top-0 w-4 flex flex-col items-center"
                    :style="{ left: `${mark.position - 8}px` }"
                >
                    <!-- 刻度线 -->
                    <div class="w-px h-4 bg-gray-600"></div>
                    <!-- 时间标签 -->
                    <div class="text-xs text-gray-400 mt-1">{{ mark.label }}</div>
                </div>
            </div>

            <!-- 血量曲线区域 -->
            <div
                ref="healthCurveContainerRef"
                class="absolute top-6 left-0 right-0 h-20 border-b border-gray-700 cursor-crosshair"
                @click="handleAddHealthPoint"
                @mouseenter.passive="handleHealthCurveMouseEnter()"
                @mousemove.passive="handleHealthCurveMouseMove($event)"
                @mouseleave.passive="handleHealthCurveMouseLeave()"
            >
                <svg class="w-full h-full">
                    <!-- 血量曲线填充 -->
                    <path v-if="healthCurveFillPath" :d="healthCurveFillPath" fill="#ef444420" />
                    <!-- 血量曲线 -->
                    <path
                        v-if="healthCurvePath"
                        :d="healthCurvePath"
                        fill="none"
                        stroke="#ef4444"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                    <!-- 血量点标记 -->
                    <circle
                        v-for="(point, index) in visibleHealthPoints"
                        :key="`health-point-${index}`"
                        :cx="(point.time - previewWindow.start) * timelineScale"
                        :cy="chartHeight - (point.value / 100) * chartHeight"
                        r="5"
                        fill="#ef4444"
                        stroke="white"
                        stroke-width="2"
                        class="cursor-move hover:fill-red-500"
                        @mousedown="
                            startDragHealthPoint(
                                $event,
                                healthPoints.findIndex(p => p.id === point.id)
                            )
                        "
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

            <!-- 动作序列预览区域 -->
            <div class="absolute top-26 left-0 right-0" :style="{ height: `${timelineHeight - 40}px` }">
                <!-- 动作条 -->
                <div
                    v-for="(action, _index) in visibleActions"
                    :key="action.id"
                    class="absolute h-8 bg-primary rounded-md flex items-center px-2 text-xs shadow-md"
                    :class="{ 'bg-gray-700': action.skill === '' }"
                    :style="{
                        left: `${(action.startTime - previewWindow.start) * timelineScale}px`,
                        width: `${(action.endTime - action.startTime) * timelineScale}px`,
                        top: `10px`, // 多行显示
                    }"
                >
                    <!-- 技能名称 -->
                    <div class="flex items-center gap-2">
                        <span>{{ action.skill || "延迟" }}</span>
                        <span v-if="action.times && action.times > 1" class="text-xs text-gray-300">×{{ action.times }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 动作列表 -->
        <div class="mt-4 rounded-lg p-2">
            <h4 class="text-sm font-semibold mb-2">动作列表</h4>
            <div class="space-y-2">
                <div v-for="(action, index) in actions" :key="action.id" class="flex items-center gap-2 p-2 rounded-md">
                    <div class="flex-1 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-400 w-12">动作 {{ index + 1 }}:</span>
                            <div class="flex items-center gap-2 flex-1">
                                <!-- 技能选择 -->
                                <Select
                                    v-model="actionSkillStates[action.id].skill"
                                    class="input input-bordered input-xs flex-1"
                                    @update:model-value="
                                        updateActionSkillExpr(
                                            action.id,
                                            actionSkillStates[action.id].skill,
                                            actionSkillStates[action.id].field
                                        )
                                    "
                                >
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
                                <!-- 字段输入 -->
                                <input
                                    v-model="actionSkillStates[action.id].field"
                                    type="text"
                                    placeholder="表达式, 如: 伤害"
                                    class="input input-bordered input-xs w-32"
                                    @update:model-value="
                                        updateActionSkillExpr(
                                            action.id,
                                            actionSkillStates[action.id].skill,
                                            actionSkillStates[action.id].field
                                        )
                                    "
                                />
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">持续:</span>
                            <input
                                type="number"
                                v-model.number="action.duration"
                                class="input input-xs input-bordered w-16"
                                min="0.1"
                                max="10"
                                step="0.1"
                            />
                            <span class="text-xs text-gray-400">秒</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">循环:</span>
                            <input
                                type="number"
                                v-model.number="action.times"
                                class="input input-xs input-bordered w-16"
                                min="1"
                                max="10"
                            />
                            <span class="text-xs text-gray-400">次</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">BUFF组:</span>
                            <select v-model="action.buffGroupIndex" class="select select-xs select-bordered w-20">
                                <option value="-">-</option>
                                <option v-for="(_, index) in buffGroups" :key="`buff-group-option-${index}`" :value="index">
                                    {{ index + 1 }}
                                </option>
                            </select>
                        </div>
                        <div class="flex items-center gap-1">
                            <button class="btn btn-xs btn-primary" @click="moveActionUp(action.id)" title="上移" :disabled="index === 0">
                                ↑
                            </button>
                            <button
                                class="btn btn-xs btn-primary"
                                @click="moveActionDown(action.id)"
                                title="下移"
                                :disabled="index === actions.length - 1"
                            >
                                ↓
                            </button>
                            <button class="btn btn-xs btn-error" @click="deleteAction(action.id)">删除</button>
                        </div>
                    </div>
                </div>
                <div v-if="actions.length === 0" class="text-center text-gray-500 py-4 text-sm">暂无动作，请点击"添加动作"按钮添加</div>
            </div>
        </div>

        <!-- 背景动作列表 -->
        <div class="mt-4 rounded-lg p-2">
            <div class="flex justify-between items-center mb-2">
                <h4 class="text-sm font-semibold">背景动作列表</h4>
                <button class="btn btn-sm btn-primary" @click="addBackgroundAction()">添加背景动作</button>
            </div>
            <div class="space-y-2">
                <div
                    v-for="(action, index) in backgroundActions"
                    :key="action.id"
                    class="flex items-center gap-2 p-2 rounded-md bg-gray-800/30"
                >
                    <div class="flex-1 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-400 w-16">背景动作 {{ index + 1 }}:</span>
                            <div class="flex items-center gap-2 flex-1">
                                <!-- 技能选择 -->
                                <Select
                                    v-model="actionSkillStates[action.id].skill"
                                    class="input input-bordered input-sm flex-1"
                                    @update:model-value="
                                        updateActionSkillExpr(
                                            action.id,
                                            actionSkillStates[action.id].skill,
                                            actionSkillStates[action.id].field
                                        )
                                    "
                                >
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
                                <!-- 字段输入 -->
                                <input
                                    v-model="actionSkillStates[action.id].field"
                                    type="text"
                                    placeholder="表达式, 如: 伤害"
                                    class="input input-bordered input-sm w-32"
                                    @update:model-value="
                                        updateActionSkillExpr(
                                            action.id,
                                            actionSkillStates[action.id].skill,
                                            actionSkillStates[action.id].field
                                        )
                                    "
                                />
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">延迟:</span>
                            <input
                                type="number"
                                v-model.number="action.delay"
                                class="input input-xs input-bordered w-16"
                                min="0"
                                max="10"
                                step="0.1"
                            />
                            <span class="text-xs text-gray-400">秒</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">间隔:</span>
                            <input
                                type="number"
                                v-model.number="action.interval"
                                class="input input-xs input-bordered w-16"
                                min="0.1"
                                max="10"
                                step="0.1"
                            />
                            <span class="text-xs text-gray-400">秒</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">循环:</span>
                            <input
                                type="number"
                                v-model.number="action.times"
                                class="input input-xs input-bordered w-16"
                                min="1"
                                max="10"
                            />
                            <span class="text-xs text-gray-400">次</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-gray-400">BUFF组:</span>
                            <select v-model="action.buffGroupIndex" class="select select-xs select-bordered w-20">
                                <option value="-">-</option>
                                <option v-for="(_, index) in buffGroups" :key="`buff-group-option-${index}`" :value="index">
                                    {{ index + 1 }}
                                </option>
                            </select>
                        </div>
                        <div class="flex items-center gap-1">
                            <button
                                class="btn btn-xs btn-primary"
                                @click="moveBackgroundActionUp(action.id)"
                                title="上移"
                                :disabled="index === 0"
                            >
                                ↑
                            </button>
                            <button
                                class="btn btn-xs btn-primary"
                                @click="moveBackgroundActionDown(action.id)"
                                title="下移"
                                :disabled="index === backgroundActions.length - 1"
                            >
                                ↓
                            </button>
                            <button class="btn btn-xs btn-error" @click="deleteBackgroundAction(action.id)">删除</button>
                        </div>
                    </div>
                </div>
                <div v-if="backgroundActions.length === 0" class="text-center text-gray-500 py-4 text-sm">
                    暂无背景动作，请点击"添加背景动作"按钮添加
                </div>
            </div>
        </div>

        <!-- BUFF组列表 -->
        <div class="mt-4 rounded-lg p-2">
            <div class="flex justify-between items-center mb-2">
                <h4 class="text-sm font-semibold">BUFF组</h4>
                <button class="btn btn-sm btn-primary" @click="addBuffGroup">添加BUFF组</button>
            </div>
            <div class="space-y-2">
                <div
                    v-for="(buffGroup, index) in buffGroups"
                    :key="`buff-group-${index}`"
                    class="flex items-center gap-2 p-2 rounded-md bg-gray-800/30"
                >
                    <div class="flex-1 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-400 w-16">BUFF组 {{ index + 1 }}:</span>
                            <div class="flex-1 text-sm text-gray-300">
                                <span v-if="buffGroup.length === 0" class="text-gray-500">未选择BUFF</span>
                                <span v-else>{{ buffGroup.map(([name, lv]) => `${name}×${lv}`).join(", ") }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button class="btn btn-xs btn-primary" @click="openBuffEditor(index)" title="编辑BUFF组">编辑</button>
                        <button class="btn btn-xs btn-error" @click="deleteBuffGroup(index)" title="删除BUFF组">删除</button>
                    </div>
                </div>
                <div v-if="buffGroups.length === 0" class="text-center text-gray-500 py-4 text-sm">
                    暂无BUFF组，请点击"添加BUFF组"按钮添加
                </div>
            </div>
        </div>
    </div>

    <!-- BUFF编辑器弹窗 -->
    <DialogModel v-model="showBuffEditor" @submit="updateBuffGroup(currentSelectedBuffs)">
        <div class="flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold">编辑BUFF组</h3>
            </div>
            <div class="flex-1 overflow-y-auto">
                <BuffEditer
                    :buff-options="buffOptions"
                    :selected-buffs="currentSelectedBuffs"
                    :char-build="charBuild"
                    @toggle-buff="toggleBuff"
                    @set-buff-lv="setBuffLv"
                />
            </div>
        </div>
    </DialogModel>
</template>
