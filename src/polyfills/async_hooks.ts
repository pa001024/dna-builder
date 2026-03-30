/**
 * 浏览器环境下的 AsyncLocalStorage 轻量兼容实现
 * 说明：
 * - 仅用于满足 LangChain 在前端运行时对 node:async_hooks 的依赖
 * - 不提供 Node.js 级别的异步上下文传播能力
 */
export class AsyncLocalStorage<T = unknown> {
    private store: T | undefined

    /**
     * 获取当前上下文
     * @returns 当前store
     */
    public getStore(): T | undefined {
        return this.store
    }

    /**
     * 在指定上下文中执行回调
     * @param store 临时上下文
     * @param callback 回调函数
     * @returns 回调结果
     */
    public run<R>(store: T, callback: () => R): R {
        const previous = this.store
        this.store = store
        try {
            return callback()
        } finally {
            this.store = previous
        }
    }

    /**
     * 进入上下文
     * @param store 上下文
     */
    public enterWith(store: T): void {
        this.store = store
    }
}
