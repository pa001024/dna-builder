import type React from "react"
import type { ReactNode } from "react"

interface DefaultLayoutProps {
    /**
     * 页面内容
     */
    children: ReactNode
    /**
     * 页面标题
     */
    title?: string
    /**
     * 布局数据
     */
    data?: Record<string, any>
}

/**
 * 默认布局组件
 */
export const DefaultLayout: React.FC<DefaultLayoutProps> = ({ children, title = "DNA Builder", data }) => {
    return (
        <div className="min-h-screen bg-gray-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
            <div className="container mx-auto max-w-4xl">
                <header className="text-center mb-10 pb-6 border-b border-gray-200">
                    <h1 className="text-3xl font-bold text-gray-800 mb-3">{title}</h1>
                    {data?.subtitle && <p className="text-lg text-gray-600">{data.subtitle}</p>}
                </header>

                <main className="bg-white rounded-lg shadow-md p-8 mb-10">{children}</main>

                <footer className="text-center mt-10 pt-6 border-t border-gray-200 text-sm text-gray-500">
                    <p>© {new Date().getFullYear()} DNA Builder</p>
                </footer>
            </div>
        </div>
    )
}
