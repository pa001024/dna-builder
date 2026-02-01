<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, PropInfo as DNAPropInfo, RoleInfo as DNARoleInfo, PropCategory } from "dna-api"
import * as echarts from "echarts"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { db, PropFlow } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

// 定义组件属性
defineProps<{
    nobtn?: boolean
}>()

const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI
let chartInstance: echarts.ECharts | null = null

// 状态管理
const loading = ref(true)
const lastUpdateTime = useLocalStorage("dna.propFlow.lastUpdateTime", 0)
const selectedRole = ref<string>("")
const selectedPropCategory = ref<string>("Resource")
const propName = useLocalStorage("dna.propFlow.propName", "")
const queryDate = ref(new Date().toISOString().split("T")[0])
const propFlowList = ref<PropFlow[]>([])
const isVerified = computed(() => selectedVerifyRole.value?.is_verified || false)
const lastQueryTime = useLocalStorage("dna.propFlow.lastQueryTime", 0)
const queryColdDown = computed(() => 1000 * 60 - (ui.timeNow - lastQueryTime.value))
const chartRef = ref<HTMLElement | null>(null)

// 批量查询相关状态
const isBatchQuerying = ref(false) // 是否正在批量查询
const batchQueryStopped = ref(false) // 是否已停止批量查询
const batchQueryProgress = ref({
    currentPage: 0, // 当前查询页数
    currentDate: 0, // 当前查询日期索引
    totalRecords: 0, // 总记录数
    totalPages: 0, // 总页数
    totalDates: 0, // 总日期数
})
const queryDates = ref<string[]>([]) // 待查询的日期列表

// 时间范围选择
const timeRangeOptions = [
    { label: "过去1天", value: 1 },
    { label: "过去3天", value: 3 },
    { label: "过去7天", value: 7 },
    { label: "过去30天", value: 30 },
]
const selectedTimeRange = ref(1)

// remark相关
const availableRemarks = ref<string[]>([])

// 数据列表
const roles = useLocalStorage<DNARoleInfo[]>("dna.propFlow.roles", [])
const propCategories = useLocalStorage<PropCategory[]>("dna.propFlow.propCategories", [])

// 验证码相关
const mailCode = ref("")
const showVerifyModal = ref(false)
const selectedVerifyRole = computed(() => roles.value.find(role => role.role_id === selectedRole.value))

// 手机号登录相关状态
const showPhoneLoginModal = ref(false)
const phoneNumber = ref("")
const phoneVerifyCode = ref("")
const captchaImage = ref("")
const captchaCode = ref("")
const lastSmsTime = useLocalStorage("dna.propFlow.lastSmsTime", 0)
const smsColdDown = computed(() => 1000 * 60 - (ui.timeNow - lastSmsTime.value))

const handleChartResize = () => {
    chartInstance?.resize()
}
// 初始化组件
onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        ui.showErrorMessage("请先登录")
        return
    }
    api = t
    await loadData()
    if (roles.value.length > 0) {
        selectedRole.value = roles.value[0].role_id
    }
    // 首屏加载数据
    await loadDisplayData()

    // 监听窗口大小变化，自动调整图表大小
    window.addEventListener("resize", handleChartResize)
})

onUnmounted(() => {
    window.removeEventListener("resize", handleChartResize)
    if (chartInstance) {
        chartInstance.dispose()
        chartInstance = null
    }
})

/**
 * 检查并刷新KF Token
 */
async function checkAndRefreshKFToken() {
    try {
        // 检查kf_token是否为空
        if (!api.kf.kf_token) {
            // 执行sdkLogin获取新token
            const res = await api.kf.sdkLogin()
            if (res.is_success && res.data?.token) {
                const newToken = res.data.token
                // 保存token到数据库
                await setting.saveKFToken(newToken)
                api.kf.kf_token = newToken
            } else {
                // sdkLogin失败，显示手机号登录弹窗
                ui.showErrorMessage("sdk登录失败，将使用手机号登录")
                showPhoneLoginModal.value = true
                // 自动获取验证码图片
                await getCaptcha()
            }
        }
    } catch (e) {
        console.error("刷新KF Token失败", e)
        ui.showErrorMessage("刷新客服token失败")
    }
}

