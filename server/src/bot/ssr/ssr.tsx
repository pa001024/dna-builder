import { renderToString } from "react-dom/server"

// 导入默认布局和页面
import { DefaultLayout } from "./layout/DefaultLayout"
import { HomePage } from "./pages/HomePage"

export interface SSRProps {
    /**
     * 渲染数据
     */
    data?: Record<string, any>
    /**
     * 布局名称，默认为 'default'
     */
    layout?: string
    /**
     * 页面名称，默认为 'home'
     */
    page?: string
    /**
     * 页面标题
     */
    title?: string
}

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
 * 服务端渲染 React 组件
 * @param props 渲染属性
 * @returns 渲染后的 HTML 字符串
 */
export function renderReactToString(props: SSRProps): string {
    const { data, layout: layoutName = "default", page: pageName = "home", title = "DNA Builder" } = props

    // 获取布局组件和页面组件
    const LayoutComponent = getLayoutComponent(layoutName)
    const PageComponent = getPageComponent(pageName)

    // 渲染 React 组件为 HTML 字符串
    const appHtml = renderToString(
        <LayoutComponent title={title} data={data}>
            <PageComponent data={data} />
        </LayoutComponent>
    )

    // 生成完整的 HTML 页面
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <meta name="referrer" content="no-referrer" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <title>${title}</title>
        <link rel="stylesheet" href="http://localhost:8887/api/css" />
    </head>
    <body>
        <div id="app">${appHtml}</div>
        <script>
            // 客户端 hydration 数据
            window.__SSR_DATA__ = ${JSON.stringify({
                ...(data || {}),
                layout: layoutName,
                page: pageName,
                title,
            })}
        </script>
    </body>
</html>
    `.trim()

    return html
}
