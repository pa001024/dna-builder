<script lang="ts" setup>
import { ref } from "vue"

/** 组件调试页状态：只服务视觉核对，不做业务 */
const inputText = ref("DPS 估算")
const inputNumber = ref(1234.5)
const textareaText = ref("支持多行文本的调试样例。")
const selectValue = ref("b")
const toggleOn = ref(true)
const checkOn = ref(true)
const radioValue = ref("b")
const rangeValue = ref(62)
const progressValue = ref(45)
const tabValue = ref("a")
const dialogOpen = ref(false)
const dropdownOpen = ref(false)
const collapseOpen = ref(true)

/** Combobox 演示值 */
const comboValue = ref("")
const comboTab = ref("a")
const comboOptions = ["攻击", "生命", "防御", "护盾", "威力", "耐久", "范围", "效益", "增伤"].map(prop => ({ label: prop, value: prop }))

/** 弹窗里的表单值 */
const formName = ref("煌明")
const formLevel = ref(80)

/**
 * 临时切换主题，仅用于调试组件在明暗两套令牌下的表现。
 * 直接改 body 属性，不写设置 store；再次进入设置页或刷新后由应用主题覆盖回来。
 * @param name 内置主题名
 */
function previewTheme(name: string) {
    document.body.setAttribute("data-theme", name)
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="mx-auto max-w-5xl space-y-4 p-4 stagger-rise">
            <!-- 页头：kicker + 说明 -->
            <header class="relative overflow-hidden border-b-2 border-primary pb-4">
                <div
                    class="pointer-events-none absolute inset-0"
                    style="
                        background-image:
                            linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                            linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                        background-size: 26px 26px;
                        mask-image: linear-gradient(to bottom, black, transparent 85%);
                    "
                    aria-hidden="true"
                />
                <span
                    class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    aria-hidden="true"
                />
                <div class="relative">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Component Lab
                    </p>
                    <div class="flex flex-wrap items-end justify-between gap-2">
                        <h1 class="font-orbitron text-xl font-bold text-base-content">dob-ui 组件调试</h1>
                        <div class="flex gap-1">
                            <button class="btn btn-xs" @click="previewTheme('dark')">深色</button>
                            <button class="btn btn-xs" @click="previewTheme('light')">浅色</button>
                            <button class="btn btn-xs" @click="previewTheme('cyberpunk')">cyberpunk</button>
                        </div>
                    </div>
                    <p class="mt-1 text-xs text-base-content/55">
                        所有组件与常用组合场景。改 <code class="font-mono text-primary">packages/dob-ui/db/</code> 后
                        dev server 会直接热更新。
                    </p>
                </div>
            </header>

            <!-- 按钮 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="BUTTON" title="按钮 / 方章" :count="19" />
                <div class="space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <button class="btn btn-sm">普通</button>
                        <button class="btn btn-sm btn-primary">主要</button>
                        <button class="btn btn-sm btn-secondary">次要</button>
                        <button class="btn btn-sm btn-accent">强调</button>
                        <button class="btn btn-sm btn-ghost">幽灵</button>
                        <button class="btn btn-sm btn-outline">描边</button>
                        <button class="btn btn-sm btn-error">危险</button>
                        <button class="btn btn-sm btn-warning">警告</button>
                        <button class="btn btn-sm btn-success">成功</button>
                        <button class="btn btn-sm" disabled>禁用</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button class="btn btn-xs">xs</button>
                        <button class="btn btn-sm">sm</button>
                        <button class="btn">md</button>
                        <button class="btn btn-lg">lg</button>
                        <button class="btn btn-sm btn-square" aria-label="add"><Icon icon="ri:add-line" class="size-3.5" /></button>
                        <button class="btn btn-sm btn-circle" aria-label="close"><Icon icon="ri:close-line" class="size-3.5" /></button>
                        <button class="btn btn-sm btn-wide">wide</button>
                        <button class="btn btn-sm" disabled>
                            <span class="loading loading-spinner loading-xs" />
                            loading
                        </button>
                    </div>
                    <!-- Combobox：单独 vs 放进 tabs-box（ModEditer 的真实用法） -->
                    <div class="flex flex-wrap items-end gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <div class="flex flex-col gap-1">
                            <span class="text-[10px] text-base-content/45">Combobox（独立）</span>
                            <Combobox v-model="comboValue" class="w-40" placeholder="搜索属性/描述" :options="comboOptions" />
                        </div>
                    </div>
                    <div class="tabs tabs-box bg-transparent">
                        <label class="tab"><input v-model="comboTab" type="radio" name="combo-lab" value="a" aria-label="A" /><span>A</span></label>
                        <label class="tab"><input v-model="comboTab" type="radio" name="combo-lab" value="b" aria-label="B" /><span>B</span></label>
                        <Combobox v-model="comboValue" class="ml-auto mr-4 w-40" placeholder="搜索属性/描述" :options="comboOptions" />
                        <button class="btn btn-sm btn-secondary">收益排序：高→低</button>
                    </div>

                    <!-- 常用场景：工具栏 -->
                    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <div class="flex items-center gap-2">
                            <button class="btn btn-xs btn-primary">保存</button>
                            <button class="btn btn-xs">另存为</button>
                            <button class="btn btn-xs btn-ghost">重置</button>
                        </div>
                        <div class="flex items-center gap-1">
                            <button class="btn btn-xs btn-ghost btn-square" aria-label="undo"><Icon icon="tabler:arrow-bar-to-left" class="size-3.5" /></button>
                            <button class="btn btn-xs btn-ghost btn-square" aria-label="redo"><Icon icon="tabler:arrow-bar-to-right" class="size-3.5" /></button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 徽章 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="BADGE" title="徽章 / 标签" :count="16" />
                <div class="space-y-3">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="badge">普通</span>
                        <span class="badge badge-primary">主要</span>
                        <span class="badge badge-secondary">次要</span>
                        <span class="badge badge-accent">强调</span>
                        <span class="badge badge-neutral">中性</span>
                        <span class="badge badge-info">信息</span>
                        <span class="badge badge-success">成功</span>
                        <span class="badge badge-warning">警告</span>
                        <span class="badge badge-error">错误</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="badge badge-outline">描边</span>
                        <span class="badge badge-outline badge-primary">描边主要</span>
                        <span class="badge badge-ghost">幽灵</span>
                        <span class="badge badge-xs">xs</span>
                        <span class="badge badge-sm">sm</span>
                        <span class="badge badge-lg">lg</span>
                    </div>
                    <!-- 常用场景：标题行右侧的状态徽章 -->
                    <div class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="min-w-0 flex-1 truncate text-sm font-semibold">黎瑟 · 浴火 对单DPS估算</span>
                        <span class="badge badge-success badge-sm gap-1">
                            <Icon icon="radix-icons:check" class="size-3" />
                            已发布
                        </span>
                        <span class="badge badge-warning badge-sm gap-1">
                            <Icon icon="ri:star-fill" class="size-3" />
                            推荐
                        </span>
                        <span class="badge badge-primary badge-sm">置顶</span>
                    </div>
                    <!-- 常用场景：筛选结果计数 -->
                    <div class="flex items-center gap-1.5">
                        <button class="badge badge-primary cursor-pointer">全部 24</button>
                        <button class="badge badge-outline cursor-pointer">DPS 18</button>
                        <button class="badge badge-outline cursor-pointer">辅助 6</button>
                    </div>
                </div>
            </section>

            <!-- 表单控件 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="FORM" title="输入控件" :count="12" />
                <div class="grid gap-4 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">文本输入</span>
                        <input v-model="inputText" class="input" placeholder="请输入名称" />
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">数值输入</span>
                        <input v-model.number="inputNumber" type="number" step="0.1" class="input font-mono tabular-nums" />
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">下拉选择</span>
                        <select v-model="selectValue" class="select">
                            <option value="a">选项 A</option>
                            <option value="b">选项 B</option>
                            <option value="c" disabled>选项 C（禁用）</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">禁用输入</span>
                        <input class="input" disabled value="不可编辑" />
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">带框输入（input-bordered · 纸面小卡）</span>
                        <input class="input input-bordered" placeholder="搜索 MOD / 关键词" />
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">搜索框（参考 GameModStore）</span>
                        <label class="flex w-full items-center gap-1 rounded-xs border border-base-content/10 bg-base-content/5 px-2 py-1.5 text-xs backdrop-blur-xs">
                            <Icon icon="ri:search-line" class="size-4 shrink-0 opacity-50" />
                            <input type="text" placeholder="搜索 MOD" class="min-w-0 grow bg-transparent outline-none" />
                        </label>
                    </label>
                    <label class="flex flex-col gap-1.5 sm:col-span-2">
                        <span class="text-[11px] tracking-wide text-base-content/55">多行文本</span>
                        <textarea v-model="textareaText" class="textarea" rows="2" />
                    </label>
                    <!-- 常用场景：设置行 -->
                    <div class="flex items-center justify-between gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 sm:col-span-2">
                        <div>
                            <p class="text-xs font-medium">显示 ID</p>
                            <p class="text-[11px] text-base-content/45">列表与详情里的实体编号</p>
                        </div>
                        <input v-model="toggleOn" type="checkbox" class="toggle toggle-sm toggle-primary" />
                    </div>
                    <div class="flex flex-wrap items-center gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <label class="flex cursor-pointer items-center gap-1.5 text-xs">
                            <input v-model="checkOn" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />复选框
                        </label>
                        <label class="flex cursor-pointer items-center gap-1.5 text-xs">
                            <input v-model="radioValue" type="radio" value="a" class="radio radio-sm radio-primary" />单选 A
                        </label>
                        <label class="flex cursor-pointer items-center gap-1.5 text-xs">
                            <input v-model="radioValue" type="radio" value="b" class="radio radio-sm radio-primary" />单选 B
                        </label>
                    </div>
                    <div class="space-y-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <div class="flex items-center justify-between text-[11px] text-base-content/55">
                            <span>滑杆</span>
                            <span class="font-orbitron font-semibold text-primary tabular-nums">{{ rangeValue }}</span>
                        </div>
                        <input v-model.number="rangeValue" type="range" max="100" class="range range-xs range-primary" />
                        <div class="flex flex-wrap items-center gap-3 text-[10px] text-base-content/45">
                            <span class="flex items-center gap-1.5">sm<input type="range" max="100" value="35" class="range range-sm range-primary" /></span>
                            <span class="flex items-center gap-1.5">success<input type="range" max="100" value="70" class="range range-xs range-success" /></span>
                            <span class="flex items-center gap-1.5">disabled<input type="range" max="100" value="50" class="range range-xs" disabled /></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <progress class="progress progress-primary" :value="progressValue" max="100" />
                            <span class="font-orbitron text-xs font-semibold text-primary tabular-nums">45%</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 卡片分层 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="LAYER" title="卡片分层" :count="3" />
                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="card"><div class="card-body">
                        <h3 class="card-title text-sm">外层卡</h3>
                        <p class="text-[11px] text-base-content/55">bg-base-100/60 + 细边框 + 毛玻璃</p>
                    </div></div>
                    <div class="card"><div class="card-body">
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <p class="text-[11px] text-base-content/55">内层小卡：bg-base-content/3</p>
                        </div>
                        <div class="mt-2 flex items-center justify-between rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-xs">
                            <span class="text-base-content/55">攻击</span><span class="font-orbitron font-semibold text-primary">1234</span>
                        </div>
                    </div></div>
                    <div class="card card-border"><div class="card-body">
                        <h3 class="card-title text-sm">card-border</h3>
                        <div class="card-actions mt-2 justify-end">
                            <button class="btn btn-xs">取消</button>
                            <button class="btn btn-xs btn-primary">确定</button>
                        </div>
                    </div></div>
                </div>
            </section>

            <!-- 页签与折叠 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="TAB / COLLAPSE" title="页签与折叠" :count="4" />
                <div class="space-y-3">
                    <div class="tabs">
                        <button class="tab" :class="{ 'tab-active': tabValue === 'a' }" @click="tabValue = 'a'">页签 A</button>
                        <button class="tab" :class="{ 'tab-active': tabValue === 'b' }" @click="tabValue = 'b'">页签 B</button>
                        <button class="tab" :class="{ 'tab-active': tabValue === 'c' }" @click="tabValue = 'c'">页签 C</button>
                    </div>
                    <div class="tabs tabs-box w-fit">
                        <button class="tab">box 1</button>
                        <button class="tab tab-active">box 2</button>
                        <button class="tab">box 3</button>
                    </div>
                    <div class="tabs tabs-box tabs-sm w-fit">
                        <button class="tab">sm 级分段</button>
                        <button class="tab tab-active">选中</button>
                    </div>
                    <div class="tabs tabs-border">
                        <button class="tab tab-active">border 1</button>
                        <button class="tab">border 2</button>
                    </div>
                    <div class="tabs tabs-lift">
                        <button class="tab tab-active">lift 1</button>
                        <button class="tab">lift 2</button>
                    </div>
                    <div class="collapse collapse-arrow" :class="{ 'collapse-open': collapseOpen }">
                        <div class="collapse-title text-sm" @click="collapseOpen = !collapseOpen">点击展开 / 收起</div>
                        <div class="collapse-content text-xs text-base-content/60">折叠内容区域，用于面板内嵌的次级信息。</div>
                    </div>
                </div>
            </section>

            <!-- 表格 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="TABLE" title="表格" :count="2" />
                <div class="overflow-x-auto">
                    <table class="table table-sm table-zebra">
                        <thead>
                            <tr><th>属性</th><th class="text-right">数值</th><th>来源</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>攻击</td><td class="text-right font-orbitron text-primary tabular-nums">1234</td><td>角色基础</td></tr>
                            <tr><td>暴击率</td><td class="text-right font-orbitron text-primary tabular-nums">62.5%</td><td>武器 / 词条</td></tr>
                            <tr><td>神智</td><td class="text-right font-orbitron text-primary tabular-nums">100</td><td>角色基础</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- 反馈 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="FEEDBACK" title="提示与状态" :count="10" />
                <div class="space-y-2">
                    <div class="alert alert-info"><span>信息：数据包已是最新版本。</span></div>
                    <div class="alert alert-success"><span>成功：构筑已保存。</span></div>
                    <div class="alert alert-warning"><span>警告：该词条与武器不匹配。</span></div>
                    <div class="alert alert-error"><span>错误：数据包解析失败。</span></div>
                    <div class="flex flex-wrap items-center gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="loading loading-spinner loading-sm" />
                        <span class="loading loading-dots loading-sm" />
                        <span class="loading loading-ring loading-sm" />
                        <span class="status status-success" />
                        <span class="status status-error" />
                        <span class="link link-primary text-xs">链接样式</span>
                        <span class="text-xs text-base-content/45">弱化文本 text-base-content/45</span>
                    </div>
                    <div class="db-skeleton-bar h-3 w-full" />
                    <div class="db-skeleton-bar h-3 w-2/3" />
                </div>
            </section>

            <!-- 浮层 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="OVERLAY" title="浮层与弹窗" :count="5" />
                <div class="flex flex-wrap items-center gap-3">
                    <span class="tooltip tooltip-top" data-tip="这是 tooltip 内容">
                        <button class="btn btn-sm">悬停提示</button>
                    </span>
                    <div class="dropdown" :class="{ 'dropdown-open': dropdownOpen }">
                        <button class="btn btn-sm" @click="dropdownOpen = !dropdownOpen">下拉菜单</button>
                        <ul v-if="dropdownOpen" class="dropdown-content menu z-20 mt-1 w-48 rounded-xs border border-base-content/15 bg-base-100/90 p-1 text-xs shadow-lg backdrop-blur-md">
                            <li><button>重命名</button></li>
                            <li><button>导出 JSON</button></li>
                            <li><button class="text-error">删除</button></li>
                        </ul>
                    </div>
                    <button class="btn btn-sm" @click="dialogOpen = true">打开弹窗</button>
                    <kbd class="kbd kbd-sm">Ctrl</kbd>
                    <kbd class="kbd kbd-sm">K</kbd>
                    <div class="divider divider-horizontal mx-0" />
                    <div class="avatar">
                        <div class="w-8 rounded-xs bg-primary text-primary-content">
                            <span class="text-xs font-semibold">煌</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- db 风格配方 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="RECIPE" title="db 风格配方" :count="6" />
                <div class="space-y-3">
                    <!-- 筛选方章 -->
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button
                            class="btn btn-xs whitespace-nowrap"
                            :class="'btn-primary'"
                        >
                            已选筛选
                        </button>
                        <button
                            class="btn btn-xs whitespace-nowrap"
                        >
                            未选筛选
                        </button>
                    </div>
                    <!-- 下划线搜索框 -->
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute top-1/2 left-0 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            type="text"
                            placeholder="搜索名称 / 拼音 / ID"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pr-12 pl-7 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span class="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 font-mono text-[11px] text-base-content/40 tabular-nums">24</span>
                    </div>
                    <!-- 主从列表项 -->
                    <div class="space-y-2">
                        <article class="group relative cursor-pointer overflow-hidden rounded-xs border border-primary/70 bg-primary/10 backdrop-blur-sm">
                            <span class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary" aria-hidden="true" />
                            <div class="flex items-center gap-3 p-3">
                                <div class="size-9 shrink-0 rounded-xs bg-linear-15 from-purple-900/80 to-purple-100/80" />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-semibold text-primary">选中列表项</p>
                                    <p class="text-[11px] text-base-content/55">主色竖条 + primary/10 底色</p>
                                </div>
                                <CopyID :id="200045" />
                            </div>
                        </article>
                        <article class="group relative cursor-pointer overflow-hidden rounded-xs border border-base-content/15 bg-base-100/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50">
                            <div class="flex items-center gap-3 p-3">
                                <div class="size-9 shrink-0 rounded-xs bg-linear-15 from-gray-900/80 to-gray-100/80" />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-semibold">普通列表项</p>
                                    <p class="text-[11px] text-base-content/55">悬停上浮 + 主色边框</p>
                                </div>
                                <CopyID :id="200046" />
                            </div>
                        </article>
                    </div>
                    <!-- 交接给现有组件 -->
                    <div class="flex flex-wrap items-center gap-2">
                        <CopyID :id="123456" />
                        <CopyID :id="123456" name="角色" />
                        <span class="badge badge-outline">CopyID 已在上方演示</span>
                    </div>
                </div>
            </section>

            <!-- 导航与结构 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="NAV / STRUCTURE" title="导航与结构" :count="6" />
                <div class="space-y-3">
                    <div class="navbar min-h-0 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1">
                        <div class="navbar-start">
                            <button class="btn btn-ghost btn-sm btn-square" aria-label="menu"><Icon icon="ri:menu-line" class="size-4" /></button>
                        </div>
                        <div class="navbar-center text-xs font-semibold">navbar</div>
                        <div class="navbar-end gap-1">
                            <button class="btn btn-ghost btn-sm btn-square" aria-label="user"><Icon icon="ri:user-line" class="size-4" /></button>
                            <button class="btn btn-primary btn-xs">登录</button>
                        </div>
                    </div>
                    <div class="breadcrumbs text-xs">
                        <ul>
                            <li><a>资料库</a></li>
                            <li><a>角色</a></li>
                            <li>详情</li>
                        </ul>
                    </div>
                    <ul class="steps steps-horizontal w-full text-[11px]">
                        <li class="step step-primary">选择数据</li>
                        <li class="step step-primary">配置构筑</li>
                        <li class="step">导出分享</li>
                    </ul>
                    <div class="flex flex-wrap items-start gap-3">
                        <ul class="menu w-44 rounded-xs border border-base-content/10 bg-base-content/3 p-1 text-xs">
                            <li class="menu-title">菜单</li>
                            <li><a class="active">角色</a></li>
                            <li><a>武器</a></li>
                            <li><a>魔之楔</a></li>
                        </ul>
                        <div class="drawer drawer-open h-40 w-44 overflow-hidden rounded-xs border border-base-content/10">
                            <input type="checkbox" class="drawer-toggle" checked />
                            <div class="drawer-side">
                                <ul class="menu w-40 bg-base-100/70 p-1 text-xs">
                                    <li><a>抽屉项 A</a></li>
                                    <li><a>抽屉项 B</a></li>
                                </ul>
                            </div>
                        </div>
                        <div class="join">
                            <button class="btn join-item btn-sm">日</button>
                            <button class="btn join-item btn-sm btn-active">周</button>
                            <button class="btn join-item btn-sm">月</button>
                        </div>
                    </div>
                    <footer class="footer footer-horizontal rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-2 text-[11px] text-base-content/55 sm:footer-horizontal">
                        <nav>
                            <h6 class="footer-title text-[10px] opacity-60">资源</h6>
                            <a class="link link-hover">关于</a>
                            <a class="link link-hover">更新日志</a>
                        </nav>
                        <nav>
                            <h6 class="footer-title text-[10px] opacity-60">社区</h6>
                            <a class="link link-hover">GitHub</a>
                        </nav>
                        <aside><p>dob-ui footer</p></aside>
                    </footer>
                </div>
            </section>

            <!-- 数据展示 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="DATA" title="数据展示" :count="7" />
                <div class="space-y-3">
                    <div class="stats stats-horizontal w-full rounded-xs border border-base-content/10 bg-base-content/3">
                        <div class="stat">
                            <div class="stat-title text-[11px]">角色</div>
                            <div class="stat-value font-orbitron text-lg text-primary">24</div>
                            <div class="stat-desc text-[10px]">全部属性</div>
                        </div>
                        <div class="stat">
                            <div class="stat-title text-[11px]">武器</div>
                            <div class="stat-value font-orbitron text-lg text-primary">96</div>
                            <div class="stat-desc text-[10px]">含限定</div>
                        </div>
                        <div class="stat">
                            <div class="stat-title text-[11px]">魔之楔</div>
                            <div class="stat-value font-orbitron text-lg text-primary">312</div>
                            <div class="stat-desc text-[10px]">已收录</div>
                        </div>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <ul class="timeline timeline-vertical timeline-compact">
                            <li>
                                <div class="timeline-start text-[10px] text-base-content/45">v1.4</div>
                                <div class="timeline-middle status status-primary" />
                                <div class="timeline-end ml-2 text-xs">新增角色数据</div>
                                <hr class="bg-base-content/15" />
                            </li>
                            <li>
                                <div class="timeline-start text-[10px] text-base-content/45">v1.3</div>
                                <div class="timeline-middle status status-primary" />
                                <div class="timeline-end ml-2 text-xs">伤害计算重构</div>
                            </li>
                        </ul>
                        <div class="space-y-1">
                            <div class="chat chat-start">
                                <div class="chat-bubble chat-bubble-primary text-xs">这条构筑已经保存。</div>
                            </div>
                            <div class="chat chat-end">
                                <div class="chat-bubble text-xs">收到，我导出一下。</div>
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="carousel w-56 rounded-xs border border-base-content/10">
                            <div class="carousel-item w-28 items-center justify-center bg-base-content/5 p-3 text-xs">slide 1</div>
                            <div class="carousel-item w-28 items-center justify-center bg-base-content/10 p-3 text-xs">slide 2</div>
                            <div class="carousel-item w-28 items-center justify-center bg-base-content/5 p-3 text-xs">slide 3</div>
                        </div>
                        <div class="indicator">
                            <span class="indicator-item badge badge-primary badge-xs">新</span>
                            <div class="grid size-9 place-items-center rounded-xs bg-base-content/10 text-xs">icon</div>
                        </div>
                        <div class="avatar-group -space-x-2">
                            <div class="avatar border-2 border-base-100">
                                <div class="w-8 rounded-xs bg-primary text-primary-content"><span class="text-xs">A</span></div>
                            </div>
                            <div class="avatar border-2 border-base-100">
                                <div class="w-8 rounded-xs bg-secondary text-secondary-content"><span class="text-xs">B</span></div>
                            </div>
                        </div>
                        <div class="stack h-14 w-24">
                            <div class="grid place-items-center rounded-xs border border-base-content/10 bg-base-content/5 text-xs">1</div>
                            <div class="grid place-items-center rounded-xs border border-base-content/10 bg-base-content/10 text-xs">2</div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 其他组件 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="MISC" title="其他组件" :count="12" />
                <div class="grid gap-3 sm:grid-cols-2">
                    <div class="flex flex-wrap items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">swap</span>
                        <label class="swap swap-rotate">
                            <input type="checkbox" />
                            <span class="swap-on text-xs">ON</span>
                            <span class="swap-off text-xs">OFF</span>
                        </label>
                        <span class="text-[11px] text-base-content/55">radial</span>
                        <div class="radial-progress text-primary" style="--value: 70; --size: 2.5rem; --thickness: 3px" role="progressbar">70%</div>
                        <span class="text-[11px] text-base-content/55">countdown</span>
                        <span class="countdown font-mono text-lg text-primary">
                            <span :style="{ '--value': 42 }">{{ 42 }}</span>
                        </span>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">mask</span>
                        <div class="mask mask-circle size-8 bg-primary" />
                        <div class="mask mask-squircle size-8 bg-secondary" />
                        <span class="text-[11px] text-base-content/55">otp（span 在前、input 在最后）</span>
                        <div class="flex flex-wrap items-center gap-3">
                            <label class="otp otp-xs">
                                <span></span><span></span><span></span><span></span>
                                <input type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" value="1234" />
                            </label>
                            <label class="otp otp-sm">
                                <span></span><span></span><span></span><span></span><span></span><span></span>
                                <input type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" />
                            </label>
                            <label class="otp otp-xs otp-joined">
                                <span></span><span></span><span></span><span></span>
                                <input type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" />
                            </label>
                        </div>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">file-input / fieldset / list</span>
                        <input type="file" class="file-input file-input-sm w-full" />
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend text-xs">fieldset</legend>
                            <input class="input input-sm" placeholder="字段" />
                            <p class="label text-[10px]">说明文字</p>
                        </fieldset>
                        <ul class="list rounded-xs border border-base-content/10">
                            <li class="list-row text-xs">
                                <div class="list-col-grow">列表行</div>
                                <div class="badge badge-sm">12</div>
                            </li>
                        </ul>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">skeleton / status / link / kbd</span>
                        <div class="skeleton h-3 w-full" />
                        <div class="skeleton h-3 w-2/3" />
                        <div class="flex items-center gap-2 text-xs">
                            <span class="status status-success" />在线
                            <span class="status status-warning" />忙碌
                            <a class="link link-hover">链接</a>
                            <kbd class="kbd kbd-xs">Esc</kbd>
                        </div>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 sm:col-span-2">
                        <span class="text-[11px] text-base-content/55">alert 变体 / validation</span>
                        <div class="alert alert-outline alert-info"><span>outline 提示条</span></div>
                        <div class="alert alert-soft alert-warning"><span>soft 提示条</span></div>
                        <label class="flex flex-col gap-1">
                            <input class="input validator" placeholder="请输入 URL" type="url" required />
                            <span class="text-[10px] text-error">validator 错误提示</span>
                        </label>
                    </div>
                </div>
            </section>

            <!-- 冷门 / 装饰 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="EXPERIMENTAL" title="冷门 / 装饰组件" :count="10" />
                <div class="grid gap-3 sm:grid-cols-2">
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">rating</span>
                        <div class="rating rating-sm">
                            <input type="radio" name="lab-rating" class="mask mask-star-2 bg-warning" aria-label="1" />
                            <input type="radio" name="lab-rating" class="mask mask-star-2 bg-warning" aria-label="2" checked />
                            <input type="radio" name="lab-rating" class="mask mask-star-2 bg-warning" aria-label="3" />
                            <input type="radio" name="lab-rating" class="mask mask-star-2 bg-warning" aria-label="4" />
                            <input type="radio" name="lab-rating" class="mask mask-star-2 bg-warning" aria-label="5" />
                        </div>
                        <span class="text-[11px] text-base-content/55">fab（悬浮操作按钮）</span>
                        <div class="relative h-16 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5">
                            <div class="fab" style="position: absolute">
                                <button class="btn btn-sm btn-primary" aria-label="add"><Icon icon="ri:add-line" class="size-4" /></button>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">diff</span>
                        <div class="diff aspect-video overflow-hidden rounded-xs">
                            <div class="diff-item-1">
                                <div class="grid h-full place-items-center bg-primary text-xs text-primary-content">改动前</div>
                            </div>
                            <div class="diff-item-2">
                                <div class="grid h-full place-items-center bg-base-300 text-xs">改动后</div>
                            </div>
                            <div class="diff-resizer" />
                        </div>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">hero / mockup-window</span>
                        <div class="hero rounded-xs border border-base-content/10 bg-base-content/5">
                            <div class="hero-content p-4 text-center">
                                <div>
                                    <p class="text-xs font-semibold">hero 标题</p>
                                    <p class="text-[10px] text-base-content/50">副标题说明</p>
                                </div>
                            </div>
                        </div>
                        <div class="mockup-window border border-base-content/10 bg-base-100">
                            <div class="grid place-items-center border-t border-base-content/10 bg-base-content/5 px-4 py-5 text-xs">内容</div>
                        </div>
                    </div>
                    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/55">aura / hover-3d / theme-controller</span>
                        <div class="flex flex-wrap items-center gap-3">
                            <span class="aura text-primary"><button class="btn btn-sm">aura</button></span>
                            <span class="aura aura-glow text-secondary"><button class="btn btn-xs">glow</button></span>
                            <span class="aura aura-holo aura-sm"><button class="btn btn-xs">holo</button></span>
                            <div class="hover-3d">
                                <div class="grid size-16 place-items-center rounded-xs border border-base-content/10 bg-base-content/5 text-[10px]">hover-3d</div>
                            </div>
                            <label class="flex items-center gap-1 text-[11px]">
                                <input type="radio" name="lab-theme" class="theme-controller radio radio-xs" value="ez" disabled />theme
                            </label>
                        </div>
                        <span class="text-[11px] text-base-content/55">toast（静态展示）</span>
                        <div class="toast" style="position: static">
                            <div class="alert alert-success text-xs"><span>toast 通知</span></div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <!-- 弹窗 -->
        <div v-if="dialogOpen" class="modal modal-open" @click.self="dialogOpen = false">
            <div class="modal-box">
                <h3 class="text-base font-semibold">编辑构筑</h3>
                <div class="mt-3 space-y-3">
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">名称</span>
                        <input v-model="formName" class="input" />
                    </label>
                    <label class="flex flex-col gap-1.5">
                        <span class="text-[11px] tracking-wide text-base-content/55">等级</span>
                        <input v-model.number="formLevel" type="number" class="input font-mono tabular-nums" />
                    </label>
                    <div class="flex items-center justify-between rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-xs">推荐构筑</span>
                        <input type="checkbox" class="toggle toggle-sm toggle-primary" checked />
                    </div>
                </div>
                <div class="modal-action">
                    <button class="btn btn-sm" @click="dialogOpen = false">取消</button>
                    <button class="btn btn-sm btn-primary" @click="dialogOpen = false">保存</button>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>