/**
 * 加载所有数据
 */
async function loadData(force = false) {
    try {
        // 检查是否需要强制刷新或缓存过期
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }

        loading.value = true

        // 检查并刷新KF Token
        await checkAndRefreshKFToken()
        // 并行加载所有基础数据
        await Promise.all([loadRoles(), loadPropCategories()])

        lastUpdateTime.value = ui.timeNow
    } catch (e) {
        console.error(e)
        ui.showErrorMessage("加载数据失败")
    } finally {
        loading.value = false
    }
}

/**
 * 加载角色列表
 */
async function loadRoles() {
    try {
        const res = await api.kf.getRole()
        if (res.is_success && res.data) {
            roles.value = res.data
            // 默认选择第一个角色
            if (roles.value.length > 0 && !selectedRole.value) {
                selectedRole.value = roles.value[0].role_id
            }
        } else if (!res.is_success || !res.msg.includes("未登录")) {
            roles.value = res.data
            api.kf.kf_token = ""
            await setting.saveKFToken("")
        }
    } catch (e) {
        ui.showErrorMessage("加载角色列表失败")
    }
}

/**
 * 加载道具分类列表
 */
async function loadPropCategories() {
    try {
        const res = await api.kf.getPropCategory()
        if (res.is_success && res.data) {
            propCategories.value = res.data
        }
    } catch (e) {
        ui.showErrorMessage("加载道具分类失败")
    }
}

/**
 * 发送游戏内邮件验证码
 */
async function sendGameMail() {
    if (!selectedVerifyRole.value) return

    try {
        const res = await api.kf.sendGameMail(selectedVerifyRole.value.role_id)
        if (res.is_success) {
            ui.showSuccessMessage("验证码已发送到游戏内邮件")
        } else {
            ui.showErrorMessage(res.msg || "发送验证码失败")
        }
    } catch (e) {
        ui.showErrorMessage("发送验证码失败")
    }
}

/**
 * 验证游戏内邮件验证码
 */
async function verifyRoleMail() {
    if (!selectedVerifyRole.value || !mailCode.value) return

    try {
        const res = await api.kf.verifyRoleMailCode(mailCode.value)
        if (res.is_success) {
            ui.showSuccessMessage("角色验证成功")
            showVerifyModal.value = false
            mailCode.value = ""
            // 重新加载角色列表以更新验证状态
            await loadRoles()
        } else {
            ui.showErrorMessage(res.msg || "验证失败")
        }
    } catch (e) {
        ui.showErrorMessage("验证失败")
    }
}

/**
 * 获取验证码图片
 */
async function getCaptcha() {
    try {
        const res = await api.kf.captcha()
        if (res.is_success && res.data) {
            captchaImage.value = res.data.picPath
        } else {
            ui.showErrorMessage("获取验证码失败")
        }
    } catch (e) {
        console.error("获取验证码失败", e)
        ui.showErrorMessage("获取验证码失败")
    }
}

/**
 * 发送短信验证码
 */
async function sendVerifyCode() {
    if (!phoneNumber.value || !captchaImage.value) {
        ui.showErrorMessage("请输入手机号并获取验证码")
        return
    }

    try {
        const res = await api.kf.sendVerifyCode(phoneNumber.value, captchaCode.value)
        if (res.is_success) {
            ui.showSuccessMessage("短信验证码已发送")
            // 开始倒计时
            lastSmsTime.value = ui.timeNow
        } else {
            ui.showErrorMessage(res.msg || "发送验证码失败")
        }
    } catch (e) {
        console.error("发送短信失败", e)
        ui.showErrorMessage("发送短信失败")
    }
}

