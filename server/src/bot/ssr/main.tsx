import { hydrateRoot } from "react-dom/client"

// 导入默认布局和页面
import { DefaultLayout } from "./layout/DefaultLayout"
import { HomePage } from "./pages/HomePage"

/**
 * 动态加载布局组件
 * @param layoutName 布局名称
 * @returns 布局组件
 */
function getLayoutComponent(layoutName: string) {
    // 根据布局名称返回对应的布局组件
    switch (layoutName.toLowerCase()) {
        case "default":
            return DefaultLayout
        // 可以在这里添加更多布局组件
        default:
            return DefaultLayout
    }
}

/**
 * 动态加载页面组件
 * @param pageName 页面名称
 * @returns 页面组件
 */
function getPageComponent(pageName: string) {
    // 根据页面名称返回对应的页面组件
    switch (pageName.toLowerCase()) {
        case "home":
            return HomePage
        // 可以在这里添加更多页面组件
        default:
            return HomePage
    }
}

/**
 * 客户端 hydration
 * 将服务端渲染的 HTML 与客户端 React 实例绑定
 */
function hydrate() {
    // 获取服务端传递的数据
    const ssrData = (window as any).__SSR_DATA__ || {}

    const { layout: layoutName = "default", page: pageName = "home", title = "DNA Builder", ...data } = ssrData

    // 获取根元素
    const rootElement = document.getElementById("app")

    if (!rootElement) {
        console.error("根元素 #app 不存在")
        return
    }

    // 获取布局组件和页面组件
    const LayoutComponent = getLayoutComponent(layoutName)
    const PageComponent = getPageComponent(pageName)

    // 执行 hydration
    hydrateRoot(
        rootElement,
        <LayoutComponent title={title} data={data}>
            <PageComponent data={data} />
        </LayoutComponent>
    )
}

// 当 DOM 加载完成后执行 hydration
document.addEventListener("DOMContentLoaded", hydrate)
