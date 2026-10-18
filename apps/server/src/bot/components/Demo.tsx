/**
 * 首页组件
 */
export default function Demo({
    data,
}: {
    /**
     * 页面数据
     */
    data?: Record<string, any>
}) {
    return (
        <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">欢迎使用 DNA Builder</h2>
            <p className="text-lg text-gray-600 mb-8">这是一个基于 React SSR 的页面渲染示例</p>

            {data && (
                <div className="mt-8 text-left mb-10">
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">页面数据：</h3>
                    <pre className="bg-gray-100 p-4 rounded-md text-sm leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
                </div>
            )}

            <div className="mt-10 flex justify-center gap-6">
                <div className="p-6 bg-blue-50 rounded-lg flex-1 max-w-xs">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">功能 1</h4>
                    <p className="text-gray-600">支持动态布局切换</p>
                </div>
                <div className="p-6 bg-green-50 rounded-lg flex-1 max-w-xs">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">功能 2</h4>
                    <p className="text-gray-600">支持动态页面加载</p>
                </div>
                <div className="p-6 bg-yellow-50 rounded-lg flex-1 max-w-xs">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">功能 3</h4>
                    <p className="text-gray-600">支持数据驱动渲染</p>
                </div>
            </div>
        </div>
    )
}