/**
 * 手机号登录
 */
async function loginByPhone() {
    if (!phoneNumber.value || !phoneVerifyCode.value || !Number.isInteger(+phoneVerifyCode.value)) {
        ui.showErrorMessage("请输入手机号和验证码")
        return
    }

    try {
        const res = await api.kf.loginByPhone(phoneNumber.value, +phoneVerifyCode.value)
        if (res.is_success && res.data?.token) {
            const newToken = res.data.token
            // 保存token到数据库
            await setting.saveKFToken(newToken)
            ui.showSuccessMessage("登录成功")
            showPhoneLoginModal.value = false
            phoneNumber.value = ""
            phoneVerifyCode.value = ""
            await loadData()
        } else {
            ui.showErrorMessage(res.msg || "登录失败")
        }
    } catch (e) {
        console.error("手机号登录失败", e)
        ui.showErrorMessage("登录失败")
    }
}

/**
 * 打开验证模态框
 */
function openVerifyModal() {
    showVerifyModal.value = true
}

/**
 * 将流水数据保存到数据库
 */
async function savePropFlowToDB(data: DNAPropInfo[]) {
    if (!data || data.length === 0) return

    try {
        // 第一步：按时间、道具名称和remark分组，合并同一时间、同一道具、同一remark的多条记录
        const groupedData = new Map<string, { item: DNAPropInfo; totalChange: number }>()

        for (const item of data) {
            const key = `${item.time}-${item.prop_name}-${item.remark}`
            const changeValue = parseFloat(item.change) || 0

            if (groupedData.has(key)) {
                // 如果已有记录，累加change值
                const existing = groupedData.get(key)!
                existing.totalChange += changeValue
            } else {
                // 如果没有记录，创建新记录
                groupedData.set(key, { item, totalChange: changeValue })
            }
        }

        // 第二步：转换为数据库所需格式，将字符串change转换为number
        const processedData = Array.from(groupedData.values()).map(({ item, totalChange }) => ({
            time: item.time,
            prop_name: item.prop_name,
            category_id: item.category_id,
            category_name: item.category_name,
            remark: item.remark,
            change: totalChange, // 使用合并后的数值
        }))

        // 第三步：检查数据库中是否已存在相同的记录
        const existingRecords = await db.propFlows
            .where("time")
            .anyOf(processedData.map(item => item.time))
            .toArray()
        const existingKeys = new Set(existingRecords.map(record => `${record.time}-${record.prop_name}-${record.remark}`))

        // 第四步：过滤出需要插入的新记录
        const newRecords = processedData.filter(item => {
            const key = `${item.time}-${item.prop_name}-${item.remark}`
            return !existingKeys.has(key)
        })

        if (newRecords.length > 0) {
            await db.propFlows.bulkAdd(newRecords)
            console.debug(`保存了 ${newRecords.length} 条新的流水记录`)
        }
    } catch (error) {
        console.error("保存道具流水到数据库失败:", error)
    }
}

/**
 * 从数据库加载并显示数据，支持时间范围、道具分类和名称筛选
 */
async function loadDisplayData() {
    try {
        loading.value = true

        // 计算日期范围：从queryDate减去selectedTimeRange天到queryDate当天结束
        const endDate = new Date(queryDate.value)
        // 设置为queryDate当天的结束时间
        endDate.setHours(23, 59, 59, 999)

        const startDate = new Date(queryDate.value)
        // 减去selectedTimeRange-1天，因为要包含当天
        startDate.setDate(endDate.getDate() - selectedTimeRange.value + 1)
        // 设置为开始日期的凌晨0点
        startDate.setHours(0, 0, 0, 0)

        const startTimestamp = Math.floor(startDate.getTime() / 1000) // 开始时间
        const endTimestamp = Math.floor(endDate.getTime() / 1000)

        // 从数据库查询数据
        let historyData = await db.propFlows
            .where("time")
            .between(startTimestamp, endTimestamp)
            .and(item => {
                return (
                    (!propName.value || item.prop_name.includes(propName.value)) &&
                    (!selectedPropCategory.value || selectedPropCategory.value === "-" || item.category_id === selectedPropCategory.value)
                )
            })
            .toArray()

        // 转换为PropInfo类型，将number类型的change转换为带符号的字符串
        propFlowList.value = historyData

        // 渲染图表
        await nextTick()
        renderChart()
    } catch (error) {
        console.error("加载显示数据失败:", error)
        ui.showErrorMessage("加载数据失败")
    } finally {
        loading.value = false
    }
}

/**
 * 查询道具流水
 */
async function queryPropFlow() {
    if (!selectedRole.value || !isVerified.value) {
        ui.showErrorMessage("请先选择并验证角色")
        return
    }

    try {
        // 检查并刷新KF Token
        await checkAndRefreshKFToken()

        loading.value = true
        const res = await api.kf.queryFlow(queryDate.value, propName.value, selectedRole.value, selectedPropCategory.value)

        if (res.is_success && res.data) {
            lastUpdateTime.value = ui.timeNow
            lastQueryTime.value = ui.timeNow

            // 保存到数据库
            await savePropFlowToDB(res.data)

            // 从数据库加载并显示数据，支持筛选
            await loadDisplayData()
        } else {
            ui.showErrorMessage(res.msg || "查询失败")
        }
    } catch (e) {
        ui.showErrorMessage("查询失败")
    } finally {
        loading.value = false
    }
}

/**
 * 生成查询日期列表
 */
function generateQueryDates() {
    const dates: string[] = []
    const endDate = new Date(queryDate.value)
    const startDate = new Date(queryDate.value)
    startDate.setDate(endDate.getDate() - selectedTimeRange.value + 1)

    // 生成从开始日期到结束日期的所有日期字符串
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split("T")[0])
    }

    // 反转日期数组，从后往前查询
    return dates.reverse()
}

/**
 * 批量查询道具流水
 */
async function batchQueryPropFlow() {
    if (!selectedRole.value || !isVerified.value) {
        ui.showErrorMessage("请先选择并验证角色")
        return
    }

    // 初始化批量查询状态
    isBatchQuerying.value = true
    batchQueryStopped.value = false

    // 生成待查询的日期列表
    queryDates.value = generateQueryDates()
    batchQueryProgress.value = {
        currentPage: 0,
        currentDate: 0,
        totalRecords: 0,
        totalPages: 0,
        totalDates: queryDates.value.length,
    }
    // 检查并刷新KF Token
    await checkAndRefreshKFToken()

    try {
        // 遍历所有日期
        for (let dateIndex = 0; dateIndex < queryDates.value.length && !batchQueryStopped.value; dateIndex++) {
            const currentDate = queryDates.value[dateIndex]
            batchQueryProgress.value.currentDate = dateIndex

            // 检查冷却时间
            if (queryColdDown.value > 0) {
                // 等待冷却时间结束
                await new Promise(resolve => setTimeout(resolve, queryColdDown.value))
            }

            // 执行查询
            const res = await api.kf.queryFlow(currentDate, propName.value, selectedRole.value, selectedPropCategory.value)

            lastQueryTime.value = ui.timeNow

            if (res.is_success && res.data) {
                // 保存到数据库
                await savePropFlowToDB(res.data)
                await loadDisplayData()

                // 更新总记录数
                batchQueryProgress.value.totalRecords += res.data.length
            } else {
                ui.showErrorMessage(res.msg || "查询失败")
                break
            }
        }

        // 批量查询完成
        if (!batchQueryStopped.value) {
            ui.showSuccessMessage("批量查询完成")
        }
    } catch (e) {
        console.error("批量查询失败", e)
        ui.showErrorMessage("批量查询失败")
    } finally {
        isBatchQuerying.value = false
        batchQueryStopped.value = false
    }
}

/**
 * 停止批量查询
 */
function stopBatchQuery() {
    isBatchQuerying.value = false
    batchQueryStopped.value = true
    ui.showSuccessMessage("批量查询已停止")
}

/**
 * 处理图表数据
 */
function processChartData(data: PropFlow[]) {
    // 收集所有可用的remark
    const remarkSet = new Set<string>()
    data.forEach(item => remarkSet.add(item.remark))
    availableRemarks.value = Array.from(remarkSet).sort()

    // 按时间和remark分组统计
    const hourlyStats = new Map<string, Map<string, number>>()
    const timeKeys = new Set<string>()

    // 统计每个小时每个remark的流水总和
    for (const item of data) {
        const date = new Date(item.time * 1000)
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`
        const hourStr = `${date.getHours().toString().padStart(2, "0")}:00`
        const timeKey = `${dateStr} ${hourStr}`

        timeKeys.add(timeKey)

        if (!hourlyStats.has(timeKey)) {
            hourlyStats.set(timeKey, new Map())
        }

        const remarkMap = hourlyStats.get(timeKey)!
        const currentValue = remarkMap.get(item.remark) || 0
        remarkMap.set(item.remark, currentValue + (item.change || 0))
    }

    // 转换时间键为数组并按时间排序
    const sortedTimeKeys = Array.from(timeKeys).sort((a, b) => {
        return new Date(a).getTime() - new Date(b).getTime()
    })

    // 生成堆叠柱状图所需的series数据
    const series = availableRemarks.value.map(remark => {
        const data = sortedTimeKeys.map(timeKey => {
            return hourlyStats.get(timeKey)?.get(remark) || 0
        })

        return {
            name: remark,
            type: "bar" as const,
            data,
            stack: "total",
        }
    })

    return {
        categories: sortedTimeKeys,
        series,
    }
}

/**
 * 渲染图表
 */
function renderChart() {
    if (!chartRef.value) return

    // 初始化图表
    if (!chartInstance) {
        chartInstance = echarts.init(chartRef.value)
    }
    chartInstance.resize()

    // 处理数据
    const { categories, series } = processChartData(propFlowList.value)

    // 设置图表选项
    const option: echarts.EChartsOption = {
        title: {
            text: "每小时流水总和",
            left: "center",
            textStyle: {
                fontSize: 16,
                fontWeight: "bold",
            },
        },
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "shadow",
            },
            formatter: (params: any) => {
                let result = `${params[0].name}<br/>`
                let total = 0

                // 计算总和并格式化显示
                params.forEach((item: any) => {
                    total += item.value
                    result += `${item.marker}${item.seriesName}: ${item.value.toFixed(2)}<br/>`
                })

                result += `总计: ${total.toFixed(2)}`
                return result
            },
        },
        legend: {
            data: availableRemarks.value,
            orient: "horizontal",
            bottom: 0,
            left: "center",
            type: "scroll",
            // 点击图例时触发筛选
            selectedMode: "multiple",
            formatter: (name: string) => {
                return name.length > 15 ? name.substring(0, 15) + "..." : name
            },
        },
        xAxis: {
            type: "category",
            data: categories,
            axisLabel: {
                rotate: 45,
                formatter: (value: string) => {
                    // 格式化日期显示，只显示月-日 时:分
                    const date = new Date(value)
                    return `${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:00`
                },
            },
        },
        yAxis: {
            type: "value",
            name: "数量",
        },
        series: series.map((item, index) => ({
            ...item,
            itemStyle: {
                // 为不同的remark分配不同的颜色
                color: [
                    "#3b82f6",
                    "#10b981",
                    "#f59e0b",
                    "#ef4444",
                    "#8b5cf6",
                    "#ec4899",
                    "#06b6d4",
                    "#14b8a6",
                    "#f97316",
                    "#84cc16",
                    "#6366f1",
                    "#ec4899",
                ][index % 12],
            },
            emphasis: {
                itemStyle: {
                    // 高亮颜色
                    color: [
                        "#60a5fa",
                        "#34d399",
                        "#fbbf24",
                        "#f87171",
                        "#a78bfa",
                        "#f472b6",
                        "#22d3ee",
                        "#2dd4bf",
                        "#fb923c",
                        "#a3e635",
                        "#818cf8",
                        "#f472b6",
                    ][index % 12],
                },
            },
            barWidth: "60%",
        })),
        grid: {
            left: "3%",
            right: "4%",
            bottom: "20%",
            containLabel: true,
        },
    }

    // 渲染图表 - 使用notMerge: true完全替换所有配置，确保过滤后的数据和图例完全匹配
    chartInstance.setOption(option, { notMerge: true })
}

import * as dialog from "@tauri-apps/plugin-dialog"
import { debounce } from "lodash-es"
import * as XLSX from "xlsx"
import { exportBinaryFile } from "@/api/app"
import { env } from "../env"

const debouncedLoadDisplayData = debounce(() => {
    loadDisplayData()
}, 300)
// 添加防抖watch，当资源类型、道具名称、查询日期或时间范围变化时，重新加载数据
watch([selectedPropCategory, propName, queryDate, selectedTimeRange], debouncedLoadDisplayData, { immediate: false })

/**
 * 导出数据库所有记录到Excel文件
 */
async function exportToExcel() {
    try {
        // 获取数据库中所有的流水记录
        const allRecords = await db.propFlows.toArray()

        // 转换数据格式，将时间戳转换为可读日期
        const excelData = allRecords.map(record => ({
            时间: new Date(record.time * 1000).toLocaleString(),
            道具名称: record.prop_name,
            分类: record.category_name,
            数量变化: record.change,
            备注: record.remark,
        }))

        // 创建工作簿和工作表
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.json_to_sheet(excelData)

        // 设置列宽
        const colWidths = [
            { wch: 20 }, // 时间列
            { wch: 20 }, // 道具名称列
            { wch: 15 }, // 分类列
            { wch: 15 }, // 数量变化列
            { wch: 40 }, // 备注列
        ]
        worksheet["!cols"] = colWidths

        // 将工作表添加到工作簿
        XLSX.utils.book_append_sheet(workbook, worksheet, "道具流水记录")

        // 生成Excel文件
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

        if (env.isApp) {
            // 桌面端：使用对话框保存文件
            const path = await dialog.save({
                title: "保存道具流水为Excel文件",
                defaultPath: `道具流水_${new Date().toISOString().split("T")[0]}.xlsx`,
                filters: [{ name: "Excel 文件", extensions: ["xlsx"] }],
            })

            if (path) {
                // 将ArrayBuffer转换为Uint8Array
                const uint8Array = new Uint8Array(excelBuffer)
                await exportBinaryFile(path, uint8Array)
                ui.showSuccessMessage("导出成功")
            }
        } else {
            // 网页端：使用Blob和a标签下载
            const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `道具流水_${new Date().toISOString().split("T")[0]}.xlsx`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            ui.showSuccessMessage("导出成功")
        }
    } catch (e) {
        console.error("导出Excel失败", e)
        ui.showErrorMessage("导出失败")
    }
}

// 暴露方法给父组件
defineExpose({
    loadData,
    lastUpdateTime,
})
</script>

<template>
    <div class="space-y-6">
        <!-- 刷新按钮 -->
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs text-gray-500">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip tooltip="刷新" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center items-center h-12 py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <div class="space-y-6">
            <!-- 查询表单 -->
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title text-xl font-bold">
                        道具流水查询

                        <button class="btn btn-primary btn-sm ml-auto" @click="exportToExcel" :disabled="loading">导出EXCEL</button>
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                        <!-- 角色 -->
                        <div>
                            <label class="label">
                                <span class="label-text font-medium">角色</span>
                            </label>
                            <div class="relative">
                                <Select v-model="selectedRole" class="input w-full">
                                    <SelectItem v-for="role in roles" :key="role.role_id" :value="role.role_id">
                                        {{ role.role_name }}
                                        <span v-if="role.is_verified === 1" class="text-green-500">(已验证)</span>
                                        <span v-else class="text-red-500">(未验证)</span>
                                    </SelectItem>
                                </Select>
                                <button
                                    v-if="selectedVerifyRole?.is_verified === 0"
                                    class="btn btn-sm btn-primary absolute right-1 top-1"
                                    @click="openVerifyModal()"
                                >
                                    验证
                                </button>
                            </div>
                        </div>

                        <!-- 查询日期 -->
                        <div>
                            <label class="label">
                                <span class="label-text font-medium">查询日期</span>
                            </label>
                            <input v-model="queryDate" type="date" class="input input-bordered w-full" />
                        </div>

                        <!-- 时间范围 -->
                        <div>
                            <label class="label">
                                <span class="label-text font-medium">时间范围</span>
                            </label>
                            <Select v-model="selectedTimeRange" class="input w-full">
                                <SelectItem v-for="option in timeRangeOptions" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </SelectItem>
                            </Select>
                        </div>

                        <!-- 查询按钮 -->
                        <div class="flex items-end">
                            <button
                                class="btn btn-primary w-full"
                                :disabled="loading || queryColdDown > 0 || isBatchQuerying"
                                @click="queryPropFlow()"
                            >
                                <span v-if="loading">加载中...</span>
                                <span v-else-if="queryColdDown > 0"> 冷却中 {{ ~~(queryColdDown / 1000) | 0 }} 秒 </span>
                                <span v-else> 查询流水 </span>
                            </button>
                        </div>

                        <!-- 道具分类 -->
                        <div>
                            <label class="label">
                                <span class="label-text font-medium">道具分类</span>
                            </label>
                            <Select v-model="selectedPropCategory" class="input w-full">
                                <SelectItem v-for="category in propCategories" :key="category.id" :value="category.id">
                                    {{ category.name }}
                                </SelectItem>
                            </Select>
                        </div>

                        <!-- 道具名称 -->
                        <div>
                            <label class="label">
                                <span class="label-text font-medium">道具名称</span>
                            </label>
                            <Combobox
                                v-model="propName"
                                placeholder="可选，留空查询所有道具"
                                class="input-md! input-bordered w-full"
                                :options="['时之纺线', '皎皎之民的信物', '委托密函线索'].map(v => ({ label: v, value: v }))"
                            />
                        </div>
                        <!-- 批量查询按钮 -->
                        <div class="flex items-end">
                            <button
                                class="btn w-full"
                                :class="isBatchQuerying ? 'btn-error' : 'btn-primary'"
                                @click="isBatchQuerying ? stopBatchQuery() : batchQueryPropFlow()"
                            >
                                {{ isBatchQuerying ? "停止批量查询" : "开始批量查询" }}
                            </button>
                        </div>

                        <!-- 批量查询进度 -->
                        <div v-if="isBatchQuerying">
                            <label class="label">
                                <span class="label-text font-medium">进度显示</span>
                            </label>
                            <div class="flex items-center h-full">
                                已查询 {{ batchQueryProgress.currentDate }} 日 共 {{ batchQueryProgress.totalRecords }} 条记录
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 统计图表 -->
            <div v-show="propFlowList.length > 0" class="card bg-base-100 shadow-xl py-4">
                <div ref="chartRef" class="w-full h-100"></div>
            </div>

            <!-- 流水列表 -->
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title text-lg font-semibold mb-4">流水记录明细</h3>

                    <div v-if="propFlowList.length === 0" class="text-center py-12">
                        <div class="text-gray-400 mb-2 flex justify-center items-center">
                            <Icon icon="ri:database-2-line" class="w-16 h-16" />
                        </div>
                        <p class="text-lg text-gray-500">暂无流水记录</p>
                        <p class="text-sm text-gray-400 mt-2">请先查询道具流水</p>
                    </div>

                    <div v-else class="overflow-x-auto">
                        <table class="table table-compact w-full table-hover">
                            <thead>
                                <tr>
                                    <th class="text-left">时间</th>
                                    <th class="text-left">道具名称</th>
                                    <th class="text-left">分类</th>
                                    <th class="text-left">数量变化</th>
                                    <th class="text-left">备注</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(item, index) in propFlowList" :key="index" class="transition-colors hover:bg-base-300">
                                    <td>{{ new Date(item.time * 1000).toLocaleString() }}</td>
                                    <td class="font-medium">{{ item.prop_name }}</td>
                                    <td>{{ item.category_name }}</td>
                                    <td :class="item.change > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'">
                                        {{ item.change > 0 ? "+" : "" }}{{ item.change }}
                                    </td>
                                    <td class="text-sm text-gray-600">{{ item.remark }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 角色验证模态框 -->
    <DialogModel v-model="showVerifyModal">
        <h3 class="font-bold text-lg">角色验证</h3>
        <p class="py-4">请输入游戏内邮件收到的验证码</p>

        <div class="space-y-4">
            <div>
                <label class="label">
                    <span class="label-text">验证码</span>
                </label>
                <div class="flex gap-2">
                    <input v-model="mailCode" type="text" placeholder="请输入验证码" class="input input-bordered flex-1" />
                    <button @click="sendGameMail" class="btn btn-secondary">发送验证码</button>
                </div>
            </div>
        </div>
        <template #action>
            <button @click="showVerifyModal = false" class="btn">取消</button>
            <button @click="verifyRoleMail" class="btn btn-primary">验证</button>
        </template>
    </DialogModel>

    <!-- 手机号登录模态框 -->
    <DialogModel v-model="showPhoneLoginModal">
        <h3 class="font-bold text-lg">手机号登录</h3>
        <p class="py-4">自动登录失败, 请使用手机号登录获取客服token</p>

        <div class="space-y-4">
            <!-- 手机号输入 -->
            <div>
                <label class="label">
                    <span class="label-text">手机号</span>
                </label>
                <input v-model="phoneNumber" type="tel" placeholder="请输入手机号" class="input input-bordered w-full" maxlength="11" />
            </div>

            <!-- 验证码图片 -->
            <div>
                <label class="label">
                    <span class="label-text">图形验证码</span>
                </label>
                <div class="flex gap-2 items-center">
                    <input
                        v-model="captchaCode"
                        type="text"
                        placeholder="请输入图形验证码"
                        class="input input-bordered w-full"
                        maxlength="6"
                    />
                    <img
                        v-if="captchaImage"
                        :src="captchaImage"
                        alt="验证码"
                        class="w-40 h-12 object-cover border rounded cursor-pointer bg-white"
                        @click="getCaptcha"
                    />
                </div>
            </div>

            <!-- 短信验证码 -->
            <div>
                <label class="label">
                    <span class="label-text">短信验证码</span>
                </label>
                <div class="flex gap-2">
                    <input
                        v-model="phoneVerifyCode"
                        type="text"
                        placeholder="请输入短信验证码"
                        class="input input-bordered flex-1"
                        maxlength="6"
                    />
                    <button @click="sendVerifyCode" class="btn btn-secondary" :disabled="smsColdDown > 0 || captchaCode.length !== 6">
                        {{ smsColdDown > 0 ? `${~~(smsColdDown / 1000) | 0}s` : "发送验证码" }}
                    </button>
                </div>
            </div>
        </div>
        <template #action>
            <button @click="showPhoneLoginModal = false" class="btn">取消</button>
            <button @click="loginByPhone" class="btn btn-primary">登录</button>
        </template>
    </DialogModel>
</template>
